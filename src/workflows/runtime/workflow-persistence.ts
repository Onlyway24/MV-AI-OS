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

export interface WorkflowPersistenceTransaction {
  readonly definitions: WorkflowDefinitionRepository;
  readonly instances: WorkflowInstanceRepository;
  readonly receipts: WorkflowCommandReceiptRepository;
  readonly events: WorkflowEventRepository;
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
