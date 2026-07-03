import type { ValidationIssue } from "../../validation/validation.js";

const SPECIFICATION_IDENTIFIER_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

export function isAgentSpecificationIdentifier(value: string): boolean {
  return SPECIFICATION_IDENTIFIER_PATTERN.test(value);
}

export function prefixAgentSpecificationIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map(({ code, message, path }) => ({
    code,
    message,
    path: path === "$" ? prefix : `${prefix}.${path}`,
  }));
}
