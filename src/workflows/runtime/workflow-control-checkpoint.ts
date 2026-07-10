import type { MainAssistantSafetyDomain } from "../../assistants/main-assistant-specification.js";
import type {
  WorkflowApprovalEvidenceStatus,
  WorkflowGuardianEvidenceStatus,
} from "./workflow-step-execution-boundary.js";

export const WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION = "1" as const;

export interface WorkflowApprovalCheckpoint {
  readonly authorityActorId: string;
  readonly contractVersion: typeof WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION;
  readonly definitionId: string;
  readonly evidenceId: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly nonExecuting: true;
  readonly recordedAt: string;
  readonly scope: "STEP_CANDIDATE_PREPARATION";
  readonly status: WorkflowApprovalEvidenceStatus;
  readonly stepId: string;
  readonly supersedesEvidenceId?: string;
  readonly workflowVersion: string;
}

export interface WorkflowGuardianCheckpoint {
  readonly contractVersion: typeof WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION;
  readonly definitionId: string;
  readonly domain: MainAssistantSafetyDomain;
  readonly evidenceId: string;
  readonly guardianId: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly nonExecuting: true;
  readonly recordedAt: string;
  readonly status: WorkflowGuardianEvidenceStatus;
  readonly stepId: string;
  readonly supersedesEvidenceId?: string;
  readonly workflowVersion: string;
}

export type WorkflowControlCheckpointKind = "APPROVAL" | "GUARDIAN";

export interface WorkflowControlCheckpointEventDraft {
  readonly checkpointId: string;
  readonly checkpointKind: WorkflowControlCheckpointKind;
  readonly contractVersion: typeof WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION;
  readonly eventId: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly nonExecuting: true;
  readonly occurredAt: string;
  readonly status: WorkflowApprovalEvidenceStatus | WorkflowGuardianEvidenceStatus;
  readonly stepId: string;
  readonly summaryCode: "workflow_control_checkpoint_recorded";
}

export interface WorkflowControlCheckpointEvent
  extends WorkflowControlCheckpointEventDraft {
  readonly sequence: number;
}

export interface WorkflowControlCheckpointWriteResult<T> {
  readonly checkpoint: T;
  readonly contractVersion: typeof WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION;
  readonly nonExecuting: true;
  readonly outcome: "APPLIED" | "REPLAYED";
}

export interface WorkflowControlCheckpointService {
  recordApproval(
    checkpoint: WorkflowApprovalCheckpoint,
  ): Promise<WorkflowControlCheckpointWriteResult<WorkflowApprovalCheckpoint>>;
  recordGuardian(
    checkpoint: WorkflowGuardianCheckpoint,
  ): Promise<WorkflowControlCheckpointWriteResult<WorkflowGuardianCheckpoint>>;
}

export interface WorkflowControlCheckpointEventIdentifierGenerator {
  nextWorkflowControlCheckpointEventId(): string;
}

export function freezeWorkflowControlCheckpointValue<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }
  for (const entry of Object.values(value)) {
    freezeWorkflowControlCheckpointValue(entry);
  }
  return value;
}
