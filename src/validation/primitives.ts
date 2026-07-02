import type { JsonObject, JsonValue } from "../contracts/json.js";

const RFC_3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

const MAX_JSON_DEPTH = 32;

export function asRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }

  return value as Readonly<Record<string, unknown>>;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value, new WeakSet<object>(), 0) && !Array.isArray(value);
}

export function isRfc3339Timestamp(value: string): boolean {
  return RFC_3339_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

export function isSemanticVersion(value: string): boolean {
  return SEMANTIC_VERSION_PATTERN.test(value);
}

function isJsonValue(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (depth >= MAX_JSON_DEPTH || typeof value !== "object") {
    return false;
  }

  const objectValue = value;
  if (ancestors.has(objectValue)) {
    return false;
  }

  ancestors.add(objectValue);

  const valid = Array.isArray(objectValue)
    ? objectValue.every((entry) =>
        isJsonValue(entry, ancestors, depth + 1),
      )
    : isRecordJsonObject(objectValue, ancestors, depth + 1);

  ancestors.delete(objectValue);
  return valid;
}

function isRecordJsonObject(
  value: object,
  ancestors: WeakSet<object>,
  depth: number,
): boolean {
  const record = asRecord(value);
  return (
    record !== undefined &&
    Object.values(record).every((entry) =>
      isJsonValue(entry, ancestors, depth),
    )
  );
}
