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
  COST_GUARDIAN_CONTRACT_VERSION,
  type CostGuardianEvaluationInput,
  type CostGuardianFinding,
  type CostGuardianFindingCategory,
  type CostGuardianReport,
  type CostGuardianRecordStatus,
  type CostGuardianSeverity,
  type CostGuardianThresholds,
  type CostGuardianUsageRecord,
} from "./cost-guardian.js";

const RECORD_STATUSES = new Set<CostGuardianRecordStatus>([
  "blocked",
  "failed",
  "succeeded",
]);

const FAILURE_STAGES = new Set([
  "budget_enforcement",
  "operation_limits",
  "provider_invocation",
  "response_validation",
  "usage_accounting",
]);

const FINDING_CATEGORIES = new Set<CostGuardianFindingCategory>([
  "budget_exceeded",
  "budget_nearing_limit",
  "missing_budget",
  "missing_usage_accounting",
  "model_operation_blocked_by_limits",
  "provider_failure_spike",
  "repeated_limit_failures",
  "unusual_provider_call_count",
]);

const SEVERITIES = new Set<CostGuardianSeverity>([
  "critical",
  "info",
  "warning",
]);

const INPUT_KEYS = new Set([
  "contractVersion",
  "generatedAt",
  "records",
  "thresholds",
]);

const RECORD_KEYS = new Set([
  "budgetConfigured",
  "budgetLimitUsd",
  "budgetUtilizationRatio",
  "contractVersion",
  "estimatedCostUsd",
  "failureCode",
  "failureStage",
  "inputTokens",
  "modelId",
  "occurredAt",
  "outputTokens",
  "profileId",
  "providerCalls",
  "providerId",
  "recordId",
  "status",
  "totalTokens",
]);

const THRESHOLD_KEYS = new Set([
  "budgetNearLimitRatio",
  "providerFailureSpikeCount",
  "repeatedLimitFailureCount",
  "unusualProviderCallCount",
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
  "budgetLimitUsd",
  "budgetUtilizationRatio",
  "estimatedCostUsd",
  "failureCode",
  "maximumProviderCalls",
  "modelId",
  "profileId",
  "providerCalls",
  "providerId",
  "recordCount",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "highestSeverity",
  "totalEstimatedCostUsd",
  "totalProviderCalls",
  "totalRecords",
  "warningFindings",
]);

export class CostGuardianEvaluationInputValidator
  implements Validator<CostGuardianEvaluationInput>
{
  public validate(value: unknown): ValidationResult<CostGuardianEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "cost guardian input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const records = readRecords(record.records, issues);
    const thresholds =
      record.thresholds === undefined
        ? undefined
        : readThresholds(record.thresholds, issues);

    if (
      issues.length > 0 ||
      contractVersion !== COST_GUARDIAN_CONTRACT_VERSION ||
      generatedAt === undefined ||
      records === undefined ||
      thresholds === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      generatedAt,
      records,
      ...(thresholds === undefined ? {} : { thresholds }),
    });
  }
}

export class CostGuardianReportValidator
  implements Validator<CostGuardianReport>
{
  public validate(value: unknown): ValidationResult<CostGuardianReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "cost guardian report must be an object",
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
      contractVersion !== COST_GUARDIAN_CONTRACT_VERSION ||
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

function readRecords(
  value: unknown,
  issues: ValidationIssue[],
): readonly CostGuardianUsageRecord[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "records must be an array",
      path: "records",
    });
    return undefined;
  }

  const records: CostGuardianUsageRecord[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `records[${String(index)}]`;
    const usageRecord = readUsageRecord(entry, path, issues);
    if (usageRecord === undefined) {
      continue;
    }
    if (ids.has(usageRecord.recordId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.recordId must be unique`,
        path: `${path}.recordId`,
      });
      continue;
    }
    ids.add(usageRecord.recordId);
    records.push(usageRecord);
  }
  return issues.some(({ path }) => path.startsWith("records"))
    ? undefined
    : Object.freeze(records);
}

function readUsageRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CostGuardianUsageRecord | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, RECORD_KEYS, issues, path);
  const contractVersion = readContractVersion(record, issues, path);
  const recordId = readRequiredString(record, "recordId", issues, path);
  const occurredAt = readTimestamp(record, "occurredAt", issues, path);
  const providerId = readRequiredString(record, "providerId", issues, path);
  const modelId = readRequiredString(record, "modelId", issues, path);
  const profileId = readRequiredString(record, "profileId", issues, path);
  const status = readRequiredString(record, "status", issues, path);
  const providerCalls = readRequiredInteger(
    record,
    "providerCalls",
    issues,
    path,
    0,
  );
  const budgetConfigured = readRequiredBooleanRecord(
    record,
    "budgetConfigured",
    path,
    issues,
  );
  const inputTokens = readOptionalInteger(record, "inputTokens", path, issues);
  const outputTokens = readOptionalInteger(
    record,
    "outputTokens",
    path,
    issues,
  );
  const totalTokens = readOptionalInteger(record, "totalTokens", path, issues);
  const estimatedCostUsd = readOptionalNumber(
    record,
    "estimatedCostUsd",
    issues,
    path,
  );
  const budgetLimitUsd = readOptionalNumber(
    record,
    "budgetLimitUsd",
    issues,
    path,
  );
  const budgetUtilizationRatio = readOptionalNumber(
    record,
    "budgetUtilizationRatio",
    issues,
    path,
  );
  const failureStage = readOptionalStringRecord(
    record,
    "failureStage",
    path,
    issues,
  );
  const failureCode = readOptionalStringRecord(
    record,
    "failureCode",
    path,
    issues,
  );

  if (
    status !== undefined &&
    !RECORD_STATUSES.has(status as CostGuardianRecordStatus)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.status is not supported`,
      path: `${path}.status`,
    });
  }
  if (failureStage !== undefined && !FAILURE_STAGES.has(failureStage)) {
    issues.push({
      code: "invalid_value",
      message: `${path}.failureStage is not supported`,
      path: `${path}.failureStage`,
    });
  }
  if (
    inputTokens !== undefined &&
    outputTokens !== undefined &&
    totalTokens !== undefined &&
    inputTokens + outputTokens !== totalTokens
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.totalTokens must equal inputTokens plus outputTokens`,
      path: `${path}.totalTokens`,
    });
  }

  if (
    contractVersion !== COST_GUARDIAN_CONTRACT_VERSION ||
    recordId === undefined ||
    occurredAt === undefined ||
    providerId === undefined ||
    modelId === undefined ||
    profileId === undefined ||
    status === undefined ||
    !RECORD_STATUSES.has(status as CostGuardianRecordStatus) ||
    providerCalls === undefined ||
    budgetConfigured === undefined
  ) {
    return undefined;
  }

  const usageRecord: CostGuardianUsageRecord = {
    budgetConfigured,
    contractVersion,
    modelId,
    occurredAt,
    profileId,
    providerCalls,
    providerId,
    recordId,
    status: status as CostGuardianRecordStatus,
  };
  if (budgetLimitUsd !== undefined) {
    Object.assign(usageRecord, { budgetLimitUsd });
  }
  if (budgetUtilizationRatio !== undefined) {
    Object.assign(usageRecord, { budgetUtilizationRatio });
  }
  if (estimatedCostUsd !== undefined) {
    Object.assign(usageRecord, { estimatedCostUsd });
  }
  if (failureCode !== undefined) {
    Object.assign(usageRecord, { failureCode });
  }
  if (failureStage !== undefined) {
    Object.assign(usageRecord, {
      failureStage: failureStage as CostGuardianUsageRecord["failureStage"],
    });
  }
  if (inputTokens !== undefined) {
    Object.assign(usageRecord, { inputTokens });
  }
  if (outputTokens !== undefined) {
    Object.assign(usageRecord, { outputTokens });
  }
  if (totalTokens !== undefined) {
    Object.assign(usageRecord, { totalTokens });
  }
  return usageRecord;
}

function readThresholds(
  value: unknown,
  issues: ValidationIssue[],
): CostGuardianThresholds | false {
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
  const budgetNearLimitRatio = readOptionalNumber(
    record,
    "budgetNearLimitRatio",
    issues,
    "thresholds",
    0,
  );
  const providerFailureSpikeCount = readOptionalInteger(
    record,
    "providerFailureSpikeCount",
    "thresholds",
    issues,
    1,
  );
  const repeatedLimitFailureCount = readOptionalInteger(
    record,
    "repeatedLimitFailureCount",
    "thresholds",
    issues,
    1,
  );
  const unusualProviderCallCount = readOptionalInteger(
    record,
    "unusualProviderCallCount",
    "thresholds",
    issues,
    1,
  );
  return {
    budgetNearLimitRatio: budgetNearLimitRatio ?? 0.8,
    providerFailureSpikeCount: providerFailureSpikeCount ?? 3,
    repeatedLimitFailureCount: repeatedLimitFailureCount ?? 2,
    unusualProviderCallCount: unusualProviderCallCount ?? 1,
  };
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly CostGuardianFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }

  const findings: CostGuardianFinding[] = [];
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
): CostGuardianFinding | undefined {
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
    !FINDING_CATEGORIES.has(category as CostGuardianFindingCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }
  if (
    severity !== undefined &&
    !SEVERITIES.has(severity as CostGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.severity is not supported`,
      path: `${path}.severity`,
    });
  }

  if (
    contractVersion !== COST_GUARDIAN_CONTRACT_VERSION ||
    findingId === undefined ||
    category === undefined ||
    !FINDING_CATEGORIES.has(category as CostGuardianFindingCategory) ||
    severity === undefined ||
    !SEVERITIES.has(severity as CostGuardianSeverity) ||
    title === undefined ||
    message === undefined ||
    recommendation === undefined ||
    evidence === undefined
  ) {
    return undefined;
  }

  return {
    category: category as CostGuardianFindingCategory,
    contractVersion,
    evidence,
    findingId,
    message,
    recommendation,
    severity: severity as CostGuardianSeverity,
    title,
  };
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CostGuardianFinding["evidence"] | undefined {
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
  const recordCount = readRequiredInteger(
    record,
    "recordCount",
    issues,
    path,
    1,
  );
  const budgetLimitUsd = readOptionalNumber(
    record,
    "budgetLimitUsd",
    issues,
    path,
  );
  const budgetUtilizationRatio = readOptionalNumber(
    record,
    "budgetUtilizationRatio",
    issues,
    path,
  );
  const estimatedCostUsd = readOptionalNumber(
    record,
    "estimatedCostUsd",
    issues,
    path,
  );
  const providerCalls = readOptionalInteger(
    record,
    "providerCalls",
    path,
    issues,
  );
  const maximumProviderCalls = readOptionalInteger(
    record,
    "maximumProviderCalls",
    path,
    issues,
  );
  const providerId = readOptionalStringRecord(
    record,
    "providerId",
    path,
    issues,
  );
  const modelId = readOptionalStringRecord(record, "modelId", path, issues);
  const profileId = readOptionalStringRecord(record, "profileId", path, issues);
  const failureCode = readOptionalStringRecord(
    record,
    "failureCode",
    path,
    issues,
  );

  if (recordCount === undefined) {
    return undefined;
  }
  return {
    ...(budgetLimitUsd === undefined ? {} : { budgetLimitUsd }),
    ...(budgetUtilizationRatio === undefined
      ? {}
      : { budgetUtilizationRatio }),
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
    ...(failureCode === undefined ? {} : { failureCode }),
    ...(maximumProviderCalls === undefined ? {} : { maximumProviderCalls }),
    ...(modelId === undefined ? {} : { modelId }),
    ...(profileId === undefined ? {} : { profileId }),
    ...(providerCalls === undefined ? {} : { providerCalls }),
    ...(providerId === undefined ? {} : { providerId }),
    recordCount,
  };
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): CostGuardianReport["summary"] | undefined {
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
  const totalRecords = readRequiredInteger(
    record,
    "totalRecords",
    issues,
    "summary",
  );
  const totalProviderCalls = readRequiredInteger(
    record,
    "totalProviderCalls",
    issues,
    "summary",
  );
  const totalEstimatedCostUsd = readOptionalNumber(
    record,
    "totalEstimatedCostUsd",
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
    !SEVERITIES.has(highestSeverity as CostGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: "summary.highestSeverity is not supported",
      path: "summary.highestSeverity",
    });
  }
  if (
    totalRecords === undefined ||
    totalProviderCalls === undefined ||
    totalEstimatedCostUsd === undefined ||
    warningFindings === undefined ||
    criticalFindings === undefined ||
    highestSeverity === undefined ||
    !SEVERITIES.has(highestSeverity as CostGuardianSeverity)
  ) {
    return undefined;
  }
  return {
    criticalFindings,
    highestSeverity: highestSeverity as CostGuardianSeverity,
    totalEstimatedCostUsd,
    totalProviderCalls,
    totalRecords,
    warningFindings,
  };
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
    contractVersion !== COST_GUARDIAN_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${COST_GUARDIAN_CONTRACT_VERSION}`,
      path:
        pathPrefix.length === 0
          ? "contractVersion"
          : `${pathPrefix}.contractVersion`,
    });
  }
  return contractVersion === COST_GUARDIAN_CONTRACT_VERSION
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

function readRequiredBooleanRecord(
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

function readOptionalInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
  minimum = 0,
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredInteger(record, key, issues, pathPrefix, minimum);
}

function readOptionalStringRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): string | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredString(record, key, issues, pathPrefix);
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
