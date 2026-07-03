import {
  STORED_REQUEST_SCHEMA_VERSION,
  type StoredRequest,
} from "../persistence/request-repository.js";
import { TaskResponseValidator } from "./task-response-validator.js";
import {
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

const REQUEST_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

export class StoredRequestValidator implements Validator<StoredRequest> {
  readonly #responseValidator = new TaskResponseValidator();

  public validate(value: unknown): ValidationResult<StoredRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "stored request must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const requestId = readRequiredString(record, "requestId", issues);
    const taskId = readRequiredString(record, "taskId", issues);
    const requestFingerprint = readRequiredString(
      record,
      "requestFingerprint",
      issues,
    );
    const responseValidation =
      record.response === undefined
        ? undefined
        : this.#responseValidator.validate(record.response);
    if (responseValidation?.ok === false) {
      issues.push(
        ...responseValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "response" : `response.${path}`,
        })),
      );
    }
    const createdAt = readRequiredString(record, "createdAt", issues);
    const updatedAt = readRequiredString(record, "updatedAt", issues);

    if (
      schemaVersion !== undefined &&
      schemaVersion !== STORED_REQUEST_SCHEMA_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `schemaVersion must be ${STORED_REQUEST_SCHEMA_VERSION}`,
        path: "schemaVersion",
      });
    }
    if (
      requestFingerprint !== undefined &&
      !REQUEST_FINGERPRINT_PATTERN.test(requestFingerprint)
    ) {
      issues.push({
        code: "invalid_format",
        message: "requestFingerprint must be a lowercase SHA-256 digest",
        path: "requestFingerprint",
      });
    }
    validateTimestamp(createdAt, "createdAt", issues);
    validateTimestamp(updatedAt, "updatedAt", issues);
    if (
      createdAt !== undefined &&
      updatedAt !== undefined &&
      Date.parse(updatedAt) < Date.parse(createdAt)
    ) {
      issues.push({
        code: "invalid_order",
        message: "updatedAt must not precede createdAt",
        path: "updatedAt",
      });
    }
    if (
      responseValidation?.ok === true &&
      (responseValidation.value.requestId !== requestId ||
        responseValidation.value.taskId !== taskId ||
        responseValidation.value.updatedAt !== updatedAt)
    ) {
      issues.push({
        code: "ownership_mismatch",
        message: "response identity and timestamp must match the stored request",
        path: "response",
      });
    }

    if (
      issues.length > 0 ||
      schemaVersion !== STORED_REQUEST_SCHEMA_VERSION ||
      requestId === undefined ||
      taskId === undefined ||
      requestFingerprint === undefined ||
      responseValidation?.ok === false ||
      createdAt === undefined ||
      updatedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      createdAt,
      requestFingerprint,
      requestId,
      ...(responseValidation?.ok === true
        ? { response: responseValidation.value }
        : {}),
      schemaVersion,
      taskId,
      updatedAt,
    });
  }
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
