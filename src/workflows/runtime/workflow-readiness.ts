import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStepInstanceStatus,
} from "./workflow-runtime.js";

export const WORKFLOW_READINESS_CONTRACT_VERSION = "1" as const;

export type WorkflowReadinessReasonCode =
  | "APPROVAL_REQUIRED"
  | "DEPENDENCY_CYCLE"
  | "DEPENDENCY_INCOMPLETE"
  | "GUARDIAN_REQUIRED"
  | "REASONS_TRUNCATED"
  | "STEP_AWAITING_RESULT"
  | "WORKFLOW_NOT_ACTIVE";

export type WorkflowReadinessStatus =
  | "BLOCKED"
  | "PENDING"
  | "READY"
  | "TERMINAL";

export interface WorkflowReadinessRequest {
  readonly approvedStepIds: readonly string[];
  readonly contractVersion: typeof WORKFLOW_READINESS_CONTRACT_VERSION;
  readonly expectedVersion: number;
  readonly guardianSatisfiedStepIds: readonly string[];
  readonly instanceId: string;
  readonly maxResults: number;
  readonly nonExecuting: true;
}

export interface WorkflowReadinessReason {
  readonly code: WorkflowReadinessReasonCode;
  readonly relatedStepId?: string;
}

export interface WorkflowReadinessFinding {
  readonly nonExecuting: true;
  readonly persistedStatus: WorkflowStepInstanceStatus;
  readonly reasons: readonly WorkflowReadinessReason[];
  readonly status: WorkflowReadinessStatus;
  readonly stepId: string;
}

export interface WorkflowReadinessSummary {
  readonly blockedCount: number;
  readonly blockedTruncated: boolean;
  readonly pendingCount: number;
  readonly pendingTruncated: boolean;
  readonly readyCount: number;
  readonly readyTruncated: boolean;
  readonly terminalCount: number;
  readonly terminalTruncated: boolean;
}

export interface WorkflowReadinessResult {
  readonly blockedFindings: readonly WorkflowReadinessFinding[];
  readonly contractVersion: typeof WORKFLOW_READINESS_CONTRACT_VERSION;
  readonly definitionId: string;
  readonly evaluatedVersion: number;
  readonly instanceId: string;
  readonly nonExecuting: true;
  readonly pendingFindings: readonly WorkflowReadinessFinding[];
  readonly readyFindings: readonly WorkflowReadinessFinding[];
  readonly stateUpdatedAt: string;
  readonly summary: WorkflowReadinessSummary;
  readonly terminalFindings: readonly WorkflowReadinessFinding[];
  readonly workflowStatus: WorkflowInstanceStatus;
}

export interface WorkflowReadinessEngine {
  evaluate(
    definition: WorkflowDefinition,
    instance: WorkflowInstance,
    request: WorkflowReadinessRequest,
  ): WorkflowReadinessResult;
}

export interface WorkflowReadinessService {
  evaluate(
    request: WorkflowReadinessRequest,
  ): Promise<WorkflowReadinessResult>;
}

export function freezeWorkflowReadinessValue<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }
  for (const entry of Object.values(value)) {
    freezeWorkflowReadinessValue(entry);
  }
  return value;
}
