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
} from "../../src/index.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createEmptyMemoryService,
  createRepositories,
  createRequest,
} from "../support/fixtures.js";

describe("Content Agent execution slice", () => {
  it("routes and executes a content request to a completed response", async () => {
    const clock = new FixedClock();
    const contentAgent = new ContentAgent(
      clock,
      new ContentOutputValidator(),
    );
    const coreBrain = createExecutableCore(clock, [contentAgent]);
    const request = createRequest({
      constraints: {
        audience: "product teams",
        channel: "internal",
        language: "en",
        tone: "informative",
      },
      input: {
        product: "MV AI OS",
        release: "Core Brain vertical slice",
      },
      requestedOutput: {
        contentType: "announcement",
        format: "structured",
      },
    });

    const response = await coreBrain.execute(request);

    expect(response).toMatchObject({
      approvals: [],
      correlationId: request.correlationId,
      requestId: request.requestId,
      status: "completed",
      warnings: [],
    });
    expect(response.result).toEqual({
      assumptions: [],
      audience: "product teams",
      body: {
        facts: {
          product: "MV AI OS",
          release: "Core Brain vertical slice",
        },
        heading: "MV AI OS: Announcement",
        message: request.instruction,
      },
      contentType: "announcement",
      language: "en",
      memoryRefs: [],
      metadata: {
        channel: "internal",
        characterCount: request.instruction.length,
        format: "structured",
        generator: "deterministic-content-agent",
      },
      sourceRefs: [],
      summary: "MV AI OS: Announcement prepared for product teams.",
      title: "MV AI OS: Announcement",
      tone: "informative",
      warnings: [],
    });
  });

  it("returns needs_input when the required content type is absent", async () => {
    const clock = new FixedClock();
    const coreBrain = createExecutableCore(clock, [
      new ContentAgent(clock, new ContentOutputValidator()),
    ]);

    const response = await coreBrain.execute(
      createRequest({ requestedOutput: {} }),
    );

    expect(response).toMatchObject({
      status: "needs_input",
      warnings: ["Agent requires additional input"],
    });
    expect(response.result).toBeUndefined();
  });

  it("normalizes an agent exception into a failed execution response", async () => {
    const clock = new FixedClock();
    const coreBrain = createExecutableCore(clock, [
      new ThrowingContentExecutor(),
    ]);

    const response = await coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "internal",
        code: "agent_execution_failed",
        retryable: false,
        stage: "agent_execution",
      },
      status: "failed",
    });
    expect(response.result).toBeUndefined();
  });

  it("rejects a malformed agent result at the runtime boundary", async () => {
    const clock = new FixedClock();
    const coreBrain = createExecutableCore(clock, [
      new InvalidContentExecutor(),
    ]);

    const response = await coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "validation",
        code: "agent_result_invalid",
        stage: "agent_execution",
      },
      status: "failed",
    });
  });
});

class ThrowingContentExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });

  public execute(): Promise<unknown> {
    return Promise.reject(new Error("test executor failure"));
  }
}

class InvalidContentExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });

  public execute(): Promise<unknown> {
    return Promise.resolve({ status: "succeeded" });
  }
}

function createExecutableCore(
  clock: FixedClock,
  executors: readonly AgentExecutor[],
): CoreBrain {
  const identifiers = new SequenceIdentifierGenerator();
  const resultValidator = new AgentResultValidator();
  const registry = new ImmutableAgentRegistry(
    [CONTENT_AGENT_MANIFEST],
    new AgentManifestValidator(),
  );

  return new CoreBrain({
    agentResultValidator: resultValidator,
    agentRuntime: new InProcessAgentRuntime(
      executors,
      new AgentInvocationValidator(),
      resultValidator,
      clock,
    ),
    clock,
    contextBuilder: new RequestExecutionContextBuilder(),
    identifiers,
    logger: new RecordingLogger(),
    memoryService: createEmptyMemoryService(clock),
    requestValidator: new RequestEnvelopeValidator(),
    repositories: createRepositories(),
    router: new RegistryRouter(registry, clock, identifiers),
    taskResponseValidator: new TaskResponseValidator(),
  });
}
