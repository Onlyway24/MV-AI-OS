import type { ValidationIssue } from "../../validation/validation.js";

const WORKFLOW_IDENTIFIER_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const WORKFLOW_FIELD_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/u;

export function isWorkflowIdentifier(value: string): boolean {
  return WORKFLOW_IDENTIFIER_PATTERN.test(value);
}

export function isWorkflowFieldPath(value: string): boolean {
  return WORKFLOW_FIELD_PATTERN.test(value);
}

export function prefixWorkflowSpecificationIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map(({ code, message, path }) => ({
    code,
    message,
    path: path === "$" ? prefix : `${prefix}.${path}`,
  }));
}
