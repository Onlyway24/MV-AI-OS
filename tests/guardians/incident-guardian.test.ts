import { describe, expect, it } from "vitest";

import {
  DeterministicIncidentGuardian,
  IncidentGuardianEvaluationInputValidator,
  IncidentGuardianReportValidator,
  IncidentGuardianValidationError,
  type IncidentGuardianEvaluationInput,
  type IncidentGuardianOperationalSignals,
  type IncidentGuardianSourceSummary,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T14:00:00.000Z";

describe("Incident Guardian Foundation", () => {
  it("accepts valid sanitized incident input", () => {
    const input = createEvaluationInput();

    expect(new IncidentGuardianEvaluationInputValidator().validate(input)).toEqual({
      ok: true,
      value: input,
    });
  });

  it("rejects invalid input and unsafe raw fields", () => {
    const input = {
      ...createEvaluationInput(),
      signals: {
        ...createSignals(),
        databasePath: "/Users/fabio/private/mv-ai-os.sqlite",
        diagnostic: "raw provider diagnostic",
        prompt: "raw prompt",
        providerPayload: { raw: "payload" },
        secretRef: "env:OPENAI_API_KEY",
        transcriptText: "raw transcript",
      },
    };

    const result = new IncidentGuardianEvaluationInputValidator().validate(input);

    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.issues.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "unexpected", path: "signals.databasePath" },
        { code: "unexpected", path: "signals.diagnostic" },
        { code: "unexpected", path: "signals.prompt" },
        { code: "unexpected", path: "signals.providerPayload" },
        { code: "unexpected", path: "signals.secretRef" },
        { code: "unexpected", path: "signals.transcriptText" },
      ]),
    );
  });

  it("returns a normal deterministic report without findings", () => {
    const guardian = new DeterministicIncidentGuardian();
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

  it("reports repeated operational failures in deterministic order", () => {
    const report = new DeterministicIncidentGuardian().evaluate(
      createEvaluationInput({
        signals: createSignals({
          backupRestoreVerificationFailureCount: 1,
          budgetBlockCount: 2,
          invalidConfigurationAttemptCount: 2,
          modelFailureCount: 3,
          operationLimitBlockCount: 2,
          providerUnavailableCount: 2,
        }),
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "repeated_model_failures", severity: "warning" },
      { category: "repeated_budget_blocks", severity: "critical" },
      {
        category: "repeated_operation_limit_blocks",
        severity: "warning",
      },
      {
        category: "repeated_invalid_configuration_attempts",
        severity: "warning",
      },
      {
        category: "backup_restore_verification_failures",
        severity: "critical",
      },
      { category: "provider_unavailable_pattern", severity: "warning" },
    ]);
    expect(report.summary).toEqual({
      criticalFindings: 2,
      highestSeverity: "critical",
      totalFindings: 6,
      warningFindings: 4,
    });
  });

  it("escalates high-severity supplied guardian summaries", () => {
    const report = new DeterministicIncidentGuardian().evaluate(
      createEvaluationInput({
        guardianSummaries: [
          createGuardianSummary({ criticalFindings: 1, guardian: "backup" }),
          createGuardianSummary({ criticalFindings: 2, guardian: "security" }),
          createGuardianSummary({ criticalFindings: 3, guardian: "cost" }),
        ],
      }),
    );

    expect(report.findings.map(({ category, evidence }) => ({
      category,
      evidence,
    }))).toEqual([
      {
        category: "high_severity_cost_findings",
        evidence: {
          signalCount: 3,
          sourceGuardians: ["cost"],
        },
      },
      {
        category: "high_severity_security_findings",
        evidence: {
          signalCount: 2,
          sourceGuardians: ["security"],
        },
      },
      {
        category: "high_severity_backup_findings",
        evidence: {
          signalCount: 1,
          sourceGuardians: ["backup"],
        },
      },
    ]);
  });

  it("uses supplied thresholds deterministically", () => {
    const report = new DeterministicIncidentGuardian().evaluate(
      createEvaluationInput({
        signals: createSignals({
          modelFailureCount: 2,
          providerUnavailableCount: 1,
        }),
        thresholds: {
          backupRestoreVerificationFailureThreshold: 2,
          budgetBlockThreshold: 3,
          invalidConfigurationAttemptThreshold: 3,
          modelFailureThreshold: 2,
          operationLimitBlockThreshold: 3,
          providerUnavailableThreshold: 1,
        },
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "repeated_model_failures",
        evidence: {
          affectedSignals: ["model_failures"],
          signalCount: 2,
          threshold: 2,
        },
      },
      {
        category: "provider_unavailable_pattern",
        evidence: {
          affectedSignals: ["provider_unavailable"],
          signalCount: 1,
          threshold: 1,
        },
      },
    ]);
  });

  it("rejects duplicate guardian summaries", () => {
    expect(
      new IncidentGuardianEvaluationInputValidator().validate(
        createEvaluationInput({
          guardianSummaries: [
            createGuardianSummary({ guardian: "cost" }),
            createGuardianSummary({ guardian: "cost" }),
          ],
        }),
      ),
    ).toMatchObject({
      issues: [
        {
          code: "duplicate",
          path: "guardianSummaries[1].guardian",
        },
      ],
      ok: false,
    });
  });

  it("rejects invalid generated reports", () => {
    const report = new DeterministicIncidentGuardian().evaluate(
      createEvaluationInput({
        signals: createSignals({
          budgetBlockCount: 2,
        }),
      }),
    );

    expect(
      new IncidentGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              providerPayload: "raw payload must not be reportable",
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "findings[0].evidence.providerPayload",
        },
      ],
      ok: false,
    });
  });

  it("keeps findings redaction-safe", () => {
    const guardian = new DeterministicIncidentGuardian();
    const unsafeInput = {
      ...createEvaluationInput(),
      guardianSummaries: [
        {
          ...createGuardianSummary(),
          secretValue: "sk-live-secret",
        },
      ],
    };

    expect(() => guardian.evaluate(unsafeInput)).toThrow(
      IncidentGuardianValidationError,
    );

    const report = guardian.evaluate(
      createEvaluationInput({
        signals: createSignals({
          budgetBlockCount: 2,
          providerUnavailableCount: 2,
        }),
      }),
    );
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("/Users");
    expect(serialized).not.toContain("/private");
    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("env:");
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("completion");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("raw transcript");
  });

  it("rejects invalid evidence arrays", () => {
    const report = new DeterministicIncidentGuardian().evaluate(
      createEvaluationInput({
        signals: createSignals({
          budgetBlockCount: 2,
        }),
      }),
    );

    expect(
      new IncidentGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              affectedSignals: ["budget_blocks", "budget_blocks"],
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "duplicate",
          path: "findings[0].evidence.affectedSignals[1]",
        },
      ],
      ok: false,
    });
  });
});

function createEvaluationInput(
  overrides: Partial<IncidentGuardianEvaluationInput> = {},
): IncidentGuardianEvaluationInput {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    guardianSummaries: [],
    signals: createSignals(),
    ...overrides,
  };
}

function createSignals(
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

function createGuardianSummary(
  overrides: Partial<IncidentGuardianSourceSummary> = {},
): IncidentGuardianSourceSummary {
  return {
    criticalFindings: 0,
    guardian: "cost",
    warningFindings: 0,
    ...overrides,
  };
}
