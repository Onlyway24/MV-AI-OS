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
  QUALITY_GUARDIAN_CONTRACT_VERSION,
  type QualityGuardianEvaluationInput,
  type QualityGuardianFinding,
  type QualityGuardianFindingCategory,
  type QualityGuardianQualityState,
  type QualityGuardianReport,
  type QualityGuardianSeverity,
  type QualityGuardianSignalName,
} from "./quality-guardian.js";

const INPUT_KEYS = new Set(["contractVersion", "generatedAt", "state"]);

const STATE_KEYS = new Set([
  "evidenceReferencesPresent",
  "evidenceRequired",
  "finalResponsePresent",
  "humanReviewCompleted",
  "humanReviewRequired",
  "minimumReadinessScore",
  "modelOutputRejected",
  "outputClaimsEvidence",
  "readinessScore",
  "rejectedOutputCount",
  "rejectedOutputThreshold",
  "resultWellFormed",
  "sourceReferencesPresent",
  "taskResultComplete",
  "unsafeContentPipelineDetected",
  "validationFailureCount",
  "validationFailureThreshold",
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
  "readinessScore",
  "signalCount",
  "threshold",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "highestSeverity",
  "totalFindings",
  "warningFindings",
]);

const FINDING_CATEGORIES = new Set<QualityGuardianFindingCategory>([
  "incomplete_task_result",
  "low_readiness_score",
  "malformed_result",
  "missing_evidence_references",
  "missing_final_response",
  "missing_human_review",
  "missing_source_references",
  "model_output_rejected",
  "repeated_rejected_outputs",
  "unsafe_content_pipeline_state",
  "validation_failure_threshold_exceeded",
]);

const SEVERITIES = new Set<QualityGuardianSeverity>([
  "critical",
  "info",
  "warning",
]);

const SIGNAL_NAMES = new Set<QualityGuardianSignalName>([
  "content_pipeline",
  "evidence_references",
  "final_response",
  "human_review",
  "model_output_validation",
  "readiness_score",
  "rejected_outputs",
  "result_shape",
  "source_references",
  "task_completion",
  "validation_failures",
]);

export class QualityGuardianEvaluationInputValidator
  implements Validator<QualityGuardianEvaluationInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<QualityGuardianEvaluationInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "quality guardian input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const state = readQualityState(record.state, issues);

    if (
      issues.length > 0 ||
      contractVersion !== QUALITY_GUARDIAN_CONTRACT_VERSION ||
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

export class QualityGuardianReportValidator
  implements Validator<QualityGuardianReport>
{
  public validate(value: unknown): ValidationResult<QualityGuardianReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "quality guardian report must be an object",
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
      contractVersion !== QUALITY_GUARDIAN_CONTRACT_VERSION ||
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

function readQualityState(
  value: unknown,
  issues: ValidationIssue[],
): QualityGuardianQualityState | undefined {
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
  const evidenceReferencesPresent = readRequiredBoolean(
    record,
    "evidenceReferencesPresent",
    "state",
    issues,
  );
  const evidenceRequired = readRequiredBoolean(
    record,
    "evidenceRequired",
    "state",
    issues,
  );
  const finalResponsePresent = readRequiredBoolean(
    record,
    "finalResponsePresent",
    "state",
    issues,
  );
  const humanReviewCompleted = readRequiredBoolean(
    record,
    "humanReviewCompleted",
    "state",
    issues,
  );
  const humanReviewRequired = readRequiredBoolean(
    record,
    "humanReviewRequired",
    "state",
    issues,
  );
  const minimumReadinessScore = readRequiredScore(
    record,
    "minimumReadinessScore",
    "state",
    issues,
  );
  const modelOutputRejected = readRequiredBoolean(
    record,
    "modelOutputRejected",
    "state",
    issues,
  );
  const outputClaimsEvidence = readRequiredBoolean(
    record,
    "outputClaimsEvidence",
    "state",
    issues,
  );
  const readinessScore = readRequiredScore(
    record,
    "readinessScore",
    "state",
    issues,
  );
  const rejectedOutputCount = readRequiredInteger(
    record,
    "rejectedOutputCount",
    issues,
    "state",
  );
  const rejectedOutputThreshold = readRequiredInteger(
    record,
    "rejectedOutputThreshold",
    issues,
    "state",
    1,
  );
  const resultWellFormed = readRequiredBoolean(
    record,
    "resultWellFormed",
    "state",
    issues,
  );
  const sourceReferencesPresent = readRequiredBoolean(
    record,
    "sourceReferencesPresent",
    "state",
    issues,
  );
  const taskResultComplete = readRequiredBoolean(
    record,
    "taskResultComplete",
    "state",
    issues,
  );
  const unsafeContentPipelineDetected = readRequiredBoolean(
    record,
    "unsafeContentPipelineDetected",
    "state",
    issues,
  );
  const validationFailureCount = readRequiredInteger(
    record,
    "validationFailureCount",
    issues,
    "state",
  );
  const validationFailureThreshold = readRequiredInteger(
    record,
    "validationFailureThreshold",
    issues,
    "state",
    1,
  );

  if (
    evidenceReferencesPresent === undefined ||
    evidenceRequired === undefined ||
    finalResponsePresent === undefined ||
    humanReviewCompleted === undefined ||
    humanReviewRequired === undefined ||
    minimumReadinessScore === undefined ||
    modelOutputRejected === undefined ||
    outputClaimsEvidence === undefined ||
    readinessScore === undefined ||
    rejectedOutputCount === undefined ||
    rejectedOutputThreshold === undefined ||
    resultWellFormed === undefined ||
    sourceReferencesPresent === undefined ||
    taskResultComplete === undefined ||
    unsafeContentPipelineDetected === undefined ||
    validationFailureCount === undefined ||
    validationFailureThreshold === undefined
  ) {
    return undefined;
  }

  return {
    evidenceReferencesPresent,
    evidenceRequired,
    finalResponsePresent,
    humanReviewCompleted,
    humanReviewRequired,
    minimumReadinessScore,
    modelOutputRejected,
    outputClaimsEvidence,
    readinessScore,
    rejectedOutputCount,
    rejectedOutputThreshold,
    resultWellFormed,
    sourceReferencesPresent,
    taskResultComplete,
    unsafeContentPipelineDetected,
    validationFailureCount,
    validationFailureThreshold,
  };
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly QualityGuardianFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }

  const findings: QualityGuardianFinding[] = [];
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
): QualityGuardianFinding | undefined {
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
    !FINDING_CATEGORIES.has(category as QualityGuardianFindingCategory)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.category is not supported`,
      path: `${path}.category`,
    });
  }
  if (
    severity !== undefined &&
    !SEVERITIES.has(severity as QualityGuardianSeverity)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.severity is not supported`,
      path: `${path}.severity`,
    });
  }

  if (
    contractVersion !== QUALITY_GUARDIAN_CONTRACT_VERSION ||
    findingId === undefined ||
    category === undefined ||
    !FINDING_CATEGORIES.has(category as QualityGuardianFindingCategory) ||
    severity === undefined ||
    !SEVERITIES.has(severity as QualityGuardianSeverity) ||
    title === undefined ||
    message === undefined ||
    recommendation === undefined ||
    evidence === undefined
  ) {
    return undefined;
  }

  return {
    category: category as QualityGuardianFindingCategory,
    contractVersion,
    evidence,
    findingId,
    message,
    recommendation,
    severity: severity as QualityGuardianSeverity,
    title,
  };
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): QualityGuardianFinding["evidence"] | undefined {
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
  const readinessScore = readOptionalScore(
    record,
    "readinessScore",
    path,
    issues,
  );
  const threshold = readOptionalScore(record, "threshold", path, issues);
  const affectedSignals = readOptionalSignalNames(
    record.affectedSignals,
    `${path}.affectedSignals`,
    issues,
  );

  if (signalCount === undefined || affectedSignals === false) {
    return undefined;
  }

  return {
    ...(affectedSignals === undefined ? {} : { affectedSignals }),
    ...(readinessScore === undefined ? {} : { readinessScore }),
    signalCount,
    ...(threshold === undefined ? {} : { threshold }),
  };
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): QualityGuardianReport["summary"] | undefined {
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
    !SEVERITIES.has(highestSeverity as QualityGuardianSeverity)
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
    !SEVERITIES.has(highestSeverity as QualityGuardianSeverity)
  ) {
    return undefined;
  }

  return {
    criticalFindings,
    highestSeverity: highestSeverity as QualityGuardianSeverity,
    totalFindings,
    warningFindings,
  };
}

function readOptionalSignalNames(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly QualityGuardianSignalName[] | false | undefined {
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

  const signals: QualityGuardianSignalName[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || !SIGNAL_NAMES.has(entry as QualityGuardianSignalName)) {
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
    signals.push(entry as QualityGuardianSignalName);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? false
    : Object.freeze(signals);
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
    contractVersion !== QUALITY_GUARDIAN_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${QUALITY_GUARDIAN_CONTRACT_VERSION}`,
      path: path(pathPrefix, "contractVersion"),
    });
  }
  return contractVersion === QUALITY_GUARDIAN_CONTRACT_VERSION
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

function readRequiredScore(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): number | undefined {
  return readScoreValue(record[key], path(pathPrefix, key), issues, true);
}

function readOptionalScore(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readScoreValue(record[key], path(pathPrefix, key), issues, false);
}

function readScoreValue(
  value: unknown,
  fieldPath: string,
  issues: ValidationIssue[],
  required: boolean,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({
      code: required && value === undefined ? "required" : "invalid_number",
      message: `${fieldPath} must be a finite number between 0 and 100`,
      path: fieldPath,
    });
    return undefined;
  }
  if (value < 0 || value > 100) {
    issues.push({
      code: "invalid_number",
      message: `${fieldPath} must be between 0 and 100`,
      path: fieldPath,
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
