import type { JsonObject } from "../../contracts/json.js";
import { CoreError } from "../../errors/core-error.js";
import type { SecretValue } from "../../config/secret-value.js";
import type { ValidationIssue } from "../../validation/validation.js";

export const OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION = "1" as const;
export const OPENAI_MODEL_PROVIDER_ID = "openai" as const;
export const OPENAI_RESPONSES_PATH = "/responses" as const;
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1" as const;
export const MAX_OPENAI_BASE_URL_LENGTH = 256;
export const MAX_OPENAI_HEADER_VALUE_LENGTH = 256;

export interface OpenAIModelProviderConfig {
  readonly apiKey: SecretValue;
  readonly baseUrl: string;
  readonly contractVersion: typeof OPENAI_MODEL_PROVIDER_CONFIG_CONTRACT_VERSION;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly providerId: typeof OPENAI_MODEL_PROVIDER_ID;
}

export class OpenAIModelProviderConfigurationError extends CoreError {
  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "openai_model_provider_configuration_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "OpenAI model provider configuration is invalid",
      stage: "openai_model_provider_configuration",
    });
  }
}

export class OpenAIModelProviderError extends CoreError {
  public constructor(
    code: "openai_transport_failed" | "openai_response_invalid",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: "model",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      retryable: code === "openai_transport_failed",
      stage: "openai_model_provider",
    });
  }
}
