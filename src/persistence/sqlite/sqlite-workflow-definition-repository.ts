import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { WorkflowDefinition } from "../../workflows/runtime/workflow-runtime.js";
import type { WorkflowDefinitionRepository } from "../../workflows/runtime/workflow-persistence.js";
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

export class SqliteWorkflowDefinitionRepository
  implements WorkflowDefinitionRepository
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
    definitionId: string,
  ): Promise<WorkflowDefinition | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("workflow_definition.get_by_id", () => {
        const row = this.#selectById(definitionId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(definition: WorkflowDefinition): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowDefinition(definition);
    withSqliteErrors("workflow_definition.insert", () => {
      if (this.#selectById(encoded.value.definitionId) !== undefined) {
        throw new RepositoryConflictError(
          "Workflow definition ID already exists",
          { definitionId: encoded.value.definitionId },
        );
      }
      if (
        this.#selectByWorkflowIdentity(
          encoded.value.workflowId,
          encoded.value.workflowVersion,
        ) !== undefined
      ) {
        throw new RepositoryConflictError(
          "Workflow identity and version already exist",
          {
            workflowId: encoded.value.workflowId,
            workflowVersion: encoded.value.workflowVersion,
          },
        );
      }
      try {
        this.#database
          .prepare(
            "INSERT INTO workflow_definitions (definition_id, workflow_id, workflow_version, record_json) VALUES (?, ?, ?, ?)",
          )
          .run(
            encoded.value.definitionId,
            encoded.value.workflowId,
            encoded.value.workflowVersion,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError(
            "Workflow definition identity already exists",
            { definitionId: encoded.value.definitionId },
          );
        }
        throw new SqliteRepositoryError(
          "SQLite workflow definition insertion failed",
          "workflow_definition.insert",
        );
      }
    });
    return Promise.resolve();
  }

  #selectById(
    definitionId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT definition_id, workflow_id, workflow_version, record_json FROM workflow_definitions WHERE definition_id = ?",
      )
      .get(definitionId);
  }

  #selectByWorkflowIdentity(
    workflowId: string,
    workflowVersion: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT definition_id, workflow_id, workflow_version, record_json FROM workflow_definitions WHERE workflow_id = ? AND workflow_version = ?",
      )
      .get(workflowId, workflowVersion);
  }

  #decodeRow(
    row: Readonly<Record<string, unknown>>,
  ): WorkflowDefinition {
    const definition = this.#codec.decodeWorkflowDefinition(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "definition_id") !== definition.definitionId ||
      readTextColumn(row, "workflow_id") !== definition.workflowId ||
      readTextColumn(row, "workflow_version") !== definition.workflowVersion
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow definition columns do not match the stored record",
        { definitionId: definition.definitionId },
      );
    }
    return definition;
  }
}
