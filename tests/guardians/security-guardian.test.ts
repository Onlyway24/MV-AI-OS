import { describe, expect, it } from "vitest";

import {
  DeterministicSecurityGuardian,
  SecurityGuardianEvaluationInputValidator,
  SecurityGuardianReportValidator,
  SecurityGuardianValidationError,
  type SecurityGuardianEvaluationInput,
  type SecurityGuardianSafetyState,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T12:00:00.000Z";

describe("Security Guardian Foundation", () => {
  it("accepts valid sanitized security posture input", () => {
    const input = createEvaluationInput();

    expect(new SecurityGuardianEvaluationInputValidator().validate(input)).toEqual({
      ok: true,
      value: input,
    });
  });

  it("rejects invalid input and unsafe raw fields", () => {
    const input = {
      ...createEvaluationInput(),
      state: {
        ...createSafetyState(),
        apiKey: "sk-live-secret",
        completion: "raw completion",
        prompt: "raw prompt",
        providerPayload: { diagnostic: "raw transport detail" },
        secretRef: "env:OPENAI_API_KEY",
        transcriptText: "raw transcript",
      },
    };

    const result = new SecurityGuardianEvaluationInputValidator().validate(input);

    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.issues.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "unexpected", path: "state.apiKey" },
        { code: "unexpected", path: "state.prompt" },
        { code: "unexpected", path: "state.completion" },
        { code: "unexpected", path: "state.providerPayload" },
        { code: "unexpected", path: "state.secretRef" },
        { code: "unexpected", path: "state.transcriptText" },
      ]),
    );
  });

  it("returns a healthy deterministic report without findings", () => {
    const guardian = new DeterministicSecurityGuardian();
    const input = createEvaluationInput();

    expect(guardian.evaluate(input)).toEqual({
      contractVersion: "1",
      findings: [],
      generatedAt: GENERATED_AT,
      summary: {
        criticalFindings: 0,
        highestSeverity: "info",
        totalFindings: 0,
        warningFindings: 0,
      },
    });
    expect(guardian.evaluate(input)).toEqual(guardian.evaluate(input));
  });

  it("reports unsafe and missing controls in deterministic order", () => {
    const report = new DeterministicSecurityGuardian().evaluate(
      createEvaluationInput({
        state: createSafetyState({
          backupRestoreAvailable: false,
          budgetEnforcementConfigured: false,
          cloudOrVpsReadinessTargeted: true,
          controlledSecretReferenceConfigured: false,
          costGuardianAvailable: false,
          invalidSecretReferenceDetected: true,
          liveProviderEnabled: true,
          operationLimitsConfigured: false,
          toolExecutionApprovalRequired: false,
          toolExecutionAudited: false,
          toolExecutionEnabled: true,
          unsafeSecretMaterialDetected: true,
          usageAccountingConfigured: false,
        }),
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "unsafe_secret_material", severity: "critical" },
      { category: "missing_secret_reference", severity: "critical" },
      { category: "invalid_secret_reference", severity: "warning" },
      { category: "live_provider_mode_enabled", severity: "warning" },
      { category: "missing_operation_limits", severity: "critical" },
      { category: "missing_usage_accounting", severity: "warning" },
      { category: "missing_budget_enforcement", severity: "critical" },
      { category: "missing_backup_restore", severity: "warning" },
      { category: "missing_cost_guardian", severity: "warning" },
      {
        category: "tool_execution_enabled_without_approval",
        severity: "critical",
      },
      { category: "unsafe_cloud_readiness", severity: "warning" },
    ]);
    expect(report.findings.map(({ findingId }) => findingId)).toEqual([
      "security-guardian:001:unsafe_secret_material",
      "security-guardian:002:missing_secret_reference",
      "security-guardian:003:invalid_secret_reference",
      "security-guardian:004:live_provider_mode_enabled",
      "security-guardian:005:missing_operation_limits",
      "security-guardian:006:missing_usage_accounting",
      "security-guardian:007:missing_budget_enforcement",
      "security-guardian:008:missing_backup_restore",
      "security-guardian:009:missing_cost_guardian",
      "security-guardian:010:tool_execution_enabled_without_approval",
      "security-guardian:011:unsafe_cloud_readiness",
    ]);
    expect(report.summary).toEqual({
      criticalFindings: 5,
      highestSeverity: "critical",
      totalFindings: 11,
      warningFindings: 6,
    });
  });

  it("warns for live provider mode even when required controls are present", () => {
    const report = new DeterministicSecurityGuardian().evaluate(
      createEvaluationInput({
        state: createSafetyState({
          controlledSecretReferenceConfigured: true,
          liveProviderEnabled: true,
        }),
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "live_provider_mode_enabled",
        evidence: {
          liveProviderEnabled: true,
          signalCount: 1,
        },
        severity: "warning",
      },
    ]);
  });

  it("reports tool execution without approval and audit as unsafe", () => {
    const report = new DeterministicSecurityGuardian().evaluate(
      createEvaluationInput({
        state: createSafetyState({
          toolExecutionApprovalRequired: false,
          toolExecutionAudited: false,
          toolExecutionEnabled: true,
        }),
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "tool_execution_enabled_without_approval",
        evidence: {
          affectedControls: ["tool_approval", "tool_audit"],
          signalCount: 1,
        },
        severity: "critical",
      },
    ]);
  });

  it("rejects invalid generated reports", () => {
    const report = new DeterministicSecurityGuardian().evaluate(
      createEvaluationInput({
        state: createSafetyState({
          operationLimitsConfigured: false,
        }),
      }),
    );

    expect(
      new SecurityGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              prompt: "raw prompt must not be reportable",
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "findings[0].evidence.prompt",
        },
      ],
      ok: false,
    });
  });

  it("keeps findings redaction-safe", () => {
    const guardian = new DeterministicSecurityGuardian();
    const unsafeInput = {
      ...createEvaluationInput(),
      state: {
        ...createSafetyState(),
        secretValue: "sk-live-secret",
      },
    };

    expect(() => guardian.evaluate(unsafeInput)).toThrow(
      SecurityGuardianValidationError,
    );

    const report = guardian.evaluate(
      createEvaluationInput({
        state: createSafetyState({
          controlledSecretReferenceConfigured: false,
          liveProviderEnabled: true,
          unsafeSecretMaterialDetected: true,
        }),
      }),
    );
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("env:");
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("raw completion");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("raw transcript");
  });

  it("rejects invalid affected-control evidence", () => {
    const report = new DeterministicSecurityGuardian().evaluate(
      createEvaluationInput({
        state: createSafetyState({
          backupRestoreAvailable: false,
        }),
      }),
    );

    expect(
      new SecurityGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              affectedControls: ["backup_restore", "backup_restore"],
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "duplicate",
          path: "findings[0].evidence.affectedControls[1]",
        },
      ],
      ok: false,
    });
  });
});

function createEvaluationInput(
  overrides: Partial<SecurityGuardianEvaluationInput> = {},
): SecurityGuardianEvaluationInput {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createSafetyState(),
    ...overrides,
  };
}

function createSafetyState(
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
