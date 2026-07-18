import { createHash } from "node:crypto";

import type { SecretValue } from "../config/secret-value.js";
import {
  DEFAULT_OPENAI_BASE_URL,
  OPENAI_MODEL_PROVIDER_ID,
} from "../models/providers/openai-model-provider-config.js";
import {
  MediaGenerationProviderError,
  type MediaGenerationProvider,
  type MediaGenerationProviderReceipt,
  type MediaGenerationRequest,
  type MediaGenerationResponse,
} from "./media-generation-provider.js";

export const OPENAI_IMAGES_GENERATIONS_PATH = "/images/generations" as const;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface OpenAIImageGenerationProviderConfig {
  readonly apiKey: SecretValue;
  readonly baseUrl: string;
  readonly organizationId?: string;
  readonly projectId?: string;
}

export interface OpenAIImageGenerationTransportRequest {
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "POST";
  readonly timeoutMs: number;
  readonly url: string;
}

export interface OpenAIImageGenerationTransportResponse {
  readonly body: unknown;
  readonly headers?: {
    readonly xRequestId?: string;
  };
  readonly status: number;
}

export interface OpenAIImageGenerationTransport {
  send(
    request: OpenAIImageGenerationTransportRequest,
  ): Promise<OpenAIImageGenerationTransportResponse>;
}

export interface OpenAIImageGenerationProviderDependencies {
  readonly config: OpenAIImageGenerationProviderConfig;
  readonly transport?: OpenAIImageGenerationTransport;
}

/** OpenAI-only adapter. Its errors deliberately omit provider response bodies. */
export class OpenAIImageGenerationProvider implements MediaGenerationProvider {
  public readonly providerId = OPENAI_MODEL_PROVIDER_ID;

  readonly #config: OpenAIImageGenerationProviderConfig;
  readonly #transport: OpenAIImageGenerationTransport;

  public constructor(dependencies: OpenAIImageGenerationProviderDependencies) {
    if (
      dependencies.config.apiKey.value.trim().length === 0 ||
      dependencies.config.baseUrl.trim().length === 0
    ) {
      throw new MediaGenerationProviderError(
        "image_response_invalid",
        "OpenAI image provider configuration is invalid",
      );
    }
    this.#config = dependencies.config;
    this.#transport =
      dependencies.transport ?? new FetchOpenAIImageGenerationTransport();
  }

  public async generate(
    request: MediaGenerationRequest,
  ): Promise<MediaGenerationResponse> {
    const xClientRequestId = request.clientRequestId ?? request.requestId;
    let response: OpenAIImageGenerationTransportResponse;
    try {
      response = await this.#transport.send({
        body: {
          background: "opaque",
          model: request.modelId,
          n: 1,
          output_format: request.outputFormat,
          prompt: request.prompt,
          quality: request.quality,
          size: request.size,
        },
        headers: this.#headers(request.requestId, xClientRequestId),
        method: "POST",
        timeoutMs: 180_000,
        url: `${this.#config.baseUrl}${OPENAI_IMAGES_GENERATIONS_PATH}`,
      });
    } catch (error) {
      throw new MediaGenerationProviderError(
        isAbortError(error) ? "image_transport_timeout" : "image_transport_failed",
        isAbortError(error)
          ? "OpenAI image provider transport timed out"
          : "OpenAI image provider transport failed",
        { xClientRequestId },
      );
    }

    const providerReceipt = readProviderReceipt(response, xClientRequestId);

    if (response.status < 200 || response.status >= 300) {
      return {
        error: {
          code: "image_transport_failed",
          message: "OpenAI image provider returned an unsuccessful response",
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          status: response.status,
        },
        modelId: request.modelId,
        providerReceipt,
        providerId: this.providerId,
        status: "failed",
      };
    }

    const encoded = readEncodedImage(response.body);
    if (encoded === undefined) {
      throw new MediaGenerationProviderError(
        "image_response_invalid",
        "OpenAI image provider returned an invalid response",
        providerReceipt,
      );
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES || !isPng(bytes)) {
      throw new MediaGenerationProviderError(
        "image_response_invalid",
        "OpenAI image provider returned an invalid image",
        providerReceipt,
      );
    }

    return {
      image: {
        bytes,
        height: request.size === "1024x1536" ? 1536 : 1024,
        mimeType: "image/png",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: request.size === "1536x1024" ? 1536 : 1024,
      },
      modelId: request.modelId,
      providerReceipt,
      providerId: this.providerId,
      status: "succeeded",
    };
  }

  #headers(idempotencyKey: string, xClientRequestId: string): Readonly<Record<string, string>> {
    return {
      ...(this.#config.organizationId === undefined
        ? {}
        : { "OpenAI-Organization": this.#config.organizationId }),
      ...(this.#config.projectId === undefined
        ? {}
        : { "OpenAI-Project": this.#config.projectId }),
      Authorization: `Bearer ${this.#config.apiKey.value}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Client-Request-Id": xClientRequestId,
    };
  }
}

export class FetchOpenAIImageGenerationTransport
  implements OpenAIImageGenerationTransport
{
  public async send(
    request: OpenAIImageGenerationTransportRequest,
  ): Promise<OpenAIImageGenerationTransportResponse> {
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
      const xRequestId = response.headers.get("x-request-id") ?? undefined;
      return {
        body: await response.json(),
        headers: xRequestId === undefined ? {} : { xRequestId },
        status: response.status,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readProviderReceipt(
  response: OpenAIImageGenerationTransportResponse,
  xClientRequestId: string,
): MediaGenerationProviderReceipt {
  const receipt: MediaGenerationProviderReceipt = {
    xClientRequestId,
    ...(response.headers?.xRequestId === undefined ? {} : { xRequestId: response.headers.xRequestId }),
    ...readCreatedAt(response.body),
    ...readUsage(response.body),
  };
  return receipt;
}

function readCreatedAt(value: unknown): Pick<MediaGenerationProviderReceipt, "createdAtEpochSeconds"> {
  if (!isRecord(value)) return {};
  const created = value.created;
  return typeof created === "number" && Number.isSafeInteger(created) && created >= 0
    ? { createdAtEpochSeconds: created }
    : {};
}

function readUsage(value: unknown): Pick<MediaGenerationProviderReceipt, "usage"> {
  if (!isRecord(value) || !isRecord(value.usage)) return {};
  const usage = value.usage;
  const inputTokens = nonnegativeInteger(usage.input_tokens);
  const outputTokens = nonnegativeInteger(usage.output_tokens);
  const totalTokens = nonnegativeInteger(usage.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) return {};
  const inputDetails = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  const outputDetails = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  const inputImageTokens = nonnegativeInteger(inputDetails.image_tokens);
  const inputTextTokens = nonnegativeInteger(inputDetails.text_tokens);
  const outputImageTokens = nonnegativeInteger(outputDetails.image_tokens);
  return {
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      ...(inputImageTokens === undefined ? {} : { inputImageTokens }),
      ...(inputTextTokens === undefined ? {} : { inputTextTokens }),
      ...(outputImageTokens === undefined ? {} : { outputImageTokens }),
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function createDefaultOpenAIImageGenerationProviderConfig(
  apiKey: SecretValue,
): OpenAIImageGenerationProviderConfig {
  return { apiKey, baseUrl: DEFAULT_OPENAI_BASE_URL };
}

function readEncodedImage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const data = (value as Readonly<Record<string, unknown>>).data;
  if (!Array.isArray(data) || data.length !== 1) return undefined;
  const first: unknown = data[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    return undefined;
  }
  const encoded = (first as Readonly<Record<string, unknown>>).b64_json;
  return typeof encoded === "string" && encoded.length > 0 ? encoded : undefined;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
