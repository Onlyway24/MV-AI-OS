import type { JsonObject } from "../contracts/json.js";
import type { ToolPermission } from "./tool-permission.js";
import type { ToolRiskLevel } from "./tool-risk-level.js";

export const TOOL_DEFINITION_SCHEMA_VERSION = "1" as const;

export type ToolSideEffect = "read_only" | "side_effecting";

export type ToolIdempotency = "not_required" | "required";

export interface ToolDefinition {
  readonly schemaVersion: typeof TOOL_DEFINITION_SCHEMA_VERSION;
  readonly toolId: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
  readonly sideEffect: ToolSideEffect;
  readonly riskLevel: ToolRiskLevel;
  readonly timeoutMs: number;
  readonly idempotency: ToolIdempotency;
  readonly requiredPermissions: readonly ToolPermission[];
}
