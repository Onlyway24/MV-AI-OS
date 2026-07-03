import type {
  EffectivePermission,
  FailedToolResult,
  PolicyDecision,
  SuccessfulToolResult,
  ToolDefinition,
  ToolInvocation,
  ToolPermission,
} from "../../src/index.js";

export function createToolPermission(
  overrides: Partial<ToolPermission> = {},
): ToolPermission {
  return {
    approvalRequired: false,
    permission: "tool:read:catalog",
    ...overrides,
  };
}

export function createReadOnlyToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    description: "Read approved catalog records without external changes.",
    idempotency: "not_required",
    inputSchema: {
      properties: {
        productId: { type: "string" },
      },
      required: ["productId"],
      type: "object",
    },
    name: "Catalog Reader",
    outputSchema: {
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
      type: "object",
    },
    requiredPermissions: [createToolPermission()],
    riskLevel: "low",
    schemaVersion: "1",
    sideEffect: "read_only",
    timeoutMs: 5_000,
    toolId: "catalog",
    version: "1.0.0",
    ...overrides,
  };
}

export function createSideEffectingToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return createReadOnlyToolDefinition({
    description: "Publish approved content to an external destination.",
    idempotency: "required",
    name: "Content Publisher",
    requiredPermissions: [
      createToolPermission({
        approvalRequired: true,
        permission: "tool:execute:publisher",
      }),
    ],
    riskLevel: "medium",
    sideEffect: "side_effecting",
    toolId: "publisher",
    ...overrides,
  });
}

export function createPolicyDecision(
  requestedPermission: EffectivePermission = "tool:read:catalog",
  allowed = true,
): PolicyDecision {
  return {
    actorId: "actor-local",
    agent: {
      agentId: "content",
      version: "1.0.0",
    },
    contractVersion: "1",
    decisionId: "policy-decision-001",
    deniedPermissions: allowed ? [] : [requestedPermission],
    effectivePermissions: allowed ? [requestedPermission] : [],
    evaluatedAt: "2026-07-03T09:59:59.000Z",
    requestedPermissions: [requestedPermission],
    taskId: "task-001",
    workspaceId: "workspace-local",
  };
}

export function createToolInvocation(
  overrides: Partial<ToolInvocation> = {},
): ToolInvocation {
  return {
    actorId: "actor-local",
    agent: {
      agentId: "content",
      version: "1.0.0",
    },
    approvals: [],
    contractVersion: "1",
    correlationId: "correlation-001",
    input: {
      productId: "product-001",
    },
    policyDecision: createPolicyDecision(),
    requestedAt: "2026-07-03T10:00:00.000Z",
    taskId: "task-001",
    timeoutMs: 5_000,
    toolId: "catalog",
    toolInvocationId: "tool-invocation-001",
    toolVersion: "1.0.0",
    workspaceId: "workspace-local",
    ...overrides,
  };
}

export function createSuccessfulToolResult(
  overrides: Partial<SuccessfulToolResult> = {},
): SuccessfulToolResult {
  return {
    completedAt: "2026-07-03T10:00:01.000Z",
    contractVersion: "1",
    output: {
      title: "Deterministic catalog result",
    },
    status: "succeeded",
    toolId: "catalog",
    toolInvocationId: "tool-invocation-001",
    toolVersion: "1.0.0",
    ...overrides,
  };
}

export function createFailedToolResult(
  overrides: Partial<FailedToolResult> = {},
): FailedToolResult {
  return {
    completedAt: "2026-07-03T10:00:01.000Z",
    contractVersion: "1",
    error: {
      category: "dependency",
      code: "tool_dependency_failed",
      message: "The tool dependency failed",
      occurredAt: "2026-07-03T10:00:01.000Z",
      retryable: true,
      stage: "tool_provider",
    },
    status: "failed",
    toolId: "catalog",
    toolInvocationId: "tool-invocation-001",
    toolVersion: "1.0.0",
    ...overrides,
  };
}
