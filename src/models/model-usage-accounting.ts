import type { ModelProfile } from "./model-profile.js";
import {
  MODEL_PRICING_CONTRACT_VERSION,
  MODEL_PRICING_CURRENCY,
  type ModelPricingRule,
  type ModelUsageAccountingConfig,
  type ModelUsageAccountingResult,
} from "./model-pricing.js";
import type { ModelResponse } from "./model-response.js";
import type { ModelUsage } from "./model-usage.js";

export class ModelUsageAccountingError extends Error {
  public readonly code:
    | "model_usage_accounting_missing_pricing"
    | "model_usage_accounting_invalid_usage";

  public constructor(
    code:
      | "model_usage_accounting_missing_pricing"
      | "model_usage_accounting_invalid_usage",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function applyModelUsageAccounting(
  response: ModelResponse,
  profile: ModelProfile,
  config: ModelUsageAccountingConfig | undefined,
): ModelResponse {
  if (config === undefined || response.usage === undefined) {
    return response;
  }

  const rule = findPricingRule(config, profile);
  if (rule === undefined) {
    if (config.required) {
      throw new ModelUsageAccountingError(
        "model_usage_accounting_missing_pricing",
        "Model usage accounting pricing is not configured for the selected model profile",
      );
    }
    return response;
  }

  const accounting = calculateModelUsageAccounting({
    modelId: profile.modelId,
    profileId: profile.profileId,
    providerId: profile.providerId,
    rule,
    usage: response.usage,
  });
  const usage: ModelUsage = {
    ...response.usage,
    costUsd: accounting.estimatedCostUsd,
  };

  return response.status === "succeeded"
    ? {
        ...response,
        usage,
      }
    : {
        ...response,
        usage,
      };
}

export function calculateModelUsageAccounting(input: {
  readonly modelId: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly rule: ModelPricingRule;
  readonly usage: ModelUsage;
}): ModelUsageAccountingResult {
  validateUsage(input.usage);
  const estimatedCostUsd = roundCostUsd(
    (input.usage.inputTokens * input.rule.inputTokenUsdPerMillion +
      input.usage.outputTokens * input.rule.outputTokenUsdPerMillion) /
      1_000_000,
  );

  return {
    contractVersion: MODEL_PRICING_CONTRACT_VERSION,
    currency: MODEL_PRICING_CURRENCY,
    estimatedCostUsd,
    inputTokens: input.usage.inputTokens,
    modelId: input.modelId,
    outputTokens: input.usage.outputTokens,
    profileId: input.profileId,
    providerId: input.providerId,
    totalTokens: input.usage.totalTokens,
  };
}

function findPricingRule(
  config: ModelUsageAccountingConfig,
  profile: ModelProfile,
): ModelPricingRule | undefined {
  return config.pricing.find(
    (rule) =>
      rule.providerId === profile.providerId &&
      rule.modelId === profile.modelId &&
      rule.profileId === profile.profileId,
  );
}

function validateUsage(usage: ModelUsage): void {
  if (usage.inputTokens + usage.outputTokens > usage.totalTokens) {
    throw new ModelUsageAccountingError(
      "model_usage_accounting_invalid_usage",
      "Model usage token counts are inconsistent",
    );
  }
}

function roundCostUsd(value: number): number {
  return Number(value.toFixed(12));
}
