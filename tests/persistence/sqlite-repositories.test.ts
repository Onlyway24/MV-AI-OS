import { chmod, mkdtemp, rm, stat, symlink } from "node:fs/promises";
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

runRepositoryConformance(
  "SQLite",
  () =>
    new SqliteRepositoryTransactionRunner({
      path: ":memory:",
      timeoutMs: 1_000,
    }),
);

describe("SQLite repository transaction runner", () => {
  it("creates and reopens only private regular database files", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const first = createRunner(databasePath);
      await first.close();
      expect((await stat(databasePath)).mode & 0o777).toBe(0o600);

      await chmod(databasePath, 0o644);
      const reopened = createRunner(databasePath);
      await reopened.close();
      expect((await stat(databasePath)).mode & 0o777).toBe(0o600);
    });
  });

  it("refuses a symbolic-link database path", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const targetPath = `${databasePath}.target`;
      const target = createRunner(targetPath);
      await target.close();
      await symlink(targetPath, databasePath);

      try {
        createRunner(databasePath);
        throw new Error("Symbolic-link database path was accepted");
      } catch (error) {
        expect(error).toMatchObject({ code: "sqlite_repository_failed", details: { operation: "connection.permissions" } });
      }
    });
  });

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
});

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
