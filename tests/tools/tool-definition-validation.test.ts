import { describe, expect, it } from "vitest";

import {
  ToolDefinitionValidator,
  ToolPermissionValidator,
  ToolRiskLevelValidator,
} from "../../src/index.js";
import {
  createReadOnlyToolDefinition,
  createSideEffectingToolDefinition,
  createToolPermission,
} from "./fixtures.js";

describe("tool definition contracts", () => {
  const validator = new ToolDefinitionValidator();

  it("accepts valid read-only and side-effecting definitions", () => {
    expect(validator.validate(createReadOnlyToolDefinition()).ok).toBe(
      true,
    );
    expect(
      validator.validate(createSideEffectingToolDefinition()).ok,
    ).toBe(true);
  });

  it.each([
    ["tool name", { toolId: "Catalog" }],
    ["version", { version: "latest" }],
    ["input schema", { inputSchema: { type: "string" } }],
    ["output schema", { outputSchema: {} }],
    ["timeout", { timeoutMs: 0 }],
    ["maximum timeout", { timeoutMs: 300_001 }],
  ])("rejects an invalid %s", (_label, overrides) => {
    expect(
      validator.validate({
        ...createReadOnlyToolDefinition(),
        ...overrides,
      }).ok,
    ).toBe(false);
  });

  it("rejects unsupported side-effect and risk classifications", () => {
    expect(
      validator.validate({
        ...createReadOnlyToolDefinition(),
        sideEffect: "network",
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...createReadOnlyToolDefinition(),
        riskLevel: "critical",
      }).ok,
    ).toBe(false);
  });

  it("requires permissions to match the tool and access classification", () => {
    expect(
      validator.validate(
        createReadOnlyToolDefinition({
          requiredPermissions: [
            createToolPermission({
              permission: "tool:read:another-tool",
            }),
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      validator.validate(
        createReadOnlyToolDefinition({
          requiredPermissions: [
            createToolPermission({
              permission: "tool:execute:catalog",
            }),
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  it("requires side-effecting tools to be idempotent and approval-gated", () => {
    expect(
      validator.validate(
        createSideEffectingToolDefinition({
          idempotency: "not_required",
        }),
      ).ok,
    ).toBe(false);
    expect(
      validator.validate(
        createSideEffectingToolDefinition({
          requiredPermissions: [
            createToolPermission({
              approvalRequired: false,
              permission: "tool:execute:publisher",
            }),
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  it("requires high-risk tools to declare an approval gate", () => {
    expect(
      validator.validate(
        createReadOnlyToolDefinition({
          riskLevel: "high",
        }),
      ).ok,
    ).toBe(false);
  });

  it("validates permission and risk-level contracts independently", () => {
    const permissionValidator = new ToolPermissionValidator();
    const riskValidator = new ToolRiskLevelValidator();

    expect(
      permissionValidator.validate(createToolPermission()).ok,
    ).toBe(true);
    expect(
      permissionValidator.validate({
        approvalRequired: false,
        permission: "knowledge:search",
      }).ok,
    ).toBe(false);
    expect(riskValidator.validate("medium").ok).toBe(true);
    expect(riskValidator.validate("critical").ok).toBe(false);
  });
});
