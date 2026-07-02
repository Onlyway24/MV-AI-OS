import type { RequestContractVersion } from "../contracts/request-envelope.js";

export type ModelOutputFormat = "json" | "text";

export interface ModelProfileLimits {
  readonly timeoutMs: number;
  readonly maxInputCharacters: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsd?: number;
}

export interface ModelProfile {
  readonly contractVersion: RequestContractVersion;
  readonly profileId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly supportedOutputFormats: readonly ModelOutputFormat[];
  readonly limits: ModelProfileLimits;
}
