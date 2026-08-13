import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  AgentInvocationValidator,
  AgentManifestValidator,
  AgentResultValidator,
  ContentAgent,
  CONTENT_AGENT_MANIFEST,
  ContentOutputValidator,
  CoreBrain,
  createTask,
  ImmutableAgentRegistry,
  InProcessAgentRuntime,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  type RepositoryTransaction,
  SqliteRepositoryTransactionRunner,
  STORED_REQUEST_SCHEMA_VERSION,
  TaskResponseValidator,
  type AgentExecutor,
  type AgentInvocation,
  type AuditEvent,
  type IdentifierGenerator,
  type IdentifierScope,
  type StoredRequest,
} from "../../src/index.js";
import {
  FixedClock,
  RecordingLogger,
  createAllowDeclaredPolicyDependencies,
  createEmptyMemoryService,
  createRequest,
} from "../support/fixtures.js";
import { runRepositoryConformance } from "./repository-conformance.js";
import {
  MAX_SQLITE_RECORD_JSON_BYTES,
  MAX_SQLITE_RECORD_JSON_DEPTH,
  parseSqliteRecordJson,
  stringifySqliteRecordJson,
} from "../../src/persistence/sqlite/sqlite-record-codec.js";

runRepositoryConformance(
  "SQLite",
  () =>
    new SqliteRepositoryTransactionRunner({
      path: ":memory:",
      timeoutMs: 1_000,
    }),
);

describe("SQLite repository transaction runner", () => {
  it("rejects invalid connection configuration", () => {
    expect(
      () =>
        new SqliteRepositoryTransactionRunner({
          path: "",
          timeoutMs: -1,
        }),
    ).toThrow(
      expect.objectContaining({
        code: "sqlite_configuration_invalid",
      }),
    );
  });

  it("rejects database schemas newer than the runtime", async () => {
    await withTemporaryDatabase((databasePath) => {
      const database = new DatabaseSync(databasePath);
      database.exec("PRAGMA user_version = 999");
      database.close();

      expect(
        () =>
          new SqliteRepositoryTransactionRunner({
            path: databasePath,
            timeoutMs: 1_000,
          }),
      ).toThrow(
        expect.objectContaining({
          code: "sqlite_schema_unsupported",
        }),
      );
    });
  });

  it("rolls back every repository when an operation fails", async () => {
    const runner = new SqliteRepositoryTransactionRunner({
      path: ":memory:",
      timeoutMs: 1_000,
    });
    const request = createRequest();
    const task = createTask(
      request,
      "task-rollback",
      "2026-07-02T10:00:01.000Z",
    );
    const storedRequest = createStoredRequest(
      request.requestId,
      task.taskId,
    );
    const audit = createAuditEvent(task.taskId);

    await expect(
      runner.transaction(async ({ audits, requests, tasks }) => {
        await requests.insert(storedRequest);
        await tasks.insert(task);
        await audits.append(audit);
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const stored = await runner.transaction(
      async ({ audits, requests, tasks }) => ({
        audits: await audits.listByCorrelationId(audit.correlationId),
        request: await requests.getById(request.requestId),
        task: await tasks.getById(task.taskId),
      }),
    );
    expect(stored).toEqual({
      audits: [],
      request: undefined,
      task: undefined,
    });
    await runner.close();
  });

  it("rejects malformed task records before storage", async () => {
    const runner = createRunner(":memory:");
    const task = createTask(
      createRequest(),
      "task-invalid",
      "2026-07-02T10:00:01.000Z",
    );

    await expect(
      runner.transaction(({ tasks }) =>
        tasks.insert({
          ...task,
          intent: { ...task.intent, confidence: 2 },
        }),
      ),
    ).rejects.toMatchObject({
      code: "repository_record_invalid",
      stage: "persistence",
    });
    await runner.close();
  });

  it("persists idempotent results and audit history across restarts", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const firstRunner = createRunner(databasePath);
      const firstFixture = createCoreBrainFixture(firstRunner, "first");
      const request = createRequest();

      const firstResponse = await firstFixture.coreBrain.execute(request);
      expect(firstFixture.executor.invocationCount).toBe(1);
      await firstRunner.close();

      const secondRunner = createRunner(databasePath);
      const secondFixture = createCoreBrainFixture(secondRunner, "second");
      const replayedResponse =
        await secondFixture.coreBrain.execute(request);

      expect(replayedResponse).toEqual(firstResponse);
      expect(secondFixture.executor.invocationCount).toBe(0);

      await expect(
        secondFixture.coreBrain.execute({
          ...request,
          instruction: "Use the same request ID for different content.",
        }),
      ).rejects.toMatchObject({
        code: "request_id_conflict",
        stage: "request_idempotency",
      });

      const stored = await secondRunner.transaction(
        async ({ audits, requests, tasks }) => ({
          audits: await audits.listByCorrelationId(
            request.correlationId,
          ),
          request: await requests.getById(request.requestId),
          task: await tasks.getByRequestId(request.requestId),
        }),
      );
      expect(stored.request?.response).toEqual(firstResponse);
      expect(stored.task?.state).toBe("completed");
      expect(stored.audits.at(-2)?.eventType).toBe("request.replayed");
      expect(stored.audits.at(-1)?.eventType).toBe("request.rejected");
      await secondRunner.close();
    });
  });

  it("rejects corrupted records when they are read", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runner = createRunner(databasePath);
      const storedRequest = createStoredRequest(
        "request-corrupt",
        "task-corrupt",
      );
      await runner.transaction(({ requests }) =>
        requests.insert(storedRequest),
      );
      await runner.close();

      const database = new DatabaseSync(databasePath);
      database
        .prepare(
          "UPDATE requests SET record_json = ? WHERE request_id = ?",
        )
        .run('{"requestId":"request-corrupt"}', "request-corrupt");
      database.close();

      const reopened = createRunner(databasePath);
      await expect(
        reopened.transaction(({ requests }) =>
          requests.getById("request-corrupt"),
        ),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
        stage: "persistence",
      });
      await reopened.close();
    });
  });

  it("reads workflow evidence whose indexed columns match its JSON", async () => {
    await withSeededWorkflowEvidence(async (databasePath) => {
      const runner = createRunner(databasePath);
      const records = await runner.transaction(async ({ workflows }) => ({
        invocation: await workflows.agentInvocations.getById("invocation-1"),
        invocationEvents:
          await workflows.agentInvocationEvents.listByInvocationId(
            "invocation-1",
          ),
        lifecycleEvents:
          await workflows.lifecycleEvents.listByRecordId("cancel-1"),
        lifecycleRecords: await workflows.lifecycleRecords.listByStep(
          "instance-1",
          "workflow",
        ),
        outcome: await workflows.stepOutcomes.getByInvocationId(
          "invocation-1",
        ),
      }));

      expect(records.invocation).toEqual(reservedInvocation());
      expect(records.invocationEvents).toEqual([invocationEvent()]);
      expect(records.lifecycleEvents).toEqual([lifecycleEvent()]);
      expect(records.lifecycleRecords).toEqual([cancellationRecord()]);
      expect(records.outcome).toEqual(blockedOutcome());
      await runner.close();
    });
  });

  it.each([
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_agent_invocations SET status = ? WHERE invocation_id = ?",
          )
          .run("FAILED", "invocation-1");
      },
      name: "invocation indexed status",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.agentInvocations.getById("invocation-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_agent_invocations SET record_json = ? WHERE invocation_id = ?",
          )
          .run(
            JSON.stringify({
              ...reservedInvocation(),
              instanceId: "instance-other",
            }),
            "invocation-1",
          );
      },
      name: "invocation list query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.agentInvocations.listByInstanceId("instance-1", 10),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_agent_invocation_events SET record_json = ? WHERE event_id = ?",
          )
          .run(
            JSON.stringify({
              ...invocationEvent(),
              invocationId: "invocation-other",
            }),
            "invocation-event-1",
          );
      },
      name: "invocation event query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.agentInvocationEvents.listByInvocationId("invocation-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_step_outcomes SET record_json = ? WHERE outcome_id = ?",
          )
          .run(
            JSON.stringify({
              ...blockedOutcome(),
              outcomeId: "outcome-other",
            }),
            "outcome-1",
          );
      },
      name: "outcome primary query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.stepOutcomes.getById("outcome-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_step_outcomes SET record_json = ? WHERE outcome_id = ?",
          )
          .run(
            JSON.stringify({
              ...blockedOutcome(),
              invocationId: "invocation-other",
            }),
            "outcome-1",
          );
      },
      name: "outcome invocation query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.stepOutcomes.getByInvocationId("invocation-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_step_outcomes SET decision = ? WHERE outcome_id = ?",
          )
          .run("FAILED", "outcome-1");
      },
      name: "outcome indexed decision",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.stepOutcomes.getById("outcome-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_lifecycle_records SET record_json = ? WHERE record_id = ?",
          )
          .run(
            JSON.stringify({
              ...cancellationRecord(),
              recordId: "cancel-other",
            }),
            "cancel-1",
          );
      },
      name: "lifecycle primary query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.lifecycleRecords.getById("cancel-1"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_lifecycle_records SET record_json = ? WHERE record_id = ?",
          )
          .run(
            JSON.stringify({
              ...cancellationRecord(),
              instanceId: "instance-other",
            }),
            "cancel-1",
          );
      },
      name: "lifecycle list query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.lifecycleRecords.listByStep("instance-1", "workflow"),
    },
    {
      corrupt(database: DatabaseSync): void {
        database
          .prepare(
            "UPDATE workflow_lifecycle_events SET record_json = ? WHERE event_id = ?",
          )
          .run(
            JSON.stringify({
              ...lifecycleEvent(),
              recordId: "cancel-other",
            }),
            "lifecycle-event-1",
          );
      },
      name: "lifecycle event query identity",
      read: ({ workflows }: RepositoryTransaction) =>
        workflows.lifecycleEvents.listByRecordId("cancel-1"),
    },
  ])("rejects corrupted $name", async (testCase) => {
    await withSeededWorkflowEvidence(async (databasePath) => {
      const database = new DatabaseSync(databasePath);
      try {
        testCase.corrupt(database);
      } finally {
        database.close();
      }

      const runner = createRunner(databasePath);
      try {
        const readCorrupted = testCase.read as (
          repositories: RepositoryTransaction,
        ) => Promise<unknown>;
        await expect(runner.transaction(readCorrupted)).rejects.toMatchObject({
          code: "repository_record_invalid",
          stage: "persistence",
        });
      } finally {
        await runner.close();
      }
    });
  });

  it("bounds durable JSON before parsing", () => {
    expect(
      parseSqliteRecordJson('{"contractVersion":"1"}', "Test record"),
    ).toEqual({ contractVersion: "1" });
    expect(() =>
      parseSqliteRecordJson(
        JSON.stringify({ value: "x".repeat(MAX_SQLITE_RECORD_JSON_BYTES) }),
        "Test record",
      ),
    ).toThrow(/byte limit/iu);
    expect(() =>
      parseSqliteRecordJson(
        `${"[".repeat(MAX_SQLITE_RECORD_JSON_DEPTH + 1)}0${"]".repeat(MAX_SQLITE_RECORD_JSON_DEPTH + 1)}`,
        "Test record",
      ),
    ).toThrow(/nesting limit/iu);
    expect(() =>
      stringifySqliteRecordJson(
        { value: "x".repeat(MAX_SQLITE_RECORD_JSON_BYTES) },
        "Test record",
      ),
    ).toThrow(/byte limit/iu);
    expect(() =>
      stringifySqliteRecordJson(
        nestedRecord(MAX_SQLITE_RECORD_JSON_DEPTH + 1),
        "Test record",
      ),
    ).toThrow(/nesting limit/iu);
  });

  it("rejects oversized validated records before writing any durable row", async () => {
    const runner = createRunner(":memory:");
    const oversizedAudit = {
      ...createAuditEvent("task-oversized-audit"),
      correlationId: "correlation-oversized-audit",
      eventId: "audit-oversized",
      metadata: {
        payload: "x".repeat(MAX_SQLITE_RECORD_JSON_BYTES),
      },
    };

    await expect(
      runner.transaction(({ audits }) => audits.append(oversizedAudit)),
    ).rejects.toMatchObject({
      code: "repository_record_invalid",
      stage: "persistence",
    });
    expect(
      await runner.transaction(({ audits }) =>
        audits.listByCorrelationId(oversizedAudit.correlationId),
      ),
    ).toEqual([]);
    await runner.close();
  });
});

function nestedRecord(depth: number): unknown {
  let value: unknown = 0;
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

class CountingExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });
  public invocationCount = 0;
  readonly #contentAgent: ContentAgent;

  public constructor(contentAgent: ContentAgent) {
    this.#contentAgent = contentAgent;
  }

  public execute(invocation: AgentInvocation): Promise<unknown> {
    this.invocationCount += 1;
    return this.#contentAgent.execute(invocation);
  }
}

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({
    path,
    timeoutMs: 1_000,
  });
}

function createCoreBrainFixture(
  repositories: SqliteRepositoryTransactionRunner,
  identifierPrefix: string,
): {
  readonly coreBrain: CoreBrain;
  readonly executor: CountingExecutor;
} {
  const clock = new FixedClock();
  const identifiers = new PrefixedIdentifierGenerator(identifierPrefix);
  const executor = new CountingExecutor(
    new ContentAgent(clock, new ContentOutputValidator()),
  );
  const resultValidator = new AgentResultValidator();
  const registry = new ImmutableAgentRegistry(
    [CONTENT_AGENT_MANIFEST],
    new AgentManifestValidator(),
  );
  const coreBrain = new CoreBrain({
    agentResultValidator: resultValidator,
    agentRuntime: new InProcessAgentRuntime(
      [executor],
      new AgentInvocationValidator(),
      resultValidator,
      clock,
    ),
    clock,
    contextBuilder: new RequestExecutionContextBuilder(),
    identifiers,
    logger: new RecordingLogger(),
    memoryService: createEmptyMemoryService(clock),
    ...createAllowDeclaredPolicyDependencies(),
    repositories,
    requestValidator: new RequestEnvelopeValidator(),
    router: new RegistryRouter(registry, clock, identifiers),
    taskResponseValidator: new TaskResponseValidator(),
  });

  return { coreBrain, executor };
}

class PrefixedIdentifierGenerator implements IdentifierGenerator {
  #sequence = 0;
  readonly #prefix: string;

  public constructor(prefix: string) {
    this.#prefix = prefix;
  }

  public next(scope: IdentifierScope): string {
    this.#sequence += 1;
    return `${this.#prefix}-${scope}-${String(this.#sequence)}`;
  }
}

function createStoredRequest(
  requestId: string,
  taskId: string,
): StoredRequest {
  return {
    createdAt: "2026-07-02T10:00:01.000Z",
    requestFingerprint:
      "c320ee51f3a595322c9bcbe308d69eb3af293ffb9c4e8e0dd4f19126616cc404",
    requestId,
    schemaVersion: STORED_REQUEST_SCHEMA_VERSION,
    taskId,
    updatedAt: "2026-07-02T10:00:01.000Z",
  };
}

function createAuditEvent(taskId: string): AuditEvent {
  return {
    action: "task.validate",
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-rollback",
    eventId: "audit-rollback",
    eventType: "task.validated",
    metadata: {},
    occurredAt: "2026-07-02T10:00:01.000Z",
    outcome: "success",
    schemaVersion: "1",
    taskId,
    workspaceId: "workspace-local",
  };
}

function reservedInvocation() {
  return {
    capabilityIds: ["content-strategy"],
    contractVersion: "1" as const,
    definitionId: "workflow@1.0.0",
    executorId: "deterministic-content-director",
    executorVersion: "1.0.0",
    externalEffectsAllowed: false as const,
    fingerprint: "a".repeat(64),
    instanceId: "instance-1",
    invocationId: "invocation-1",
    reservedAt: "2026-07-12T00:00:00.000Z",
    reservedInstanceVersion: 2,
    runtimeAgentId: "content-director",
    runtimeAgentVersion: "1.0.0",
    specificationId: "content-director@1.0.0",
    specificationVersion: "1.0.0",
    status: "RESERVED" as const,
    stepId: "direction",
    workflowId: "workflow",
    workflowVersion: "1.0.0",
  };
}

function invocationEvent() {
  return {
    contractVersion: "1" as const,
    eventId: "invocation-event-1",
    externalEffects: false as const,
    instanceId: "instance-1",
    invocationId: "invocation-1",
    occurredAt: "2026-07-12T00:00:00.000Z",
    status: "RESERVED" as const,
    stepId: "direction",
    summaryCode: "workflow_agent_invocation_reserved" as const,
  };
}

function blockedOutcome() {
  return {
    contractVersion: "1" as const,
    decision: "BLOCKED" as const,
    externalEffects: false as const,
    fingerprint: "b".repeat(64),
    instanceId: "instance-1",
    invocationFingerprint: "a".repeat(64),
    invocationId: "invocation-1",
    outcomeId: "outcome-1",
    remediation: ["Durable invocation is missing"],
    reviewedAt: "2026-07-12T00:00:01.000Z",
    stepId: "direction",
  };
}

function cancellationRecord() {
  return {
    actorId: "fabio",
    contractVersion: "1" as const,
    definitionId: "workflow@1.0.0",
    externalEffects: false as const,
    fingerprint: "c".repeat(64),
    instanceId: "instance-1",
    instanceVersion: 1,
    kind: "CANCELLATION" as const,
    recordedAt: "2026-07-12T00:00:01.000Z",
    recordId: "cancel-1",
    recoveryInstructions: [
      "Workflow is cancelled and no further step invocation is authorized.",
    ],
    stepId: "workflow",
    workflowVersion: "1.0.0",
  };
}

function lifecycleEvent() {
  return {
    contractVersion: "1" as const,
    eventId: "lifecycle-event-1",
    externalEffects: false as const,
    instanceId: "instance-1",
    kind: "CANCELLATION" as const,
    occurredAt: "2026-07-12T00:00:01.000Z",
    recordId: "cancel-1",
    stepId: "workflow",
    summaryCode: "workflow_cancellation_recorded" as const,
  };
}

async function withSeededWorkflowEvidence(
  test: (databasePath: string) => Promise<void>,
): Promise<void> {
  await withTemporaryDatabase(async (databasePath) => {
    const initializer = createRunner(databasePath);
    await initializer.close();

    const database = new DatabaseSync(databasePath);
    try {
      database.exec("PRAGMA foreign_keys = OFF");
      const invocation = reservedInvocation();
      database
        .prepare(
          "INSERT INTO workflow_agent_invocations (invocation_id, fingerprint, instance_id, step_id, status, record_json) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          invocation.invocationId,
          invocation.fingerprint,
          invocation.instanceId,
          invocation.stepId,
          invocation.status,
          JSON.stringify(invocation),
        );
      const invocationRecord = invocationEvent();
      database
        .prepare(
          "INSERT INTO workflow_agent_invocation_events (event_id, invocation_id, instance_id, status, occurred_at, record_json) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          invocationRecord.eventId,
          invocationRecord.invocationId,
          invocationRecord.instanceId,
          invocationRecord.status,
          invocationRecord.occurredAt,
          JSON.stringify(invocationRecord),
        );
      const outcome = blockedOutcome();
      database
        .prepare(
          "INSERT INTO workflow_step_outcomes (outcome_id, invocation_id, fingerprint, instance_id, step_id, decision, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          outcome.outcomeId,
          outcome.invocationId,
          outcome.fingerprint,
          outcome.instanceId,
          outcome.stepId,
          outcome.decision,
          JSON.stringify(outcome),
        );
      const lifecycle = cancellationRecord();
      database
        .prepare(
          "INSERT INTO workflow_lifecycle_records (record_id, fingerprint, kind, instance_id, instance_version, step_id, recorded_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          lifecycle.recordId,
          lifecycle.fingerprint,
          lifecycle.kind,
          lifecycle.instanceId,
          lifecycle.instanceVersion,
          lifecycle.stepId,
          lifecycle.recordedAt,
          JSON.stringify(lifecycle),
        );
      const event = lifecycleEvent();
      database
        .prepare(
          "INSERT INTO workflow_lifecycle_events (event_id, record_id, instance_id, occurred_at, record_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          event.eventId,
          event.recordId,
          event.instanceId,
          event.occurredAt,
          JSON.stringify(event),
        );
    } finally {
      database.close();
    }
    await test(databasePath);
  });
}

async function withTemporaryDatabase(
  test: (databasePath: string) => Promise<void> | void,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-sqlite-"));
  try {
    await test(join(directory, "lifecycle.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
