import { describe, expect, it } from "vitest";

import {
  AuditEventValidator,
  type AuditEvent,
} from "../../src/index.js";

describe("AuditEventValidator", () => {
  const validator = new AuditEventValidator();

  it("accepts the versioned durable audit contract", () => {
    expect(validator.validate(createAuditEvent())).toEqual({
      ok: true,
      value: createAuditEvent(),
    });
  });

  it("rejects unsupported versions, outcomes, and timestamps", () => {
    const result = validator.validate({
      ...createAuditEvent(),
      contractVersion: "2",
      occurredAt: "2026-07-02T12:00:00+02:00",
      outcome: "unknown",
      schemaVersion: "2",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported_version",
            path: "contractVersion",
          }),
          expect.objectContaining({
            code: "unsupported_version",
            path: "schemaVersion",
          }),
          expect.objectContaining({
            code: "invalid_value",
            path: "outcome",
          }),
          expect.objectContaining({
            code: "invalid_timestamp",
            path: "occurredAt",
          }),
        ]),
      );
    }
  });
});

function createAuditEvent(): AuditEvent {
  return {
    action: "task.validate",
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-001",
    eventId: "audit-001",
    eventType: "task.validated",
    metadata: {},
    occurredAt: "2026-07-02T10:00:01.000Z",
    outcome: "success",
    schemaVersion: "1",
    subject: {
      requestId: "request-001",
      taskId: "task-001",
    },
    taskId: "task-001",
    workspaceId: "workspace-local",
  };
}
