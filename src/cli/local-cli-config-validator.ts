import {
  LOCAL_CLI_CONTRACT_VERSION,
  MAX_LOCAL_CLI_REQUEST_BYTES,
  type LocalCliConfig,
} from "./local-cli-config.js";
import { LocalRuntimeConfigValidator } from "../runtime/local-runtime-config-validator.js";
import {
  readRequiredInteger,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const ALLOWED_KEYS = new Set([
  "contractVersion",
  "maxRequestBytes",
  "runtime",
]);

export class LocalCliConfigValidator implements Validator<LocalCliConfig> {
  readonly #runtimeValidator = new LocalRuntimeConfigValidator();

  public validate(value: unknown): ValidationResult<LocalCliConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "local CLI configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    for (const key of Object.keys(record)) {
      if (!ALLOWED_KEYS.has(key)) {
        issues.push({
          code: "unexpected",
          message: `${key} is not a supported configuration field`,
          path: key,
        });
      }
    }

    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const maxRequestBytes = readRequiredInteger(
      record,
      "maxRequestBytes",
      issues,
      "",
      1,
    );
    const runtimeValidation = this.#runtimeValidator.validate(record.runtime);
    if (!runtimeValidation.ok) {
      issues.push(
        ...runtimeValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "runtime" : `runtime.${path}`,
        })),
      );
    }

    if (
      contractVersion !== undefined &&
      contractVersion !== LOCAL_CLI_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${LOCAL_CLI_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (
      maxRequestBytes !== undefined &&
      maxRequestBytes > MAX_LOCAL_CLI_REQUEST_BYTES
    ) {
      issues.push({
        code: "too_large",
        message: `maxRequestBytes must not exceed ${String(MAX_LOCAL_CLI_REQUEST_BYTES)}`,
        path: "maxRequestBytes",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== LOCAL_CLI_CONTRACT_VERSION ||
      maxRequestBytes === undefined ||
      maxRequestBytes > MAX_LOCAL_CLI_REQUEST_BYTES ||
      !runtimeValidation.ok
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      maxRequestBytes,
      runtime: runtimeValidation.value,
    });
  }
}
