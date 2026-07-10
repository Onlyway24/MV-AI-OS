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
import {
  isWorkflowCommandFingerprint,
} from "./workflow-command-fingerprint.js";
import {
  WORKFLOW_RUNTIME_CONTRACT_VERSION,
  type WorkflowCommand,
  type WorkflowCommandReceipt,
  type WorkflowDefinition,
  type WorkflowInstance,
} from "./workflow-runtime.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_TEXT_PATTERN =
  /\b(?:secret|prompt|completion|provider payload|transcript|api[_-]?key)\b|(?:\/Users\/|\/home\/)|\bsk-[A-Za-z0-9_-]{8,}/iu;
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
const COMMAND_KINDS = new Set([
  "ACTIVATE",
  "CANCEL",
  "COMPLETE_STEP",
  "FAIL_STEP",
  "PAUSE",
  "RESUME",
]);
const BLOCKER_CODES = new Set([
  "APPROVAL_REQUIRED",
  "DEPENDENCY_INCOMPLETE",
  "GUARDIAN_REQUIRED",
]);
const STOP_REASONS = new Set([
  "CANCELLED_BY_OPERATOR",
  "FAILED_STEP",
  "NONE",
]);

export class WorkflowDefinitionValidator
  implements Validator<WorkflowDefinition>
{
  public validate(value: unknown): ValidationResult<WorkflowDefinition> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow definition must be an object", "$")]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "definitionId",
        "workflowId",
        "workflowVersion",
        "steps",
        "nonExecuting",
      ],
      issues,
    );
    assertIdentifier(record, "definitionId", issues);
    assertIdentifier(record, "workflowId", issues);
    if (
      typeof record.workflowVersion !== "string" ||
      !isSemanticVersion(record.workflowVersion)
    ) {
      issues.push(
        issue("invalid_format", "workflowVersion must be semantic", "workflowVersion"),
      );
    }
    if (record.contractVersion !== WORKFLOW_RUNTIME_CONTRACT_VERSION) {
      issues.push(
        issue(
          "unsupported_version",
          `contractVersion must be ${WORKFLOW_RUNTIME_CONTRACT_VERSION}`,
          "contractVersion",
        ),
      );
    }
    if (record.nonExecuting !== true) {
      issues.push(
        issue("unsafe_execution", "definition must be non-executing", "nonExecuting"),
      );
    }
    validateDefinitionSteps(record.steps, issues);

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(freeze(value as WorkflowDefinition));
  }
}

export class WorkflowCommandValidator implements Validator<WorkflowCommand> {
  public validate(value: unknown): ValidationResult<WorkflowCommand> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow command must be an object", "$")]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "commandId",
        "expectedVersion",
        "kind",
        "stepId",
        "reasonCode",
        "nonExecuting",
      ],
      issues,
    );
    assertIdentifier(record, "commandId", issues);
    if (
      typeof record.expectedVersion !== "number" ||
      !Number.isSafeInteger(record.expectedVersion) ||
      record.expectedVersion < 0
    ) {
      issues.push(
        issue("invalid_value", "expectedVersion must be a non-negative integer", "expectedVersion"),
      );
    }
    if (typeof record.kind !== "string" || !COMMAND_KINDS.has(record.kind)) {
      issues.push(issue("invalid_value", "command kind is unsupported", "kind"));
    }
    if (
      typeof record.reasonCode !== "string" ||
      !ID_PATTERN.test(record.reasonCode) ||
      SENSITIVE_TEXT_PATTERN.test(record.reasonCode)
    ) {
      issues.push(issue("invalid_value", "reasonCode is invalid", "reasonCode"));
    }
    if (
      record.stepId !== undefined &&
      (typeof record.stepId !== "string" || !ID_PATTERN.test(record.stepId))
    ) {
      issues.push(issue("invalid_format", "stepId is invalid", "stepId"));
    }
    if (record.nonExecuting !== true) {
      issues.push(
        issue("unsafe_execution", "command must be non-executing", "nonExecuting"),
      );
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(freeze(value as WorkflowCommand));
  }
}

export class WorkflowCommandReceiptValidator
  implements Validator<WorkflowCommandReceipt>
{
  public validate(
    value: unknown,
  ): ValidationResult<WorkflowCommandReceipt> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow command receipt must be an object", "$")]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      ["commandId", "fingerprint", "resultingVersion"],
      issues,
    );
    assertIdentifier(record, "commandId", issues);
    if (
      typeof record.fingerprint !== "string" ||
      !isWorkflowCommandFingerprint(record.fingerprint)
    ) {
      issues.push(
        issue("invalid_format", "receipt fingerprint is invalid", "fingerprint"),
      );
    }
    if (
      typeof record.resultingVersion !== "number" ||
      !Number.isSafeInteger(record.resultingVersion) ||
      record.resultingVersion < 1
    ) {
      issues.push(
        issue(
          "invalid_value",
          "receipt resultingVersion must be a positive integer",
          "resultingVersion",
        ),
      );
    }

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(freeze(value as WorkflowCommandReceipt));
  }
}

export class WorkflowInstanceValidator implements Validator<WorkflowInstance> {
  readonly #receiptValidator = new WorkflowCommandReceiptValidator();

  public validate(value: unknown): ValidationResult<WorkflowInstance> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "workflow instance must be an object", "$")]);
    }

    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "definitionId",
        "instanceId",
        "status",
        "steps",
        "version",
        "receipts",
        "createdAt",
        "updatedAt",
        "stopReason",
        "nonExecuting",
      ],
      issues,
    );
    assertIdentifier(record, "definitionId", issues);
    assertIdentifier(record, "instanceId", issues);
    if (record.contractVersion !== WORKFLOW_RUNTIME_CONTRACT_VERSION) {
      issues.push(issue("unsupported_version", "workflow instance contract is invalid", "contractVersion"));
    }
    if (typeof record.status !== "string" || !WORKFLOW_STATUSES.has(record.status)) {
      issues.push(issue("invalid_value", "workflow status is invalid", "status"));
    }
    if (
      typeof record.version !== "number" ||
      !Number.isSafeInteger(record.version) ||
      record.version < 0
    ) {
      issues.push(issue("invalid_value", "version is invalid", "version"));
    }
    const createdAt = assertTimestamp(record, "createdAt", issues);
    const updatedAt = assertTimestamp(record, "updatedAt", issues);
    if (
      createdAt !== undefined &&
      updatedAt !== undefined &&
      Date.parse(updatedAt) < Date.parse(createdAt)
    ) {
      issues.push(issue("invalid_value", "updatedAt must not precede createdAt", "updatedAt"));
    }
    if (record.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "instance must be non-executing", "nonExecuting"));
    }
    validateStepInstances(record.steps, issues);
    validateWorkflowStateSemantics(record.status, record.steps, issues);
    validateReceipts(record.receipts, record.version, this.#receiptValidator, issues);
    validateStopReason(record.status, record.stopReason, issues);

    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(freeze(value as WorkflowInstance));
  }
}

function validateDefinitionSteps(
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("invalid_type", "steps must be a non-empty array", "steps"));
    return;
  }

  const stepIds: string[] = [];
  const dependenciesByStep: {
    readonly dependencies: readonly string[];
    readonly path: string;
    readonly stepId: string;
  }[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `steps[${String(index)}]`;
    const step = asRecord(entry);
    if (step === undefined) {
      issues.push(issue("invalid_type", "step must be an object", path));
      continue;
    }
    assertOnlyKnownKeys(
      step,
      [
        "stepId",
        "dependencies",
        "approvalRequired",
        "guardianRequired",
        "nonExecuting",
      ],
      issues,
      path,
    );
    assertIdentifier(step, "stepId", issues, path);
    if (typeof step.stepId === "string" && ID_PATTERN.test(step.stepId)) {
      stepIds.push(step.stepId);
      if (
        Array.isArray(step.dependencies) &&
        step.dependencies.every(
          (dependency) =>
            typeof dependency === "string" && ID_PATTERN.test(dependency),
        )
      ) {
        dependenciesByStep.push({
          dependencies: step.dependencies,
          path,
          stepId: step.stepId,
        });
      }
    }
    if (
      !Array.isArray(step.dependencies) ||
      step.dependencies.some(
        (dependency) =>
          typeof dependency !== "string" || !ID_PATTERN.test(dependency),
      ) ||
      new Set(step.dependencies).size !== step.dependencies.length
    ) {
      issues.push(
        issue("invalid_type", "dependencies must be unique IDs", `${path}.dependencies`),
      );
    }
    if (typeof step.approvalRequired !== "boolean") {
      issues.push(issue("invalid_type", "approvalRequired must be boolean", `${path}.approvalRequired`));
    }
    if (typeof step.guardianRequired !== "boolean") {
      issues.push(issue("invalid_type", "guardianRequired must be boolean", `${path}.guardianRequired`));
    }
    if (step.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "step must be non-executing", `${path}.nonExecuting`));
    }
  }
  if (new Set(stepIds).size !== stepIds.length) {
    issues.push(issue("duplicate", "step IDs must be unique", "steps"));
  }
  const knownStepIds = new Set(stepIds);
  for (const { dependencies, path, stepId } of dependenciesByStep) {
    for (const dependency of dependencies) {
      if (dependency === stepId) {
        issues.push(
          issue(
            "invalid_value",
            "a step cannot depend on itself",
            `${path}.dependencies`,
          ),
        );
      } else if (!knownStepIds.has(dependency)) {
        issues.push(
          issue(
            "invalid_value",
            "a dependency must reference a declared step",
            `${path}.dependencies`,
          ),
        );
      }
    }
  }
}

function validateWorkflowStateSemantics(
  workflowStatus: unknown,
  steps: unknown,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(steps)) {
    return;
  }
  const statuses = steps.flatMap((entry) => {
    const step = asRecord(entry);
    return typeof step?.status === "string" ? [step.status] : [];
  });
  if (statuses.length !== steps.length || typeof workflowStatus !== "string") {
    return;
  }
  if (
    workflowStatus === "COMPLETED" &&
    !statuses.every((status) => status === "SUCCEEDED")
  ) {
    issues.push(
      issue(
        "invalid_value",
        "a completed workflow must have only succeeded steps",
        "steps",
      ),
    );
  }
  if (workflowStatus === "FAILED" && !statuses.includes("FAILED")) {
    issues.push(
      issue(
        "invalid_value",
        "a failed workflow must have a failed step",
        "steps",
      ),
    );
  }
  if (
    workflowStatus === "CANCELLED" &&
    statuses.some(
      (status) =>
        status !== "CANCELLED" &&
        status !== "FAILED" &&
        status !== "SUCCEEDED",
    )
  ) {
    issues.push(
      issue(
        "invalid_value",
        "a cancelled workflow cannot retain active steps",
        "steps",
      ),
    );
  }
  if (
    (workflowStatus === "ACTIVE" || workflowStatus === "PAUSED") &&
    (statuses.includes("FAILED") ||
      statuses.includes("CANCELLED") ||
      statuses.every((status) => status === "SUCCEEDED"))
  ) {
    issues.push(
      issue(
        "invalid_value",
        "a non-terminal workflow has incompatible step state",
        "steps",
      ),
    );
  }
}

function validateStepInstances(
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue("invalid_type", "step instances must be a non-empty array", "steps"));
    return;
  }

  const stepIds: string[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `steps[${String(index)}]`;
    const step = asRecord(entry);
    if (step === undefined) {
      issues.push(issue("invalid_type", "step instance must be an object", path));
      continue;
    }
    assertOnlyKnownKeys(step, ["stepId", "status", "blockers"], issues, path);
    assertIdentifier(step, "stepId", issues, path);
    if (typeof step.stepId === "string" && ID_PATTERN.test(step.stepId)) {
      stepIds.push(step.stepId);
    }
    if (typeof step.status !== "string" || !STEP_STATUSES.has(step.status)) {
      issues.push(issue("invalid_value", "step status is invalid", `${path}.status`));
    }
    validateBlockers(step, path, issues);
  }
  if (new Set(stepIds).size !== stepIds.length) {
    issues.push(issue("duplicate", "step instance IDs must be unique", "steps"));
  }
}

function validateBlockers(
  step: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(step.blockers)) {
    issues.push(issue("invalid_type", "blockers must be an array", `${path}.blockers`));
    return;
  }

  const blockerKeys: string[] = [];
  for (const [index, entry] of step.blockers.entries()) {
    const blockerPath = `${path}.blockers[${String(index)}]`;
    const blocker = asRecord(entry);
    if (blocker === undefined) {
      issues.push(issue("invalid_type", "blocker must be an object", blockerPath));
      continue;
    }
    assertOnlyKnownKeys(blocker, ["code", "stepId"], issues, blockerPath);
    if (typeof blocker.code !== "string" || !BLOCKER_CODES.has(blocker.code)) {
      issues.push(issue("invalid_value", "blocker code is invalid", `${blockerPath}.code`));
    }
    assertIdentifier(blocker, "stepId", issues, blockerPath);
    if (typeof blocker.code === "string" && typeof blocker.stepId === "string") {
      blockerKeys.push(`${blocker.code}:${blocker.stepId}`);
    }
  }
  if (new Set(blockerKeys).size !== blockerKeys.length) {
    issues.push(issue("duplicate", "blockers must be unique", `${path}.blockers`));
  }
}

function validateReceipts(
  value: unknown,
  version: unknown,
  validator: Validator<WorkflowCommandReceipt>,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue("invalid_type", "receipts must be an array", "receipts"));
    return;
  }
  const commandIds: string[] = [];
  const versions: number[] = [];
  for (const [index, entry] of value.entries()) {
    const validation = validator.validate(entry);
    if (!validation.ok) {
      issues.push(
        issue("invalid_value", "receipt is invalid", `receipts[${String(index)}]`),
      );
      continue;
    }
    commandIds.push(validation.value.commandId);
    versions.push(validation.value.resultingVersion);
  }
  if (new Set(commandIds).size !== commandIds.length) {
    issues.push(issue("duplicate", "receipt command IDs must be unique", "receipts"));
  }
  if (new Set(versions).size !== versions.length) {
    issues.push(issue("duplicate", "receipt resulting versions must be unique", "receipts"));
  }
  if (typeof version === "number" && Number.isSafeInteger(version)) {
    if (value.length !== version) {
      issues.push(issue("invalid_value", "receipt count must equal workflow version", "receipts"));
    }
    for (const [index, resultingVersion] of versions.entries()) {
      if (resultingVersion !== index + 1) {
        issues.push(issue("invalid_value", "receipts must be ordered by resulting version", "receipts"));
        break;
      }
    }
  }
}

function validateStopReason(
  status: unknown,
  stopReason: unknown,
  issues: ValidationIssue[],
): void {
  if (typeof stopReason !== "string" || !STOP_REASONS.has(stopReason)) {
    issues.push(issue("invalid_value", "stopReason is invalid", "stopReason"));
    return;
  }
  const expected =
    status === "CANCELLED"
      ? "CANCELLED_BY_OPERATOR"
      : status === "FAILED"
        ? "FAILED_STEP"
        : "NONE";
  if (stopReason !== expected) {
    issues.push(issue("invalid_value", "stopReason does not match workflow status", "stopReason"));
  }
}

function assertTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: "createdAt" | "updatedAt",
  issues: ValidationIssue[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || !isRfc3339Timestamp(value)) {
    issues.push(issue("invalid_format", "timestamp is invalid", key));
    return undefined;
  }
  return value;
}

function assertIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  prefix = "",
): void {
  if (
    typeof record[key] !== "string" ||
    !ID_PATTERN.test(record[key]) ||
    SENSITIVE_TEXT_PATTERN.test(record[key])
  ) {
    issues.push(issue("invalid_format", `${key} is invalid`, prefix === "" ? key : `${prefix}.${key}`));
  }
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  issues: ValidationIssue[],
  prefix = "",
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      issues.push(issue("unknown_field", "unknown fields are not allowed", prefix === "" ? key : `${prefix}.${key}`));
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
