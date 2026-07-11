import type { AuditEvent } from "../../src/contracts/audit-event.js";
import type { TaskResponse } from "../../src/contracts/task-response.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
  RequestIdConflictError,
} from "../../src/errors/core-error.js";
import { isTaskTransitionAllowed } from "../../src/core/models/task.js";
import type { TaskRecord } from "../../src/core/models/task.js";
import { AuditEventValidator } from "../../src/validation/audit-event-validator.js";
import type { AuditRepository } from "../../src/persistence/audit-repository.js";
import type {
  RequestRepository,
  StoredRequest,
} from "../../src/persistence/request-repository.js";
import type {
  RepositoryTransaction,
  RepositoryTransactionRunner,
} from "../../src/persistence/repository-transaction.js";
import type {
  TaskRepository,
  TaskUpdateExpectation,
} from "../../src/persistence/task-repository.js";
import { isRfc3339Timestamp } from "../../src/validation/primitives.js";
import { TaskResponseValidator } from "../../src/validation/task-response-validator.js";
import type {
  WorkflowCommandReceipt,
  WorkflowDefinition,
  WorkflowInstance,
} from "../../src/workflows/runtime/workflow-runtime.js";
import type {
  WorkflowApprovalCheckpoint,
  WorkflowControlCheckpointEvent,
  WorkflowControlCheckpointEventDraft,
  WorkflowGuardianCheckpoint,
} from "../../src/workflows/runtime/workflow-control-checkpoint.js";
import {
  WorkflowApprovalCheckpointValidator,
  WorkflowControlCheckpointEventDraftValidator,
  WorkflowControlCheckpointEventValidator,
  WorkflowGuardianCheckpointValidator,
} from "../../src/workflows/runtime/workflow-control-checkpoint-validator.js";
import {
  WorkflowCommandReceiptValidator,
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
} from "../../src/workflows/runtime/workflow-runtime-validator.js";
import {
  isWorkflowStepTransitionAllowed,
  isWorkflowTransitionAllowed,
} from "../../src/workflows/runtime/deterministic-workflow-state-machine.js";
import type {
  WorkflowEvent,
  WorkflowEventDraft,
} from "../../src/workflows/runtime/workflow-persistence.js";
import {
  WorkflowEventDraftValidator,
  WorkflowEventValidator,
} from "../../src/workflows/runtime/workflow-persistence-validator.js";
import type { WorkflowAgentInvocationEvent, WorkflowAgentInvocationReceipt } from "../../src/workflows/runtime/workflow-agent-invocation.js";
import type { WorkflowStepOutcomeReceipt } from "../../src/workflows/runtime/workflow-step-outcome.js";
import type { WorkflowLifecycleEvent, WorkflowLifecycleRecord } from "../../src/workflows/runtime/workflow-lifecycle.js";

const REQUEST_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

interface RepositoryState {
  readonly audits: Map<string, AuditEvent>;
  readonly requests: Map<string, StoredRequest>;
  readonly tasks: Map<string, TaskRecord>;
  readonly workflowCommandReceipts: Map<string, WorkflowCommandReceipt>;
  readonly workflowApprovalCheckpoints: Map<string, WorkflowApprovalCheckpoint>;
  readonly workflowControlCheckpointEvents: Map<string, WorkflowControlCheckpointEvent>;
  readonly workflowDefinitions: Map<string, WorkflowDefinition>;
  readonly workflowEvents: Map<string, WorkflowEvent>;
  readonly workflowInstances: Map<string, WorkflowInstance>;
  readonly workflowGuardianCheckpoints: Map<string, WorkflowGuardianCheckpoint>;
  readonly workflowAgentInvocations: Map<string, WorkflowAgentInvocationReceipt>;
  readonly workflowAgentInvocationEvents: Map<string, WorkflowAgentInvocationEvent>;
  readonly workflowStepOutcomes: Map<string, WorkflowStepOutcomeReceipt>;
  readonly workflowLifecycleRecords: Map<string, WorkflowLifecycleRecord>;
  readonly workflowLifecycleEvents: Map<string, WorkflowLifecycleEvent>;
  workflowControlCheckpointEventSequence: number;
  workflowEventSequence: number;
}

export class InMemoryRepositoryTransactionRunner
  implements RepositoryTransactionRunner
{
  #state: RepositoryState = createState();
  #tail: Promise<void> = Promise.resolve();

  public transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const execution = this.#tail.then(async () => {
      const workingState = cloneState(this.#state);
      const result = await operation(createRepositories(workingState));
      this.#state = workingState;
      return result;
    });

    this.#tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }
}

function createRepositories(
  state: RepositoryState,
): RepositoryTransaction {
  return Object.freeze({
    audits: new InMemoryAuditRepository(state),
    requests: new InMemoryRequestRepository(state),
    tasks: new InMemoryTaskRepository(state),
    workflows: Object.freeze({
      agentInvocationEvents: new InMemoryWorkflowAgentInvocationEventRepository(state),
      agentInvocations: new InMemoryWorkflowAgentInvocationRepository(state),
      approvals: new InMemoryWorkflowApprovalCheckpointRepository(state),
      controlEvents: new InMemoryWorkflowControlCheckpointEventRepository(state),
      definitions: new InMemoryWorkflowDefinitionRepository(state),
      events: new InMemoryWorkflowEventRepository(state),
      instances: new InMemoryWorkflowInstanceRepository(state),
      guardians: new InMemoryWorkflowGuardianCheckpointRepository(state),
      lifecycleEvents: new InMemoryWorkflowLifecycleEventRepository(state),
      lifecycleRecords: new InMemoryWorkflowLifecycleRecordRepository(state),
      receipts: new InMemoryWorkflowCommandReceiptRepository(state),
      stepOutcomes: new InMemoryWorkflowStepOutcomeRepository(state),
    }),
  });
}

class InMemoryWorkflowAgentInvocationRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowAgentInvocationReceipt | undefined> { return Promise.resolve(cloneOptional(this.state.workflowAgentInvocations.get(id))); }
  public listByInstanceId(id: string, limit: number): Promise<readonly WorkflowAgentInvocationReceipt[]> { return Promise.resolve(Object.freeze([...this.state.workflowAgentInvocations.values()].filter((entry) => entry.instanceId === id).slice(-limit).reverse().map(cloneFrozen))); }
  public insert(receipt: WorkflowAgentInvocationReceipt): Promise<void> { if (this.state.workflowAgentInvocations.has(receipt.invocationId)) throw new RepositoryConflictError("Workflow invocation exists"); this.state.workflowAgentInvocations.set(receipt.invocationId, cloneFrozen(receipt)); return Promise.resolve(); }
  public update(receipt: WorkflowAgentInvocationReceipt, expected: "RESERVED"): Promise<void> { const current = this.state.workflowAgentInvocations.get(receipt.invocationId); if (current?.status !== expected || current.fingerprint !== receipt.fingerprint) throw new RepositoryConflictError("Workflow invocation conflicts"); this.state.workflowAgentInvocations.set(receipt.invocationId, cloneFrozen(receipt)); return Promise.resolve(); }
}

class InMemoryWorkflowAgentInvocationEventRepository {
  public constructor(private readonly state: RepositoryState) {}
  public append(event: WorkflowAgentInvocationEvent): Promise<void> { if (this.state.workflowAgentInvocationEvents.has(event.eventId)) throw new RepositoryConflictError("Workflow invocation event exists"); this.state.workflowAgentInvocationEvents.set(event.eventId, cloneFrozen(event)); return Promise.resolve(); }
  public listByInvocationId(id: string): Promise<readonly WorkflowAgentInvocationEvent[]> { return Promise.resolve(Object.freeze([...this.state.workflowAgentInvocationEvents.values()].filter((event) => event.invocationId === id).map(cloneFrozen))); }
}

class InMemoryWorkflowStepOutcomeRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowStepOutcomeReceipt | undefined> { return Promise.resolve(cloneOptional(this.state.workflowStepOutcomes.get(id))); }
  public getByInvocationId(id: string): Promise<WorkflowStepOutcomeReceipt | undefined> { return Promise.resolve(cloneOptional([...this.state.workflowStepOutcomes.values()].find((entry) => entry.invocationId === id))); }
  public insert(receipt: WorkflowStepOutcomeReceipt): Promise<void> { if (this.state.workflowStepOutcomes.has(receipt.outcomeId) || [...this.state.workflowStepOutcomes.values()].some((entry) => entry.invocationId === receipt.invocationId)) throw new RepositoryConflictError("Workflow outcome exists"); this.state.workflowStepOutcomes.set(receipt.outcomeId, cloneFrozen(receipt)); return Promise.resolve(); }
}

class InMemoryWorkflowLifecycleRecordRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowLifecycleRecord | undefined> { return Promise.resolve(cloneOptional(this.state.workflowLifecycleRecords.get(id))); }
  public insert(record: WorkflowLifecycleRecord): Promise<void> { if (this.state.workflowLifecycleRecords.has(record.recordId)) throw new RepositoryConflictError("Workflow lifecycle record exists"); this.state.workflowLifecycleRecords.set(record.recordId, cloneFrozen(record)); return Promise.resolve(); }
  public listByStep(instanceId: string, stepId: string): Promise<readonly WorkflowLifecycleRecord[]> { return Promise.resolve(Object.freeze([...this.state.workflowLifecycleRecords.values()].filter((record) => record.instanceId === instanceId && record.stepId === stepId).map(cloneFrozen))); }
}

class InMemoryWorkflowLifecycleEventRepository {
  public constructor(private readonly state: RepositoryState) {}
  public append(event: WorkflowLifecycleEvent): Promise<void> { if (this.state.workflowLifecycleEvents.has(event.eventId)) throw new RepositoryConflictError("Workflow lifecycle event exists"); this.state.workflowLifecycleEvents.set(event.eventId, cloneFrozen(event)); return Promise.resolve(); }
  public listByRecordId(recordId: string): Promise<readonly WorkflowLifecycleEvent[]> { return Promise.resolve(Object.freeze([...this.state.workflowLifecycleEvents.values()].filter((event) => event.recordId === recordId).map(cloneFrozen))); }
}

class InMemoryTaskRepository implements TaskRepository {
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(taskId: string): Promise<TaskRecord | undefined> {
    return Promise.resolve(cloneOptional(this.#state.tasks.get(taskId)));
  }

  public getByRequestId(
    requestId: string,
  ): Promise<TaskRecord | undefined> {
    const task = [...this.#state.tasks.values()].find(
      (candidate) => candidate.requestId === requestId,
    );
    return Promise.resolve(cloneOptional(task));
  }

  public insert(task: TaskRecord): Promise<void> {
    if (
      task.taskId.trim().length === 0 ||
      task.requestId.trim().length === 0 ||
      !isRfc3339Timestamp(task.createdAt) ||
      !isRfc3339Timestamp(task.updatedAt)
    ) {
      throw new RepositoryValidationError("Task record failed validation", {
        taskId: task.taskId,
      });
    }
    if (this.#state.tasks.has(task.taskId)) {
      throw new RepositoryConflictError("Task ID already exists", {
        taskId: task.taskId,
      });
    }
    if (
      [...this.#state.tasks.values()].some(
        (candidate) => candidate.requestId === task.requestId,
      )
    ) {
      throw new RepositoryConflictError(
        "A task already exists for the request ID",
        { requestId: task.requestId },
      );
    }

    this.#state.tasks.set(task.taskId, cloneFrozen(task));
    return Promise.resolve();
  }

  public update(
    task: TaskRecord,
    expectation: TaskUpdateExpectation,
  ): Promise<void> {
    if (!isRfc3339Timestamp(task.updatedAt)) {
      throw new RepositoryValidationError("Task record failed validation", {
        taskId: task.taskId,
      });
    }
    const existing = this.#state.tasks.get(task.taskId);
    if (existing === undefined) {
      throw new RepositoryConflictError("Task does not exist", {
        taskId: task.taskId,
      });
    }
    if (
      existing.state !== expectation.state ||
      existing.updatedAt !== expectation.updatedAt
    ) {
      throw new RepositoryConflictError(
        "Task changed after it was read",
        {
          actualState: existing.state,
          expectedState: expectation.state,
          taskId: task.taskId,
        },
      );
    }
    if (
      existing.requestId !== task.requestId ||
      existing.correlationId !== task.correlationId ||
      existing.workspaceId !== task.workspaceId ||
      existing.actorId !== task.actorId ||
      existing.createdAt !== task.createdAt
    ) {
      throw new RepositoryConflictError(
        "Task ownership fields cannot be changed",
        { taskId: task.taskId },
      );
    }
    if (!isTaskTransitionAllowed(existing.state, task.state)) {
      throw new RepositoryConflictError(
        "Repository rejected an invalid task transition",
        {
          from: existing.state,
          taskId: task.taskId,
          to: task.state,
        },
      );
    }

    this.#state.tasks.set(task.taskId, cloneFrozen(task));
    return Promise.resolve();
  }
}

class InMemoryRequestRepository implements RequestRepository {
  readonly #state: RepositoryState;
  readonly #responseValidator = new TaskResponseValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(requestId: string): Promise<StoredRequest | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.requests.get(requestId)),
    );
  }

  public insert(request: StoredRequest): Promise<void> {
    if (
      request.requestId.trim().length === 0 ||
      request.taskId.trim().length === 0 ||
      !REQUEST_FINGERPRINT_PATTERN.test(request.requestFingerprint) ||
      !isRfc3339Timestamp(request.createdAt) ||
      !isRfc3339Timestamp(request.updatedAt) ||
      request.response !== undefined
    ) {
      throw new RepositoryValidationError(
        "Stored request failed validation",
        { requestId: request.requestId },
      );
    }
    const existing = this.#state.requests.get(request.requestId);
    if (existing !== undefined) {
      throw new RequestIdConflictError(
        request.requestId,
        existing.taskId,
      );
    }
    if (
      [...this.#state.requests.values()].some(
        (candidate) => candidate.taskId === request.taskId,
      )
    ) {
      throw new RepositoryConflictError(
        "A request already exists for the task ID",
        { taskId: request.taskId },
      );
    }

    this.#state.requests.set(request.requestId, cloneFrozen(request));
    return Promise.resolve();
  }

  public saveResponse(
    requestId: string,
    taskId: string,
    response: TaskResponse,
    updatedAt: string,
  ): Promise<void> {
    const responseValidation = this.#responseValidator.validate(response);
    if (
      !responseValidation.ok ||
      !isRfc3339Timestamp(updatedAt) ||
      response.updatedAt !== updatedAt
    ) {
      throw new RepositoryValidationError(
        "Stored request response failed validation",
        { requestId, taskId },
      );
    }
    const existing = this.#state.requests.get(requestId);
    if (existing === undefined) {
      throw new RepositoryConflictError("Request does not exist", {
        requestId,
      });
    }
    if (
      existing.taskId !== taskId ||
      response.taskId !== taskId ||
      response.requestId !== requestId
    ) {
      throw new RepositoryConflictError(
        "Response ownership does not match the stored request",
        { requestId, taskId },
      );
    }
    if (existing.response !== undefined) {
      throw new RepositoryConflictError(
        "Request response is already stored",
        { requestId, taskId },
      );
    }

    this.#state.requests.set(
      requestId,
      cloneFrozen({
        ...existing,
        response: responseValidation.value,
        updatedAt,
      }),
    );
    return Promise.resolve();
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly #state: RepositoryState;
  readonly #validator = new AuditEventValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(event: AuditEvent): Promise<void> {
    const validation = this.#validator.validate(event);
    if (!validation.ok) {
      throw new RepositoryValidationError(
        "Audit event failed validation",
        {
          eventId: event.eventId,
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }
    if (this.#state.audits.has(event.eventId)) {
      throw new RepositoryConflictError("Audit event ID already exists", {
        eventId: event.eventId,
      });
    }

    this.#state.audits.set(event.eventId, cloneFrozen(validation.value));
    return Promise.resolve();
  }

  public listByCorrelationId(
    correlationId: string,
  ): Promise<readonly AuditEvent[]> {
    const events = [...this.#state.audits.values()]
      .filter((event) => event.correlationId === correlationId)
      .map((event) => cloneFrozen(event));
    return Promise.resolve(Object.freeze(events));
  }
}

class InMemoryWorkflowDefinitionRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowDefinitionValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(
    definitionId: string,
  ): Promise<WorkflowDefinition | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowDefinitions.get(definitionId)),
    );
  }

  public insert(definition: WorkflowDefinition): Promise<void> {
    const validation = this.#validator.validate(definition);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow definition failed validation");
    }
    if (this.#state.workflowDefinitions.has(validation.value.definitionId)) {
      throw new RepositoryConflictError("Workflow definition ID already exists", {
        definitionId: validation.value.definitionId,
      });
    }
    if (
      [...this.#state.workflowDefinitions.values()].some(
        (candidate) =>
          candidate.workflowId === validation.value.workflowId &&
          candidate.workflowVersion === validation.value.workflowVersion,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow identity and version already exist",
        { definitionId: validation.value.definitionId },
      );
    }
    this.#state.workflowDefinitions.set(
      validation.value.definitionId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }
}

class InMemoryWorkflowInstanceRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowInstanceValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(
    instanceId: string,
  ): Promise<WorkflowInstance | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowInstances.get(instanceId)),
    );
  }

  public insert(instance: WorkflowInstance): Promise<void> {
    const validation = this.#validator.validate(instance);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow instance failed validation");
    }
    if (this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance ID already exists", {
        instanceId: validation.value.instanceId,
      });
    }
    if (
      validation.value.version !== 0 ||
      validation.value.receipts.length !== 0
    ) {
      throw new RepositoryValidationError(
        "A new workflow instance cannot contain processed commands",
      );
    }
    this.#state.workflowInstances.set(
      validation.value.instanceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public update(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
  ): Promise<void> {
    return this.#update(instance, expectation);
  }

  public retry(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    authorizationId: string,
  ): Promise<void> {
    const authorization = this.#state.workflowLifecycleRecords.get(authorizationId);
    if (
      authorization?.kind !== "RETRY_AUTHORIZATION" ||
      authorization.retryDecision !== "AUTHORIZED" ||
      authorization.instanceId !== instance.instanceId ||
      instance.steps.find(({ stepId }) => stepId === authorization.stepId)?.status !== "READY"
    ) {
      throw new RepositoryConflictError("Workflow retry authorization is missing or invalid");
    }
    return this.#update(instance, expectation, authorization.stepId);
  }

  public control(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    controlId: string,
  ): Promise<void> {
    const control = this.#state.workflowLifecycleRecords.get(controlId);
    if (control === undefined || !["CANCELLATION", "PAUSE", "RESUME"].includes(control.kind) || control.instanceId !== instance.instanceId) {
      throw new RepositoryConflictError("Workflow control evidence is missing or invalid");
    }
    return this.#update(instance, expectation, undefined, control.kind as "CANCELLATION" | "PAUSE" | "RESUME");
  }

  #update(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    retryStepId?: string,
    controlKind?: "CANCELLATION" | "PAUSE" | "RESUME",
  ): Promise<void> {
    const validation = this.#validator.validate(instance);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow instance failed validation");
    }
    const existing = this.#state.workflowInstances.get(
      validation.value.instanceId,
    );
    if (existing?.version !== expectation.version) {
      throw new RepositoryConflictError("Workflow version changed after read", {
        instanceId: validation.value.instanceId,
      });
    }
    if (validation.value.version !== expectation.version + 1) {
      throw new RepositoryConflictError(
        "Workflow version must increment exactly once",
        { instanceId: validation.value.instanceId },
      );
    }
    if (
      existing.definitionId !== validation.value.definitionId ||
      existing.createdAt !== validation.value.createdAt
    ) {
      throw new RepositoryConflictError(
        "Workflow instance identity fields cannot be changed",
        { instanceId: validation.value.instanceId },
      );
    }
    assertAllowedWorkflowInstanceTransition(existing, validation.value, retryStepId, controlKind);
    this.#state.workflowInstances.set(
      validation.value.instanceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }
}

function assertAllowedWorkflowInstanceTransition(
  previous: WorkflowInstance,
  next: WorkflowInstance,
  retryStepId?: string,
  controlKind?: "CANCELLATION" | "PAUSE" | "RESUME",
): void {
  const recoverySteps = previous.steps.filter((step, index) => step.status === "FAILED" && next.steps[index]?.status === "READY");
  const isRecovery = previous.status === "FAILED" && next.status === "ACTIVE";
  if ((isRecovery || recoverySteps.length > 0) && retryStepId === undefined) {
    throw new RepositoryConflictError(
      "Workflow recovery requires an explicit retry authorization",
      { instanceId: next.instanceId },
    );
  }
  if (
    retryStepId !== undefined &&
    (!isRecovery || recoverySteps.length !== 1 || recoverySteps[0]?.stepId !== retryStepId ||
      previous.steps.some((step, index) => step.stepId !== retryStepId && JSON.stringify(step) !== JSON.stringify(next.steps[index])))
  ) {
    throw new RepositoryConflictError("Workflow retry recovery delta is invalid", {
      instanceId: next.instanceId,
      stepId: retryStepId,
    });
  }
  const expectedControl = previous.status === "ACTIVE" && next.status === "PAUSED" ? "PAUSE" : previous.status === "PAUSED" && next.status === "ACTIVE" ? "RESUME" : (previous.status === "ACTIVE" || previous.status === "PAUSED") && next.status === "CANCELLED" ? "CANCELLATION" : undefined;
  if (expectedControl !== undefined && controlKind !== expectedControl) {
    throw new RepositoryConflictError("Workflow lifecycle control requires exact operator evidence", { instanceId: next.instanceId });
  }
  if (controlKind !== undefined && expectedControl !== controlKind) {
    throw new RepositoryConflictError("Workflow control transition does not match its evidence", { instanceId: next.instanceId });
  }
  if (
    previous.status !== next.status &&
    !isWorkflowTransitionAllowed(previous.status, next.status)
  ) {
    throw new RepositoryConflictError(
      "Repository rejected an invalid workflow transition",
      { instanceId: next.instanceId },
    );
  }
  if (previous.steps.length !== next.steps.length) {
    throw new RepositoryConflictError(
      "Workflow instance step identities cannot change",
      { instanceId: next.instanceId },
    );
  }
  for (const [index, previousStep] of previous.steps.entries()) {
    const nextStep = next.steps[index];
    if (nextStep?.stepId !== previousStep.stepId) {
      throw new RepositoryConflictError(
        "Workflow instance step identities cannot change",
        { instanceId: next.instanceId },
      );
    }
    if (
      previousStep.status !== nextStep.status &&
      !isWorkflowStepTransitionAllowed(
        previousStep.status,
        nextStep.status,
      )
    ) {
      throw new RepositoryConflictError(
        "Repository rejected an invalid workflow step transition",
        { instanceId: next.instanceId, stepId: nextStep.stepId },
      );
    }
  }
}

class InMemoryWorkflowCommandReceiptRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowCommandReceiptValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getByInstanceIdAndCommandId(
    instanceId: string,
    commandId: string,
  ): Promise<WorkflowCommandReceipt | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowCommandReceipts.get(receiptKey(instanceId, commandId))),
    );
  }

  public insert(
    instanceId: string,
    receipt: WorkflowCommandReceipt,
  ): Promise<void> {
    const validation = this.#validator.validate(receipt);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow receipt failed validation");
    }
    const key = receiptKey(instanceId, validation.value.commandId);
    if (this.#state.workflowCommandReceipts.has(key)) {
      throw new RepositoryConflictError("Workflow command receipt already exists", {
        commandId: validation.value.commandId,
        instanceId,
      });
    }
    const instance = this.#state.workflowInstances.get(instanceId);
    if (
      instance?.version !== validation.value.resultingVersion ||
      !instance.receipts.some(
        (candidate) =>
          candidate.commandId === validation.value.commandId &&
          candidate.fingerprint === validation.value.fingerprint &&
          candidate.resultingVersion === validation.value.resultingVersion,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow receipt does not match the current workflow instance",
        { instanceId },
      );
    }
    const sameVersion = [...this.#state.workflowCommandReceipts.entries()].some(
      ([existingKey, existing]) =>
        existingKey.startsWith(`${instanceId}\u0000`) &&
        existing.resultingVersion === validation.value.resultingVersion,
    );
    if (sameVersion) {
      throw new RepositoryConflictError("Workflow receipt version already exists", {
        instanceId,
      });
    }
    this.#state.workflowCommandReceipts.set(key, cloneFrozen(validation.value));
    return Promise.resolve();
  }

  public listByInstanceId(
    instanceId: string,
  ): Promise<readonly WorkflowCommandReceipt[]> {
    return Promise.resolve(
      Object.freeze(
        [...this.#state.workflowCommandReceipts.entries()]
          .filter(([key]) => key.startsWith(`${instanceId}\u0000`))
          .map(([, receipt]) => cloneFrozen(receipt))
          .sort(
            (left, right) =>
              left.resultingVersion - right.resultingVersion ||
              left.commandId.localeCompare(right.commandId),
          ),
      ),
    );
  }
}

class InMemoryWorkflowEventRepository {
  readonly #draftValidator = new WorkflowEventDraftValidator();
  readonly #eventValidator = new WorkflowEventValidator();
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(draft: WorkflowEventDraft): Promise<WorkflowEvent> {
    const validation = this.#draftValidator.validate(draft);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow event draft failed validation");
    }
    if (this.#state.workflowEvents.has(validation.value.eventId)) {
      throw new RepositoryConflictError("Workflow event ID already exists", {
        eventId: validation.value.eventId,
      });
    }
    if (
      [...this.#state.workflowEvents.values()].some(
        (event) =>
          event.instanceId === validation.value.instanceId &&
          event.commandId === validation.value.commandId,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow command event already exists",
        {
          commandId: validation.value.commandId,
          instanceId: validation.value.instanceId,
        },
      );
    }
    const instance = this.#state.workflowInstances.get(
      validation.value.instanceId,
    );
    if (
      instance?.definitionId !== validation.value.definitionId ||
      instance.version !== validation.value.instanceVersion ||
      !instance.receipts.some(
        (receipt) =>
          receipt.commandId === validation.value.commandId &&
          receipt.resultingVersion === validation.value.instanceVersion,
      ) ||
      !this.#state.workflowCommandReceipts.has(
        receiptKey(
          validation.value.instanceId,
          validation.value.commandId,
        ),
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow event does not match the current workflow instance",
        { instanceId: validation.value.instanceId },
      );
    }
    this.#state.workflowEventSequence += 1;
    const eventValidation = this.#eventValidator.validate({
      ...validation.value,
      sequence: this.#state.workflowEventSequence,
    });
    if (!eventValidation.ok) {
      throw new RepositoryValidationError("Workflow event failed validation");
    }
    const event = cloneFrozen(eventValidation.value);
    this.#state.workflowEvents.set(event.eventId, event);
    return Promise.resolve(cloneFrozen(event));
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError("Workflow event list limit is invalid");
    }
    return Promise.resolve(
      Object.freeze(
        [...this.#state.workflowEvents.values()]
          .filter((event) => event.instanceId === instanceId)
          .sort((left, right) => left.sequence - right.sequence)
          .slice(0, limit)
          .map((event) => cloneFrozen(event)),
      ),
    );
  }
}

class InMemoryWorkflowApprovalCheckpointRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowApprovalCheckpointValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(evidenceId: string): Promise<WorkflowApprovalCheckpoint | undefined> {
    return Promise.resolve(cloneOptional(this.#state.workflowApprovalCheckpoints.get(evidenceId)));
  }

  public insert(checkpoint: WorkflowApprovalCheckpoint): Promise<void> {
    const validation = this.#validator.validate(checkpoint);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow approval checkpoint failed validation");
    }
    if (this.#state.workflowApprovalCheckpoints.has(validation.value.evidenceId)) {
      throw new RepositoryConflictError("Workflow approval checkpoint ID already exists");
    }
    if (!this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance does not exist");
    }
    this.#state.workflowApprovalCheckpoints.set(
      validation.value.evidenceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowApprovalCheckpoint[]> {
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowApprovalCheckpoints.values()]
        .filter((entry) => entry.instanceId === instanceId && entry.instanceVersion === instanceVersion && entry.stepId === stepId)
        .map((entry) => cloneFrozen(entry)),
    ));
  }
}

class InMemoryWorkflowGuardianCheckpointRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowGuardianCheckpointValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(evidenceId: string): Promise<WorkflowGuardianCheckpoint | undefined> {
    return Promise.resolve(cloneOptional(this.#state.workflowGuardianCheckpoints.get(evidenceId)));
  }

  public insert(checkpoint: WorkflowGuardianCheckpoint): Promise<void> {
    const validation = this.#validator.validate(checkpoint);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow Guardian checkpoint failed validation");
    }
    if (this.#state.workflowGuardianCheckpoints.has(validation.value.evidenceId)) {
      throw new RepositoryConflictError("Workflow Guardian checkpoint ID already exists");
    }
    if (!this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance does not exist");
    }
    this.#state.workflowGuardianCheckpoints.set(
      validation.value.evidenceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowGuardianCheckpoint[]> {
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowGuardianCheckpoints.values()]
        .filter((entry) => entry.instanceId === instanceId && entry.instanceVersion === instanceVersion && entry.stepId === stepId)
        .map((entry) => cloneFrozen(entry)),
    ));
  }
}

class InMemoryWorkflowControlCheckpointEventRepository {
  readonly #draftValidator = new WorkflowControlCheckpointEventDraftValidator();
  readonly #eventValidator = new WorkflowControlCheckpointEventValidator();
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(draft: WorkflowControlCheckpointEventDraft): Promise<WorkflowControlCheckpointEvent> {
    const validation = this.#draftValidator.validate(draft);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow control checkpoint event failed validation");
    }
    if (
      this.#state.workflowControlCheckpointEvents.has(validation.value.eventId) ||
      [...this.#state.workflowControlCheckpointEvents.values()].some(
        (event) => event.checkpointKind === validation.value.checkpointKind && event.checkpointId === validation.value.checkpointId,
      )
    ) {
      throw new RepositoryConflictError("Workflow control checkpoint event already exists");
    }
    const exists = validation.value.checkpointKind === "APPROVAL"
      ? this.#state.workflowApprovalCheckpoints.has(validation.value.checkpointId)
      : this.#state.workflowGuardianCheckpoints.has(validation.value.checkpointId);
    if (!exists) {
      throw new RepositoryConflictError("Workflow control checkpoint does not exist");
    }
    this.#state.workflowControlCheckpointEventSequence += 1;
    const event = this.#eventValidator.validate({
      ...validation.value,
      sequence: this.#state.workflowControlCheckpointEventSequence,
    });
    if (!event.ok) {
      throw new RepositoryValidationError("Workflow control checkpoint event failed validation");
    }
    this.#state.workflowControlCheckpointEvents.set(event.value.eventId, cloneFrozen(event.value));
    return Promise.resolve(cloneFrozen(event.value));
  }

  public getByCheckpoint(
    checkpointKind: WorkflowControlCheckpointEvent["checkpointKind"],
    checkpointId: string,
  ): Promise<WorkflowControlCheckpointEvent | undefined> {
    return Promise.resolve(cloneOptional(
      [...this.#state.workflowControlCheckpointEvents.values()].find(
        (event) => event.checkpointKind === checkpointKind && event.checkpointId === checkpointId,
      ),
    ));
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowControlCheckpointEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError("Workflow control checkpoint event limit is invalid");
    }
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowControlCheckpointEvents.values()]
        .filter((event) => event.instanceId === instanceId)
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, limit)
        .map((event) => cloneFrozen(event)),
    ));
  }
}

function createState(): RepositoryState {
  return {
    audits: new Map(),
    requests: new Map(),
    tasks: new Map(),
    workflowCommandReceipts: new Map(),
    workflowApprovalCheckpoints: new Map(),
    workflowControlCheckpointEvents: new Map(),
    workflowControlCheckpointEventSequence: 0,
    workflowDefinitions: new Map(),
    workflowEventSequence: 0,
    workflowEvents: new Map(),
    workflowInstances: new Map(),
    workflowGuardianCheckpoints: new Map(),
    workflowAgentInvocations: new Map(),
    workflowAgentInvocationEvents: new Map(),
    workflowStepOutcomes: new Map(),
    workflowLifecycleRecords: new Map(),
    workflowLifecycleEvents: new Map(),
  };
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    audits: new Map(
      [...state.audits].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    requests: new Map(
      [...state.requests].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    tasks: new Map(
      [...state.tasks].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowCommandReceipts: new Map(
      [...state.workflowCommandReceipts].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowApprovalCheckpoints: new Map(
      [...state.workflowApprovalCheckpoints].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowControlCheckpointEvents: new Map(
      [...state.workflowControlCheckpointEvents].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowControlCheckpointEventSequence: state.workflowControlCheckpointEventSequence,
    workflowDefinitions: new Map(
      [...state.workflowDefinitions].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowEventSequence: state.workflowEventSequence,
    workflowEvents: new Map(
      [...state.workflowEvents].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowInstances: new Map(
      [...state.workflowInstances].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowGuardianCheckpoints: new Map(
      [...state.workflowGuardianCheckpoints].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowAgentInvocations: new Map([...state.workflowAgentInvocations].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowAgentInvocationEvents: new Map([...state.workflowAgentInvocationEvents].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowStepOutcomes: new Map([...state.workflowStepOutcomes].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowLifecycleRecords: new Map([...state.workflowLifecycleRecords].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowLifecycleEvents: new Map([...state.workflowLifecycleEvents].map(([key, value]) => [key, cloneFrozen(value)])),
  };
}

function receiptKey(instanceId: string, commandId: string): string {
  return `${instanceId}\u0000${commandId}`;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneFrozen(value);
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
