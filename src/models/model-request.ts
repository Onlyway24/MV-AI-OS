import type { JsonObject } from "../contracts/json.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { ModelOutputFormat } from "./model-profile.js";

export type ModelMessageRole = "assistant" | "system" | "user";

export interface ModelMessage {
  readonly role: ModelMessageRole;
  readonly content: string;
}

export interface ModelRequestOutput {
  readonly format: ModelOutputFormat;
  readonly schema?: JsonObject;
}

export interface ModelRequestLimits {
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsd?: number;
}

export interface ModelRequest {
  readonly contractVersion: RequestContractVersion;
  readonly modelRequestId: string;
  readonly correlationId: string;
  readonly taskId: string;
  readonly invocationId: string;
  readonly modelProfile: string;
  readonly messages: readonly ModelMessage[];
  readonly output: ModelRequestOutput;
  readonly limits: ModelRequestLimits;
  readonly metadata?: JsonObject;
}
