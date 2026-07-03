import type { ToolAccessPermission } from "./tool-permission.js";
import type { ValidationIssue } from "../validation/validation.js";

const TOOL_IDENTIFIER_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const TOOL_PERMISSION_PATTERN =
  /^tool:(?:execute|read):([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)$/u;

export function isToolIdentifier(value: string): boolean {
  return TOOL_IDENTIFIER_PATTERN.test(value);
}

export function isToolAccessPermission(
  value: string,
): value is ToolAccessPermission {
  return TOOL_PERMISSION_PATTERN.test(value);
}

export function toolIdFromPermission(
  permission: ToolAccessPermission,
): string {
  return TOOL_PERMISSION_PATTERN.exec(permission)?.[1] ?? "";
}

export function prefixToolIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map(({ code, message, path }) => ({
    code,
    message,
    path: path === "$" ? prefix : `${prefix}.${path}`,
  }));
}
