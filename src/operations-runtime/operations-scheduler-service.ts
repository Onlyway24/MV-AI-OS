import { createHash, randomUUID } from "node:crypto";

import { businessDateAt, nextCalendarDailyOccurrence } from "../contracts/business-calendar.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { OPERATIONAL_EVENT_SEMANTICS, type OperationalEventType } from "./operational-event.js";
import type { OperationsJob, OperationsJobPayload, OperationsProcessLease, OperationsSchedule, OperationsSchedulerTickResult } from "./operations-runtime.js";
import { createOperationsPayloadFingerprint, OperationsScheduleValidator } from "./operations-runtime-validator.js";

const DEFAULT_BATCH_LIMIT = 25;
const DEFAULT_SCHEDULER_LEASE_MS = 30_000;

export class OperationsSchedulerService {
  readonly #scheduleValidator = new OperationsScheduleValidator();
  readonly #batchLimit: number;
  readonly #leaseMs: number;

  public constructor(private readonly input: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly instanceId: string;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
    readonly batchLimit?: number;
    readonly schedulerLeaseMs?: number;
  }) {
    this.#batchLimit = bounded(input.batchLimit ?? DEFAULT_BATCH_LIMIT, 1, 100, "Scheduler batch limit");
    this.#leaseMs = bounded(input.schedulerLeaseMs ?? DEFAULT_SCHEDULER_LEASE_MS, 1_000, 300_000, "Scheduler lease duration");
  }

  public async registerSchedule(candidate: OperationsSchedule): Promise<OperationsSchedule> {
    const checked = validate(candidate, this.#scheduleValidator, "Operations schedule");
    if (checked.workspaceId !== this.input.workspaceId || checked.actorId !== this.input.actorId) throw new RepositoryConflictError("Operations schedule identity is unauthorized");
    return this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const existing = await operationsRuntime.getScheduleById(checked.scheduleId);
      if (existing !== undefined) {
        if (!sameScheduleDefinition(existing, checked)) throw new RepositoryConflictError("Operations schedule identity conflicts with durable state");
        return existing;
      }
      await operationsRuntime.insertSchedule(checked);
      return checked;
    });
  }

  public async tick(): Promise<OperationsSchedulerTickResult> {
    const schedulerLease = await this.#acquireLease();
    if (schedulerLease === undefined) return result({ enqueuedJobIds: [], skippedOccurrences: 0, status: "LEASE_HELD" });
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const durableLease = await operationsRuntime.getProcessLease(this.input.workspaceId, "scheduler");
      if (durableLease?.instanceId !== schedulerLease.instanceId || durableLease.fencingToken !== schedulerLease.fencingToken || Date.parse(durableLease.expiresAt) <= Date.parse(now)) return result({ enqueuedJobIds: [], skippedOccurrences: 0, status: "LEASE_HELD" });
      const control = await operationsRuntime.getControl(this.input.workspaceId);
      if (control?.killSwitch === "ACTIVE" || control?.maintenanceMode === "ENABLED") return result({ enqueuedJobIds: [], skippedOccurrences: 0, status: "STOPPED" });
      const due = await operationsRuntime.listDueSchedules(this.input.workspaceId, now, this.#batchLimit);
      const enqueuedJobIds: string[] = [];
      let skippedOccurrences = 0;
      for (const schedule of due) {
        const materialization = nextOccurrence(schedule, now);
        if (materialization.enqueue) {
          const operationIdentity = operationId(schedule.scheduleId, schedule.nextRunAt);
          const existing = await operationsRuntime.getJobByOperationIdentity(this.input.workspaceId, operationIdentity);
          if (existing === undefined) {
            const job = jobFromSchedule(schedule, operationIdentity, materialization.payload, now);
            await operationsRuntime.insertJob(job);
            await operationalEvents.append(event("JOB_QUEUED", job.jobId, job.version, job.workspaceId, now));
            enqueuedJobIds.push(job.jobId);
          } else if (existing.scheduleId !== schedule.scheduleId || existing.scheduledFor !== schedule.nextRunAt || existing.payloadFingerprint !== createOperationsPayloadFingerprint(materialization.payload)) {
            throw new RepositoryConflictError("Scheduled Operations occurrence conflicts with durable job state");
          }
        } else skippedOccurrences += 1;
        await operationsRuntime.updateSchedule(materialization.next, { version: schedule.version });
      }
      return result({ enqueuedJobIds, skippedOccurrences, status: enqueuedJobIds.length > 0 ? "SCHEDULED" : "IDLE" });
    });
  }

  public async heartbeat(): Promise<OperationsProcessLease> {
    const lease = await this.#acquireLease();
    if (lease === undefined) throw new RepositoryConflictError("Operations scheduler lease is held by another instance");
    return lease;
  }

  public async close(): Promise<void> {
    await this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const current = await operationsRuntime.getProcessLease(this.input.workspaceId, "scheduler");
      if (current?.instanceId !== this.input.instanceId) return;
      await operationsRuntime.deleteProcessLease({ fencingToken: current.fencingToken, instanceId: current.instanceId, leaseKey: current.leaseKey, version: current.version, workspaceId: current.workspaceId });
    });
  }

  async #acquireLease(): Promise<OperationsProcessLease | undefined> {
    const now = this.input.clock.now();
    const heartbeatAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.#leaseMs).toISOString();
    return this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const current = await operationsRuntime.getProcessLease(this.input.workspaceId, "scheduler");
      if (current === undefined) {
        const created: OperationsProcessLease = { contractVersion: "1", expiresAt, fencingToken: 1, heartbeatAt, instanceId: this.input.instanceId, leaseKey: "scheduler", role: "SCHEDULER", version: 0, workspaceId: this.input.workspaceId };
        await operationsRuntime.insertProcessLease(created);
        return created;
      }
      const owned = current.instanceId === this.input.instanceId;
      const expired = Date.parse(current.expiresAt) <= now.getTime();
      if (!owned && !expired) return undefined;
      const next: OperationsProcessLease = { ...current, expiresAt, fencingToken: owned ? current.fencingToken : current.fencingToken + 1, heartbeatAt, instanceId: this.input.instanceId, version: current.version + 1 };
      await operationsRuntime.updateProcessLease(next, { version: current.version });
      return next;
    });
  }
}

function nextOccurrence(schedule: OperationsSchedule, now: string): { readonly enqueue: boolean; readonly next: OperationsSchedule; readonly payload: OperationsJobPayload } {
  const current = Date.parse(schedule.nextRunAt);
  const nowMs = Date.parse(now);
  const payload = materializePayload(schedule, schedule.nextRunAt);
  if (schedule.cadence.kind === "ONCE") return { enqueue: true, next: { ...schedule, status: "DISABLED", updatedAt: now, version: schedule.version + 1 }, payload };
  if (schedule.cadence.kind === "CALENDAR_DAILY") {
    const firstFollowingOccurrence = nextCalendarDailyOccurrence(schedule.nextRunAt, schedule.nextRunAt, schedule.cadence, schedule.cadence.timeZone);
    const missed = nowMs >= Date.parse(firstFollowingOccurrence);
    const enqueue = schedule.catchUpPolicy === "CATCH_UP_ONE" || !missed;
    const nextRunAt = nextCalendarDailyOccurrence(schedule.nextRunAt, now, schedule.cadence, schedule.cadence.timeZone);
    return { enqueue, next: { ...schedule, nextRunAt, updatedAt: now, version: schedule.version + 1 }, payload };
  }
  const interval = schedule.cadence.intervalMs;
  const missed = nowMs - current >= interval;
  const enqueue = schedule.catchUpPolicy === "CATCH_UP_ONE" || !missed;
  const elapsed = Math.max(1, Math.floor((nowMs - current) / interval) + 1);
  const nextRunAt = new Date(current + elapsed * interval).toISOString();
  return { enqueue, next: { ...schedule, nextRunAt, updatedAt: now, version: schedule.version + 1 }, payload };
}

function materializePayload(schedule: OperationsSchedule, scheduledFor: string): OperationsJobPayload {
  const businessDate = businessDateAt(scheduledFor);
  if (schedule.jobType === "MORNING_SYSTEM_BRIEF" || schedule.jobType === "DAILY_OPERATING_REPORT") return Object.freeze({ businessDate });
  if (schedule.jobType === "AGENT_COMPANY_WORKDAY_START") {
    const configured = schedule.payload as Extract<OperationsJobPayload, { readonly budgetCents: number }>;
    return Object.freeze({ budgetCents: configured.budgetCents, ...(configured.workday === undefined ? {} : { workday: configured.workday }), workdayId: `founder-workday-${businessDate}` });
  }
  return schedule.payload;
}

function jobFromSchedule(schedule: OperationsSchedule, operationIdentity: string, payload: OperationsJobPayload, now: string): OperationsJob {
  const fingerprint = createOperationsPayloadFingerprint(payload);
  return Object.freeze({ actorId: schedule.actorId, attempt: 0, budget: schedule.budget, contractVersion: "1", createdAt: now, heartbeatIntervalMs: schedule.heartbeatIntervalMs, jobId: `ops-${digest(operationIdentity).slice(0, 40)}`, jobType: schedule.jobType, leaseDurationMs: schedule.leaseDurationMs, operationIdentity, owner: schedule.owner, payload, payloadFingerprint: fingerprint, priority: schedule.priority, recoveryStrategy: "RETRY_OR_DEAD_LETTER", retryPolicy: schedule.retryPolicy, runAfter: schedule.nextRunAt, scheduleId: schedule.scheduleId, scheduledFor: schedule.nextRunAt, status: "QUEUED", timeoutMs: schedule.timeoutMs, updatedAt: now, version: 0, workspaceId: schedule.workspaceId });
}

function operationId(scheduleId: string, scheduledFor: string): string { return `occ-${digest(`${scheduleId}\n${scheduledFor}`).slice(0, 48)}`; }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function sameScheduleDefinition(left: OperationsSchedule, right: OperationsSchedule): boolean { const materializedPayload = ["DAILY_OPERATING_REPORT", "MORNING_SYSTEM_BRIEF", "PORTFOLIO_DAILY_BRIEF", "PORTFOLIO_WEEKLY_REVIEW"].includes(left.jobType); const sameAgentCompanyInput = left.jobType === "AGENT_COMPANY_WORKDAY_START" && right.jobType === "AGENT_COMPANY_WORKDAY_START" && JSON.stringify((left.payload as { readonly budgetCents: number; readonly workday?: unknown }).workday) === JSON.stringify((right.payload as { readonly budgetCents: number; readonly workday?: unknown }).workday) && (left.payload as { readonly budgetCents: number }).budgetCents === (right.payload as { readonly budgetCents: number }).budgetCents; return left.actorId === right.actorId && left.workspaceId === right.workspaceId && left.scheduleId === right.scheduleId && left.jobType === right.jobType && left.owner === right.owner && (materializedPayload || sameAgentCompanyInput || (left.payloadFingerprint === right.payloadFingerprint && JSON.stringify(left.payload) === JSON.stringify(right.payload))) && left.catchUpPolicy === right.catchUpPolicy && left.priority === right.priority && left.timeoutMs === right.timeoutMs && left.leaseDurationMs === right.leaseDurationMs && left.heartbeatIntervalMs === right.heartbeatIntervalMs && JSON.stringify(left.budget) === JSON.stringify(right.budget) && JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy) && JSON.stringify(left.cadence) === JSON.stringify(right.cadence); }
function event(eventType: OperationalEventType, entityId: string, entityVersion: number, workspaceId: string, occurredAt: string) { const semantics = OPERATIONAL_EVENT_SEMANTICS[eventType]; return { aggregateType: semantics.aggregateType, contractVersion: "1" as const, entityId, entityVersion, eventId: `evt-${digest(`${eventType}\n${entityId}\n${String(entityVersion)}`).slice(0, 48)}`, eventType, occurredAt, safeSummaryCode: semantics.safeSummaryCode, workspaceId }; }
function result(value: Omit<OperationsSchedulerTickResult, "contractVersion" | "unauthorizedExternalEffectOccurred">): OperationsSchedulerTickResult { return Object.freeze({ ...value, contractVersion: "1", enqueuedJobIds: Object.freeze([...value.enqueuedJobIds]), unauthorizedExternalEffectOccurred: false }); }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RepositoryValidationError(`${label} is invalid`); return value; }
function validate<T>(value: unknown, validator: { validate(value: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false } }, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} failed validation`); return checked.value; }

export function createOperationsSchedule(input: Omit<OperationsSchedule, "contractVersion" | "createdAt" | "payloadFingerprint" | "updatedAt" | "version">, clock: Clock): OperationsSchedule {
  const now = clock.now().toISOString();
  const schedule: OperationsSchedule = { ...input, contractVersion: "1", createdAt: now, payloadFingerprint: createOperationsPayloadFingerprint(input.payload), updatedAt: now, version: 0 };
  const checked = new OperationsScheduleValidator().validate(schedule);
  if (!checked.ok) throw new RepositoryValidationError("Operations schedule failed validation");
  return checked.value;
}

export function randomOperationsInstanceId(role: "scheduler" | "worker"): string { return `${role}-${randomUUID()}`; }
