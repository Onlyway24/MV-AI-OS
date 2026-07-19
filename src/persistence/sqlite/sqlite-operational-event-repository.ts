import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type {
  OperationalEvent,
  OperationalEventCursorWindow,
  OperationalEventDraft,
  OperationalEventType,
} from "../../operations-runtime/operational-event.js";
import type { OperationalEventRepository } from "../../operations-runtime/operational-event-repository.js";
import {
  OperationalEventDraftValidator,
  OperationalEventValidator,
} from "../../operations-runtime/operational-event-validator.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

const MAX_LIST_LIMIT = 250;
const MAX_PRUNE_LIMIT = 1_000;

/** SQLite outbox adapter. The operations_events table is installed by schema migration. */
export class SqliteOperationalEventRepository implements OperationalEventRepository {
  readonly #draftValidator = new OperationalEventDraftValidator();
  readonly #eventValidator = new OperationalEventValidator();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public append(candidate: OperationalEventDraft): Promise<OperationalEvent> {
    assertActiveTransaction(this.scope);
    const event = this.#validateDraft(candidate);
    try {
      this.database.prepare(
        "INSERT INTO operations_events (event_id, workspace_id, event_type, aggregate_type, entity_id, entity_version, occurred_at, safe_summary_code, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        event.eventId,
        event.workspaceId,
        event.eventType,
        event.aggregateType,
        event.entityId,
        event.entityVersion,
        event.occurredAt,
        event.safeSummaryCode,
        JSON.stringify(event),
      );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new RepositoryConflictError("Operational event ID already exists", { eventId: event.eventId });
      }
      throw new SqliteRepositoryError("Operational event append failed", "operational_event.append");
    }
    const row = this.database.prepare(
      "SELECT sequence, event_id, workspace_id, event_type, aggregate_type, entity_id, entity_version, occurred_at, safe_summary_code, record_json FROM operations_events WHERE event_id = ?",
    ).get(event.eventId);
    if (row === undefined) throw new SqliteRepositoryError("Operational event could not be reloaded", "operational_event.append");
    return Promise.resolve(this.#decode(row));
  }

  public cursorWindow(workspaceId: string): Promise<OperationalEventCursorWindow> {
    assertActiveTransaction(this.scope);
    assertIdentifier(workspaceId, "workspace ID");
    const row = this.database.prepare(
      "SELECT MIN(sequence) AS oldest_sequence, MAX(sequence) AS latest_sequence FROM operations_events WHERE workspace_id = ?",
    ).get(workspaceId);
    const oldest = row?.oldest_sequence;
    const latest = row?.latest_sequence;
    if (oldest === null && latest === null) return Promise.resolve(Object.freeze({ latestSequence: 0 }));
    if (!positiveSequence(oldest) || !positiveSequence(latest) || oldest > latest) {
      throw new RepositoryValidationError("Operational event cursor window is corrupted");
    }
    return Promise.resolve(Object.freeze({ latestSequence: latest, oldestSequence: oldest }));
  }

  public getLatestByType(
    workspaceId: string,
    eventType: OperationalEventType,
  ): Promise<OperationalEvent | undefined> {
    assertActiveTransaction(this.scope);
    assertIdentifier(workspaceId, "workspace ID");
    const row = this.database.prepare(
      "SELECT sequence, event_id, workspace_id, event_type, aggregate_type, entity_id, entity_version, occurred_at, safe_summary_code, record_json FROM operations_events WHERE workspace_id = ? AND event_type = ? ORDER BY sequence DESC LIMIT 1",
    ).get(workspaceId, eventType);
    return Promise.resolve(row === undefined ? undefined : this.#decode(row));
  }

  public listAfter(
    workspaceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<readonly OperationalEvent[]> {
    assertActiveTransaction(this.scope);
    assertIdentifier(workspaceId, "workspace ID");
    assertCursor(afterSequence);
    assertLimit(limit, MAX_LIST_LIMIT, "list");
    const rows = this.database.prepare(
      "SELECT sequence, event_id, workspace_id, event_type, aggregate_type, entity_id, entity_version, occurred_at, safe_summary_code, record_json FROM operations_events WHERE workspace_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?",
    ).all(workspaceId, afterSequence, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decode(row))));
  }

  public pruneBefore(
    workspaceId: string,
    beforeSequence: number,
    limit: number,
  ): Promise<number> {
    assertActiveTransaction(this.scope);
    assertIdentifier(workspaceId, "workspace ID");
    if (!positiveSequence(beforeSequence)) throw new RepositoryValidationError("Operational event retention cursor is invalid");
    assertLimit(limit, MAX_PRUNE_LIMIT, "retention");
    const result = this.database.prepare(
      "DELETE FROM operations_events WHERE sequence IN (SELECT sequence FROM operations_events WHERE workspace_id = ? AND sequence < ? ORDER BY sequence ASC LIMIT ?)",
    ).run(workspaceId, beforeSequence, limit);
    if (typeof result.changes !== "number" || !Number.isSafeInteger(result.changes) || result.changes < 0 || result.changes > limit) {
      throw new RepositoryValidationError("Operational event retention result is invalid");
    }
    return Promise.resolve(result.changes);
  }

  #decode(row: Readonly<Record<string, unknown>>): OperationalEvent {
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Operational event record is corrupted");
    let draft: unknown;
    try {
      draft = JSON.parse(row.record_json) as unknown;
    } catch {
      throw new RepositoryValidationError("Operational event record is corrupted");
    }
    const sequence = row.sequence;
    const checked = this.#eventValidator.validate({ ...(record(draft) ? draft : {}), sequence });
    if (!checked.ok) throw new RepositoryValidationError("Operational event record is invalid", { issueCount: checked.issues.length });
    const event = checked.value;
    if (
      row.event_id !== event.eventId ||
      row.workspace_id !== event.workspaceId ||
      row.event_type !== event.eventType ||
      row.aggregate_type !== event.aggregateType ||
      row.entity_id !== event.entityId ||
      row.entity_version !== event.entityVersion ||
      row.occurred_at !== event.occurredAt ||
      row.safe_summary_code !== event.safeSummaryCode
    ) throw new RepositoryValidationError("Operational event columns do not match the stored record");
    return event;
  }

  #validateDraft(value: unknown): OperationalEventDraft {
    const checked = this.#draftValidator.validate(value);
    if (!checked.ok) throw new RepositoryValidationError("Operational event draft is invalid", { issueCount: checked.issues.length });
    return checked.value;
  }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function positiveSequence(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1; }
function assertCursor(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RepositoryValidationError("Operational event cursor is invalid"); }
function assertIdentifier(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError(`Operational event ${label} is invalid`); }
function assertLimit(value: unknown, maximum: number, label: string): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) throw new RepositoryValidationError(`Operational event ${label} limit is invalid`); }
