import { createHash } from "node:crypto";

import type { JsonValue } from "../contracts/json.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";

export function createRequestFingerprint(
  request: RequestEnvelope,
): string {
  return createHash("sha256")
    .update(canonicalJson(request as unknown as JsonValue), "utf8")
    .digest("hex");
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, entry]) =>
        `${JSON.stringify(key)}:${canonicalJson(entry)}`,
    );
  return `{${entries.join(",")}}`;
}
