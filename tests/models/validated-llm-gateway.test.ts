import { describe, expect, it } from "vitest";

import {
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  ValidatedLlmGateway,
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

describe("ValidatedLlmGateway", () => {
  it("accepts a valid request and returns a deterministic provider response", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider);
    const request = createModelRequest();

    const response = await gateway.generate(request);

    expect(response).toEqual({
      completedAt: clock.now().toISOString(),
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output: {
        format: "text",
        text: "deterministic response",
      },
      provider: {
        modelId: "deterministic-model-v1",
        providerId: "deterministic",
      },
      status: "succeeded",
      usage: {
        costUsd: 0,
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
    });
    expect(provider.requests).toEqual([
      {
        profile: createModelProfile(),
        request,
      },
    ]);
  });

  it("supports deterministic structured JSON output", async () => {
    const clock = new FixedClock();
    const gateway = createGateway(
      clock,
      new DeterministicModelProvider(clock),
    );

    const response = await gateway.generate(
      createModelRequest({
        output: {
          format: "json",
          schema: {
            required: ["result"],
            type: "object",
          },
        },
      }),
    );

    expect(response).toMatchObject({
      output: {
        format: "json",
        value: { result: "deterministic response" },
      },
      status: "succeeded",
    });
  });

  it("rejects an invalid request before provider selection", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider);
    const invalid = {
      ...createModelRequest(),
      messages: [],
    } as ModelRequest;

    await expect(gateway.generate(invalid)).rejects.toMatchObject({
      category: "validation",
      code: "model_request_invalid",
      stage: "model_gateway",
    });
    expect(provider.requests).toEqual([]);
  });

  it("normalizes provider failures without exposing their cause", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock, {
      failure: new Error("provider secret diagnostic"),
    });
    const gateway = createGateway(clock, provider);

    const response = await gateway.generate(createModelRequest());

    expect(response).toMatchObject({
      error: {
        category: "provider",
        code: "model_provider_failed",
        message: "The model provider failed",
        retryable: true,
        stage: "provider_invocation",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(
      "provider secret diagnostic",
    );
  });

  it("normalizes malformed provider responses", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock, {
      responseOverride: { output: "not a model response" },
    });
    const gateway = createGateway(clock, provider);

    const response = await gateway.generate(createModelRequest());

    expect(response).toMatchObject({
      error: {
        category: "validation",
        code: "model_response_invalid",
        stage: "response_validation",
      },
      status: "failed",
    });
  });

  it("normalizes provider resolution and selection failures", async () => {
    const clock = new FixedClock();
    const profile = createModelProfile();
    const unavailableGateway = new ValidatedLlmGateway({
      clock,
      profileValidator: new ModelProfileValidator(),
      providerRegistry: new InMemoryProviderRegistry([]),
      requestValidator: new ModelRequestValidator(),
      responseValidator: new ModelResponseValidator(),
      selectionPolicy: new FixedModelSelectionPolicy(profile),
    });
    const selectionGateway = new ValidatedLlmGateway({
      clock,
      profileValidator: new ModelProfileValidator(),
      providerRegistry: new InMemoryProviderRegistry([]),
      requestValidator: new ModelRequestValidator(),
      responseValidator: new ModelResponseValidator(),
      selectionPolicy: new FixedModelSelectionPolicy(
        profile,
        new Error("selection implementation detail"),
      ),
    });

    await expect(
      unavailableGateway.generate(createModelRequest()),
    ).resolves.toMatchObject({
      error: { code: "model_provider_unavailable" },
      status: "failed",
    });
    await expect(
      selectionGateway.generate(createModelRequest()),
    ).resolves.toMatchObject({
      error: { code: "model_selection_failed" },
      status: "failed",
    });
  });

  it("rejects invalid and incompatible selected profiles before dispatch", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const dependencies = {
      clock,
      profileValidator: new ModelProfileValidator(),
      providerRegistry: new InMemoryProviderRegistry([provider]),
      requestValidator: new ModelRequestValidator(),
      responseValidator: new ModelResponseValidator(),
    };
    const invalidProfileGateway = new ValidatedLlmGateway({
      ...dependencies,
      selectionPolicy: new FixedModelSelectionPolicy(
        createModelProfile({ providerId: "" }),
      ),
    });
    const incompatibleProfileGateway = new ValidatedLlmGateway({
      ...dependencies,
      selectionPolicy: new FixedModelSelectionPolicy(
        createModelProfile({ profileId: "another-profile" }),
      ),
    });

    await expect(
      invalidProfileGateway.generate(createModelRequest()),
    ).resolves.toMatchObject({
      error: { code: "model_profile_invalid" },
      status: "failed",
    });
    await expect(
      incompatibleProfileGateway.generate(createModelRequest()),
    ).resolves.toMatchObject({
      error: { code: "model_profile_incompatible" },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });
});

function createGateway(
  clock: FixedClock,
  provider: DeterministicModelProvider,
): ValidatedLlmGateway {
  const profile = createModelProfile();
  return new ValidatedLlmGateway({
    clock,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
  });
}
