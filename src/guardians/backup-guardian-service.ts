import {
  BACKUP_GUARDIAN_CONTRACT_VERSION,
  type BackupGuardian,
  type BackupGuardianControlName,
  type BackupGuardianEvaluationInput,
  type BackupGuardianFinding,
  type BackupGuardianFindingCategory,
  type BackupGuardianReadinessState,
  type BackupGuardianReport,
  type BackupGuardianSeverity,
} from "./backup-guardian.js";
import {
  BackupGuardianEvaluationInputValidator,
  BackupGuardianReportValidator,
} from "./backup-guardian-validator.js";

export class BackupGuardianValidationError extends Error {
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

export class DeterministicBackupGuardian implements BackupGuardian {
  readonly #inputValidator = new BackupGuardianEvaluationInputValidator();
  readonly #reportValidator = new BackupGuardianReportValidator();

  public evaluate(input: BackupGuardianEvaluationInput): BackupGuardianReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new BackupGuardianValidationError(
        "Backup Guardian input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const findings = buildFindings(validInput.state);
    const report: BackupGuardianReport = {
      contractVersion: BACKUP_GUARDIAN_CONTRACT_VERSION,
      findings,
      generatedAt: validInput.generatedAt,
      summary: {
        criticalFindings: findings.filter(
          ({ severity }) => severity === "critical",
        ).length,
        highestSeverity: highestSeverity(findings),
        totalFindings: findings.length,
        warningFindings: findings.filter(
          ({ severity }) => severity === "warning",
        ).length,
      },
    };

    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new BackupGuardianValidationError(
        "Backup Guardian generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function buildFindings(
  state: BackupGuardianReadinessState,
): readonly BackupGuardianFinding[] {
  const findings: BackupGuardianFinding[] = [];

  if (!state.sourceDatabaseAvailable) {
    findings.push(
      finding(
        "source_database_missing",
        "critical",
        {
          affectedControls: ["source_database"],
        },
        {
          message:
            "The supplied backup-readiness state does not include an available source database.",
          recommendation:
            "Verify the local SQLite source of truth before relying on backup posture.",
          title: "Source database unavailable",
        },
      ),
    );
  }

  if (!state.latestBackupAvailable) {
    findings.push(
      finding(
        "backup_missing",
        "critical",
        {
          affectedControls: ["backup_presence"],
        },
        {
          message:
            "The supplied backup-readiness state does not include an available backup.",
          recommendation:
            "Create and verify a controlled local backup before expanding operations.",
          title: "Backup unavailable",
        },
      ),
    );
  }

  if (!state.backupPathValid) {
    findings.push(
      finding(
        "backup_path_invalid",
        "warning",
        {
          affectedControls: ["backup_path"],
        },
        {
          message:
            "The supplied backup-readiness state marks the backup path as invalid.",
          recommendation:
            "Use only validated local backup configuration and avoid exposing paths in reports.",
          title: "Invalid backup path signal",
        },
      ),
    );
  }

  if (!state.backupMetadataValid) {
    findings.push(
      finding(
        "backup_metadata_invalid",
        "warning",
        {
          affectedControls: ["backup_metadata"],
        },
        {
          message:
            "The supplied backup-readiness state marks backup metadata as invalid.",
          recommendation:
            "Verify backup metadata before using it for recovery decisions.",
          title: "Invalid backup metadata signal",
        },
      ),
    );
  }

  if (isBackupStale(state)) {
    const backupAgeHours = state.latestBackupAgeHours;
    findings.push(
      finding(
        "backup_stale",
        "warning",
        {
          affectedControls: ["backup_freshness"],
          ...(backupAgeHours === undefined ? {} : { backupAgeHours }),
          maxBackupAgeHours: state.maxBackupAgeHours,
        },
        {
          message:
            "The latest represented backup is older than the configured freshness threshold.",
          recommendation:
            "Refresh and verify a backup before moving toward unattended operation.",
          title: "Backup freshness threshold exceeded",
        },
      ),
    );
  }

  if (!state.restoreVerificationAvailable) {
    findings.push(
      finding(
        "missing_restore_verification",
        "critical",
        {
          affectedControls: ["restore_verification"],
        },
        {
          message:
            "The supplied backup-readiness state has no restore verification.",
          recommendation:
            "Verify restore capability before trusting backup availability.",
          title: "Missing restore verification",
        },
      ),
    );
  }

  if (
    state.restoreVerificationAvailable &&
    !state.latestRestoreVerificationSucceeded
  ) {
    findings.push(
      finding(
        "restore_verification_failed",
        "critical",
        {
          affectedControls: ["restore_verification"],
        },
        {
          message:
            "The latest represented restore verification did not succeed.",
          recommendation:
            "Treat recovery posture as unsafe until restore verification passes.",
          title: "Restore verification failed",
        },
      ),
    );
  }

  if (!state.schemaVersionMatches) {
    findings.push(
      finding(
        "schema_version_mismatch",
        "critical",
        {
          affectedControls: ["schema_version"],
        },
        {
          message:
            "The supplied backup-readiness state indicates a schema version mismatch.",
          recommendation:
            "Do not restore or promote mismatched backups without an explicit migration plan.",
          title: "Backup schema mismatch",
        },
      ),
    );
  }

  const cloudReadinessGaps = cloudReadinessControlGaps(state);
  if (
    state.cloudOrVpsReadinessTargeted &&
    cloudReadinessGaps.length > 0
  ) {
    findings.push(
      finding(
        "unsafe_cloud_backup_readiness",
        "warning",
        {
          affectedControls: cloudReadinessGaps,
        },
        {
          message:
            "The supplied state targets VPS or cloud readiness before backup controls are complete.",
          recommendation:
            "Complete backup freshness and restore verification before cloud or 24/7 operation.",
          title: "Unsafe cloud backup readiness",
        },
      ),
    );
  }

  return Object.freeze(
    findings.map((candidate, index) =>
      Object.freeze({
        ...candidate,
        findingId: `backup-guardian:${String(index + 1).padStart(3, "0")}:${candidate.category}`,
      }),
    ),
  );
}

function finding(
  category: BackupGuardianFindingCategory,
  severity: BackupGuardianSeverity,
  evidence: {
    readonly affectedControls?: readonly BackupGuardianControlName[];
    readonly backupAgeHours?: number;
    readonly maxBackupAgeHours?: number;
  },
  text: {
    readonly message: string;
    readonly recommendation: string;
    readonly title: string;
  },
): BackupGuardianFinding {
  return {
    category,
    contractVersion: BACKUP_GUARDIAN_CONTRACT_VERSION,
    evidence: {
      ...(evidence.affectedControls === undefined
        ? {}
        : { affectedControls: Object.freeze([...evidence.affectedControls]) }),
      ...(evidence.backupAgeHours === undefined
        ? {}
        : { backupAgeHours: evidence.backupAgeHours }),
      ...(evidence.maxBackupAgeHours === undefined
        ? {}
        : { maxBackupAgeHours: evidence.maxBackupAgeHours }),
      signalCount: 1,
    },
    findingId: "backup-guardian:pending",
    message: text.message,
    recommendation: text.recommendation,
    severity,
    title: text.title,
  };
}

function isBackupStale(state: BackupGuardianReadinessState): boolean {
  return (
    state.latestBackupAvailable &&
    state.latestBackupAgeHours !== undefined &&
    state.latestBackupAgeHours > state.maxBackupAgeHours
  );
}

function cloudReadinessControlGaps(
  state: BackupGuardianReadinessState,
): readonly BackupGuardianControlName[] {
  const gaps: BackupGuardianControlName[] = [];
  if (!state.sourceDatabaseAvailable) {
    gaps.push("source_database");
  }
  if (!state.latestBackupAvailable) {
    gaps.push("backup_presence");
  }
  if (!state.backupPathValid) {
    gaps.push("backup_path");
  }
  if (!state.backupMetadataValid) {
    gaps.push("backup_metadata");
  }
  if (isBackupStale(state)) {
    gaps.push("backup_freshness");
  }
  if (
    !state.restoreVerificationAvailable ||
    !state.latestRestoreVerificationSucceeded
  ) {
    gaps.push("restore_verification");
  }
  if (!state.schemaVersionMatches) {
    gaps.push("schema_version");
  }
  return Object.freeze(gaps);
}

function highestSeverity(
  findings: readonly BackupGuardianFinding[],
): BackupGuardianSeverity {
  if (findings.some(({ severity }) => severity === "critical")) {
    return "critical";
  }
  if (findings.some(({ severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}
