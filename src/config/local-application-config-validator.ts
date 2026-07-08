import {
  MAX_LOCAL_CLI_REQUEST_BYTES,
} from "../cli/local-cli-config.js";
import {
  LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION,
  type LocalApplicationCliConfig,
  type LocalApplicationConfig,
} from "./local-application-config.js";
import {
  MAX_SECRET_REFERENCES,
  type SecretReference,
} from "./secret-reference.js";
import { SecretReferenceValidator } from "./secret-reference-validator.js";
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

const APPLICATION_KEYS = new Set([
  "cli",
  "contractVersion",
  "runtime",
  "secretReferences",
]);
const CLI_KEYS = new Set(["maxRequestBytes"]);

export class LocalApplicationConfigValidator
  implements Validator<LocalApplicationConfig>
{
  readonly #runtimeValidator = new LocalRuntimeConfigValidator();
  readonly #secretReferenceValidator = new SecretReferenceValidator();

  public validate(value: unknown): ValidationResult<LocalApplicationConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "local application configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, APPLICATION_KEYS, issues);
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const cli = readCliConfig(record.cli, issues);
    const runtimeValidation = this.#runtimeValidator.validate(record.runtime);
    const secretReferences = this.#readSecretReferences(
      record.secretReferences,
      issues,
    );

    if (
      contractVersion !== undefined &&
      contractVersion !== LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (!runtimeValidation.ok) {
      issues.push(
        ...runtimeValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "runtime" : `runtime.${path}`,
        })),
      );
    }
    if (runtimeValidation.ok && secretReferences !== undefined) {
      validateSelectedProviderSecrets(
        runtimeValidation.value.modelProvider,
        secretReferences,
        issues,
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION ||
      cli === undefined ||
      !runtimeValidation.ok ||
      secretReferences === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      cli,
      contractVersion,
      runtime: runtimeValidation.value,
      secretReferences,
    });
  }

  #readSecretReferences(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly SecretReference[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "secretReferences must be an array",
        path: "secretReferences",
      });
      return undefined;
    }
    if (value.length > MAX_SECRET_REFERENCES) {
      issues.push({
        code: "too_large",
        message: `secretReferences must not exceed ${String(MAX_SECRET_REFERENCES)} entries`,
        path: "secretReferences",
      });
      return undefined;
    }

    const references: SecretReference[] = [];
    const seen = new Set<string>();
    for (const [index, entry] of value.entries()) {
      const validation = this.#secretReferenceValidator.validate(entry);
      if (!validation.ok) {
        issues.push(
          ...validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path:
              path === "$"
                ? `secretReferences[${String(index)}]`
                : `secretReferences[${String(index)}].${path}`,
          })),
        );
        continue;
      }
      if (seen.has(validation.value.secretId)) {
        issues.push({
          code: "duplicate",
          message: "secretReferences must not contain duplicate secret IDs",
          path: `secretReferences[${String(index)}].secretId`,
        });
        continue;
      }
      seen.add(validation.value.secretId);
      references.push(validation.value);
    }

    return issues.some((issue) => issue.path.startsWith("secretReferences"))
      ? undefined
      : Object.freeze(references);
  }
}

function validateSelectedProviderSecrets(
  modelProvider:
    | { readonly apiKeySecretId: string; readonly providerId: string }
    | undefined,
  secretReferences: readonly SecretReference[],
  issues: ValidationIssue[],
): void {
  if (modelProvider?.providerId !== "openai") {
    return;
  }
  const usedSecretIds = new Set([modelProvider.apiKeySecretId]);
  if (
    !secretReferences.some(
      ({ secretId }) => secretId === modelProvider.apiKeySecretId,
    )
  ) {
    issues.push({
      code: "required",
      message: "modelProvider.apiKeySecretId must reference a configured secret",
      path: "runtime.modelProvider.apiKeySecretId",
    });
  }
  for (const [index, reference] of secretReferences.entries()) {
    if (!usedSecretIds.has(reference.secretId)) {
      issues.push({
        code: "unexpected",
        message:
          "secretReferences must not contain unused entries for the selected provider",
        path: `secretReferences[${String(index)}].secretId`,
      });
    }
  }
}

function readCliConfig(
  value: unknown,
  issues: ValidationIssue[],
): LocalApplicationCliConfig | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "cli must be an object",
      path: "cli",
    });
    return undefined;
  }
  rejectUnknownKeys(record, CLI_KEYS, issues, "cli");
  const maxRequestBytes = readRequiredInteger(
    record,
    "maxRequestBytes",
    issues,
    "cli",
    1,
  );
  if (
    maxRequestBytes !== undefined &&
    maxRequestBytes > MAX_LOCAL_CLI_REQUEST_BYTES
  ) {
    issues.push({
      code: "too_large",
      message: `cli.maxRequestBytes must not exceed ${String(MAX_LOCAL_CLI_REQUEST_BYTES)}`,
      path: "cli.maxRequestBytes",
    });
  }
  if (
    maxRequestBytes === undefined ||
    maxRequestBytes > MAX_LOCAL_CLI_REQUEST_BYTES
  ) {
    return undefined;
  }
  return { maxRequestBytes };
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  issues: ValidationIssue[],
  pathPrefix = "",
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${key} is not a supported configuration field`,
        path: pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`,
      });
    }
  }
}
