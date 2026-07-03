import type { DatabaseSync } from "node:sqlite";

import type {
  TaskRecord,
  TaskState,
} from "../../core/models/task.js";
import { isTaskTransitionAllowed } from "../../core/models/task.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import { isRfc3339Timestamp } from "../../validation/primitives.js";
import type {
  TaskRepository,
  TaskUpdateExpectation,
} from "../task-repository.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import {
  readTextColumn,
  SqliteRecordCodec,
} from "./sqlite-record-codec.js";
import {
  assertActiveTransaction,
  type SqliteTransactionScope,
} from "./sqlite-transaction-scope.js";

const TASK_STATES = new Set<TaskState>([
  "awaiting_approval",
  "awaiting_input",
  "cancelled",
  "completed",
  "context_ready",
  "failed",
  "received",
  "routed",
  "running",
  "validated",
  "workflow_pending",
]);

export class SqliteTaskRepository implements TaskRepository {
  readonly #codec: SqliteRecordCodec;
  readonly #database: DatabaseSync;
  readonly #scope: SqliteTransactionScope;

  public constructor(
    database: DatabaseSync,
    scope: SqliteTransactionScope,
    codec: SqliteRecordCodec,
  ) {
    this.#codec = codec;
    this.#database = database;
    this.#scope = scope;
  }

  public getById(taskId: string): Promise<TaskRecord | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("task.get_by_id", () => {
        const row = this.#database
          .prepare(
            "SELECT task_id, request_id, state, updated_at, record_json FROM tasks WHERE task_id = ?",
          )
          .get(taskId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public getByRequestId(
    requestId: string,
  ): Promise<TaskRecord | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("task.get_by_request_id", () => {
        const row = this.#database
          .prepare(
            "SELECT task_id, request_id, state, updated_at, record_json FROM tasks WHERE request_id = ?",
          )
          .get(requestId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(task: TaskRecord): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeTask(task);
    withSqliteErrors("task.insert", () => {
      if (this.#selectByTaskId(encoded.value.taskId) !== undefined) {
        throw new RepositoryConflictError("Task ID already exists", {
          taskId: encoded.value.taskId,
        });
      }
      if (
        this.#selectByRequestId(encoded.value.requestId) !== undefined
      ) {
        throw new RepositoryConflictError(
          "A task already exists for the request ID",
          { requestId: encoded.value.requestId },
        );
      }
      try {
        this.#database
          .prepare(
            "INSERT INTO tasks (task_id, request_id, state, updated_at, record_json) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            encoded.value.taskId,
            encoded.value.requestId,
            encoded.value.state,
            encoded.value.updatedAt,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError(
            "Task identity already exists",
            { taskId: encoded.value.taskId },
          );
        }
        throw new SqliteRepositoryError(
          "SQLite task insertion failed",
          "task.insert",
        );
      }
    });
    return Promise.resolve();
  }

  public update(
    task: TaskRecord,
    expectation: TaskUpdateExpectation,
  ): Promise<void> {
    assertActiveTransaction(this.#scope);
    validateExpectation(expectation);
    const encoded = this.#codec.encodeTask(task);
    withSqliteErrors("task.update", () => {
      const existingRow = this.#selectByTaskId(encoded.value.taskId);
      if (existingRow === undefined) {
        throw new RepositoryConflictError("Task does not exist", {
          taskId: encoded.value.taskId,
        });
      }
      const existing = this.#decodeRow(existingRow);
      if (
        existing.state !== expectation.state ||
        existing.updatedAt !== expectation.updatedAt
      ) {
        throw new RepositoryConflictError(
          "Task changed after it was read",
          {
            actualState: existing.state,
            expectedState: expectation.state,
            taskId: encoded.value.taskId,
          },
        );
      }
      validateOwnership(existing, encoded.value);
      if (
        !isTaskTransitionAllowed(existing.state, encoded.value.state)
      ) {
        throw new RepositoryConflictError(
          "Repository rejected an invalid task transition",
          {
            from: existing.state,
            taskId: encoded.value.taskId,
            to: encoded.value.state,
          },
        );
      }

      const result = this.#database
        .prepare(
          "UPDATE tasks SET state = ?, updated_at = ?, record_json = ? WHERE task_id = ? AND state = ? AND updated_at = ?",
        )
        .run(
          encoded.value.state,
          encoded.value.updatedAt,
          encoded.json,
          encoded.value.taskId,
          expectation.state,
          expectation.updatedAt,
        );
      if (!isSingleChange(result.changes)) {
        throw new RepositoryConflictError(
          "Task changed during update",
          { taskId: encoded.value.taskId },
        );
      }
    });
    return Promise.resolve();
  }

  #selectByTaskId(
    taskId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT task_id, request_id, state, updated_at, record_json FROM tasks WHERE task_id = ?",
      )
      .get(taskId);
  }

  #selectByRequestId(
    requestId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT task_id, request_id, state, updated_at, record_json FROM tasks WHERE request_id = ?",
      )
      .get(requestId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): TaskRecord {
    const task = this.#codec.decodeTask(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "task_id") !== task.taskId ||
      readTextColumn(row, "request_id") !== task.requestId ||
      readTextColumn(row, "state") !== task.state ||
      readTextColumn(row, "updated_at") !== task.updatedAt
    ) {
      throw new RepositoryValidationError(
        "SQLite task columns do not match the stored record",
        { taskId: task.taskId },
      );
    }
    return task;
  }
}

function validateExpectation(expectation: TaskUpdateExpectation): void {
  if (
    !TASK_STATES.has(expectation.state) ||
    !isRfc3339Timestamp(expectation.updatedAt)
  ) {
    throw new RepositoryValidationError(
      "Task update expectation failed validation",
    );
  }
}

function validateOwnership(
  existing: TaskRecord,
  next: TaskRecord,
): void {
  if (
    existing.requestId !== next.requestId ||
    existing.correlationId !== next.correlationId ||
    existing.workspaceId !== next.workspaceId ||
    existing.actorId !== next.actorId ||
    existing.createdAt !== next.createdAt
  ) {
    throw new RepositoryConflictError(
      "Task ownership fields cannot be changed",
      { taskId: next.taskId },
    );
  }
}

function isSingleChange(value: number | bigint): boolean {
  return value === 1 || value === 1n;
}
