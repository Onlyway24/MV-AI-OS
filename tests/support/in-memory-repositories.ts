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

const REQUEST_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

interface RepositoryState {
  readonly audits: Map<string, AuditEvent>;
  readonly requests: Map<string, StoredRequest>;
  readonly tasks: Map<string, TaskRecord>;
  readonly workflowCommandReceipts: Map<string, WorkflowCommandReceipt>;
  readonly workflowDefinitions: Map<string, WorkflowDefinition>;
  readonly workflowEvents: Map<string, WorkflowEvent>;
  readonly workflowInstances: Map<string, WorkflowInstance>;
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
      definitions: new InMemoryWorkflowDefinitionRepository(state),
      events: new InMemoryWorkflowEventRepository(state),
      instances: new InMemoryWorkflowInstanceRepository(state),
      receipts: new InMemoryWorkflowCommandReceiptRepository(state),
    }),
  });
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
    assertAllowedWorkflowInstanceTransition(existing, validation.value);
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
): void {
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

function createState(): RepositoryState {
  return {
    audits: new Map(),
    requests: new Map(),
    tasks: new Map(),
    workflowCommandReceipts: new Map(),
    workflowDefinitions: new Map(),
    workflowEventSequence: 0,
    workflowEvents: new Map(),
    workflowInstances: new Map(),
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
