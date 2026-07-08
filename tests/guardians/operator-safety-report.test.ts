import { describe, expect, it } from "vitest";

import {
  DeterministicBackupGuardian,
  DeterministicCostGuardian,
  DeterministicIncidentGuardian,
  DeterministicOperatorSafetyReporter,
  DeterministicQualityGuardian,
  DeterministicSecurityGuardian,
  OperatorSafetyEvaluationInputValidator,
  OperatorSafetyReportValidationError,
  OperatorSafetyReportValidator,
  type BackupGuardianReadinessState,
  type CostGuardianUsageRecord,
  type IncidentGuardianOperationalSignals,
  type IncidentGuardianSourceSummary,
  type OperatorSafetyDomain,
  type OperatorSafetyEvaluationInput,
  type OperatorSafetyGuardianReports,
  type QualityGuardianQualityState,
  type SecurityGuardianSafetyState,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T16:00:00.000Z";
const EXPECTED_GUARDIANS: readonly OperatorSafetyDomain[] = [
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

describe("Operator Safety Report", () => {
  it("accepts valid sanitized guardian report input", () => {
    const input = createEvaluationInput();

    expect(new OperatorSafetyEvaluationInputValidator().validate(input)).toEqual(
      {
        ok: true,
        value: input,
      },
    );
  });

  it("reports a healthy system when all guardians are healthy", () => {
    const reporter = new DeterministicOperatorSafetyReporter();
    const report = reporter.evaluate(createEvaluationInput());

    expect(report.summary).toEqual({
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians: EXPECTED_GUARDIANS,
        missingGuardians: [],
      },
      criticalDomains: [],
      healthyDomains: EXPECTED_GUARDIANS,
      highestSeverity: "info",
      safetyToAutonomy: "safe_to_continue",
      status: "healthy",
      totalCriticalFindings: 0,
      totalFindings: 0,
      totalWarningFindings: 0,
      unknownDomains: [],
      warningDomains: [],
    });
    expect(report.guardianSummaries.map(({ domain, included, status }) => ({
      domain,
      included,
      status,
    }))).toEqual([
      { domain: "cost", included: true, status: "healthy" },
      { domain: "security", included: true, status: "healthy" },
      { domain: "backup", included: true, status: "healthy" },
      { domain: "incident", included: true, status: "healthy" },
      { domain: "quality", included: true, status: "healthy" },
    ]);
    expect(report.recommendedActions).toEqual([
      {
        actionId: "operator-safety:001:continue-current-operation",
        recommendation:
          "Continue operating within the current controlled boundaries and keep guardian reports current.",
        severity: "info",
        title: "Continue controlled operation",
      },
    ]);
    expect(reporter.evaluate(createEvaluationInput())).toEqual(report);
  });

  it("aggregates mixed warnings with deterministic operator actions", () => {
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          backup: createBackupReport({
            latestBackupAgeHours: 49,
            maxBackupAgeHours: 24,
          }),
          cost: createCostReport([
            createCostRecord({
              budgetUtilizationRatio: 0.9,
              estimatedCostUsd: 0.09,
            }),
          ]),
          quality: createQualityReport({
            humanReviewCompleted: false,
            humanReviewRequired: true,
          }),
          security: createSecurityReport({
            liveProviderEnabled: true,
          }),
        },
      }),
    );

    expect(report.summary).toMatchObject({
      highestSeverity: "warning",
      primaryAttentionDomain: "security",
      safetyToAutonomy: "continue_with_attention",
      status: "attention_required",
      totalCriticalFindings: 0,
      totalFindings: 4,
      totalWarningFindings: 4,
      warningDomains: ["cost", "security", "backup", "quality"],
    });
    expect(report.recommendedActions.map(({ actionId, domain }) => ({
      actionId,
      domain,
    }))).toEqual([
      {
        actionId: "operator-safety:001:review-security-warnings",
        domain: "security",
      },
      {
        actionId: "operator-safety:002:review-backup-warnings",
        domain: "backup",
      },
      {
        actionId: "operator-safety:003:review-cost-warnings",
        domain: "cost",
      },
      {
        actionId: "operator-safety:004:review-quality-warnings",
        domain: "quality",
      },
    ]);
  });

  it("lets critical findings dominate overall status and autonomy safety", () => {
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          backup: createBackupReport({
            latestBackupAvailable: false,
          }),
          cost: createCostReport([
            createCostRecord({
              budgetUtilizationRatio: 0.9,
              estimatedCostUsd: 0.09,
            }),
          ]),
          security: createSecurityReport({
            unsafeSecretMaterialDetected: true,
          }),
        },
      }),
    );

    expect(report.summary).toMatchObject({
      criticalDomains: ["security", "backup"],
      highestSeverity: "critical",
      primaryAttentionDomain: "security",
      safetyToAutonomy: "do_not_increase_autonomy",
      status: "critical",
      warningDomains: ["cost"],
    });
    expect(report.recommendedActions.map(({ actionId, domain, severity }) => ({
      actionId,
      domain,
      severity,
    }))).toEqual([
      {
        actionId: "operator-safety:001:review-critical-security",
        domain: "security",
        severity: "critical",
      },
      {
        actionId: "operator-safety:002:review-critical-backup",
        domain: "backup",
        severity: "critical",
      },
      {
        actionId: "operator-safety:003:review-cost-warnings",
        domain: "cost",
        severity: "warning",
      },
    ]);
  });

  it("prevents false healthy status when an expected guardian report is missing", () => {
    const cost = createCostReport([createCostRecord()]);
    const security = createSecurityReport();
    const backup = createBackupReport();
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          backup,
          cost,
          incident: createIncidentReport(),
          security,
        },
      }),
    );

    expect(report.summary).toMatchObject({
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians: ["cost", "security", "backup", "incident"],
        missingGuardians: ["quality"],
      },
      highestSeverity: "info",
      safetyToAutonomy: "unknown",
      status: "unknown",
      unknownDomains: ["quality"],
    });
    expect(report.recommendedActions).toEqual([
      {
        actionId: "operator-safety:001:provide-quality-report",
        domain: "quality",
        recommendation:
          "Provide a Quality Guardian report before publishing or workflow expansion.",
        severity: "warning",
        title: "Provide Quality Guardian report",
      },
    ]);
  });

  it("includes each guardian summary when present", () => {
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput(),
    );

    expect(report.guardianSummaries.map(({ domain, included }) => ({
      domain,
      included,
    }))).toEqual([
      { domain: "cost", included: true },
      { domain: "security", included: true },
      { domain: "backup", included: true },
      { domain: "incident", included: true },
      { domain: "quality", included: true },
    ]);
  });

  it("orders domain summaries and top findings deterministically", () => {
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          backup: createBackupReport({
            backupMetadataValid: false,
            backupPathValid: false,
          }),
          quality: createQualityReport({
            modelOutputRejected: true,
            unsafeContentPipelineDetected: true,
          }),
        },
      }),
    );

    expect(report.guardianSummaries.map(({ domain }) => domain)).toEqual(
      EXPECTED_GUARDIANS,
    );
    expect(
      report.guardianSummaries.find(({ domain }) => domain === "backup")
        ?.topFinding,
    ).toMatchObject({
      category: "backup_path_invalid",
      domain: "backup",
      findingId: "backup-guardian:001:backup_path_invalid",
    });
    expect(
      report.guardianSummaries.find(({ domain }) => domain === "quality")
        ?.topFinding,
    ).toMatchObject({
      category: "model_output_rejected",
      domain: "quality",
      findingId: "quality-guardian:001:model_output_rejected",
    });
  });

  it("calculates highest severity and safety-to-autonomy decisions", () => {
    const healthy = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput(),
    );
    const warning = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          cost: createCostReport([
            createCostRecord({
              budgetUtilizationRatio: 0.9,
              estimatedCostUsd: 0.09,
            }),
          ]),
        },
      }),
    );
    const critical = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          security: createSecurityReport({
            unsafeSecretMaterialDetected: true,
          }),
        },
      }),
    );

    expect(healthy.summary).toMatchObject({
      highestSeverity: "info",
      safetyToAutonomy: "safe_to_continue",
    });
    expect(warning.summary).toMatchObject({
      highestSeverity: "warning",
      safetyToAutonomy: "continue_with_attention",
    });
    expect(critical.summary).toMatchObject({
      highestSeverity: "critical",
      safetyToAutonomy: "do_not_increase_autonomy",
    });
  });

  it("rejects invalid operator report records", () => {
    const report = new DeterministicOperatorSafetyReporter().evaluate(
      createEvaluationInput(),
    );

    expect(
      new OperatorSafetyReportValidator().validate({
        ...report,
        summary: {
          ...report.summary,
          providerPayload: "raw payload must not be reportable",
        },
      }),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "summary.providerPayload",
        },
      ],
      ok: false,
    });
  });

  it("rejects invalid nested guardian report records", () => {
    const costReport = createCostReport([
      createCostRecord({
        budgetUtilizationRatio: 0.9,
        estimatedCostUsd: 0.09,
      }),
    ]);
    const input = createEvaluationInput();
    const invalidInput = {
      ...input,
      guardianReports: {
        ...input.guardianReports,
        cost: {
          ...costReport,
          findings: [
            {
              ...costReport.findings[0],
              evidence: {
                ...costReport.findings[0]?.evidence,
                providerPayload: "raw payload must not pass through",
              },
            },
          ],
        },
      },
    };

    expect(
      new OperatorSafetyEvaluationInputValidator().validate(invalidInput),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "guardianReports.cost.findings[0].evidence.providerPayload",
        },
      ],
      ok: false,
    });
  });

  it("keeps aggregate reports redaction-safe", () => {
    const reporter = new DeterministicOperatorSafetyReporter();
    const unsafeInput = {
      ...createEvaluationInput(),
      prompt: "raw prompt",
      secretRef: "env:OPENAI_API_KEY",
    } as unknown as OperatorSafetyEvaluationInput;

    expect(() => reporter.evaluate(unsafeInput)).toThrow(
      OperatorSafetyReportValidationError,
    );

    const report = reporter.evaluate(
      createEvaluationInput({
        guardianReports: {
          ...createHealthyReports(),
          quality: createQualityReport({
            humanReviewCompleted: false,
            humanReviewRequired: true,
          }),
          security: createSecurityReport({
            liveProviderEnabled: true,
          }),
        },
      }),
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("completion");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("knowledgeContent");
    expect(serialized).not.toContain("memoryContent");
    expect(serialized).not.toContain("/Users/");
  });
});

function createEvaluationInput(
  overrides: Partial<OperatorSafetyEvaluationInput> = {},
): OperatorSafetyEvaluationInput {
  return {
    contractVersion: "1",
    expectedGuardians: EXPECTED_GUARDIANS,
    generatedAt: GENERATED_AT,
    guardianReports: createHealthyReports(),
    ...overrides,
  };
}

function createHealthyReports(): OperatorSafetyGuardianReports {
  const cost = createCostReport([createCostRecord()]);
  const security = createSecurityReport();
  const backup = createBackupReport();
  return {
    backup,
    cost,
    incident: createIncidentReport([
      {
        criticalFindings: cost.summary.criticalFindings,
        guardian: "cost",
        warningFindings: cost.summary.warningFindings,
      },
      {
        criticalFindings: security.summary.criticalFindings,
        guardian: "security",
        warningFindings: security.summary.warningFindings,
      },
      {
        criticalFindings: backup.summary.criticalFindings,
        guardian: "backup",
        warningFindings: backup.summary.warningFindings,
      },
    ]),
    quality: createQualityReport(),
    security,
  };
}

function createCostReport(records: readonly CostGuardianUsageRecord[]) {
  return new DeterministicCostGuardian().evaluate({
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    records,
  });
}

function createCostRecord(
  overrides: Partial<CostGuardianUsageRecord> = {},
): CostGuardianUsageRecord {
  return {
    budgetConfigured: true,
    budgetLimitUsd: 1,
    budgetUtilizationRatio: 0.1,
    contractVersion: "1",
    estimatedCostUsd: 0.01,
    inputTokens: 100,
    modelId: "deterministic-test-model",
    occurredAt: GENERATED_AT,
    outputTokens: 50,
    profileId: "content-quality",
    providerCalls: 1,
    providerId: "deterministic-test-provider",
    recordId: "cost-record-1",
    status: "succeeded",
    totalTokens: 150,
    ...overrides,
  };
}

function createSecurityReport(
  overrides: Partial<SecurityGuardianSafetyState> = {},
) {
  return new DeterministicSecurityGuardian().evaluate({
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createSecurityState(overrides),
  });
}

function createSecurityState(
  overrides: Partial<SecurityGuardianSafetyState> = {},
): SecurityGuardianSafetyState {
  return {
    backupRestoreAvailable: true,
    budgetEnforcementConfigured: true,
    cloudOrVpsReadinessTargeted: false,
    controlledSecretReferenceConfigured: true,
    costGuardianAvailable: true,
    invalidSecretReferenceDetected: false,
    liveProviderEnabled: false,
    operationLimitsConfigured: true,
    toolExecutionApprovalRequired: true,
    toolExecutionAudited: true,
    toolExecutionEnabled: false,
    unsafeSecretMaterialDetected: false,
    usageAccountingConfigured: true,
    ...overrides,
  };
}

function createBackupReport(
  overrides: Partial<BackupGuardianReadinessState> = {},
) {
  return new DeterministicBackupGuardian().evaluate({
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createBackupState(overrides),
  });
}

function createBackupState(
  overrides: Partial<BackupGuardianReadinessState> = {},
): BackupGuardianReadinessState {
  return {
    backupMetadataValid: true,
    backupPathValid: true,
    cloudOrVpsReadinessTargeted: false,
    latestBackupAgeHours: 1,
    latestBackupAvailable: true,
    latestRestoreVerificationSucceeded: true,
    maxBackupAgeHours: 24,
    restoreVerificationAvailable: true,
    schemaVersionMatches: true,
    sourceDatabaseAvailable: true,
    ...overrides,
  };
}

function createIncidentReport(
  guardianSummaries: readonly IncidentGuardianSourceSummary[] = [],
  signalOverrides: Partial<IncidentGuardianOperationalSignals> = {},
) {
  return new DeterministicIncidentGuardian().evaluate({
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    guardianSummaries,
    signals: createIncidentSignals(signalOverrides),
  });
}

function createIncidentSignals(
  overrides: Partial<IncidentGuardianOperationalSignals> = {},
): IncidentGuardianOperationalSignals {
  return {
    backupRestoreVerificationFailureCount: 0,
    budgetBlockCount: 0,
    invalidConfigurationAttemptCount: 0,
    modelFailureCount: 0,
    operationLimitBlockCount: 0,
    providerUnavailableCount: 0,
    ...overrides,
  };
}

function createQualityReport(
  overrides: Partial<QualityGuardianQualityState> = {},
) {
  return new DeterministicQualityGuardian().evaluate({
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createQualityState(overrides),
  });
}

function createQualityState(
  overrides: Partial<QualityGuardianQualityState> = {},
): QualityGuardianQualityState {
  return {
    evidenceReferencesPresent: true,
    evidenceRequired: false,
    finalResponsePresent: true,
    humanReviewCompleted: true,
    humanReviewRequired: false,
    minimumReadinessScore: 80,
    modelOutputRejected: false,
    outputClaimsEvidence: false,
    readinessScore: 100,
    rejectedOutputCount: 0,
    rejectedOutputThreshold: 2,
    resultWellFormed: true,
    sourceReferencesPresent: true,
    taskResultComplete: true,
    unsafeContentPipelineDetected: false,
    validationFailureCount: 0,
    validationFailureThreshold: 2,
    ...overrides,
  };
}
