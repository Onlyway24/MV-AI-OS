import { createHash, randomUUID } from "node:crypto";

import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { OPERATIONAL_EVENT_SEMANTICS, type OperationalEventType } from "./operational-event.js";
import { OPERATIONS_JOB_BLOCK_CODES } from "./operations-runtime.js";
import type {
  OperationsExecutionResult,
  OperationsJobBlock,
  OperationsJob,
  OperationsJobAttempt,
  OperationsJobFailure,
  OperationsJobHandlerRegistry,
  OperationsJobReceipt,
  OperationsJobReasonCode,
  OperationsProcessLease,
  OperationsWorkerRunResult,
} from "./operations-runtime.js";

const DEFAULT_RECOVERY_LIMIT = 25;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_WORKER_LEASE_MS = 30_000;
type ExecutionFailureCode = OperationsJobFailure["code"];

/**
 * Durable, single-concurrency worker. Every state transition and its redacted
 * operational event share one SQLite transaction. A process fencing token and
 * a per-attempt lease ID prevent a superseded worker from committing results.
 */
export class OperationsWorkerService {
  readonly #recoveryLimit: number;
  readonly #shutdownGraceMs: number;
  readonly #workerLeaseMs: number;
  readonly #shutdown = new AbortController();
  #activeExecutionController: AbortController | undefined;
  #activeHandlerSettlement: Promise<void> | undefined;
  #activeRun: Promise<OperationsWorkerRunResult> | undefined;
  #closePromise: Promise<void> | undefined;
  #running = false;
  #closed = false;

  public constructor(private readonly input: {
    readonly clock: Clock;
    readonly handlers: OperationsJobHandlerRegistry;
    readonly instanceId: string;
    readonly repositories: RepositoryTransactionRunner;
    readonly workerId: string;
    readonly workspaceId: string;
    readonly recoveryLimit?: number;
    readonly shutdownGraceMs?: number;
    readonly workerLeaseMs?: number;
  }) {
    assertId(input.instanceId, "Worker instance ID");
    assertId(input.workerId, "Worker ID");
    assertId(input.workspaceId, "Workspace ID");
    this.#recoveryLimit = bounded(input.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT, 1, 100, "Worker recovery limit");
    this.#shutdownGraceMs = bounded(input.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS, 100, 60_000, "Worker shutdown grace period");
    this.#workerLeaseMs = bounded(input.workerLeaseMs ?? DEFAULT_WORKER_LEASE_MS, 1_000, 300_000, "Worker process lease duration");
  }

  public runOnce(): Promise<OperationsWorkerRunResult> {
    if (this.#closed) return Promise.resolve(runResult("STOPPED", 0));
    if (this.#running) return Promise.reject(new RepositoryConflictError("Operations worker already has an active run"));
    if (this.#activeHandlerSettlement !== undefined) return Promise.reject(new RepositoryConflictError("Operations worker has an execution that did not quiesce"));
    this.#running = true;
    const active = this.#runOnce();
    this.#activeRun = active;
    return active;
  }

  async #runOnce(): Promise<OperationsWorkerRunResult> {
    try {
      const processLease = await this.#acquireProcessLease();
      if (processLease === undefined) return runResult("STOPPED", 0);
      const recoveredExpiredClaims = await this.recoverExpiredClaims();
      const claimed = await this.#claim(processLease);
      if (claimed === undefined) {
        const stopped = await this.#isStopped();
        return runResult(stopped ? "STOPPED" : "IDLE", recoveredExpiredClaims);
      }
      const final = await this.#executeClaim(claimed, processLease);
      return runResult(final.status, recoveredExpiredClaims, final.job);
    } finally {
      this.#running = false;
      this.#activeRun = undefined;
    }
  }

  /** Reconciles expired leases without executing a handler. Safe at startup. */
  public async recoverExpiredClaims(): Promise<number> {
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const expired = await operationsRuntime.listExpiredClaims(this.input.workspaceId, now, this.#recoveryLimit);
      for (const job of expired) {
        const cancelled = job.cancellationRequestedAt !== undefined;
        const exhausted = job.attempt > job.retryPolicy.automaticRetries;
        const outcome: OperationsJobReceipt["outcome"] = cancelled ? "CANCELLED" : exhausted ? "DEAD_LETTER" : "RETRY_SCHEDULED";
        const failure: OperationsJobFailure = Object.freeze({
          code: cancelled ? "CANCELLED" : "LEASE_EXPIRED",
          occurredAt: now,
          retryable: !cancelled && !exhausted,
        });
        const receipt = createReceipt(job, outcome, now, zeroUsage());
        const next = terminalJob(job, outcome, failure, receipt, now);
        await operationsRuntime.updateJob(next, { version: job.version });
        await operationsRuntime.insertAttempt(createAttempt(job, outcome, now, zeroUsage(), failure.code));
        await operationalEvents.append(event("JOB_RECOVERED", next));
        await operationalEvents.append(event(eventTypeForOutcome(outcome), next));
      }
      return expired.length;
    });
  }

  public async heartbeat(): Promise<OperationsProcessLease> {
    const lease = await this.#acquireProcessLease();
    if (lease === undefined) throw new RepositoryConflictError("Operations worker lease is held by another instance");
    return lease;
  }

  public async requestCancellation(jobId: string, expectedVersion: number, requestedBy: string): Promise<OperationsJob> {
    assertId(jobId, "Operations job ID");
    assertId(requestedBy, "Cancellation actor ID");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new RepositoryValidationError("Operations job version is invalid");
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const current = await operationsRuntime.getJobById(jobId);
      if (current?.workspaceId !== this.input.workspaceId) throw new RepositoryConflictError("Operations job is unavailable for cancellation");
      if (current.version !== expectedVersion) throw new RepositoryConflictError("Operations job changed before cancellation");
      if (["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED"].includes(current.status)) return current;
      if (current.status === "RUNNING") {
        const next: OperationsJob = Object.freeze({ ...current, cancellationRequestedAt: now, cancellationRequestedBy: requestedBy, updatedAt: now, version: current.version + 1 });
        await operationsRuntime.updateJob(next, { version: current.version });
        return next;
      }
      const receipt = createReceipt(current, "CANCELLED", now, zeroUsage());
      const failure: OperationsJobFailure = Object.freeze({ code: "CANCELLED", occurredAt: now, retryable: false });
      const next = terminalJob(current, "CANCELLED", failure, receipt, now, requestedBy);
      await operationsRuntime.updateJob(next, { version: current.version });
      await operationalEvents.append(event("JOB_CANCELLED", next));
      return next;
    });
  }

  public close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closed = true;
    this.#shutdown.abort(new OperationsExecutionAbort("CANCELLED"));
    this.#activeExecutionController?.abort(new OperationsExecutionAbort("CANCELLED"));
    this.#closePromise = this.#settleAndRelease();
    return this.#closePromise;
  }

  async #claim(processLease: OperationsProcessLease): Promise<OperationsJob | undefined> {
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const control = await operationsRuntime.getControl(this.input.workspaceId);
      if (control?.killSwitch === "ACTIVE" || control?.maintenanceMode === "ENABLED") return undefined;
      const durableLease = await operationsRuntime.getProcessLease(this.input.workspaceId, this.#leaseKey());
      if (!sameProcessLease(durableLease, processLease) || Date.parse(durableLease.expiresAt) <= Date.parse(now)) return undefined;
      const claimed = await operationsRuntime.claimNextDue({ fencingToken: processLease.fencingToken, leaseId: `lease-${randomUUID()}`, now, workerId: this.input.workerId, workspaceId: this.input.workspaceId });
      if (claimed !== undefined) await operationalEvents.append(event("JOB_LEASE_ACQUIRED", claimed));
      return claimed;
    });
  }

  async #executeClaim(claimed: OperationsJob, processLease: OperationsProcessLease): Promise<{ readonly job?: OperationsJob; readonly status: OperationsWorkerRunResult["status"] }> {
    const controller = new AbortController();
    this.#activeExecutionController = controller;
    const stopExecution = (): void => { controller.abort(new OperationsExecutionAbort("CANCELLED")); };
    if (this.#shutdown.signal.aborted) stopExecution();
    else this.#shutdown.signal.addEventListener("abort", stopExecution, { once: true });
    const pendingHeartbeats = new Set<Promise<void>>();

    const heartbeat = async (): Promise<void> => {
      try {
        await this.#heartbeatClaim(claimed, processLease);
      } catch (error) {
        controller.abort(error instanceof OperationsExecutionAbort ? error : new OperationsExecutionAbort("CANCELLED"));
      }
    };
    const heartbeatTimer = setInterval(() => {
      if (pendingHeartbeats.size > 0 || controller.signal.aborted) return;
      const pending = heartbeat();
      pendingHeartbeats.add(pending);
      void pending.finally(() => { pendingHeartbeats.delete(pending); });
    }, claimed.heartbeatIntervalMs);
    const timeoutTimer = setTimeout(() => { controller.abort(new OperationsExecutionAbort("TIMEOUT")); }, claimed.timeoutMs);

    let execution: OperationsExecutionResult | undefined;
    let failure: OperationsExecutionAbort | undefined;
    let handlerSettlement: Promise<void> | undefined;
    try {
      const handler = this.input.handlers.resolve(claimed.jobType);
      const handlerPromise = handler.execute(claimed, {
        assertCanStartExternalAction: async () => this.#assertCanStartExternalAction(claimed, processLease),
        signal: controller.signal,
      });
      handlerSettlement = handlerPromise.then(() => undefined, () => undefined);
      this.#activeHandlerSettlement = handlerSettlement;
      const abortPromise = new Promise<never>((_resolve, reject) => {
        const rejectAbort = (): void => { reject(asExecutionAbort(controller.signal.reason)); };
        if (controller.signal.aborted) rejectAbort();
        else controller.signal.addEventListener("abort", rejectAbort, { once: true });
      });
      execution = await Promise.race([handlerPromise, abortPromise]);
      validateExecutionResult(execution, claimed);
    } catch (error) {
      failure = classifyExecutionFailure(error, controller.signal);
    } finally {
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
    }

    if (controller.signal.aborted && handlerSettlement !== undefined && !await settlesWithin(handlerSettlement, this.#shutdownGraceMs)) {
      throw new RepositoryConflictError("Operations handler did not quiesce within the shutdown grace period");
    }
    await Promise.allSettled([...pendingHeartbeats]);
    try {
      return await this.#finalizeClaim(claimed, processLease, execution, failure);
    } finally {
      this.#shutdown.signal.removeEventListener("abort", stopExecution);
      this.#activeExecutionController = undefined;
      this.#activeHandlerSettlement = undefined;
    }
  }

  async #heartbeatClaim(claimed: OperationsJob, processLease: OperationsProcessLease): Promise<void> {
    const now = this.input.clock.now().toISOString();
    await this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const control = await operationsRuntime.getControl(this.input.workspaceId);
      if (control?.killSwitch === "ACTIVE") throw new OperationsExecutionAbort("CANCELLED");
      const durableProcess = await operationsRuntime.getProcessLease(this.input.workspaceId, this.#leaseKey());
      if (!sameProcessLease(durableProcess, processLease)) throw new OperationsExecutionAbort("CANCELLED");
      const renewedProcess: OperationsProcessLease = Object.freeze({ ...durableProcess, expiresAt: new Date(Date.parse(now) + this.#workerLeaseMs).toISOString(), heartbeatAt: now, version: durableProcess.version + 1 });
      await operationsRuntime.updateProcessLease(renewedProcess, { version: durableProcess.version });
      const current = await operationsRuntime.getJobById(claimed.jobId);
      if (!sameClaim(current, claimed, processLease) || current.cancellationRequestedAt !== undefined) throw new OperationsExecutionAbort("CANCELLED");
      const lease = Object.freeze({ ...current.lease, expiresAt: new Date(Date.parse(now) + current.leaseDurationMs).toISOString(), heartbeatAt: now }) as NonNullable<OperationsJob["lease"]>;
      const next: OperationsJob = Object.freeze({ ...current, lease, updatedAt: now, version: current.version + 1 });
      await operationsRuntime.updateJob(next, { version: current.version });
      await operationalEvents.append(event("JOB_HEARTBEAT", next));
    });
  }

  async #assertCanStartExternalAction(claimed: OperationsJob, processLease: OperationsProcessLease): Promise<void> {
    this.#assertExecutionOpen();
    const now = this.input.clock.now().toISOString();
    await this.input.repositories.transaction(async ({ operationsRuntime }) => {
      this.#assertExecutionOpen();
      const control = await operationsRuntime.getControl(this.input.workspaceId);
      const durableProcess = await operationsRuntime.getProcessLease(this.input.workspaceId, this.#leaseKey());
      const current = await operationsRuntime.getJobById(claimed.jobId);
      if (control?.killSwitch === "ACTIVE" || control?.maintenanceMode === "ENABLED" || !sameProcessLease(durableProcess, processLease) || Date.parse(durableProcess.expiresAt) <= Date.parse(now) || !sameClaim(current, claimed, processLease) || current.cancellationRequestedAt !== undefined || Date.parse(current.lease.expiresAt) <= Date.parse(now)) throw new OperationsExecutionAbort("CANCELLED");
    });
    this.#assertExecutionOpen();
  }

  #assertExecutionOpen(): void {
    if (this.#closed || this.#shutdown.signal.aborted) throw new OperationsExecutionAbort("CANCELLED");
  }

  async #finalizeClaim(claimed: OperationsJob, processLease: OperationsProcessLease, execution: OperationsExecutionResult | undefined, failure: OperationsExecutionAbort | undefined): Promise<{ readonly job?: OperationsJob; readonly status: OperationsWorkerRunResult["status"] }> {
    const now = this.input.clock.now().toISOString();
    return this.input.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => {
      const current = await operationsRuntime.getJobById(claimed.jobId);
      if (current === undefined) return { status: "STOPPED" };
      if (!sameClaim(current, claimed, processLease)) return { job: current, status: workerStatus(current.status) };
      const cancelled = current.cancellationRequestedAt !== undefined || failure?.code === "CANCELLED";
      const priorAttempts = await operationsRuntime.listAttempts(current.jobId);
      const usage = execution ?? zeroUsage();
      const invalidResult = priorAttempts.reduce((total, attempt) => total + attempt.costCents, usage.costCents) > current.budget.maxCostCents
        || priorAttempts.reduce((total, attempt) => total + attempt.providerCalls, usage.providerCalls) > current.budget.maxProviderCalls
        || priorAttempts.reduce((total, attempt) => total + attempt.toolCalls, usage.toolCalls) > current.budget.maxToolCalls;
      const effectiveFailure = cancelled
        ? new OperationsExecutionAbort("CANCELLED")
        : invalidResult
          ? new OperationsExecutionAbort("EXECUTION_FAILED", false)
          : failure;
      const block = effectiveFailure === undefined && execution?.blocked !== undefined
        ? Object.freeze({ code: execution.blocked.reasonCode, occurredAt: now }) satisfies OperationsJobBlock
        : undefined;
      const canRetry = effectiveFailure !== undefined && effectiveFailure.retryable && current.attempt <= current.retryPolicy.automaticRetries;
      const outcome: OperationsJobReceipt["outcome"] = block !== undefined
        ? "BLOCKED"
        : effectiveFailure === undefined
        ? "COMPLETED"
        : cancelled
          ? "CANCELLED"
          : canRetry
            ? "RETRY_SCHEDULED"
            : effectiveFailure.retryable
              ? "DEAD_LETTER"
              : "FAILED";
      const receipt = createReceipt(current, outcome, now, usage, execution?.resultRef, block?.code);
      const jobFailure = effectiveFailure === undefined ? undefined : Object.freeze({ code: effectiveFailure.code, occurredAt: now, retryable: canRetry });
      const next = terminalJob(current, outcome, jobFailure, receipt, now, undefined, block);
      await operationsRuntime.updateJob(next, { version: current.version });
      await operationsRuntime.insertAttempt(createAttempt(current, outcome, now, usage, block?.code ?? jobFailure?.code, execution?.resultRef));
      await operationalEvents.append(event(eventTypeForOutcome(outcome), next));
      return { job: next, status: workerStatus(next.status) };
    });
  }

  async #isStopped(): Promise<boolean> {
    return this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const control = await operationsRuntime.getControl(this.input.workspaceId);
      return control?.killSwitch === "ACTIVE" || control?.maintenanceMode === "ENABLED";
    });
  }

  async #acquireProcessLease(): Promise<OperationsProcessLease | undefined> {
    if (this.#closed) return undefined;
    const now = this.input.clock.now();
    const heartbeatAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.#workerLeaseMs).toISOString();
    return this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const current = await operationsRuntime.getProcessLease(this.input.workspaceId, this.#leaseKey());
      if (current === undefined) {
        const created: OperationsProcessLease = Object.freeze({ contractVersion: "1", expiresAt, fencingToken: 1, heartbeatAt, instanceId: this.input.instanceId, leaseKey: this.#leaseKey(), role: "WORKER", version: 0, workspaceId: this.input.workspaceId });
        await operationsRuntime.insertProcessLease(created);
        return created;
      }
      const owned = current.instanceId === this.input.instanceId;
      const expired = Date.parse(current.expiresAt) <= now.getTime();
      if (!owned && !expired) return undefined;
      const next: OperationsProcessLease = Object.freeze({ ...current, expiresAt, fencingToken: owned ? current.fencingToken : current.fencingToken + 1, heartbeatAt, instanceId: this.input.instanceId, version: current.version + 1 });
      await operationsRuntime.updateProcessLease(next, { version: current.version });
      return next;
    });
  }

  async #releaseProcessLease(): Promise<void> {
    await this.input.repositories.transaction(async ({ operationsRuntime }) => {
      const current = await operationsRuntime.getProcessLease(this.input.workspaceId, this.#leaseKey());
      if (current?.instanceId !== this.input.instanceId) return;
      await operationsRuntime.deleteProcessLease({ fencingToken: current.fencingToken, instanceId: current.instanceId, leaseKey: current.leaseKey, version: current.version, workspaceId: current.workspaceId });
    });
  }

  async #settleAndRelease(): Promise<void> {
    const activeRun = this.#activeRun;
    if (activeRun !== undefined && !await settlesWithin(activeRun.then(() => undefined, () => undefined), this.#shutdownGraceMs)) {
      throw new RepositoryConflictError("Operations worker run did not settle within the shutdown grace period");
    }
    const handlerSettlement = this.#activeHandlerSettlement;
    if (handlerSettlement !== undefined && !await settlesWithin(handlerSettlement, this.#shutdownGraceMs)) {
      throw new RepositoryConflictError("Operations handler did not quiesce within the shutdown grace period");
    }
    await this.#releaseProcessLease();
  }

  #leaseKey(): string { return `worker:${this.input.workerId}`; }
}

class OperationsExecutionAbort extends Error {
  public constructor(public readonly code: ExecutionFailureCode, public readonly retryable = code !== "CANCELLED") {
    super(code);
    this.name = "OperationsExecutionAbort";
  }
}

function terminalJob(current: OperationsJob, outcome: OperationsJobReceipt["outcome"], failure: OperationsJobFailure | undefined, receipt: OperationsJobReceipt, now: string, cancelledBy?: string, block?: OperationsJobBlock): OperationsJob {
  const base = withoutLeaseAndFailure(current);
  const runAfter = outcome === "RETRY_SCHEDULED" ? new Date(Date.parse(now) + backoff(current)).toISOString() : current.runAfter;
  let cancellation: Readonly<{ readonly cancellationRequestedAt: string; readonly cancellationRequestedBy: string }> | Readonly<Record<string, never>> = {};
  if (outcome === "CANCELLED") cancellation = { cancellationRequestedAt: current.cancellationRequestedAt ?? now, cancellationRequestedBy: current.cancellationRequestedBy ?? cancelledBy ?? current.actorId };
  else if (current.cancellationRequestedAt !== undefined && current.cancellationRequestedBy !== undefined) cancellation = { cancellationRequestedAt: current.cancellationRequestedAt, cancellationRequestedBy: current.cancellationRequestedBy };
  return Object.freeze({ ...base, ...cancellation, ...(block === undefined ? {} : { block }), ...(failure === undefined ? {} : { lastFailure: failure }), receipt, runAfter, status: outcome, updatedAt: now, version: current.version + 1 });
}

function withoutLeaseAndFailure(job: OperationsJob): Omit<OperationsJob, "block" | "cancellationRequestedAt" | "cancellationRequestedBy" | "lastFailure" | "lease" | "receipt"> {
  return {
    actorId: job.actorId, attempt: job.attempt, budget: job.budget, contractVersion: job.contractVersion, createdAt: job.createdAt,
    heartbeatIntervalMs: job.heartbeatIntervalMs, jobId: job.jobId, jobType: job.jobType, leaseDurationMs: job.leaseDurationMs,
    operationIdentity: job.operationIdentity, owner: job.owner, payload: job.payload, payloadFingerprint: job.payloadFingerprint,
    ...(job.predecessorJobId === undefined ? {} : { predecessorJobId: job.predecessorJobId }), priority: job.priority,
    recoveryStrategy: job.recoveryStrategy, retryPolicy: job.retryPolicy, runAfter: job.runAfter,
    ...(job.scheduleId === undefined ? {} : { scheduleId: job.scheduleId }), scheduledFor: job.scheduledFor,
    status: job.status, timeoutMs: job.timeoutMs, updatedAt: job.updatedAt, version: job.version, workspaceId: job.workspaceId,
  };
}

function createReceipt(job: OperationsJob, outcome: OperationsJobReceipt["outcome"], recordedAt: string, usage: Pick<OperationsExecutionResult, "costCents" | "providerCalls" | "toolCalls">, resultRef?: string, reasonCode?: OperationsJobBlock["code"]): OperationsJobReceipt {
  return Object.freeze({ attempt: job.attempt, costCents: usage.costCents, externalEffectsExecuted: false, outcome, providerCalls: usage.providerCalls, ...(reasonCode === undefined ? {} : { reasonCode }), receiptId: `receipt-${digest(`${job.jobId}\n${String(job.attempt)}\n${outcome}`).slice(0, 48)}`, recordedAt, ...(resultRef === undefined ? {} : { resultRef }), toolCalls: usage.toolCalls });
}

function createAttempt(job: OperationsJob, outcome: OperationsJobReceipt["outcome"], finishedAt: string, usage: Pick<OperationsExecutionResult, "costCents" | "providerCalls" | "toolCalls">, reasonCode?: OperationsJobReasonCode, resultRef?: string): OperationsJobAttempt {
  return Object.freeze({ attempt: job.attempt, attemptId: `attempt-${digest(`${job.jobId}\n${String(job.attempt)}`).slice(0, 48)}`, contractVersion: "1", costCents: usage.costCents, externalEffectsExecuted: false, finishedAt, jobId: job.jobId, outcome, providerCalls: usage.providerCalls, ...(reasonCode === undefined ? {} : { reasonCode }), ...(resultRef === undefined ? {} : { resultRef }), startedAt: job.lease?.acquiredAt ?? finishedAt, toolCalls: usage.toolCalls, workspaceId: job.workspaceId });
}

function event(eventType: OperationalEventType, job: OperationsJob) {
  const semantics = OPERATIONAL_EVENT_SEMANTICS[eventType];
  return Object.freeze({ aggregateType: semantics.aggregateType, contractVersion: "1" as const, entityId: job.jobId, entityVersion: job.version, eventId: `evt-${digest(`${eventType}\n${job.jobId}\n${String(job.version)}`).slice(0, 48)}`, eventType, occurredAt: job.updatedAt, safeSummaryCode: semantics.safeSummaryCode, workspaceId: job.workspaceId });
}

function eventTypeForOutcome(outcome: OperationsJobReceipt["outcome"]): OperationalEventType {
  return ({ BLOCKED: "JOB_BLOCKED", CANCELLED: "JOB_CANCELLED", COMPLETED: "JOB_COMPLETED", DEAD_LETTER: "JOB_DEAD_LETTER", FAILED: "JOB_FAILED", RETRY_SCHEDULED: "JOB_RETRY_SCHEDULED" } as const)[outcome];
}

function sameProcessLease(current: OperationsProcessLease | undefined, expected: OperationsProcessLease): current is OperationsProcessLease {
  return current?.instanceId === expected.instanceId && current.fencingToken === expected.fencingToken && current.leaseKey === expected.leaseKey;
}

function sameClaim(current: OperationsJob | undefined, claimed: OperationsJob, processLease: OperationsProcessLease): current is OperationsJob & { readonly lease: NonNullable<OperationsJob["lease"]> } {
  if (current?.status !== "RUNNING" || current.lease === undefined || claimed.lease === undefined) return false;
  return current.lease.leaseId === claimed.lease.leaseId && current.lease.workerId === claimed.lease.workerId && current.lease.fencingToken === processLease.fencingToken;
}

function classifyExecutionFailure(error: unknown, signal: AbortSignal): OperationsExecutionAbort {
  if (error instanceof OperationsExecutionAbort) return error;
  if (signal.aborted) return asExecutionAbort(signal.reason);
  return new OperationsExecutionAbort("EXECUTION_FAILED", true);
}

function asExecutionAbort(reason: unknown): OperationsExecutionAbort { return reason instanceof OperationsExecutionAbort ? reason : new OperationsExecutionAbort("CANCELLED"); }
function backoff(job: OperationsJob): number { return Math.min(job.retryPolicy.maxBackoffMs, job.retryPolicy.initialBackoffMs * (2 ** Math.max(0, job.attempt - 1))); }
function workerStatus(status: OperationsJob["status"]): OperationsWorkerRunResult["status"] { return status === "QUEUED" || status === "RUNNING" ? "STOPPED" : status; }
function runResult(status: OperationsWorkerRunResult["status"], recoveredExpiredClaims: number, job?: OperationsJob): OperationsWorkerRunResult { return Object.freeze({ contractVersion: "1", ...(job === undefined ? {} : { job }), recoveredExpiredClaims, status, unauthorizedExternalEffectOccurred: false }); }
function validateExecutionResult(value: unknown, job: OperationsJob): void { if (!record(value) || !Number.isSafeInteger(value.costCents) || (value.costCents as number) < 0 || !Number.isSafeInteger(value.providerCalls) || (value.providerCalls as number) < 0 || !Number.isSafeInteger(value.toolCalls) || (value.toolCalls as number) < 0 || value.externalEffectsExecuted !== false || (value.blocked !== undefined && (!record(value.blocked) || Object.keys(value.blocked).length !== 1 || typeof value.blocked.reasonCode !== "string" || !(OPERATIONS_JOB_BLOCK_CODES as readonly string[]).includes(value.blocked.reasonCode))) || (value.resultRef !== undefined && (typeof value.resultRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value.resultRef))) || (value.costCents as number) > job.budget.maxCostCents || (value.providerCalls as number) > job.budget.maxProviderCalls || (value.toolCalls as number) > job.budget.maxToolCalls) throw new OperationsExecutionAbort("EXECUTION_FAILED", false); }
function zeroUsage(): OperationsExecutionResult { return Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 }); }
async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise.then(() => true), new Promise<false>((resolve) => { timer = setTimeout(() => { resolve(false); }, timeoutMs); })]); } finally { if (timer !== undefined) clearTimeout(timer); } }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RepositoryValidationError(`${label} is invalid`); return value; }
function assertId(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError(`${label} is invalid`); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
