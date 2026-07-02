import {
  REQUEST_CONTRACT_VERSION,
  type RequestEnvelope,
  type RequestSource,
} from "../contracts/request-envelope.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredJsonObject,
  readRequiredString,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const REQUEST_SOURCES = new Set<RequestSource>([
  "api",
  "dashboard",
  "local",
  "schedule",
  "webhook",
]);

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TASK_TYPE_LENGTH = 128;
const MAX_INSTRUCTION_LENGTH = 100_000;

export class RequestEnvelopeValidator implements Validator<RequestEnvelope> {
  public validate(value: unknown): ValidationResult<RequestEnvelope> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "request must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
      "",
      { maxLength: 16 },
    );
    const requestId = readRequiredString(record, "requestId", issues, "", {
      maxLength: MAX_IDENTIFIER_LENGTH,
    });
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
      "",
      { maxLength: MAX_IDENTIFIER_LENGTH },
    );
    const workspaceId = readRequiredString(
      record,
      "workspaceId",
      issues,
      "",
      { maxLength: MAX_IDENTIFIER_LENGTH },
    );
    const actorId = readRequiredString(record, "actorId", issues, "", {
      maxLength: MAX_IDENTIFIER_LENGTH,
    });
    const sessionId = readOptionalString(record, "sessionId", issues, "", {
      maxLength: MAX_IDENTIFIER_LENGTH,
    });
    const receivedAt = readRequiredString(record, "receivedAt", issues);
    const source = readRequiredString(record, "source", issues);
    const taskType = readRequiredString(record, "taskType", issues, "", {
      maxLength: MAX_TASK_TYPE_LENGTH,
    });
    const instruction = readRequiredString(
      record,
      "instruction",
      issues,
      "",
      { maxLength: MAX_INSTRUCTION_LENGTH },
    );
    const input = readOptionalJsonObject(record, "input", issues);
    const constraints = readOptionalJsonObject(record, "constraints", issues);
    const requestedOutput = readRequiredJsonObject(
      record,
      "requestedOutput",
      issues,
    );
    const requestedWorkflow = readOptionalJsonObject(
      record,
      "requestedWorkflow",
      issues,
    );

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

    if (receivedAt !== undefined && !isRfc3339Timestamp(receivedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "receivedAt must be a UTC RFC 3339 timestamp",
        path: "receivedAt",
      });
    }

    if (
      source !== undefined &&
      !REQUEST_SOURCES.has(source as RequestSource)
    ) {
      issues.push({
        code: "invalid_value",
        message: "source is not supported",
        path: "source",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      requestId === undefined ||
      correlationId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      receivedAt === undefined ||
      source === undefined ||
      taskType === undefined ||
      instruction === undefined ||
      requestedOutput === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      contractVersion,
      correlationId,
      ...(constraints === undefined ? {} : { constraints }),
      ...(input === undefined ? {} : { input }),
      instruction,
      receivedAt,
      requestedOutput,
      ...(requestedWorkflow === undefined ? {} : { requestedWorkflow }),
      requestId,
      ...(sessionId === undefined ? {} : { sessionId }),
      source: source as RequestSource,
      taskType,
      workspaceId,
    });
  }
}
