import type { DatabaseSync } from "node:sqlite";

import type { AuditEvent } from "../../contracts/audit-event.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { AuditRepository } from "../audit-repository.js";
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

export class SqliteAuditRepository implements AuditRepository {
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

  public append(event: AuditEvent): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeAudit(event);
    withSqliteErrors("audit.append", () => {
      if (this.#selectByEventId(encoded.value.eventId) !== undefined) {
        throw new RepositoryConflictError(
          "Audit event ID already exists",
          { eventId: encoded.value.eventId },
        );
      }
      try {
        this.#database
          .prepare(
            "INSERT INTO audit_events (event_id, correlation_id, occurred_at, record_json) VALUES (?, ?, ?, ?)",
          )
          .run(
            encoded.value.eventId,
            encoded.value.correlationId,
            encoded.value.occurredAt,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError(
            "Audit event ID already exists",
            { eventId: encoded.value.eventId },
          );
        }
        throw new SqliteRepositoryError(
          "SQLite audit insertion failed",
          "audit.append",
        );
      }
    });
    return Promise.resolve();
  }

  public listByCorrelationId(
    correlationId: string,
  ): Promise<readonly AuditEvent[]> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("audit.list_by_correlation", () => {
        const rows = this.#database
          .prepare(
            "SELECT event_id, correlation_id, occurred_at, record_json FROM audit_events WHERE correlation_id = ? ORDER BY sequence ASC",
          )
          .all(correlationId);
        const events = rows.map((row) => this.#decodeRow(row));
        return Object.freeze(events);
      }),
    );
  }

  #selectByEventId(
    eventId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT event_id, correlation_id, occurred_at, record_json FROM audit_events WHERE event_id = ?",
      )
      .get(eventId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): AuditEvent {
    const event = this.#codec.decodeAudit(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "event_id") !== event.eventId ||
      readTextColumn(row, "correlation_id") !== event.correlationId ||
      readTextColumn(row, "occurred_at") !== event.occurredAt
    ) {
      throw new RepositoryValidationError(
        "SQLite audit columns do not match the stored record",
        { eventId: event.eventId },
      );
    }
    return event;
  }
}
