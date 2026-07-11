import {
  asRecord,
  isRfc3339Timestamp,
  isSemanticVersion,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import { WorkflowCommandValidator } from "./workflow-runtime-validator.js";
import {
  WORKFLOW_PERSISTENCE_CONTRACT_VERSION,
  type WorkflowCommandApplication,
  type WorkflowEvent,
  type WorkflowEventDraft,
} from "./workflow-persistence.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_TEXT_PATTERN =
  /\b(?:secret|prompt|completion|provider payload|transcript|api[_-]?key)\b|(?:\/Users\/|\/home\/)|\bsk-[A-Za-z0-9_-]{8,}/iu;
const EVENT_SUMMARY_CODE = "workflow_transition_applied";
const ACTOR_CATEGORIES = new Set(["operator", "runtime"]);
const COMMAND_KINDS = new Set([
  "ACTIVATE",
  "CANCEL",
  "COMPLETE_STEP",
  "FAIL_STEP",
  "PAUSE",
  "RESUME",
  "RETRY_STEP",
]);
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

export class WorkflowCommandApplicationValidator
  implements Validator<WorkflowCommandApplication>
{
  readonly #commandValidator = new WorkflowCommandValidator();

  public validate(
    value: unknown,
  ): ValidationResult<WorkflowCommandApplication> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow command application must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(record, ["instanceId", "command", "actorCategory"], issues);
    assertIdentifier(record, "instanceId", issues);
    if (
      typeof record.actorCategory !== "string" ||
      !ACTOR_CATEGORIES.has(record.actorCategory)
    ) {
      issues.push(issue("invalid_value", "actorCategory is invalid", "actorCategory"));
    }
    const command = this.#commandValidator.validate(record.command);
    if (!command.ok) {
      issues.push(issue("invalid_value", "command is invalid", "command"));
    }

    if (issues.length > 0 || !command.ok) {
      return validationFailure(issues);
    }
    return validationSuccess(
      freeze({
        actorCategory: record.actorCategory as "operator" | "runtime",
        command: command.value,
        instanceId: record.instanceId as string,
      }),
    );
  }
}

export class WorkflowEventDraftValidator
  implements Validator<WorkflowEventDraft>
{
  public validate(value: unknown): ValidationResult<WorkflowEventDraft> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow event draft must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "eventId",
        "definitionId",
        "workflowId",
        "workflowVersion",
        "instanceId",
        "instanceVersion",
        "commandId",
        "commandKind",
        "actorCategory",
        "previousStatus",
        "nextStatus",
        "previousStepStatus",
        "nextStepStatus",
        "stepId",
        "reasonCode",
        "summaryCode",
        "occurredAt",
        "nonExecuting",
      ],
      issues,
    );
    assertEventFields(record, issues);
    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(freeze(value as WorkflowEventDraft));
  }
}

export class WorkflowEventValidator implements Validator<WorkflowEvent> {
  readonly #draftValidator = new WorkflowEventDraftValidator();

  public validate(value: unknown): ValidationResult<WorkflowEvent> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow event must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "eventId",
        "definitionId",
        "workflowId",
        "workflowVersion",
        "instanceId",
        "instanceVersion",
        "commandId",
        "commandKind",
        "actorCategory",
        "previousStatus",
        "nextStatus",
        "previousStepStatus",
        "nextStepStatus",
        "stepId",
        "reasonCode",
        "summaryCode",
        "occurredAt",
        "nonExecuting",
        "sequence",
      ],
      issues,
    );
    const draft = this.#draftValidator.validate(withoutSequence(record));
    if (!draft.ok) {
      issues.push(issue("invalid_value", "event fields are invalid", "$"));
    }
    if (
      typeof record.sequence !== "number" ||
      !Number.isSafeInteger(record.sequence) ||
      record.sequence < 1
    ) {
      issues.push(issue("invalid_value", "event sequence is invalid", "sequence"));
    }
    return issues.length > 0 || !draft.ok
      ? validationFailure(issues)
      : validationSuccess(
          freeze({ ...draft.value, sequence: record.sequence as number }),
        );
  }
}

function assertEventFields(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (record.contractVersion !== WORKFLOW_PERSISTENCE_CONTRACT_VERSION) {
    issues.push(issue("unsupported_version", "event contractVersion is invalid", "contractVersion"));
  }
  for (const key of [
    "eventId",
    "definitionId",
    "workflowId",
    "instanceId",
    "commandId",
    "reasonCode",
  ]) {
    assertSafeIdentifier(record, key, issues);
  }
  if (
    typeof record.reasonCode !== "string" ||
    SENSITIVE_TEXT_PATTERN.test(record.reasonCode)
  ) {
    issues.push(issue("invalid_value", "reasonCode is invalid", "reasonCode"));
  }
  if (
    typeof record.workflowVersion !== "string" ||
    !isSemanticVersion(record.workflowVersion)
  ) {
    issues.push(issue("invalid_format", "workflowVersion is invalid", "workflowVersion"));
  }
  if (
    typeof record.instanceVersion !== "number" ||
    !Number.isSafeInteger(record.instanceVersion) ||
    record.instanceVersion < 1
  ) {
    issues.push(issue("invalid_value", "instanceVersion is invalid", "instanceVersion"));
  }
  if (
    typeof record.commandKind !== "string" ||
    !COMMAND_KINDS.has(record.commandKind)
  ) {
    issues.push(issue("invalid_value", "commandKind is invalid", "commandKind"));
  }
  if (
    typeof record.actorCategory !== "string" ||
    !ACTOR_CATEGORIES.has(record.actorCategory)
  ) {
    issues.push(issue("invalid_value", "actorCategory is invalid", "actorCategory"));
  }
  for (const key of ["previousStatus", "nextStatus"] as const) {
    if (typeof record[key] !== "string" || !WORKFLOW_STATUSES.has(record[key])) {
      issues.push(issue("invalid_value", `${key} is invalid`, key));
    }
  }
  for (const key of ["previousStepStatus", "nextStepStatus"] as const) {
    if (
      record[key] !== undefined &&
      (typeof record[key] !== "string" || !STEP_STATUSES.has(record[key]))
    ) {
      issues.push(issue("invalid_value", `${key} is invalid`, key));
    }
  }
  if (
    (record.previousStepStatus === undefined) !==
      (record.nextStepStatus === undefined) ||
    (record.stepId === undefined) !== (record.nextStepStatus === undefined)
  ) {
    issues.push(issue("invalid_value", "step transition fields must be provided together", "stepId"));
  }
  if (record.stepId !== undefined) {
    assertSafeIdentifier(record, "stepId", issues);
  }
  if (record.summaryCode !== EVENT_SUMMARY_CODE) {
    issues.push(issue("invalid_value", "summaryCode is invalid", "summaryCode"));
  }
  if (typeof record.occurredAt !== "string" || !isRfc3339Timestamp(record.occurredAt)) {
    issues.push(issue("invalid_format", "occurredAt is invalid", "occurredAt"));
  }
  if (record.nonExecuting !== true) {
    issues.push(issue("unsafe_execution", "event must be non-executing", "nonExecuting"));
  }
}

function withoutSequence(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "sequence"),
  );
}

function assertIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[key] !== "string" || !ID_PATTERN.test(record[key])) {
    issues.push(issue("invalid_format", `${key} is invalid`, key));
  }
}

function assertSafeIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): void {
  assertIdentifier(record, key, issues);
  if (
    typeof record[key] === "string" &&
    SENSITIVE_TEXT_PATTERN.test(record[key])
  ) {
    issues.push(issue("invalid_value", `${key} is invalid`, key));
  }
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      issues.push(issue("unknown_field", "unknown fields are not allowed", key));
    }
  }
}

function issue(
  code: string,
  message: string,
  path: string,
): ValidationIssue {
  return { code, message, path };
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    freeze(entry);
  }
  return value;
}
