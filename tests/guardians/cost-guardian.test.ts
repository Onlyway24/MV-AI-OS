import { describe, expect, it } from "vitest";

import {
  CostGuardianEvaluationInputValidator,
  CostGuardianReportValidator,
  CostGuardianValidationError,
  DeterministicCostGuardian,
  type CostGuardianEvaluationInput,
  type CostGuardianUsageRecord,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T09:00:00.000Z";

describe("Cost Guardian Foundation", () => {
  it("accepts valid sanitized cost signals", () => {
    const input = createEvaluationInput({
      records: [
        createUsageRecord({
          estimatedCostUsd: 0.00002,
          inputTokens: 4,
          outputTokens: 2,
          totalTokens: 6,
        }),
      ],
    });

    expect(new CostGuardianEvaluationInputValidator().validate(input)).toEqual({
      ok: true,
      value: input,
    });
  });

  it("rejects invalid cost signals and unsafe raw fields", () => {
    const input = {
      ...createEvaluationInput(),
      records: [
        {
          ...createUsageRecord(),
          completion: "raw completion must not cross this boundary",
          prompt: "raw prompt must not cross this boundary",
          providerPayload: { diagnostic: "raw transport detail" },
          secretRef: "env:OPENAI_API_KEY",
          status: "unknown",
        },
      ],
    };

    const result = new CostGuardianEvaluationInputValidator().validate(input);

    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.issues.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "unexpected", path: "records[0].prompt" },
        { code: "unexpected", path: "records[0].completion" },
        { code: "unexpected", path: "records[0].secretRef" },
        { code: "invalid_value", path: "records[0].status" },
      ]),
    );
  });

  it("rejects duplicate usage record identifiers", () => {
    expect(
      new CostGuardianEvaluationInputValidator().validate(
        createEvaluationInput({
          records: [
            createUsageRecord({ recordId: "duplicate" }),
            createUsageRecord({ recordId: "duplicate" }),
          ],
        }),
      ),
    ).toMatchObject({
      issues: [{ code: "duplicate", path: "records[1].recordId" }],
      ok: false,
    });
  });

  it("returns a deterministic normal-usage report without findings", () => {
    const guardian = new DeterministicCostGuardian();
    const input = createEvaluationInput({
      records: [
        createUsageRecord({
          estimatedCostUsd: 0.00002,
          occurredAt: "2026-07-08T09:00:02.000Z",
          providerCalls: 1,
          recordId: "usage-002",
        }),
        createUsageRecord({
          estimatedCostUsd: 0.00001,
          occurredAt: "2026-07-08T09:00:01.000Z",
          providerCalls: 1,
          recordId: "usage-001",
        }),
      ],
    });

    const firstReport = guardian.evaluate(input);
    const secondReport = guardian.evaluate({
      ...input,
      records: [...input.records].reverse(),
    });

    expect(firstReport).toEqual(secondReport);
    expect(firstReport).toEqual({
      contractVersion: "1",
      findings: [],
      generatedAt: GENERATED_AT,
      summary: {
        criticalFindings: 0,
        highestSeverity: "info",
        totalEstimatedCostUsd: 0.00003,
        totalProviderCalls: 2,
        totalRecords: 2,
        warningFindings: 0,
      },
    });
  });

  it("reports warning states without autonomous action", () => {
    const report = new DeterministicCostGuardian().evaluate(
      createEvaluationInput({
        records: [
          createUsageRecord({
            budgetLimitUsd: 0.1,
            budgetUtilizationRatio: 0.85,
            estimatedCostUsd: 0.085,
            recordId: "near-budget",
          }),
          createUsageRecord({
            estimatedCostUsd: 0.00002,
            providerCalls: 4,
            recordId: "many-provider-calls",
          }),
          createUsageRecord({
            inputTokens: 4,
            outputTokens: 2,
            recordId: "missing-accounting",
            totalTokens: 6,
            withCost: false,
          }),
          createUsageRecord({
            failureCode: "max_input_tokens_exceeded",
            failureStage: "operation_limits",
            recordId: "limit-block-001",
            status: "blocked",
          }),
          createUsageRecord({
            failureCode: "max_output_tokens_exceeded",
            failureStage: "operation_limits",
            recordId: "limit-block-002",
            status: "blocked",
          }),
          createUsageRecord({
            failureCode: "provider_unavailable",
            failureStage: "provider_invocation",
            recordId: "provider-failure-001",
            status: "failed",
          }),
          createUsageRecord({
            failureCode: "provider_unavailable",
            failureStage: "provider_invocation",
            recordId: "provider-failure-002",
            status: "failed",
          }),
        ],
        thresholds: {
          budgetNearLimitRatio: 0.8,
          providerFailureSpikeCount: 2,
          repeatedLimitFailureCount: 2,
          unusualProviderCallCount: 1,
        },
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "missing_usage_accounting", severity: "warning" },
      { category: "budget_nearing_limit", severity: "warning" },
      { category: "unusual_provider_call_count", severity: "warning" },
      { category: "model_operation_blocked_by_limits", severity: "info" },
      { category: "repeated_limit_failures", severity: "warning" },
      { category: "provider_failure_spike", severity: "warning" },
    ]);
    expect(report.summary).toMatchObject({
      criticalFindings: 0,
      highestSeverity: "warning",
      totalProviderCalls: 10,
      totalRecords: 7,
      warningFindings: 5,
    });
  });

  it("reports exceeded budgets as critical", () => {
    const report = new DeterministicCostGuardian().evaluate(
      createEvaluationInput({
        records: [
          createUsageRecord({
            budgetLimitUsd: 0.01,
            budgetUtilizationRatio: 1.2,
            estimatedCostUsd: 0.012,
            failureCode: "model_budget_estimated_cost_exceeded",
            failureStage: "budget_enforcement",
            recordId: "over-budget",
            status: "blocked",
          }),
        ],
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "budget_exceeded",
        evidence: {
          budgetLimitUsd: 0.01,
          budgetUtilizationRatio: 1.2,
          estimatedCostUsd: 0.012,
          failureCode: "model_budget_estimated_cost_exceeded",
          recordCount: 1,
        },
        severity: "critical",
      },
    ]);
    expect(report.summary.highestSeverity).toBe("critical");
  });

  it("reports missing budget separately from invented spend", () => {
    const report = new DeterministicCostGuardian().evaluate(
      createEvaluationInput({
        records: [
          createUsageRecord({
            budgetConfigured: false,
            recordId: "missing-budget",
            withCost: false,
            withUsage: false,
          }),
        ],
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "missing_budget",
        severity: "warning",
      },
    ]);
    expect(report.summary.totalEstimatedCostUsd).toBe(0);
  });

  it("rejects invalid generated reports", () => {
    const report = new DeterministicCostGuardian().evaluate(
      createEvaluationInput({
        records: [
          createUsageRecord({
            budgetConfigured: false,
            recordId: "missing-budget",
          }),
        ],
      }),
    );

    expect(
      new CostGuardianReportValidator().validate({
        ...report,
        summary: {
          ...report.summary,
          prompt: "raw prompt must not be reportable",
        },
      }),
    ).toMatchObject({
      issues: [{ code: "unexpected", path: "summary.prompt" }],
      ok: false,
    });
  });

  it("keeps findings redaction-safe", () => {
    const guardian = new DeterministicCostGuardian();
    const unsafeInput = {
      ...createEvaluationInput(),
      records: [
        {
          ...createUsageRecord({
            recordId: "unsafe",
          }),
          apiKey: "sk-live-secret",
        },
      ],
    };

    expect(() => guardian.evaluate(unsafeInput)).toThrow(
      CostGuardianValidationError,
    );

    const safeReport = guardian.evaluate(
      createEvaluationInput({
        records: [
          createUsageRecord({
            failureCode: "provider_unavailable",
            failureStage: "provider_invocation",
            recordId: "provider-failure",
            status: "failed",
          }),
        ],
        thresholds: {
          budgetNearLimitRatio: 0.8,
          providerFailureSpikeCount: 1,
          repeatedLimitFailureCount: 2,
          unusualProviderCallCount: 1,
        },
      }),
    );
    const serialized = JSON.stringify(safeReport);

    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("completion");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain("OPENAI_API_KEY");
  });
});

function createEvaluationInput(
  overrides: Partial<CostGuardianEvaluationInput> = {},
): CostGuardianEvaluationInput {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    records: [createUsageRecord()],
    ...overrides,
  };
}

function createUsageRecord(
  overrides: Partial<CostGuardianUsageRecord> & {
    readonly withCost?: boolean;
    readonly withUsage?: boolean;
  } = {},
): CostGuardianUsageRecord {
  const { withCost = true, withUsage = true, ...recordOverrides } = overrides;
  return {
    budgetConfigured: true,
    contractVersion: "1",
    modelId: "deterministic-model-v1",
    occurredAt: "2026-07-08T09:00:00.000Z",
    profileId: "content-quality",
    providerCalls: 1,
    providerId: "deterministic",
    recordId: "usage-001",
    status: "succeeded",
    ...(withCost ? { estimatedCostUsd: 0.00002 } : {}),
    ...(withUsage
      ? {
          inputTokens: 4,
          outputTokens: 2,
          totalTokens: 6,
        }
      : {}),
    ...recordOverrides,
  };
}
