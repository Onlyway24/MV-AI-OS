import type { MainAssistantSafetyDomain } from "../../assistants/main-assistant-specification.js";
import { asRecord, isRfc3339Timestamp, isSemanticVersion } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import {
  WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION,
  freezeWorkflowControlCheckpointValue,
  type WorkflowApprovalCheckpoint,
  type WorkflowControlCheckpointEvent,
  type WorkflowControlCheckpointEventDraft,
  type WorkflowGuardianCheckpoint,
} from "./workflow-control-checkpoint.js";

export const MAX_WORKFLOW_CONTROL_CHECKPOINT_IDENTIFIER_LENGTH = 128;
export const MAX_WORKFLOW_CONTROL_CHECKPOINT_VERSION = 1_000;
export const MAX_WORKFLOW_CONTROL_CHECKPOINT_EVENTS = 100;

const ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_PATTERN =
  /\b(?:secret|prompt|completion|provider[-_ ]?payload|raw[-_ ]?(?:knowledge|memory|transcript)|transcript|api[_-]?key)\b|(?:\/Users\/|\/home\/)|\bsk-[A-Za-z0-9_-]{8,}/iu;
const APPROVAL_STATUSES = new Set(["APPROVED", "EXPIRED", "REJECTED", "WITHDRAWN"]);
const GUARDIAN_STATUSES = new Set(["BLOCKED", "CLEAR", "EXPIRED", "WITHDRAWN"]);
const ALL_STATUSES = new Set([...APPROVAL_STATUSES, ...GUARDIAN_STATUSES]);
const DOMAINS = new Set<MainAssistantSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
]);

export class WorkflowApprovalCheckpointValidator
  implements Validator<WorkflowApprovalCheckpoint>
{
  public validate(value: unknown): ValidationResult<WorkflowApprovalCheckpoint> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "approval checkpoint must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    knownKeys(record, ["authorityActorId", "contractVersion", "definitionId", "evidenceId", "instanceId", "instanceVersion", "nonExecuting", "recordedAt", "scope", "status", "stepId", "supersedesEvidenceId", "workflowVersion"], issues);
    commonCheckpoint(record, issues);
    safeId(record.authorityActorId, "authorityActorId", issues);
    enumValue(record.status, APPROVAL_STATUSES, "status", issues);
    if (record.scope !== "STEP_CANDIDATE_PREPARATION") {
      issues.push(issue("invalid_value", "approval scope is invalid", "scope"));
    }
    return finish(value, issues);
  }
}

export class WorkflowGuardianCheckpointValidator
  implements Validator<WorkflowGuardianCheckpoint>
{
  public validate(value: unknown): ValidationResult<WorkflowGuardianCheckpoint> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "Guardian checkpoint must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    knownKeys(record, ["contractVersion", "definitionId", "domain", "evidenceId", "guardianId", "instanceId", "instanceVersion", "nonExecuting", "recordedAt", "status", "stepId", "supersedesEvidenceId", "workflowVersion"], issues);
    commonCheckpoint(record, issues);
    safeId(record.guardianId, "guardianId", issues);
    enumValue(record.domain, DOMAINS, "domain", issues);
    enumValue(record.status, GUARDIAN_STATUSES, "status", issues);
    return finish(value, issues);
  }
}

export class WorkflowControlCheckpointEventDraftValidator
  implements Validator<WorkflowControlCheckpointEventDraft>
{
  public validate(value: unknown): ValidationResult<WorkflowControlCheckpointEventDraft> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "checkpoint event must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    knownKeys(record, ["checkpointId", "checkpointKind", "contractVersion", "eventId", "instanceId", "instanceVersion", "nonExecuting", "occurredAt", "status", "stepId", "summaryCode"], issues);
    contract(record.contractVersion, issues);
    for (const key of ["checkpointId", "eventId", "instanceId", "stepId"] as const) {
      safeId(record[key], key, issues);
    }
    integer(record.instanceVersion, "instanceVersion", issues);
    timestamp(record.occurredAt, "occurredAt", issues);
    enumValue(record.checkpointKind, new Set(["APPROVAL", "GUARDIAN"]), "checkpointKind", issues);
    enumValue(record.status, ALL_STATUSES, "status", issues);
    if (record.summaryCode !== "workflow_control_checkpoint_recorded") {
      issues.push(issue("invalid_value", "event summaryCode is invalid", "summaryCode"));
    }
    if (record.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "checkpoint event must be non-executing", "nonExecuting"));
    }
    if (
      record.checkpointKind === "APPROVAL" &&
      typeof record.status === "string" &&
      !APPROVAL_STATUSES.has(record.status)
    ) {
      issues.push(issue("invalid_value", "approval event status is invalid", "status"));
    }
    if (
      record.checkpointKind === "GUARDIAN" &&
      typeof record.status === "string" &&
      !GUARDIAN_STATUSES.has(record.status)
    ) {
      issues.push(issue("invalid_value", "Guardian event status is invalid", "status"));
    }
    return finish(value, issues);
  }
}

export class WorkflowControlCheckpointEventValidator
  implements Validator<WorkflowControlCheckpointEvent>
{
  readonly #draft = new WorkflowControlCheckpointEventDraftValidator();

  public validate(value: unknown): ValidationResult<WorkflowControlCheckpointEvent> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "checkpoint event must be an object", "$")]);
    }
    const draft = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "sequence"),
    );
    const validation = this.#draft.validate(draft);
    const issues = validation.ok ? [] : [...validation.issues];
    knownKeys(record, ["checkpointId", "checkpointKind", "contractVersion", "eventId", "instanceId", "instanceVersion", "nonExecuting", "occurredAt", "sequence", "status", "stepId", "summaryCode"], issues);
    integer(record.sequence, "sequence", issues, 1);
    return finish(value, issues);
  }
}

function commonCheckpoint(record: Readonly<Record<string, unknown>>, issues: ValidationIssue[]): void {
  contract(record.contractVersion, issues);
  for (const key of ["definitionId", "evidenceId", "instanceId", "stepId"] as const) {
    safeId(record[key], key, issues);
  }
  if (record.supersedesEvidenceId !== undefined) {
    safeId(record.supersedesEvidenceId, "supersedesEvidenceId", issues);
    if (record.supersedesEvidenceId === record.evidenceId) {
      issues.push(issue("invalid_value", "checkpoint cannot supersede itself", "supersedesEvidenceId"));
    }
  }
  integer(record.instanceVersion, "instanceVersion", issues);
  timestamp(record.recordedAt, "recordedAt", issues);
  if (typeof record.workflowVersion !== "string" || !isSemanticVersion(record.workflowVersion)) {
    issues.push(issue("invalid_format", "workflowVersion must be semantic", "workflowVersion"));
  }
  if (record.nonExecuting !== true) {
    issues.push(issue("unsafe_execution", "checkpoint must be non-executing", "nonExecuting"));
  }
}

function finish<T>(value: unknown, issues: readonly ValidationIssue[]): ValidationResult<T> {
  return issues.length > 0
    ? validationFailure(issues)
    : validationSuccess(
        freezeWorkflowControlCheckpointValue(structuredClone(value as T)),
      );
}

function knownKeys(record: Readonly<Record<string, unknown>>, allowedKeys: readonly string[], issues: ValidationIssue[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push(issue("unknown_field", "unsupported field", key));
    }
  }
}

function contract(value: unknown, issues: ValidationIssue[]): void {
  if (value !== WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION) {
    issues.push(issue("unsupported_version", "contract version is unsupported", "contractVersion"));
  }
}

function safeId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length > MAX_WORKFLOW_CONTROL_CHECKPOINT_IDENTIFIER_LENGTH || !ID_PATTERN.test(value) || SENSITIVE_PATTERN.test(value)) {
    issues.push(issue("invalid_identifier", "identifier is invalid or unsafe", path));
  }
}

function integer(value: unknown, path: string, issues: ValidationIssue[], minimum = 0): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > MAX_WORKFLOW_CONTROL_CHECKPOINT_VERSION) {
    issues.push(issue("invalid_value", `${path} is outside supported bounds`, path));
  }
}

function timestamp(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !isRfc3339Timestamp(value)) {
    issues.push(issue("invalid_timestamp", `${path} must be RFC 3339`, path));
  }
}

function enumValue(value: unknown, allowed: ReadonlySet<string>, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    issues.push(issue("invalid_value", `${path} is unsupported`, path));
  }
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}
