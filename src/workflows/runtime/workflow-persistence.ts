import type {
  WorkflowCommand,
  WorkflowCommandKind,
  WorkflowCommandReceipt,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStepInstanceStatus,
  WorkflowTransitionResult,
} from "./workflow-runtime.js";
import type {
  WorkflowApprovalCheckpoint,
  WorkflowControlCheckpointEvent,
  WorkflowControlCheckpointEventDraft,
  WorkflowGuardianCheckpoint,
} from "./workflow-control-checkpoint.js";
import type {
  WorkflowAgentInvocationEvent,
  WorkflowAgentInvocationReceipt,
} from "./workflow-agent-invocation.js";
import type { WorkflowStepOutcomeReceipt } from "./workflow-step-outcome.js";

export const WORKFLOW_PERSISTENCE_CONTRACT_VERSION = "1" as const;

export type WorkflowActorCategory = "operator" | "runtime";

export interface WorkflowCommandApplication {
  readonly instanceId: string;
  readonly command: WorkflowCommand;
  readonly actorCategory: WorkflowActorCategory;
}

export interface WorkflowEventDraft {
  readonly contractVersion: typeof WORKFLOW_PERSISTENCE_CONTRACT_VERSION;
  readonly eventId: string;
  readonly definitionId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly commandId: string;
  readonly commandKind: WorkflowCommandKind;
  readonly actorCategory: WorkflowActorCategory;
  readonly previousStatus: WorkflowInstanceStatus;
  readonly nextStatus: WorkflowInstanceStatus;
  readonly previousStepStatus?: WorkflowStepInstanceStatus;
  readonly nextStepStatus?: WorkflowStepInstanceStatus;
  readonly stepId?: string;
  readonly reasonCode: string;
  readonly summaryCode: "workflow_transition_applied";
  readonly occurredAt: string;
  readonly nonExecuting: true;
}

export interface WorkflowEvent extends WorkflowEventDraft {
  readonly sequence: number;
}

export interface WorkflowInstanceUpdateExpectation {
  readonly version: number;
}

export interface WorkflowDefinitionRepository {
  getById(definitionId: string): Promise<WorkflowDefinition | undefined>;
  insert(definition: WorkflowDefinition): Promise<void>;
}

export interface WorkflowInstanceRepository {
  getById(instanceId: string): Promise<WorkflowInstance | undefined>;
  insert(instance: WorkflowInstance): Promise<void>;
  update(
    instance: WorkflowInstance,
    expectation: WorkflowInstanceUpdateExpectation,
  ): Promise<void>;
}

export interface WorkflowCommandReceiptRepository {
  getByInstanceIdAndCommandId(
    instanceId: string,
    commandId: string,
  ): Promise<WorkflowCommandReceipt | undefined>;
  insert(
    instanceId: string,
    receipt: WorkflowCommandReceipt,
  ): Promise<void>;
  listByInstanceId(
    instanceId: string,
  ): Promise<readonly WorkflowCommandReceipt[]>;
}

export interface WorkflowEventRepository {
  append(draft: WorkflowEventDraft): Promise<WorkflowEvent>;
  listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowEvent[]>;
}

export interface WorkflowApprovalCheckpointRepository {
  getById(evidenceId: string): Promise<WorkflowApprovalCheckpoint | undefined>;
  insert(checkpoint: WorkflowApprovalCheckpoint): Promise<void>;
  listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowApprovalCheckpoint[]>;
}

export interface WorkflowGuardianCheckpointRepository {
  getById(evidenceId: string): Promise<WorkflowGuardianCheckpoint | undefined>;
  insert(checkpoint: WorkflowGuardianCheckpoint): Promise<void>;
  listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowGuardianCheckpoint[]>;
}

export interface WorkflowControlCheckpointEventRepository {
  append(
    draft: WorkflowControlCheckpointEventDraft,
  ): Promise<WorkflowControlCheckpointEvent>;
  getByCheckpoint(
    checkpointKind: WorkflowControlCheckpointEvent["checkpointKind"],
    checkpointId: string,
  ): Promise<WorkflowControlCheckpointEvent | undefined>;
  listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowControlCheckpointEvent[]>;
}

export interface WorkflowAgentInvocationRepository {
  getById(invocationId: string): Promise<WorkflowAgentInvocationReceipt | undefined>;
  insert(receipt: WorkflowAgentInvocationReceipt): Promise<void>;
  update(receipt: WorkflowAgentInvocationReceipt, expectedStatus: "RESERVED"): Promise<void>;
}

export interface WorkflowAgentInvocationEventRepository {
  append(event: WorkflowAgentInvocationEvent): Promise<void>;
  listByInvocationId(invocationId: string): Promise<readonly WorkflowAgentInvocationEvent[]>;
}

export interface WorkflowStepOutcomeRepository {
  getById(outcomeId: string): Promise<WorkflowStepOutcomeReceipt | undefined>;
  getByInvocationId(invocationId: string): Promise<WorkflowStepOutcomeReceipt | undefined>;
  insert(receipt: WorkflowStepOutcomeReceipt): Promise<void>;
}

export interface WorkflowPersistenceTransaction {
  readonly approvals: WorkflowApprovalCheckpointRepository;
  readonly controlEvents: WorkflowControlCheckpointEventRepository;
  readonly definitions: WorkflowDefinitionRepository;
  readonly instances: WorkflowInstanceRepository;
  readonly guardians: WorkflowGuardianCheckpointRepository;
  readonly receipts: WorkflowCommandReceiptRepository;
  readonly events: WorkflowEventRepository;
  readonly agentInvocations: WorkflowAgentInvocationRepository;
  readonly agentInvocationEvents: WorkflowAgentInvocationEventRepository;
  readonly stepOutcomes: WorkflowStepOutcomeRepository;
}

export interface WorkflowEventIdentifierGenerator {
  nextWorkflowEventId(): string;
}

export interface WorkflowPersistenceService {
  createDefinition(definition: WorkflowDefinition): Promise<void>;
  createInstance(instance: WorkflowInstance): Promise<void>;
  applyCommand(
    application: WorkflowCommandApplication,
  ): Promise<WorkflowTransitionResult>;
}
