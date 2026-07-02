import type {
  ErrorCategory,
  ErrorRecord,
} from "../contracts/error-record.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredBoolean,
  readRequiredString,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import type { ValidationIssue } from "./validation.js";

const ERROR_CATEGORIES = new Set<ErrorCategory>([
  "authentication",
  "authorization",
  "cancelled",
  "conflict",
  "dependency",
  "internal",
  "model",
  "not_found",
  "persistence",
  "policy",
  "rate_limit",
  "timeout",
  "validation",
  "workflow",
]);

export function readErrorRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ErrorRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const code = readRequiredString(record, "code", issues, path);
  const category = readRequiredString(record, "category", issues, path);
  const message = readRequiredString(record, "message", issues, path);
  const retryable = readRequiredBoolean(record, "retryable", issues, path);
  const stage = readRequiredString(record, "stage", issues, path);
  const details = readOptionalJsonObject(record, "details", issues, path);
  const causeRef = readOptionalString(record, "causeRef", issues, path);
  const occurredAt = readRequiredString(record, "occurredAt", issues, path);

  if (
    category !== undefined &&
    !ERROR_CATEGORIES.has(category as ErrorCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }

  if (occurredAt !== undefined && !isRfc3339Timestamp(occurredAt)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path}.occurredAt must be a UTC RFC 3339 timestamp`,
      path: `${path}.occurredAt`,
    });
  }

  if (
    code === undefined ||
    category === undefined ||
    message === undefined ||
    retryable === undefined ||
    stage === undefined ||
    occurredAt === undefined ||
    !ERROR_CATEGORIES.has(category as ErrorCategory)
  ) {
    return undefined;
  }

  return {
    category: category as ErrorCategory,
    ...(causeRef === undefined ? {} : { causeRef }),
    code,
    ...(details === undefined ? {} : { details }),
    message,
    occurredAt,
    retryable,
    stage,
  };
}
