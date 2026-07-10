import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  type AgentCompanyReadinessReviewInput,
} from "../assistants/agent-company-readiness-review.js";
import { MissionPlanValidator } from "./mission-plan-validator.js";
import {
  MISSION_QUALITY_DIMENSIONS,
  MISSION_QUALITY_GATE_CONTRACT_VERSION,
  type MissionQualityDimension,
  type MissionQualityFinding,
  type MissionQualityGateInput,
  type MissionQualityGateReport,
} from "./mission-quality-gate.js";

const INPUT_KEYS = new Set(["contractVersion", "plan"]);
const REPORT_KEYS = new Set([
  "blockingDefects",
  "contractVersion",
  "nonExecuting",
  "planId",
  "releaseRecommendation",
  "remediationRecommendations",
  "scores",
  "status",
  "strengths",
  "totalScore",
  "warnings",
  "weaknesses",
]);
const SCORE_KEYS = new Set(["dimension", "evidenceCodes", "score"]);
const FINDING_KEYS = new Set([
  "code",
  "dimension",
  "message",
  "recommendation",
  "severity",
]);
const DIMENSIONS = new Set<string>(MISSION_QUALITY_DIMENSIONS);
const STATUSES = new Set(["APPROVAL_READY", "BLOCKED", "REMEDIATION_REQUIRED"]);
const RELEASES = new Set([
  "APPROVE_FOR_FABIO_REVIEW",
  "DO_NOT_RELEASE",
  "REMEDIATE_BEFORE_REVIEW",
]);
const SEVERITIES = new Set(["blocking", "info", "warning"]);
const IDENTIFIER = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\b(?:api|access)[_-]?key\b/iu,
  /\b(?:raw\s+)?(?:completion|prompt|provider payload|transcript)\b/iu,
  /\bsecret\s*(?:ref(?:erence)?|value)?\b/iu,
  /(?:\/Users\/|\/home\/)[^\s]+/u,
];

export class MissionQualityGateInputValidator
  implements Validator<MissionQualityGateInput>
{
  readonly #planValidator: MissionPlanValidator;

  public constructor(
    company: AgentCompanyReadinessReviewInput =
      DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  ) {
    this.#planValidator = new MissionPlanValidator(company);
  }

  public validate(value: unknown): ValidationResult<MissionQualityGateInput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "mission quality input must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknown(record, INPUT_KEYS, issues, "");
    if (record.contractVersion !== MISSION_QUALITY_GATE_CONTRACT_VERSION) {
      issues.push(
        issue(
          "unsupported_version",
          "contractVersion must match the mission quality gate contract",
          "contractVersion",
        ),
      );
    }
    const plan = this.#planValidator.validate(record.plan);
    if (!plan.ok) {
      issues.push(
        issue(
          "invalid_plan",
          "mission quality input requires a valid non-executing Mission Plan",
          "plan",
        ),
      );
    }

    return issues.length === 0 && plan.ok
      ? validationSuccess({
          contractVersion: MISSION_QUALITY_GATE_CONTRACT_VERSION,
          plan: plan.value,
        })
      : validationFailure(issues);
  }
}

export class MissionQualityGateReportValidator
  implements Validator<MissionQualityGateReport>
{
  public validate(value: unknown): ValidationResult<MissionQualityGateReport> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "mission quality report must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknown(record, REPORT_KEYS, issues, "");
    if (record.contractVersion !== MISSION_QUALITY_GATE_CONTRACT_VERSION) {
      issues.push(
        issue(
          "unsupported_version",
          "contractVersion must match the mission quality gate contract",
          "contractVersion",
        ),
      );
    }
    if (record.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "quality reports must be non-executing", "nonExecuting"));
    }
    if (!isIdentifier(record.planId)) {
      issues.push(issue("invalid_format", "planId must be normalized", "planId"));
    }

    const scores = readScores(record.scores, issues);
    const blockingDefects = readFindings(record.blockingDefects, "blockingDefects", issues);
    const warnings = readFindings(record.warnings, "warnings", issues);
    const strengths = readFindings(record.strengths, "strengths", issues);
    const weaknesses = readFindings(record.weaknesses, "weaknesses", issues);
    const remediation = readStrings(
      record.remediationRecommendations,
      "remediationRecommendations",
      issues,
    );
    if (
      remediation !== undefined &&
      (new Set(remediation).size !== remediation.length ||
        remediation.some((entry, index) => entry !== [...remediation].sort()[index]))
    ) {
      issues.push(issue("not_deterministic", "remediation recommendations must be unique and sorted", "remediationRecommendations"));
    }

    const total = record.totalScore;
    if (!Number.isInteger(total) || typeof total !== "number" || total < 0 || total > 100) {
      issues.push(issue("invalid_value", "totalScore must be an integer from 0 to 100", "totalScore"));
    } else if (scores !== undefined && total !== scores.reduce((sum, score) => sum + score.score, 0)) {
      issues.push(issue("inconsistent_summary", "totalScore must equal the score sum", "totalScore"));
    }

    const status = readEnum(record.status, STATUSES, "status", issues);
    const release = readEnum(record.releaseRecommendation, RELEASES, "releaseRecommendation", issues);
    validateFindingCollections(blockingDefects, warnings, strengths, weaknesses, issues);
    validateReleaseState(status, release, total, scores, blockingDefects, warnings, weaknesses, remediation, issues);
    rejectSensitive(value, issues);

    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(value as MissionQualityGateReport);
  }
}

function readScores(
  value: unknown,
  issues: ValidationIssue[],
): readonly MissionQualityGateReport["scores"][number][] | undefined {
  if (!Array.isArray(value) || value.length !== MISSION_QUALITY_DIMENSIONS.length) {
    issues.push(issue("invalid_type", "scores must contain every quality dimension", "scores"));
    return undefined;
  }

  const scores: MissionQualityGateReport["scores"][number][] = [];
  for (const [index, entry] of value.entries()) {
    const path = `scores[${String(index)}]`;
    const record = asRecord(entry);
    if (record === undefined) {
      issues.push(issue("invalid_type", "score must be an object", path));
      continue;
    }
    rejectUnknown(record, SCORE_KEYS, issues, path);
    const dimension = record.dimension;
    if (dimension !== MISSION_QUALITY_DIMENSIONS[index]) {
      issues.push(issue("not_deterministic", "scores must use the fixed dimension order", `${path}.dimension`));
    }
    const score = record.score;
    if (!Number.isInteger(score) || typeof score !== "number" || score < 0 || score > 10) {
      issues.push(issue("invalid_value", "score must be an integer from 0 to 10", `${path}.score`));
    }
    const evidenceCodes = readStrings(record.evidenceCodes, `${path}.evidenceCodes`, issues);
    if (evidenceCodes?.some((entry) => !isIdentifier(entry))) {
      issues.push(issue("invalid_format", "evidence codes must be normalized", `${path}.evidenceCodes`));
    }
    if (
      typeof dimension === "string" &&
      DIMENSIONS.has(dimension) &&
      typeof score === "number" &&
      Number.isInteger(score) &&
      evidenceCodes !== undefined
    ) {
      scores.push({
        dimension: dimension as MissionQualityDimension,
        evidenceCodes,
        score,
      });
    }
  }
  return scores;
}

function readFindings(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly MissionQualityFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(issue("invalid_type", `${path} must be an array`, path));
    return undefined;
  }
  const findings: MissionQualityFinding[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const record = asRecord(entry);
    if (record === undefined) {
      issues.push(issue("invalid_type", "finding must be an object", entryPath));
      continue;
    }
    rejectUnknown(record, FINDING_KEYS, issues, entryPath);
    const code = record.code;
    const message = record.message;
    const recommendation = record.recommendation;
    const severity = record.severity;
    const dimension = record.dimension;
    if (!isIdentifier(code)) issues.push(issue("invalid_format", "finding code must be normalized", `${entryPath}.code`));
    if (!isSafeText(message)) issues.push(issue("invalid_type", "finding message must be bounded safe text", `${entryPath}.message`));
    if (!isSafeText(recommendation)) issues.push(issue("invalid_type", "finding recommendation must be bounded safe text", `${entryPath}.recommendation`));
    if (typeof severity !== "string" || !SEVERITIES.has(severity)) issues.push(issue("invalid_value", "finding severity is unsupported", `${entryPath}.severity`));
    if (dimension !== undefined && (typeof dimension !== "string" || !DIMENSIONS.has(dimension))) issues.push(issue("invalid_value", "finding dimension is unsupported", `${entryPath}.dimension`));
    if (typeof code === "string" && typeof message === "string" && typeof recommendation === "string" && typeof severity === "string") {
      findings.push({
        code,
        ...(dimension === undefined ? {} : { dimension: dimension as MissionQualityDimension }),
        message,
        recommendation,
        severity: severity as MissionQualityFinding["severity"],
      });
    }
  }
  return findings;
}

function validateFindingCollections(
  blocking: readonly MissionQualityFinding[] | undefined,
  warnings: readonly MissionQualityFinding[] | undefined,
  strengths: readonly MissionQualityFinding[] | undefined,
  weaknesses: readonly MissionQualityFinding[] | undefined,
  issues: ValidationIssue[],
): void {
  if (blocking?.some((finding) => finding.severity !== "blocking")) {
    issues.push(issue("inconsistent_summary", "blockingDefects must contain blocking findings", "blockingDefects"));
  }
  if (warnings?.some((finding) => finding.severity !== "warning")) {
    issues.push(issue("inconsistent_summary", "warnings must contain warning findings", "warnings"));
  }
  if (strengths?.some((finding) => finding.severity !== "info")) {
    issues.push(issue("inconsistent_summary", "strengths must contain informational findings", "strengths"));
  }
  if (weaknesses?.some((finding) => finding.severity === "info")) {
    issues.push(issue("inconsistent_summary", "weaknesses cannot contain informational findings", "weaknesses"));
  }
  for (const [path, findings] of [["blockingDefects", blocking], ["warnings", warnings], ["strengths", strengths], ["weaknesses", weaknesses]] as const) {
    if (findings === undefined) continue;
    const codes = findings.map((finding) => finding.code);
    if (new Set(codes).size !== codes.length || codes.some((code, index) => code !== [...codes].sort()[index])) {
      issues.push(issue("not_deterministic", `${path} codes must be unique and sorted`, path));
    }
  }
}

function validateReleaseState(
  status: string | undefined,
  release: string | undefined,
  total: unknown,
  scores: readonly MissionQualityGateReport["scores"][number][] | undefined,
  blocking: readonly MissionQualityFinding[] | undefined,
  warnings: readonly MissionQualityFinding[] | undefined,
  weaknesses: readonly MissionQualityFinding[] | undefined,
  remediation: readonly string[] | undefined,
  issues: ValidationIssue[],
): void {
  if (status === "APPROVAL_READY") {
    if (release !== "APPROVE_FOR_FABIO_REVIEW") issues.push(issue("inconsistent_summary", "approval-ready reports require Fabio review", "releaseRecommendation"));
    if (typeof total !== "number" || total < 82) issues.push(issue("invalid_value", "approval-ready reports require at least 82 points", "totalScore"));
    if (blocking !== undefined && blocking.length > 0) issues.push(issue("inconsistent_summary", "approval-ready reports cannot have blocking defects", "blockingDefects"));
    if (scores?.some((score) => score.score < 7)) issues.push(issue("invalid_value", "approval-ready reports require every dimension to score at least 7", "scores"));
    if (warnings?.some((finding) => finding.code === "generic-filler")) issues.push(issue("inconsistent_summary", "approval-ready reports cannot contain generic filler", "warnings"));
  }
  if (blocking !== undefined && blocking.length > 0 && status !== "BLOCKED") {
    issues.push(issue("inconsistent_summary", "reports with blocking defects must be blocked", "status"));
  }
  if (status === "BLOCKED" && (release !== "DO_NOT_RELEASE" || blocking === undefined || blocking.length === 0)) {
    issues.push(issue("inconsistent_summary", "blocked reports require blocking defects and a do-not-release decision", "status"));
  }
  if (status === "REMEDIATION_REQUIRED" && release !== "REMEDIATE_BEFORE_REVIEW") {
    issues.push(issue("inconsistent_summary", "remediation reports require a remediation decision", "releaseRecommendation"));
  }
  if (scores !== undefined && weaknesses !== undefined && remediation !== undefined) {
    for (const score of scores.filter((entry) => entry.score < 7)) {
      const matches = weaknesses.filter((finding) => finding.dimension === score.dimension);
      if (matches.length === 0 || matches.some((finding) => !remediation.includes(finding.recommendation))) {
        issues.push(issue("remediation_required", "every low dimension requires a concrete remediation", `scores.${score.dimension}`));
      }
    }
  }
}

function readStrings(value: unknown, path: string, issues: ValidationIssue[]): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((entry) => !isSafeText(entry))) {
    issues.push(issue("invalid_type", `${path} must be an array of bounded safe text`, path));
    return undefined;
  }
  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") strings.push(entry);
  }
  return strings;
}

function readEnum(value: unknown, allowed: ReadonlySet<string>, path: string, issues: ValidationIssue[]): string | undefined {
  if (typeof value !== "string" || !allowed.has(value)) {
    issues.push(issue("invalid_value", `${path} is unsupported`, path));
    return undefined;
  }
  return value;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && !SENSITIVE.some((pattern) => pattern.test(value));
}

function rejectUnknown(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) issues.push(issue("unknown_field", "unknown fields are not allowed", prefix.length === 0 ? key : `${prefix}.${key}`));
}

function rejectSensitive(value: unknown, issues: ValidationIssue[], path = ""): void {
  if (typeof value === "string") {
    if (SENSITIVE.some((pattern) => pattern.test(value))) issues.push(issue("sensitive_content", "quality reports cannot contain sensitive material", path.length === 0 ? "$" : path));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectSensitive(entry, issues, `${path}[${String(index)}]`);
    });
    return;
  }
  const record = asRecord(value);
  if (record !== undefined) for (const [key, entry] of Object.entries(record)) rejectSensitive(entry, issues, path.length === 0 ? key : `${path}.${key}`);
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}
