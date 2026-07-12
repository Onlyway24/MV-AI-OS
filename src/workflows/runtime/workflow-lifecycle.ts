import { createHash } from "node:crypto";

import type { ValidationResult, Validator } from "../../validation/validation.js";
import { validationFailure, validationSuccess } from "../../validation/validation.js";

export const WORKFLOW_LIFECYCLE_CONTRACT_VERSION = "1" as const;

export type WorkflowFailureCategory =
  | "TIMEOUT"
  | "TRANSIENT_RUNTIME"
  | "VALIDATION"
  | "POLICY"
  | "SAFETY"
  | "PERMANENT";

export type WorkflowLifecycleRecordKind = "CANCELLATION" | "FAILURE" | "PAUSE" | "RESUME" | "RETRY_AUTHORIZATION" | "RETRY_EXECUTION" | "TIMEOUT_EVALUATION";
export type WorkflowRetryDecision = "AUTHORIZED" | "DENIED_EXHAUSTED" | "DENIED_NON_RETRYABLE";
export type WorkflowControlAction = "CANCEL" | "PAUSE" | "RESUME";

export interface WorkflowControlRequest {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly controlId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly action: WorkflowControlAction;
  readonly reasonCode: string;
}

export interface WorkflowTimeoutEvaluationRequest {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly evaluationId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly stepId: string;
  readonly invocationId: string;
  readonly timeoutMs: number;
}

export interface WorkflowFailureRequest {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly failureId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly stepId: string;
  readonly invocationId: string;
  readonly category: WorkflowFailureCategory;
  readonly maxAttempts: number;
  readonly reasonCode: string;
}

export interface WorkflowRetryAuthorizationRequest {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly authorizationId: string;
  readonly actorId: string;
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly stepId: string;
  readonly failureId: string;
}

export interface WorkflowRetryExecutionRequest {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly executionId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly instanceId: string;
  readonly expectedVersion: number;
  readonly stepId: string;
  readonly failureId: string;
  readonly authorizationId: string;
}

export interface WorkflowLifecycleRecord {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly recordId: string;
  readonly fingerprint: string;
  readonly kind: WorkflowLifecycleRecordKind;
  readonly actorId: string;
  readonly definitionId: string;
  readonly workflowVersion: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly stepId: string;
  readonly recordedAt: string;
  readonly externalEffects: false;
  readonly invocationId?: string;
  readonly failureId?: string;
  readonly authorizationId?: string;
  readonly category?: WorkflowFailureCategory;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly retryable?: boolean;
  readonly retryDecision?: WorkflowRetryDecision;
  readonly timeoutMs?: number;
  readonly recoveryInstructions: readonly string[];
}

export interface WorkflowLifecycleEvent {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly eventId: string;
  readonly recordId: string;
  readonly instanceId: string;
  readonly stepId: string;
  readonly kind: WorkflowLifecycleRecordKind;
  readonly occurredAt: string;
  readonly summaryCode: "workflow_cancellation_recorded" | "workflow_failure_recorded" | "workflow_pause_recorded" | "workflow_resume_recorded" | "workflow_retry_authorization_recorded" | "workflow_retry_execution_recorded" | "workflow_timeout_evaluated";
  readonly externalEffects: false;
}

export interface WorkflowLifecycleResult {
  readonly contractVersion: typeof WORKFLOW_LIFECYCLE_CONTRACT_VERSION;
  readonly record: WorkflowLifecycleRecord;
  readonly replayed: boolean;
}

export interface WorkflowLifecycleService {
  controlWorkflow(request: WorkflowControlRequest): Promise<WorkflowLifecycleResult>;
  evaluateTimeout(request: WorkflowTimeoutEvaluationRequest): Promise<WorkflowLifecycleResult>;
  recordFailure(request: WorkflowFailureRequest): Promise<WorkflowLifecycleResult>;
  authorizeRetry(request: WorkflowRetryAuthorizationRequest): Promise<WorkflowLifecycleResult>;
  executeRetry(request: WorkflowRetryExecutionRequest): Promise<WorkflowLifecycleResult>;
}

export class WorkflowTimeoutEvaluationRequestValidator implements Validator<WorkflowTimeoutEvaluationRequest> {
  public validate(value: unknown): ValidationResult<WorkflowTimeoutEvaluationRequest> {
    if (!record(value) || !onlyKeys(value, ["actorId", "commandId", "contractVersion", "evaluationId", "expectedVersion", "instanceId", "invocationId", "stepId", "timeoutMs"]) || value.contractVersion !== "1" || !ids(value, ["actorId", "commandId", "evaluationId", "instanceId", "invocationId", "stepId"]) || !version(value.expectedVersion) || !boundedTimeout(value.timeoutMs)) return invalid("Workflow timeout evaluation request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowTimeoutEvaluationRequest)));
  }
}

export class WorkflowControlRequestValidator implements Validator<WorkflowControlRequest> {
  public validate(value: unknown): ValidationResult<WorkflowControlRequest> {
    if (!record(value) || !onlyKeys(value, ["action", "actorId", "commandId", "contractVersion", "controlId", "expectedVersion", "instanceId", "reasonCode"]) || value.contractVersion !== "1" || !ids(value, ["actorId", "commandId", "controlId", "instanceId", "reasonCode"]) || !version(value.expectedVersion) || !CONTROL_ACTIONS.has(value.action as string)) return invalid("Workflow control request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowControlRequest)));
  }
}

export class WorkflowFailureRequestValidator implements Validator<WorkflowFailureRequest> {
  public validate(value: unknown): ValidationResult<WorkflowFailureRequest> {
    if (!record(value) || !onlyKeys(value, ["actorId", "category", "commandId", "contractVersion", "expectedVersion", "failureId", "instanceId", "invocationId", "maxAttempts", "reasonCode", "stepId"]) || value.contractVersion !== "1" || !ids(value, ["actorId", "commandId", "failureId", "instanceId", "invocationId", "reasonCode", "stepId"]) || !version(value.expectedVersion) || !attemptLimit(value.maxAttempts) || !FAILURE_CATEGORIES.has(value.category as string)) return invalid("Workflow failure request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowFailureRequest)));
  }
}

export class WorkflowRetryAuthorizationRequestValidator implements Validator<WorkflowRetryAuthorizationRequest> {
  public validate(value: unknown): ValidationResult<WorkflowRetryAuthorizationRequest> {
    if (!record(value) || !onlyKeys(value, ["actorId", "authorizationId", "contractVersion", "expectedVersion", "failureId", "instanceId", "stepId"]) || value.contractVersion !== "1" || !ids(value, ["actorId", "authorizationId", "failureId", "instanceId", "stepId"]) || !version(value.expectedVersion)) return invalid("Workflow retry authorization request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowRetryAuthorizationRequest)));
  }
}

export class WorkflowRetryExecutionRequestValidator implements Validator<WorkflowRetryExecutionRequest> {
  public validate(value: unknown): ValidationResult<WorkflowRetryExecutionRequest> {
    if (!record(value) || !onlyKeys(value, ["actorId", "authorizationId", "commandId", "contractVersion", "executionId", "expectedVersion", "failureId", "instanceId", "stepId"]) || value.contractVersion !== "1" || !ids(value, ["actorId", "authorizationId", "commandId", "executionId", "failureId", "instanceId", "stepId"]) || !version(value.expectedVersion)) return invalid("Workflow retry execution request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowRetryExecutionRequest)));
  }
}

export class WorkflowLifecycleRecordValidator implements Validator<WorkflowLifecycleRecord> {
  public validate(value: unknown): ValidationResult<WorkflowLifecycleRecord> {
    if (!record(value) || !lifecycleRecordKeys(value) || value.contractVersion !== "1" || !ids(value, ["actorId", "definitionId", "fingerprint", "instanceId", "recordId", "stepId", "workflowVersion"]) || !fingerprint(value.fingerprint) || !version(value.instanceVersion) || !timestamp(value.recordedAt) || value.externalEffects !== false || !instructions(value.recoveryInstructions) || !["CANCELLATION", "FAILURE", "PAUSE", "RESUME", "RETRY_AUTHORIZATION", "RETRY_EXECUTION", "TIMEOUT_EVALUATION"].includes(value.kind as string)) return invalid("Workflow lifecycle record is invalid");
    if (value.kind === "FAILURE" && (!safeId(value.invocationId) || value.failureId !== undefined || value.authorizationId !== undefined || !FAILURE_CATEGORIES.has(value.category as string) || !positive(value.attempt) || !attemptLimit(value.maxAttempts) || typeof value.retryable !== "boolean" || value.retryDecision !== undefined || (value.category === "TIMEOUT" ? !boundedTimeout(value.timeoutMs) : value.timeoutMs !== undefined))) return invalid("Workflow failure record is invalid");
    if (value.kind === "RETRY_AUTHORIZATION" && (!safeId(value.failureId) || value.authorizationId !== undefined || value.invocationId !== undefined || value.category !== undefined || value.attempt !== undefined || value.maxAttempts !== undefined || value.retryable !== undefined || !RETRY_DECISIONS.has(value.retryDecision as string) || value.timeoutMs !== undefined)) return invalid("Workflow retry authorization record is invalid");
    if (value.kind === "RETRY_EXECUTION" && (!safeId(value.failureId) || !safeId(value.authorizationId) || value.invocationId !== undefined || value.category !== undefined || value.attempt !== undefined || value.maxAttempts !== undefined || value.retryable !== undefined || value.retryDecision !== undefined || value.timeoutMs !== undefined)) return invalid("Workflow retry execution record is invalid");
    if ((value.kind === "CANCELLATION" || value.kind === "PAUSE" || value.kind === "RESUME") && (value.stepId !== "workflow" || value.failureId !== undefined || value.authorizationId !== undefined || value.invocationId !== undefined || value.category !== undefined || value.attempt !== undefined || value.maxAttempts !== undefined || value.retryable !== undefined || value.retryDecision !== undefined || value.timeoutMs !== undefined)) return invalid("Workflow control record is invalid");
    if (value.kind === "TIMEOUT_EVALUATION" && (!safeId(value.invocationId) || value.failureId !== undefined || value.authorizationId !== undefined || value.category !== undefined || value.attempt !== undefined || value.maxAttempts !== undefined || value.retryable !== undefined || value.retryDecision !== undefined || !boundedTimeout(value.timeoutMs))) return invalid("Workflow timeout evaluation record is invalid");
    const json = JSON.stringify(value);
    if (json.length > 16_384 || /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret)/iu.test(json)) return invalid("Workflow lifecycle record contains prohibited material");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowLifecycleRecord)));
  }
}

export class WorkflowLifecycleEventValidator implements Validator<WorkflowLifecycleEvent> {
  public validate(value: unknown): ValidationResult<WorkflowLifecycleEvent> {
    if (!record(value) || !onlyKeys(value, ["contractVersion", "eventId", "externalEffects", "instanceId", "kind", "occurredAt", "recordId", "stepId", "summaryCode"]) || value.contractVersion !== "1" || !ids(value, ["eventId", "instanceId", "recordId", "stepId"]) || !timestamp(value.occurredAt) || value.externalEffects !== false) return invalid("Workflow lifecycle event is invalid");
    const expected = value.kind === "FAILURE" ? "workflow_failure_recorded" : value.kind === "RETRY_AUTHORIZATION" ? "workflow_retry_authorization_recorded" : value.kind === "RETRY_EXECUTION" ? "workflow_retry_execution_recorded" : value.kind === "PAUSE" ? "workflow_pause_recorded" : value.kind === "RESUME" ? "workflow_resume_recorded" : value.kind === "CANCELLATION" ? "workflow_cancellation_recorded" : value.kind === "TIMEOUT_EVALUATION" ? "workflow_timeout_evaluated" : undefined;
    if (value.summaryCode !== expected) return invalid("Workflow lifecycle event kind is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowLifecycleEvent)));
  }
}

export function createWorkflowLifecycleFingerprint(value: WorkflowControlRequest | WorkflowFailureRequest | WorkflowRetryAuthorizationRequest | WorkflowRetryExecutionRequest | WorkflowTimeoutEvaluationRequest): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function isRetryableFailureCategory(value: WorkflowFailureCategory): boolean { return value === "TIMEOUT" || value === "TRANSIENT_RUNTIME" || value === "VALIDATION"; }

const FAILURE_CATEGORIES = new Set(["TIMEOUT", "TRANSIENT_RUNTIME", "VALIDATION", "POLICY", "SAFETY", "PERMANENT"]);
const RETRY_DECISIONS = new Set(["AUTHORIZED", "DENIED_EXHAUSTED", "DENIED_NON_RETRYABLE"]);
const CONTROL_ACTIONS = new Set(["CANCEL", "PAUSE", "RESUME"]);
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key)); }
function lifecycleRecordKeys(value: Record<string, unknown>): boolean {
  const required = ["actorId", "contractVersion", "definitionId", "externalEffects", "fingerprint", "instanceId", "instanceVersion", "kind", "recordId", "recordedAt", "recoveryInstructions", "stepId", "workflowVersion"];
  const optional = ["attempt", "authorizationId", "category", "failureId", "invocationId", "maxAttempts", "retryDecision", "retryable", "timeoutMs"];
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function ids(value: Record<string, unknown>, keys: readonly string[]): boolean { return keys.every((key) => safeId(value[key])); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1; }
function attemptLimit(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 5; }
function boundedTimeout(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 3_600_000; }
function timestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)); }
function instructions(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length >= 1 && value.length <= 8 && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 300); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
export function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
