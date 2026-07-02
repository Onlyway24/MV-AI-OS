import { describe, expect, it } from "vitest";

import {
  AgentManifestValidator,
  AgentInvocationValidator,
  AgentResultValidator,
  CoreBrain,
  InProcessAgentRuntime,
  ImmutableAgentRegistry,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
} from "../../src/index.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createManifest,
  createEmptyMemoryService,
  createRepositories,
  createRequest,
} from "../support/fixtures.js";

describe("CoreBrain", () => {
  it("prepares context, routing, and a deterministic one-step plan", async () => {
    const logger = new RecordingLogger();
    const coreBrain = createCoreBrain(logger);
    const request = createRequest();

    const result = await coreBrain.prepare(request);

    expect(result.context).toMatchObject({
      actorId: request.actorId,
      correlationId: request.correlationId,
      requestId: request.requestId,
      supplementalContext: [],
      taskType: request.taskType,
      workspaceId: request.workspaceId,
    });
    expect(result.decision).toMatchObject({
      confidence: 1,
      selectedAgent: { agentId: "content", version: "1.0.0" },
    });
    expect(result.task).toMatchObject({
      attemptCount: 0,
      selectedAgent: { agentId: "content", version: "1.0.0" },
      state: "routed",
    });
    expect(result.task.plan.steps).toEqual([
      expect.objectContaining({
        agent: { agentId: "content", version: "1.0.0" },
        dependsOn: [],
        kind: "agent.invoke",
        objective: request.instruction,
        sequence: 1,
        status: "pending",
      }),
    ]);
    expect(logger.entries.map(({ event }) => event)).toEqual([
      "core.request.validated",
      "core.task.routed",
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain(request.instruction);
  });

  it("rejects malformed requests before task creation or routing", async () => {
    const logger = new RecordingLogger();
    const coreBrain = createCoreBrain(logger);

    await expect(
      coreBrain.prepare({ ...createRequest(), requestedOutput: undefined }),
    ).rejects.toMatchObject({
      code: "request_invalid",
      stage: "request_validation",
    });

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]?.event).toBe("core.request.failed");
    expect(logger.entries[0]?.metadata?.code).toBe("request_invalid");
  });

  it("returns a normalized routing failure for unsupported task types", async () => {
    const logger = new RecordingLogger();
    const coreBrain = createCoreBrain(logger);

    await expect(
      coreBrain.prepare(createRequest({ taskType: "unsupported.task" })),
    ).rejects.toMatchObject({
      code: "route_not_found",
      stage: "routing",
    });

    expect(logger.entries.at(-1)?.event).toBe("core.request.failed");
    expect(logger.entries.at(-1)?.metadata?.code).toBe("route_not_found");
  });
});

function createCoreBrain(logger: RecordingLogger): CoreBrain {
  const clock = new FixedClock();
  const identifiers = new SequenceIdentifierGenerator();
  const registry = new ImmutableAgentRegistry(
    [createManifest()],
    new AgentManifestValidator(),
  );

  return new CoreBrain({
    agentResultValidator: new AgentResultValidator(),
    agentRuntime: new InProcessAgentRuntime(
      [],
      new AgentInvocationValidator(),
      new AgentResultValidator(),
      clock,
    ),
    clock,
    contextBuilder: new RequestExecutionContextBuilder(),
    identifiers,
    logger,
    memoryService: createEmptyMemoryService(clock),
    requestValidator: new RequestEnvelopeValidator(),
    repositories: createRepositories(),
    router: new RegistryRouter(registry, clock, identifiers),
    taskResponseValidator: new TaskResponseValidator(),
  });
}
