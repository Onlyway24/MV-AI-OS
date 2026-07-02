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
  MemoryExecutionContextBuilder,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
} from "../../src/index.js";
import { InMemoryMemoryService } from "../../src/memory/testing/in-memory-memory-service.js";
import {
  createSemanticMemory,
  createUserMemory,
} from "../memory/fixtures.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createRepositories,
  createAllowDeclaredPolicyDependencies,
  createRequest,
} from "../support/fixtures.js";

describe("Core Brain memory context", () => {
  it("provides only retrieved memory excerpts to the Content Agent", async () => {
    const clock = new FixedClock();
    const identifiers = new SequenceIdentifierGenerator();
    const memoryService = new InMemoryMemoryService(
      [
        createSemanticMemory("semantic-brand", {
          content: { brand: "MV AI OS" },
        }),
        createUserMemory("user-tone", {
          content: { preferredTone: "concise" },
        }),
        createUserMemory("other-user", {
          approval: {
            approvedAt: "2026-07-01T09:00:00.000Z",
            approvedBy: "actor-other",
          },
          ownerId: "actor-other",
        }),
      ],
      clock,
    );
    const contentAgent = new ContentAgent(
      clock,
      new ContentOutputValidator(),
    );
    const resultValidator = new AgentResultValidator();
    const registry = new ImmutableAgentRegistry(
      [CONTENT_AGENT_MANIFEST],
      new AgentManifestValidator(),
    );
    const coreBrain = new CoreBrain({
      agentResultValidator: resultValidator,
      agentRuntime: new InProcessAgentRuntime(
        [contentAgent],
        new AgentInvocationValidator(),
        resultValidator,
        clock,
      ),
      clock,
      contextBuilder: new MemoryExecutionContextBuilder(
        new RequestExecutionContextBuilder(),
      ),
      identifiers,
      logger: new RecordingLogger(),
      memoryService,
      ...createAllowDeclaredPolicyDependencies(),
      requestValidator: new RequestEnvelopeValidator(),
      repositories: createRepositories(),
      router: new RegistryRouter(registry, clock, identifiers),
      taskResponseValidator: new TaskResponseValidator(),
    });

    const response = await coreBrain.execute(
      createRequest({
        constraints: {
          audience: "operators",
          language: "en",
          tone: "clear",
        },
        requestedOutput: { contentType: "brief" },
      }),
    );

    expect(response.status).toBe("completed");
    expect(response.result?.memoryRefs).toEqual([
      "semantic-brand",
      "user-tone",
    ]);
    expect(response.result?.memoryRefs).not.toContain("other-user");
  });
});
