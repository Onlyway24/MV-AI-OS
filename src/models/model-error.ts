import type { JsonObject } from "../contracts/json.js";

export type ModelErrorCategory =
  | "authentication"
  | "authorization"
  | "internal"
  | "provider"
  | "rate_limit"
  | "timeout"
  | "validation";

export interface ModelError {
  readonly code: string;
  readonly category: ModelErrorCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly stage: string;
  readonly details?: JsonObject;
  readonly occurredAt: string;
}
