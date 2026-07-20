import { createHash } from "node:crypto";

import type { AgentCompanyWorkdayInput } from "../agent-company/operational-agent-company.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { LocalWorkflowCommandBoundary, LocalWorkflowCommandResponse } from "../runtime/local-workflow-command.js";
import { OPERATIONS_JOB_TYPES, type OperationsExecutionResult, type OperationsJob, type OperationsJobBlock, type OperationsJobHandler, type OperationsJobHandlerContext, type OperationsJobHandlerRegistry, type OperationsJobType } from "./operations-runtime.js";

export interface OperationsLocalWorkflowCallbacks {
  generateDailyOperatingReport(input: Readonly<{ readonly businessDate: string; readonly signal: AbortSignal }>): Promise<OperationsLocalWorkflowResult>;
  startAgentCompanyWorkday(input: Readonly<{ readonly budgetCents: number; readonly operationIdentity: string; readonly signal: AbortSignal; readonly workday?: AgentCompanyWorkdayInput; readonly workdayId: string }>): Promise<OperationsLocalWorkflowResult>;
}

export type OperationsLocalWorkflowResult =
  | Readonly<{ readonly resultRef: string; readonly status: "COMPLETED" }>
  | Readonly<{ readonly reasonCode: OperationsJobBlock["code"]; readonly resultRef: string; readonly status: "BLOCKED" }>;

export class ImmutableOperationsJobHandlerRegistry implements OperationsJobHandlerRegistry {
  readonly #handlers: ReadonlyMap<OperationsJobType, OperationsJobHandler>;

  public constructor(entries: readonly Readonly<{ readonly handler: OperationsJobHandler; readonly jobType: OperationsJobType }>[]) {
    const handlers = new Map<OperationsJobType, OperationsJobHandler>();
    for (const entry of entries) {
      if (handlers.has(entry.jobType)) throw new RepositoryValidationError("Operations handler registration is duplicated");
      handlers.set(entry.jobType, entry.handler);
    }
    const missing = OPERATIONS_JOB_TYPES.filter((jobType) => !handlers.has(jobType));
    if (missing.length > 0) throw new RepositoryValidationError("Operations handler registry is incomplete", { missingCount: missing.length });
    this.#handlers = handlers;
  }

  public resolve(jobType: OperationsJobType): OperationsJobHandler {
    const handler = this.#handlers.get(jobType);
    if (handler === undefined) throw new RepositoryValidationError("Operations job type has no registered handler");
    return handler;
  }
}

/**
 * Registers every supervised job type. All built-ins are local-only; backup
 * verification is an explicit injected boundary so success is never simulated.
 */
export function createLocalOperationsJobHandlerRegistry(input: Readonly<{
  readonly commandBoundary: LocalWorkflowCommandBoundary;
  readonly localWorkflows?: Partial<OperationsLocalWorkflowCallbacks>;
  readonly repositories: RepositoryTransactionRunner;
  readonly verifyBackupAndRestore?: (backupPolicyId: string, signal: AbortSignal) => Promise<Readonly<{ readonly receiptRef: string }>>;
}>): ImmutableOperationsJobHandlerRegistry {
  const command = new LocalCommandHandler(input.commandBoundary);
  const localWorkflow = new LocalWorkflowCallbackHandler(input.localWorkflows);
  const inspection = new LocalOperationalInspectionHandler(input.repositories);
  const backup = new BackupVerificationHandler(input.verifyBackupAndRestore);
  return new ImmutableOperationsJobHandlerRegistry(OPERATIONS_JOB_TYPES.map((jobType) => ({
    handler: jobType === "AGENT_COMPANY_WORKDAY_START" || jobType === "DAILY_OPERATING_REPORT" || jobType === "MORNING_SYSTEM_BRIEF"
      ? localWorkflow
      : jobType === "SOCIAL_SIGNAL_REFRESH" || jobType === "PRODUCTION_QUEUE_RECONCILIATION"
      ? command
      : jobType === "BACKUP_AND_RESTORE_VERIFICATION"
        ? backup
        : inspection,
    jobType,
  })));
}

class LocalCommandHandler implements OperationsJobHandler {
  public constructor(private readonly boundary: LocalWorkflowCommandBoundary) {}

  public async execute(job: OperationsJob, context: OperationsJobHandlerContext): Promise<OperationsExecutionResult> {
    context.signal.throwIfAborted();
    if (job.jobType === "SOCIAL_SIGNAL_REFRESH") return responseResult(await this.boundary.execute({ actorId: job.actorId, commandId: commandId(job, 0), contractVersion: "1", input: {}, operation: "GET_SOCIAL_LIVE_REPORT", workspaceId: job.workspaceId }));
    const limit = (job.payload as { readonly recoveryLimit: number }).recoveryLimit;
    let last: LocalWorkflowCommandResponse | undefined;
    for (let index = 0; index < limit; index += 1) {
      context.signal.throwIfAborted();
      last = await this.boundary.execute({ actorId: job.actorId, commandId: commandId(job, index), contractVersion: "1", input: {}, operation: "RUN_PRODUCTION_RUNTIME_ONCE", workspaceId: job.workspaceId });
      if (isIdleProductionRun(last.result)) break;
    }
    context.signal.throwIfAborted();
    return responseResult(last);
  }
}

class LocalWorkflowCallbackHandler implements OperationsJobHandler {
  public constructor(private readonly callbacks: Partial<OperationsLocalWorkflowCallbacks> | undefined) {}
  public async execute(job: OperationsJob, context: OperationsJobHandlerContext): Promise<OperationsExecutionResult> {
    context.signal.throwIfAborted();
    await context.assertCanStartExternalAction();
    let receipt: OperationsLocalWorkflowResult;
    if (job.jobType === "AGENT_COMPANY_WORKDAY_START") {
      if (this.callbacks?.startAgentCompanyWorkday === undefined) throw new RepositoryValidationError("Agent Company workday callback is not configured");
      const workday = job.payload as { readonly budgetCents: number; readonly workday?: AgentCompanyWorkdayInput; readonly workdayId: string };
      receipt = await this.callbacks.startAgentCompanyWorkday({ budgetCents: workday.budgetCents, operationIdentity: job.operationIdentity, signal: context.signal, ...(workday.workday === undefined ? {} : { workday: workday.workday }), workdayId: workday.workdayId });
    } else if (job.jobType === "DAILY_OPERATING_REPORT" || job.jobType === "MORNING_SYSTEM_BRIEF") {
      if (this.callbacks?.generateDailyOperatingReport === undefined) throw new RepositoryValidationError("Daily Operating Report callback is not configured");
      receipt = await this.callbacks.generateDailyOperatingReport({ businessDate: (job.payload as { readonly businessDate: string }).businessDate, signal: context.signal });
    } else throw new RepositoryValidationError("Local workflow callback received an unsupported job type");
    context.signal.throwIfAborted();
    assertResultRef(receipt.resultRef);
    return Object.freeze({ ...(receipt.status === "BLOCKED" ? { blocked: Object.freeze({ reasonCode: receipt.reasonCode }) } : {}), costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: receipt.resultRef, toolCalls: 0 });
  }
}

class LocalOperationalInspectionHandler implements OperationsJobHandler {
  public constructor(private readonly repositories: RepositoryTransactionRunner) {}
  public async execute(job: OperationsJob, context: OperationsJobHandlerContext): Promise<OperationsExecutionResult> {
    context.signal.throwIfAborted();
    if (job.jobType === "COST_AND_BUDGET_CHECK") return blockedResult("COST_LEDGER_COVERAGE_REQUIRED");
    const result = await this.repositories.transaction(async (repositories) => {
      if (job.jobType === "EVIDENCE_FRESHNESS_CHECK") {
        const packs = await repositories.operationalPlanes.listEvidencePacksByWorkspaceId(job.workspaceId, 100);
        if (packs.length === 100) return blockedResult("EVIDENCE_FRESHNESS_COVERAGE_REQUIRED");
        const now = Date.parse(job.updatedAt);
        return localResult(job.jobType, { fresh: packs.filter(({ minFreshnessExpiresAt }) => Date.parse(minFreshnessExpiresAt) > now).length, stale: packs.filter(({ minFreshnessExpiresAt }) => Date.parse(minFreshnessExpiresAt) <= now).length, total: packs.length });
      }
      if (job.jobType === "PENDING_APPROVAL_REMINDER") {
        const [company, founder, missions, productions] = await Promise.all([repositories.agentCompanyWorkdays.listByOwner({ actorId: job.actorId, workspaceId: job.workspaceId }, 25), repositories.founderWorkdays.listByWorkspaceId(job.workspaceId, 25), repositories.businessMissions.listByWorkspaceId(job.workspaceId, 25), repositories.contentProductions.listByWorkspaceId(job.workspaceId, 25)]);
        if ([company, founder, missions, productions].some(({ length }) => length === 25)) return blockedResult("APPROVAL_REMINDER_COVERAGE_REQUIRED");
        return localResult(job.jobType, { pending: company.filter(({ status }) => status === "AWAITING_FABIO").length + founder.filter(({ status }) => status === "AWAITING_FABIO").length + missions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").length + productions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").length });
      }
      if (job.jobType === "STALE_TASK_DETECTION") {
        const jobs = await repositories.operationsRuntime.listJobsByWorkspaceId(job.workspaceId, 250);
        if (jobs.length === 250) return blockedResult("STALE_TASK_COVERAGE_REQUIRED");
        const staleAfterSeconds = (job.payload as { readonly staleAfterSeconds: number }).staleAfterSeconds;
        const cutoff = Date.parse(job.updatedAt) - staleAfterSeconds * 1_000;
        return localResult(job.jobType, { stale: jobs.filter(({ status, updatedAt }) => ["QUEUED", "RETRY_SCHEDULED", "RUNNING"].includes(status) && Date.parse(updatedAt) <= cutoff).length });
      }
      if (job.jobType === "SECURITY_POSTURE_CHECK") {
        const [control, incidents, publicationLock] = await Promise.all([repositories.operationsRuntime.getControl(job.workspaceId), repositories.operationsControls.listIncidents(job.workspaceId, 250), repositories.operationalPlanes.getPublicationKillSwitch(job.workspaceId)]);
        if (control === undefined || publicationLock === undefined || incidents.length === 250) return blockedResult("SECURITY_POSTURE_COVERAGE_REQUIRED");
        return localResult(job.jobType, { incidentsOpen: incidents.filter(({ status }) => status === "OPEN").length, killSwitch: control.killSwitch, maintenanceMode: control.maintenanceMode, publicationLocked: publicationLock.enabled });
      }
      throw new RepositoryValidationError("Local operational inspection received an unsupported job type");
    });
    context.signal.throwIfAborted();
    return result;
  }
}

class BackupVerificationHandler implements OperationsJobHandler {
  public constructor(private readonly verify: ((backupPolicyId: string, signal: AbortSignal) => Promise<Readonly<{ readonly receiptRef: string }>>) | undefined) {}
  public async execute(job: OperationsJob, context: OperationsJobHandlerContext): Promise<OperationsExecutionResult> {
    if (this.verify === undefined) throw new RepositoryValidationError("Backup and restore verification boundary is not configured");
    await context.assertCanStartExternalAction();
    const receipt = await this.verify((job.payload as { readonly backupPolicyId: string }).backupPolicyId, context.signal);
    assertResultRef(receipt.receiptRef);
    return Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: receipt.receiptRef, toolCalls: 0 });
  }
}

function responseResult(response: LocalWorkflowCommandResponse | undefined): OperationsExecutionResult {
  return Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: `local-${digest(JSON.stringify(response ?? { status: "IDLE" })).slice(0, 48)}`, toolCalls: 0 });
}
function blockedResult(reasonCode: OperationsJobBlock["code"]): OperationsExecutionResult { return Object.freeze({ blocked: Object.freeze({ reasonCode }), costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: reasonCode, toolCalls: 0 }); }
function localResult(jobType: OperationsJobType, value: unknown): OperationsExecutionResult { return Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: `local-${digest(`${jobType}\n${JSON.stringify(value)}`).slice(0, 48)}`, toolCalls: 0 }); }
function commandId(job: OperationsJob, index: number): string { return `ops-${digest(`${job.jobId}\n${String(job.attempt)}\n${String(index)}`).slice(0, 48)}`; }
function isIdleProductionRun(value: unknown): boolean { return typeof value === "object" && value !== null && "status" in value && value.status === "IDLE"; }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function assertResultRef(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError("Operations handler result reference is invalid"); }
