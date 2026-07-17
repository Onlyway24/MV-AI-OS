import { describe, expect, it } from "vitest";

import {
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  OpenAIModelProvider,
  OpenAIModelProviderConfigValidator,
  ValidatedLlmGateway,
  createDefaultOpenAIModelProviderConfig,
  type OpenAIModelProviderConfig,
  type OpenAIResponsesTransport,
  type OpenAIResponsesTransportRequest,
  type OpenAIResponsesTransportResponse,
  type SecretValue,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";
import {
  FixedModelSelectionPolicy,
  InMemoryProviderRegistry,
  createModelProfile,
  createModelRequest,
} from "../support/model-gateway-fixtures.js";

describe("OpenAIModelProvider", () => {
  it("validates provider configuration without exposing secret values", () => {
    const config = createConfig();

    expect(new OpenAIModelProviderConfigValidator().validate(config)).toEqual({
      ok: true,
      value: config,
    });
    expect(
      new OpenAIModelProviderConfigValidator().validate({
        ...config,
        apiKey: {
          ...config.apiKey,
          value: "",
        },
      }),
    ).toMatchObject({
      issues: [{ path: "apiKey.<redacted>" }],
      ok: false,
    });
  });

  it("translates provider-neutral text requests into OpenAI Responses requests", async () => {
    const clock = new FixedClock();
    const transport = new FakeOpenAITransport({
      body: createOpenAITextResponse(),
      status: 200,
    });
    const provider = new OpenAIModelProvider({
      clock,
      config: createConfig(),
      transport,
    });
    const request = createModelRequest();
    const profile = createModelProfile({
      modelId: "gpt-5.5",
      providerId: "openai",
    });

    const response = await provider.generate(request, profile);

    expect(transport.requests).toEqual([
      expect.objectContaining({
        body: {
          input: [
            {
              content: "Return a deterministic response.",
              role: "user",
            },
          ],
          max_output_tokens: 256,
          metadata: {
            correlationId: "correlation-001",
            invocationId: "invocation-001",
            modelRequestId: "model-request-001",
            taskId: "task-001",
          },
          model: "gpt-5.5",
          store: false,
          text: {
            format: {
              type: "text",
            },
          },
        },
        headers: {
          Authorization: "Bearer resolved-openai-key",
          "Content-Type": "application/json",
        },
        method: "POST",
        timeoutMs: 5_000,
        url: "https://api.openai.com/v1/responses",
      }),
    ]);
    expect(response).toEqual({
      completedAt: "2026-07-02T11:00:01.000Z",
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output: {
        format: "text",
        text: "OpenAI deterministic text",
      },
      provider: {
        modelId: "gpt-5.5",
        providerId: "openai",
      },
      status: "succeeded",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    });
  });

  it("translates structured JSON requests and responses", async () => {
    const transport = new FakeOpenAITransport({
      body: {
        ...createOpenAITextResponse(),
        output_text: JSON.stringify({ result: "structured" }),
      },
      status: 200,
    });
    const provider = new OpenAIModelProvider({
      clock: new FixedClock(),
      config: createConfig(),
      transport,
    });
    const request = createModelRequest({
      output: {
        format: "json",
        schema: {
          additionalProperties: false,
          required: ["result"],
          type: "object",
        },
      },
    });

    await expect(
      provider.generate(
        request,
        createModelProfile({ modelId: "gpt-5.5", providerId: "openai" }),
      ),
    ).resolves.toMatchObject({
      output: {
        format: "json",
        value: { result: "structured" },
      },
      status: "succeeded",
    });
    expect(transport.requests[0]?.body.text).toEqual({
      format: {
        name: "mv_ai_os_output",
        schema: {
          additionalProperties: false,
          required: ["result"],
          type: "object",
        },
        strict: true,
        type: "json_schema",
      },
    });
  });

  it("fails before transport access when credentials are missing", () => {
    const transport = new FakeOpenAITransport({
      body: createOpenAITextResponse(),
      status: 200,
    });

    expect(
      () =>
        new OpenAIModelProvider({
          clock: new FixedClock(),
          config: {
            ...createConfig(),
            apiKey: {
              ...createSecretValue(),
              value: "",
            },
          },
          transport,
        }),
    ).toThrow(
      expect.objectContaining({
        code: "openai_model_provider_configuration_invalid",
      }),
    );
    expect(transport.requests).toEqual([]);
  });

  it("normalizes provider failures without leaking secrets or raw diagnostics", async () => {
    const secret = "resolved-openai-key";
    const provider = new OpenAIModelProvider({
      clock: new FixedClock(),
      config: createConfig(createSecretValue(secret)),
      transport: new FakeOpenAITransport(
        new Error(`raw provider diagnostic ${secret}`),
      ),
    });
    const gateway = createGateway(provider);

    const response = await gateway.generate(
      createModelRequest({ modelProfile: "openai-content" }),
    );

    expect(response).toMatchObject({
      error: {
        code: "openai_transport_failed",
        message: "OpenAI provider transport failed",
        stage: "provider_invocation",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(response)).not.toContain("raw provider diagnostic");
  });

  it("preserves gateway profile and usage limit enforcement", async () => {
    const provider = new OpenAIModelProvider({
      clock: new FixedClock(),
      config: createConfig(),
      transport: new FakeOpenAITransport({
        body: {
          ...createOpenAITextResponse(),
          usage: {
            input_tokens: 10,
            output_tokens: 999,
            total_tokens: 1_009,
          },
        },
        status: 200,
      }),
    });
    const gateway = createGateway(provider);

    await expect(
      gateway.generate(
        createModelRequest({
          limits: {
            maxCostUsd: 0.01,
            maxOutputTokens: 10,
            timeoutMs: 5_000,
          },
          modelProfile: "openai-content",
        }),
      ),
    ).resolves.toMatchObject({
      error: {
        code: "model_response_mismatch",
        stage: "response_validation",
      },
      status: "failed",
    });
  });

  it("returns redacted provider HTTP failures", async () => {
    const secret = "resolved-openai-key";
    const provider = new OpenAIModelProvider({
      clock: new FixedClock(),
      config: createConfig(createSecretValue(secret)),
      transport: new FakeOpenAITransport({
        body: {
          error: {
            message: `invalid token ${secret}`,
            type: "invalid_request_error",
          },
        },
        status: 401,
      }),
    });

    const response = await provider.generate(
      createModelRequest(),
      createModelProfile({ modelId: "gpt-5.5", providerId: "openai" }),
    );

    expect(response).toMatchObject({
      error: {
        category: "authentication",
        code: "openai_http_error",
        details: { providerType: "invalid_request_error", status: 401 },
        message: "OpenAI provider returned an unsuccessful response",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(response)).not.toContain("invalid token");
  });

  it("retains only identifier-shaped provider error fields for invalid requests", async () => {
    const secret = "never-expose-this";
    const provider = new OpenAIModelProvider({
      clock: new FixedClock(),
      config: createConfig(createSecretValue(secret)),
      transport: new FakeOpenAITransport({
        body: {
          error: {
            code: "unsupported_parameter",
            message: `The parameter reveals ${secret}`,
            param: "max_output_tokens",
            type: "invalid_request_error",
          },
        },
        status: 400,
      }),
    });

    const response = await provider.generate(
      createModelRequest(),
      createModelProfile({ modelId: "gpt-5.5", providerId: "openai" }),
    );

    expect(response).toMatchObject({
      error: {
        details: {
          providerCode: "unsupported_parameter",
          providerParameter: "max_output_tokens",
          providerType: "invalid_request_error",
          status: 400,
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain(secret);
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

function createGateway(provider: OpenAIModelProvider): ValidatedLlmGateway {
  const profile = createModelProfile({
    modelId: "gpt-5.5",
    profileId: "openai-content",
    providerId: "openai",
  });
  return new ValidatedLlmGateway({
    clock: new FixedClock(),
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
  });
}

function createConfig(apiKey = createSecretValue()): OpenAIModelProviderConfig {
  return createDefaultOpenAIModelProviderConfig(apiKey);
}

function createSecretValue(value = "resolved-openai-key"): SecretValue {
  return {
    contractVersion: "1",
    secretId: "openai-api-key",
    value,
  };
}

function createOpenAITextResponse(): Record<string, unknown> {
  return {
    created_at: 1_782_990_001,
    id: "resp_001",
    output: [
      {
        content: [
          {
            text: "OpenAI deterministic text",
            type: "output_text",
          },
        ],
        role: "assistant",
        type: "message",
      },
    ],
    status: "completed",
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
  };
}
