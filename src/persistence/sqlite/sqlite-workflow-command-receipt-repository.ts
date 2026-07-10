import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { WorkflowCommandReceipt } from "../../workflows/runtime/workflow-runtime.js";
import type { WorkflowCommandReceiptRepository } from "../../workflows/runtime/workflow-persistence.js";
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

export class SqliteWorkflowCommandReceiptRepository
  implements WorkflowCommandReceiptRepository
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

  public getByInstanceIdAndCommandId(
    instanceId: string,
    commandId: string,
  ): Promise<WorkflowCommandReceipt | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("workflow_receipt.get_by_command", () => {
        const row = this.#selectByCommand(instanceId, commandId);
        return row === undefined ? undefined : this.#decodeRow(row, instanceId);
      }),
    );
  }

  public insert(
    instanceId: string,
    receipt: WorkflowCommandReceipt,
  ): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowCommandReceipt(receipt);
    withSqliteErrors("workflow_receipt.insert", () => {
      if (
        this.#selectByCommand(instanceId, encoded.value.commandId) !==
        undefined
      ) {
        throw new RepositoryConflictError(
          "Workflow command receipt already exists",
          { commandId: encoded.value.commandId, instanceId },
        );
      }
      this.#assertBelongsToCurrentInstance(instanceId, encoded.value);
      try {
        this.#database
          .prepare(
            "INSERT INTO workflow_command_receipts (instance_id, command_id, fingerprint, resulting_version, record_json) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            instanceId,
            encoded.value.commandId,
            encoded.value.fingerprint,
            encoded.value.resultingVersion,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError(
            "Workflow command receipt already exists or is invalid",
            { commandId: encoded.value.commandId, instanceId },
          );
        }
        throw new SqliteRepositoryError(
          "SQLite workflow command receipt insertion failed",
          "workflow_receipt.insert",
        );
      }
    });
    return Promise.resolve();
  }

  public listByInstanceId(
    instanceId: string,
  ): Promise<readonly WorkflowCommandReceipt[]> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("workflow_receipt.list_by_instance", () => {
        const rows = this.#database
          .prepare(
            "SELECT instance_id, command_id, fingerprint, resulting_version, record_json FROM workflow_command_receipts WHERE instance_id = ? ORDER BY resulting_version ASC, command_id ASC",
          )
          .all(instanceId);
        return Object.freeze(
          rows.map((row) => this.#decodeRow(row, instanceId)),
        );
      }),
    );
  }

  #selectByCommand(
    instanceId: string,
    commandId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT instance_id, command_id, fingerprint, resulting_version, record_json FROM workflow_command_receipts WHERE instance_id = ? AND command_id = ?",
      )
      .get(instanceId, commandId);
  }

  #decodeRow(
    row: Readonly<Record<string, unknown>>,
    expectedInstanceId: string,
  ): WorkflowCommandReceipt {
    const receipt = this.#codec.decodeWorkflowCommandReceipt(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "instance_id") !== expectedInstanceId ||
      readTextColumn(row, "command_id") !== receipt.commandId ||
      readTextColumn(row, "fingerprint") !== receipt.fingerprint ||
      readIntegerColumn(row, "resulting_version") !== receipt.resultingVersion
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow receipt columns do not match the stored record",
        { instanceId: expectedInstanceId },
      );
    }
    return receipt;
  }

  #assertBelongsToCurrentInstance(
    instanceId: string,
    receipt: WorkflowCommandReceipt,
  ): void {
    const row = this.#database
      .prepare(
        "SELECT record_json FROM workflow_instances WHERE instance_id = ?",
      )
      .get(instanceId);
    if (row === undefined) {
      throw new RepositoryConflictError("Workflow instance does not exist", {
        instanceId,
      });
    }
    const instance = this.#codec.decodeWorkflowInstance(
      readTextColumn(row, "record_json"),
    );
    const matchingReceipt = instance.receipts.find(
      (candidate) =>
        candidate.commandId === receipt.commandId &&
        candidate.fingerprint === receipt.fingerprint &&
        candidate.resultingVersion === receipt.resultingVersion,
    );
    if (
      matchingReceipt === undefined ||
      instance.version !== receipt.resultingVersion
    ) {
      throw new RepositoryConflictError(
        "Workflow receipt does not match the current workflow instance",
        { commandId: receipt.commandId, instanceId },
      );
    }
  }
}
