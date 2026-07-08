import {
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
  INCIDENT_GUARDIAN_CONTRACT_VERSION,
  type IncidentGuardianEvaluationInput,
  type IncidentGuardianFinding,
  type IncidentGuardianFindingCategory,
  type IncidentGuardianOperationalSignals,
  type IncidentGuardianReport,
  type IncidentGuardianSeverity,
  type IncidentGuardianSignalName,
  type IncidentGuardianSourceGuardian,
  type IncidentGuardianSourceSummary,
  type IncidentGuardianThresholds,
} from "./incident-guardian.js";

const INPUT_KEYS = new Set([
  "contractVersion",
  "generatedAt",
  "guardianSummaries",
  "signals",
  "thresholds",
]);

const SIGNAL_KEYS = new Set([
  "backupRestoreVerificationFailureCount",
  "budgetBlockCount",
  "invalidConfigurationAttemptCount",
  "modelFailureCount",
  "operationLimitBlockCount",
  "providerUnavailableCount",
]);

const SOURCE_SUMMARY_KEYS = new Set([
  "criticalFindings",
  "guardian",
  "warningFindings",
]);

const THRESHOLD_KEYS = new Set([
  "backupRestoreVerificationFailureThreshold",
  "budgetBlockThreshold",
  "invalidConfigurationAttemptThreshold",
  "modelFailureThreshold",
  "operationLimitBlockThreshold",
  "providerUnavailableThreshold",
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
  "affectedSignals",
  "signalCount",
  "sourceGuardians",
  "threshold",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "highestSeverity",
  "totalFindings",
  "warningFindings",
]);

const FINDING_CATEGORIES = new Set<IncidentGuardianFindingCategory>([
  "backup_restore_verification_failures",
  "high_severity_backup_findings",
  "high_severity_cost_findings",
  "high_severity_security_findings",
  "provider_unavailable_pattern",
  "repeated_budget_blocks",
  "repeated_invalid_configuration_attempts",
  "repeated_model_failures",
  "repeated_operation_limit_blocks",
]);

const SEVERITIES = new Set<IncidentGuardianSeverity>([
  "critical",
  "info",
  "warning",
]);

const SIGNAL_NAMES = new Set<IncidentGuardianSignalName>([
  "backup_restore_verification_failures",
  "budget_blocks",
  "guardian_findings",
  "invalid_configuration_attempts",
  "model_failures",
  "operation_limit_blocks",
  "provider_unavailable",
]);

const SOURCE_GUARDIANS = new Set<IncidentGuardianSourceGuardian>([
  "backup",
  "cost",
  "security",
]);

export class IncidentGuardianEvaluationInputValidator
  implements Validator<IncidentGuardianEvaluationInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<IncidentGuardianEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "incident guardian input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const signals = readSignals(record.signals, issues);
    const guardianSummaries = readSourceSummaries(
      record.guardianSummaries,
      issues,
    );
    const thresholds =
      record.thresholds === undefined
        ? undefined
        : readThresholds(record.thresholds, issues);

    if (
      issues.length > 0 ||
      contractVersion !== INCIDENT_GUARDIAN_CONTRACT_VERSION ||
      generatedAt === undefined ||
      signals === undefined ||
      guardianSummaries === undefined ||
      thresholds === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      generatedAt,
      guardianSummaries,
      signals,
      ...(thresholds === undefined ? {} : { thresholds }),
    });
  }
}

export class IncidentGuardianReportValidator
  implements Validator<IncidentGuardianReport>
{
  public validate(value: unknown): ValidationResult<IncidentGuardianReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "incident guardian report must be an object",
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
      contractVersion !== INCIDENT_GUARDIAN_CONTRACT_VERSION ||
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

function readSignals(
  value: unknown,
  issues: ValidationIssue[],
): IncidentGuardianOperationalSignals | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "signals must be an object",
      path: "signals",
    });
    return undefined;
  }
  rejectUnknownKeys(record, SIGNAL_KEYS, issues, "signals");
  const backupRestoreVerificationFailureCount = readRequiredInteger(
    record,
    "backupRestoreVerificationFailureCount",
    issues,
    "signals",
  );
  const budgetBlockCount = readRequiredInteger(
    record,
    "budgetBlockCount",
    issues,
    "signals",
  );
  const invalidConfigurationAttemptCount = readRequiredInteger(
    record,
    "invalidConfigurationAttemptCount",
    issues,
    "signals",
  );
  const modelFailureCount = readRequiredInteger(
    record,
    "modelFailureCount",
    issues,
    "signals",
  );
  const operationLimitBlockCount = readRequiredInteger(
    record,
    "operationLimitBlockCount",
    issues,
    "signals",
  );
  const providerUnavailableCount = readRequiredInteger(
    record,
    "providerUnavailableCount",
    issues,
    "signals",
  );

  if (
    backupRestoreVerificationFailureCount === undefined ||
    budgetBlockCount === undefined ||
    invalidConfigurationAttemptCount === undefined ||
    modelFailureCount === undefined ||
    operationLimitBlockCount === undefined ||
    providerUnavailableCount === undefined
  ) {
    return undefined;
  }

  return {
    backupRestoreVerificationFailureCount,
    budgetBlockCount,
    invalidConfigurationAttemptCount,
    modelFailureCount,
    operationLimitBlockCount,
    providerUnavailableCount,
  };
}

function readSourceSummaries(
  value: unknown,
  issues: ValidationIssue[],
): readonly IncidentGuardianSourceSummary[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "guardianSummaries must be an array",
      path: "guardianSummaries",
    });
    return undefined;
  }

  const summaries: IncidentGuardianSourceSummary[] = [];
  const guardians = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `guardianSummaries[${String(index)}]`;
    const summary = readSourceSummary(entry, path, issues);
    if (summary === undefined) {
      continue;
    }
    if (guardians.has(summary.guardian)) {
      issues.push({
        code: "duplicate",
        message: `${path}.guardian must be unique`,
        path: `${path}.guardian`,
      });
      continue;
    }
    guardians.add(summary.guardian);
    summaries.push(summary);
  }
  return issues.some(({ path }) => path.startsWith("guardianSummaries"))
    ? undefined
    : Object.freeze(summaries);
}

function readSourceSummary(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): IncidentGuardianSourceSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, SOURCE_SUMMARY_KEYS, issues, path);
  const guardian = readRequiredString(record, "guardian", issues, path);
  const criticalFindings = readRequiredInteger(
    record,
    "criticalFindings",
    issues,
    path,
  );
  const warningFindings = readRequiredInteger(
    record,
    "warningFindings",
    issues,
    path,
  );
  if (
    guardian !== undefined &&
    !SOURCE_GUARDIANS.has(guardian as IncidentGuardianSourceGuardian)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.guardian is not supported`,
      path: `${path}.guardian`,
    });
  }
  if (
    guardian === undefined ||
    !SOURCE_GUARDIANS.has(guardian as IncidentGuardianSourceGuardian) ||
    criticalFindings === undefined ||
    warningFindings === undefined
  ) {
    return undefined;
  }
  return {
    criticalFindings,
    guardian: guardian as IncidentGuardianSourceGuardian,
    warningFindings,
  };
}

function readThresholds(
  value: unknown,
  issues: ValidationIssue[],
): IncidentGuardianThresholds | false {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "thresholds must be an object",
      path: "thresholds",
    });
    return false;
  }
  rejectUnknownKeys(record, THRESHOLD_KEYS, issues, "thresholds");
  return {
    backupRestoreVerificationFailureThreshold:
      readOptionalInteger(
        record,
        "backupRestoreVerificationFailureThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 1,
    budgetBlockThreshold:
      readOptionalInteger(
        record,
        "budgetBlockThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 2,
    invalidConfigurationAttemptThreshold:
      readOptionalInteger(
        record,
        "invalidConfigurationAttemptThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 2,
    modelFailureThreshold:
      readOptionalInteger(
        record,
        "modelFailureThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 3,
    operationLimitBlockThreshold:
      readOptionalInteger(
        record,
        "operationLimitBlockThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 2,
    providerUnavailableThreshold:
      readOptionalInteger(
        record,
        "providerUnavailableThreshold",
        "thresholds",
        issues,
        1,
      ) ?? 2,
  };
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly IncidentGuardianFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }

  const findings: IncidentGuardianFinding[] = [];
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
): IncidentGuardianFinding | undefined {
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
    !FINDING_CATEGORIES.has(category as IncidentGuardianFindingCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }
  if (
    severity !== undefined &&
    !SEVERITIES.has(severity as IncidentGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.severity is not supported`,
      path: `${path}.severity`,
    });
  }

  if (
    contractVersion !== INCIDENT_GUARDIAN_CONTRACT_VERSION ||
    findingId === undefined ||
    category === undefined ||
    !FINDING_CATEGORIES.has(category as IncidentGuardianFindingCategory) ||
    severity === undefined ||
    !SEVERITIES.has(severity as IncidentGuardianSeverity) ||
    title === undefined ||
    message === undefined ||
    recommendation === undefined ||
    evidence === undefined
  ) {
    return undefined;
  }

  return {
    category: category as IncidentGuardianFindingCategory,
    contractVersion,
    evidence,
    findingId,
    message,
    recommendation,
    severity: severity as IncidentGuardianSeverity,
    title,
  };
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): IncidentGuardianFinding["evidence"] | undefined {
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
  const threshold = readOptionalInteger(record, "threshold", path, issues, 1);
  const affectedSignals = readOptionalSignalNames(
    record.affectedSignals,
    `${path}.affectedSignals`,
    issues,
  );
  const sourceGuardians = readOptionalSourceGuardians(
    record.sourceGuardians,
    `${path}.sourceGuardians`,
    issues,
  );

  if (
    signalCount === undefined ||
    affectedSignals === false ||
    sourceGuardians === false
  ) {
    return undefined;
  }

  return {
    ...(affectedSignals === undefined ? {} : { affectedSignals }),
    signalCount,
    ...(sourceGuardians === undefined ? {} : { sourceGuardians }),
    ...(threshold === undefined ? {} : { threshold }),
  };
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): IncidentGuardianReport["summary"] | undefined {
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
    !SEVERITIES.has(highestSeverity as IncidentGuardianSeverity)
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
    !SEVERITIES.has(highestSeverity as IncidentGuardianSeverity)
  ) {
    return undefined;
  }

  return {
    criticalFindings,
    highestSeverity: highestSeverity as IncidentGuardianSeverity,
    totalFindings,
    warningFindings,
  };
}

function readOptionalSignalNames(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly IncidentGuardianSignalName[] | false | undefined {
  return readStringEnumArray(value, path, issues, SIGNAL_NAMES);
}

function readOptionalSourceGuardians(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly IncidentGuardianSourceGuardian[] | false | undefined {
  return readStringEnumArray(value, path, issues, SOURCE_GUARDIANS);
}

function readStringEnumArray<T extends string>(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowed: ReadonlySet<T>,
): readonly T[] | false | undefined {
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

  const entries: T[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || !allowed.has(entry as T)) {
      issues.push({
        code: "invalid_value",
        message: `${entryPath} is not supported`,
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
    entries.push(entry as T);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? false
    : Object.freeze(entries);
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
    contractVersion !== INCIDENT_GUARDIAN_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${INCIDENT_GUARDIAN_CONTRACT_VERSION}`,
      path: path(pathPrefix, "contractVersion"),
    });
  }
  return contractVersion === INCIDENT_GUARDIAN_CONTRACT_VERSION
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

function readOptionalInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
  minimum: number,
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredInteger(record, key, issues, pathPrefix, minimum);
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
