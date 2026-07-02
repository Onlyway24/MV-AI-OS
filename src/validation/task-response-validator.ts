import type {
  ApprovalReference,
  TaskResponse,
  TaskResponseStatus,
  WorkflowResult,
  WorkflowResultStatus,
} from "../contracts/task-response.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readErrorRecord } from "./error-record-reader.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const RESPONSE_STATUSES = new Set<TaskResponseStatus>([
  "awaiting_approval",
  "cancelled",
  "completed",
  "failed",
  "needs_input",
]);
const APPROVAL_STATES = new Set<ApprovalReference["state"]>([
  "approved",
  "cancelled",
  "expired",
  "pending",
  "rejected",
]);
const WORKFLOW_STATUSES = new Set<WorkflowResultStatus>([
  "accepted",
  "failed",
  "running",
  "succeeded",
  "unknown",
]);

export class TaskResponseValidator implements Validator<TaskResponse> {
  public validate(value: unknown): ValidationResult<TaskResponse> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "task response must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const requestId = readRequiredString(record, "requestId", issues);
    const taskId = readRequiredString(record, "taskId", issues);
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const status = readRequiredString(record, "status", issues);
    const result = readOptionalJsonObject(record, "result", issues);
    const workflow = readWorkflowResult(record.workflow, "workflow", issues);
    const approvals = readApprovals(record.approvals, "approvals", issues);
    const warnings = readRequiredStringArray(record, "warnings", issues);
    const error = readErrorRecord(record.error, "error", issues);
    const createdAt = readRequiredString(record, "createdAt", issues);
    const updatedAt = readRequiredString(record, "updatedAt", issues);

    if (
      contractVersion !== undefined &&
      contractVersion !== REQUEST_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }

    if (
      status !== undefined &&
      !RESPONSE_STATUSES.has(status as TaskResponseStatus)
    ) {
      issues.push({
        code: "invalid_value",
        message: "status is not supported",
        path: "status",
      });
    }

    validateTimestamp(createdAt, "createdAt", issues);
    validateTimestamp(updatedAt, "updatedAt", issues);

    if (status === "completed" && result === undefined) {
      issues.push({
        code: "required",
        message: "result is required when status is completed",
        path: "result",
      });
    }

    if (status !== undefined && status !== "completed" && result !== undefined) {
      issues.push({
        code: "forbidden",
        message: "result is only allowed when status is completed",
        path: "result",
      });
    }

    if (status === "failed" && error === undefined) {
      issues.push({
        code: "required",
        message: "error is required when status is failed",
        path: "error",
      });
    }

    if (status !== undefined && status !== "failed" && error !== undefined) {
      issues.push({
        code: "forbidden",
        message: "error is only allowed when status is failed",
        path: "error",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      requestId === undefined ||
      taskId === undefined ||
      correlationId === undefined ||
      status === undefined ||
      approvals === undefined ||
      warnings === undefined ||
      createdAt === undefined ||
      updatedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      approvals,
      contractVersion,
      correlationId,
      createdAt,
      ...(error === undefined ? {} : { error }),
      requestId,
      ...(result === undefined ? {} : { result }),
      status: status as TaskResponseStatus,
      taskId,
      updatedAt,
      warnings,
      ...(workflow === undefined ? {} : { workflow }),
    });
  }
}

function readApprovals(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly ApprovalReference[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const approvals: ApprovalReference[] = [];
  for (const [index, candidate] of (value as readonly unknown[]).entries()) {
    const itemPath = `${path}[${String(index)}]`;
    const record = asRecord(candidate);
    if (record === undefined) {
      issues.push({
        code: "invalid_type",
        message: `${itemPath} must be an object`,
        path: itemPath,
      });
      continue;
    }

    const approvalId = readRequiredString(
      record,
      "approvalId",
      issues,
      itemPath,
    );
    const state = readRequiredString(record, "state", issues, itemPath);
    if (
      state !== undefined &&
      !APPROVAL_STATES.has(state as ApprovalReference["state"])
    ) {
      issues.push({
        code: "invalid_value",
        message: `${itemPath}.state is not supported`,
        path: `${itemPath}.state`,
      });
    }

    if (
      approvalId !== undefined &&
      state !== undefined &&
      APPROVAL_STATES.has(state as ApprovalReference["state"])
    ) {
      approvals.push({
        approvalId,
        state: state as ApprovalReference["state"],
      });
    }
  }

  return approvals;
}

function readWorkflowResult(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkflowResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const workflowRequestId = readRequiredString(
    record,
    "workflowRequestId",
    issues,
    path,
  );
  const workflowRunId = readOptionalString(
    record,
    "workflowRunId",
    issues,
    path,
  );
  const status = readRequiredString(record, "status", issues, path);
  const output = readOptionalJsonObject(record, "output", issues, path);
  const externalRefs = readOptionalStringArray(
    record,
    "externalRefs",
    issues,
    path,
  );
  const error = readErrorRecord(record.error, `${path}.error`, issues);
  const updatedAt = readRequiredString(record, "updatedAt", issues, path);

  if (
    status !== undefined &&
    !WORKFLOW_STATUSES.has(status as WorkflowResultStatus)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.status is not supported`,
      path: `${path}.status`,
    });
  }
  validateTimestamp(updatedAt, `${path}.updatedAt`, issues);

  if (
    workflowRequestId === undefined ||
    status === undefined ||
    updatedAt === undefined ||
    !WORKFLOW_STATUSES.has(status as WorkflowResultStatus)
  ) {
    return undefined;
  }

  return {
    ...(error === undefined ? {} : { error }),
    ...(externalRefs === undefined ? {} : { externalRefs }),
    ...(output === undefined ? {} : { output }),
    status: status as WorkflowResultStatus,
    updatedAt,
    workflowRequestId,
    ...(workflowRunId === undefined ? {} : { workflowRunId }),
  };
}

function readOptionalStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  path: string,
): readonly string[] | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredStringArray(record, key, issues, path);
}

function validateTimestamp(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path} must be a UTC RFC 3339 timestamp`,
      path,
    });
  }
}
