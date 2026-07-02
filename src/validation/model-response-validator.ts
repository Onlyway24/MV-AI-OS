import type {
  ModelOutput,
  ModelProviderReference,
  ModelResponse,
} from "../models/model-response.js";
import type { ModelError } from "../models/model-error.js";
import type { ModelUsage } from "../models/model-usage.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalJsonObject,
  readRequiredJsonObject,
  readRequiredString,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  readModelError,
  readModelProviderReference,
  readModelUsage,
} from "./model-contract-readers.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

export class ModelResponseValidator implements Validator<ModelResponse> {
  public validate(value: unknown): ValidationResult<ModelResponse> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model response must be an object",
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
    const modelRequestId = readRequiredString(
      record,
      "modelRequestId",
      issues,
    );
    const status = readRequiredString(record, "status", issues);
    const completedAt = readRequiredString(record, "completedAt", issues);
    const provider =
      record.provider === undefined
        ? undefined
        : readModelProviderReference(record.provider, "provider", issues);
    const output =
      record.output === undefined
        ? undefined
        : readOutput(record.output, "output", issues);
    const usage =
      record.usage === undefined
        ? undefined
        : readModelUsage(record.usage, "usage", issues);
    const error =
      record.error === undefined
        ? undefined
        : readModelError(record.error, "error", issues);

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
    validateConditionalFields(
      status,
      provider,
      output,
      usage,
      error,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      modelRequestId === undefined ||
      (status !== "failed" && status !== "succeeded") ||
      completedAt === undefined
    ) {
      return validationFailure(issues);
    }

    if (status === "succeeded") {
      if (provider === undefined || output === undefined || usage === undefined) {
        return validationFailure(issues);
      }
      return validationSuccess({
        completedAt,
        contractVersion,
        modelRequestId,
        output,
        provider,
        status,
        usage,
      });
    }
    if (error === undefined) {
      return validationFailure(issues);
    }
    return validationSuccess({
      completedAt,
      contractVersion,
      error,
      modelRequestId,
      ...(provider === undefined ? {} : { provider }),
      status,
      ...(usage === undefined ? {} : { usage }),
    });
  }
}

function readOutput(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelOutput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const format = readRequiredString(record, "format", issues, path);
  if (format === "text") {
    const text = readRequiredString(record, "text", issues, path, {
      allowEmpty: true,
    });
    return text === undefined ? undefined : { format, text };
  }
  if (format === "json") {
    const json = readRequiredJsonObject(record, "value", issues, path);
    return json === undefined ? undefined : { format, value: json };
  }

  if (format !== undefined) {
    issues.push({
      code: "invalid_value",
      message: `${path}.format is not supported`,
      path: `${path}.format`,
    });
  }
  readOptionalJsonObject(record, "value", issues, path);
  return undefined;
}

function validateConditionalFields(
  status: string | undefined,
  provider: ModelProviderReference | undefined,
  output: ModelOutput | undefined,
  usage: ModelUsage | undefined,
  error: ModelError | undefined,
  issues: ValidationIssue[],
): void {
  if (status === "succeeded") {
    requireValue(provider, "provider", "succeeded", issues);
    requireValue(output, "output", "succeeded", issues);
    requireValue(usage, "usage", "succeeded", issues);
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
