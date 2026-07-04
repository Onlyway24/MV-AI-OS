import type { JsonObject } from "../contracts/json.js";
import type { ModelProfile } from "../models/model-profile.js";
import type { ModelProvider } from "../models/model-provider.js";
import type { ModelRequest } from "../models/model-request.js";
import type { ModelResponse } from "../models/model-response.js";
import type { Clock } from "../ports/clock.js";
import { asRecord } from "../validation/primitives.js";

export const LOCAL_DETERMINISTIC_MODEL_PROFILE: ModelProfile =
  deepFreeze({
    contractVersion: "1",
    limits: {
      maxCostUsd: 0.1,
      maxInputCharacters: 300_000,
      maxOutputTokens: 2_048,
      timeoutMs: 30_000,
    },
    modelId: "local-deterministic-content-v1",
    profileId: "content-quality",
    providerId: "local-deterministic",
    supportedOutputFormats: ["json"],
  });

export class DeterministicLocalModelProvider implements ModelProvider {
  public readonly providerId =
    LOCAL_DETERMINISTIC_MODEL_PROFILE.providerId;

  readonly #clock: Clock;

  public constructor(clock: Clock) {
    this.#clock = clock;
  }

  public generate(
    request: ModelRequest,
    profile: ModelProfile,
  ): Promise<unknown> {
    const payload = parsePayload(request);
    const input = asRecord(payload.input);
    const requestedOutput = asRecord(input?.requestedOutput);
    const constraints = asRecord(input?.constraints);
    const objective = readString(payload.objective);
    const contentType = readString(requestedOutput?.contentType);
    if (objective === undefined || contentType === undefined) {
      return Promise.reject(
        new TypeError("Deterministic model input is invalid"),
      );
    }

    const audience = readString(constraints?.audience) ?? "general audience";
    const language = readString(constraints?.language) ?? "en";
    const tone = readString(constraints?.tone) ?? "clear";
    const output: JsonObject = {
      assumptions: [],
      audience,
      body: { message: objective },
      contentType,
      language,
      memoryRefs: [],
      metadata: {
        generator: "local-deterministic-model",
      },
      sourceRefs: [],
      summary: `${contentType} prepared for ${audience}.`,
      tone,
      warnings: [],
    };
    const outputTokens = Math.min(64, request.limits.maxOutputTokens);
    const inputTokens = Math.max(
      1,
      Math.ceil(
        request.messages.reduce(
          (total, message) => total + message.content.length,
          0,
        ) / 4,
      ),
    );
    const completedAt = this.#clock.now().toISOString();
    return Promise.resolve({
      completedAt,
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output: {
        format: "json",
        value: output,
      },
      provider: {
        modelId: profile.modelId,
        providerId: profile.providerId,
      },
      status: "succeeded",
      usage: {
        costUsd: 0,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    } satisfies ModelResponse);
  }
}

function parsePayload(request: ModelRequest): Readonly<Record<string, unknown>> {
  const message = [...request.messages]
    .reverse()
    .find(({ role }) => role === "user");
  if (message === undefined) {
    throw new TypeError("Deterministic model request has no user message");
  }
  const parsed = JSON.parse(message.content) as unknown;
  const payload = asRecord(parsed);
  if (payload === undefined) {
    throw new TypeError("Deterministic model payload must be an object");
  }
  return payload;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
