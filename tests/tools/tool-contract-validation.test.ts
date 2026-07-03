import { describe, expect, it } from "vitest";

import {
  ToolInvocationValidator,
  ToolResultValidator,
} from "../../src/index.js";
import {
  createFailedToolResult,
  createSuccessfulToolResult,
  createToolInvocation,
} from "./fixtures.js";

describe("tool invocation and result contracts", () => {
  it("accepts valid tool invocations", () => {
    expect(
      new ToolInvocationValidator().validate(createToolInvocation()).ok,
    ).toBe(true);
  });

  it("rejects malformed tool invocations and policy decisions", () => {
    const validator = new ToolInvocationValidator();

    expect(
      validator.validate({
        ...createToolInvocation(),
        toolVersion: "latest",
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...createToolInvocation(),
        policyDecision: {
          ...createToolInvocation().policyDecision,
          effectivePermissions: ["tool:read:catalog"],
          requestedPermissions: [],
        },
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...createToolInvocation(),
        approvals: [
          {
            approvalId: "approval-001",
            permission: "knowledge:search",
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("accepts successful and failed tool results", () => {
    const validator = new ToolResultValidator();

    expect(validator.validate(createSuccessfulToolResult()).ok).toBe(
      true,
    );
    expect(validator.validate(createFailedToolResult()).ok).toBe(true);
  });

  it("rejects malformed and contradictory tool results", () => {
    const validator = new ToolResultValidator();

    expect(
      validator.validate({
        ...createSuccessfulToolResult(),
        output: undefined,
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...createFailedToolResult(),
        output: {},
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...createSuccessfulToolResult(),
        completedAt: "not-a-timestamp",
      }).ok,
    ).toBe(false);
  });
});
