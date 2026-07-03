import type { ToolDefinition } from "./tool-definition.js";
import type { ToolGateway } from "./tool-gateway.js";
import {
  ToolGatewayError,
  toolValidationDetails,
} from "./tool-gateway-error.js";
import type { ToolInvocation } from "./tool-invocation.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ToolResult } from "./tool-result.js";
import type { Validator } from "../validation/validation.js";

export interface PolicyGovernedToolGatewayDependencies {
  readonly invocationValidator: Validator<ToolInvocation>;
  readonly registry: ToolRegistry;
  readonly resultValidator: Validator<ToolResult>;
}

export class PolicyGovernedToolGateway implements ToolGateway {
  readonly #dependencies: PolicyGovernedToolGatewayDependencies;

  public constructor(dependencies: PolicyGovernedToolGatewayDependencies) {
    this.#dependencies = dependencies;
  }

  public authorize(invocation: ToolInvocation): ToolDefinition {
    const validation =
      this.#dependencies.invocationValidator.validate(invocation);
    if (!validation.ok) {
      throw new ToolGatewayError(
        "tool_invocation_invalid",
        "The request does not satisfy the ToolInvocation contract",
        toolValidationDetails(validation.issues),
      );
    }
    const validInvocation = validation.value;
    validatePolicyOwnership(validInvocation);

    const definition = this.#dependencies.registry.get(
      validInvocation.toolId,
      validInvocation.toolVersion,
    );
    if (definition === undefined) {
      throw new ToolGatewayError(
        "tool_not_found",
        "The requested tool definition is not registered",
        {
          toolId: validInvocation.toolId,
          toolVersion: validInvocation.toolVersion,
        },
      );
    }

    const effective = new Set(
      validInvocation.policyDecision.effectivePermissions,
    );
    const denied = definition.requiredPermissions
      .map(({ permission }) => permission)
      .filter((permission) => !effective.has(permission));
    if (denied.length > 0) {
      throw new ToolGatewayError(
        "tool_permission_denied",
        "Policy does not grant every permission required by the tool",
        { deniedPermissions: denied },
      );
    }

    const approvals = new Map(
      validInvocation.approvals.map((marker) => [
        marker.permission,
        marker.approvalId,
      ]),
    );
    const missingApprovals = definition.requiredPermissions
      .filter(({ approvalRequired }) => approvalRequired)
      .map(({ permission }) => permission)
      .filter((permission) => !approvals.has(permission));
    if (missingApprovals.length > 0) {
      throw new ToolGatewayError(
        "tool_approval_required",
        "The tool requires explicit approval markers",
        { missingApprovals },
      );
    }

    validateInvocationLimits(validInvocation, definition);
    return definition;
  }

  public validateResult(
    invocation: ToolInvocation,
    candidate: unknown,
  ): ToolResult {
    this.authorize(invocation);
    const validation = this.#dependencies.resultValidator.validate(candidate);
    if (!validation.ok) {
      throw new ToolGatewayError(
        "tool_result_invalid",
        "The result does not satisfy the ToolResult contract",
        toolValidationDetails(validation.issues),
      );
    }
    const result = validation.value;
    if (
      result.toolInvocationId !== invocation.toolInvocationId ||
      result.toolId !== invocation.toolId ||
      result.toolVersion !== invocation.toolVersion
    ) {
      throw new ToolGatewayError(
        "tool_result_mismatch",
        "The tool result does not belong to its invocation",
        {
          expectedToolId: invocation.toolId,
          expectedToolInvocationId: invocation.toolInvocationId,
          expectedToolVersion: invocation.toolVersion,
        },
      );
    }
    return result;
  }
}

function validatePolicyOwnership(invocation: ToolInvocation): void {
  const decision = invocation.policyDecision;
  if (
    decision.taskId !== invocation.taskId ||
    decision.workspaceId !== invocation.workspaceId ||
    decision.actorId !== invocation.actorId ||
    decision.agent.agentId !== invocation.agent.agentId ||
    decision.agent.version !== invocation.agent.version
  ) {
    throw new ToolGatewayError(
      "tool_invocation_mismatch",
      "The policy decision does not belong to the tool invocation",
    );
  }
}

function validateInvocationLimits(
  invocation: ToolInvocation,
  definition: ToolDefinition,
): void {
  if (invocation.timeoutMs > definition.timeoutMs) {
    throw new ToolGatewayError(
      "tool_timeout_invalid",
      "The requested timeout exceeds the tool definition",
      {
        maximumTimeoutMs: definition.timeoutMs,
        requestedTimeoutMs: invocation.timeoutMs,
      },
    );
  }
  if (
    definition.idempotency === "required" &&
    invocation.idempotencyKey === undefined
  ) {
    throw new ToolGatewayError(
      "tool_idempotency_invalid",
      "The tool requires an idempotency key",
    );
  }
}
