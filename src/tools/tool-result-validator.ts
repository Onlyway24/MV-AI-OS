import type { ToolResult } from "./tool-result.js";
import { isToolIdentifier } from "./tool-validation.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readErrorRecord } from "../validation/error-record-reader.js";
import {
  readRequiredJsonObject,
  readRequiredString,
} from "../validation/field-readers.js";
import {
  asRecord,
  isRfc3339Timestamp,
  isSemanticVersion,
} from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class ToolResultValidator implements Validator<ToolResult> {
  public validate(value: unknown): ValidationResult<ToolResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "tool result must be an object",
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
    const toolInvocationId = readRequiredString(
      record,
      "toolInvocationId",
      issues,
    );
    const toolId = readRequiredString(record, "toolId", issues);
    const toolVersion = readRequiredString(
      record,
      "toolVersion",
      issues,
    );
    const status = readRequiredString(record, "status", issues);
    const completedAt = readRequiredString(record, "completedAt", issues);
    const output =
      record.output === undefined
        ? undefined
        : readRequiredJsonObject(record, "output", issues);
    const error =
      record.error === undefined
        ? undefined
        : readErrorRecord(record.error, "error", issues);

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
    if (toolId !== undefined && !isToolIdentifier(toolId)) {
      issues.push({
        code: "invalid_format",
        message: "toolId must be a lowercase identifier",
        path: "toolId",
      });
    }
    if (
      toolVersion !== undefined &&
      !isSemanticVersion(toolVersion)
    ) {
      issues.push({
        code: "invalid_format",
        message: "toolVersion must use semantic versioning",
        path: "toolVersion",
      });
    }
    if (status !== undefined && status !== "failed" && status !== "succeeded") {
      issues.push({
        code: "invalid_value",
        message: "status is not supported",
        path: "status",
      });
    }
    if (completedAt !== undefined && !isRfc3339Timestamp(completedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "completedAt must be a UTC RFC 3339 timestamp",
        path: "completedAt",
      });
    }
    validateConditionalFields(status, output, error, issues);

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      toolInvocationId === undefined ||
      toolId === undefined ||
      toolVersion === undefined ||
      (status !== "failed" && status !== "succeeded") ||
      completedAt === undefined
    ) {
      return validationFailure(issues);
    }
    if (status === "succeeded") {
      return output === undefined
        ? validationFailure(issues)
        : validationSuccess({
            completedAt,
            contractVersion,
            output,
            status,
            toolId,
            toolInvocationId,
            toolVersion,
          });
    }
    return error === undefined
      ? validationFailure(issues)
      : validationSuccess({
          completedAt,
          contractVersion,
          error,
          status,
          toolId,
          toolInvocationId,
          toolVersion,
        });
  }
}

function validateConditionalFields(
  status: string | undefined,
  output: Readonly<Record<string, unknown>> | undefined,
  error: unknown,
  issues: ValidationIssue[],
): void {
  if (status === "succeeded") {
    requireValue(output, "output", "succeeded", issues);
    forbidValue(error, "error", "succeeded", issues);
  }
  if (status === "failed") {
    requireValue(error, "error", "failed", issues);
    forbidValue(output, "output", "failed", issues);
  }
}

function requireValue(
  value: unknown,
  path: string,
  status: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    issues.push({
      code: "required",
      message: `${path} is required when status is ${status}`,
      path,
    });
  }
}

function forbidValue(
  value: unknown,
  path: string,
  status: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined) {
    issues.push({
      code: "forbidden",
      message: `${path} is not allowed when status is ${status}`,
      path,
    });
  }
}
