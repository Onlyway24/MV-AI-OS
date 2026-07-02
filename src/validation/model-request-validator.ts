import type {
  ModelMessage,
  ModelMessageRole,
  ModelRequest,
  ModelRequestLimits,
  ModelRequestOutput,
} from "../models/model-request.js";
import type { ModelOutputFormat } from "../models/model-profile.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalJsonObject,
  readOptionalNumber,
  readRequiredInteger,
  readRequiredString,
} from "./field-readers.js";
import { asRecord } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const MESSAGE_ROLES = new Set<ModelMessageRole>([
  "assistant",
  "system",
  "user",
]);
const OUTPUT_FORMATS = new Set<ModelOutputFormat>(["json", "text"]);
const MAX_MESSAGES = 128;
const MAX_MESSAGE_CHARACTERS = 100_000;

export class ModelRequestValidator implements Validator<ModelRequest> {
  public validate(value: unknown): ValidationResult<ModelRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model request must be an object",
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
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const taskId = readRequiredString(record, "taskId", issues);
    const invocationId = readRequiredString(record, "invocationId", issues);
    const modelProfile = readRequiredString(
      record,
      "modelProfile",
      issues,
    );
    const messages = readMessages(record.messages, "messages", issues);
    const output = readOutput(record.output, "output", issues);
    const limits = readLimits(record.limits, "limits", issues);
    const metadata = readOptionalJsonObject(record, "metadata", issues);

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
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      modelRequestId === undefined ||
      correlationId === undefined ||
      taskId === undefined ||
      invocationId === undefined ||
      modelProfile === undefined ||
      messages === undefined ||
      output === undefined ||
      limits === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      correlationId,
      invocationId,
      limits,
      messages,
      ...(metadata === undefined ? {} : { metadata }),
      modelProfile,
      modelRequestId,
      output,
      taskId,
    });
  }
}

function readMessages(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly ModelMessage[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const entries: readonly unknown[] = value;
  if (entries.length === 0 || entries.length > MAX_MESSAGES) {
    issues.push({
      code: entries.length === 0 ? "empty" : "too_large",
      message: `${path} must contain between 1 and ${String(MAX_MESSAGES)} messages`,
      path,
    });
  }

  const messages: ModelMessage[] = [];
  for (const [index, candidate] of entries.entries()) {
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

    const role = readRequiredString(record, "role", issues, itemPath);
    const content = readRequiredString(
      record,
      "content",
      issues,
      itemPath,
      { maxLength: MAX_MESSAGE_CHARACTERS },
    );
    if (
      role !== undefined &&
      !MESSAGE_ROLES.has(role as ModelMessageRole)
    ) {
      issues.push({
        code: "invalid_value",
        message: `${itemPath}.role is not supported`,
        path: `${itemPath}.role`,
      });
    }
    if (
      role !== undefined &&
      MESSAGE_ROLES.has(role as ModelMessageRole) &&
      content !== undefined
    ) {
      messages.push({
        content,
        role: role as ModelMessageRole,
      });
    }
  }

  return messages;
}

function readOutput(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelRequestOutput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const format = readRequiredString(record, "format", issues, path);
  const schema = readOptionalJsonObject(record, "schema", issues, path);
  if (
    format !== undefined &&
    !OUTPUT_FORMATS.has(format as ModelOutputFormat)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.format is not supported`,
      path: `${path}.format`,
    });
  }
  if (format === "json" && schema === undefined) {
    issues.push({
      code: "required",
      message: `${path}.schema is required for JSON output`,
      path: `${path}.schema`,
    });
  }
  if (format === "text" && schema !== undefined) {
    issues.push({
      code: "forbidden",
      message: `${path}.schema is only allowed for JSON output`,
      path: `${path}.schema`,
    });
  }

  if (
    format === undefined ||
    !OUTPUT_FORMATS.has(format as ModelOutputFormat)
  ) {
    return undefined;
  }
  return {
    format: format as ModelOutputFormat,
    ...(schema === undefined ? {} : { schema }),
  };
}

function readLimits(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelRequestLimits | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const timeoutMs = readRequiredInteger(
    record,
    "timeoutMs",
    issues,
    path,
    1,
  );
  const maxOutputTokens = readRequiredInteger(
    record,
    "maxOutputTokens",
    issues,
    path,
    1,
  );
  const maxCostUsd = readOptionalNumber(
    record,
    "maxCostUsd",
    issues,
    path,
  );

  if (timeoutMs === undefined || maxOutputTokens === undefined) {
    return undefined;
  }
  return {
    ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
    maxOutputTokens,
    timeoutMs,
  };
}
