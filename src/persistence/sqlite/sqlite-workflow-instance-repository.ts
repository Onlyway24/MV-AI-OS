import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { WorkflowInstance } from "../../workflows/runtime/workflow-runtime.js";
import {
  isWorkflowStepTransitionAllowed,
  isWorkflowTransitionAllowed,
} from "../../workflows/runtime/deterministic-workflow-state-machine.js";
import type {
  WorkflowInstanceRepository,
  WorkflowInstanceUpdateExpectation,
} from "../../workflows/runtime/workflow-persistence.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import {
  readIntegerColumn,
  readTextColumn,
  SqliteRecordCodec,
} from "./sqlite-record-codec.js";
import {
  assertActiveTransaction,
  type SqliteTransactionScope,
} from "./sqlite-transaction-scope.js";

export class SqliteWorkflowInstanceRepository
  implements WorkflowInstanceRepository
{
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

  public getById(
    instanceId: string,
  ): Promise<WorkflowInstance | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("workflow_instance.get_by_id", () => {
        const row = this.#selectById(instanceId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(instance: WorkflowInstance): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowInstance(instance);
    withSqliteErrors("workflow_instance.insert", () => {
      if (
        encoded.value.version !== 0 ||
        encoded.value.receipts.length !== 0
      ) {
        throw new RepositoryValidationError(
          "A new workflow instance cannot contain processed commands",
          { instanceId: encoded.value.instanceId },
        );
      }
      if (this.#selectById(encoded.value.instanceId) !== undefined) {
        throw new RepositoryConflictError("Workflow instance ID already exists", {
          instanceId: encoded.value.instanceId,
        });
      }
      try {
        this.#database
          .prepare(
            "INSERT INTO workflow_instances (instance_id, definition_id, status, version, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(
            encoded.value.instanceId,
            encoded.value.definitionId,
            encoded.value.status,
            encoded.value.version,
            encoded.value.updatedAt,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError(
            "Workflow instance identity or definition is invalid",
            { instanceId: encoded.value.instanceId },
          );
        }
        throw new SqliteRepositoryError(
          "SQLite workflow instance insertion failed",
          "workflow_instance.insert",
        );
      }
    });
    return Promise.resolve();
  }

  public update(
    instance: WorkflowInstance,
    expectation: WorkflowInstanceUpdateExpectation,
  ): Promise<void> {
    assertActiveTransaction(this.#scope);
    assertExpectedVersion(expectation);
    const encoded = this.#codec.encodeWorkflowInstance(instance);
    withSqliteErrors("workflow_instance.update", () => {
      const existingRow = this.#selectById(encoded.value.instanceId);
      if (existingRow === undefined) {
        throw new RepositoryConflictError("Workflow instance does not exist", {
          instanceId: encoded.value.instanceId,
        });
      }
      const existing = this.#decodeRow(existingRow);
      if (existing.version !== expectation.version) {
        throw new RepositoryConflictError("Workflow version changed after read", {
          actualVersion: existing.version,
          expectedVersion: expectation.version,
          instanceId: encoded.value.instanceId,
        });
      }
      if (encoded.value.version !== expectation.version + 1) {
        throw new RepositoryConflictError(
          "Workflow version must increment exactly once",
          {
            expectedVersion: expectation.version,
            instanceId: encoded.value.instanceId,
            nextVersion: encoded.value.version,
          },
        );
      }
      assertImmutableInstanceFields(existing, encoded.value);
      assertAllowedInstanceTransition(existing, encoded.value);
      const result = this.#database
        .prepare(
          "UPDATE workflow_instances SET status = ?, version = ?, updated_at = ?, record_json = ? WHERE instance_id = ? AND version = ?",
        )
        .run(
          encoded.value.status,
          encoded.value.version,
          encoded.value.updatedAt,
          encoded.json,
          encoded.value.instanceId,
          expectation.version,
        );
      if (!isSingleChange(result.changes)) {
        throw new RepositoryConflictError("Workflow version changed during update", {
          instanceId: encoded.value.instanceId,
        });
      }
    });
    return Promise.resolve();
  }

  #selectById(
    instanceId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT instance_id, definition_id, status, version, updated_at, record_json FROM workflow_instances WHERE instance_id = ?",
      )
      .get(instanceId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): WorkflowInstance {
    const instance = this.#codec.decodeWorkflowInstance(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "instance_id") !== instance.instanceId ||
      readTextColumn(row, "definition_id") !== instance.definitionId ||
      readTextColumn(row, "status") !== instance.status ||
      readIntegerColumn(row, "version") !== instance.version ||
      readTextColumn(row, "updated_at") !== instance.updatedAt
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow instance columns do not match the stored record",
        { instanceId: instance.instanceId },
      );
    }
    return instance;
  }
}

function assertExpectedVersion(
  expectation: WorkflowInstanceUpdateExpectation,
): void {
  if (
    typeof expectation.version !== "number" ||
    !Number.isSafeInteger(expectation.version) ||
    expectation.version < 0
  ) {
    throw new RepositoryValidationError(
      "Workflow update expectation failed validation",
    );
  }
}

function assertImmutableInstanceFields(
  previous: WorkflowInstance,
  next: WorkflowInstance,
): void {
  if (
    previous.definitionId !== next.definitionId ||
    previous.instanceId !== next.instanceId ||
    previous.createdAt !== next.createdAt
  ) {
    throw new RepositoryConflictError(
      "Workflow instance identity fields cannot be changed",
      { instanceId: next.instanceId },
    );
  }
}

function assertAllowedInstanceTransition(
  previous: WorkflowInstance,
  next: WorkflowInstance,
): void {
  if (
    previous.status !== next.status &&
    !isWorkflowTransitionAllowed(previous.status, next.status)
  ) {
    throw new RepositoryConflictError(
      "Repository rejected an invalid workflow transition",
      {
        from: previous.status,
        instanceId: next.instanceId,
        to: next.status,
      },
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
        {
          from: previousStep.status,
          instanceId: next.instanceId,
          stepId: nextStep.stepId,
          to: nextStep.status,
        },
      );
    }
  }
}

function isSingleChange(value: number | bigint): boolean {
  return value === 1 || value === 1n;
}
