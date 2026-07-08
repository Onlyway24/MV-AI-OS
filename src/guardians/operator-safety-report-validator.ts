import {
  readRequiredBoolean,
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
import { BackupGuardianReportValidator } from "./backup-guardian-validator.js";
import { CostGuardianReportValidator } from "./cost-guardian-validator.js";
import { IncidentGuardianReportValidator } from "./incident-guardian-validator.js";
import {
  OPERATOR_SAFETY_REPORT_CONTRACT_VERSION,
  type OperatorRecommendedAction,
  type OperatorSafetyAutonomyDecision,
  type OperatorSafetyDomain,
  type OperatorSafetyEvaluationInput,
  type OperatorSafetyFindingSummary,
  type OperatorSafetyGuardianReports,
  type OperatorSafetyGuardianSummary,
  type OperatorSafetyReport,
  type OperatorSafetySeverity,
  type OperatorSafetyStatus,
} from "./operator-safety-report.js";
import { QualityGuardianReportValidator } from "./quality-guardian-validator.js";
import { SecurityGuardianReportValidator } from "./security-guardian-validator.js";

const INPUT_KEYS = new Set([
  "contractVersion",
  "expectedGuardians",
  "generatedAt",
  "guardianReports",
]);

const GUARDIAN_REPORTS_KEYS = new Set([
  "backup",
  "cost",
  "incident",
  "quality",
  "security",
]);

const REPORT_KEYS = new Set([
  "contractVersion",
  "generatedAt",
  "guardianSummaries",
  "recommendedActions",
  "summary",
]);

const REPORT_SUMMARY_KEYS = new Set([
  "coverage",
  "criticalDomains",
  "healthyDomains",
  "highestSeverity",
  "primaryAttentionDomain",
  "safetyToAutonomy",
  "status",
  "totalCriticalFindings",
  "totalFindings",
  "totalWarningFindings",
  "unknownDomains",
  "warningDomains",
]);

const COVERAGE_KEYS = new Set([
  "expectedGuardians",
  "includedGuardians",
  "missingGuardians",
]);

const GUARDIAN_SUMMARY_KEYS = new Set([
  "affectedAreas",
  "criticalFindings",
  "domain",
  "highestSeverity",
  "included",
  "status",
  "topFinding",
  "totalFindings",
  "warningFindings",
]);

const FINDING_SUMMARY_KEYS = new Set([
  "affectedAreas",
  "category",
  "domain",
  "findingId",
  "severity",
  "title",
]);

const RECOMMENDED_ACTION_KEYS = new Set([
  "actionId",
  "domain",
  "recommendation",
  "severity",
  "title",
]);

const DOMAINS = new Set<OperatorSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "quality",
  "security",
]);

const SEVERITIES = new Set<OperatorSafetySeverity>([
  "critical",
  "info",
  "warning",
]);

const STATUSES = new Set<OperatorSafetyStatus>([
  "attention_required",
  "critical",
  "healthy",
  "unknown",
]);

const AUTONOMY_DECISIONS = new Set<OperatorSafetyAutonomyDecision>([
  "continue_with_attention",
  "do_not_increase_autonomy",
  "safe_to_continue",
  "unknown",
]);

export class OperatorSafetyEvaluationInputValidator
  implements Validator<OperatorSafetyEvaluationInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<OperatorSafetyEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator safety input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const expectedGuardians = readDomainArray(
      record.expectedGuardians,
      "expectedGuardians",
      issues,
      false,
    );
    const guardianReports = readGuardianReports(
      record.guardianReports,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== OPERATOR_SAFETY_REPORT_CONTRACT_VERSION ||
      generatedAt === undefined ||
      expectedGuardians === undefined ||
      guardianReports === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      expectedGuardians,
      generatedAt,
      guardianReports,
    });
  }
}

export class OperatorSafetyReportValidator
  implements Validator<OperatorSafetyReport>
{
  public validate(value: unknown): ValidationResult<OperatorSafetyReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator safety report must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REPORT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const guardianSummaries = readGuardianSummaries(
      record.guardianSummaries,
      issues,
    );
    const recommendedActions = readRecommendedActions(
      record.recommendedActions,
      issues,
    );
    const summary = readReportSummary(record.summary, issues);

    if (
      issues.length > 0 ||
      contractVersion !== OPERATOR_SAFETY_REPORT_CONTRACT_VERSION ||
      generatedAt === undefined ||
      guardianSummaries === undefined ||
      recommendedActions === undefined ||
      summary === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      generatedAt,
      guardianSummaries,
      recommendedActions,
      summary,
    });
  }
}

function readGuardianReports(
  value: unknown,
  issues: ValidationIssue[],
): OperatorSafetyGuardianReports | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "guardianReports must be an object",
      path: "guardianReports",
    });
    return undefined;
  }

  rejectUnknownKeys(record, GUARDIAN_REPORTS_KEYS, issues, "guardianReports");
  const cost = readNestedReport(
    record.cost,
    "guardianReports.cost",
    new CostGuardianReportValidator(),
    issues,
  );
  const security = readNestedReport(
    record.security,
    "guardianReports.security",
    new SecurityGuardianReportValidator(),
    issues,
  );
  const backup = readNestedReport(
    record.backup,
    "guardianReports.backup",
    new BackupGuardianReportValidator(),
    issues,
  );
  const incident = readNestedReport(
    record.incident,
    "guardianReports.incident",
    new IncidentGuardianReportValidator(),
    issues,
  );
  const quality = readNestedReport(
    record.quality,
    "guardianReports.quality",
    new QualityGuardianReportValidator(),
    issues,
  );

  if ([cost, security, backup, incident, quality].includes(false)) {
    return undefined;
  }

  return {
    ...(backup === undefined || backup === false ? {} : { backup }),
    ...(cost === undefined || cost === false ? {} : { cost }),
    ...(incident === undefined || incident === false ? {} : { incident }),
    ...(quality === undefined || quality === false ? {} : { quality }),
    ...(security === undefined || security === false ? {} : { security }),
  };
}

function readNestedReport<T>(
  value: unknown,
  pathPrefix: string,
  validator: Validator<T>,
  issues: ValidationIssue[],
): T | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = validator.validate(value);
  if (result.ok) {
    return result.value;
  }
  for (const issue of result.issues) {
    issues.push({
      ...issue,
      path: prependPath(pathPrefix, issue.path),
    });
  }
  return false;
}

function readReportSummary(
  value: unknown,
  issues: ValidationIssue[],
): OperatorSafetyReport["summary"] | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "summary must be an object",
      path: "summary",
    });
    return undefined;
  }

  rejectUnknownKeys(record, REPORT_SUMMARY_KEYS, issues, "summary");
  const coverage = readCoverage(record.coverage, issues);
  const criticalDomains = readDomainArray(
    record.criticalDomains,
    "summary.criticalDomains",
    issues,
  );
  const healthyDomains = readDomainArray(
    record.healthyDomains,
    "summary.healthyDomains",
    issues,
  );
  const highestSeverity = readSeverity(
    record,
    "highestSeverity",
    "summary",
    issues,
  );
  const primaryAttentionDomain =
    record.primaryAttentionDomain === undefined
      ? undefined
      : readDomainValue(
          record.primaryAttentionDomain,
          "summary.primaryAttentionDomain",
          issues,
        );
  const safetyToAutonomy = readAutonomyDecision(
    record,
    "safetyToAutonomy",
    "summary",
    issues,
  );
  const status = readStatus(record, "status", "summary", issues);
  const totalCriticalFindings = readRequiredInteger(
    record,
    "totalCriticalFindings",
    issues,
    "summary",
  );
  const totalFindings = readRequiredInteger(
    record,
    "totalFindings",
    issues,
    "summary",
  );
  const totalWarningFindings = readRequiredInteger(
    record,
    "totalWarningFindings",
    issues,
    "summary",
  );
  const unknownDomains = readDomainArray(
    record.unknownDomains,
    "summary.unknownDomains",
    issues,
  );
  const warningDomains = readDomainArray(
    record.warningDomains,
    "summary.warningDomains",
    issues,
  );

  if (
    coverage === undefined ||
    criticalDomains === undefined ||
    healthyDomains === undefined ||
    highestSeverity === undefined ||
    primaryAttentionDomain === false ||
    safetyToAutonomy === undefined ||
    status === undefined ||
    totalCriticalFindings === undefined ||
    totalFindings === undefined ||
    totalWarningFindings === undefined ||
    unknownDomains === undefined ||
    warningDomains === undefined
  ) {
    return undefined;
  }

  return {
    coverage,
    criticalDomains,
    healthyDomains,
    highestSeverity,
    ...(primaryAttentionDomain === undefined
      ? {}
      : { primaryAttentionDomain }),
    safetyToAutonomy,
    status,
    totalCriticalFindings,
    totalFindings,
    totalWarningFindings,
    unknownDomains,
    warningDomains,
  };
}

function readCoverage(
  value: unknown,
  issues: ValidationIssue[],
): OperatorSafetyReport["summary"]["coverage"] | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "summary.coverage must be an object",
      path: "summary.coverage",
    });
    return undefined;
  }

  rejectUnknownKeys(record, COVERAGE_KEYS, issues, "summary.coverage");
  const expectedGuardians = readDomainArray(
    record.expectedGuardians,
    "summary.coverage.expectedGuardians",
    issues,
    false,
  );
  const includedGuardians = readDomainArray(
    record.includedGuardians,
    "summary.coverage.includedGuardians",
    issues,
  );
  const missingGuardians = readDomainArray(
    record.missingGuardians,
    "summary.coverage.missingGuardians",
    issues,
  );

  if (
    expectedGuardians === undefined ||
    includedGuardians === undefined ||
    missingGuardians === undefined
  ) {
    return undefined;
  }

  return {
    expectedGuardians,
    includedGuardians,
    missingGuardians,
  };
}

function readGuardianSummaries(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorSafetyGuardianSummary[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "guardianSummaries must be an array",
      path: "guardianSummaries",
    });
    return undefined;
  }

  const summaries: OperatorSafetyGuardianSummary[] = [];
  const seen = new Set<OperatorSafetyDomain>();
  for (const [index, entry] of value.entries()) {
    const path = `guardianSummaries[${String(index)}]`;
    const summary = readGuardianSummary(entry, path, issues);
    if (summary === undefined) {
      continue;
    }
    if (seen.has(summary.domain)) {
      issues.push({
        code: "duplicate",
        message: `${path}.domain must be unique`,
        path: `${path}.domain`,
      });
      continue;
    }
    seen.add(summary.domain);
    summaries.push(summary);
  }

  return issues.some(({ path }) => path.startsWith("guardianSummaries"))
    ? undefined
    : Object.freeze(summaries);
}

function readGuardianSummary(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorSafetyGuardianSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, GUARDIAN_SUMMARY_KEYS, issues, path);
  const affectedAreas = readStringArray(
    record.affectedAreas,
    `${path}.affectedAreas`,
    issues,
  );
  const criticalFindings = readRequiredInteger(
    record,
    "criticalFindings",
    issues,
    path,
  );
  const domain = readDomain(record, "domain", path, issues);
  const highestSeverity = readSeverity(
    record,
    "highestSeverity",
    path,
    issues,
  );
  const included = readRequiredBoolean(record, "included", issues, path);
  const status = readStatus(record, "status", path, issues);
  const topFinding =
    record.topFinding === undefined
      ? undefined
      : readFindingSummary(record.topFinding, `${path}.topFinding`, issues);
  const totalFindings = readRequiredInteger(
    record,
    "totalFindings",
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
    affectedAreas === undefined ||
    criticalFindings === undefined ||
    domain === undefined ||
    highestSeverity === undefined ||
    included === undefined ||
    status === undefined ||
    topFinding === false ||
    totalFindings === undefined ||
    warningFindings === undefined
  ) {
    return undefined;
  }

  return {
    affectedAreas,
    criticalFindings,
    domain,
    highestSeverity,
    included,
    status,
    ...(topFinding === undefined ? {} : { topFinding }),
    totalFindings,
    warningFindings,
  };
}

function readFindingSummary(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorSafetyFindingSummary | false | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return false;
  }

  rejectUnknownKeys(record, FINDING_SUMMARY_KEYS, issues, path);
  const affectedAreas = readStringArray(
    record.affectedAreas,
    `${path}.affectedAreas`,
    issues,
  );
  const category = readRequiredString(record, "category", issues, path);
  const domain = readDomain(record, "domain", path, issues);
  const findingId = readRequiredString(record, "findingId", issues, path);
  const severity = readSeverity(record, "severity", path, issues);
  const title = readRequiredString(record, "title", issues, path);

  if (
    affectedAreas === undefined ||
    category === undefined ||
    domain === undefined ||
    findingId === undefined ||
    severity === undefined ||
    title === undefined
  ) {
    return false;
  }

  return {
    affectedAreas,
    category,
    domain,
    findingId,
    severity,
    title,
  };
}

function readRecommendedActions(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorRecommendedAction[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "recommendedActions must be an array",
      path: "recommendedActions",
    });
    return undefined;
  }

  const actions: OperatorRecommendedAction[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `recommendedActions[${String(index)}]`;
    const action = readRecommendedAction(entry, path, issues);
    if (action === undefined) {
      continue;
    }
    if (seen.has(action.actionId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.actionId must be unique`,
        path: `${path}.actionId`,
      });
      continue;
    }
    seen.add(action.actionId);
    actions.push(action);
  }

  return issues.some(({ path }) => path.startsWith("recommendedActions"))
    ? undefined
    : Object.freeze(actions);
}

function readRecommendedAction(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorRecommendedAction | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, RECOMMENDED_ACTION_KEYS, issues, path);
  const actionId = readRequiredString(record, "actionId", issues, path);
  const domain =
    record.domain === undefined
      ? undefined
      : readDomainValue(record.domain, `${path}.domain`, issues);
  const recommendation = readRequiredString(
    record,
    "recommendation",
    issues,
    path,
  );
  const severity = readSeverity(record, "severity", path, issues);
  const title = readRequiredString(record, "title", issues, path);

  if (
    actionId === undefined ||
    domain === false ||
    recommendation === undefined ||
    severity === undefined ||
    title === undefined
  ) {
    return undefined;
  }

  return {
    actionId,
    ...(domain === undefined ? {} : { domain }),
    recommendation,
    severity,
    title,
  };
}

function readDomainArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowEmpty = true,
): readonly OperatorSafetyDomain[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  if (!allowEmpty && value.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one guardian domain`,
      path,
    });
    return undefined;
  }

  const domains: OperatorSafetyDomain[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const domain = readDomainValue(entry, entryPath, issues);
    if (domain === false) {
      continue;
    }
    if (seen.has(domain)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(domain);
    domains.push(domain);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? undefined
    : Object.freeze(domains);
}

function readStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const strings: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({
        code: "invalid_type",
        message: `${entryPath} must be a non-empty string`,
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
    strings.push(entry);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? undefined
    : Object.freeze(strings);
}

function readDomain(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): OperatorSafetyDomain | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  const domain = readDomainValue(value, path(pathPrefix, key), issues);
  return domain === false ? undefined : domain;
}

function readDomainValue(
  value: unknown,
  fieldPath: string,
  issues: ValidationIssue[],
): OperatorSafetyDomain | false {
  if (typeof value !== "string" || !DOMAINS.has(value as OperatorSafetyDomain)) {
    issues.push({
      code: "invalid_value",
      message: `${fieldPath} is not a supported guardian domain`,
      path: fieldPath,
    });
    return false;
  }
  return value as OperatorSafetyDomain;
}

function readSeverity(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): OperatorSafetySeverity | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  if (!SEVERITIES.has(value as OperatorSafetySeverity)) {
    issues.push({
      code: "invalid_value",
      message: `${path(pathPrefix, key)} is not a supported severity`,
      path: path(pathPrefix, key),
    });
    return undefined;
  }
  return value as OperatorSafetySeverity;
}

function readStatus(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): OperatorSafetyStatus | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  if (!STATUSES.has(value as OperatorSafetyStatus)) {
    issues.push({
      code: "invalid_value",
      message: `${path(pathPrefix, key)} is not a supported status`,
      path: path(pathPrefix, key),
    });
    return undefined;
  }
  return value as OperatorSafetyStatus;
}

function readAutonomyDecision(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): OperatorSafetyAutonomyDecision | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  if (!AUTONOMY_DECISIONS.has(value as OperatorSafetyAutonomyDecision)) {
    issues.push({
      code: "invalid_value",
      message: `${path(pathPrefix, key)} is not a supported autonomy decision`,
      path: path(pathPrefix, key),
    });
    return undefined;
  }
  return value as OperatorSafetyAutonomyDecision;
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
    contractVersion !== OPERATOR_SAFETY_REPORT_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message:
        `contractVersion must be ${OPERATOR_SAFETY_REPORT_CONTRACT_VERSION}`,
      path: path(pathPrefix, "contractVersion"),
    });
  }
  return contractVersion === OPERATOR_SAFETY_REPORT_CONTRACT_VERSION
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

function prependPath(prefix: string, childPath: string): string {
  return childPath === "$" ? prefix : `${prefix}.${childPath}`;
}

function path(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}
