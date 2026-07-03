import type { ValidationIssue } from "../validation/validation.js";

export function prefixKnowledgeValidationIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map(({ code, message, path }) => ({
    code,
    message,
    path: path === "$" ? prefix : `${prefix}.${path}`,
  }));
}
