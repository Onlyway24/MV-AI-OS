import { describe, expect, it } from "vitest";

import {
  STORED_REQUEST_SCHEMA_VERSION,
  createTask,
  transitionTask,
  type AuditEvent,
  type RepositoryTransactionRunner,
  type StoredRequest,
  type TaskRecord,
  type TaskResponse,
} from "../../src/index.js";
import { createRequest } from "../support/fixtures.js";

export type RepositoryFactory = () => RepositoryTransactionRunner;

export function runRepositoryConformance(
  name: string,
  createRunner: RepositoryFactory,
): void {
  describe(`${name} repository conformance`, () => {
    it("persists tasks and applies optimistic state transitions", async () => {
      const runner = createRunner();
      const received = taskFixture();
      const validated = transitionTask(
        received,
        "validated",
        "2026-07-02T10:00:02.000Z",
      );

      await runner.transaction(async ({ tasks }) => {
        await tasks.insert(received);
      });
      await runner.transaction(async ({ tasks }) => {
        await tasks.update(validated, {
          state: received.state,
          updatedAt: received.updatedAt,
        });
      });

      const stored = await runner.transaction(({ tasks }) =>
        tasks.getById(received.taskId),
      );
      const byRequest = await runner.transaction(({ tasks }) =>
        tasks.getByRequestId(received.requestId),
      );
      expect(stored).toEqual(validated);
      expect(byRequest).toEqual(validated);
      expect(Object.isFrozen(stored)).toBe(true);
    });

    it("rejects duplicate tasks with a normalized repository conflict", async () => {
      const runner = createRunner();
      const task = taskFixture();
      await runner.transaction(({ tasks }) => tasks.insert(task));

      await expect(
        runner.transaction(({ tasks }) => tasks.insert(task)),
      ).rejects.toMatchObject({
        category: "conflict",
        code: "repository_conflict",
        stage: "persistence",
      });
    });

    it("rejects invalid task transitions without changing stored state", async () => {
      const runner = createRunner();
      const received = taskFixture();
      const invalid = {
        ...received,
        state: "completed",
        updatedAt: "2026-07-02T10:00:02.000Z",
      } as TaskRecord;
      await runner.transaction(({ tasks }) => tasks.insert(received));

      await expect(
        runner.transaction(({ tasks }) =>
          tasks.update(invalid, {
            state: received.state,
            updatedAt: received.updatedAt,
          }),
        ),
      ).rejects.toMatchObject({
        code: "repository_conflict",
      });
      await expect(
        runner.transaction(({ tasks }) => tasks.getById(received.taskId)),
      ).resolves.toEqual(received);
    });

    it("stores one response for an idempotent request", async () => {
      const runner = createRunner();
      const request = storedRequestFixture();
      const response = responseFixture();
      await runner.transaction(({ requests }) => requests.insert(request));
      await runner.transaction(({ requests }) =>
        requests.saveResponse(
          request.requestId,
          request.taskId,
          response,
          response.updatedAt,
        ),
      );

      const stored = await runner.transaction(({ requests }) =>
        requests.getById(request.requestId),
      );
      expect(stored?.response).toEqual(response);
      await expect(
        runner.transaction(({ requests }) =>
          requests.saveResponse(
            request.requestId,
            request.taskId,
            response,
            response.updatedAt,
          ),
        ),
      ).rejects.toMatchObject({
        code: "repository_conflict",
      });
    });

    it("rejects duplicate request IDs", async () => {
      const runner = createRunner();
      const request = storedRequestFixture();
      await runner.transaction(({ requests }) => requests.insert(request));

      await expect(
        runner.transaction(({ requests }) =>
          requests.insert({
            ...request,
            taskId: "task-other",
          }),
        ),
      ).rejects.toMatchObject({
        category: "conflict",
        code: "request_id_conflict",
      });
    });

    it("rejects malformed stored request records", async () => {
      const runner = createRunner();
      const request = {
        ...storedRequestFixture(),
        requestFingerprint: "not-a-fingerprint",
      };

      await expect(
        runner.transaction(({ requests }) => requests.insert(request)),
      ).rejects.toMatchObject({
        category: "validation",
        code: "repository_record_invalid",
        stage: "persistence",
      });
    });

    it("appends immutable audit events by correlation ID", async () => {
      const runner = createRunner();
      const first = auditFixture("audit-001");
      const second = auditFixture("audit-002", {
        correlationId: "correlation-other",
      });
      await runner.transaction(async ({ audits }) => {
        await audits.append(first);
        await audits.append(second);
      });

      const events = await runner.transaction(({ audits }) =>
        audits.listByCorrelationId(first.correlationId),
      );
      expect(events).toEqual([first]);
      expect(Object.isFrozen(events)).toBe(true);
      expect(Object.isFrozen(events[0])).toBe(true);
    });

    it("rejects malformed audit records", async () => {
      const runner = createRunner();
      const event = auditFixture("audit-invalid", {
        occurredAt: "not-a-timestamp",
      });

      await expect(
        runner.transaction(({ audits }) => audits.append(event)),
      ).rejects.toMatchObject({
        category: "validation",
        code: "repository_record_invalid",
        stage: "persistence",
      });
    });

    it("rolls back a task transition when its audit append fails", async () => {
      const runner = createRunner();
      const received = taskFixture();
      const validated = transitionTask(
        received,
        "validated",
        "2026-07-02T10:00:02.000Z",
      );
      const audit = auditFixture("audit-rollback");
      await runner.transaction(async ({ audits, tasks }) => {
        await tasks.insert(received);
        await audits.append(audit);
      });

      await expect(
        runner.transaction(async ({ audits, tasks }) => {
          await tasks.update(validated, {
            state: received.state,
            updatedAt: received.updatedAt,
          });
          await audits.append(audit);
        }),
      ).rejects.toMatchObject({
        code: "repository_conflict",
      });

      const storedTask = await runner.transaction(({ tasks }) =>
        tasks.getById(received.taskId),
      );
      const events = await runner.transaction(({ audits }) =>
        audits.listByCorrelationId(audit.correlationId),
      );
      expect(storedTask).toEqual(received);
      expect(events).toEqual([audit]);
    });
  });
}

function taskFixture(): TaskRecord {
  return createTask(
    createRequest(),
    "task-001",
    "2026-07-02T10:00:01.000Z",
  );
}

function storedRequestFixture(): StoredRequest {
  const request = createRequest();
  return {
    createdAt: "2026-07-02T10:00:01.000Z",
    requestFingerprint:
      "c320ee51f3a595322c9bcbe308d69eb3af293ffb9c4e8e0dd4f19126616cc404",
    requestId: request.requestId,
    schemaVersion: STORED_REQUEST_SCHEMA_VERSION,
    taskId: "task-001",
    updatedAt: "2026-07-02T10:00:01.000Z",
  };
}

function responseFixture(): TaskResponse {
  return {
    approvals: [],
    contractVersion: "1",
    correlationId: "correlation-001",
    createdAt: "2026-07-02T10:00:01.000Z",
    requestId: "request-001",
    result: { value: "completed" },
    status: "completed",
    taskId: "task-001",
    updatedAt: "2026-07-02T10:00:02.000Z",
    warnings: [],
  };
}

function auditFixture(
  eventId: string,
  overrides: Partial<AuditEvent> = {},
): AuditEvent {
  return {
    action: "task.validate",
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-001",
    eventId,
    eventType: "task.validated",
    metadata: {},
    occurredAt: "2026-07-02T10:00:01.000Z",
    outcome: "success",
    schemaVersion: "1",
    taskId: "task-001",
    workspaceId: "workspace-local",
    ...overrides,
  };
}
