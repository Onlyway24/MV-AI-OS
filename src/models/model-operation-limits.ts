import type { RequestContractVersion } from "../contracts/request-envelope.js";

export interface ModelOperationLimits {
  readonly contractVersion: RequestContractVersion;
  readonly maxInputCharacters: number;
  readonly maxOutputTokens: number;
  readonly maxProviderCalls: number;
  readonly timeoutMs: number;
  readonly maxTotalTokens?: number;
  readonly maxCostUsd?: number;
}

