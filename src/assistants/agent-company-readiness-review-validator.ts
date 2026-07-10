import {
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  AGENT_COMPANY_READINESS_CONTRACT_VERSION,
  type AgentCompanyReadinessCategory,
  type AgentCompanyReadinessFinding,
  type AgentCompanyReadinessReport,
  type AgentCompanyReadinessReviewInput,
  type AgentCompanyReadinessSeverity,
  type AgentCompanyReadinessStatus,
  type AgentCompanyReadinessSummary,
} from "./agent-company-readiness-review.js";
import { AGENT_COMPANY_CAPABILITY_IDS } from "./agent-capability-registry.js";
import { DEFAULT_AGENT_COMPANY_MAP } from "./agent-company-specification.js";
import { AGENT_HANDOFF_IDS } from "./agent-handoff-contracts.js";
import { AGENT_COMPANY_PERMISSION_RULE_IDS } from "./agent-permission-matrix.js";
import { DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX } from "./inter-agent-responsibility-matrix.js";

const INPUT_KEYS = new Set([
  "agentCompanyMap",
  "agentSpecifications",
  "capabilityRegistry",
  "contractVersion",
  "handoffContracts",
  "nonExecuting",
  "permissionMatrix",
  "responsibilityMatrix",
  "reviewId",
]);

const REPORT_KEYS = new Set([
  "contractVersion",
  "evaluatedArtifactIds",
  "findings",
  "nonExecuting",
  "reportId",
  "summary",
]);

const FINDING_KEYS = new Set([
  "affectedCapabilityId",
  "affectedHandoffId",
  "affectedPermissionId",
  "affectedResponsibilityAreaId",
  "affectedRoleId",
  "category",
  "evidenceRefs",
  "findingId",
  "recommendation",
  "severity",
  "summary",
  "title",
]);

const SUMMARY_KEYS = new Set([
  "criticalFindings",
  "evaluatedArtifacts",
  "informationalFindings",
  "readinessScore",
  "status",
  "totalFindings",
  "warningFindings",
]);

const CATEGORIES = new Set<AgentCompanyReadinessCategory>([
  "approval_control",
  "artifact_validation",
  "capability_coverage",
  "capability_ownership",
  "control_plane_coverage",
  "execution_safety",
  "guardian_control",
  "handoff_alignment",
  "handoff_coverage",
  "identifier_consistency",
  "permission_boundary",
  "permission_coverage",
  "redaction_safety",
  "responsibility_coverage",
  "responsibility_ownership",
  "role_coverage",
  "specification_coverage",
]);

const SEVERITIES = new Set<AgentCompanyReadinessSeverity>([
  "critical",
  "info",
  "warning",
]);

const STATUSES = new Set<AgentCompanyReadinessStatus>([
  "NOT_READY",
  "READY",
  "READY_WITH_NON_BLOCKING_WARNINGS",
]);

const ROLE_IDS = new Set(
  DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId),
);
const CAPABILITY_IDS = new Set<string>(AGENT_COMPANY_CAPABILITY_IDS);
const PERMISSION_IDS = new Set<string>(AGENT_COMPANY_PERMISSION_RULE_IDS);
const HANDOFF_IDS = new Set<string>(AGENT_HANDOFF_IDS);
const RESPONSIBILITY_IDS = new Set(
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.map(({ areaId }) => areaId),
);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9@._:-]*$/u;
const ARTIFACT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const EVIDENCE_REF_PATTERN =
  /^(?:artifact|capability|handoff|permission|responsibility|role):[a-z0-9][a-z0-9@._:-]*$/u;

const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\bapi[_-]?key\b/iu,
  /\b(?:raw\s+)?prompt\b/iu,
  /\b(?:raw\s+)?completion\b/iu,
  /\bprovider\s*payload\b/iu,
  /\bsecret\s*(?:ref(?:erence)?|value)?\b/iu,
  /\btransport\s*internals\b/iu,
  /\/Users\/[^\s]+/u,
];

export class AgentCompanyReadinessReviewInputValidator
  implements Validator<AgentCompanyReadinessReviewInput>
{
  public validate(
    value: unknown,
  ): ValidationResult<AgentCompanyReadinessReviewInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent company readiness input must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INPUT_KEYS, issues, "");
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_COMPANY_READINESS_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent company readiness contractVersion must be 1",
        path: "contractVersion",
      });
    }
    const reviewId = readRequiredString(record, "reviewId", issues, "", {
      maxLength: 128,
    });
    if (reviewId !== undefined && !IDENTIFIER_PATTERN.test(reviewId)) {
      issues.push({
        code: "invalid_format",
        message: "reviewId must be a normalized identifier",
        path: "reviewId",
      });
    }
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "unsafe_execution",
        message: "agent company readiness review must be non-executing",
        path: "nonExecuting",
      });
    }

    const agentCompanyMap = readObject(record, "agentCompanyMap", issues);
    const responsibilityMatrix = readObject(
      record,
      "responsibilityMatrix",
      issues,
    );
    const capabilityRegistry = readObject(
      record,
      "capabilityRegistry",
      issues,
    );
    const permissionMatrix = readObject(
      record,
      "permissionMatrix",
      issues,
    );
    const handoffContracts = readObject(
      record,
      "handoffContracts",
      issues,
    );
    const agentSpecifications = Array.isArray(record.agentSpecifications)
      ? record.agentSpecifications
      : undefined;
    if (agentSpecifications === undefined) {
      issues.push({
        code:
          record.agentSpecifications === undefined
            ? "required"
            : "invalid_type",
        message: "agentSpecifications must be an array",
        path: "agentSpecifications",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== AGENT_COMPANY_READINESS_CONTRACT_VERSION ||
      reviewId === undefined ||
      nonExecuting !== true ||
      agentCompanyMap === undefined ||
      agentSpecifications === undefined ||
      responsibilityMatrix === undefined ||
      capabilityRegistry === undefined ||
      permissionMatrix === undefined ||
      handoffContracts === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agentCompanyMap:
        agentCompanyMap as unknown as AgentCompanyReadinessReviewInput["agentCompanyMap"],
      agentSpecifications,
      capabilityRegistry:
        capabilityRegistry as unknown as AgentCompanyReadinessReviewInput["capabilityRegistry"],
      contractVersion,
      handoffContracts:
        handoffContracts as unknown as AgentCompanyReadinessReviewInput["handoffContracts"],
      nonExecuting: true,
      permissionMatrix:
        permissionMatrix as unknown as AgentCompanyReadinessReviewInput["permissionMatrix"],
      responsibilityMatrix:
        responsibilityMatrix as unknown as AgentCompanyReadinessReviewInput["responsibilityMatrix"],
      reviewId,
    });
  }
}

export class AgentCompanyReadinessReportValidator
  implements Validator<AgentCompanyReadinessReport>
{
  public validate(value: unknown): ValidationResult<AgentCompanyReadinessReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent company readiness report must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REPORT_KEYS, issues, "");
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_COMPANY_READINESS_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent company readiness report contractVersion must be 1",
        path: "contractVersion",
      });
    }
    const reportId = readRequiredString(record, "reportId", issues, "", {
      maxLength: 128,
    });
    if (reportId !== undefined && !IDENTIFIER_PATTERN.test(reportId)) {
      issues.push({
        code: "invalid_format",
        message: "reportId must be a normalized identifier",
        path: "reportId",
      });
    }
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "unsafe_execution",
        message: "agent company readiness report must be non-executing",
        path: "nonExecuting",
      });
    }
    const evaluatedArtifactIds = readRequiredStringArray(
      record,
      "evaluatedArtifactIds",
      issues,
      "",
      false,
    );
    const findings = readFindings(record.findings, issues);
    const summary = readSummary(record.summary, issues);

    if (evaluatedArtifactIds !== undefined) {
      validateUnique(evaluatedArtifactIds, "evaluatedArtifactIds", issues);
      for (const [index, artifactId] of evaluatedArtifactIds.entries()) {
        if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
          issues.push({
            code: "invalid_format",
            message: "evaluated artifact IDs must be normalized",
            path: `evaluatedArtifactIds[${String(index)}]`,
          });
        }
      }
    }
    if (findings !== undefined) {
      validateFindingOrder(findings, issues);
      validateUnique(
        findings.map(({ findingId }) => findingId),
        "findings",
        issues,
      );
    }
    if (findings !== undefined && summary !== undefined) {
      validateSummaryCoherence(
        summary,
        findings,
        evaluatedArtifactIds?.length ?? 0,
        issues,
      );
    }
    rejectSensitiveReportContent(record, issues);

    if (
      issues.length > 0 ||
      contractVersion !== AGENT_COMPANY_READINESS_CONTRACT_VERSION ||
      reportId === undefined ||
      nonExecuting !== true ||
      evaluatedArtifactIds === undefined ||
      findings === undefined ||
      summary === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      evaluatedArtifactIds,
      findings,
      nonExecuting: true,
      reportId,
      summary,
    });
  }
}

function readFindings(
  value: unknown,
  issues: ValidationIssue[],
): readonly AgentCompanyReadinessFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "findings must be an array",
      path: "findings",
    });
    return undefined;
  }
  const findings: AgentCompanyReadinessFinding[] = [];
  for (const [index, candidate] of value.entries()) {
    const path = `findings[${String(index)}]`;
    const record = asRecord(candidate);
    if (record === undefined) {
      issues.push({
        code: "invalid_type",
        message: "finding must be an object",
        path,
      });
      continue;
    }
    rejectUnknownKeys(record, FINDING_KEYS, issues, path);
    const findingId = readRequiredString(record, "findingId", issues, path, {
      maxLength: 196,
    });
    const category = readRequiredString(record, "category", issues, path);
    const severity = readRequiredString(record, "severity", issues, path);
    const title = readRequiredString(record, "title", issues, path, {
      maxLength: 160,
    });
    const summary = readRequiredString(record, "summary", issues, path, {
      maxLength: 500,
    });
    const recommendation = readRequiredString(
      record,
      "recommendation",
      issues,
      path,
      { maxLength: 500 },
    );
    const evidenceRefs = readRequiredStringArray(
      record,
      "evidenceRefs",
      issues,
      path,
      false,
    );
    if (findingId !== undefined && !IDENTIFIER_PATTERN.test(findingId)) {
      issues.push({
        code: "invalid_format",
        message: "findingId must be a normalized identifier",
        path: `${path}.findingId`,
      });
    }
    for (const [evidenceIndex, evidenceRef] of evidenceRefs?.entries() ?? []) {
      if (!EVIDENCE_REF_PATTERN.test(evidenceRef)) {
        issues.push({
          code: "invalid_format",
          message: "evidence references must use canonical identifier-only refs",
          path: `${path}.evidenceRefs[${String(evidenceIndex)}]`,
        });
      }
    }
    if (category !== undefined && !CATEGORIES.has(category as AgentCompanyReadinessCategory)) {
      issues.push({
        code: "invalid_value",
        message: "finding category is not supported",
        path: `${path}.category`,
      });
    }
    if (severity !== undefined && !SEVERITIES.has(severity as AgentCompanyReadinessSeverity)) {
      issues.push({
        code: "invalid_value",
        message: "finding severity is not supported",
        path: `${path}.severity`,
      });
    }
    const optionalIds = readOptionalFindingIds(record, path, issues);
    if (
      findingId === undefined ||
      category === undefined ||
      !CATEGORIES.has(category as AgentCompanyReadinessCategory) ||
      severity === undefined ||
      !SEVERITIES.has(severity as AgentCompanyReadinessSeverity) ||
      title === undefined ||
      summary === undefined ||
      recommendation === undefined ||
      evidenceRefs === undefined ||
      optionalIds === undefined
    ) {
      continue;
    }
    findings.push({
      ...optionalIds,
      category: category as AgentCompanyReadinessCategory,
      evidenceRefs,
      findingId,
      recommendation,
      severity: severity as AgentCompanyReadinessSeverity,
      summary,
      title,
    });
  }
  return findings;
}

function readOptionalFindingIds(
  record: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): Omit<
  AgentCompanyReadinessFinding,
  | "category"
  | "evidenceRefs"
  | "findingId"
  | "recommendation"
  | "severity"
  | "summary"
  | "title"
> | undefined {
  const result: Record<string, string> = {};
  const knownIds: Readonly<Record<string, ReadonlySet<string>>> = {
    affectedCapabilityId: CAPABILITY_IDS,
    affectedHandoffId: HANDOFF_IDS,
    affectedPermissionId: PERMISSION_IDS,
    affectedResponsibilityAreaId: RESPONSIBILITY_IDS,
    affectedRoleId: ROLE_IDS,
  };
  for (const [key, allowed] of Object.entries(knownIds)) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 128 ||
      !allowed.has(value)
    ) {
      issues.push({
        code: "invalid_value",
        message: `${key} must be a known canonical identifier`,
        path: `${path}.${key}`,
      });
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

function readSummary(
  value: unknown,
  issues: ValidationIssue[],
): AgentCompanyReadinessSummary | undefined {
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
  const status = readRequiredString(record, "status", issues, "summary");
  const readinessScore = readRequiredInteger(
    record,
    "readinessScore",
    issues,
    "summary",
    0,
  );
  if (readinessScore !== undefined && readinessScore > 100) {
    issues.push({
      code: "invalid_number",
      message: "summary.readinessScore must be at most 100",
      path: "summary.readinessScore",
    });
  }
  const evaluatedArtifacts = readRequiredInteger(
    record,
    "evaluatedArtifacts",
    issues,
    "summary",
    0,
  );
  const totalFindings = readRequiredInteger(
    record,
    "totalFindings",
    issues,
    "summary",
    0,
  );
  const criticalFindings = readRequiredInteger(
    record,
    "criticalFindings",
    issues,
    "summary",
    0,
  );
  const warningFindings = readRequiredInteger(
    record,
    "warningFindings",
    issues,
    "summary",
    0,
  );
  const informationalFindings = readRequiredInteger(
    record,
    "informationalFindings",
    issues,
    "summary",
    0,
  );
  if (status !== undefined && !STATUSES.has(status as AgentCompanyReadinessStatus)) {
    issues.push({
      code: "invalid_value",
      message: "readiness status is not supported",
      path: "summary.status",
    });
  }
  if (
    status === undefined ||
    !STATUSES.has(status as AgentCompanyReadinessStatus) ||
    readinessScore === undefined ||
    evaluatedArtifacts === undefined ||
    totalFindings === undefined ||
    criticalFindings === undefined ||
    warningFindings === undefined ||
    informationalFindings === undefined
  ) {
    return undefined;
  }
  return {
    criticalFindings,
    evaluatedArtifacts,
    informationalFindings,
    readinessScore,
    status: status as AgentCompanyReadinessStatus,
    totalFindings,
    warningFindings,
  };
}

function validateSummaryCoherence(
  summary: AgentCompanyReadinessSummary,
  findings: readonly AgentCompanyReadinessFinding[],
  evaluatedArtifacts: number,
  issues: ValidationIssue[],
): void {
  const critical = findings.filter(({ severity }) => severity === "critical").length;
  const warnings = findings.filter(({ severity }) => severity === "warning").length;
  const info = findings.filter(({ severity }) => severity === "info").length;
  const expectedStatus: AgentCompanyReadinessStatus =
    critical > 0
      ? "NOT_READY"
      : warnings > 0
        ? "READY_WITH_NON_BLOCKING_WARNINGS"
        : "READY";
  const expectedScore = Math.max(0, 100 - critical * 20 - warnings * 5);
  const checks: readonly [number | string, number | string, string][] = [
    [summary.criticalFindings, critical, "criticalFindings"],
    [summary.warningFindings, warnings, "warningFindings"],
    [summary.informationalFindings, info, "informationalFindings"],
    [summary.totalFindings, findings.length, "totalFindings"],
    [summary.evaluatedArtifacts, evaluatedArtifacts, "evaluatedArtifacts"],
    [summary.readinessScore, expectedScore, "readinessScore"],
    [summary.status, expectedStatus, "status"],
  ];
  for (const [actual, expected, key] of checks) {
    if (actual !== expected) {
      issues.push({
        code: "inconsistent_summary",
        message: `summary ${key} does not match report findings`,
        path: `summary.${key}`,
      });
    }
  }
}

function validateFindingOrder(
  findings: readonly AgentCompanyReadinessFinding[],
  issues: ValidationIssue[],
): void {
  const keys = findings.map(findingSortKey);
  const sorted = [...keys].sort((left, right) => left.localeCompare(right));
  if (keys.some((key, index) => key !== sorted[index])) {
    issues.push({
      code: "not_deterministic",
      message: "findings must use deterministic severity, category, and ID ordering",
      path: "findings",
    });
  }
}

function findingSortKey(finding: AgentCompanyReadinessFinding): string {
  const severityOrder: Record<AgentCompanyReadinessSeverity, string> = {
    critical: "0",
    warning: "1",
    info: "2",
  };
  return `${severityOrder[finding.severity]}:${finding.category}:${finding.findingId}`;
}

function rejectSensitiveReportContent(
  value: unknown,
  issues: ValidationIssue[],
  path = "",
): void {
  if (typeof value === "string") {
    if (SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
      issues.push({
        code: "sensitive_content",
        message: "readiness report contains prohibited sensitive content",
        path: path.length === 0 ? "$" : path,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectSensitiveReportContent(
        entry,
        issues,
        `${path}[${String(index)}]`,
      );
    });
    return;
  }
  const record = asRecord(value);
  if (record === undefined) {
    return;
  }
  for (const [key, entry] of Object.entries(record)) {
    rejectSensitiveReportContent(
      entry,
      issues,
      path.length === 0 ? key : `${path}.${key}`,
    );
  }
}

function readObject(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): Readonly<Record<string, unknown>> | undefined {
  const value = asRecord(record[key]);
  if (value === undefined) {
    issues.push({
      code: record[key] === undefined ? "required" : "invalid_type",
      message: `${key} must be an object`,
      path: key,
    });
  }
  return value;
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unknown_field",
        message: "unknown fields are not allowed",
        path: path.length === 0 ? key : `${path}.${key}`,
      });
    }
  }
}

function validateUnique(
  values: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicates`,
      path,
    });
  }
}
