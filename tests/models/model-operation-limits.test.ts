import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ModelOperationLimitsValidator,
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  ValidatedLlmGateway,
  type Clock,
  type ModelOperationLimits,
  type ModelProfile,
  type ModelProvider,
  type ModelRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";
import {
  DeterministicModelProvider,
  FixedModelSelectionPolicy,
  InMemoryProviderRegistry,
  createModelProfile,
  createModelRequest,
} from "../support/model-gateway-fixtures.js";

describe("Model operation limits", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid operation limits", () => {
    expect(new ModelOperationLimitsValidator().validate(createLimits()))
      .toMatchObject({
        ok: true,
        value: createLimits(),
      });
  });

  it("rejects invalid operation limits", () => {
    expect(
      new ModelOperationLimitsValidator().validate({
        ...createLimits(),
        maxProviderCalls: 0,
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_number",
          path: "maxProviderCalls",
        },
      ],
      ok: false,
    });
  });

  it("fails closed before provider access when operation limits are invalid", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxProviderCalls: 0,
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_operation_limits_invalid",
        stage: "operation_limits",
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });

  it("blocks oversized input before provider access without exposing prompt content", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxInputCharacters: 10,
    });
    const request = createModelRequest({
      messages: [{ content: "this prompt is too large", role: "user" }],
    });

    const response = await gateway.generate(request);

    expect(response).toMatchObject({
      error: {
        code: "model_operation_limit_exceeded",
        details: {
          reason: "input_too_large",
        },
        stage: "operation_limits",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain("this prompt is too large");
    expect(provider.requests).toEqual([]);
  });

  it("blocks excessive output token requests before provider access", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxOutputTokens: 100,
    });

    await expect(
      gateway.generate(
        createModelRequest({
          limits: {
            maxCostUsd: 0.01,
            maxOutputTokens: 101,
            timeoutMs: 5_000,
          },
        }),
      ),
    ).resolves.toMatchObject({
      error: {
        code: "model_operation_limit_exceeded",
        details: {
          reason: "output_tokens_too_large",
        },
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });

  it("blocks excessive timeout requests before provider access", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      timeoutMs: 4_000,
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_operation_limit_exceeded",
        details: {
          reason: "timeout_too_large",
        },
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });

  it("retries retryable provider transport failures only within the provider call budget", async () => {
    const clock = new FixedClock();
    const provider = new FlakyProvider(clock, 2);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxProviderCalls: 2,
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_provider_retry_exhausted",
        details: { providerCalls: 2 },
        message: "The model provider retry budget was exhausted",
      },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(2);
  });

  it("does not retry non-retryable provider failure responses", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock, {
      responseOverride: {
        completedAt: clock.now().toISOString(),
        contractVersion: "1",
        error: {
          category: "validation",
          code: "provider_rejected_request",
          message: "Provider rejected request",
          occurredAt: clock.now().toISOString(),
          retryable: false,
          stage: "provider_invocation",
        },
        modelRequestId: "model-request-001",
        provider: {
          modelId: "deterministic-model-v1",
          providerId: "deterministic",
        },
        status: "failed",
      },
    });
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxProviderCalls: 3,
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: { code: "provider_rejected_request" },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("normalizes provider timeout without retry loops", async () => {
    vi.useFakeTimers();
    const clock = new FixedClock();
    const provider = new HangingProvider();
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      timeoutMs: 25,
    });

    const pending = gateway.generate(
      createModelRequest({
        limits: {
          maxCostUsd: 0.01,
          maxOutputTokens: 256,
          timeoutMs: 25,
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({
      error: {
        category: "timeout",
        code: "model_provider_timeout",
        details: { timeoutMs: 25 },
        retryable: false,
      },
      status: "failed",
    });
    expect(provider.calls).toBe(1);
  });

  it("enforces reported usage budgets after provider response validation", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createLimits(),
      maxTotalTokens: 5,
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_operation_limit_exceeded",
        details: {
          reason: "reported_total_tokens_too_large",
        },
        stage: "operation_limits",
      },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(1);
  });
});

function createGateway(
  clock: Clock,
  provider: ModelProvider,
  operationLimits: ModelOperationLimits = createLimits(),
): ValidatedLlmGateway {
  const profile = createModelProfile();
  return new ValidatedLlmGateway({
    clock,
    operationLimits,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
  });
}

function createLimits(
  overrides: Partial<ModelOperationLimits> = {},
): ModelOperationLimits {
  return {
    contractVersion: "1",
    maxCostUsd: 0.1,
    maxInputCharacters: 100_000,
    maxOutputTokens: 2_048,
    maxProviderCalls: 1,
    maxTotalTokens: 32_000,
    timeoutMs: 30_000,
    ...overrides,
  };
}

class FlakyProvider implements ModelProvider {
  public readonly providerId = "deterministic";
  public readonly requests: ModelRequest[] = [];

  readonly #clock: Clock;
  readonly #failures: number;

  public constructor(clock: Clock, failures: number) {
    this.#clock = clock;
    this.#failures = failures;
  }

  public generate(
    request: ModelRequest,
    profile: ModelProfile,
  ): Promise<unknown> {
    this.requests.push(request);
    if (this.requests.length <= this.#failures) {
      return Promise.reject(new Error("provider diagnostic"));
    }
    return new DeterministicModelProvider(this.#clock).generate(
      request,
      profile,
    );
  }
}

class HangingProvider implements ModelProvider {
  public readonly providerId = "deterministic";
  public calls = 0;

  public generate(): Promise<unknown> {
    this.calls += 1;
    return new Promise(() => {
      return undefined;
    });
  }
}

