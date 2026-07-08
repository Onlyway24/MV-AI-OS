import {
  readOptionalNumber,
  readRequiredInteger,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  BACKUP_GUARDIAN_CONTRACT_VERSION,
  type BackupGuardianControlName,
  type BackupGuardianEvaluationInput,
  type BackupGuardianFinding,
  type BackupGuardianFindingCategory,
  type BackupGuardianReadinessState,
  type BackupGuardianReport,
  type BackupGuardianSeverity,
} from "./backup-guardian.js";

const INPUT_KEYS = new Set(["contractVersion", "generatedAt", "state"]);

const STATE_KEYS = new Set([
  "backupMetadataValid",
  "backupPathValid",
  "cloudOrVpsReadinessTargeted",
  "latestBackupAgeHours",
  "latestBackupAvailable",
  "latestRestoreVerificationSucceeded",
  "maxBackupAgeHours",
  "restoreVerificationAvailable",
  "schemaVersionMatches",
  "sourceDatabaseAvailable",
]);

const REPORT_KEYS = new Set([
  "contractVersion",
  "findings",
  "generatedAt",
  "summary",
]);

const FINDING_KEYS = new Set([
  "category",
  "contractVersion",
  "evidence",
  "findingId",
  "message",
  "recommendation",
  "severity",
  "title",
]);

const EVIDENCE_KEYS = new Set([
  "affectedControls",
  "backupAgeHours",
  "maxBackupAgeHours",
  "signalCount",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "highestSeverity",
  "totalFindings",
  "warningFindings",
]);

const FINDING_CATEGORIES = new Set<BackupGuardianFindingCategory>([
  "backup_metadata_invalid",
  "backup_missing",
  "backup_path_invalid",
  "backup_stale",
  "missing_restore_verification",
  "restore_verification_failed",
  "schema_version_mismatch",
  "source_database_missing",
  "unsafe_cloud_backup_readiness",
]);

const SEVERITIES = new Set<BackupGuardianSeverity>([
  "critical",
  "info",
  "warning",
]);

const CONTROL_NAMES = new Set<BackupGuardianControlName>([
  "backup_freshness",
  "backup_metadata",
  "backup_path",
  "backup_presence",
  "restore_verification",
  "schema_version",
  "source_database",
]);

export class BackupGuardianEvaluationInputValidator
  implements Validator<BackupGuardianEvaluationInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<BackupGuardianEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "backup guardian input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const state = readReadinessState(record.state, issues);

    if (
      issues.length > 0 ||
      contractVersion !== BACKUP_GUARDIAN_CONTRACT_VERSION ||
      generatedAt === undefined ||
      state === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      generatedAt,
      state,
    });
  }
}

export class BackupGuardianReportValidator
  implements Validator<BackupGuardianReport>
{
  public validate(value: unknown): ValidationResult<BackupGuardianReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "backup guardian report must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REPORT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const findings = readFindings(record.findings, issues);
    const summary = readSummary(record.summary, issues);

    if (
      issues.length > 0 ||
      contractVersion !== BACKUP_GUARDIAN_CONTRACT_VERSION ||
      generatedAt === undefined ||
      findings === undefined ||
      summary === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      findings,
      generatedAt,
      summary,
    });
  }
}

function readReadinessState(
  value: unknown,
  issues: ValidationIssue[],
): BackupGuardianReadinessState | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "state must be an object",
      path: "state",
    });
    return undefined;
  }

  rejectUnknownKeys(record, STATE_KEYS, issues, "state");
  const backupMetadataValid = readRequiredBoolean(
    record,
    "backupMetadataValid",
    "state",
    issues,
  );
  const backupPathValid = readRequiredBoolean(
    record,
    "backupPathValid",
    "state",
    issues,
  );
  const cloudOrVpsReadinessTargeted = readRequiredBoolean(
    record,
    "cloudOrVpsReadinessTargeted",
    "state",
    issues,
  );
  const latestBackupAgeHours = readOptionalNumber(
    record,
    "latestBackupAgeHours",
    issues,
    "state",
    0,
  );
  const latestBackupAvailable = readRequiredBoolean(
    record,
    "latestBackupAvailable",
    "state",
    issues,
  );
  const latestRestoreVerificationSucceeded = readRequiredBoolean(
    record,
    "latestRestoreVerificationSucceeded",
    "state",
    issues,
  );
  const maxBackupAgeHours = readRequiredInteger(
    record,
    "maxBackupAgeHours",
    issues,
    "state",
    1,
  );
  const restoreVerificationAvailable = readRequiredBoolean(
    record,
    "restoreVerificationAvailable",
    "state",
    issues,
  );
  const schemaVersionMatches = readRequiredBoolean(
    record,
    "schemaVersionMatches",
    "state",
    issues,
  );
  const sourceDatabaseAvailable = readRequiredBoolean(
    record,
    "sourceDatabaseAvailable",
    "state",
    issues,
  );

  if (
    backupMetadataValid === undefined ||
    backupPathValid === undefined ||
    cloudOrVpsReadinessTargeted === undefined ||
    latestBackupAvailable === undefined ||
    latestRestoreVerificationSucceeded === undefined ||
    maxBackupAgeHours === undefined ||
    restoreVerificationAvailable === undefined ||
    schemaVersionMatches === undefined ||
    sourceDatabaseAvailable === undefined
  ) {
    return undefined;
  }

  return {
    backupMetadataValid,
    backupPathValid,
    cloudOrVpsReadinessTargeted,
    ...(latestBackupAgeHours === undefined ? {} : { latestBackupAgeHours }),
    latestBackupAvailable,
    latestRestoreVerificationSucceeded,
    maxBackupAgeHours,
    restoreVerificationAvailable,
    schemaVersionMatches,
    sourceDatabaseAvailable,
  };
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly BackupGuardianFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }

  const findings: BackupGuardianFinding[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `findings[${String(index)}]`;
    const finding = readFinding(entry, path, issues);
    if (finding !== undefined) {
      findings.push(finding);
    }
  }
  return issues.some(({ path }) => path.startsWith("findings"))
    ? undefined
    : Object.freeze(findings);
}

function readFinding(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): BackupGuardianFinding | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, FINDING_KEYS, issues, path);
  const contractVersion = readContractVersion(record, issues, path);
  const findingId = readRequiredString(record, "findingId", issues, path);
  const category = readRequiredString(record, "category", issues, path);
  const severity = readRequiredString(record, "severity", issues, path);
  const title = readRequiredString(record, "title", issues, path);
  const message = readRequiredString(record, "message", issues, path);
  const recommendation = readRequiredString(
    record,
    "recommendation",
    issues,
    path,
  );
  const evidence = readEvidence(record.evidence, `${path}.evidence`, issues);

  if (
    category !== undefined &&
    !FINDING_CATEGORIES.has(category as BackupGuardianFindingCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }
  if (
    severity !== undefined &&
    !SEVERITIES.has(severity as BackupGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.severity is not supported`,
      path: `${path}.severity`,
    });
  }

  if (
    contractVersion !== BACKUP_GUARDIAN_CONTRACT_VERSION ||
    findingId === undefined ||
    category === undefined ||
    !FINDING_CATEGORIES.has(category as BackupGuardianFindingCategory) ||
    severity === undefined ||
    !SEVERITIES.has(severity as BackupGuardianSeverity) ||
    title === undefined ||
    message === undefined ||
    recommendation === undefined ||
    evidence === undefined
  ) {
    return undefined;
  }

  return {
    category: category as BackupGuardianFindingCategory,
    contractVersion,
    evidence,
    findingId,
    message,
    recommendation,
    severity: severity as BackupGuardianSeverity,
    title,
  };
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): BackupGuardianFinding["evidence"] | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, EVIDENCE_KEYS, issues, path);
  const signalCount = readRequiredInteger(record, "signalCount", issues, path, 1);
  const backupAgeHours = readOptionalNumber(
    record,
    "backupAgeHours",
    issues,
    path,
    0,
  );
  const maxBackupAgeHours = readOptionalNumber(
    record,
    "maxBackupAgeHours",
    issues,
    path,
    1,
  );
  const affectedControls = readOptionalControls(
    record.affectedControls,
    `${path}.affectedControls`,
    issues,
  );

  if (signalCount === undefined || affectedControls === false) {
    return undefined;
  }

  return {
    ...(affectedControls === undefined ? {} : { affectedControls }),
    ...(backupAgeHours === undefined ? {} : { backupAgeHours }),
    ...(maxBackupAgeHours === undefined ? {} : { maxBackupAgeHours }),
    signalCount,
  };
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): BackupGuardianReport["summary"] | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "summary must be an object",
      path: "summary",
    });
    return undefined;
  }

  rejectUnknownKeys(record, SUMMARY_KEYS, issues, "summary");
  const totalFindings = readRequiredInteger(
    record,
    "totalFindings",
    issues,
    "summary",
  );
  const warningFindings = readRequiredInteger(
    record,
    "warningFindings",
    issues,
    "summary",
  );
  const criticalFindings = readRequiredInteger(
    record,
    "criticalFindings",
    issues,
    "summary",
  );
  const highestSeverity = readRequiredString(
    record,
    "highestSeverity",
    issues,
    "summary",
  );

  if (
    highestSeverity !== undefined &&
    !SEVERITIES.has(highestSeverity as BackupGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: "summary.highestSeverity is not supported",
      path: "summary.highestSeverity",
    });
  }
  if (
    totalFindings === undefined ||
    warningFindings === undefined ||
    criticalFindings === undefined ||
    highestSeverity === undefined ||
    !SEVERITIES.has(highestSeverity as BackupGuardianSeverity)
  ) {
    return undefined;
  }

  return {
    criticalFindings,
    highestSeverity: highestSeverity as BackupGuardianSeverity,
    totalFindings,
    warningFindings,
  };
}

function readOptionalControls(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly BackupGuardianControlName[] | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return false;
  }

  const controls: BackupGuardianControlName[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (
      typeof entry !== "string" ||
      !CONTROL_NAMES.has(entry as BackupGuardianControlName)
    ) {
      issues.push({
        code: "invalid_value",
        message: `${entryPath} is not a supported control`,
        path: entryPath,
      });
      continue;
    }
    if (seen.has(entry)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(entry);
    controls.push(entry as BackupGuardianControlName);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? false
    : Object.freeze(controls);
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
  pathPrefix = "",
): "1" | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
    pathPrefix,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== BACKUP_GUARDIAN_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${BACKUP_GUARDIAN_CONTRACT_VERSION}`,
      path: path(pathPrefix, "contractVersion"),
    });
  }
  return contractVersion === BACKUP_GUARDIAN_CONTRACT_VERSION
    ? contractVersion
    : undefined;
}

function readTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): string | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path(pathPrefix, key)} must be a UTC RFC 3339 timestamp`,
      path: path(pathPrefix, key),
    });
    return undefined;
  }
  return value;
}

function readRequiredBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): boolean | undefined {
  const value = record[key];
  if (typeof value !== "boolean") {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path(pathPrefix, key)} must be a boolean`,
      path: path(pathPrefix, key),
    });
    return undefined;
  }
  return value;
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${path(pathPrefix, key)} is not supported`,
        path: path(pathPrefix, key),
      });
    }
  }
}

function path(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}
