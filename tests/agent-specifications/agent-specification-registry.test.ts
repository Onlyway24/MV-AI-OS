import { describe, expect, it } from "vitest";

import {
  AgentSpecificationRegistryError,
  AgentSpecificationValidator,
} from "../../src/index.js";
import { InMemoryAgentSpecificationRegistry } from "../support/in-memory-agent-specification-registry.js";
import { createAgentSpecification } from "./fixtures.js";

describe("InMemoryAgentSpecificationRegistry", () => {
  const validator = new AgentSpecificationValidator();

  it("returns deterministic immutable specifications", () => {
    const registry = new InMemoryAgentSpecificationRegistry(
      [
        createAgentSpecification({
          agentId: "research",
          taskTypes: ["business.research"],
        }),
        createAgentSpecification(),
      ],
      validator,
    );

    expect(registry.list().map(({ agentId }) => agentId)).toEqual([
      "content",
      "research",
    ]);
    expect(registry.get("content", "1.0.0")).toBeDefined();
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.get("content", "1.0.0"))).toBe(true);
    expect(
      Object.isFrozen(registry.get("content", "1.0.0")?.capabilities),
    ).toBe(true);
  });

  it("supports multiple versions of one agent with exact lookup", () => {
    const registry = new InMemoryAgentSpecificationRegistry(
      [
        createAgentSpecification({ version: "2.0.0" }),
        createAgentSpecification({ version: "1.0.0" }),
      ],
      validator,
    );

    expect(
      registry.listVersions("content").map(({ version }) => version),
    ).toEqual(["1.0.0", "2.0.0"]);
    expect(registry.get("content", "2.0.0")?.version).toBe("2.0.0");
    expect(registry.get("content", "3.0.0")).toBeUndefined();
  });

  it("rejects duplicate agent ID and version pairs", () => {
    expect(
      () =>
        new InMemoryAgentSpecificationRegistry(
          [createAgentSpecification(), createAgentSpecification()],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<AgentSpecificationRegistryError>>({
        code: "agent_specification_duplicate",
      }),
    );
  });

  it("rejects invalid specifications before registration", () => {
    expect(
      () =>
        new InMemoryAgentSpecificationRegistry(
          [createAgentSpecification({ version: "latest" })],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<AgentSpecificationRegistryError>>({
        code: "agent_specification_invalid",
      }),
    );
  });

  it("exposes only active exact task-type matches", () => {
    const registry = new InMemoryAgentSpecificationRegistry(
      [
        createAgentSpecification(),
        createAgentSpecification({
          agentId: "content-disabled",
          status: "disabled",
        }),
        createAgentSpecification({
          agentId: "research",
          taskTypes: ["business.research"],
        }),
      ],
      validator,
    );

    expect(
      registry
        .findActiveByTaskType("business.content")
        .map(({ agentId }) => agentId),
    ).toEqual(["content"]);
    expect(registry.findActiveByTaskType("content")).toEqual([]);
  });
});
