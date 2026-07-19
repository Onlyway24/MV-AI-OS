import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_EVENT_SEMANTICS,
  type OperationalEventDraft,
  type OperationalEventType,
} from "../../src/operations-runtime/operational-event.js";
import {
  OperationalEventDraftValidator,
  OperationalEventValidator,
} from "../../src/operations-runtime/operational-event-validator.js";
import { SqliteOperationalEventRepository } from "../../src/persistence/sqlite/sqlite-operational-event-repository.js";

describe("Operational Event outbox", () => {
  it("accepts only strict redaction-safe event semantics", () => {
    const draft = event("JOB_QUEUED", "event-001", "job-001", 0);
    expect(new OperationalEventDraftValidator().validate(draft)).toEqual({ ok: true, value: draft });
    expect(new OperationalEventValidator().validate({ ...draft, sequence: 1 })).toMatchObject({ ok: true });

    expect(new OperationalEventDraftValidator().validate({
      ...draft,
      prompt: "raw prompt must never enter the event plane",
    })).toMatchObject({ ok: false });
    expect(new OperationalEventDraftValidator().validate({
      ...draft,
      safeSummaryCode: "job_completed",
    })).toMatchObject({ ok: false });
    expect(new OperationalEventDraftValidator().validate({
      ...draft,
      occurredAt: "2026-99-19T01:00:01.000Z",
    })).toMatchObject({ ok: false });

    for (const [index, eventType] of ([
      "DAILY_BRIEF_GENERATED",
      "FOUNDER_WORKDAY_CREATED",
      "FOUNDER_WORKDAY_UPDATED",
    ] as const).entries()) {
      const safeDraft = event(eventType, `event-safe-${String(index)}`, `aggregate-safe-${String(index)}`, index);
      expect(new OperationalEventDraftValidator().validate(safeDraft)).toEqual({ ok: true, value: safeDraft });
      expect(new OperationalEventDraftValidator().validate({
        ...safeDraft,
        privatePayload: { objective: "must never enter the event stream" },
      })).toMatchObject({ ok: false });
    }

    expect(OPERATIONAL_EVENT_SEMANTICS.DAILY_BRIEF_GENERATED).toEqual({
      aggregateType: "DAILY_OPERATING_BRIEF",
      safeSummaryCode: "daily_brief_generated",
    });
    expect(OPERATIONAL_EVENT_SEMANTICS.FOUNDER_WORKDAY_CREATED).toEqual({
      aggregateType: "FOUNDER_WORKDAY",
      safeSummaryCode: "founder_workday_created",
    });
    expect(OPERATIONAL_EVENT_SEMANTICS.FOUNDER_WORKDAY_UPDATED).toEqual({
      aggregateType: "FOUNDER_WORKDAY",
      safeSummaryCode: "founder_workday_updated",
    });
  });

  it("assigns a monotonic cursor, scopes replay, and prunes a bounded prefix", async () => {
    const { database, repository } = harness();
    try {
      const first = await repository.append(event("JOB_QUEUED", "event-001", "job-001", 0));
      const second = await repository.append(event("JOB_LEASE_ACQUIRED", "event-002", "job-001", 1));
      await repository.append(event("HEALTH_STATE_CHANGED", "event-other", "health-other", 1, "workspace-other"));
      const third = await repository.append(event("JOB_COMPLETED", "event-003", "job-001", 2));

      expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 4]);
      await expect(repository.cursorWindow("workspace-local")).resolves.toEqual({ latestSequence: 4, oldestSequence: 1 });
      await expect(repository.listAfter("workspace-local", 1, 10)).resolves.toEqual([second, third]);
      await expect(repository.pruneBefore("workspace-local", 4, 1)).resolves.toBe(1);
      await expect(repository.cursorWindow("workspace-local")).resolves.toEqual({ latestSequence: 4, oldestSequence: 2 });
      await expect(repository.listAfter("workspace-local", 0, 10)).resolves.toEqual([second, third]);
    } finally {
      database.close();
    }
  });

  it("rejects duplicate event identity without losing the first receipt", async () => {
    const { database, repository } = harness();
    try {
      const draft = event("JOB_QUEUED", "event-duplicate", "job-duplicate", 0);
      await repository.append(draft);
      let duplicateError: unknown;
      try {
        void repository.append(draft);
      } catch (error) {
        duplicateError = error;
      }
      expect(duplicateError).toMatchObject({ code: "repository_conflict" });
      await expect(repository.listAfter("workspace-local", 0, 10)).resolves.toHaveLength(1);
    } finally {
      database.close();
    }
  });
});

function harness(): {
  readonly database: DatabaseSync;
  readonly repository: SqliteOperationalEventRepository;
} {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE operations_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_version INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      safe_summary_code TEXT NOT NULL,
      record_json TEXT NOT NULL CHECK (json_valid(record_json))
    ) STRICT;
  `);
  return {
    database,
    repository: new SqliteOperationalEventRepository(database, { active: true }),
  };
}

function event(
  eventType: OperationalEventType,
  eventId: string,
  entityId: string,
  entityVersion: number,
  workspaceId = "workspace-local",
): OperationalEventDraft {
  return {
    ...OPERATIONAL_EVENT_SEMANTICS[eventType],
    contractVersion: "1",
    entityId,
    entityVersion,
    eventId,
    eventType,
    occurredAt: "2026-07-19T01:00:00.000Z",
    workspaceId,
  };
}
