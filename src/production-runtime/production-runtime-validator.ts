import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import { MetodoVeloceContentProductionBriefValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import type { ProductionRuntimeEnqueueRequest, ProductionRuntimeHealthReport, ProductionRuntimeJob, ProductionRuntimeRunResult } from "./production-runtime-job.js";

const ID = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class ProductionRuntimeEnqueueRequestValidator implements Validator<ProductionRuntimeEnqueueRequest> {
  readonly #brief = new MetodoVeloceContentProductionBriefValidator();
  public validate(value: unknown): ValidationResult<ProductionRuntimeEnqueueRequest> {
    if (!record(value) || !keys(value, ["brief", "jobId", "runAfter"]) || !identifier(value.jobId) || !timestamp(value.runAfter) || !this.#brief.validate(value.brief).ok) return invalid("Production Runtime enqueue request is invalid");
    return valid(value as unknown as ProductionRuntimeEnqueueRequest);
  }
}

export class ProductionRuntimeJobValidator implements Validator<ProductionRuntimeJob> {
  readonly #brief = new MetodoVeloceContentProductionBriefValidator();
  public validate(value: unknown): ValidationResult<ProductionRuntimeJob> {
    if (!record(value)) return invalid("Production Runtime job is invalid");
    const expected = ["actorId", "attempt", "brief", "contractVersion", "createdAt", "jobId", "maxAttempts", "runAfter", "status", "updatedAt", "version", "workspaceId", ...(value.lastError === undefined ? [] : ["lastError"]), ...(value.leaseExpiresAt === undefined ? [] : ["leaseExpiresAt"]), ...(value.result === undefined ? [] : ["result"])];
    if (!keys(value, expected) || value.contractVersion !== "1" || !identifier(value.actorId) || !identifier(value.workspaceId) || !identifier(value.jobId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !timestamp(value.runAfter) || !count(value.attempt, 0, 3) || !count(value.maxAttempts, 1, 3) || !count(value.version, 0, 1_000_000) || !this.#brief.validate(value.brief).ok || !statusShape(value)) return invalid("Production Runtime job is invalid");
    return valid(value as unknown as ProductionRuntimeJob);
  }
}

export class ProductionRuntimeHealthReportValidator implements Validator<ProductionRuntimeHealthReport> {
  public validate(value: unknown): ValidationResult<ProductionRuntimeHealthReport> {
    if (!record(value) || !keys(value, ["contractVersion", "counts", "deadLetterAttentionRequired", "status", "unauthorizedExternalEffectOccurred"]) || value.contractVersion !== "1" || value.unauthorizedExternalEffectOccurred !== false || typeof value.deadLetterAttentionRequired !== "boolean" || !["ATTENTION_REQUIRED", "READY"].includes(value.status as string) || !counts(value.counts) || (value.status === "READY" && value.deadLetterAttentionRequired) || (value.status === "ATTENTION_REQUIRED" && !value.deadLetterAttentionRequired)) return invalid("Production Runtime health report is invalid");
    return valid(value as unknown as ProductionRuntimeHealthReport);
  }
}

export class ProductionRuntimeRunResultValidator implements Validator<ProductionRuntimeRunResult> {
  readonly #job = new ProductionRuntimeJobValidator();
  public validate(value: unknown): ValidationResult<ProductionRuntimeRunResult> {
    const expected = record(value) && value.job === undefined ? ["contractVersion", "recoveredExpiredClaims", "status", "unauthorizedExternalEffectOccurred"] : ["contractVersion", "job", "recoveredExpiredClaims", "status", "unauthorizedExternalEffectOccurred"];
    if (!record(value) || !keys(value, expected) || value.contractVersion !== "1" || value.unauthorizedExternalEffectOccurred !== false || !count(value.recoveredExpiredClaims, 0, 25) || !["COMPLETED", "DEAD_LETTER", "IDLE", "RETRY_SCHEDULED"].includes(value.status as string) || (value.job !== undefined && !this.#job.validate(value.job).ok) || (value.status === "IDLE" && value.job !== undefined) || (value.status !== "IDLE" && value.job === undefined)) return invalid("Production Runtime run result is invalid");
    return valid(value as unknown as ProductionRuntimeRunResult);
  }
}

function statusShape(value: Record<string, unknown>): boolean {
  const status = value.status;
  const error = value.lastError;
  const result = value.result;
  const lease = value.leaseExpiresAt;
  if (!["COMPLETED", "DEAD_LETTER", "QUEUED", "RETRY_SCHEDULED", "RUNNING"].includes(status as string)) return false;
  if (error !== undefined && (!record(error) || !keys(error, ["code", "occurredAt"]) || !["lease_expired", "runtime_execution_failed"].includes(error.code as string) || !timestamp(error.occurredAt))) return false;
  if (result !== undefined && (!record(result) || !keys(result, ["productionId"]) || !identifier(result.productionId))) return false;
  if (lease !== undefined && !timestamp(lease)) return false;
  if (status === "QUEUED") return value.attempt === 0 && error === undefined && result === undefined && lease === undefined;
  if (status === "RUNNING") return value.attempt !== 0 && error === undefined && result === undefined && typeof lease === "string";
  if (status === "COMPLETED") return value.attempt !== 0 && error === undefined && lease === undefined && result !== undefined;
  if (status === "RETRY_SCHEDULED") return value.attempt !== 0 && error !== undefined && lease === undefined && result === undefined && (value.attempt as number) < (value.maxAttempts as number);
  return value.attempt === value.maxAttempts && error !== undefined && lease === undefined && result === undefined;
}
function counts(value: unknown): boolean { return record(value) && keys(value, ["completed", "deadLetter", "queued", "retryScheduled", "running"]) && Object.values(value).every((count_) => count(count_, 0, 1_000_000)); }
function count(value: unknown, min: number, max: number): boolean { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max; }
function timestamp(value: unknown): value is string { return typeof value === "string" && TIMESTAMP.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function valid<T>(value: T): ValidationResult<T> { return validationSuccess(freeze(structuredClone(value))); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
