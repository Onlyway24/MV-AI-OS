import { describe, expect, it } from "vitest";

import {
  LocalRuntimeConfigValidator,
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  ModelUsageAccountingConfigValidator,
  ValidatedLlmGateway,
  applyModelUsageAccounting,
  calculateModelUsageAccounting,
  type Clock,
  type ModelProfile,
  type ModelProvider,
  type ModelUsageAccountingConfig,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";
import {
  DeterministicModelProvider,
  FixedModelSelectionPolicy,
  InMemoryProviderRegistry,
  createModelProfile,
  createModelRequest,
} from "../support/model-gateway-fixtures.js";

describe("Model usage accounting", () => {
  it("accepts valid provider-neutral pricing configuration", () => {
    expect(
      new ModelUsageAccountingConfigValidator().validate(
        createAccountingConfig(),
      ),
    ).toEqual({
      ok: true,
      value: createAccountingConfig(),
    });
  });

  it("rejects invalid and duplicate pricing configuration", () => {
    expect(
      new ModelUsageAccountingConfigValidator().validate({
        ...createAccountingConfig(),
        pricing: [
          createPricingRule(),
          createPricingRule({ inputTokenUsdPerMillion: -1 }),
          createPricingRule(),
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_number",
          path: "pricing[1].inputTokenUsdPerMillion",
        },
        {
          code: "duplicate",
          path: "pricing[2]",
        },
      ],
      ok: false,
    });
  });

  it("calculates estimated cost deterministically from validated usage", () => {
    expect(
      calculateModelUsageAccounting({
        modelId: "deterministic-model-v1",
        profileId: "content-quality",
        providerId: "deterministic",
        rule: createPricingRule({
          inputTokenUsdPerMillion: 2,
          outputTokenUsdPerMillion: 6,
        }),
        usage: {
          inputTokens: 1_000,
          outputTokens: 500,
          totalTokens: 1_500,
        },
      }),
    ).toEqual({
      contractVersion: "1",
      currency: "USD",
      estimatedCostUsd: 0.005,
      inputTokens: 1_000,
      modelId: "deterministic-model-v1",
      outputTokens: 500,
      profileId: "content-quality",
      providerId: "deterministic",
      totalTokens: 1_500,
    });
  });

  it("does not invent cost when a failed model response has no usage", () => {
    const response = {
      completedAt: "2026-07-08T00:00:00.000Z",
      contractVersion: "1",
      error: {
        category: "provider",
        code: "provider_unavailable",
        message: "Provider unavailable",
        occurredAt: "2026-07-08T00:00:00.000Z",
        retryable: false,
        stage: "provider_invocation",
      },
      modelRequestId: "model-request-001",
      provider: {
        modelId: "deterministic-model-v1",
        providerId: "deterministic",
      },
      status: "failed",
    } as const;

    expect(
      applyModelUsageAccounting(
        response,
        createModelProfile(),
        createAccountingConfig({ required: true, pricing: [] }),
      ),
    ).toBe(response);
  });

  it("normalizes successful response cost from explicit pricing only", async () => {
    const clock = new FixedClock();
    const gateway = createGateway(
      clock,
      new DeterministicModelProvider(clock),
      createAccountingConfig({
        pricing: [
          createPricingRule({
            inputTokenUsdPerMillion: 2,
            outputTokenUsdPerMillion: 6,
          }),
        ],
      }),
    );

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      status: "succeeded",
      usage: {
        costUsd: 0.00002,
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
    });
  });

  it("fails closed when pricing is required but missing for the selected profile", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(
      clock,
      provider,
      createAccountingConfig({
        pricing: [
          createPricingRule({
            profileId: "other-profile",
          }),
        ],
        required: true,
      }),
    );
    const request = createModelRequest({
      messages: [{ content: "secret prompt content", role: "user" }],
    });

    const response = await gateway.generate(request);

    expect(response).toMatchObject({
      error: {
        code: "model_usage_accounting_missing_pricing",
        details: {
          modelId: "deterministic-model-v1",
          profileId: "content-quality",
          providerId: "deterministic",
        },
        stage: "usage_accounting",
      },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain("secret prompt content");
    expect(JSON.stringify(response)).not.toContain("provider diagnostic");
    expect(JSON.stringify(response)).not.toContain("resolved-openai-key");
  });

  it("fails closed at the gateway boundary when accounting configuration is invalid", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      ...createAccountingConfig(),
      pricing: [
        createPricingRule({
          outputTokenUsdPerMillion: -1,
        }),
      ],
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_usage_accounting_invalid",
        stage: "usage_accounting",
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });

  it("validates local runtime accounting configuration", () => {
    const valid = createRuntimeConfig({
      modelUsageAccounting: createAccountingConfig(),
    });

    expect(new LocalRuntimeConfigValidator().validate(valid)).toMatchObject({
      ok: true,
      value: valid,
    });
    expect(
      new LocalRuntimeConfigValidator().validate({
        ...valid,
        modelUsageAccounting: {
          ...createAccountingConfig(),
          pricing: [
            createPricingRule({
              inputTokenUsdPerMillion: Number.NaN,
            }),
          ],
        },
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_number",
          path: "modelUsageAccounting.pricing[0].inputTokenUsdPerMillion",
        },
      ],
      ok: false,
    });
  });
});

function createGateway(
  clock: Clock,
  provider: ModelProvider,
  usageAccountingConfig: ModelUsageAccountingConfig,
): ValidatedLlmGateway {
  const profile: ModelProfile = createModelProfile();
  return new ValidatedLlmGateway({
    clock,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
    usageAccountingConfig,
  });
}

function createAccountingConfig(
  overrides: Partial<ModelUsageAccountingConfig> = {},
): ModelUsageAccountingConfig {
  return {
    contractVersion: "1",
    pricing: [createPricingRule()],
    required: false,
    ...overrides,
  };
}

function createPricingRule(
  overrides: Partial<ModelUsageAccountingConfig["pricing"][number]> = {},
): ModelUsageAccountingConfig["pricing"][number] {
  return {
    contractVersion: "1",
    currency: "USD",
    inputTokenUsdPerMillion: 1,
    modelId: "deterministic-model-v1",
    outputTokenUsdPerMillion: 2,
    profileId: "content-quality",
    providerId: "deterministic",
    ...overrides,
  };
}

function createRuntimeConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    actorId: "actor-local",
    contentAgentMode: "model-backed-deterministic",
    contractVersion: "1",
    permissions: {
      actorGrants: ["model:invoke:content-quality"],
      policyGrants: ["model:invoke:content-quality"],
      taskGrants: ["model:invoke:content-quality"],
    },
    sqlite: {
      path: "/tmp/mv-ai-os-runtime.sqlite",
      timeoutMs: 1_000,
    },
    workspaceId: "workspace-local",
    ...overrides,
  };
}
