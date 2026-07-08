import { isAbsolute } from "node:path";

import {
  MAX_SECRET_REFERENCE_LENGTH,
  SECRET_REFERENCE_CONTRACT_VERSION,
  type SecretReference,
  type SecretReferenceSource,
} from "./secret-reference.js";
import { readRequiredString } from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const SECRET_ID_PATTERN = /^[a-z][a-z0-9._:-]{2,127}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/u;
const SECRET_SOURCES = new Set<SecretReferenceSource>([
  "environment",
  "local-file",
]);
const ENVIRONMENT_KEYS = new Set([
  "contractVersion",
  "secretId",
  "source",
  "variableName",
]);
const LOCAL_FILE_KEYS = new Set([
  "contractVersion",
  "encoding",
  "path",
  "secretId",
  "source",
]);

export class SecretReferenceValidator
  implements Validator<SecretReference>
{
  public validate(value: unknown): ValidationResult<SecretReference> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "secret reference must be an object",
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
    const secretId = readRequiredString(record, "secretId", issues, "", {
      maxLength: MAX_SECRET_REFERENCE_LENGTH,
    });
    const source = readRequiredString(record, "source", issues);

    if (
      contractVersion !== undefined &&
      contractVersion !== SECRET_REFERENCE_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${SECRET_REFERENCE_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (secretId !== undefined && !SECRET_ID_PATTERN.test(secretId)) {
      issues.push({
        code: "invalid_format",
        message:
          "secretId must be a lowercase opaque identifier without secret material",
        path: "secretId",
      });
    }
    if (
      source !== undefined &&
      !SECRET_SOURCES.has(source as SecretReferenceSource)
    ) {
      issues.push({
        code: "invalid_value",
        message: "source is not supported",
        path: "source",
      });
    }

    if (source === "environment") {
      return this.#validateEnvironment(
        record,
        contractVersion,
        secretId,
        issues,
      );
    }
    if (source === "local-file") {
      return this.#validateLocalFile(
        record,
        contractVersion,
        secretId,
        issues,
      );
    }

    rejectUnknownKeys(record, new Set(["contractVersion", "secretId", "source"]), issues);
    return validationFailure(issues);
  }

  #validateEnvironment(
    record: Readonly<Record<string, unknown>>,
    contractVersion: string | undefined,
    secretId: string | undefined,
    issues: ValidationIssue[],
  ): ValidationResult<SecretReference> {
    rejectUnknownKeys(record, ENVIRONMENT_KEYS, issues);
    const variableName = readRequiredString(
      record,
      "variableName",
      issues,
      "",
      { maxLength: MAX_SECRET_REFERENCE_LENGTH },
    );
    if (
      variableName !== undefined &&
      !ENVIRONMENT_VARIABLE_PATTERN.test(variableName)
    ) {
      issues.push({
        code: "invalid_format",
        message: "variableName must be a valid environment variable name",
        path: "variableName",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== SECRET_REFERENCE_CONTRACT_VERSION ||
      secretId === undefined ||
      !SECRET_ID_PATTERN.test(secretId) ||
      variableName === undefined ||
      !ENVIRONMENT_VARIABLE_PATTERN.test(variableName)
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      secretId,
      source: "environment",
      variableName,
    });
  }

  #validateLocalFile(
    record: Readonly<Record<string, unknown>>,
    contractVersion: string | undefined,
    secretId: string | undefined,
    issues: ValidationIssue[],
  ): ValidationResult<SecretReference> {
    rejectUnknownKeys(record, LOCAL_FILE_KEYS, issues);
    const encoding = readRequiredString(record, "encoding", issues);
    const path = readRequiredString(record, "path", issues, "", {
      maxLength: MAX_SECRET_REFERENCE_LENGTH,
    });
    if (encoding !== undefined && encoding !== "utf8") {
      issues.push({
        code: "invalid_value",
        message: "encoding must be utf8",
        path: "encoding",
      });
    }
    if (path !== undefined && (!isAbsolute(path) || path.includes("\0"))) {
      issues.push({
        code: "invalid_value",
        message: "path must be an absolute local filesystem path",
        path: "path",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== SECRET_REFERENCE_CONTRACT_VERSION ||
      secretId === undefined ||
      !SECRET_ID_PATTERN.test(secretId) ||
      encoding !== "utf8" ||
      path === undefined ||
      !isAbsolute(path) ||
      path.includes("\0")
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      encoding,
      path,
      secretId,
      source: "local-file",
    });
  }
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${key} is not a supported secret reference field`,
        path: key,
      });
    }
  }
}
