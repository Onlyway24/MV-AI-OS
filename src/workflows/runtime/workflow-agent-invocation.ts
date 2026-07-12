import { createHash } from "node:crypto";

import type { AgentResult } from "../../contracts/agent-execution.js";
import { AgentResultValidator } from "../../validation/agent-result-validator.js";
import type { ValidationResult, Validator } from "../../validation/validation.js";
import { validationFailure, validationSuccess } from "../../validation/validation.js";
import type { WorkflowStepExecutionBoundaryRequest } from "./workflow-step-execution-boundary.js";

export const WORKFLOW_AGENT_INVOCATION_CONTRACT_VERSION = "1" as const;
export type WorkflowAgentInvocationStatus = "RESERVED" | "COMPLETED" | "FAILED";

export interface ControlledWorkflowAgentInvocationRequest {
  readonly contractVersion: typeof WORKFLOW_AGENT_INVOCATION_CONTRACT_VERSION;
  readonly invocationId: string;
  readonly boundaryRequest: WorkflowStepExecutionBoundaryRequest;
}

export interface WorkflowAgentInvocationFailure {
  readonly code: "AGENT_EXECUTION_FAILED" | "AGENT_RESULT_INVALID" | "INVOCATION_TIMED_OUT";
  readonly message: string;
}

export interface WorkflowAgentInvocationReceipt {
  readonly contractVersion: typeof WORKFLOW_AGENT_INVOCATION_CONTRACT_VERSION;
  readonly invocationId: string;
  readonly fingerprint: string;
  readonly definitionId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly instanceId: string;
  readonly reservedInstanceVersion: number;
  readonly stepId: string;
  readonly specificationId: string;
  readonly specificationVersion: string;
  readonly executorId: string;
  readonly executorVersion: string;
  readonly inputContractId?: string;
  readonly outputContractId?: string;
  readonly runtimeAgentId: string;
  readonly runtimeAgentVersion: string;
  readonly capabilityIds: readonly string[];
  readonly status: WorkflowAgentInvocationStatus;
  readonly reservedAt: string;
  readonly completedAt?: string;
  readonly result?: AgentResult;
  readonly failure?: WorkflowAgentInvocationFailure;
  readonly externalEffectsAllowed: false;
}

export interface WorkflowAgentInvocationEvent {
  readonly contractVersion: typeof WORKFLOW_AGENT_INVOCATION_CONTRACT_VERSION;
  readonly eventId: string;
  readonly invocationId: string;
  readonly instanceId: string;
  readonly stepId: string;
  readonly status: WorkflowAgentInvocationStatus;
  readonly occurredAt: string;
  readonly summaryCode: "workflow_agent_invocation_reserved" | "workflow_agent_invocation_completed" | "workflow_agent_invocation_failed";
  readonly externalEffects: false;
}

export type WorkflowAgentInvocationBlockerCode =
  | "CANDIDATE_BLOCKED"
  | "EXECUTOR_UNRESOLVED"
  | "INVOCATION_CONFLICT"
  | "INVOCATION_STATE_INVALID";

export type ControlledWorkflowAgentInvocationResult =
  | { readonly contractVersion: "1"; readonly status: "BLOCKED"; readonly blocker: { readonly code: WorkflowAgentInvocationBlockerCode; readonly reason: string } }
  | { readonly contractVersion: "1"; readonly status: "COMPLETED" | "FAILED"; readonly receipt: WorkflowAgentInvocationReceipt; readonly replayed: boolean };

export interface ControlledWorkflowAgentInvoker {
  invoke(request: ControlledWorkflowAgentInvocationRequest): Promise<ControlledWorkflowAgentInvocationResult>;
}

export class ControlledWorkflowAgentInvocationRequestValidator implements Validator<ControlledWorkflowAgentInvocationRequest> {
  public validate(value: unknown): ValidationResult<ControlledWorkflowAgentInvocationRequest> {
    if (!record(value) || !keys(value, ["boundaryRequest", "contractVersion", "invocationId"]) || value.contractVersion !== "1" || !safeId(value.invocationId) || !record(value.boundaryRequest)) {
      return invalid("workflow agent invocation request is invalid");
    }
    return validationSuccess(freeze(structuredClone(value as unknown as ControlledWorkflowAgentInvocationRequest)));
  }
}

export class WorkflowAgentInvocationReceiptValidator implements Validator<WorkflowAgentInvocationReceipt> {
  public validate(value: unknown): ValidationResult<WorkflowAgentInvocationReceipt> {
    if (!record(value)) return invalid("workflow agent invocation receipt is invalid");
    if (!receiptKeys(value)) return invalid("workflow agent invocation receipt contains unsupported fields");
    const ids = ["invocationId", "fingerprint", "definitionId", "workflowId", "workflowVersion", "instanceId", "stepId", "specificationId", "specificationVersion", "executorId", "executorVersion", "runtimeAgentId", "runtimeAgentVersion"];
    if (value.contractVersion !== "1" || ids.some((key) => !safeId(value[key])) || !Number.isSafeInteger(value.reservedInstanceVersion) || (value.reservedInstanceVersion as number) < 1 || !capabilities(value.capabilityIds) || !["RESERVED", "COMPLETED", "FAILED"].includes(value.status as string) || !timestamp(value.reservedAt) || value.externalEffectsAllowed !== false) return invalid("workflow agent invocation receipt is invalid");
    if (value.status === "RESERVED" && (value.result !== undefined || value.failure !== undefined || value.completedAt !== undefined)) return invalid("reserved invocation cannot contain an outcome");
    if (value.status === "COMPLETED" && (!result(value.result) || value.failure !== undefined || !timestamp(value.completedAt))) return invalid("completed invocation outcome is invalid");
    if (value.status === "FAILED" && (!failure(value.failure) || value.result !== undefined || !timestamp(value.completedAt))) return invalid("failed invocation outcome is invalid");
    if ((value.inputContractId !== undefined && !safeId(value.inputContractId)) || (value.outputContractId !== undefined && !safeId(value.outputContractId))) return invalid("workflow agent invocation contract identity is invalid");
    const json = JSON.stringify(value);
    if (json.length > 131_072 || /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret)/iu.test(json)) return invalid("workflow agent invocation receipt contains prohibited material");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowAgentInvocationReceipt)));
  }
}

export class WorkflowAgentInvocationEventValidator implements Validator<WorkflowAgentInvocationEvent> {
  public validate(value: unknown): ValidationResult<WorkflowAgentInvocationEvent> {
    if (!record(value) || !keys(value, ["contractVersion", "eventId", "externalEffects", "instanceId", "invocationId", "occurredAt", "status", "stepId", "summaryCode"]) || value.contractVersion !== "1" || !safeId(value.eventId) || !safeId(value.invocationId) || !safeId(value.instanceId) || !safeId(value.stepId) || !timestamp(value.occurredAt) || value.externalEffects !== false) return invalid("workflow agent invocation event is invalid");
    const expected = value.status === "RESERVED" ? "workflow_agent_invocation_reserved" : value.status === "COMPLETED" ? "workflow_agent_invocation_completed" : value.status === "FAILED" ? "workflow_agent_invocation_failed" : undefined;
    if (value.summaryCode !== expected) return invalid("workflow agent invocation event status is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowAgentInvocationEvent)));
  }
}

export function createWorkflowAgentInvocationFingerprint(request: ControlledWorkflowAgentInvocationRequest): string {
  const boundary = request.boundaryRequest;
  return createHash("sha256").update(JSON.stringify({
    agentAssignment: boundary.agentAssignment,
    expectedDefinitionId: boundary.expectedDefinitionId,
    expectedVersion: boundary.expectedVersion,
    expectedWorkflowVersion: boundary.expectedWorkflowVersion,
    instanceId: boundary.instanceId,
    policyDecision: boundary.policyDecision,
    selection: boundary.selection,
    workspaceId: boundary.workspaceId,
  }), "utf8").digest("hex");
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)) && Object.keys(value).length === allowed.length; }
function receiptKeys(value: Record<string, unknown>): boolean {
  const required = ["capabilityIds", "contractVersion", "definitionId", "executorId", "executorVersion", "externalEffectsAllowed", "fingerprint", "instanceId", "invocationId", "reservedAt", "reservedInstanceVersion", "runtimeAgentId", "runtimeAgentVersion", "specificationId", "specificationVersion", "status", "stepId", "workflowId", "workflowVersion"];
  const optional = ["completedAt", "failure", "inputContractId", "outputContractId", "result"];
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.length <= 40; }
function capabilities(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 32 && value.every((id) => safeId(id)) && new Set(value).size === value.length; }
function result(value: unknown): value is AgentResult { return new AgentResultValidator().validate(value).ok; }
function failure(value: unknown): value is WorkflowAgentInvocationFailure { return record(value) && keys(value, ["code", "message"]) && ["AGENT_EXECUTION_FAILED", "AGENT_RESULT_INVALID", "INVOCATION_TIMED_OUT"].includes(value.code as string) && typeof value.message === "string" && value.message.length > 0 && value.message.length <= 500; }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
export function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
