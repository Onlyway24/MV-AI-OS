import { describe, expect, it } from "vitest";

import {
  BackupGuardianEvaluationInputValidator,
  BackupGuardianReportValidator,
  BackupGuardianValidationError,
  DeterministicBackupGuardian,
  type BackupGuardianEvaluationInput,
  type BackupGuardianReadinessState,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T13:00:00.000Z";

describe("Backup Guardian Foundation", () => {
  it("accepts valid sanitized backup readiness input", () => {
    const input = createEvaluationInput();

    expect(new BackupGuardianEvaluationInputValidator().validate(input)).toEqual({
      ok: true,
      value: input,
    });
  });

  it("rejects invalid input and unsafe raw fields", () => {
    const input = {
      ...createEvaluationInput(),
      state: {
        ...createReadinessState(),
        backupPath: "/Users/fabio/private/mv-ai-os.sqlite",
        databaseRecord: { raw: "task payload" },
        prompt: "raw prompt",
        providerPayload: { diagnostic: "raw transport detail" },
        secretRef: "env:OPENAI_API_KEY",
        transcriptText: "raw transcript",
      },
    };

    const result = new BackupGuardianEvaluationInputValidator().validate(input);

    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.issues.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "unexpected", path: "state.backupPath" },
        { code: "unexpected", path: "state.databaseRecord" },
        { code: "unexpected", path: "state.prompt" },
        { code: "unexpected", path: "state.providerPayload" },
        { code: "unexpected", path: "state.secretRef" },
        { code: "unexpected", path: "state.transcriptText" },
      ]),
    );
  });

  it("returns a healthy deterministic report without findings", () => {
    const guardian = new DeterministicBackupGuardian();
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

  it("reports missing source database and missing backup as critical", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          latestBackupAvailable: false,
          sourceDatabaseAvailable: false,
        }),
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "source_database_missing", severity: "critical" },
      { category: "backup_missing", severity: "critical" },
    ]);
    expect(report.summary).toEqual({
      criticalFindings: 2,
      highestSeverity: "critical",
      totalFindings: 2,
      warningFindings: 0,
    });
  });

  it("reports stale backup using sanitized age evidence only", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          latestBackupAgeHours: 49,
          maxBackupAgeHours: 24,
        }),
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "backup_stale",
        evidence: {
          affectedControls: ["backup_freshness"],
          backupAgeHours: 49,
          maxBackupAgeHours: 24,
          signalCount: 1,
        },
        severity: "warning",
      },
    ]);
  });

  it("reports missing and failed restore verification", () => {
    const missing = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          restoreVerificationAvailable: false,
        }),
      }),
    );
    const failed = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          latestRestoreVerificationSucceeded: false,
          restoreVerificationAvailable: true,
        }),
      }),
    );

    expect(missing.findings).toMatchObject([
      {
        category: "missing_restore_verification",
        severity: "critical",
      },
    ]);
    expect(failed.findings).toMatchObject([
      {
        category: "restore_verification_failed",
        severity: "critical",
      },
    ]);
  });

  it("reports invalid path, invalid metadata, and schema mismatch signals", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          backupMetadataValid: false,
          backupPathValid: false,
          schemaVersionMatches: false,
        }),
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "backup_path_invalid", severity: "warning" },
      { category: "backup_metadata_invalid", severity: "warning" },
      { category: "schema_version_mismatch", severity: "critical" },
    ]);
  });

  it("reports unsafe cloud backup readiness deterministically", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          backupMetadataValid: false,
          backupPathValid: false,
          cloudOrVpsReadinessTargeted: true,
          latestBackupAgeHours: 72,
          latestRestoreVerificationSucceeded: false,
          maxBackupAgeHours: 24,
          schemaVersionMatches: false,
        }),
      }),
    );

    expect(report.findings.map(({ findingId }) => findingId)).toEqual([
      "backup-guardian:001:backup_path_invalid",
      "backup-guardian:002:backup_metadata_invalid",
      "backup-guardian:003:backup_stale",
      "backup-guardian:004:restore_verification_failed",
      "backup-guardian:005:schema_version_mismatch",
      "backup-guardian:006:unsafe_cloud_backup_readiness",
    ]);
    expect(report.findings.at(-1)).toMatchObject({
      category: "unsafe_cloud_backup_readiness",
      evidence: {
        affectedControls: [
          "backup_path",
          "backup_metadata",
          "backup_freshness",
          "restore_verification",
          "schema_version",
        ],
        signalCount: 1,
      },
      severity: "warning",
    });
  });

  it("rejects invalid generated reports", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          latestBackupAvailable: false,
        }),
      }),
    );

    expect(
      new BackupGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              backupPath: "/private/database.sqlite",
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "findings[0].evidence.backupPath",
        },
      ],
      ok: false,
    });
  });

  it("keeps findings redaction-safe", () => {
    const guardian = new DeterministicBackupGuardian();
    const unsafeInput = {
      ...createEvaluationInput(),
      state: {
        ...createReadinessState(),
        databasePath: "/Users/fabio/private/mv-ai-os.sqlite",
        secretValue: "sk-live-secret",
      },
    };

    expect(() => guardian.evaluate(unsafeInput)).toThrow(
      BackupGuardianValidationError,
    );

    const report = guardian.evaluate(
      createEvaluationInput({
        state: createReadinessState({
          backupMetadataValid: false,
          backupPathValid: false,
          latestBackupAvailable: false,
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
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("raw transcript");
  });

  it("rejects invalid affected-control evidence", () => {
    const report = new DeterministicBackupGuardian().evaluate(
      createEvaluationInput({
        state: createReadinessState({
          latestBackupAvailable: false,
        }),
      }),
    );

    expect(
      new BackupGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              affectedControls: ["backup_presence", "backup_presence"],
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
  overrides: Partial<BackupGuardianEvaluationInput> = {},
): BackupGuardianEvaluationInput {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createReadinessState(),
    ...overrides,
  };
}

function createReadinessState(
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
