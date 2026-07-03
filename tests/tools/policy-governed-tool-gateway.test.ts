import { describe, expect, it } from "vitest";

import {
  PolicyGovernedToolGateway,
  ToolDefinitionValidator,
  ToolInvocationValidator,
  ToolResultValidator,
} from "../../src/index.js";
import { InMemoryToolRegistry } from "../support/in-memory-tool-registry.js";
import {
  createPolicyDecision,
  createReadOnlyToolDefinition,
  createSideEffectingToolDefinition,
  createSuccessfulToolResult,
  createToolInvocation,
} from "./fixtures.js";

describe("PolicyGovernedToolGateway", () => {
  it("allows read-only access with a matching effective permission", () => {
    const gateway = createGateway();
    const definition = gateway.authorize(createToolInvocation());

    expect(definition).toEqual(createReadOnlyToolDefinition());
  });

  it("denies read-only access without a matching effective permission", () => {
    const gateway = createGateway();

    expect(() =>
      gateway.authorize(
        createToolInvocation({
          policyDecision: createPolicyDecision(
            "tool:read:catalog",
            false,
          ),
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        category: "authorization",
        code: "tool_permission_denied",
      }),
    );
  });

  it("rejects policy decisions belonging to another execution", () => {
    const gateway = createGateway();

    expect(() =>
      gateway.authorize(
        createToolInvocation({
          policyDecision: {
            ...createPolicyDecision(),
            taskId: "task-another",
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "tool_invocation_mismatch",
      }),
    );
  });

  it("requires an exact registered version and bounded timeout", () => {
    const gateway = createGateway();

    expect(() =>
      gateway.authorize(
        createToolInvocation({ toolVersion: "2.0.0" }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "tool_not_found",
      }),
    );
    expect(() =>
      gateway.authorize(
        createToolInvocation({ timeoutMs: 5_001 }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "tool_timeout_invalid",
      }),
    );
  });

  it("denies side-effecting access without permission and approval", () => {
    const gateway = createGateway();
    const denied = createToolInvocation({
      policyDecision: createPolicyDecision(
        "tool:execute:publisher",
        false,
      ),
      toolId: "publisher",
    });
    const missingApproval = createToolInvocation({
      policyDecision: createPolicyDecision(
        "tool:execute:publisher",
      ),
      toolId: "publisher",
    });

    expect(() => gateway.authorize(denied)).toThrow(
      expect.objectContaining({ code: "tool_permission_denied" }),
    );
    expect(() => gateway.authorize(missingApproval)).toThrow(
      expect.objectContaining({ code: "tool_approval_required" }),
    );
  });

  it("requires idempotency before authorizing a side effect", () => {
    const gateway = createGateway();
    const invocation = createSideEffectingInvocation();

    expect(() => gateway.authorize(invocation)).toThrow(
      expect.objectContaining({ code: "tool_idempotency_invalid" }),
    );
  });

  it("authorizes an explicitly permitted, approved, idempotent side effect", () => {
    const gateway = createGateway();
    const definition = gateway.authorize(
      createSideEffectingInvocation({
        idempotencyKey: "publish-task-001",
      }),
    );

    expect(definition).toEqual(createSideEffectingToolDefinition());
  });

  it("validates tool results and their invocation ownership", () => {
    const gateway = createGateway();
    const invocation = createToolInvocation();

    expect(
      gateway.validateResult(
        invocation,
        createSuccessfulToolResult(),
      ),
    ).toEqual(createSuccessfulToolResult());
    expect(() =>
      gateway.validateResult(invocation, {
        ...createSuccessfulToolResult(),
        output: undefined,
      }),
    ).toThrow(
      expect.objectContaining({ code: "tool_result_invalid" }),
    );
    expect(() =>
      gateway.validateResult(
        invocation,
        createSuccessfulToolResult({
          toolInvocationId: "tool-invocation-another",
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "tool_result_mismatch" }),
    );
  });
});

function createGateway(): PolicyGovernedToolGateway {
  return new PolicyGovernedToolGateway({
    invocationValidator: new ToolInvocationValidator(),
    registry: new InMemoryToolRegistry(
      [
        createReadOnlyToolDefinition(),
        createSideEffectingToolDefinition(),
      ],
      new ToolDefinitionValidator(),
    ),
    resultValidator: new ToolResultValidator(),
  });
}

function createSideEffectingInvocation(
  overrides: Partial<ReturnType<typeof createToolInvocation>> = {},
): ReturnType<typeof createToolInvocation> {
  return createToolInvocation({
    approvals: [
      {
        approvalId: "approval-001",
        permission: "tool:execute:publisher",
      },
    ],
    policyDecision: createPolicyDecision("tool:execute:publisher"),
    toolId: "publisher",
    ...overrides,
  });
}
