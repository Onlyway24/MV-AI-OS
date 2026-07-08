import type { JsonObject, JsonValue } from "../../contracts/json.js";
import type { Clock } from "../../ports/clock.js";
import type { ModelErrorCategory } from "../model-error.js";
import type { ModelProfile } from "../model-profile.js";
import type { ModelProvider } from "../model-provider.js";
import type { ModelRequest } from "../model-request.js";
import type { ModelOutput, ModelResponse } from "../model-response.js";
import type { ModelUsage } from "../model-usage.js";
import {
  OPENAI_RESPONSES_PATH,
  OpenAIModelProviderConfigurationError,
  OpenAIModelProviderError,
  type OpenAIModelProviderConfig,
} from "./openai-model-provider-config.js";
import { OpenAIModelProviderConfigValidator } from "./openai-model-provider-validator.js";

export interface OpenAIResponsesTransportRequest {
  readonly body: JsonObject;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "POST";
  readonly timeoutMs: number;
  readonly url: string;
}

export interface OpenAIResponsesTransportResponse {
  readonly body: unknown;
  readonly status: number;
}

export interface OpenAIResponsesTransport {
  send(
    request: OpenAIResponsesTransportRequest,
  ): Promise<OpenAIResponsesTransportResponse>;
}

export interface OpenAIModelProviderDependencies {
  readonly clock: Clock;
  readonly config: OpenAIModelProviderConfig;
  readonly transport?: OpenAIResponsesTransport;
}

export class OpenAIModelProvider implements ModelProvider {
  public readonly providerId: string;

  readonly #clock: Clock;
  readonly #config: OpenAIModelProviderConfig;
  readonly #transport: OpenAIResponsesTransport;

  public constructor(dependencies: OpenAIModelProviderDependencies) {
    const validation = new OpenAIModelProviderConfigValidator().validate(
      dependencies.config,
    );
    if (!validation.ok) {
      throw new OpenAIModelProviderConfigurationError(validation.issues);
    }

    this.#clock = dependencies.clock;
    this.#config = validation.value;
    this.#transport =
      dependencies.transport ?? new FetchOpenAIResponsesTransport();
    this.providerId = validation.value.providerId;
  }

  public async generate(
    request: ModelRequest,
    profile: ModelProfile,
  ): Promise<ModelResponse> {
    let transportResponse: OpenAIResponsesTransportResponse;
    try {
      transportResponse = await this.#transport.send({
        body: createOpenAIResponsesBody(request, profile),
        headers: this.#headers(),
        method: "POST",
        timeoutMs: request.limits.timeoutMs,
        url: `${this.#config.baseUrl}${OPENAI_RESPONSES_PATH}`,
      });
    } catch {
      throw new OpenAIModelProviderError(
        "openai_transport_failed",
        "OpenAI provider transport failed",
      );
    }

    return this.#translateResponse(transportResponse, request, profile);
  }

  #headers(): Readonly<Record<string, string>> {
    return {
      ...(this.#config.organizationId === undefined
        ? {}
        : { "OpenAI-Organization": this.#config.organizationId }),
      ...(this.#config.projectId === undefined
        ? {}
        : { "OpenAI-Project": this.#config.projectId }),
      Authorization: `Bearer ${this.#config.apiKey.value}`,
      "Content-Type": "application/json",
    };
  }

  #translateResponse(
    response: OpenAIResponsesTransportResponse,
    request: ModelRequest,
    profile: ModelProfile,
  ): ModelResponse {
    const body = asRecord(response.body);
    if (body === undefined) {
      throw new OpenAIModelProviderError(
        "openai_response_invalid",
        "OpenAI provider returned an invalid response",
        { status: response.status },
      );
    }

    const completedAt = readCompletedAt(body, this.#clock);
    const usage = readUsage(body.usage);
    if (response.status < 200 || response.status >= 300) {
      return failureResponse({
        category: categoryForStatus(response.status),
        code: "openai_http_error",
        completedAt,
        details: { status: response.status },
        message: "OpenAI provider returned an unsuccessful response",
        modelRequestId: request.modelRequestId,
        profile,
        retryable: isRetryableStatus(response.status),
        stage: "openai_response",
        ...(usage === undefined ? {} : { usage }),
      });
    }

    const providerError = asRecord(body.error);
    if (providerError !== undefined) {
      return failureResponse({
        category: "provider",
        code: readString(providerError.code) ?? "openai_response_error",
        completedAt,
        message: "OpenAI provider returned an error response",
        modelRequestId: request.modelRequestId,
        profile,
        retryable: false,
        stage: "openai_response",
        ...(usage === undefined ? {} : { usage }),
      });
    }

    const incompleteReason = readIncompleteReason(body);
    if (incompleteReason !== undefined) {
      return failureResponse({
        category:
          incompleteReason === "max_output_tokens"
            ? "validation"
            : "provider",
        code: "openai_response_incomplete",
        completedAt,
        details: { reason: incompleteReason },
        message: "OpenAI provider returned an incomplete response",
        modelRequestId: request.modelRequestId,
        profile,
        retryable: false,
        stage: "openai_response",
        ...(usage === undefined ? {} : { usage }),
      });
    }

    const output = readOutput(body, request.output.format);
    if (output === undefined || usage === undefined) {
      throw new OpenAIModelProviderError(
        "openai_response_invalid",
        "OpenAI provider returned an invalid response",
        { status: response.status },
      );
    }

    return {
      completedAt,
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output,
      provider: {
        modelId: profile.modelId,
        providerId: profile.providerId,
      },
      status: "succeeded",
      usage,
    };
  }
}

export class FetchOpenAIResponsesTransport
  implements OpenAIResponsesTransport
{
  public async send(
    request: OpenAIResponsesTransportRequest,
  ): Promise<OpenAIResponsesTransportResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        body: JSON.stringify(request.body),
        headers: request.headers,
        method: request.method,
        signal: controller.signal,
      });
      return {
        body: await response.json(),
        status: response.status,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createOpenAIResponsesBody(
  request: ModelRequest,
  profile: ModelProfile,
): JsonObject {
  return {
    input: request.messages.map((message) => ({
      content: message.content,
      role: message.role,
    })),
    max_output_tokens: request.limits.maxOutputTokens,
    metadata: {
      correlationId: request.correlationId,
      invocationId: request.invocationId,
      modelRequestId: request.modelRequestId,
      taskId: request.taskId,
    },
    model: profile.modelId,
    store: false,
    text:
      request.output.format === "json"
        ? {
            format: {
              name: "mv_ai_os_output",
              schema: request.output.schema ?? {},
              strict: true,
              type: "json_schema",
            },
          }
        : {
            format: {
              type: "text",
            },
          },
  };
}

function failureResponse(input: {
  readonly category: ModelErrorCategory;
  readonly code: string;
  readonly completedAt: string;
  readonly details?: JsonObject;
  readonly message: string;
  readonly modelRequestId: string;
  readonly profile: ModelProfile;
  readonly retryable: boolean;
  readonly stage: string;
  readonly usage?: ModelUsage;
}): ModelResponse {
  return {
    completedAt: input.completedAt,
    contractVersion: "1",
    error: {
      category: input.category,
      code: input.code,
      ...(input.details === undefined ? {} : { details: input.details }),
      message: input.message,
      occurredAt: input.completedAt,
      retryable: input.retryable,
      stage: input.stage,
    },
    modelRequestId: input.modelRequestId,
    provider: {
      modelId: input.profile.modelId,
      providerId: input.profile.providerId,
    },
    status: "failed",
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  };
}

function readCompletedAt(
  body: Readonly<Record<string, unknown>>,
  clock: Clock,
): string {
  const createdAt = body.created_at;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return new Date(createdAt * 1_000).toISOString();
  }
  return clock.now().toISOString();
}

function readUsage(value: unknown): ModelUsage | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const inputTokens = readInteger(record.input_tokens);
  const outputTokens = readInteger(record.output_tokens);
  const totalTokens = readInteger(record.total_tokens);
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined ||
    totalTokens !== inputTokens + outputTokens
  ) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
}

function readOutput(
  body: Readonly<Record<string, unknown>>,
  format: "json" | "text",
): ModelOutput | undefined {
  const outputText = readOutputText(body);
  if (outputText === undefined) {
    return undefined;
  }
  if (format === "text") {
    return { format, text: outputText };
  }

  try {
    const parsed = JSON.parse(outputText) as unknown;
    return isJsonObject(parsed) ? { format, value: parsed } : undefined;
  } catch {
    return undefined;
  }
}

function readOutputText(
  body: Readonly<Record<string, unknown>>,
): string | undefined {
  const direct = readString(body.output_text);
  if (direct !== undefined) {
    return direct;
  }

  if (!Array.isArray(body.output)) {
    return undefined;
  }
  for (const item of body.output) {
    const itemRecord = asRecord(item);
    if (!Array.isArray(itemRecord?.content)) {
      continue;
    }
    for (const content of itemRecord.content) {
      const contentRecord = asRecord(content);
      if (contentRecord?.type === "output_text") {
        const text = readString(contentRecord.text);
        if (text !== undefined) {
          return text;
        }
      }
    }
  }
  return undefined;
}

function readIncompleteReason(
  body: Readonly<Record<string, unknown>>,
): string | undefined {
  const details = asRecord(body.incomplete_details);
  return details === undefined ? undefined : readString(details.reason);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && typeof value === "number"
    ? value
    : undefined;
}

function categoryForStatus(status: number): ModelErrorCategory {
  if (status === 401) {
    return "authentication";
  }
  if (status === 403) {
    return "authorization";
  }
  if (status === 408 || status === 504) {
    return "timeout";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 400 && status < 500) {
    return "validation";
  }
  return "provider";
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
