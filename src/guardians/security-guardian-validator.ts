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
  SECURITY_GUARDIAN_CONTRACT_VERSION,
  type SecurityGuardianControlName,
  type SecurityGuardianEvaluationInput,
  type SecurityGuardianFinding,
  type SecurityGuardianFindingCategory,
  type SecurityGuardianReport,
  type SecurityGuardianSafetyState,
  type SecurityGuardianSeverity,
} from "./security-guardian.js";

const INPUT_KEYS = new Set([
  "contractVersion",
  "generatedAt",
  "state",
]);

const STATE_KEYS = new Set([
  "backupRestoreAvailable",
  "budgetEnforcementConfigured",
  "cloudOrVpsReadinessTargeted",
  "controlledSecretReferenceConfigured",
  "costGuardianAvailable",
  "invalidSecretReferenceDetected",
  "liveProviderEnabled",
  "operationLimitsConfigured",
  "toolExecutionApprovalRequired",
  "toolExecutionAudited",
  "toolExecutionEnabled",
  "unsafeSecretMaterialDetected",
  "usageAccountingConfigured",
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
  "liveProviderEnabled",
  "signalCount",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "highestSeverity",
  "totalFindings",
  "warningFindings",
]);

const FINDING_CATEGORIES = new Set<SecurityGuardianFindingCategory>([
  "invalid_secret_reference",
  "live_provider_mode_enabled",
  "missing_backup_restore",
  "missing_budget_enforcement",
  "missing_cost_guardian",
  "missing_operation_limits",
  "missing_secret_reference",
  "missing_usage_accounting",
  "tool_execution_enabled_without_approval",
  "unsafe_cloud_readiness",
  "unsafe_secret_material",
]);

const SEVERITIES = new Set<SecurityGuardianSeverity>([
  "critical",
  "info",
  "warning",
]);

const CONTROL_NAMES = new Set<SecurityGuardianControlName>([
  "backup_restore",
  "budget_enforcement",
  "cost_guardian",
  "operation_limits",
  "secret_reference",
  "tool_approval",
  "tool_audit",
  "usage_accounting",
]);

export class SecurityGuardianEvaluationInputValidator
  implements Validator<SecurityGuardianEvaluationInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<SecurityGuardianEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "security guardian input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const state = readSafetyState(record.state, issues);

    if (
      issues.length > 0 ||
      contractVersion !== SECURITY_GUARDIAN_CONTRACT_VERSION ||
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

export class SecurityGuardianReportValidator
  implements Validator<SecurityGuardianReport>
{
  public validate(value: unknown): ValidationResult<SecurityGuardianReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "security guardian report must be an object",
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
      contractVersion !== SECURITY_GUARDIAN_CONTRACT_VERSION ||
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

function readSafetyState(
  value: unknown,
  issues: ValidationIssue[],
): SecurityGuardianSafetyState | undefined {
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
  const backupRestoreAvailable = readRequiredBoolean(
    record,
    "backupRestoreAvailable",
    "state",
    issues,
  );
  const budgetEnforcementConfigured = readRequiredBoolean(
    record,
    "budgetEnforcementConfigured",
    "state",
    issues,
  );
  const cloudOrVpsReadinessTargeted = readRequiredBoolean(
    record,
    "cloudOrVpsReadinessTargeted",
    "state",
    issues,
  );
  const controlledSecretReferenceConfigured = readRequiredBoolean(
    record,
    "controlledSecretReferenceConfigured",
    "state",
    issues,
  );
  const costGuardianAvailable = readRequiredBoolean(
    record,
    "costGuardianAvailable",
    "state",
    issues,
  );
  const invalidSecretReferenceDetected = readRequiredBoolean(
    record,
    "invalidSecretReferenceDetected",
    "state",
    issues,
  );
  const liveProviderEnabled = readRequiredBoolean(
    record,
    "liveProviderEnabled",
    "state",
    issues,
  );
  const operationLimitsConfigured = readRequiredBoolean(
    record,
    "operationLimitsConfigured",
    "state",
    issues,
  );
  const toolExecutionApprovalRequired = readRequiredBoolean(
    record,
    "toolExecutionApprovalRequired",
    "state",
    issues,
  );
  const toolExecutionAudited = readRequiredBoolean(
    record,
    "toolExecutionAudited",
    "state",
    issues,
  );
  const toolExecutionEnabled = readRequiredBoolean(
    record,
    "toolExecutionEnabled",
    "state",
    issues,
  );
  const unsafeSecretMaterialDetected = readRequiredBoolean(
    record,
    "unsafeSecretMaterialDetected",
    "state",
    issues,
  );
  const usageAccountingConfigured = readRequiredBoolean(
    record,
    "usageAccountingConfigured",
    "state",
    issues,
  );

  if (
    backupRestoreAvailable === undefined ||
    budgetEnforcementConfigured === undefined ||
    cloudOrVpsReadinessTargeted === undefined ||
    controlledSecretReferenceConfigured === undefined ||
    costGuardianAvailable === undefined ||
    invalidSecretReferenceDetected === undefined ||
    liveProviderEnabled === undefined ||
    operationLimitsConfigured === undefined ||
    toolExecutionApprovalRequired === undefined ||
    toolExecutionAudited === undefined ||
    toolExecutionEnabled === undefined ||
    unsafeSecretMaterialDetected === undefined ||
    usageAccountingConfigured === undefined
  ) {
    return undefined;
  }

  return {
    backupRestoreAvailable,
    budgetEnforcementConfigured,
    cloudOrVpsReadinessTargeted,
    controlledSecretReferenceConfigured,
    costGuardianAvailable,
    invalidSecretReferenceDetected,
    liveProviderEnabled,
    operationLimitsConfigured,
    toolExecutionApprovalRequired,
    toolExecutionAudited,
    toolExecutionEnabled,
    unsafeSecretMaterialDetected,
    usageAccountingConfigured,
  };
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly SecurityGuardianFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }

  const findings: SecurityGuardianFinding[] = [];
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
): SecurityGuardianFinding | undefined {
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
    !FINDING_CATEGORIES.has(category as SecurityGuardianFindingCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }
  if (
    severity !== undefined &&
    !SEVERITIES.has(severity as SecurityGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.severity is not supported`,
      path: `${path}.severity`,
    });
  }

  if (
    contractVersion !== SECURITY_GUARDIAN_CONTRACT_VERSION ||
    findingId === undefined ||
    category === undefined ||
    !FINDING_CATEGORIES.has(category as SecurityGuardianFindingCategory) ||
    severity === undefined ||
    !SEVERITIES.has(severity as SecurityGuardianSeverity) ||
    title === undefined ||
    message === undefined ||
    recommendation === undefined ||
    evidence === undefined
  ) {
    return undefined;
  }

  return {
    category: category as SecurityGuardianFindingCategory,
    contractVersion,
    evidence,
    findingId,
    message,
    recommendation,
    severity: severity as SecurityGuardianSeverity,
    title,
  };
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): SecurityGuardianFinding["evidence"] | undefined {
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
  const liveProviderEnabled = readOptionalBoolean(
    record,
    "liveProviderEnabled",
    path,
    issues,
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
    ...(liveProviderEnabled === undefined ? {} : { liveProviderEnabled }),
    signalCount,
  };
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): SecurityGuardianReport["summary"] | undefined {
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
    !SEVERITIES.has(highestSeverity as SecurityGuardianSeverity)
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
    !SEVERITIES.has(highestSeverity as SecurityGuardianSeverity)
  ) {
    return undefined;
  }

  return {
    criticalFindings,
    highestSeverity: highestSeverity as SecurityGuardianSeverity,
    totalFindings,
    warningFindings,
  };
}

function readOptionalControls(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly SecurityGuardianControlName[] | false | undefined {
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

  const controls: SecurityGuardianControlName[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || !CONTROL_NAMES.has(entry as SecurityGuardianControlName)) {
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
    controls.push(entry as SecurityGuardianControlName);
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
    contractVersion !== SECURITY_GUARDIAN_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${SECURITY_GUARDIAN_CONTRACT_VERSION}`,
      path: path(pathPrefix, "contractVersion"),
    });
  }
  return contractVersion === SECURITY_GUARDIAN_CONTRACT_VERSION
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

function readOptionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): boolean | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredBoolean(record, key, pathPrefix, issues);
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
