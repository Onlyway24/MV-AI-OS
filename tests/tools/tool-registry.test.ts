import { describe, expect, it } from "vitest";

import {
  ToolDefinitionRegistryError,
  ToolDefinitionValidator,
} from "../../src/index.js";
import { InMemoryToolRegistry } from "../support/in-memory-tool-registry.js";
import {
  createReadOnlyToolDefinition,
  createSideEffectingToolDefinition,
} from "./fixtures.js";

describe("InMemoryToolRegistry", () => {
  const validator = new ToolDefinitionValidator();

  it("returns deterministic immutable definitions", () => {
    const registry = new InMemoryToolRegistry(
      [
        createSideEffectingToolDefinition(),
        createReadOnlyToolDefinition(),
      ],
      validator,
    );

    expect(registry.list().map(({ toolId }) => toolId)).toEqual([
      "catalog",
      "publisher",
    ]);
    expect(registry.get("catalog", "1.0.0")).toBeDefined();
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.get("catalog", "1.0.0"))).toBe(
      true,
    );
    expect(
      Object.isFrozen(
        registry.get("catalog", "1.0.0")?.requiredPermissions,
      ),
    ).toBe(true);
  });

  it("supports exact version lookup", () => {
    const registry = new InMemoryToolRegistry(
      [
        createReadOnlyToolDefinition({ version: "2.0.0" }),
        createReadOnlyToolDefinition({ version: "1.0.0" }),
      ],
      validator,
    );

    expect(
      registry.listVersions("catalog").map(({ version }) => version),
    ).toEqual(["1.0.0", "2.0.0"]);
    expect(registry.get("catalog", "2.0.0")?.version).toBe("2.0.0");
    expect(registry.get("catalog", "3.0.0")).toBeUndefined();
  });

  it("rejects duplicate tool ID and version pairs", () => {
    expect(
      () =>
        new InMemoryToolRegistry(
          [
            createReadOnlyToolDefinition(),
            createReadOnlyToolDefinition(),
          ],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<ToolDefinitionRegistryError>>({
        code: "tool_definition_duplicate",
      }),
    );
  });

  it("rejects invalid definitions before registration", () => {
    expect(
      () =>
        new InMemoryToolRegistry(
          [createReadOnlyToolDefinition({ version: "latest" })],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<Partial<ToolDefinitionRegistryError>>({
        code: "tool_definition_invalid",
      }),
    );
  });
});
