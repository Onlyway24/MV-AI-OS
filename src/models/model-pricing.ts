import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const MODEL_PRICING_CONTRACT_VERSION = "1" as const;
export const MODEL_PRICING_CURRENCY = "USD" as const;

export type ModelPricingCurrency = typeof MODEL_PRICING_CURRENCY;

export interface ModelPricingRule {
  readonly contractVersion: RequestContractVersion;
  readonly currency: ModelPricingCurrency;
  readonly inputTokenUsdPerMillion: number;
  readonly modelId: string;
  readonly outputTokenUsdPerMillion: number;
  readonly profileId: string;
  readonly providerId: string;
}

export interface ModelUsageAccountingConfig {
  readonly contractVersion: RequestContractVersion;
  readonly pricing: readonly ModelPricingRule[];
  readonly required: boolean;
}

export interface ModelUsageAccountingResult {
  readonly contractVersion: RequestContractVersion;
  readonly currency: ModelPricingCurrency;
  readonly estimatedCostUsd: number;
  readonly inputTokens: number;
  readonly modelId: string;
  readonly outputTokens: number;
  readonly profileId: string;
  readonly providerId: string;
  readonly totalTokens: number;
}
