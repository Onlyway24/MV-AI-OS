import type {
  JsonArray,
  JsonObject,
  JsonValue,
} from "../contracts/json.js";
import type { LogEntry, Logger } from "../logging/logger.js";

const DEFAULT_MAX_ENTRY_BYTES = 16 * 1024;
const MAX_ARRAY_ITEMS = 64;
const MAX_DEPTH = 8;
const MAX_MESSAGE_LENGTH = 2_048;
const MAX_OBJECT_KEYS = 128;
const MAX_STRING_LENGTH = 4_096;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|passcode|password|private.?key|secret|session|signature|token)/iu;
const INLINE_SECRET =
  /(?:\b(?:basic|bearer)\s+[A-Za-z0-9._~+/=-]+|(?:access_token|api_key|password|secret|session|token)=([^&\s]+)|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b)/giu;

export interface JsonLogClock {
  now(): Date;
}

export interface RedactingJsonLoggerOptions {
  readonly clock?: JsonLogClock;
  readonly maxEntryBytes?: number;
  readonly sink?: (line: string) => void;
}

export class RedactingJsonLogger implements Logger {
  readonly #clock: JsonLogClock;
  readonly #maxEntryBytes: number;
  readonly #sink: (line: string) => void;

  public constructor(options: RedactingJsonLoggerOptions = {}) {
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
    if (
      !Number.isSafeInteger(this.#maxEntryBytes)
      || this.#maxEntryBytes < 256
    ) {
      throw new Error("maxEntryBytes must be a safe integer of at least 256");
    }
    this.#sink = options.sink ?? ((line) => {
      process.stdout.write(`${line}\n`);
    });
  }

  public log(entry: LogEntry): void {
    const normalized = {
      ...(entry.correlationId === undefined
        ? {}
        : { correlationId: sanitizeString(entry.correlationId) }),
      event: sanitizeString(entry.event),
      level: entry.level,
      message: sanitizeString(entry.message, MAX_MESSAGE_LENGTH),
      ...(entry.metadata === undefined
        ? {}
        : {
            metadata: sanitizeObject(
              entry.metadata,
              0,
              new WeakSet<object>(),
            ),
          }),
      ...(entry.requestId === undefined
        ? {}
        : { requestId: sanitizeString(entry.requestId) }),
      ...(entry.taskId === undefined
        ? {}
        : { taskId: sanitizeString(entry.taskId) }),
      timestamp: this.#clock.now().toISOString(),
    };
    let line = JSON.stringify(normalized);
    if (Buffer.byteLength(line, "utf8") > this.#maxEntryBytes) {
      line = JSON.stringify({
        event: sanitizeString(entry.event, 128),
        level: entry.level,
        message: "Log entry exceeded the configured size limit.",
        metadata: { truncated: true },
        timestamp: this.#clock.now().toISOString(),
      });
    }
    this.#sink(line);
  }
}

export const redactJsonValue = (value: JsonValue): JsonValue =>
  sanitizeValue(value, 0, new WeakSet<object>());

const sanitizeObject = (
  value: JsonObject,
  depth: number,
  seen: WeakSet<object>,
): JsonObject => {
  if (depth >= MAX_DEPTH) return Object.freeze({ truncated: true });
  if (seen.has(value)) return Object.freeze({ circular: true });
  seen.add(value);
  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, nested] of entries) {
    sanitized[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : sanitizeValue(nested, depth + 1, seen);
  }
  if (Object.keys(value).length > entries.length) {
    sanitized.truncated = true;
  }
  return Object.freeze(sanitized);
};

const sanitizeValue = (
  value: JsonValue,
  depth: number,
  seen: WeakSet<object>,
): JsonValue => {
  if (typeof value === "string") return sanitizeString(value);
  if (value === null || typeof value !== "object") return value;
  if (isJsonArray(value)) {
    if (depth >= MAX_DEPTH) return Object.freeze(["[TRUNCATED]"]);
    if (seen.has(value)) return Object.freeze(["[CIRCULAR]"]);
    seen.add(value);
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > sanitized.length) sanitized.push("[TRUNCATED]");
    return Object.freeze(sanitized);
  }
  return sanitizeObject(value, depth, seen);
};

const isJsonArray = (
  value: JsonArray | JsonObject,
): value is JsonArray => Array.isArray(value);

const sanitizeString = (
  value: string,
  maxLength = MAX_STRING_LENGTH,
): string => {
  const withoutSecrets = value.replace(INLINE_SECRET, REDACTED);
  if (withoutSecrets.length <= maxLength) return withoutSecrets;
  return `${withoutSecrets.slice(0, Math.max(0, maxLength - 13))}...[TRUNCATED]`;
};
