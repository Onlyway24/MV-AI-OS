import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const MODEL_BUDGET_CONTRACT_VERSION = "1" as const;

export interface ModelBudgetRule {
  readonly contractVersion: RequestContractVersion;
  readonly maxEstimatedCostUsd?: number;
  readonly maxRequestedCostUsd?: number;
  readonly modelId: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly requireEstimatedCost: boolean;
  readonly requireRequestCost: boolean;
}

export interface ModelBudgetConfig {
  readonly contractVersion: RequestContractVersion;
  readonly required: boolean;
  readonly rules: readonly ModelBudgetRule[];
}

export type ModelBudgetViolationCode =
  | "model_budget_estimated_cost_exceeded"
  | "model_budget_estimated_cost_missing"
  | "model_budget_missing_rule"
  | "model_budget_request_cost_exceeded"
  | "model_budget_request_cost_missing";

export interface ModelBudgetViolation {
  readonly code: ModelBudgetViolationCode;
  readonly details: {
    readonly actualCostUsd?: number;
    readonly maximumCostUsd?: number;
    readonly modelId: string;
    readonly profileId: string;
    readonly providerId: string;
    readonly reason: ModelBudgetViolationCode;
  };
  readonly message: string;
}
