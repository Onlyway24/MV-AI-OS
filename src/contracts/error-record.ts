import type { JsonObject } from "./json.js";

export type ErrorCategory =
  | "authentication"
  | "authorization"
  | "cancelled"
  | "conflict"
  | "dependency"
  | "internal"
  | "model"
  | "not_found"
  | "persistence"
  | "policy"
  | "rate_limit"
  | "timeout"
  | "validation"
  | "workflow";

export interface ErrorRecord {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly stage: string;
  readonly details?: JsonObject;
  readonly causeRef?: string;
  readonly occurredAt: string;
}
