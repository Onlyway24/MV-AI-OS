import { describe, expect, it } from "vitest";

import {
  AgentManifestValidator,
  ImmutableAgentRegistry,
  RegistryError,
} from "../../src/index.js";
import { createManifest } from "../support/fixtures.js";

describe("ImmutableAgentRegistry", () => {
  const validator = new AgentManifestValidator();

  it("exposes only active exact task-type matches to routing", () => {
    const active = createManifest();
    const disabled = createManifest({
      agentId: "disabled-content",
      status: "disabled",
    });
    const experimental = createManifest({
      agentId: "experimental-content",
      status: "experimental",
    });
    const registry = new ImmutableAgentRegistry(
      [active, disabled, experimental],
      validator,
    );

    expect(registry.findActiveByTaskType("business.content")).toEqual([
      expect.objectContaining({ agentId: "content", version: "1.0.0" }),
    ]);
    expect(registry.get("disabled-content", "1.0.0")).toBeDefined();
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.list()[0])).toBe(true);
  });

  it("rejects duplicate agent and version pairs", () => {
    expect(
      () =>
        new ImmutableAgentRegistry(
          [createManifest(), createManifest()],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<RegistryError>>({
        code: "duplicate_agent_manifest",
      }),
    );
  });

  it("rejects invalid manifests before registration", () => {
    expect(
      () =>
        new ImmutableAgentRegistry(
          [createManifest({ version: "latest" })],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<RegistryError>>({
        code: "agent_manifest_invalid",
      }),
    );
  });
});
