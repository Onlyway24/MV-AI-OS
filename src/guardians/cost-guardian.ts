import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const COST_GUARDIAN_CONTRACT_VERSION = "1" as const;

export type CostGuardianSeverity = "info" | "warning" | "critical";

export type CostGuardianFindingCategory =
  | "budget_exceeded"
  | "budget_nearing_limit"
  | "missing_budget"
  | "missing_usage_accounting"
  | "model_operation_blocked_by_limits"
  | "provider_failure_spike"
  | "repeated_limit_failures"
  | "unusual_provider_call_count";

export type CostGuardianRecordStatus =
  | "blocked"
  | "failed"
  | "succeeded";

export interface CostGuardianUsageRecord {
  readonly budgetConfigured: boolean;
  readonly budgetLimitUsd?: number;
  readonly budgetUtilizationRatio?: number;
  readonly contractVersion: RequestContractVersion;
  readonly estimatedCostUsd?: number;
  readonly failureCode?: string;
  readonly failureStage?:
    | "budget_enforcement"
    | "operation_limits"
    | "provider_invocation"
    | "response_validation"
    | "usage_accounting";
  readonly inputTokens?: number;
  readonly modelId: string;
  readonly occurredAt: string;
  readonly outputTokens?: number;
  readonly profileId: string;
  readonly providerCalls: number;
  readonly providerId: string;
  readonly recordId: string;
  readonly status: CostGuardianRecordStatus;
  readonly totalTokens?: number;
}

export interface CostGuardianThresholds {
  readonly budgetNearLimitRatio: number;
  readonly providerFailureSpikeCount: number;
  readonly repeatedLimitFailureCount: number;
  readonly unusualProviderCallCount: number;
}

export interface CostGuardianEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly records: readonly CostGuardianUsageRecord[];
  readonly thresholds?: CostGuardianThresholds;
}

export interface CostGuardianFindingEvidence {
  readonly budgetLimitUsd?: number;
  readonly budgetUtilizationRatio?: number;
  readonly estimatedCostUsd?: number;
  readonly failureCode?: string;
  readonly maximumProviderCalls?: number;
  readonly modelId?: string;
  readonly profileId?: string;
  readonly providerCalls?: number;
  readonly providerId?: string;
  readonly recordCount: number;
}

export interface CostGuardianFinding {
  readonly category: CostGuardianFindingCategory;
  readonly contractVersion: RequestContractVersion;
  readonly evidence: CostGuardianFindingEvidence;
  readonly findingId: string;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: CostGuardianSeverity;
  readonly title: string;
}

export interface CostGuardianReportSummary {
  readonly criticalFindings: number;
  readonly highestSeverity: CostGuardianSeverity;
  readonly totalEstimatedCostUsd: number;
  readonly totalProviderCalls: number;
  readonly totalRecords: number;
  readonly warningFindings: number;
}

export interface CostGuardianReport {
  readonly contractVersion: RequestContractVersion;
  readonly findings: readonly CostGuardianFinding[];
  readonly generatedAt: string;
  readonly summary: CostGuardianReportSummary;
}

export interface CostGuardian {
  evaluate(input: CostGuardianEvaluationInput): CostGuardianReport;
}
