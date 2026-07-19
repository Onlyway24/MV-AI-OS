import type { JsonObject } from "../contracts/json.js";
import type { OnlywayBusinessTimeZone } from "../contracts/business-calendar.js";
import type { AgentCompanyWorkdayInput } from "../agent-company/operational-agent-company.js";

export const OPERATIONS_RUNTIME_CONTRACT_VERSION = "1" as const;

export const OPERATIONS_JOB_TYPES = Object.freeze([
  "MORNING_SYSTEM_BRIEF",
  "AGENT_COMPANY_WORKDAY_START",
  "SOCIAL_SIGNAL_REFRESH",
  "EVIDENCE_FRESHNESS_CHECK",
  "PENDING_APPROVAL_REMINDER",
  "PRODUCTION_QUEUE_RECONCILIATION",
  "COST_AND_BUDGET_CHECK",
  "BACKUP_AND_RESTORE_VERIFICATION",
  "STALE_TASK_DETECTION",
  "DAILY_OPERATING_REPORT",
  "SECURITY_POSTURE_CHECK",
] as const);

export type OperationsJobType = typeof OPERATIONS_JOB_TYPES[number];
export type OperationsJobStatus = "BLOCKED" | "CANCELLED" | "COMPLETED" | "DEAD_LETTER" | "FAILED" | "QUEUED" | "RETRY_SCHEDULED" | "RUNNING";

export type OperationsJobPayload =
  | Readonly<{ readonly businessDate: string }>
  | Readonly<{ readonly budgetCents: number; readonly workday?: AgentCompanyWorkdayInput; readonly workdayId: string }>
  | Readonly<{ readonly mode: "LOCAL_RECONCILIATION" }>
  | Readonly<Record<never, never>>
  | Readonly<{ readonly delivery: "CONTROL_CENTER_ONLY" }>
  | Readonly<{ readonly recoveryLimit: number }>
  | Readonly<{ readonly window: "TODAY" }>
  | Readonly<{ readonly backupPolicyId: string }>
  | Readonly<{ readonly staleAfterSeconds: number }>;

export interface OperationsJobBudget {
  readonly maxCostCents: number;
  readonly maxProviderCalls: number;
  readonly maxToolCalls: number;
}

export interface OperationsRetryPolicy {
  readonly automaticRetries: number;
  readonly initialBackoffMs: number;
  readonly maxBackoffMs: number;
}

export interface OperationsJobLease {
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly fencingToken: number;
  readonly heartbeatAt: string;
  readonly leaseId: string;
  readonly workerId: string;
}

export interface OperationsJobFailure {
  readonly code: "CANCELLED" | "EXECUTION_FAILED" | "LEASE_EXPIRED" | "TIMEOUT";
  readonly occurredAt: string;
  readonly retryable: boolean;
}

export const OPERATIONS_JOB_BLOCK_CODES = Object.freeze([
  "AGENT_COMPANY_INPUT_REQUIRED",
  "APPROVAL_REMINDER_COVERAGE_REQUIRED",
  "BACKUP_RESTORE_RECEIPT_REQUIRED",
  "COST_GATE_BLOCKED",
  "COST_LEDGER_COVERAGE_REQUIRED",
  "DEPENDENCY_NOT_COMPLETED",
  "EVIDENCE_FRESHNESS_COVERAGE_REQUIRED",
  "EXECUTOR_OUTPUT_UNVERIFIED",
  "QUALITY_GATE_BLOCKED",
  "RISK_GATE_BLOCKED",
  "SECURITY_POSTURE_COVERAGE_REQUIRED",
  "STALE_TASK_COVERAGE_REQUIRED",
] as const);

export interface OperationsJobBlock {
  readonly code: typeof OPERATIONS_JOB_BLOCK_CODES[number];
  readonly occurredAt: string;
}

export type OperationsJobReasonCode = OperationsJobFailure["code"] | OperationsJobBlock["code"];

export interface OperationsJobReceipt {
  readonly attempt: number;
  readonly costCents: number;
  readonly externalEffectsExecuted: false;
  readonly outcome: "BLOCKED" | "CANCELLED" | "COMPLETED" | "DEAD_LETTER" | "FAILED" | "RETRY_SCHEDULED";
  readonly receiptId: string;
  readonly recordedAt: string;
  readonly providerCalls: number;
  readonly reasonCode?: OperationsJobReasonCode;
  readonly resultRef?: string;
  readonly toolCalls: number;
}

export interface OperationsJob {
  readonly actorId: string;
  readonly attempt: number;
  readonly budget: OperationsJobBudget;
  readonly block?: OperationsJobBlock;
  readonly cancellationRequestedAt?: string;
  readonly cancellationRequestedBy?: string;
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly heartbeatIntervalMs: number;
  readonly jobId: string;
  readonly jobType: OperationsJobType;
  readonly lastFailure?: OperationsJobFailure;
  readonly lease?: OperationsJobLease;
  readonly leaseDurationMs: number;
  readonly operationIdentity: string;
  readonly owner: string;
  readonly payload: OperationsJobPayload;
  readonly payloadFingerprint: string;
  readonly predecessorJobId?: string;
  readonly priority: number;
  readonly receipt?: OperationsJobReceipt;
  readonly recoveryStrategy: "RETRY_OR_DEAD_LETTER";
  readonly retryPolicy: OperationsRetryPolicy;
  readonly runAfter: string;
  readonly scheduleId?: string;
  readonly scheduledFor: string;
  readonly status: OperationsJobStatus;
  readonly timeoutMs: number;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface OperationsJobAttempt {
  readonly attempt: number;
  readonly attemptId: string;
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly costCents: number;
  readonly externalEffectsExecuted: false;
  readonly finishedAt: string;
  readonly jobId: string;
  readonly outcome: OperationsJobReceipt["outcome"];
  readonly providerCalls: number;
  readonly reasonCode?: OperationsJobReasonCode;
  readonly resultRef?: string;
  readonly startedAt: string;
  readonly toolCalls: number;
  readonly workspaceId: string;
}

/** Redaction-safe projection for dashboards and operating briefs. */
export interface OperationsJobSummary {
  readonly attempt: number;
  readonly blockCode?: OperationsJobBlock["code"];
  readonly failureCode?: OperationsJobFailure["code"];
  readonly jobId: string;
  readonly jobType: OperationsJobType;
  readonly owner: string;
  readonly predecessorJobId?: string;
  readonly priority: number;
  readonly receipt?: Readonly<{
    readonly costCents: number;
    readonly externalEffectsExecuted: false;
    readonly outcome: OperationsJobReceipt["outcome"];
    readonly providerCalls: number;
    readonly toolCalls: number;
  }>;
  readonly runAfter: string;
  readonly scheduledFor: string;
  readonly status: OperationsJobStatus;
  readonly targetFingerprint: string;
  readonly updatedAt: string;
  readonly version: number;
}

/**
 * Durable one-shot reservation for an operator-created successor. The record is
 * retained even when the successor job itself is removed by retention.
 */
export interface OperationsJobSuccessor {
  readonly predecessorJobId: string;
  readonly successorJobId: string;
  readonly workspaceId: string;
}

/** Cumulative measured usage from durable attempt receipts. */
export interface OperationsRuntimeUsageSummary {
  readonly attempts: number;
  readonly costCents: number;
  readonly externalEffectsExecuted: false;
  readonly providerCalls: number;
  readonly toolCalls: number;
}

export type OperationsScheduleCadence =
  | Readonly<{ readonly kind: "ONCE" }>
  | Readonly<{ readonly intervalMs: number; readonly kind: "FIXED_INTERVAL" }>
  | Readonly<{
    readonly hour: number;
    readonly kind: "CALENDAR_DAILY";
    readonly minute: number;
    readonly timeZone: OnlywayBusinessTimeZone;
  }>;

export interface OperationsSchedule {
  readonly actorId: string;
  readonly budget: OperationsJobBudget;
  readonly cadence: OperationsScheduleCadence;
  readonly catchUpPolicy: "CATCH_UP_ONE" | "SKIP";
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly heartbeatIntervalMs: number;
  readonly jobType: OperationsJobType;
  readonly leaseDurationMs: number;
  readonly nextRunAt: string;
  readonly owner: string;
  readonly payload: OperationsJobPayload;
  readonly payloadFingerprint: string;
  readonly priority: number;
  readonly retryPolicy: OperationsRetryPolicy;
  readonly scheduleId: string;
  readonly status: "DISABLED" | "ENABLED";
  readonly timeoutMs: number;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface OperationsRuntimeControl {
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly killSwitch: "ACTIVE" | "RELEASED";
  readonly maintenanceMode: "DISABLED" | "ENABLED";
  readonly reasonCode: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface OperationsProcessLease {
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly expiresAt: string;
  readonly fencingToken: number;
  readonly heartbeatAt: string;
  readonly instanceId: string;
  readonly leaseKey: string;
  readonly role: "SCHEDULER" | "WORKER";
  readonly version: number;
  readonly workspaceId: string;
}

export interface OperationsRuntimeCounts {
  readonly blocked: number;
  readonly cancelled: number;
  readonly completed: number;
  readonly deadLetter: number;
  readonly failed: number;
  readonly queued: number;
  readonly retryScheduled: number;
  readonly running: number;
}

export interface OperationsRuntimeHealthReport {
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly control: Readonly<{ readonly killSwitch: OperationsRuntimeControl["killSwitch"]; readonly maintenanceMode: OperationsRuntimeControl["maintenanceMode"] }>;
  readonly counts: OperationsRuntimeCounts;
  readonly generatedAt: string;
  readonly scheduler: "MISSING" | "READY" | "STALE";
  readonly status: "ATTENTION_REQUIRED" | "READY" | "STOPPED";
  readonly unauthorizedExternalEffectOccurred: false;
  readonly workers: Readonly<{ readonly active: number; readonly stale: number }>;
}

export interface OperationsExecutionResult {
  readonly blocked?: Readonly<{ readonly reasonCode: OperationsJobBlock["code"] }>;
  readonly costCents: number;
  readonly externalEffectsExecuted: false;
  readonly providerCalls: number;
  readonly resultRef?: string;
  readonly toolCalls: number;
}

export interface OperationsJobHandlerContext {
  assertCanStartExternalAction(): Promise<void>;
  readonly signal: AbortSignal;
}

export interface OperationsJobHandler {
  execute(job: OperationsJob, context: OperationsJobHandlerContext): Promise<OperationsExecutionResult>;
}

export interface OperationsJobHandlerRegistry {
  resolve(jobType: OperationsJobType): OperationsJobHandler;
}

export interface OperationsWorkerRunResult {
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly job?: OperationsJob;
  readonly recoveredExpiredClaims: number;
  readonly status: "BLOCKED" | "CANCELLED" | "COMPLETED" | "DEAD_LETTER" | "FAILED" | "IDLE" | "RETRY_SCHEDULED" | "STOPPED";
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface OperationsSchedulerTickResult {
  readonly contractVersion: typeof OPERATIONS_RUNTIME_CONTRACT_VERSION;
  readonly enqueuedJobIds: readonly string[];
  readonly skippedOccurrences: number;
  readonly status: "IDLE" | "LEASE_HELD" | "SCHEDULED" | "STOPPED";
  readonly unauthorizedExternalEffectOccurred: false;
}

export function isOperationsJobTransitionAllowed(from: OperationsJobStatus, to: OperationsJobStatus): boolean {
  if (from === "QUEUED" || from === "RETRY_SCHEDULED") return to === "CANCELLED" || to === "RUNNING";
  if (from === "RUNNING") return ["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED", "RETRY_SCHEDULED", "RUNNING"].includes(to);
  return false;
}

export function operationsPayloadAsJson(payload: OperationsJobPayload): JsonObject {
  return payload as unknown as JsonObject;
}
