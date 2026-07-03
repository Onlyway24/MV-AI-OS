import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";

type ToolGatewayErrorCode =
  | "tool_approval_required"
  | "tool_idempotency_invalid"
  | "tool_invocation_invalid"
  | "tool_invocation_mismatch"
  | "tool_not_found"
  | "tool_permission_denied"
  | "tool_result_invalid"
  | "tool_result_mismatch"
  | "tool_timeout_invalid";

export class ToolGatewayError extends CoreError {
  public constructor(
    code: ToolGatewayErrorCode,
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: errorCategory(code),
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "tool_gateway",
    });
  }
}

export class ToolDefinitionRegistryError extends CoreError {
  public constructor(
    code: "tool_definition_duplicate" | "tool_definition_invalid",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category:
        code === "tool_definition_duplicate"
          ? "conflict"
          : "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "tool_registry",
    });
  }
}

export function toolValidationDetails(
  issues: readonly ValidationIssue[],
): JsonObject {
  return {
    issues: issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    })),
  };
}

function errorCategory(
  code: ToolGatewayErrorCode,
): "authorization" | "not_found" | "validation" {
  if (
    code === "tool_approval_required" ||
    code === "tool_permission_denied"
  ) {
    return "authorization";
  }
  return code === "tool_not_found" ? "not_found" : "validation";
}
