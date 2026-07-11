import { createHash } from "node:crypto";

import type { ValidationResult, Validator } from "../../validation/validation.js";
import { validationFailure, validationSuccess } from "../../validation/validation.js";
import { freeze } from "./workflow-agent-invocation.js";

export const WORKFLOW_STEP_OUTCOME_CONTRACT_VERSION = "1" as const;
export type WorkflowStepOutcomeDecision = "ACCEPTED_FOR_COMPLETION" | "NEEDS_REVISION" | "REJECTED" | "FAILED" | "INVALID" | "BLOCKED";

export interface WorkflowStepOutcomeRequest {
  readonly contractVersion: typeof WORKFLOW_STEP_OUTCOME_CONTRACT_VERSION;
  readonly outcomeId: string;
  readonly invocationId: string;
  readonly expectedInstanceVersion: number;
}

export interface WorkflowStepOutcomeReceipt {
  readonly contractVersion: typeof WORKFLOW_STEP_OUTCOME_CONTRACT_VERSION;
  readonly outcomeId: string;
  readonly invocationId: string;
  readonly invocationFingerprint: string;
  readonly fingerprint: string;
  readonly instanceId: string;
  readonly stepId: string;
  readonly decision: WorkflowStepOutcomeDecision;
  readonly reviewedAt: string;
  readonly remediation: readonly string[];
  readonly resultingInstanceVersion?: number;
  readonly workflowEventId?: string;
  readonly externalEffects: false;
}

export interface WorkflowStepOutcomeResult { readonly contractVersion: "1"; readonly receipt: WorkflowStepOutcomeReceipt; readonly replayed: boolean }
export interface WorkflowStepOutcomeService { review(request: WorkflowStepOutcomeRequest): Promise<WorkflowStepOutcomeResult>; }

export class WorkflowStepOutcomeRequestValidator implements Validator<WorkflowStepOutcomeRequest> {
  public validate(value: unknown): ValidationResult<WorkflowStepOutcomeRequest> {
    if (!record(value) || !onlyKeys(value, ["contractVersion", "expectedInstanceVersion", "invocationId", "outcomeId"]) || value.contractVersion !== "1" || !safeId(value.outcomeId) || !safeId(value.invocationId) || !Number.isSafeInteger(value.expectedInstanceVersion) || (value.expectedInstanceVersion as number) < 1) return invalid("Workflow Step outcome request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowStepOutcomeRequest)));
  }
}

export class WorkflowStepOutcomeReceiptValidator implements Validator<WorkflowStepOutcomeReceipt> {
  public validate(value: unknown): ValidationResult<WorkflowStepOutcomeReceipt> {
    if (!record(value) || value.contractVersion !== "1" || !safeId(value.outcomeId) || !safeId(value.invocationId) || !fingerprint(value.invocationFingerprint) || !fingerprint(value.fingerprint) || !safeId(value.instanceId) || !safeId(value.stepId) || !["ACCEPTED_FOR_COMPLETION", "NEEDS_REVISION", "REJECTED", "FAILED", "INVALID", "BLOCKED"].includes(value.decision as string) || !timestamp(value.reviewedAt) || !boundedStrings(value.remediation) || value.externalEffects !== false) return invalid("Workflow Step outcome receipt is invalid");
    if (value.decision === "ACCEPTED_FOR_COMPLETION") {
      if (!Number.isSafeInteger(value.resultingInstanceVersion) || (value.resultingInstanceVersion as number) < 1 || !safeId(value.workflowEventId) || (value.remediation as readonly unknown[]).length !== 0) return invalid("Accepted Workflow Step outcome receipt is invalid");
    } else if (value.resultingInstanceVersion !== undefined || value.workflowEventId !== undefined) return invalid("Non-accepted outcome cannot contain completion evidence");
    const json = JSON.stringify(value);
    if (json.length > 16_384 || /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret)/iu.test(json)) return invalid("Workflow Step outcome receipt contains prohibited material");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowStepOutcomeReceipt)));
  }
}

export function createWorkflowStepOutcomeFingerprint(request: WorkflowStepOutcomeRequest, invocationFingerprint: string): string {
  return createHash("sha256").update(JSON.stringify({ expectedInstanceVersion: request.expectedInstanceVersion, invocationFingerprint, invocationId: request.invocationId }), "utf8").digest("hex");
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key)); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)); }
function boundedStrings(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 12 && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 500); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
