import type {
  Clock,
  ModelOutput,
  ModelProfile,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelSelectionPolicy,
  ProviderRegistry,
} from "../../src/index.js";

export function createModelRequest(
  overrides: Partial<ModelRequest> = {},
): ModelRequest {
  return {
    contractVersion: "1",
    correlationId: "correlation-001",
    invocationId: "invocation-001",
    limits: {
      maxCostUsd: 0.01,
      maxOutputTokens: 256,
      timeoutMs: 5_000,
    },
    messages: [
      {
        content: "Return a deterministic response.",
        role: "user",
      },
    ],
    modelProfile: "content-quality",
    modelRequestId: "model-request-001",
    output: { format: "text" },
    taskId: "task-001",
    ...overrides,
  };
}

export function createModelProfile(
  overrides: Partial<ModelProfile> = {},
): ModelProfile {
  return {
    contractVersion: "1",
    limits: {
      maxCostUsd: 0.1,
      maxInputCharacters: 100_000,
      maxOutputTokens: 2_048,
      timeoutMs: 30_000,
    },
    modelId: "deterministic-model-v1",
    profileId: "content-quality",
    providerId: "deterministic",
    supportedOutputFormats: ["json", "text"],
    ...overrides,
  };
}

export class DeterministicModelProvider implements ModelProvider {
  public readonly providerId = "deterministic";
  public readonly requests: {
    readonly profile: ModelProfile;
    readonly request: ModelRequest;
  }[] = [];

  readonly #clock: Clock;
  readonly #failure: Error | undefined;
  readonly #responseOverride: unknown;

  public constructor(
    clock: Clock,
    options: {
      readonly failure?: Error;
      readonly responseOverride?: unknown;
    } = {},
  ) {
    this.#clock = clock;
    this.#failure = options.failure;
    this.#responseOverride = options.responseOverride;
  }

  public generate(
    request: ModelRequest,
    profile: ModelProfile,
  ): Promise<unknown> {
    this.requests.push({ profile, request });
    if (this.#failure !== undefined) {
      return Promise.reject(this.#failure);
    }
    if (this.#responseOverride !== undefined) {
      return Promise.resolve(this.#responseOverride);
    }

    const output: ModelOutput =
      request.output.format === "json"
        ? {
            format: "json",
            value: { result: "deterministic response" },
          }
        : {
            format: "text",
            text: "deterministic response",
          };
    return Promise.resolve({
      completedAt: this.#clock.now().toISOString(),
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output,
      provider: {
        modelId: profile.modelId,
        providerId: profile.providerId,
      },
      status: "succeeded",
      usage: {
        costUsd: 0,
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
    } satisfies ModelResponse);
  }
}

export class InMemoryProviderRegistry implements ProviderRegistry {
  readonly #providers: ReadonlyMap<string, ModelProvider>;

  public constructor(providers: readonly ModelProvider[]) {
    this.#providers = new Map(
      providers.map((provider) => [provider.providerId, provider]),
    );
  }

  public get(providerId: string): ModelProvider | undefined {
    return this.#providers.get(providerId);
  }
}

export class FixedModelSelectionPolicy implements ModelSelectionPolicy {
  readonly #failure: Error | undefined;
  readonly #profile: ModelProfile;

  public constructor(profile: ModelProfile, failure?: Error) {
    this.#failure = failure;
    this.#profile = profile;
  }

  public select(): Promise<ModelProfile> {
    return this.#failure === undefined
      ? Promise.resolve(this.#profile)
      : Promise.reject(this.#failure);
  }
}
