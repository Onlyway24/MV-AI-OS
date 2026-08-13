import { createHash } from "node:crypto";

const SPECIFICATION_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

export function createSpecificationFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value, new Set<object>()), "utf8")
    .digest("hex");
}

export function isSpecificationFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SPECIFICATION_FINGERPRINT_PATTERN.test(value)
  );
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("Specification fingerprint input must be finite JSON");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Specification fingerprint input must be acyclic");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalJson(entry, ancestors)).join(",")}]`;
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new TypeError("Specification fingerprint input must be plain JSON");
    }
    return `{${Object.keys(value)
      .sort(compareText)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Readonly<Record<string, unknown>>)[key],
            ancestors,
          )}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
