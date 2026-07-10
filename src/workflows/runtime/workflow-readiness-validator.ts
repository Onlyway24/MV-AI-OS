import {
  asRecord,
  isRfc3339Timestamp,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import {
  WORKFLOW_READINESS_CONTRACT_VERSION,
  freezeWorkflowReadinessValue,
  type WorkflowReadinessFinding,
  type WorkflowReadinessReason,
  type WorkflowReadinessRequest,
  type WorkflowReadinessResult,
  type WorkflowReadinessStatus,
  type WorkflowReadinessSummary,
} from "./workflow-readiness.js";

export const MAX_WORKFLOW_READINESS_RESULTS = 100;
export const MAX_WORKFLOW_READINESS_REASONS = 100;
export const MAX_WORKFLOW_READINESS_BLOCKERS_PER_STEP = 100;
export const MAX_WORKFLOW_READINESS_IDENTIFIER_LENGTH = 128;
export const MAX_WORKFLOW_READINESS_STEPS = 100;
export const MAX_WORKFLOW_READINESS_TIMESTAMP_LENGTH = 64;
export const MAX_WORKFLOW_READINESS_VERSION = 1_000;

const ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_TEXT_PATTERN =
  /\b(?:secret|prompt|completion|provider[-_ ]?payload|raw[-_ ]?(?:knowledge|memory|transcript)|transcript|api[_-]?key)\b|(?:\/Users\/|\/home\/)|\bsk-[A-Za-z0-9_-]{8,}/iu;
const WORKFLOW_STATUSES = new Set([
  "ACTIVE",
  "CANCELLED",
  "COMPLETED",
  "FAILED",
  "PAUSED",
]);
const STEP_STATUSES = new Set([
  "AWAITING_RESULT",
  "CANCELLED",
  "FAILED",
  "PENDING",
  "READY",
  "SUCCEEDED",
]);
const READINESS_STATUSES = new Set([
  "BLOCKED",
  "PENDING",
  "READY",
  "TERMINAL",
]);
const REASON_CODES = new Set([
  "APPROVAL_REQUIRED",
  "DEPENDENCY_CYCLE",
  "DEPENDENCY_INCOMPLETE",
  "GUARDIAN_REQUIRED",
  "REASONS_TRUNCATED",
  "STEP_AWAITING_RESULT",
  "WORKFLOW_NOT_ACTIVE",
]);

export class WorkflowReadinessRequestValidator
  implements Validator<WorkflowReadinessRequest>
{
  public validate(value: unknown): ValidationResult<WorkflowReadinessRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow readiness request must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "approvedStepIds",
        "contractVersion",
        "expectedVersion",
        "guardianSatisfiedStepIds",
        "instanceId",
        "maxResults",
        "nonExecuting",
      ],
      issues,
    );
    assertContractVersion(record.contractVersion, issues);
    assertSafeIdentifier(record, "instanceId", issues);
    assertNonNegativeInteger(
      record,
      "expectedVersion",
      issues,
      "expectedVersion",
      MAX_WORKFLOW_READINESS_VERSION,
    );
    assertIdentifierArray(record, "approvedStepIds", issues);
    assertIdentifierArray(record, "guardianSatisfiedStepIds", issues);
    if (
      typeof record.maxResults !== "number" ||
      !Number.isSafeInteger(record.maxResults) ||
      record.maxResults < 1 ||
      record.maxResults > MAX_WORKFLOW_READINESS_RESULTS
    ) {
      issues.push(
        issue(
          "invalid_value",
          `maxResults must be between 1 and ${String(MAX_WORKFLOW_READINESS_RESULTS)}`,
          "maxResults",
        ),
      );
    }
    if (record.nonExecuting !== true) {
      issues.push(
        issue("unsafe_execution", "readiness request must be non-executing", "nonExecuting"),
      );
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowReadinessValue(value as WorkflowReadinessRequest),
        );
  }
}

export class WorkflowReadinessReasonValidator
  implements Validator<WorkflowReadinessReason>
{
  public validate(value: unknown): ValidationResult<WorkflowReadinessReason> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow readiness reason must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(record, ["code", "relatedStepId"], issues);
    if (typeof record.code !== "string" || !REASON_CODES.has(record.code)) {
      issues.push(issue("invalid_value", "readiness reason code is invalid", "code"));
    }
    if (record.relatedStepId !== undefined) {
      assertSafeIdentifier(record, "relatedStepId", issues);
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowReadinessValue(value as WorkflowReadinessReason),
        );
  }
}

export class WorkflowReadinessFindingValidator
  implements Validator<WorkflowReadinessFinding>
{
  readonly #reasonValidator = new WorkflowReadinessReasonValidator();

  public validate(value: unknown): ValidationResult<WorkflowReadinessFinding> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow readiness finding must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      ["nonExecuting", "persistedStatus", "reasons", "status", "stepId"],
      issues,
    );
    assertSafeIdentifier(record, "stepId", issues);
    if (
      typeof record.persistedStatus !== "string" ||
      !STEP_STATUSES.has(record.persistedStatus)
    ) {
      issues.push(
        issue("invalid_value", "persisted step status is invalid", "persistedStatus"),
      );
    }
    if (
      typeof record.status !== "string" ||
      !READINESS_STATUSES.has(record.status)
    ) {
      issues.push(issue("invalid_value", "readiness status is invalid", "status"));
    }
    const reasons = validateReasons(record.reasons, this.#reasonValidator, issues);
    if (record.nonExecuting !== true) {
      issues.push(
        issue("unsafe_execution", "readiness finding must be non-executing", "nonExecuting"),
      );
    }
    if (typeof record.status === "string" && reasons !== undefined) {
      validateFindingSemantics(
        record.status,
        record.persistedStatus,
        reasons,
        issues,
      );
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowReadinessValue(value as WorkflowReadinessFinding),
        );
  }
}

export class WorkflowReadinessResultValidator
  implements Validator<WorkflowReadinessResult>
{
  readonly #findingValidator = new WorkflowReadinessFindingValidator();

  public validate(value: unknown): ValidationResult<WorkflowReadinessResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow readiness result must be an object", "$"),
      ]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "blockedFindings",
        "contractVersion",
        "definitionId",
        "evaluatedVersion",
        "instanceId",
        "nonExecuting",
        "pendingFindings",
        "readyFindings",
        "stateUpdatedAt",
        "summary",
        "terminalFindings",
        "workflowStatus",
      ],
      issues,
    );
    assertContractVersion(record.contractVersion, issues);
    assertSafeIdentifier(record, "definitionId", issues);
    assertSafeIdentifier(record, "instanceId", issues);
    assertNonNegativeInteger(
      record,
      "evaluatedVersion",
      issues,
      "evaluatedVersion",
      MAX_WORKFLOW_READINESS_VERSION,
    );
    if (
      typeof record.workflowStatus !== "string" ||
      !WORKFLOW_STATUSES.has(record.workflowStatus)
    ) {
      issues.push(issue("invalid_value", "workflow status is invalid", "workflowStatus"));
    }
    if (
      typeof record.stateUpdatedAt !== "string" ||
      record.stateUpdatedAt.length > MAX_WORKFLOW_READINESS_TIMESTAMP_LENGTH ||
      !isRfc3339Timestamp(record.stateUpdatedAt)
    ) {
      issues.push(
        issue("invalid_format", "stateUpdatedAt must be an RFC 3339 timestamp", "stateUpdatedAt"),
      );
    }
    if (record.nonExecuting !== true) {
      issues.push(
        issue("unsafe_execution", "readiness result must be non-executing", "nonExecuting"),
      );
    }

    const blocked = validateFindings(
      record.blockedFindings,
      "BLOCKED",
      "blockedFindings",
      this.#findingValidator,
      issues,
    );
    const pending = validateFindings(
      record.pendingFindings,
      "PENDING",
      "pendingFindings",
      this.#findingValidator,
      issues,
    );
    const ready = validateFindings(
      record.readyFindings,
      "READY",
      "readyFindings",
      this.#findingValidator,
      issues,
    );
    const terminal = validateFindings(
      record.terminalFindings,
      "TERMINAL",
      "terminalFindings",
      this.#findingValidator,
      issues,
    );
    validateNoDuplicateFindingIds([blocked, pending, ready, terminal], issues);
    const summary = validateSummary(record.summary, issues);
    if (summary !== undefined) {
      validateSummaryMatchesFindings(summary, blocked, pending, ready, terminal, issues);
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowReadinessValue(value as WorkflowReadinessResult),
        );
  }
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  issues: ValidationIssue[],
  path = "",
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push(
        issue("unknown_field", "field is not allowed", pathFor(path, key)),
      );
    }
  }
}

function assertContractVersion(
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (value !== WORKFLOW_READINESS_CONTRACT_VERSION) {
    issues.push(
      issue(
        "unsupported_version",
        `contractVersion must be ${WORKFLOW_READINESS_CONTRACT_VERSION}`,
        "contractVersion",
      ),
    );
  }
}

function assertIdentifierArray(
  record: Readonly<Record<string, unknown>>,
  field: string,
  issues: ValidationIssue[],
): void {
  const value = record[field];
  if (!Array.isArray(value)) {
    issues.push(issue("invalid_type", `${field} must be an array`, field));
    return;
  }
  if (value.length > MAX_WORKFLOW_READINESS_RESULTS) {
    issues.push(
      issue(
        "invalid_value",
        `${field} exceeds the maximum control-marker count`,
        field,
      ),
    );
  }

  const identifiers: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || !isSafeIdentifier(entry)) {
      issues.push(
        issue("invalid_format", `${field} entries must be safe identifiers`, `${field}[${String(index)}]`),
      );
      continue;
    }
    identifiers.push(entry);
  }
  if (new Set(identifiers).size !== identifiers.length) {
    issues.push(issue("duplicate", `${field} entries must be unique`, field));
  }
}

function assertNonNegativeInteger(
  record: Readonly<Record<string, unknown>>,
  field: string,
  issues: ValidationIssue[],
  path = field,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    issues.push(
      issue("invalid_value", `${field} must be a non-negative integer`, path),
    );
  }
}

function assertSafeIdentifier(
  record: Readonly<Record<string, unknown>>,
  field: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[field] !== "string" || !isSafeIdentifier(record[field])) {
    issues.push(issue("invalid_format", `${field} is invalid`, field));
  }
}

function isSafeIdentifier(value: string): boolean {
  return (
    ID_PATTERN.test(value) &&
    value.length <= MAX_WORKFLOW_READINESS_IDENTIFIER_LENGTH &&
    !SENSITIVE_TEXT_PATTERN.test(value)
  );
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}

function pathFor(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function validateReasons(
  value: unknown,
  validator: Validator<WorkflowReadinessReason>,
  issues: ValidationIssue[],
): readonly WorkflowReadinessReason[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(issue("invalid_type", "reasons must be an array", "reasons"));
    return undefined;
  }
  if (value.length > MAX_WORKFLOW_READINESS_REASONS) {
    issues.push(
      issue(
        "invalid_value",
        "reasons exceed the maximum count",
        "reasons",
      ),
    );
  }

  const reasons: WorkflowReadinessReason[] = [];
  const keys = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const validation = validator.validate(entry);
    if (!validation.ok) {
      issues.push(
        issue("invalid_value", "readiness reason is invalid", `reasons[${String(index)}]`),
      );
      continue;
    }
    const key = `${validation.value.code}:${validation.value.relatedStepId ?? ""}`;
    if (keys.has(key)) {
      issues.push(issue("duplicate", "readiness reasons must be unique", "reasons"));
      continue;
    }
    keys.add(key);
    reasons.push(validation.value);
  }
  const truncatedIndexes = reasons.flatMap((reason, index) =>
    reason.code === "REASONS_TRUNCATED" ? [index] : [],
  );
  if (
    truncatedIndexes.length > 1 ||
    (truncatedIndexes.length === 1 &&
      (truncatedIndexes[0] !== reasons.length - 1 ||
        reasons.length !== MAX_WORKFLOW_READINESS_REASONS))
  ) {
    issues.push(
      issue(
        "invalid_value",
        "the truncation reason must appear once at the end",
        "reasons",
      ),
    );
  }
  return reasons;
}

function validateFindingSemantics(
  status: string,
  persistedStatus: unknown,
  reasons: readonly WorkflowReadinessReason[],
  issues: ValidationIssue[],
): void {
  if ((status === "READY" || status === "TERMINAL") && reasons.length !== 0) {
    issues.push(
      issue("invalid_value", `${status} findings cannot contain reasons`, "reasons"),
    );
  }
  if (status === "BLOCKED" && reasons.length === 0) {
    issues.push(
      issue("invalid_value", "blocked findings require at least one reason", "reasons"),
    );
  }
  if (
    status === "PENDING" &&
    (reasons.length !== 1 || reasons[0]?.code !== "STEP_AWAITING_RESULT")
  ) {
    issues.push(
      issue(
        "invalid_value",
        "pending findings require only the awaiting-result reason",
        "reasons",
      ),
    );
  }
  if (status === "PENDING" && persistedStatus !== "AWAITING_RESULT") {
    issues.push(
      issue(
        "invalid_value",
        "pending findings must represent an awaiting-result step",
        "persistedStatus",
      ),
    );
  }
  if (
    status === "READY" &&
    persistedStatus !== "PENDING" &&
    persistedStatus !== "READY"
  ) {
    issues.push(
      issue(
        "invalid_value",
        "ready findings must represent a pending or ready step",
        "persistedStatus",
      ),
    );
  }
}

function validateFindings(
  value: unknown,
  expectedStatus: WorkflowReadinessStatus,
  path: string,
  validator: Validator<WorkflowReadinessFinding>,
  issues: ValidationIssue[],
): readonly WorkflowReadinessFinding[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(issue("invalid_type", `${path} must be an array`, path));
    return undefined;
  }
  if (value.length > MAX_WORKFLOW_READINESS_RESULTS) {
    issues.push(
      issue(
        "invalid_value",
        `${path} exceeds the maximum result count`,
        path,
      ),
    );
  }

  const findings: WorkflowReadinessFinding[] = [];
  for (const [index, entry] of value.entries()) {
    const validation = validator.validate(entry);
    if (!validation.ok) {
      issues.push(
        issue("invalid_value", "readiness finding is invalid", `${path}[${String(index)}]`),
      );
      continue;
    }
    if (validation.value.status !== expectedStatus) {
      issues.push(
        issue("invalid_value", "finding is in the wrong result bucket", `${path}[${String(index)}].status`),
      );
      continue;
    }
    findings.push(validation.value);
  }
  return findings;
}

function validateNoDuplicateFindingIds(
  collections: readonly (readonly WorkflowReadinessFinding[] | undefined)[],
  issues: ValidationIssue[],
): void {
  const ids: string[] = [];
  for (const findings of collections) {
    for (const finding of findings ?? []) {
      ids.push(finding.stepId);
    }
  }
  if (new Set(ids).size !== ids.length) {
    issues.push(issue("duplicate", "findings must reference unique step IDs", "findings"));
  }
}

function validateSummary(
  value: unknown,
  issues: ValidationIssue[],
): WorkflowReadinessSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "summary must be an object", "summary"));
    return undefined;
  }
  assertOnlyKnownKeys(
    record,
    [
      "blockedCount",
      "blockedTruncated",
      "pendingCount",
      "pendingTruncated",
      "readyCount",
      "readyTruncated",
      "terminalCount",
      "terminalTruncated",
    ],
    issues,
    "summary",
  );
  for (const field of [
    "blockedCount",
    "pendingCount",
    "readyCount",
    "terminalCount",
  ]) {
    assertNonNegativeInteger(record, field, issues, `summary.${field}`);
  }
  for (const field of [
    "blockedTruncated",
    "pendingTruncated",
    "readyTruncated",
    "terminalTruncated",
  ]) {
    if (typeof record[field] !== "boolean") {
      issues.push(
        issue("invalid_type", `${field} must be boolean`, `summary.${field}`),
      );
    }
  }
  return record as unknown as WorkflowReadinessSummary;
}

function validateSummaryMatchesFindings(
  summary: WorkflowReadinessSummary,
  blocked: readonly WorkflowReadinessFinding[] | undefined,
  pending: readonly WorkflowReadinessFinding[] | undefined,
  ready: readonly WorkflowReadinessFinding[] | undefined,
  terminal: readonly WorkflowReadinessFinding[] | undefined,
  issues: ValidationIssue[],
): void {
  validateSummaryBucket(summary.blockedCount, summary.blockedTruncated, blocked, "blocked", issues);
  validateSummaryBucket(summary.pendingCount, summary.pendingTruncated, pending, "pending", issues);
  validateSummaryBucket(summary.readyCount, summary.readyTruncated, ready, "ready", issues);
  validateSummaryBucket(summary.terminalCount, summary.terminalTruncated, terminal, "terminal", issues);
}

function validateSummaryBucket(
  count: number,
  truncated: boolean,
  findings: readonly WorkflowReadinessFinding[] | undefined,
  name: string,
  issues: ValidationIssue[],
): void {
  if (findings === undefined) {
    return;
  }
  if (count < findings.length || truncated !== (count > findings.length)) {
    issues.push(
      issue("invalid_value", `${name} summary does not match findings`, "summary"),
    );
  }
}
