import type { JsonObject } from "../contracts/json.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import type { LlmGateway } from "./llm-gateway.js";
import type { ModelError } from "./model-error.js";
import {
  ModelGatewayInvariantError,
  ModelRequestValidationError,
} from "./model-gateway-error.js";
import type { ModelBudgetConfig } from "./model-budget.js";
import {
  enforceModelBudgetAfterResponse,
  enforceModelBudgetBeforeRequest,
} from "./model-budget-enforcer.js";
import { ModelBudgetConfigValidator } from "./model-budget-validator.js";
import type { ModelOperationLimits } from "./model-operation-limits.js";
import {
  DEFAULT_MODEL_OPERATION_LIMITS,
  ModelOperationLimitsValidator,
} from "./model-operation-limits-validator.js";
import type { ModelUsageAccountingConfig } from "./model-pricing.js";
import { ModelUsageAccountingConfigValidator } from "./model-pricing-validator.js";
import {
  applyModelUsageAccounting,
  ModelUsageAccountingError,
} from "./model-usage-accounting.js";
import type { ModelProfile } from "./model-profile.js";
import type { ModelProvider } from "./model-provider.js";
import type { ModelRequest } from "./model-request.js";
import type { ModelResponse } from "./model-response.js";
import type { ModelSelectionPolicy } from "./model-selection-policy.js";
import type { ProviderRegistry } from "./provider-registry.js";

export interface ValidatedLlmGatewayDependencies {
  readonly clock: Clock;
  readonly budgetConfig?: ModelBudgetConfig;
  readonly budgetConfigValidator?: Validator<ModelBudgetConfig>;
  readonly operationLimits?: ModelOperationLimits;
  readonly operationLimitsValidator?: Validator<ModelOperationLimits>;
  readonly profileValidator: Validator<ModelProfile>;
  readonly providerRegistry: ProviderRegistry;
  readonly requestValidator: Validator<ModelRequest>;
  readonly responseValidator: Validator<ModelResponse>;
  readonly selectionPolicy: ModelSelectionPolicy;
  readonly usageAccountingConfig?: ModelUsageAccountingConfig;
  readonly usageAccountingConfigValidator?: Validator<ModelUsageAccountingConfig>;
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
    const operationLimitsValidation = (
      this.#dependencies.operationLimitsValidator ??
      new ModelOperationLimitsValidator()
    ).validate(
      this.#dependencies.operationLimits ?? DEFAULT_MODEL_OPERATION_LIMITS,
    );
    if (!operationLimitsValidation.ok) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_operation_limits_invalid",
        details: {
          issues: operationLimitsValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
        },
        message: "The model operation limits are invalid",
        retryable: false,
        stage: "operation_limits",
      });
    }
    const operationLimits = operationLimitsValidation.value;
    const budgetValidation =
      this.#dependencies.budgetConfig === undefined
        ? undefined
        : (
            this.#dependencies.budgetConfigValidator ??
            new ModelBudgetConfigValidator()
          ).validate(this.#dependencies.budgetConfig);
    if (budgetValidation !== undefined && !budgetValidation.ok) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_budget_invalid",
        details: {
          issues: budgetValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
        },
        message: "The model budget configuration is invalid",
        retryable: false,
        stage: "budget_enforcement",
      });
    }
    const budgetConfig = budgetValidation?.value;
    const usageAccountingValidation =
      this.#dependencies.usageAccountingConfig === undefined
        ? undefined
        : (
            this.#dependencies.usageAccountingConfigValidator ??
            new ModelUsageAccountingConfigValidator()
          ).validate(this.#dependencies.usageAccountingConfig);
    if (
      usageAccountingValidation !== undefined &&
      !usageAccountingValidation.ok
    ) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_usage_accounting_invalid",
        details: {
          issues: usageAccountingValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
        },
        message: "The model usage accounting configuration is invalid",
        retryable: false,
        stage: "usage_accounting",
      });
    }
    const usageAccountingConfig = usageAccountingValidation?.value;
    const requestLimitViolation = modelOperationLimitViolation(
      validRequest,
      operationLimits,
    );
    if (requestLimitViolation !== undefined) {
      return this.#failure(validRequest, {
        category: "validation",
        code: "model_operation_limit_exceeded",
        details: requestLimitViolation,
        message: "The model request exceeds configured operation limits",
        retryable: false,
        stage: "operation_limits",
      });
    }

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

    const requestBudgetViolation = enforceModelBudgetBeforeRequest(
      validRequest,
      profile,
      budgetConfig,
    );
    if (requestBudgetViolation !== undefined) {
      return this.#failure(
        validRequest,
        {
          category: "validation",
          code: requestBudgetViolation.code,
          details: requestBudgetViolation.details,
          message: requestBudgetViolation.message,
          retryable: false,
          stage: "budget_enforcement",
        },
        profile,
      );
    }

    return this.#invokeProviderWithLimits(
      validRequest,
      profile,
      provider,
      operationLimits,
      usageAccountingConfig,
      budgetConfig,
    );
  }

  async #invokeProviderWithLimits(
    validRequest: ModelRequest,
    profile: ModelProfile,
    provider: ModelProvider,
    operationLimits: ModelOperationLimits,
    usageAccountingConfig: ModelUsageAccountingConfig | undefined,
    budgetConfig: ModelBudgetConfig | undefined,
  ): Promise<ModelResponse> {
    let lastRetryableFailure:
      | "provider"
      | "response"
      | undefined;

    for (let call = 1; call <= operationLimits.maxProviderCalls; call += 1) {
      let candidate: unknown;
      try {
        candidate = await withTimeout(
          provider.generate(validRequest, profile),
          operationLimits.timeoutMs,
        );
      } catch (error) {
        if (error instanceof ModelOperationTimeoutError) {
          return this.#failure(
            validRequest,
            {
              category: "timeout",
              code: "model_provider_timeout",
              details: { timeoutMs: operationLimits.timeoutMs },
              message: "The model provider timed out",
              retryable: false,
              stage: "provider_invocation",
            },
            profile,
          );
        }
        lastRetryableFailure = "provider";
        if (call < operationLimits.maxProviderCalls) {
          continue;
        }
        return this.#failure(
          validRequest,
          {
            category: "provider",
            code:
              operationLimits.maxProviderCalls > 1
                ? "model_provider_retry_exhausted"
                : "model_provider_failed",
            ...(operationLimits.maxProviderCalls > 1
              ? {
                  details: {
                    providerCalls: operationLimits.maxProviderCalls,
                  },
                }
              : {}),
            message:
              operationLimits.maxProviderCalls > 1
                ? "The model provider retry budget was exhausted"
                : "The model provider failed",
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
      if (responseMismatch !== undefined) {
        return this.#failure(
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

      let accountedResponse: ModelResponse;
      try {
        accountedResponse = applyModelUsageAccounting(
          response,
          profile,
          usageAccountingConfig,
        );
      } catch (error) {
        if (error instanceof ModelUsageAccountingError) {
          return this.#failure(
            validRequest,
            {
              category: "validation",
              code: error.code,
              details: {
                modelId: profile.modelId,
                profileId: profile.profileId,
                providerId: profile.providerId,
              },
              message: error.message,
              retryable: false,
              stage: "usage_accounting",
            },
            profile,
          );
        }
        throw error;
      }
      const accountedResponseValidation =
        this.#dependencies.responseValidator.validate(accountedResponse);
      if (!accountedResponseValidation.ok) {
        return this.#failure(
          validRequest,
          {
            category: "validation",
            code: "model_usage_accounting_invalid",
            details: {
              issues: accountedResponseValidation.issues.map(
                ({ code, message, path }) => ({
                  code,
                  message,
                  path,
                }),
              ),
            },
            message: "Model usage accounting produced an invalid response",
            retryable: false,
            stage: "usage_accounting",
          },
          profile,
        );
      }
      const normalizedResponse = accountedResponseValidation.value;
      const responseBudgetViolation = enforceModelBudgetAfterResponse(
        normalizedResponse,
        profile,
        budgetConfig,
      );
      if (responseBudgetViolation !== undefined) {
        return this.#failure(
          validRequest,
          {
            category: "validation",
            code: responseBudgetViolation.code,
            details: responseBudgetViolation.details,
            message: responseBudgetViolation.message,
            retryable: false,
            stage: "budget_enforcement",
          },
          profile,
        );
      }
      const usageViolation = modelOperationUsageViolation(
        normalizedResponse,
        operationLimits,
      );
      if (usageViolation !== undefined) {
        return this.#failure(
          validRequest,
          {
            category: "validation",
            code: "model_operation_limit_exceeded",
            details: usageViolation,
            message: "The model response exceeds configured operation limits",
            retryable: false,
            stage: "operation_limits",
          },
          profile,
        );
      }

      if (
        normalizedResponse.status === "failed" &&
        normalizedResponse.error.retryable
      ) {
        lastRetryableFailure = "response";
        if (call < operationLimits.maxProviderCalls) {
          continue;
        }
        return this.#failure(
          validRequest,
          {
            category: normalizedResponse.error.category,
            code:
              operationLimits.maxProviderCalls > 1
                ? "model_provider_retry_exhausted"
                : normalizedResponse.error.code,
            ...(operationLimits.maxProviderCalls > 1
              ? {
                  details: {
                    providerCalls: operationLimits.maxProviderCalls,
                  },
                }
              : {}),
            message:
              operationLimits.maxProviderCalls > 1
                ? "The model provider retry budget was exhausted"
                : normalizedResponse.error.message,
            retryable: true,
            stage: "provider_invocation",
          },
          profile,
        );
      }

      return normalizedResponse;
    }

    return this.#failure(
      validRequest,
      {
        category: "provider",
        code: "model_provider_retry_exhausted",
        details: {
          providerCalls: operationLimits.maxProviderCalls,
          reason: lastRetryableFailure ?? "unknown",
        },
        message: "The model provider retry budget was exhausted",
        retryable: true,
        stage: "provider_invocation",
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

class ModelOperationTimeoutError extends Error {
  public constructor() {
    super("model operation timed out");
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

function modelOperationLimitViolation(
  request: ModelRequest,
  limits: ModelOperationLimits,
): JsonObject | undefined {
  const inputCharacters = inputCharacterCount(request);
  if (inputCharacters > limits.maxInputCharacters) {
    return {
      actualInputCharacters: inputCharacters,
      maximumInputCharacters: limits.maxInputCharacters,
      reason: "input_too_large",
    };
  }
  if (request.limits.maxOutputTokens > limits.maxOutputTokens) {
    return {
      maximumOutputTokens: limits.maxOutputTokens,
      reason: "output_tokens_too_large",
      requestedOutputTokens: request.limits.maxOutputTokens,
    };
  }
  if (request.limits.timeoutMs > limits.timeoutMs) {
    return {
      maximumTimeoutMs: limits.timeoutMs,
      reason: "timeout_too_large",
      requestedTimeoutMs: request.limits.timeoutMs,
    };
  }
  if (
    request.limits.maxCostUsd !== undefined &&
    limits.maxCostUsd !== undefined &&
    request.limits.maxCostUsd > limits.maxCostUsd
  ) {
    return {
      maximumCostUsd: limits.maxCostUsd,
      reason: "cost_too_large",
      requestedCostUsd: request.limits.maxCostUsd,
    };
  }
  return undefined;
}

function modelOperationUsageViolation(
  response: ModelResponse,
  limits: ModelOperationLimits,
): JsonObject | undefined {
  if (response.usage === undefined) {
    return undefined;
  }
  if (response.usage.outputTokens > limits.maxOutputTokens) {
    return {
      actualOutputTokens: response.usage.outputTokens,
      maximumOutputTokens: limits.maxOutputTokens,
      reason: "reported_output_tokens_too_large",
    };
  }
  if (
    limits.maxTotalTokens !== undefined &&
    response.usage.totalTokens > limits.maxTotalTokens
  ) {
    return {
      actualTotalTokens: response.usage.totalTokens,
      maximumTotalTokens: limits.maxTotalTokens,
      reason: "reported_total_tokens_too_large",
    };
  }
  if (
    limits.maxCostUsd !== undefined &&
    response.usage.costUsd !== undefined &&
    response.usage.costUsd > limits.maxCostUsd
  ) {
    return {
      actualCostUsd: response.usage.costUsd,
      maximumCostUsd: limits.maxCostUsd,
      reason: "reported_cost_too_large",
    };
  }
  return undefined;
}

function inputCharacterCount(request: ModelRequest): number {
  return request.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new ModelOperationTimeoutError());
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
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
