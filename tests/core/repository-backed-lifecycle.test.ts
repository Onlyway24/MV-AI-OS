import { describe, expect, it } from "vitest";

import {
  AgentInvocationValidator,
  AgentManifestValidator,
  AgentResultValidator,
  ContentAgent,
  CONTENT_AGENT_MANIFEST,
  ContentOutputValidator,
  CoreBrain,
  ImmutableAgentRegistry,
  InProcessAgentRuntime,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
  type AgentExecutor,
  type AgentInvocation,
} from "../../src/index.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createEmptyMemoryService,
  createAllowDeclaredPolicyDependencies,
  createRequest,
} from "../support/fixtures.js";

describe("Repository-backed Core Brain lifecycle", () => {
  it("returns the stored response for a duplicate request without re-execution", async () => {
    const fixture = createFixture();
    const request = createRequest();

    const first = await fixture.coreBrain.execute(request);
    const second = await fixture.coreBrain.execute(request);

    expect(second).toEqual(first);
    expect(fixture.executor.invocationCount).toBe(1);

    const stored = await fixture.repositories.transaction(
      async ({ audits, requests, tasks }) => ({
        auditEvents: await audits.listByCorrelationId(
          request.correlationId,
        ),
        request: await requests.getById(request.requestId),
        task: await tasks.getByRequestId(request.requestId),
      }),
    );
    expect(stored.request?.response).toEqual(first);
    expect(stored.request?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const storedRequestIdentity = {
      createdAt: stored.request?.createdAt,
      requestFingerprint: stored.request?.requestFingerprint,
      requestId: stored.request?.requestId,
      schemaVersion: stored.request?.schemaVersion,
      taskId: stored.request?.taskId,
      updatedAt: stored.request?.updatedAt,
    };
    expect(JSON.stringify(storedRequestIdentity)).not.toContain(
      request.instruction,
    );
    expect(stored.task?.state).toBe("completed");
    expect(stored.auditEvents.map(({ eventType }) => eventType)).toEqual([
      "request.accepted",
      "task.validated",
      "policy.evaluated",
      "task.context_ready",
      "task.routed",
      "agent.started",
      "task.completed",
      "request.replayed",
    ]);
  });

  it("shares one in-flight execution between concurrent duplicates", async () => {
    const fixture = createFixture();
    const request = createRequest();

    const [first, second] = await Promise.all([
      fixture.coreBrain.execute(request),
      fixture.coreBrain.execute(request),
    ]);

    expect(second).toEqual(first);
    expect(fixture.executor.invocationCount).toBe(1);
  });

  it("rejects a conflicting payload while the request is in flight", async () => {
    const fixture = createFixture();
    const request = createRequest();

    const execution = fixture.coreBrain.execute(request);
    await expect(
      fixture.coreBrain.execute({
        ...request,
        instruction: "Prepare different content.",
      }),
    ).rejects.toMatchObject({
      code: "request_id_conflict",
      stage: "request_idempotency",
    });
    await expect(execution).resolves.toMatchObject({
      status: "completed",
    });
    expect(fixture.executor.invocationCount).toBe(1);
  });

  it("rejects a reused request ID with a different normalized payload", async () => {
    const fixture = createFixture();
    const request = createRequest();
    await fixture.coreBrain.execute(request);

    await expect(
      fixture.coreBrain.execute({
        ...request,
        instruction: "Prepare a materially different announcement.",
      }),
    ).rejects.toMatchObject({
      category: "conflict",
      code: "request_id_conflict",
      stage: "request_idempotency",
    });
    expect(fixture.executor.invocationCount).toBe(1);
    const events = await fixture.repositories.transaction(({ audits }) =>
      audits.listByCorrelationId(request.correlationId),
    );
    expect(events.at(-1)).toMatchObject({
      eventType: "request.rejected",
      outcome: "failure",
    });
  });

  it("treats JSON object key order as the same normalized payload", async () => {
    const fixture = createFixture();
    const firstRequest = createRequest({
      requestedOutput: {
        contentType: "announcement",
        format: "structured",
      },
    });
    const replayRequest = createRequest({
      requestedOutput: {
        format: "structured",
        contentType: "announcement",
      },
    });

    const first = await fixture.coreBrain.execute(firstRequest);
    const replay = await fixture.coreBrain.execute(replayRequest);

    expect(replay).toEqual(first);
    expect(fixture.executor.invocationCount).toBe(1);
  });

  it("persists and audits preparation failures", async () => {
    const fixture = createFixture();
    const request = createRequest({ taskType: "unsupported.task" });

    const response = await fixture.coreBrain.execute(request);
    const replay = await fixture.coreBrain.execute(request);

    expect(response).toMatchObject({
      error: {
        code: "route_not_found",
        stage: "routing",
      },
      status: "failed",
    });
    expect(replay).toEqual(response);

    const stored = await fixture.repositories.transaction(
      async ({ audits, requests, tasks }) => ({
        auditEvents: await audits.listByCorrelationId(
          request.correlationId,
        ),
        request: await requests.getById(request.requestId),
        task: await tasks.getByRequestId(request.requestId),
      }),
    );
    expect(stored.task?.state).toBe("failed");
    expect(stored.request?.response).toMatchObject({
      error: { code: "route_not_found" },
      status: "failed",
    });
    expect(stored.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "task.failed",
          outcome: "failure",
        }),
      ]),
    );
    expect(stored.auditEvents.at(-1)).toMatchObject({
      eventType: "request.replayed",
      outcome: "success",
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

function createFixture(): {
  readonly coreBrain: CoreBrain;
  readonly executor: CountingExecutor;
  readonly repositories: InMemoryRepositoryTransactionRunner;
} {
  const clock = new FixedClock();
  const identifiers = new SequenceIdentifierGenerator();
  const repositories = new InMemoryRepositoryTransactionRunner();
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

  return { coreBrain, executor, repositories };
}
