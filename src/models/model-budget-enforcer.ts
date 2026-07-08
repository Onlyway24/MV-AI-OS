import type {
  ModelBudgetConfig,
  ModelBudgetRule,
  ModelBudgetViolation,
} from "./model-budget.js";
import type { ModelProfile } from "./model-profile.js";
import type { ModelRequest } from "./model-request.js";
import type { ModelResponse } from "./model-response.js";

export function enforceModelBudgetBeforeRequest(
  request: ModelRequest,
  profile: ModelProfile,
  config: ModelBudgetConfig | undefined,
): ModelBudgetViolation | undefined {
  if (config === undefined) {
    return undefined;
  }
  const rule = findBudgetRule(config, profile);
  if (rule === undefined) {
    return config.required
      ? violation(
          "model_budget_missing_rule",
          "Model budget is not configured for the selected model profile",
          profile,
        )
      : undefined;
  }

  if (
    request.limits.maxCostUsd === undefined &&
    rule.requireRequestCost
  ) {
    return violation(
      "model_budget_request_cost_missing",
      "The model request does not declare a maximum cost for budget enforcement",
      profile,
      rule.maxRequestedCostUsd,
    );
  }
  if (
    request.limits.maxCostUsd !== undefined &&
    rule.maxRequestedCostUsd !== undefined &&
    request.limits.maxCostUsd > rule.maxRequestedCostUsd
  ) {
    return violation(
      "model_budget_request_cost_exceeded",
      "The model request exceeds the configured model budget",
      profile,
      rule.maxRequestedCostUsd,
      request.limits.maxCostUsd,
    );
  }
  return undefined;
}

export function enforceModelBudgetAfterResponse(
  response: ModelResponse,
  profile: ModelProfile,
  config: ModelBudgetConfig | undefined,
): ModelBudgetViolation | undefined {
  if (config === undefined || response.usage === undefined) {
    return undefined;
  }
  const rule = findBudgetRule(config, profile);
  if (rule === undefined) {
    return config.required
      ? violation(
          "model_budget_missing_rule",
          "Model budget is not configured for the selected model profile",
          profile,
        )
      : undefined;
  }
  if (response.usage.costUsd === undefined && rule.requireEstimatedCost) {
    return violation(
      "model_budget_estimated_cost_missing",
      "The model response does not include estimated cost for budget enforcement",
      profile,
      rule.maxEstimatedCostUsd,
    );
  }
  if (
    response.usage.costUsd !== undefined &&
    rule.maxEstimatedCostUsd !== undefined &&
    response.usage.costUsd > rule.maxEstimatedCostUsd
  ) {
    return violation(
      "model_budget_estimated_cost_exceeded",
      "The model response exceeds the configured model budget",
      profile,
      rule.maxEstimatedCostUsd,
      response.usage.costUsd,
    );
  }
  return undefined;
}

function findBudgetRule(
  config: ModelBudgetConfig,
  profile: ModelProfile,
): ModelBudgetRule | undefined {
  return config.rules.find(
    (rule) =>
      rule.providerId === profile.providerId &&
      rule.modelId === profile.modelId &&
      rule.profileId === profile.profileId,
  );
}

function violation(
  code: ModelBudgetViolation["code"],
  message: string,
  profile: ModelProfile,
  maximumCostUsd?: number,
  actualCostUsd?: number,
): ModelBudgetViolation {
  return {
    code,
    details: {
      ...(actualCostUsd === undefined ? {} : { actualCostUsd }),
      ...(maximumCostUsd === undefined ? {} : { maximumCostUsd }),
      modelId: profile.modelId,
      profileId: profile.profileId,
      providerId: profile.providerId,
      reason: code,
    },
    message,
  };
}
