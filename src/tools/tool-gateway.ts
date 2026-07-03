import type { ToolDefinition } from "./tool-definition.js";
import type { ToolInvocation } from "./tool-invocation.js";
import type { ToolResult } from "./tool-result.js";

export interface ToolGateway {
  authorize(invocation: ToolInvocation): ToolDefinition;
  validateResult(
    invocation: ToolInvocation,
    candidate: unknown,
  ): ToolResult;
}
