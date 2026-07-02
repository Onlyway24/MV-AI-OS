import type {
  ModelError,
  ModelErrorCategory,
} from "../models/model-error.js";
import type { ModelProviderReference } from "../models/model-response.js";
import type { ModelUsage } from "../models/model-usage.js";
import {
  readOptionalJsonObject,
  readOptionalNumber,
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import type { ValidationIssue } from "./validation.js";

const MODEL_ERROR_CATEGORIES = new Set<ModelErrorCategory>([
  "authentication",
  "authorization",
  "internal",
  "provider",
  "rate_limit",
  "timeout",
  "validation",
]);

export function readModelProviderReference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelProviderReference | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const providerId = readRequiredString(
    record,
    "providerId",
    issues,
    path,
  );
  const modelId = readRequiredString(record, "modelId", issues, path);
  return providerId === undefined || modelId === undefined
    ? undefined
    : { modelId, providerId };
}

export function readModelUsage(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelUsage | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const inputTokens = readRequiredInteger(
    record,
    "inputTokens",
    issues,
    path,
  );
  const outputTokens = readRequiredInteger(
    record,
    "outputTokens",
    issues,
    path,
  );
  const totalTokens = readRequiredInteger(
    record,
    "totalTokens",
    issues,
    path,
  );
  const costUsd = readOptionalNumber(record, "costUsd", issues, path);

  if (
    inputTokens !== undefined &&
    outputTokens !== undefined &&
    totalTokens !== undefined &&
    totalTokens !== inputTokens + outputTokens
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.totalTokens must equal inputTokens plus outputTokens`,
      path: `${path}.totalTokens`,
    });
  }

  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined
  ) {
    return undefined;
  }
  return {
    ...(costUsd === undefined ? {} : { costUsd }),
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function readModelError(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelError | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const code = readRequiredString(record, "code", issues, path);
  const category = readRequiredString(record, "category", issues, path);
  const message = readRequiredString(record, "message", issues, path);
  const retryable = readRequiredBoolean(
    record,
    "retryable",
    issues,
    path,
  );
  const stage = readRequiredString(record, "stage", issues, path);
  const details = readOptionalJsonObject(record, "details", issues, path);
  const occurredAt = readRequiredString(
    record,
    "occurredAt",
    issues,
    path,
  );

  if (
    category !== undefined &&
    !MODEL_ERROR_CATEGORIES.has(category as ModelErrorCategory)
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
    !MODEL_ERROR_CATEGORIES.has(category as ModelErrorCategory) ||
    message === undefined ||
    retryable === undefined ||
    stage === undefined ||
    occurredAt === undefined
  ) {
    return undefined;
  }
  return {
    category: category as ModelErrorCategory,
    code,
    ...(details === undefined ? {} : { details }),
    message,
    occurredAt,
    retryable,
    stage,
  };
}
