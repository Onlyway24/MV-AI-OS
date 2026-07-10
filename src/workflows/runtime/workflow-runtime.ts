export const WORKFLOW_RUNTIME_CONTRACT_VERSION = "1" as const;
export type WorkflowInstanceStatus = "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED" | "PAUSED";
export type WorkflowStepInstanceStatus = "AWAITING_RESULT" | "CANCELLED" | "FAILED" | "PENDING" | "READY" | "SUCCEEDED";
export type WorkflowCommandKind = "ACTIVATE" | "CANCEL" | "COMPLETE_STEP" | "FAIL_STEP" | "PAUSE" | "RESUME";
export type WorkflowBlockerCode = "APPROVAL_REQUIRED" | "DEPENDENCY_INCOMPLETE" | "GUARDIAN_REQUIRED";
export type WorkflowStopReason = "CANCELLED_BY_OPERATOR" | "FAILED_STEP" | "NONE";
export interface WorkflowBlocker { readonly code: WorkflowBlockerCode; readonly stepId: string; }
export interface WorkflowFailure { readonly code: "STEP_FAILED"; readonly stepId: string; }
export interface WorkflowNonExecutionDeclaration { readonly nonExecuting: true; readonly externalExecutionAllowed: false; }
export interface WorkflowStepDefinition { readonly stepId: string; readonly dependencies: readonly string[]; readonly approvalRequired: boolean; readonly guardianRequired: boolean; readonly nonExecuting: true; }
export interface WorkflowDefinition { readonly contractVersion: typeof WORKFLOW_RUNTIME_CONTRACT_VERSION; readonly definitionId: string; readonly workflowId: string; readonly workflowVersion: string; readonly steps: readonly WorkflowStepDefinition[]; readonly nonExecuting: true; }
export interface WorkflowStepInstance { readonly stepId: string; readonly status: WorkflowStepInstanceStatus; readonly blockers: readonly WorkflowBlocker[]; }
export interface WorkflowCommand { readonly commandId: string; readonly expectedVersion: number; readonly kind: WorkflowCommandKind; readonly stepId?: string; readonly reasonCode: string; readonly nonExecuting: true; }
export interface WorkflowCommandReceipt { readonly commandId: string; readonly fingerprint: string; readonly resultingVersion: number; }
export interface WorkflowInstance { readonly contractVersion: typeof WORKFLOW_RUNTIME_CONTRACT_VERSION; readonly definitionId: string; readonly instanceId: string; readonly status: WorkflowInstanceStatus; readonly steps: readonly WorkflowStepInstance[]; readonly version: number; readonly receipts: readonly WorkflowCommandReceipt[]; readonly createdAt: string; readonly updatedAt: string; readonly stopReason: WorkflowStopReason; readonly nonExecuting: true; }
export interface WorkflowTransitionResult { readonly instance: WorkflowInstance; readonly outcome: "APPLIED" | "REPLAYED"; readonly nonExecuting: true; }
