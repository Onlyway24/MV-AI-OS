import {
  DEFAULT_OPENAI_BASE_URL,
  MAX_OPENAI_BASE_URL_LENGTH,
  MAX_OPENAI_HEADER_VALUE_LENGTH,
  OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION,
  OPENAI_MODEL_PROVIDER_ID,
  type OpenAIModelProviderConfig,
} from "./openai-model-provider-config.js";
import { SecretValueValidator } from "../../config/secret-resolution-validator.js";
import { readOptionalString, readRequiredString } from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

const CONFIG_KEYS = new Set([
  "apiKey",
  "baseUrl",
  "contractVersion",
  "organizationId",
  "projectId",
  "providerId",
]);
const HEADER_VALUE_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/u;

export class OpenAIModelProviderConfigValidator
  implements Validator<OpenAIModelProviderConfig>
{
  readonly #secretValueValidator = new SecretValueValidator();

  public validate(value: unknown): ValidationResult<OpenAIModelProviderConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "OpenAI model provider configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, CONFIG_KEYS, issues);
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const providerId = readRequiredString(record, "providerId", issues);
    const baseUrl = readRequiredString(record, "baseUrl", issues, "", {
      maxLength: MAX_OPENAI_BASE_URL_LENGTH,
    });
    const organizationId = readOptionalHeaderValue(
      record,
      "organizationId",
      issues,
    );
    const projectId = readOptionalHeaderValue(record, "projectId", issues);
    const apiKeyValidation = this.#secretValueValidator.validate(
      record.apiKey,
    );

    if (
      contractVersion !== undefined &&
      contractVersion !== OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (providerId !== undefined && providerId !== OPENAI_MODEL_PROVIDER_ID) {
      issues.push({
        code: "invalid_value",
        message: `providerId must be ${OPENAI_MODEL_PROVIDER_ID}`,
        path: "providerId",
      });
    }
    if (baseUrl !== undefined && !isValidOpenAIBaseUrl(baseUrl)) {
      issues.push({
        code: "invalid_value",
        message: "baseUrl must be an absolute HTTPS URL without credentials",
        path: "baseUrl",
      });
    }
    if (!apiKeyValidation.ok) {
      issues.push(
        ...apiKeyValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "apiKey" : `apiKey.${path}`,
        })),
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION ||
      providerId !== OPENAI_MODEL_PROVIDER_ID ||
      baseUrl === undefined ||
      !isValidOpenAIBaseUrl(baseUrl) ||
      !apiKeyValidation.ok
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      apiKey: apiKeyValidation.value,
      baseUrl: stripTrailingSlash(baseUrl),
      contractVersion,
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(projectId === undefined ? {} : { projectId }),
      providerId,
    });
  }
}

export function createDefaultOpenAIModelProviderConfig(
  apiKey: OpenAIModelProviderConfig["apiKey"],
): OpenAIModelProviderConfig {
  return {
    apiKey,
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    contractVersion: OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION,
    providerId: OPENAI_MODEL_PROVIDER_ID,
  };
}

function readOptionalHeaderValue(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = readOptionalString(record, key, issues, "", {
    maxLength: MAX_OPENAI_HEADER_VALUE_LENGTH,
  });
  if (value !== undefined && !HEADER_VALUE_PATTERN.test(value)) {
    issues.push({
      code: "invalid_format",
      message: `${key} must be an opaque OpenAI header value`,
      path: key,
    });
    return undefined;
  }
  return value;
}

function isValidOpenAIBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      url.search.length === 0
    );
  } catch {
    return false;
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
        message: `${key} is not a supported OpenAI provider configuration field`,
        path: key,
      });
    }
  }
}
