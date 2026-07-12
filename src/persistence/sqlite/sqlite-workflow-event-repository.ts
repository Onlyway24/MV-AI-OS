import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type {
  WorkflowEvent,
  WorkflowEventDraft,
  WorkflowEventRepository,
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

const MAX_EVENT_LIST_LIMIT = 100;

export class SqliteWorkflowEventRepository implements WorkflowEventRepository {
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

  public append(draft: WorkflowEventDraft): Promise<WorkflowEvent> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowEventDraft(draft);
    return Promise.resolve(
      withSqliteErrors("workflow_event.append", () => {
        if (this.#selectByEventId(encoded.value.eventId) !== undefined) {
          throw new RepositoryConflictError("Workflow event ID already exists", {
            eventId: encoded.value.eventId,
          });
        }
        this.#assertMatchesCurrentInstance(encoded.value);
        try {
          this.#database
            .prepare(
              "INSERT INTO workflow_events (event_id, instance_id, command_id, occurred_at, record_json) VALUES (?, ?, ?, ?, ?)",
            )
            .run(
              encoded.value.eventId,
              encoded.value.instanceId,
              encoded.value.commandId,
              encoded.value.occurredAt,
              encoded.json,
            );
        } catch (error) {
          if (isSqliteConstraintError(error)) {
            throw new RepositoryConflictError(
              "Workflow event identity or instance is invalid",
              { eventId: encoded.value.eventId },
            );
          }
          throw new SqliteRepositoryError(
            "SQLite workflow event insertion failed",
            "workflow_event.append",
          );
        }
        const row = this.#selectByEventId(encoded.value.eventId);
        if (row === undefined) {
          throw new SqliteRepositoryError(
            "SQLite workflow event could not be reloaded",
            "workflow_event.append",
          );
        }
        return this.#decodeRow(row);
      }),
    );
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowEvent[]> {
    assertActiveTransaction(this.#scope);
    assertListLimit(limit);
    return Promise.resolve(
      withSqliteErrors("workflow_event.list_by_instance", () => {
        const rows = this.#database
          .prepare(
            "SELECT sequence, event_id, instance_id, command_id, occurred_at, record_json FROM (SELECT sequence, event_id, instance_id, command_id, occurred_at, record_json FROM workflow_events WHERE instance_id = ? ORDER BY sequence DESC LIMIT ?) ORDER BY sequence ASC",
          )
          .all(instanceId, limit);
        return Object.freeze(rows.map((row) => this.#decodeRow(row)));
      }),
    );
  }

  #selectByEventId(
    eventId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT sequence, event_id, instance_id, command_id, occurred_at, record_json FROM workflow_events WHERE event_id = ?",
      )
      .get(eventId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): WorkflowEvent {
    const draft = this.#codec.decodeWorkflowEventDraft(
      readTextColumn(row, "record_json"),
    );
    const event = this.#codec.validateWorkflowEvent({
      ...draft,
      sequence: readIntegerColumn(row, "sequence"),
    });
    if (
      readTextColumn(row, "event_id") !== event.eventId ||
      readTextColumn(row, "instance_id") !== event.instanceId ||
      readTextColumn(row, "command_id") !== event.commandId ||
      readTextColumn(row, "occurred_at") !== event.occurredAt
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow event columns do not match the stored record",
        { eventId: event.eventId },
      );
    }
    return event;
  }

  #assertMatchesCurrentInstance(draft: WorkflowEventDraft): void {
    const row = this.#database
      .prepare(
        "SELECT definition_id, version, record_json FROM workflow_instances WHERE instance_id = ?",
      )
      .get(draft.instanceId);
    if (row === undefined) {
      throw new RepositoryConflictError("Workflow instance does not exist", {
        instanceId: draft.instanceId,
      });
    }
    const instance = this.#codec.decodeWorkflowInstance(
      readTextColumn(row, "record_json"),
    );
    const matchingReceipt = instance.receipts.find(
      (receipt) =>
        receipt.commandId === draft.commandId &&
        receipt.resultingVersion === draft.instanceVersion,
    );
    const receiptRow = this.#database
      .prepare(
        "SELECT command_id, resulting_version FROM workflow_command_receipts WHERE instance_id = ? AND command_id = ?",
      )
      .get(draft.instanceId, draft.commandId);
    if (
      readTextColumn(row, "definition_id") !== draft.definitionId ||
      readIntegerColumn(row, "version") !== draft.instanceVersion ||
      instance.version !== draft.instanceVersion ||
      matchingReceipt === undefined ||
      receiptRow === undefined ||
      readTextColumn(receiptRow, "command_id") !== draft.commandId ||
      readIntegerColumn(receiptRow, "resulting_version") !==
        draft.instanceVersion
    ) {
      throw new RepositoryConflictError(
        "Workflow event does not match the current workflow instance",
        { instanceId: draft.instanceId },
      );
    }
  }
}

function assertListLimit(limit: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_EVENT_LIST_LIMIT
  ) {
    throw new RepositoryValidationError("Workflow event list limit is invalid");
  }
}
