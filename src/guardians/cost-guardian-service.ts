import {
  COST_GUARDIAN_CONTRACT_VERSION,
  type CostGuardian,
  type CostGuardianEvaluationInput,
  type CostGuardianFinding,
  type CostGuardianFindingCategory,
  type CostGuardianReport,
  type CostGuardianSeverity,
  type CostGuardianThresholds,
  type CostGuardianUsageRecord,
} from "./cost-guardian.js";
import {
  CostGuardianEvaluationInputValidator,
  CostGuardianReportValidator,
} from "./cost-guardian-validator.js";

export class CostGuardianValidationError extends Error {
  public readonly issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }[];

  public constructor(
    message: string,
    issues: readonly {
      readonly code: string;
      readonly message: string;
      readonly path: string;
    }[],
  ) {
    super(message);
    this.issues = issues;
  }
}

export class DeterministicCostGuardian implements CostGuardian {
  readonly #inputValidator = new CostGuardianEvaluationInputValidator();
  readonly #reportValidator = new CostGuardianReportValidator();

  public evaluate(input: CostGuardianEvaluationInput): CostGuardianReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new CostGuardianValidationError(
        "Cost Guardian input is invalid",
        inputValidation.issues,
      );
    }
    const validInput = inputValidation.value;
    const records = [...validInput.records].sort(compareRecords);
    const thresholds = normalizeThresholds(validInput.thresholds);
    const findings = buildFindings(records, thresholds);
    const report: CostGuardianReport = {
      contractVersion: COST_GUARDIAN_CONTRACT_VERSION,
      findings,
      generatedAt: validInput.generatedAt,
      summary: {
        criticalFindings: findings.filter(
          ({ severity }) => severity === "critical",
        ).length,
        highestSeverity: highestSeverity(findings),
        totalEstimatedCostUsd: roundCost(
          records.reduce(
            (total, record) => total + (record.estimatedCostUsd ?? 0),
            0,
          ),
        ),
        totalProviderCalls: records.reduce(
          (total, record) => total + record.providerCalls,
          0,
        ),
        totalRecords: records.length,
        warningFindings: findings.filter(
          ({ severity }) => severity === "warning",
        ).length,
      },
    };
    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new CostGuardianValidationError(
        "Cost Guardian generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function buildFindings(
  records: readonly CostGuardianUsageRecord[],
  thresholds: CostGuardianThresholds,
): readonly CostGuardianFinding[] {
  const findings: CostGuardianFinding[] = [];
  const missingBudget = records.filter((record) => !record.budgetConfigured);
  if (missingBudget.length > 0) {
    findings.push(
      finding("missing_budget", "warning", missingBudget, {
        message:
          "One or more model records do not have a configured budget rule.",
        recommendation:
          "Configure explicit model budgets before expanding provider usage.",
        title: "Missing model budget",
      }),
    );
  }

  const missingAccounting = records.filter(
    (record) =>
      record.status === "succeeded" &&
      record.totalTokens !== undefined &&
      record.estimatedCostUsd === undefined,
  );
  if (missingAccounting.length > 0) {
    findings.push(
      finding("missing_usage_accounting", "warning", missingAccounting, {
        message:
          "Some successful model usage records include tokens but no estimated cost.",
        recommendation:
          "Enable explicit usage accounting pricing for these model profiles.",
        title: "Missing usage accounting",
      }),
    );
  }

  const exceeded = records.filter(
    (record) =>
      (record.budgetUtilizationRatio ?? 0) >= 1 ||
      record.failureCode === "model_budget_estimated_cost_exceeded" ||
      record.failureCode === "model_budget_request_cost_exceeded",
  );
  if (exceeded.length > 0) {
    findings.push(
      finding("budget_exceeded", "critical", exceeded, {
        message: "One or more model records exceeded their configured budget.",
        recommendation:
          "Stop expanding model usage until the budget policy is reviewed.",
        title: "Model budget exceeded",
      }),
    );
  }

  const nearing = records.filter(
    (record) =>
      (record.budgetUtilizationRatio ?? 0) >=
        thresholds.budgetNearLimitRatio &&
      (record.budgetUtilizationRatio ?? 0) < 1,
  );
  if (nearing.length > 0) {
    findings.push(
      finding("budget_nearing_limit", "warning", nearing, {
        message: "One or more model records are near their configured budget.",
        recommendation:
          "Review model profile selection before running larger workloads.",
        title: "Model budget nearing limit",
      }),
    );
  }

  const unusualCalls = records.filter(
    (record) => record.providerCalls > thresholds.unusualProviderCallCount,
  );
  if (unusualCalls.length > 0) {
    findings.push(
      finding("unusual_provider_call_count", "warning", unusualCalls, {
        message: "One or more records used more provider calls than expected.",
        recommendation:
          "Inspect retry behavior and keep provider call limits conservative.",
        title: "Unusual provider call count",
      }),
    );
  }

  const operationLimitBlocks = records.filter(
    (record) => record.failureStage === "operation_limits",
  );
  if (operationLimitBlocks.length > 0) {
    findings.push(
      finding(
        "model_operation_blocked_by_limits",
        "info",
        operationLimitBlocks,
        {
          message:
            "Model operation limits blocked one or more unsafe or oversized requests.",
          recommendation:
            "Keep operation limits enabled and inspect the request shape before raising them.",
          title: "Model operation blocked by limits",
        },
      ),
    );
  }

  if (
    operationLimitBlocks.length >= thresholds.repeatedLimitFailureCount
  ) {
    findings.push(
      finding("repeated_limit_failures", "warning", operationLimitBlocks, {
        message: "Model operation limits blocked repeated requests.",
        recommendation:
          "Review the calling workflow before increasing model limits.",
        title: "Repeated model limit failures",
      }),
    );
  }

  const providerFailures = records.filter(
    (record) => record.failureStage === "provider_invocation",
  );
  if (providerFailures.length >= thresholds.providerFailureSpikeCount) {
    findings.push(
      finding("provider_failure_spike", "warning", providerFailures, {
        message: "Provider failures exceeded the configured spike threshold.",
        recommendation:
          "Pause live-provider expansion until provider health is understood.",
        title: "Provider failure spike",
      }),
    );
  }

  return Object.freeze(
    findings.map((candidate, index) =>
      Object.freeze({
        ...candidate,
        findingId: `cost-guardian:${String(index + 1).padStart(3, "0")}:${candidate.category}`,
      }),
    ),
  );
}

function finding(
  category: CostGuardianFindingCategory,
  severity: CostGuardianSeverity,
  records: readonly CostGuardianUsageRecord[],
  text: {
    readonly message: string;
    readonly recommendation: string;
    readonly title: string;
  },
): CostGuardianFinding {
  const representative = records[0];
  return {
    category,
    contractVersion: COST_GUARDIAN_CONTRACT_VERSION,
    evidence: {
      ...(representative?.budgetLimitUsd === undefined
        ? {}
        : { budgetLimitUsd: representative.budgetLimitUsd }),
      ...(representative?.budgetUtilizationRatio === undefined
        ? {}
        : {
            budgetUtilizationRatio:
              representative.budgetUtilizationRatio,
          }),
      ...(representative?.estimatedCostUsd === undefined
        ? {}
        : { estimatedCostUsd: representative.estimatedCostUsd }),
      ...(representative?.failureCode === undefined
        ? {}
        : { failureCode: representative.failureCode }),
      ...(representative?.modelId === undefined
        ? {}
        : { modelId: representative.modelId }),
      ...(representative?.profileId === undefined
        ? {}
        : { profileId: representative.profileId }),
      ...(representative?.providerCalls === undefined
        ? {}
        : { providerCalls: representative.providerCalls }),
      ...(representative?.providerId === undefined
        ? {}
        : { providerId: representative.providerId }),
      recordCount: records.length,
    },
    findingId: "cost-guardian:pending",
    message: text.message,
    recommendation: text.recommendation,
    severity,
    title: text.title,
  };
}

function normalizeThresholds(
  thresholds: CostGuardianEvaluationInput["thresholds"],
): CostGuardianThresholds {
  return {
    budgetNearLimitRatio: thresholds?.budgetNearLimitRatio ?? 0.8,
    providerFailureSpikeCount: thresholds?.providerFailureSpikeCount ?? 3,
    repeatedLimitFailureCount: thresholds?.repeatedLimitFailureCount ?? 2,
    unusualProviderCallCount: thresholds?.unusualProviderCallCount ?? 1,
  };
}

function highestSeverity(
  findings: readonly CostGuardianFinding[],
): CostGuardianSeverity {
  if (findings.some(({ severity }) => severity === "critical")) {
    return "critical";
  }
  if (findings.some(({ severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}

function compareRecords(
  left: CostGuardianUsageRecord,
  right: CostGuardianUsageRecord,
): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function roundCost(value: number): number {
  return Number(value.toFixed(12));
}
