import type { ToolDefinition } from "./tool-definition.js";

export interface ToolRegistry {
  get(toolId: string, version: string): ToolDefinition | undefined;
  list(): readonly ToolDefinition[];
  listVersions(toolId: string): readonly ToolDefinition[];
}
