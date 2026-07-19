import { createHash } from "node:crypto";

import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { RepositoryTransaction } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { OPERATIONAL_EVENT_SEMANTICS } from "./operational-event.js";
import type { OperationsRuntimeControl, OperationsRuntimeHealthReport } from "./operations-runtime.js";
import { OperationsRuntimeControlValidator } from "./operations-runtime-validator.js";

const DEFAULT_EVENT_RETENTION = 10_000;
const DEFAULT_HEALTH_LEASE_LIMIT = 100;

export class OperationsRuntimeControlService {
  readonly #validator = new OperationsRuntimeControlValidator();

  public constructor(private readonly input: {
    readonly clock: Clock;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) {}

  public get(): Promise<OperationsRuntimeControl> {
    return this.input.repositories.transaction(async ({ operationsRuntime }) => (await operationsRuntime.getControl(this.input.workspaceId)) ?? defaultControl(this.input.workspaceId, this.input.clock.now().toISOString()));
  }

  public async update(candidate: Readonly<{
    readonly expectedVersion: number;
    readonly killSwitch: OperationsRuntimeControl["killSwitch"];
    readonly maintenanceMode: OperationsRuntimeControl["maintenanceMode"];
    readonly reasonCode: string;
    readonly updatedBy: string;
  }>): Promise<OperationsRuntimeControl> {
    if (!Number.isSafeInteger(candidate.expectedVersion) || candidate.expectedVersion < 0) throw new RepositoryValidationError("Operations control expected version is invalid");
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const existing = await operationsRuntime.getControl(this.input.workspaceId);
      const current = existing ?? defaultControl(this.input.workspaceId, now);
      if (current.version !== candidate.expectedVersion) throw new RepositoryConflictError("Operations runtime control changed before update");
      const checked = this.#validate({ contractVersion: "1", killSwitch: candidate.killSwitch, maintenanceMode: candidate.maintenanceMode, reasonCode: candidate.reasonCode, updatedAt: now, updatedBy: candidate.updatedBy, version: current.version + 1, workspaceId: this.input.workspaceId });
      await operationsRuntime.updateControl(checked, { version: current.version });
      if (current.killSwitch !== checked.killSwitch || current.maintenanceMode !== checked.maintenanceMode) {
        const semantics = OPERATIONAL_EVENT_SEMANTICS.KILL_SWITCH_CHANGED;
        await operationalEvents.append({ aggregateType: semantics.aggregateType, contractVersion: "1", entityId: this.input.workspaceId, entityVersion: checked.version, eventId: `evt-${digest(`KILL_SWITCH_CHANGED\n${this.input.workspaceId}\n${String(checked.version)}`).slice(0, 48)}`, eventType: "KILL_SWITCH_CHANGED", occurredAt: now, safeSummaryCode: semantics.safeSummaryCode, workspaceId: this.input.workspaceId });
      }
      return checked;
    });
  }

  public async health(): Promise<OperationsRuntimeHealthReport> {
    const now = this.input.clock.now();
    return this.input.repositories.transaction((repositories) => this.#health(repositories, now));
  }

  /** Emits one redaction-safe event only when the durable health state changes. */
  public async monitorHealth(): Promise<OperationsRuntimeHealthReport> {
    const now = this.input.clock.now();
    return this.input.repositories.transaction(async (repositories) => {
      const report = await this.#health(repositories, now);
      const previous = await repositories.operationalEvents.getLatestByType(this.input.workspaceId, "HEALTH_STATE_CHANGED");
      const entityId = healthEntityId(report.status);
      if (previous?.entityId !== entityId) {
        const semantics = OPERATIONAL_EVENT_SEMANTICS.HEALTH_STATE_CHANGED;
        const entityVersion = (previous?.entityVersion ?? 0) + 1;
        await repositories.operationalEvents.append({
          aggregateType: semantics.aggregateType,
          contractVersion: "1",
          entityId,
          entityVersion,
          eventId: `evt-${digest(`HEALTH_STATE_CHANGED\n${this.input.workspaceId}\n${String(entityVersion)}\n${report.status}`).slice(0, 48)}`,
          eventType: "HEALTH_STATE_CHANGED",
          occurredAt: now.toISOString(),
          safeSummaryCode: semantics.safeSummaryCode,
          workspaceId: this.input.workspaceId,
        });
      }
      return report;
    });
  }

  /** Bounded cleanup; active jobs and the newest event cursor window are retained. */
  public async enforceRetention(input: Readonly<{ readonly terminalBefore: string; readonly jobLimit?: number; readonly retainNewestEvents?: number }>): Promise<Readonly<{ readonly jobsDeleted: number; readonly eventsDeleted: number }>> {
    const jobLimit = bounded(input.jobLimit ?? 100, 1, 1_000, "Operations retention job limit");
    const retainNewestEvents = bounded(input.retainNewestEvents ?? DEFAULT_EVENT_RETENTION, 100, 1_000_000, "Operations event retention window");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.terminalBefore) || !Number.isFinite(Date.parse(input.terminalBefore))) throw new RepositoryValidationError("Operations retention timestamp is invalid");
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const terminal = await operationsRuntime.listTerminalBefore(this.input.workspaceId, input.terminalBefore, jobLimit);
      for (const job of terminal) await operationsRuntime.deleteTerminalJob(job.jobId, { version: job.version });
      const cursor = await operationalEvents.cursorWindow(this.input.workspaceId);
      const pruneBefore = Math.max(1, cursor.latestSequence - retainNewestEvents + 1);
      const eventsDeleted = cursor.oldestSequence !== undefined && cursor.oldestSequence < pruneBefore
        ? await operationalEvents.pruneBefore(this.input.workspaceId, pruneBefore, jobLimit)
        : 0;
      return Object.freeze({ eventsDeleted, jobsDeleted: terminal.length });
    });
  }

  #validate(value: unknown): OperationsRuntimeControl {
    const checked = this.#validator.validate(value);
    if (!checked.ok) throw new RepositoryValidationError("Operations runtime control is invalid");
    return checked.value;
  }

  async #health(repositories: RepositoryTransaction, now: Date): Promise<OperationsRuntimeHealthReport> {
    const control = (await repositories.operationsRuntime.getControl(this.input.workspaceId)) ?? defaultControl(this.input.workspaceId, now.toISOString());
    const counts = await repositories.operationsRuntime.summarize(this.input.workspaceId);
    const schedulerLeases = await repositories.operationsRuntime.listProcessLeases(this.input.workspaceId, "SCHEDULER", DEFAULT_HEALTH_LEASE_LIMIT);
    const workerLeases = await repositories.operationsRuntime.listProcessLeases(this.input.workspaceId, "WORKER", DEFAULT_HEALTH_LEASE_LIMIT);
    const schedulerLease = schedulerLeases.find((lease) => lease.leaseKey === "scheduler");
    const scheduler = schedulerLease === undefined ? "MISSING" : Date.parse(schedulerLease.expiresAt) <= now.getTime() ? "STALE" : "READY";
    const active = workerLeases.filter((lease) => Date.parse(lease.expiresAt) > now.getTime()).length;
    const stale = workerLeases.length - active;
    const stopped = control.killSwitch === "ACTIVE" || control.maintenanceMode === "ENABLED";
    const attention = scheduler !== "READY" || active === 0 || counts.blocked > 0 || counts.deadLetter > 0 || counts.failed > 0;
    return Object.freeze({ contractVersion: "1", control: Object.freeze({ killSwitch: control.killSwitch, maintenanceMode: control.maintenanceMode }), counts, generatedAt: now.toISOString(), scheduler, status: stopped ? "STOPPED" : attention ? "ATTENTION_REQUIRED" : "READY", unauthorizedExternalEffectOccurred: false, workers: Object.freeze({ active, stale }) });
  }
}

function defaultControl(workspaceId: string, updatedAt: string): OperationsRuntimeControl {
  return Object.freeze({ contractVersion: "1", killSwitch: "RELEASED", maintenanceMode: "DISABLED", reasonCode: "INITIAL_STATE", updatedAt, updatedBy: "system", version: 0, workspaceId });
}

function healthEntityId(status: OperationsRuntimeHealthReport["status"]): string {
  return status === "READY" ? "health-ready" : status === "STOPPED" ? "health-stopped" : "health-attention-required";
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RepositoryValidationError(`${label} is invalid`); return value; }
