import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { ProductionRuntimeEnqueueRequest, ProductionRuntimeHealthReport, ProductionRuntimeJob, ProductionRuntimeRunResult } from "./production-runtime-job.js";
import { ProductionRuntimeEnqueueRequestValidator, ProductionRuntimeHealthReportValidator, ProductionRuntimeJobValidator, ProductionRuntimeRunResultValidator } from "./production-runtime-validator.js";

const MAX_RECOVERY_BATCH = 25;
const LEASE_MILLISECONDS = 60_000;

export class ProductionRuntimeService {
  readonly #enqueueValidator = new ProductionRuntimeEnqueueRequestValidator();
  readonly #healthValidator = new ProductionRuntimeHealthReportValidator();
  readonly #jobValidator = new ProductionRuntimeJobValidator();
  readonly #runValidator = new ProductionRuntimeRunResultValidator();

  public constructor(private readonly input: { readonly actorId: string; readonly clock: Clock; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string }) {}

  public async enqueue(candidate: ProductionRuntimeEnqueueRequest): Promise<ProductionRuntimeJob> {
    const request = validate(candidate, this.#enqueueValidator, "Production Runtime enqueue request");
    const now = this.input.clock.now().toISOString();
    if (Date.parse(request.runAfter) < this.input.clock.now().getTime()) throw new Error("Production Runtime jobs cannot be scheduled in the past");
    const job: ProductionRuntimeJob = { actorId: this.input.actorId, attempt: 0, brief: request.brief, contractVersion: "1", createdAt: now, jobId: request.jobId, maxAttempts: 3, runAfter: request.runAfter, status: "QUEUED", updatedAt: now, version: 0, workspaceId: this.input.workspaceId };
    return this.input.repositories.transaction(async ({ productionRuntimeJobs }) => {
      if (await productionRuntimeJobs.getById(job.jobId) !== undefined) throw new Error("Production Runtime job already exists");
      await productionRuntimeJobs.insert(job);
      return job;
    });
  }

  public async health(): Promise<ProductionRuntimeHealthReport> {
    const counts = await this.input.repositories.transaction(({ productionRuntimeJobs }) => productionRuntimeJobs.summarize(this.input.workspaceId));
    return validate({ contractVersion: "1", counts, deadLetterAttentionRequired: counts.deadLetter > 0, status: counts.deadLetter > 0 ? "ATTENTION_REQUIRED" : "READY", unauthorizedExternalEffectOccurred: false }, this.#healthValidator, "Production Runtime health report");
  }

  public async runOnce(execute: (job: ProductionRuntimeJob) => Promise<string>): Promise<ProductionRuntimeRunResult> {
    const recoveredExpiredClaims = await this.#recoverExpiredClaims();
    const now = this.input.clock.now();
    const job = await this.input.repositories.transaction(({ productionRuntimeJobs }) => productionRuntimeJobs.claimNextDue(this.input.workspaceId, now.toISOString(), new Date(now.getTime() + LEASE_MILLISECONDS).toISOString()));
    if (job === undefined) return validate({ contractVersion: "1", recoveredExpiredClaims, status: "IDLE", unauthorizedExternalEffectOccurred: false }, this.#runValidator, "Production Runtime run result");
    try {
      const productionId = await execute(job);
      const completed = await this.#complete(job, productionId);
      return validate({ contractVersion: "1", job: completed, recoveredExpiredClaims, status: "COMPLETED", unauthorizedExternalEffectOccurred: false }, this.#runValidator, "Production Runtime run result");
    } catch {
      const failed = await this.#fail(job, "runtime_execution_failed");
      return validate({ contractVersion: "1", job: failed, recoveredExpiredClaims, status: failed.status === "DEAD_LETTER" ? "DEAD_LETTER" : "RETRY_SCHEDULED", unauthorizedExternalEffectOccurred: false }, this.#runValidator, "Production Runtime run result");
    }
  }

  async #recoverExpiredClaims(): Promise<number> {
    const now = this.input.clock.now();
    const expired = await this.input.repositories.transaction(({ productionRuntimeJobs }) => productionRuntimeJobs.listExpiredClaims(this.input.workspaceId, now.toISOString(), MAX_RECOVERY_BATCH));
    for (const job of expired) await this.#fail(job, "lease_expired");
    return expired.length;
  }
  async #complete(job: ProductionRuntimeJob, productionId: string): Promise<ProductionRuntimeJob> {
    const updatedAt = this.input.clock.now().toISOString();
    const next = validate({ ...withoutLease(job), result: { productionId }, status: "COMPLETED", updatedAt, version: job.version + 1 }, this.#jobValidator, "Completed Production Runtime job");
    return this.input.repositories.transaction(async ({ productionRuntimeJobs }) => { await productionRuntimeJobs.update(next, { version: job.version }); return next; });
  }
  async #fail(job: ProductionRuntimeJob, code: "lease_expired" | "runtime_execution_failed"): Promise<ProductionRuntimeJob> {
    const now = this.input.clock.now();
    const updatedAt = now.toISOString();
    const deadLetter = job.attempt >= job.maxAttempts;
    const retryAt = new Date(now.getTime() + retryDelayMilliseconds(job.attempt)).toISOString();
    const next = validate({ ...withoutLeaseAndError(job), lastError: { code, occurredAt: updatedAt }, runAfter: deadLetter ? job.runAfter : retryAt, status: deadLetter ? "DEAD_LETTER" : "RETRY_SCHEDULED", updatedAt, version: job.version + 1 }, this.#jobValidator, "Failed Production Runtime job");
    return this.input.repositories.transaction(async ({ productionRuntimeJobs }) => { await productionRuntimeJobs.update(next, { version: job.version }); return next; });
  }
}

function retryDelayMilliseconds(attempt: number): number { return Math.min(600_000, 30_000 * 2 ** Math.max(0, attempt - 1)); }
function withoutLease(job: ProductionRuntimeJob): Omit<ProductionRuntimeJob, "leaseExpiresAt"> { return { actorId: job.actorId, attempt: job.attempt, brief: job.brief, contractVersion: job.contractVersion, createdAt: job.createdAt, jobId: job.jobId, ...(job.lastError === undefined ? {} : { lastError: job.lastError }), maxAttempts: job.maxAttempts, ...(job.result === undefined ? {} : { result: job.result }), runAfter: job.runAfter, status: job.status, updatedAt: job.updatedAt, version: job.version, workspaceId: job.workspaceId }; }
function withoutLeaseAndError(job: ProductionRuntimeJob): Omit<ProductionRuntimeJob, "lastError" | "leaseExpiresAt"> { return { actorId: job.actorId, attempt: job.attempt, brief: job.brief, contractVersion: job.contractVersion, createdAt: job.createdAt, jobId: job.jobId, maxAttempts: job.maxAttempts, ...(job.result === undefined ? {} : { result: job.result }), runAfter: job.runAfter, status: job.status, updatedAt: job.updatedAt, version: job.version, workspaceId: job.workspaceId }; }
function validate<T>(value: unknown, validator: { validate(value: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false } }, label: string): T { const result = validator.validate(value); if (!result.ok) throw new Error(`${label} failed validation`); return result.value; }
