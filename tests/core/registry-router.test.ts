import { describe, expect, it } from "vitest";

import {
  AgentManifestValidator,
  ImmutableAgentRegistry,
  RegistryRouter,
  RequestExecutionContextBuilder,
  createTask,
  transitionTask,
} from "../../src/index.js";
import {
  FixedClock,
  SequenceIdentifierGenerator,
  createEmptyMemoryService,
  createManifest,
  createRequest,
} from "../support/fixtures.js";

describe("RegistryRouter", () => {
  it("returns the only active exact task-type match", async () => {
    const clock = new FixedClock();
    const identifiers = new SequenceIdentifierGenerator();
    const manifest = createManifest();
    const registry = new ImmutableAgentRegistry(
      [manifest],
      new AgentManifestValidator(),
    );
    const router = new RegistryRouter(registry, clock, identifiers);
    const request = createRequest();
    const task = transitionTask(
      transitionTask(
        createTask(request, "task-001", "2026-07-02T10:00:01.000Z"),
        "validated",
        "2026-07-02T10:00:01.000Z",
      ),
      "context_ready",
      "2026-07-02T10:00:01.000Z",
    );
    const context = await new RequestExecutionContextBuilder().build({
      contextId: "context-001",
      createdAt: "2026-07-02T10:00:01.000Z",
      memory: createEmptyMemoryService(clock),
      request,
      taskId: task.taskId,
    });

    const result = await router.route({ context, task });

    expect(result.agent).toBe(registry.get("content", "1.0.0"));
    expect(result.decision).toMatchObject({
      confidence: 1,
      reasonCode: "single_task_type_match",
      selectedAgent: {
        agentId: "content",
        version: "1.0.0",
      },
      taskId: "task-001",
    });
  });

  it("fails explicitly when no active agent matches", async () => {
    const registry = new ImmutableAgentRegistry(
      [],
      new AgentManifestValidator(),
    );
    const router = new RegistryRouter(
      registry,
      new FixedClock(),
      new SequenceIdentifierGenerator(),
    );
    const request = createRequest();
    const task = transitionTask(
      transitionTask(
        createTask(request, "task-001", "2026-07-02T10:00:01.000Z"),
        "validated",
        "2026-07-02T10:00:01.000Z",
      ),
      "context_ready",
      "2026-07-02T10:00:01.000Z",
    );
    const context = await new RequestExecutionContextBuilder().build({
      contextId: "context-001",
      createdAt: "2026-07-02T10:00:01.000Z",
      memory: createEmptyMemoryService(new FixedClock()),
      request,
      taskId: task.taskId,
    });

    await expect(router.route({ context, task })).rejects.toMatchObject({
      code: "route_not_found",
    });
  });

  it("fails explicitly when deterministic routing is ambiguous", async () => {
    const registry = new ImmutableAgentRegistry(
      [
        createManifest(),
        createManifest({ agentId: "content-secondary" }),
      ],
      new AgentManifestValidator(),
    );
    const router = new RegistryRouter(
      registry,
      new FixedClock(),
      new SequenceIdentifierGenerator(),
    );
    const request = createRequest();
    const task = transitionTask(
      transitionTask(
        createTask(request, "task-001", "2026-07-02T10:00:01.000Z"),
        "validated",
        "2026-07-02T10:00:01.000Z",
      ),
      "context_ready",
      "2026-07-02T10:00:01.000Z",
    );
    const context = await new RequestExecutionContextBuilder().build({
      contextId: "context-001",
      createdAt: "2026-07-02T10:00:01.000Z",
      memory: createEmptyMemoryService(new FixedClock()),
      request,
      taskId: task.taskId,
    });

    await expect(router.route({ context, task })).rejects.toMatchObject({
      code: "route_ambiguous",
    });
  });
});
