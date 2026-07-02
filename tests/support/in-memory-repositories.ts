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

const REQUEST_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

interface RepositoryState {
  readonly audits: Map<string, AuditEvent>;
  readonly requests: Map<string, StoredRequest>;
  readonly tasks: Map<string, TaskRecord>;
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

function createState(): RepositoryState {
  return {
    audits: new Map(),
    requests: new Map(),
    tasks: new Map(),
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
  };
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
