import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type {
  WorkflowControlCheckpointEvent,
  WorkflowControlCheckpointEventDraft,
} from "../../workflows/runtime/workflow-control-checkpoint.js";
import type { WorkflowControlCheckpointEventRepository } from "../../workflows/runtime/workflow-persistence.js";
import { isSqliteConstraintError, SqliteRepositoryError, withSqliteErrors } from "./sqlite-error.js";
import { readIntegerColumn, readTextColumn, SqliteRecordCodec } from "./sqlite-record-codec.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteWorkflowControlCheckpointEventRepository
  implements WorkflowControlCheckpointEventRepository
{
  readonly #codec: SqliteRecordCodec;
  readonly #database: DatabaseSync;
  readonly #scope: SqliteTransactionScope;

  public constructor(
    database: DatabaseSync,
    scope: SqliteTransactionScope,
    codec: SqliteRecordCodec,
  ) {
    this.#database = database;
    this.#scope = scope;
    this.#codec = codec;
  }

  public append(
    draft: WorkflowControlCheckpointEventDraft,
  ): Promise<WorkflowControlCheckpointEvent> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowControlCheckpointEventDraft(draft);
    return Promise.resolve(withSqliteErrors("workflow_control_checkpoint_event.append", () => {
      this.#assertCheckpointExists(encoded.value);
      try {
        this.#database.prepare(
          "INSERT INTO workflow_control_checkpoint_events (event_id, checkpoint_id, checkpoint_kind, instance_id, occurred_at, record_json) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(
          encoded.value.eventId,
          encoded.value.checkpointId,
          encoded.value.checkpointKind,
          encoded.value.instanceId,
          encoded.value.occurredAt,
          encoded.json,
        );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError("Workflow control checkpoint event already exists", {
            checkpointId: encoded.value.checkpointId,
          });
        }
        throw new SqliteRepositoryError(
          "SQLite workflow control checkpoint event insertion failed",
          "workflow_control_checkpoint_event.append",
        );
      }
      const row = this.#database.prepare(
        "SELECT sequence, event_id, checkpoint_id, checkpoint_kind, instance_id, occurred_at, record_json FROM workflow_control_checkpoint_events WHERE event_id = ?",
      ).get(encoded.value.eventId);
      if (row === undefined) {
        throw new SqliteRepositoryError(
          "SQLite workflow control checkpoint event could not be reloaded",
          "workflow_control_checkpoint_event.append",
        );
      }
      return this.#decode(row);
    }));
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowControlCheckpointEvent[]> {
    assertActiveTransaction(this.#scope);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError("Workflow control checkpoint event limit is invalid");
    }
    return Promise.resolve(withSqliteErrors("workflow_control_checkpoint_event.list", () => {
      const rows = this.#database.prepare(
        "SELECT sequence, event_id, checkpoint_id, checkpoint_kind, instance_id, occurred_at, record_json FROM workflow_control_checkpoint_events WHERE instance_id = ? ORDER BY sequence ASC LIMIT ?",
      ).all(instanceId, limit);
      return Object.freeze(rows.map((row) => this.#decode(row)));
    }));
  }

  public getByCheckpoint(
    checkpointKind: WorkflowControlCheckpointEvent["checkpointKind"],
    checkpointId: string,
  ): Promise<WorkflowControlCheckpointEvent | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(withSqliteErrors("workflow_control_checkpoint_event.get", () => {
      const row = this.#database.prepare(
        "SELECT sequence, event_id, checkpoint_id, checkpoint_kind, instance_id, occurred_at, record_json FROM workflow_control_checkpoint_events WHERE checkpoint_kind = ? AND checkpoint_id = ?",
      ).get(checkpointKind, checkpointId);
      return row === undefined ? undefined : this.#decode(row);
    }));
  }

  #assertCheckpointExists(draft: WorkflowControlCheckpointEventDraft): void {
    const table = draft.checkpointKind === "APPROVAL"
      ? "workflow_approval_checkpoints"
      : "workflow_guardian_checkpoints";
    const row = this.#database.prepare(
      `SELECT instance_id, instance_version, step_id, record_json FROM ${table} WHERE evidence_id = ?`,
    ).get(draft.checkpointId);
    if (row === undefined) {
      throw new RepositoryConflictError("Workflow control checkpoint does not exist", {
        checkpointId: draft.checkpointId,
      });
    }
    const checkpoint = draft.checkpointKind === "APPROVAL"
      ? this.#codec.decodeWorkflowApprovalCheckpoint(readTextColumn(row, "record_json"))
      : this.#codec.decodeWorkflowGuardianCheckpoint(readTextColumn(row, "record_json"));
    if (
      checkpoint.instanceId !== draft.instanceId ||
      checkpoint.instanceVersion !== draft.instanceVersion ||
      checkpoint.stepId !== draft.stepId ||
      checkpoint.recordedAt !== draft.occurredAt ||
      checkpoint.status !== draft.status
    ) {
      throw new RepositoryConflictError("Workflow control checkpoint event does not match its checkpoint", {
        checkpointId: draft.checkpointId,
      });
    }
  }

  #decode(row: Readonly<Record<string, unknown>>): WorkflowControlCheckpointEvent {
    const draft = this.#codec.decodeWorkflowControlCheckpointEventDraft(
      readTextColumn(row, "record_json"),
    );
    const event = this.#codec.validateWorkflowControlCheckpointEvent({
      ...draft,
      sequence: readIntegerColumn(row, "sequence"),
    });
    this.#assertCheckpointExists(event);
    if (
      readTextColumn(row, "event_id") !== event.eventId ||
      readTextColumn(row, "checkpoint_id") !== event.checkpointId ||
      readTextColumn(row, "checkpoint_kind") !== event.checkpointKind ||
      readTextColumn(row, "instance_id") !== event.instanceId ||
      readTextColumn(row, "occurred_at") !== event.occurredAt
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow control checkpoint event columns do not match the record",
        { eventId: event.eventId },
      );
    }
    return event;
  }
}
