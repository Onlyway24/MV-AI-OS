import { createHash } from "node:crypto";

import type { SecretValue } from "../../config/secret-value.js";
import type { OpenAiResponsesCanonicalRequest } from "./openai-responses-request-builder.js";

export interface OpenAiResponsesConformanceTransportRequest {
  /** The canonical serializer is the sole source of this transient value. */
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "POST";
  readonly timeoutMs: number;
  readonly url: string;
}

export interface OpenAiResponsesConformanceTransportResponse {
  readonly body: unknown;
  readonly status: number;
}

export interface OpenAiResponsesConformanceTransport {
  send(
    request: OpenAiResponsesConformanceTransportRequest,
  ): Promise<OpenAiResponsesConformanceTransportResponse>;
}

export interface OpenAiResponsesPlainConformanceProviderDependencies {
  readonly apiKey: SecretValue;
  readonly baseUrl: "https://api.openai.com/v1";
  readonly transport?: OpenAiResponsesConformanceTransport;
}

export interface OpenAiResponsesProviderDiagnostic {
  readonly httpStatus: number;
  readonly providerCode?: string;
  readonly providerParameter?: string;
  readonly providerType?: string;
}

export type OpenAiResponsesPlainConformanceResponse =
  | {
      readonly diagnostic: OpenAiResponsesProviderDiagnostic;
      readonly status: "failure";
    }
  | {
      /** Kept in memory only for exact-match validation. */
      readonly outputText?: string;
      readonly responseFingerprint?: string;
      readonly status: "success";
      readonly usage?: {
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly totalTokens: number;
      };
    };

/**
 * A narrow transport boundary for a single canonical /v1/responses request.
 * It cannot receive a ModelRequest, messages, generic limits, or metadata.
 */
export class OpenAiResponsesPlainConformanceProvider {
  readonly #apiKey: SecretValue;
  readonly #baseUrl: "https://api.openai.com/v1";
  readonly #transport: OpenAiResponsesConformanceTransport;

  public constructor(dependencies: OpenAiResponsesPlainConformanceProviderDependencies) {
    this.#apiKey = dependencies.apiKey;
    this.#baseUrl = dependencies.baseUrl;
    this.#transport = dependencies.transport ?? new FetchOpenAiResponsesConformanceTransport();
  }

  public async execute(input: {
    readonly idempotencyKey: string;
    readonly request: OpenAiResponsesCanonicalRequest;
    readonly timeoutMs: number;
  }): Promise<OpenAiResponsesPlainConformanceResponse> {
    let response: OpenAiResponsesConformanceTransportResponse;
    try {
      response = await this.#transport.send({
        body: input.request.serializedBody,
        headers: {
          Authorization: `Bearer ${this.#apiKey.value}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        method: "POST",
        timeoutMs: input.timeoutMs,
        url: `${this.#baseUrl}/responses`,
      });
    } catch {
      return {
        diagnostic: { httpStatus: 0, providerCode: "TRANSPORT_REDACTED" },
        status: "failure",
      };
    }

    const body = asRecord(response.body);
    if (body === undefined) {
      return { diagnostic: { httpStatus: response.status }, status: "failure" };
    }
    if (response.status < 200 || response.status >= 300 || asRecord(body.error) !== undefined) {
      return {
        diagnostic: safeDiagnostic(body, response.status),
        status: "failure",
      };
    }
    const responseId = safeIdentifier(body.id);
    const outputText = readOutputText(body);
    const usage = readUsage(body.usage);
    return {
      ...(outputText === undefined ? {} : { outputText }),
      ...(responseId === undefined
        ? {}
        : { responseFingerprint: createHash("sha256").update(responseId).digest("hex") }),
      status: "success",
      ...(usage === undefined ? {} : { usage }),
    };
  }
}

export class FetchOpenAiResponsesConformanceTransport
  implements OpenAiResponsesConformanceTransport
{
  public async send(
    request: OpenAiResponsesConformanceTransportRequest,
  ): Promise<OpenAiResponsesConformanceTransportResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        body: request.body,
        headers: request.headers,
        method: request.method,
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return { body, status: response.status };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeDiagnostic(
  body: Readonly<Record<string, unknown>>,
  httpStatus: number,
): OpenAiResponsesProviderDiagnostic {
  const providerError = asRecord(body.error);
  const providerCode = safeIdentifier(providerError?.code);
  const providerParameter = safeIdentifier(providerError?.param);
  const providerType = safeIdentifier(providerError?.type);
  return {
    httpStatus,
    ...(providerCode === undefined ? {} : { providerCode }),
    ...(providerParameter === undefined ? {} : { providerParameter }),
    ...(providerType === undefined ? {} : { providerType }),
  };
}

function readUsage(value: unknown): {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
} | undefined {
  const usage = asRecord(value);
  const inputTokens = integer(usage?.input_tokens);
  const outputTokens = integer(usage?.output_tokens);
  const totalTokens = integer(usage?.total_tokens);
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined ||
    totalTokens !== inputTokens + outputTokens
  ) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

function readOutputText(body: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return undefined;
  for (const item of body.output) {
    const content = asRecord(item)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const record = asRecord(part);
      if (record?.type === "output_text" && typeof record.text === "string") {
        return record.text;
      }
    }
  }
  return undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,128}$/u.test(value)
    ? value
    : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}
