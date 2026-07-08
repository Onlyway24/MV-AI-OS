import {
  MAX_SECRET_REFERENCE_LENGTH,
  type SecretReferenceSource,
} from "./secret-reference.js";
import {
  MAX_SECRET_VALUE_BYTES,
  SECRET_VALUE_CONTRACT_VERSION,
  type SecretResolutionResult,
  type SecretValue,
} from "./secret-value.js";
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
const SECRET_SOURCES = new Set<SecretReferenceSource>([
  "environment",
  "local-file",
]);
const SECRET_VALUE_KEYS = new Set(["contractVersion", "secretId", "value"]);
const SECRET_RESOLUTION_KEYS = new Set([
  "contractVersion",
  "secretId",
  "source",
  "value",
]);

export class SecretValueValidator implements Validator<SecretValue> {
  public validate(value: unknown): ValidationResult<SecretValue> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "secret value must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, SECRET_VALUE_KEYS, issues);
    const contractVersion = readContractVersion(record, issues);
    const secretId = readSecretId(record, issues);
    const resolvedValue = readSecretValue(record, issues);

    if (
      issues.length > 0 ||
      contractVersion === undefined ||
      secretId === undefined ||
      resolvedValue === undefined
    ) {
      return validationFailure(redactSecretValidationIssues(issues));
    }

    return validationSuccess({
      contractVersion,
      secretId,
      value: resolvedValue,
    });
  }
}

export class SecretResolutionResultValidator
  implements Validator<SecretResolutionResult>
{
  readonly #valueValidator = new SecretValueValidator();

  public validate(value: unknown): ValidationResult<SecretResolutionResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "secret resolution result must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, SECRET_RESOLUTION_KEYS, issues);
    const contractVersion = readContractVersion(record, issues);
    const secretId = readSecretId(record, issues);
    const source = readRequiredString(record, "source", issues);
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

    const valueValidation = this.#valueValidator.validate(record.value);
    if (!valueValidation.ok) {
      issues.push(
        ...valueValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "value" : `value.${path}`,
        })),
      );
    }

    if (
      valueValidation.ok &&
      secretId !== undefined &&
      valueValidation.value.secretId !== secretId
    ) {
      issues.push({
        code: "invalid_value",
        message: "value.secretId must match secretId",
        path: "value.secretId",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion === undefined ||
      secretId === undefined ||
      source === undefined ||
      !SECRET_SOURCES.has(source as SecretReferenceSource) ||
      !valueValidation.ok
    ) {
      return validationFailure(redactSecretValidationIssues(issues));
    }

    return validationSuccess({
      contractVersion,
      secretId,
      source: source as SecretReferenceSource,
      value: valueValidation.value,
    });
  }
}

export function redactSecretValidationIssues(
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map(({ code, message, path }) => ({
      code,
      message:
        path === "value" || path.endsWith(".value")
          ? "secret value is invalid"
          : message,
      path: redactSecretResolutionPath(path),
    })),
  );
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof SECRET_VALUE_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== SECRET_VALUE_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${SECRET_VALUE_CONTRACT_VERSION}`,
      path: "contractVersion",
    });
  }
  return contractVersion === SECRET_VALUE_CONTRACT_VERSION
    ? contractVersion
    : undefined;
}

function readSecretId(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): string | undefined {
  const secretId = readRequiredString(record, "secretId", issues, "", {
    maxLength: MAX_SECRET_REFERENCE_LENGTH,
  });
  if (secretId !== undefined && !SECRET_ID_PATTERN.test(secretId)) {
    issues.push({
      code: "invalid_format",
      message: "secretId must be a lowercase opaque identifier",
      path: "secretId",
    });
    return undefined;
  }
  return secretId;
}

function readSecretValue(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): string | undefined {
  const value = readRequiredString(record, "value", issues, "", {
    allowEmpty: false,
  });
  if (value === undefined) {
    return undefined;
  }
  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_VALUE_BYTES) {
    issues.push({
      code: "too_large",
      message: "secret value exceeds the size limit",
      path: "value",
    });
    return undefined;
  }
  if (value.includes("\0")) {
    issues.push({
      code: "invalid_value",
      message: "secret value must not contain NUL bytes",
      path: "value",
    });
    return undefined;
  }
  return value;
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${key} is not a supported secret resolution field`,
        path: key,
      });
    }
  }
}

function redactSecretResolutionPath(path: string): string {
  return path.replace(/(^|\.)value$/gu, "$1<redacted>");
}
