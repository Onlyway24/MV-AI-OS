import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLocalRuntime,
  LocalApplicationConfigValidator,
  LocalConfigurationLoader,
  LocalSecretResolver,
  LocalRuntimeConfigValidator,
  type EffectivePermission,
  type EnvironmentSecretReference,
  type LocalApplicationConfig,
  type LocalRuntimeConfig,
  type OpenAIResponsesTransport,
  type OpenAIResponsesTransportRequest,
  type OpenAIResponsesTransportResponse,
  type SecretReference,
} from "../../src/index.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";

const FULL_PERMISSIONS: readonly EffectivePermission[] = Object.freeze([
  "knowledge:search",
  "memory:read:conversation",
  "memory:read:semantic",
  "memory:read:user",
  "model:invoke:content-quality",
]);

describe("Controlled local OpenAI provider wiring", () => {
  it("keeps deterministic local provider mode as the default path", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createRuntimeConfig(databasePath, "model-backed-deterministic"),
        {
          clock: new FixedClock(),
        },
      );

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        result: {
          metadata: {
            generator: "local-deterministic-model",
          },
        },
        status: "completed",
      });
      await runtime.close();
    });
  });

  it("executes model-backed content through configured OpenAI provider with fake transport", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const transport = new FakeOpenAITransport({
        body: createOpenAIContentResponse(),
        status: 200,
      });
      const config = createRuntimeConfig(
        databasePath,
        "model-backed-openai",
      );
      const runtime = await createLocalRuntime(config, {
        clock: new FixedClock(),
        openAIResponsesTransport: transport,
        secretReferences: [createEnvironmentSecretReference()],
        secretResolver: new LocalSecretResolver({
          environment: {
            MV_AI_OS_OPENAI_API_KEY: "resolved-openai-key",
          },
        }),
      });

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        result: {
          metadata: {
            generator: "fake-openai",
          },
          summary: "announcement prepared by fake OpenAI.",
        },
        status: "completed",
      });
      expect(transport.requests).toHaveLength(1);
      const schema = transport.requests[0]?.body.text as {
        format?: { schema?: { properties?: Record<string, unknown>; required?: string[] } };
      } | undefined;
      expect([...(schema?.format?.schema?.required ?? [])].sort()).toEqual(
        Object.keys(schema?.format?.schema?.properties ?? {}).sort(),
      );
      expect(transport.requests[0]).toMatchObject({
        body: {
          max_output_tokens: 2_048,
          model: "gpt-5.5",
          store: false,
          text: {
            format: {
              name: "mv_ai_os_output",
              schema: {
                additionalProperties: false,
                properties: {
                  body: {
                    additionalProperties: false,
                    required: ["message"],
                  },
                  metadata: {
                    additionalProperties: false,
                    required: ["generator"],
                  },
                },
              },
              strict: true,
              type: "json_schema",
            },
          },
        },
        headers: {
          Authorization: "Bearer resolved-openai-key",
          "Content-Type": "application/json",
        },
        method: "POST",
        url: "https://api.openai.com/v1/responses",
      });
      await runtime.close();
    });
  });

  it("reserves, settles, and replays LIVE_PAID through durable Cost Control", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const clock = new FixedClock();
      const transport = new FakeOpenAITransport({
        body: createOpenAIContentResponse(),
        status: 200,
      });
      const config: LocalRuntimeConfig = {
        ...createRuntimeConfig(databasePath, "model-backed-openai"),
        livePaidActivation: {
          activationId: "activation-live-test",
          approvalReceiptId: "approval-live-test",
          approvedAt: "2026-07-02T09:59:00.000Z",
          approvedBy: "fabio",
          confirmedByFabio: true,
          contractVersion: "1",
          expiresAt: "2026-07-02T11:00:00.000Z",
          killSwitch: "RELEASED",
          maxCostUsd: 0.1,
          scope: "OPENAI_RESPONSES_PAID",
          workspaceId: "workspace-local",
        },
        modelBudget: {
          contractVersion: "1",
          required: true,
          rules: [{
            contractVersion: "1",
            maxEstimatedCostUsd: 0.1,
            maxRequestedCostUsd: 0.1,
            modelId: "gpt-5.5",
            profileId: "content-quality",
            providerId: "openai",
            requireEstimatedCost: true,
            requireRequestCost: true,
          }],
        },
        modelOperationLimits: {
          contractVersion: "1",
          maxCostUsd: 0.1,
          maxInputCharacters: 300_000,
          maxOutputTokens: 512,
          maxProviderCalls: 1,
          maxTotalTokens: 32_000,
          timeoutMs: 30_000,
        },
        modelUsageAccounting: {
          contractVersion: "1",
          pricing: [{
            contractVersion: "1",
            currency: "USD",
            inputTokenUsdPerMillion: 1.25,
            modelId: "gpt-5.5",
            outputTokenUsdPerMillion: 10,
            profileId: "content-quality",
            providerId: "openai",
          }],
          required: true,
        },
        providerMode: "LIVE_PAID",
      };
      const overrides = {
        clock,
        openAIResponsesTransport: transport,
        secretReferences: [createEnvironmentSecretReference()],
        secretResolver: new LocalSecretResolver({
          environment: { MV_AI_OS_OPENAI_API_KEY: "resolved-openai-key" },
        }),
      };
      const request = createRequest({ correlationId: "mission-live-test" });
      const first = await createLocalRuntime(config, overrides);
      await expect(first.execute(request)).resolves.toMatchObject({ status: "completed" });
      await first.close();
      expect(transport.requests[0]?.body).toMatchObject({ max_output_tokens: 512 });

      const restarted = await createLocalRuntime(config, overrides);
      await expect(restarted.execute(request)).resolves.toMatchObject({ status: "completed" });
      await restarted.close();
      expect(transport.requests).toHaveLength(1);

      const ledger = JSON.parse(await readFile(
        join(dirname(databasePath), "production-cost-ledger.json"),
        "utf8",
      )) as Record<string, unknown>;
      expect(ledger).toMatchObject({
        contractVersion: "2",
        reservations: [{
          agentId: "content",
          missionId: "mission-live-test",
          modelId: "gpt-5.5",
          providerId: "openai",
          status: "SETTLED",
        }],
        settlements: [{
          actualCostCents: 1,
          actualProviderCalls: 1,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }],
      });
    });
  });

  it("blocks OpenAI transport access when operation limits reject the model request", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const transport = new FakeOpenAITransport({
        body: createOpenAIContentResponse(),
        status: 200,
      });
      const runtime = await createLocalRuntime(
        {
          ...createRuntimeConfig(databasePath, "model-backed-openai"),
          modelOperationLimits: {
            contractVersion: "1",
            maxCostUsd: 0.1,
            maxInputCharacters: 300_000,
            maxOutputTokens: 1,
            maxProviderCalls: 1,
            maxTotalTokens: 32_000,
            timeoutMs: 30_000,
          },
        },
        {
          clock: new FixedClock(),
          openAIResponsesTransport: transport,
          secretReferences: [createEnvironmentSecretReference()],
          secretResolver: new LocalSecretResolver({
            environment: {
              MV_AI_OS_OPENAI_API_KEY: "resolved-openai-key",
            },
          }),
        },
      );

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        error: {
          code: "model_operation_limit_exceeded",
          stage: "operation_limits",
        },
        status: "failed",
      });
      expect(transport.requests).toEqual([]);
      await runtime.close();
    });
  });

  it("requires explicit secret reference and resolver before transport access", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const transport = new FakeOpenAITransport({
        body: createOpenAIContentResponse(),
        status: 200,
      });
      const config = createRuntimeConfig(
        databasePath,
        "model-backed-openai",
      );

      await expect(
        createLocalRuntime(config, {
          clock: new FixedClock(),
          openAIResponsesTransport: transport,
          secretResolver: new LocalSecretResolver({
            environment: {
              MV_AI_OS_OPENAI_API_KEY: "resolved-openai-key",
            },
          }),
        }),
      ).rejects.toMatchObject({
        code: "local_runtime_configuration_invalid",
      });
      await expect(
        createLocalRuntime(config, {
          clock: new FixedClock(),
          openAIResponsesTransport: transport,
          secretReferences: [createEnvironmentSecretReference()],
        }),
      ).rejects.toMatchObject({
        code: "local_runtime_configuration_invalid",
      });
      expect(transport.requests).toEqual([]);
    });
  });

  it("fails closed for missing and unused application secret references", () => {
    const valid = createApplicationConfig("/tmp/runtime.sqlite");
    const missing = {
      ...valid,
      secretReferences: [],
    };
    const unused = {
      ...valid,
      secretReferences: [
        createEnvironmentSecretReference({
          secretId: "openai-api-key",
        }),
        createEnvironmentSecretReference({
          secretId: "unused-openai-api-key",
          variableName: "MV_AI_OS_UNUSED_OPENAI_API_KEY",
        }),
      ],
    };

    expect(new LocalApplicationConfigValidator().validate(missing))
      .toMatchObject({
        issues: [
          {
            code: "required",
            path: "runtime.modelProvider.apiKeySecretId",
          },
        ],
        ok: false,
      });
    expect(new LocalApplicationConfigValidator().validate(unused))
      .toMatchObject({
        issues: [
          {
            code: "unexpected",
            path: "secretReferences[1].secretId",
          },
        ],
        ok: false,
      });
  });

  it.each([
    "https://attacker.example/v1",
    "https://api.openai.com.attacker.example/v1",
    "https://localhost/v1",
  ])("rejects non-official runtime provider origin %s", (baseUrl) => {
    const config = createRuntimeConfig(
      "/tmp/runtime-provider-origin-not-opened.sqlite",
      "model-backed-openai",
    );

    expect(
      new LocalRuntimeConfigValidator().validate({
        ...config,
        modelProvider: {
          ...config.modelProvider,
          baseUrl,
        },
      }),
    ).toMatchObject({
      issues: [
        {
          code: "invalid_value",
          path: "modelProvider.baseUrl",
        },
      ],
      ok: false,
    });
  });

  it("redacts secret identifiers and provider diagnostics from public errors", async () => {
    const secretId = "openai-api-key";
    const secretValue = "resolved-openai-key";
    const invalidConfig = {
      ...createApplicationConfig("/tmp/runtime.sqlite"),
      secretReferences: [],
    };

    expect(() =>
      new LocalConfigurationLoader().load(JSON.stringify(invalidConfig)),
    ).toThrow(
      expect.objectContaining({
        code: "local_configuration_invalid",
      }),
    );
    try {
      new LocalConfigurationLoader().load(JSON.stringify(invalidConfig));
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(secretId);
      expect(JSON.stringify(error)).not.toContain("apiKeySecretId");
    }

    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createRuntimeConfig(databasePath, "model-backed-openai"),
        {
          clock: new FixedClock(),
          openAIResponsesTransport: new FakeOpenAITransport(
            new Error(`provider diagnostic ${secretValue}`),
          ),
          secretReferences: [createEnvironmentSecretReference()],
          secretResolver: new LocalSecretResolver({
            environment: {
              MV_AI_OS_OPENAI_API_KEY: secretValue,
            },
          }),
        },
      );

      const response = await runtime.execute(createRequest());
      expect(response).toMatchObject({
        error: {
          code: "openai_transport_failed",
        },
        status: "failed",
      });
      expect(JSON.stringify(response)).not.toContain(secretValue);
      expect(JSON.stringify(response)).not.toContain("provider diagnostic");
      await runtime.close();
    });
  });
});

class FakeOpenAITransport implements OpenAIResponsesTransport {
  public readonly requests: OpenAIResponsesTransportRequest[] = [];

  readonly #result: Error | OpenAIResponsesTransportResponse;

  public constructor(result: Error | OpenAIResponsesTransportResponse) {
    this.#result = result;
  }

  public send(
    request: OpenAIResponsesTransportRequest,
  ): Promise<OpenAIResponsesTransportResponse> {
    this.requests.push(request);
    if (this.#result instanceof Error) {
      return Promise.reject(this.#result);
    }
    return Promise.resolve(this.#result);
  }
}

function createApplicationConfig(
  databasePath: string,
): LocalApplicationConfig {
  return {
    cli: {
      maxRequestBytes: 65_536,
    },
    contractVersion: "1",
    runtime: createRuntimeConfig(databasePath, "model-backed-openai"),
    secretReferences: [createEnvironmentSecretReference()],
  };
}

function createRuntimeConfig(
  databasePath: string,
  contentAgentMode: "model-backed-deterministic" | "model-backed-openai",
): LocalRuntimeConfig {
  return {
    actorId: "actor-local",
    contentAgentMode,
    contractVersion: "1",
    ...(contentAgentMode === "model-backed-openai"
      ? {
          modelProvider: {
            apiKeySecretId: "openai-api-key",
            baseUrl: "https://api.openai.com/v1",
            modelId: "gpt-5.5",
            providerId: "openai",
          },
        }
      : {}),
    permissions: {
      actorGrants: FULL_PERMISSIONS,
      policyGrants: FULL_PERMISSIONS,
      taskGrants: FULL_PERMISSIONS,
    },
    sqlite: {
      path: databasePath,
      timeoutMs: 1_000,
    },
    workspaceId: "workspace-local",
  };
}

function createEnvironmentSecretReference(
  overrides: Partial<EnvironmentSecretReference> = {},
): SecretReference {
  return {
    contractVersion: "1",
    secretId: "openai-api-key",
    source: "environment",
    variableName: "MV_AI_OS_OPENAI_API_KEY",
    ...overrides,
  };
}

function createOpenAIContentResponse(): Record<string, unknown> {
  return {
    created_at: 1_782_990_001,
    output_text: JSON.stringify({
      assumptions: [],
      audience: "general audience",
      body: {
        message: "Prepare a concise product announcement.",
      },
      contentType: "announcement",
      language: "en",
      memoryRefs: [],
      metadata: {
        generator: "fake-openai",
      },
      sourceRefs: [],
      summary: "announcement prepared by fake OpenAI.",
      tone: "clear",
      warnings: [],
    }),
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  };
}

async function withTemporaryDatabase(
  test: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-openai-runtime-"));
  try {
    await test(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
