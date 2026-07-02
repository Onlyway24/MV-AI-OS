import type { JsonObject } from "../contracts/json.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import type { LlmGateway } from "./llm-gateway.js";
import type { ModelError } from "./model-error.js";
import {
  ModelGatewayInvariantError,
  ModelRequestValidationError,
} from "./model-gateway-error.js";
import type { ModelProfile } from "./model-profile.js";
import type { ModelRequest } from "./model-request.js";
import type { ModelResponse } from "./model-response.js";
import type { ModelSelectionPolicy } from "./model-selection-policy.js";
import type { ProviderRegistry } from "./provider-registry.js";

export interface ValidatedLlmGatewayDependencies {
  readonly clock: Clock;
  readonly profileValidator: Validator<ModelProfile>;
  readonly providerRegistry: ProviderRegistry;
  readonly requestValidator: Validator<ModelRequest>;
  readonly responseValidator: Validator<ModelResponse>;
  readonly selectionPolicy: ModelSelectionPolicy;
}

export class ValidatedLlmGateway implements LlmGateway {
  readonly #dependencies: ValidatedLlmGatewayDependencies;

  public constructor(dependencies: ValidatedLlmGatewayDependencies) {
    this.#dependencies = dependencies;
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    const requestValidation =
      this.#dependencies.requestValidator.validate(request);
    if (!requestValidation.ok) {
      throw new ModelRequestValidationError(requestValidation.issues);
    }
    const validRequest = requestValidation.value;

    let selectedProfile: ModelProfile;
    try {
      selectedProfile =
        await this.#dependencies.selectionPolicy.select(validRequest);
    } catch {
      return this.#failure(validRequest, {
        category: "internal",
        code: "model_selection_failed",
        message: "Model profile selection failed",
        retryable: false,
        stage: "model_selection",
      });
    }

    const profileValidation =
      this.#dependencies.profileValidator.validate(selectedProfile);
    if (!profileValidation.ok) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_profile_invalid",
        details: {
          issues: profileValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
        },
        message: "The selected model profile is invalid",
        retryable: false,
        stage: "model_selection",
      });
    }
    const profile = profileValidation.value;
    const incompatibility = profileIncompatibility(validRequest, profile);
    if (incompatibility !== undefined) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_profile_incompatible",
        details: incompatibility,
        message: "The selected model profile cannot satisfy the request",
        retryable: false,
        stage: "model_selection",
      });
    }

    const provider = this.#dependencies.providerRegistry.get(
      profile.providerId,
    );
    if (provider?.providerId !== profile.providerId) {
      return this.#failure(
        validRequest,
        {
          category: "provider",
          code: "model_provider_unavailable",
          message: "The selected model provider is unavailable",
          retryable: false,
          stage: "provider_resolution",
        },
        profile,
      );
    }

    let candidate: unknown;
    try {
      candidate = await provider.generate(validRequest, profile);
    } catch {
      return this.#failure(
        validRequest,
        {
          category: "provider",
          code: "model_provider_failed",
          message: "The model provider failed",
          retryable: true,
          stage: "provider_invocation",
        },
        profile,
      );
    }

    const responseValidation =
      this.#dependencies.responseValidator.validate(candidate);
    if (!responseValidation.ok) {
      return this.#failure(
        validRequest,
        {
          category: "validation",
          code: "model_response_invalid",
          details: {
            issues: responseValidation.issues.map(
              ({ code, message, path }) => ({
                code,
                message,
                path,
              }),
            ),
          },
          message: "The model provider returned an invalid response",
          retryable: false,
          stage: "response_validation",
        },
        profile,
      );
    }

    const response = responseValidation.value;
    const responseMismatch = validateResponseOwnership(
      validRequest,
      profile,
      response,
    );
    return responseMismatch === undefined
      ? response
      : this.#failure(
          validRequest,
          {
            category: "validation",
            code: "model_response_mismatch",
            details: responseMismatch,
            message: "The model response does not match its request",
            retryable: false,
            stage: "response_validation",
          },
          profile,
        );
  }

  #failure(
    request: ModelRequest,
    error: Omit<ModelError, "occurredAt">,
    profile?: ModelProfile,
  ): ModelResponse {
    const occurredAt = this.#timestamp();
    const candidate: ModelResponse = {
      completedAt: occurredAt,
      contractVersion: "1",
      error: {
        ...error,
        occurredAt,
      },
      modelRequestId: request.modelRequestId,
      ...(profile === undefined
        ? {}
        : {
            provider: {
              modelId: profile.modelId,
              providerId: profile.providerId,
            },
          }),
      status: "failed",
    };
    const validation =
      this.#dependencies.responseValidator.validate(candidate);
    if (!validation.ok) {
      throw new ModelGatewayInvariantError(
        "Gateway generated an invalid failure response",
        {
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }
    return validation.value;
  }

  #timestamp(): string {
    const value = this.#dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new ModelGatewayInvariantError("Clock returned an invalid date");
    }
    return value.toISOString();
  }
}

function profileIncompatibility(
  request: ModelRequest,
  profile: ModelProfile,
): JsonObject | undefined {
  if (profile.profileId !== request.modelProfile) {
    return {
      requestedProfile: request.modelProfile,
      selectedProfile: profile.profileId,
    };
  }
  if (!profile.supportedOutputFormats.includes(request.output.format)) {
    return {
      outputFormat: request.output.format,
      profileId: profile.profileId,
    };
  }
  const inputCharacters = request.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  if (inputCharacters > profile.limits.maxInputCharacters) {
    return {
      actualInputCharacters: inputCharacters,
      maximumInputCharacters: profile.limits.maxInputCharacters,
    };
  }
  if (
    request.limits.timeoutMs > profile.limits.timeoutMs ||
    request.limits.maxOutputTokens > profile.limits.maxOutputTokens ||
    (request.limits.maxCostUsd !== undefined &&
      profile.limits.maxCostUsd !== undefined &&
      request.limits.maxCostUsd > profile.limits.maxCostUsd)
  ) {
    return {
      profileId: profile.profileId,
      reason: "request_limits_exceed_profile",
    };
  }
  return undefined;
}

function validateResponseOwnership(
  request: ModelRequest,
  profile: ModelProfile,
  response: ModelResponse,
): JsonObject | undefined {
  if (response.modelRequestId !== request.modelRequestId) {
    return {
      expectedModelRequestId: request.modelRequestId,
      responseModelRequestId: response.modelRequestId,
    };
  }
  if (
    response.provider !== undefined &&
    (response.provider.providerId !== profile.providerId ||
      response.provider.modelId !== profile.modelId)
  ) {
    return {
      expectedModelId: profile.modelId,
      expectedProviderId: profile.providerId,
    };
  }
  if (
    response.status === "succeeded" &&
    response.output.format !== request.output.format
  ) {
    return {
      expectedOutputFormat: request.output.format,
      responseOutputFormat: response.output.format,
    };
  }
  if (
    response.usage !== undefined &&
    (response.usage.outputTokens > request.limits.maxOutputTokens ||
      (request.limits.maxCostUsd !== undefined &&
        response.usage.costUsd !== undefined &&
        response.usage.costUsd > request.limits.maxCostUsd))
  ) {
    return {
      reason: "response_usage_exceeds_request_limits",
    };
  }
  return undefined;
}
