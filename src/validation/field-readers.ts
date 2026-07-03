import type { JsonObject } from "../contracts/json.js";
import type { ValidationIssue } from "./validation.js";
import { isJsonObject } from "./primitives.js";

interface StringOptions {
  readonly allowEmpty?: boolean;
  readonly maxLength?: number;
}

export function readRequiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  options: StringOptions = {},
): string | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (typeof value !== "string") {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be a string`,
      path,
    });
    return undefined;
  }

  if (options.allowEmpty !== true && value.trim().length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must not be empty`,
      path,
    });
    return undefined;
  }

  if (
    options.maxLength !== undefined &&
    value.length > options.maxLength
  ) {
    issues.push({
      code: "too_long",
      message: `${path} must not exceed ${String(options.maxLength)} characters`,
      path,
    });
    return undefined;
  }

  return value;
}

export function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  options: StringOptions = {},
): string | undefined {
  if (record[key] === undefined) {
    return undefined;
  }

  return readRequiredString(record, key, issues, pathPrefix, options);
}

export function readRequiredJsonObject(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): JsonObject | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (!isJsonObject(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_json_object",
      message: `${path} must be a finite, acyclic JSON object`,
      path,
    });
    return undefined;
  }

  return value;
}

export function readOptionalJsonObject(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): JsonObject | undefined {
  if (record[key] === undefined) {
    return undefined;
  }

  return readRequiredJsonObject(record, key, issues, pathPrefix);
}

export function readRequiredStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  allowEmpty = true,
): readonly string[] | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array of non-empty strings`,
      path,
    });
    return undefined;
  }

  const entries: readonly unknown[] = value;
  if (
    !entries.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    )
  ) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an array of non-empty strings`,
      path,
    });
    return undefined;
  }

  if (!allowEmpty && entries.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one value`,
      path,
    });
    return undefined;
  }

  const strings = entries.map((entry) => entry as string);
  if (new Set(strings).size !== strings.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicate values`,
      path,
    });
    return undefined;
  }

  return strings;
}

export function readRequiredBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): boolean | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (typeof value !== "boolean") {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be a boolean`,
      path,
    });
    return undefined;
  }

  return value;
}

export function readRequiredInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  minimum = 0,
): number | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    issues.push({
      code: value === undefined ? "required" : "invalid_number",
      message: `${path} must be a safe integer greater than or equal to ${String(minimum)}`,
      path,
    });
    return undefined;
  }

  return value;
}

export function readOptionalInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  minimum = 0,
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredInteger(record, key, issues, pathPrefix, minimum);
}

export function readOptionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
  minimum = 0,
): number | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    issues.push({
      code: "invalid_number",
      message: `${path} must be a finite number greater than or equal to ${String(minimum)}`,
      path,
    });
    return undefined;
  }

  return value;
}

function fieldPath(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}
