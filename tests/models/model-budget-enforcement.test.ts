import { describe, expect, it } from "vitest";

import {
  LocalRuntimeConfigValidator,
  ModelBudgetConfigValidator,
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  ValidatedLlmGateway,
  type Clock,
  type ModelBudgetConfig,
  type ModelProfile,
  type ModelProvider,
  type ModelResponse,
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

describe("Model budget enforcement", () => {
  it("accepts valid provider-neutral budget configuration", () => {
    expect(
      new ModelBudgetConfigValidator().validate(createBudgetConfig()),
    ).toEqual({
      ok: true,
      value: createBudgetConfig(),
    });
  });

  it("rejects invalid and duplicate budget configuration", () => {
    expect(
      new ModelBudgetConfigValidator().validate({
        ...createBudgetConfig(),
        rules: [
          createBudgetRule(),
          createBudgetRule({ maxRequestedCostUsd: -1 }),
          createBudgetRule(),
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_number",
          path: "rules[1].maxRequestedCostUsd",
        },
        {
          code: "duplicate",
          path: "rules[2]",
        },
      ],
      ok: false,
    });
  });

  it("passes requests whose declared maximum cost is within budget", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        rules: [
          createBudgetRule({
            maxEstimatedCostUsd: 0.01,
            maxRequestedCostUsd: 0.02,
          }),
        ],
      }),
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("denies over-budget request cost before provider access", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        rules: [
          createBudgetRule({
            maxRequestedCostUsd: 0.005,
          }),
        ],
      }),
    });
    const request = createModelRequest({
      limits: {
        maxCostUsd: 0.01,
        maxOutputTokens: 256,
        timeoutMs: 5_000,
      },
      messages: [{ content: "secret prompt content", role: "user" }],
    });

    const response = await gateway.generate(request);

    expect(response).toMatchObject({
      error: {
        code: "model_budget_request_cost_exceeded",
        details: {
          actualCostUsd: 0.01,
          maximumCostUsd: 0.005,
          reason: "model_budget_request_cost_exceeded",
        },
        stage: "budget_enforcement",
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
    expect(JSON.stringify(response)).not.toContain("secret prompt content");
  });

  it("denies over-budget estimated cost after usage accounting", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        rules: [
          createBudgetRule({
            maxEstimatedCostUsd: 0.00001,
            maxRequestedCostUsd: 0.02,
          }),
        ],
      }),
      usageAccountingConfig: createAccountingConfig({
        inputTokenUsdPerMillion: 2,
        outputTokenUsdPerMillion: 6,
      }),
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_budget_estimated_cost_exceeded",
        details: {
          actualCostUsd: 0.00002,
          maximumCostUsd: 0.00001,
          reason: "model_budget_estimated_cost_exceeded",
        },
        stage: "budget_enforcement",
      },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("does not invent spend when estimated cost is absent and not required", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock, {
      responseOverride: createResponseWithoutEstimatedCost(clock),
    });
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        rules: [
          createBudgetRule({
            maxEstimatedCostUsd: 0.00001,
            requireEstimatedCost: false,
          }),
        ],
      }),
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      status: "succeeded",
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      },
    });
    const response = await gateway.generate(
      createModelRequest({ modelRequestId: "model-request-002" }),
    );
    expect(response.usage?.costUsd).toBeUndefined();
  });

  it("fails closed when estimated cost is required but missing", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock, {
      responseOverride: createResponseWithoutEstimatedCost(clock),
    });
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        rules: [
          createBudgetRule({
            maxEstimatedCostUsd: 0.01,
            requireEstimatedCost: true,
          }),
        ],
      }),
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_budget_estimated_cost_missing",
        stage: "budget_enforcement",
      },
      status: "failed",
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("fails closed before provider access when budget configuration is invalid", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      budgetConfig: {
        ...createBudgetConfig(),
        rules: [
          createBudgetRule({
            maxEstimatedCostUsd: Number.NaN,
          }),
        ],
      },
    });

    await expect(gateway.generate(createModelRequest())).resolves.toMatchObject({
      error: {
        code: "model_budget_invalid",
        stage: "budget_enforcement",
      },
      status: "failed",
    });
    expect(provider.requests).toEqual([]);
  });

  it("validates local runtime budget configuration", () => {
    const valid = createRuntimeConfig({
      modelBudget: createBudgetConfig(),
    });

    expect(new LocalRuntimeConfigValidator().validate(valid)).toMatchObject({
      ok: true,
      value: valid,
    });
    expect(
      new LocalRuntimeConfigValidator().validate({
        ...valid,
        modelBudget: {
          ...createBudgetConfig(),
          rules: [
            createBudgetRule({
              maxEstimatedCostUsd: Number.POSITIVE_INFINITY,
            }),
          ],
        },
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_number",
          path: "modelBudget.rules[0].maxEstimatedCostUsd",
        },
      ],
      ok: false,
    });
  });

  it("redacts prompts, secrets, and provider diagnostics from budget failures", async () => {
    const clock = new FixedClock();
    const provider = new DeterministicModelProvider(clock);
    const gateway = createGateway(clock, provider, {
      budgetConfig: createBudgetConfig({
        required: true,
        rules: [],
      }),
    });
    const response = await gateway.generate(
      createModelRequest({
        messages: [
          {
            content: "prompt with resolved-openai-key and provider diagnostic",
            role: "user",
          },
        ],
      }),
    );

    expect(response).toMatchObject({
      error: {
        code: "model_budget_missing_rule",
        stage: "budget_enforcement",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain("resolved-openai-key");
    expect(JSON.stringify(response)).not.toContain("provider diagnostic");
    expect(JSON.stringify(response)).not.toContain("prompt with");
  });
});

function createGateway(
  clock: Clock,
  provider: ModelProvider,
  options: {
    readonly budgetConfig: ModelBudgetConfig;
    readonly usageAccountingConfig?: ModelUsageAccountingConfig;
  },
): ValidatedLlmGateway {
  const profile: ModelProfile = createModelProfile();
  return new ValidatedLlmGateway({
    budgetConfig: options.budgetConfig,
    clock,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
    ...(options.usageAccountingConfig === undefined
      ? {}
      : { usageAccountingConfig: options.usageAccountingConfig }),
  });
}

function createBudgetConfig(
  overrides: Partial<ModelBudgetConfig> = {},
): ModelBudgetConfig {
  return {
    contractVersion: "1",
    required: false,
    rules: [createBudgetRule()],
    ...overrides,
  };
}

function createBudgetRule(
  overrides: Partial<ModelBudgetConfig["rules"][number]> = {},
): ModelBudgetConfig["rules"][number] {
  return {
    contractVersion: "1",
    maxEstimatedCostUsd: 0.1,
    maxRequestedCostUsd: 0.1,
    modelId: "deterministic-model-v1",
    profileId: "content-quality",
    providerId: "deterministic",
    requireEstimatedCost: true,
    requireRequestCost: true,
    ...overrides,
  };
}

function createAccountingConfig(input: {
  readonly inputTokenUsdPerMillion: number;
  readonly outputTokenUsdPerMillion: number;
}): ModelUsageAccountingConfig {
  return {
    contractVersion: "1",
    pricing: [
      {
        contractVersion: "1",
        currency: "USD",
        inputTokenUsdPerMillion: input.inputTokenUsdPerMillion,
        modelId: "deterministic-model-v1",
        outputTokenUsdPerMillion: input.outputTokenUsdPerMillion,
        profileId: "content-quality",
        providerId: "deterministic",
      },
    ],
    required: true,
  };
}

function createResponseWithoutEstimatedCost(clock: Clock): ModelResponse {
  return {
    completedAt: clock.now().toISOString(),
    contractVersion: "1",
    modelRequestId: "model-request-001",
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
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
    },
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
