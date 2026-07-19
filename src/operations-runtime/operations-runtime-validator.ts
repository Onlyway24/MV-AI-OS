import { createHash } from "node:crypto";

import { AgentCompanyWorkdayInputValidator } from "../agent-company/operational-agent-company-validator.js";
import { isBusinessDate, ONLYWAY_BUSINESS_TIME_ZONE } from "../contracts/business-calendar.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import {
  OPERATIONS_JOB_BLOCK_CODES,
  OPERATIONS_JOB_TYPES,
  type OperationsJob,
  type OperationsJobAttempt,
  type OperationsJobBlock,
  type OperationsJobBudget,
  type OperationsJobPayload,
  type OperationsJobReceipt,
  type OperationsJobType,
  type OperationsProcessLease,
  type OperationsRetryPolicy,
  type OperationsRuntimeControl,
  type OperationsSchedule,
} from "./operations-runtime.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const RAW_SECRET = /(?:\bsk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/iu;
const AGENT_COMPANY_INPUT_VALIDATOR = new AgentCompanyWorkdayInputValidator();

export class OperationsJobValidator implements Validator<OperationsJob> {
  public validate(value: unknown): ValidationResult<OperationsJob> {
    if (!record(value)) return invalid("Operations job is invalid");
    const optional = ["block", "cancellationRequestedAt", "cancellationRequestedBy", "lastFailure", "lease", "predecessorJobId", "receipt", "scheduleId"].filter((key) => value[key] !== undefined);
    if (!keys(value, ["actorId", "attempt", "budget", "contractVersion", "createdAt", "heartbeatIntervalMs", "jobId", "jobType", "leaseDurationMs", "operationIdentity", "owner", "payload", "payloadFingerprint", "priority", "recoveryStrategy", "retryPolicy", "runAfter", "scheduledFor", "status", "timeoutMs", "updatedAt", "version", "workspaceId", ...optional]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.owner) || !id(value.jobId) || !id(value.operationIdentity) || !jobType(value.jobType) || !payload(value.jobType, value.payload) || createOperationsPayloadFingerprint(value.payload) !== value.payloadFingerprint || !hash(value.payloadFingerprint) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !timestamp(value.runAfter) || !timestamp(value.scheduledFor) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !integer(value.attempt, 0, 100) || !integer(value.priority, 0, 100) || !duration(value.timeoutMs, 1, 86_400_000) || !duration(value.leaseDurationMs, 1_000, 86_400_000) || !duration(value.heartbeatIntervalMs, 250, 3_600_000) || value.heartbeatIntervalMs >= value.leaseDurationMs || !budget(value.budget) || !retry(value.retryPolicy) || value.recoveryStrategy !== "RETRY_OR_DEAD_LETTER" || !jobStatus(value.status) || !optionalId(value.scheduleId) || !optionalId(value.predecessorJobId) || !block(value.block) || !failure(value.lastFailure) || !lease(value.lease) || !receipt(value.receipt) || !cancellation(value) || !statusShape(value)) return invalid("Operations job is invalid");
    return success(value as unknown as OperationsJob);
  }
}

export class OperationsJobAttemptValidator implements Validator<OperationsJobAttempt> {
  public validate(value: unknown): ValidationResult<OperationsJobAttempt> {
    const optional = record(value) ? ["reasonCode", "resultRef"].filter((key) => value[key] !== undefined) : [];
    if (!record(value) || !keys(value, ["attempt", "attemptId", "contractVersion", "costCents", "externalEffectsExecuted", "finishedAt", "jobId", "outcome", "providerCalls", "startedAt", "toolCalls", "workspaceId", ...optional]) || value.contractVersion !== "1" || !id(value.attemptId) || !id(value.jobId) || !id(value.workspaceId) || !integer(value.attempt, 1, 100) || !integer(value.costCents, 0, 1_000_000_000) || !integer(value.providerCalls, 0, 100) || !integer(value.toolCalls, 0, 1_000) || value.externalEffectsExecuted !== false || !receiptOutcome(value.outcome) || !timestamp(value.startedAt) || !timestamp(value.finishedAt) || (value.reasonCode !== undefined && !reasonCode(value.reasonCode)) || (value.outcome === "BLOCKED" ? !blockCode(value.reasonCode) : blockCode(value.reasonCode)) || !optionalId(value.resultRef)) return invalid("Operations job attempt is invalid");
    return success(value as unknown as OperationsJobAttempt);
  }
}

export class OperationsScheduleValidator implements Validator<OperationsSchedule> {
  public validate(value: unknown): ValidationResult<OperationsSchedule> {
    if (!record(value) || !keys(value, ["actorId", "budget", "cadence", "catchUpPolicy", "contractVersion", "createdAt", "heartbeatIntervalMs", "jobType", "leaseDurationMs", "nextRunAt", "owner", "payload", "payloadFingerprint", "priority", "retryPolicy", "scheduleId", "status", "timeoutMs", "updatedAt", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.scheduleId) || !id(value.workspaceId) || !id(value.actorId) || !id(value.owner) || !jobType(value.jobType) || !payload(value.jobType, value.payload) || !hash(value.payloadFingerprint) || createOperationsPayloadFingerprint(value.payload) !== value.payloadFingerprint || !budget(value.budget) || !retry(value.retryPolicy) || !cadence(value.cadence) || !scheduleCatchUp(value.catchUpPolicy) || !scheduleStatus(value.status) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !timestamp(value.nextRunAt) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !integer(value.priority, 0, 100) || !duration(value.timeoutMs, 1, 86_400_000) || !duration(value.leaseDurationMs, 1_000, 86_400_000) || !duration(value.heartbeatIntervalMs, 250, 3_600_000) || value.heartbeatIntervalMs >= value.leaseDurationMs) return invalid("Operations schedule is invalid");
    return success(value as unknown as OperationsSchedule);
  }
}

export class OperationsRuntimeControlValidator implements Validator<OperationsRuntimeControl> {
  public validate(value: unknown): ValidationResult<OperationsRuntimeControl> {
    if (!record(value) || !keys(value, ["contractVersion", "killSwitch", "maintenanceMode", "reasonCode", "updatedAt", "updatedBy", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.workspaceId) || !id(value.updatedBy) || !CODE.test(String(value.reasonCode)) || !["ACTIVE", "RELEASED"].includes(String(value.killSwitch)) || !["DISABLED", "ENABLED"].includes(String(value.maintenanceMode)) || !timestamp(value.updatedAt) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER)) return invalid("Operations runtime control is invalid");
    return success(value as unknown as OperationsRuntimeControl);
  }
}

export class OperationsProcessLeaseValidator implements Validator<OperationsProcessLease> {
  public validate(value: unknown): ValidationResult<OperationsProcessLease> {
    if (!record(value) || !keys(value, ["contractVersion", "expiresAt", "fencingToken", "heartbeatAt", "instanceId", "leaseKey", "role", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.workspaceId) || !id(value.instanceId) || !id(value.leaseKey) || !processRole(value.role) || !timestamp(value.heartbeatAt) || !timestamp(value.expiresAt) || Date.parse(value.expiresAt) <= Date.parse(value.heartbeatAt) || !integer(value.fencingToken, 1, Number.MAX_SAFE_INTEGER) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER)) return invalid("Operations process lease is invalid");
    return success(value as unknown as OperationsProcessLease);
  }
}

export function createOperationsPayloadFingerprint(value: OperationsJobPayload): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function payload(jobType: OperationsJobType, value: unknown): value is OperationsJobPayload {
  if (!record(value) || JSON.stringify(value).length > 262_144 || RAW_SECRET.test(JSON.stringify(value))) return false;
  switch (jobType) {
    case "MORNING_SYSTEM_BRIEF":
    case "DAILY_OPERATING_REPORT": return keys(value, ["businessDate"]) && isBusinessDate(value.businessDate);
    case "AGENT_COMPANY_WORKDAY_START": {
      const optionalWorkday = value.workday === undefined ? [] : ["workday"];
      return keys(value, ["budgetCents", "workdayId", ...optionalWorkday])
        && integer(value.budgetCents, 0, 1_000_000_000)
        && id(value.workdayId)
        && (value.workday === undefined || AGENT_COMPANY_INPUT_VALIDATOR.validate(value.workday).ok);
    }
    case "SOCIAL_SIGNAL_REFRESH": return keys(value, ["mode"]) && value.mode === "LOCAL_RECONCILIATION";
    case "EVIDENCE_FRESHNESS_CHECK":
    case "SECURITY_POSTURE_CHECK": return keys(value, []);
    case "PENDING_APPROVAL_REMINDER": return keys(value, ["delivery"]) && value.delivery === "CONTROL_CENTER_ONLY";
    case "PRODUCTION_QUEUE_RECONCILIATION": return keys(value, ["recoveryLimit"]) && integer(value.recoveryLimit, 1, 25);
    case "COST_AND_BUDGET_CHECK": return keys(value, ["window"]) && value.window === "TODAY";
    case "BACKUP_AND_RESTORE_VERIFICATION": return keys(value, ["backupPolicyId"]) && id(value.backupPolicyId);
    case "STALE_TASK_DETECTION": return keys(value, ["staleAfterSeconds"]) && integer(value.staleAfterSeconds, 60, 2_592_000);
  }
}

function statusShape(value: Record<string, unknown>): boolean {
  const status = value.status;
  const attempt = value.attempt as number;
  if (status === "QUEUED") return attempt === 0 && value.block === undefined && value.lease === undefined && value.lastFailure === undefined && value.receipt === undefined && value.cancellationRequestedAt === undefined;
  if (status === "RUNNING") return attempt >= 1 && value.block === undefined && value.lease !== undefined && value.receipt === undefined && value.lastFailure === undefined;
  if (status === "RETRY_SCHEDULED") return attempt >= 1 && value.block === undefined && value.lease === undefined && record(value.lastFailure) && value.lastFailure.retryable === true && record(value.receipt) && value.receipt.outcome === "RETRY_SCHEDULED";
  if (status === "BLOCKED") return attempt >= 1 && value.lease === undefined && record(value.block) && value.lastFailure === undefined && record(value.receipt) && value.receipt.outcome === "BLOCKED" && value.receipt.reasonCode === value.block.code;
  if (status === "COMPLETED") return attempt >= 1 && value.block === undefined && value.lease === undefined && value.lastFailure === undefined && record(value.receipt) && value.receipt.outcome === "COMPLETED";
  if (status === "FAILED") return attempt >= 1 && value.block === undefined && value.lease === undefined && record(value.lastFailure) && record(value.receipt) && value.receipt.outcome === "FAILED";
  if (status === "DEAD_LETTER") return attempt >= 1 && value.block === undefined && value.lease === undefined && record(value.lastFailure) && record(value.receipt) && value.receipt.outcome === "DEAD_LETTER";
  return value.block === undefined && value.lease === undefined && record(value.receipt) && value.receipt.outcome === "CANCELLED";
}

function cancellation(value: Record<string, unknown>): boolean {
  const hasAt = value.cancellationRequestedAt !== undefined;
  const hasBy = value.cancellationRequestedBy !== undefined;
  return hasAt === hasBy && (!hasAt || (timestamp(value.cancellationRequestedAt) && id(value.cancellationRequestedBy)));
}

function budget(value: unknown): value is OperationsJobBudget { return record(value) && keys(value, ["maxCostCents", "maxProviderCalls", "maxToolCalls"]) && integer(value.maxCostCents, 0, 1_000_000_000) && integer(value.maxProviderCalls, 0, 100) && integer(value.maxToolCalls, 0, 1_000); }
function block(value: unknown): boolean { return value === undefined || (record(value) && keys(value, ["code", "occurredAt"]) && blockCode(value.code) && timestamp(value.occurredAt)); }
function retry(value: unknown): value is OperationsRetryPolicy { return record(value) && keys(value, ["automaticRetries", "initialBackoffMs", "maxBackoffMs"]) && integer(value.automaticRetries, 0, 10) && duration(value.initialBackoffMs, 1_000, 86_400_000) && duration(value.maxBackoffMs, value.initialBackoffMs, 86_400_000); }
function cadence(value: unknown): boolean {
  return record(value) && (
    (keys(value, ["kind"]) && value.kind === "ONCE")
    || (keys(value, ["intervalMs", "kind"]) && value.kind === "FIXED_INTERVAL" && duration(value.intervalMs, 60_000, 31_536_000_000))
    || (keys(value, ["hour", "kind", "minute", "timeZone"])
      && value.kind === "CALENDAR_DAILY"
      && integer(value.hour, 0, 23)
      && integer(value.minute, 0, 59)
      && value.timeZone === ONLYWAY_BUSINESS_TIME_ZONE)
  );
}
function failure(value: unknown): boolean { return value === undefined || (record(value) && keys(value, ["code", "occurredAt", "retryable"]) && failureCode(value.code) && timestamp(value.occurredAt) && typeof value.retryable === "boolean"); }
function lease(value: unknown): boolean { return value === undefined || (record(value) && keys(value, ["acquiredAt", "expiresAt", "fencingToken", "heartbeatAt", "leaseId", "workerId"]) && id(value.leaseId) && id(value.workerId) && timestamp(value.acquiredAt) && timestamp(value.heartbeatAt) && timestamp(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.heartbeatAt) && integer(value.fencingToken, 1, Number.MAX_SAFE_INTEGER)); }
function receipt(value: unknown): value is OperationsJobReceipt | undefined { if (value === undefined) return true; const optional = record(value) ? ["reasonCode", "resultRef"].filter((key) => value[key] !== undefined) : []; return record(value) && keys(value, ["attempt", "costCents", "externalEffectsExecuted", "outcome", "providerCalls", "receiptId", "recordedAt", "toolCalls", ...optional]) && integer(value.attempt, 0, 100) && integer(value.costCents, 0, 1_000_000_000) && integer(value.providerCalls, 0, 100) && integer(value.toolCalls, 0, 1_000) && value.externalEffectsExecuted === false && receiptOutcome(value.outcome) && (value.reasonCode === undefined || reasonCode(value.reasonCode)) && (value.outcome === "BLOCKED" ? blockCode(value.reasonCode) : value.reasonCode === undefined) && id(value.receiptId) && timestamp(value.recordedAt) && optionalId(value.resultRef); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function success<T>(value: T): ValidationResult<T> { return validationSuccess(freeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function failureCode(value: unknown): value is NonNullable<OperationsJob["lastFailure"]>["code"] { return typeof value === "string" && ["CANCELLED", "EXECUTION_FAILED", "LEASE_EXPIRED", "TIMEOUT"].includes(value); }
function jobStatus(value: unknown): value is OperationsJob["status"] { return typeof value === "string" && ["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED", "QUEUED", "RETRY_SCHEDULED", "RUNNING"].includes(value); }
function jobType(value: unknown): value is OperationsJobType { return typeof value === "string" && (OPERATIONS_JOB_TYPES as readonly string[]).includes(value); }
function processRole(value: unknown): value is OperationsProcessLease["role"] { return value === "SCHEDULER" || value === "WORKER"; }
function blockCode(value: unknown): value is OperationsJobBlock["code"] { return typeof value === "string" && (OPERATIONS_JOB_BLOCK_CODES as readonly string[]).includes(value); }
function reasonCode(value: unknown): boolean { return failureCode(value) || blockCode(value); }
function receiptOutcome(value: unknown): value is OperationsJobReceipt["outcome"] { return typeof value === "string" && ["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED", "RETRY_SCHEDULED"].includes(value); }
function scheduleCatchUp(value: unknown): value is OperationsSchedule["catchUpPolicy"] { return value === "CATCH_UP_ONE" || value === "SKIP"; }
function scheduleStatus(value: unknown): value is OperationsSchedule["status"] { return value === "DISABLED" || value === "ENABLED"; }
function optionalId(value: unknown): boolean { return value === undefined || id(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)); }
function integer(value: unknown, minimum: number, maximum: number): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function duration(value: unknown, minimum: number, maximum: number): value is number { return integer(value, minimum, maximum); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
