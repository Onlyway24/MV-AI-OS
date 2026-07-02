import type { JsonObject } from "../contracts/json.js";

export type LogLevel = "debug" | "error" | "info" | "warn";

export interface LogEntry {
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly metadata?: JsonObject;
}

export interface Logger {
  log(entry: LogEntry): void;
}
