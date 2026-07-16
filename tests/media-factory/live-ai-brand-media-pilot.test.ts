import { describe, expect, it } from "vitest";

import type { LlmGateway } from "../../src/models/llm-gateway.js";
import type { ModelRequest } from "../../src/models/model-request.js";
import type { ModelResponse } from "../../src/models/model-response.js";
import {
  LIVE_AI_BRAND_MEDIA_PILOT_PLAN,
  LiveAiBrandMediaPilot,
  OpenAIImageGenerationProvider,
  type LivePilotAuthorizationPort,
  type MediaGenerationProvider,
  type MediaGenerationRequest,
  type MediaGenerationResponse,
  type OpenAIImageGenerationTransport,
  type OpenAIImageGenerationTransportRequest,
} from "../../src/index.js";

describe("Live AI Brand Media Factory", () => {
  it("runs one bounded text direction and one master-image call through provider-neutral ports", async () => {
    const text = new FakeTextGateway();
    const image = new FakeImageProvider();
    const authorization = new FakeAuthorization();
    const pilot = new LiveAiBrandMediaPilot({ authorization, imageProvider: image, textGateway: text });

    const preflight = pilot.preflight("pilot-session-001");
    expect(preflight).toEqual([
      expect.objectContaining({ maxCostUsd: 0.005, model: "gpt-4o-mini", status: "ready" }),
      expect.objectContaining({ maxCostUsd: 0.006, model: "gpt-image-1-mini", status: "ready" }),
    ]);

    const result = await pilot.run(request());

    expect(result).toMatchObject({
      costLedger: {
        estimatedCumulativeCostUsd: 0.00606,
      imageGenerations: 1,
      liveCalls: 2,
        textCostUsd: 0.00006,
      },
      status: "READY_FOR_LOCAL_RENDER",
    });
    expect(text.requests).toHaveLength(1);
    expect(text.requests[0]?.limits.maxOutputTokens).toBe(90);
    expect(image.requests).toHaveLength(1);
    expect(image.requests[0]).toMatchObject({
      modelId: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageModelId,
      quality: "low",
      size: "1024x1536",
    });
    if (result.status === "READY_FOR_LOCAL_RENDER") {
      expect(result.imagePrompt).toContain("No words");
      expect(result.imagePrompt).toContain("locally overlaid original logo");
      expect(result.master.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("does not invoke the image provider after a failed text request", async () => {
    const image = new FakeImageProvider();
    const pilot = new LiveAiBrandMediaPilot({
      authorization: new FakeAuthorization(),
      imageProvider: image,
      textGateway: {
        generate(modelRequest: ModelRequest): Promise<ModelResponse> {
          return Promise.resolve({
            completedAt: "2026-07-16T20:00:00.000Z",
            contractVersion: "1",
            error: {
              category: "provider",
              code: "model_provider_failed",
              message: "The model provider failed",
              occurredAt: "2026-07-16T20:00:00.000Z",
              retryable: false,
              stage: "provider_invocation",
            },
            modelRequestId: modelRequest.modelRequestId,
            status: "failed",
          });
        },
      },
    });

    await expect(pilot.run(request())).resolves.toMatchObject({
      costLedger: { imageGenerations: 0, liveCalls: 1 },
      reason: "text_generation_failed",
      status: "BLOCKED",
    });
    expect(image.requests).toEqual([]);
  });

  it("uses a fake OpenAI transport and redacts an unsuccessful provider response", async () => {
    const secret = "local-secret-value";
    const transport = new FakeOpenAIImageTransport({
      body: { error: { message: `invalid ${secret}` } },
      status: 401,
    });
    const provider = new OpenAIImageGenerationProvider({
      config: {
        apiKey: { contractVersion: "1", secretId: "openai-live-media", value: secret },
        baseUrl: "https://api.openai.com/v1",
      },
      transport,
    });

    const response = await provider.generate(imageRequest());

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]).toMatchObject({
      body: { model: "gpt-image-1-mini", n: 1, output_format: "b64_json", quality: "low", size: "1024x1536" },
      method: "POST",
      url: "https://api.openai.com/v1/images/generations",
    });
    expect(response).toMatchObject({
      error: { code: "image_transport_failed", status: 401 },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(secret);
  });

  it("decodes a single PNG master from the offline OpenAI transport", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const provider = new OpenAIImageGenerationProvider({
      config: {
        apiKey: { contractVersion: "1", secretId: "openai-live-media", value: "local-secret-value" },
        baseUrl: "https://api.openai.com/v1",
      },
      transport: new FakeOpenAIImageTransport({
        body: { data: [{ b64_json: png.toString("base64") }] },
        status: 200,
      }),
    });

    await expect(provider.generate(imageRequest())).resolves.toMatchObject({
      image: { height: 1536, mimeType: "image/png", width: 1024 },
      status: "succeeded",
    });
  });

  it("normalizes a thrown transport diagnostic without retaining its secret", async () => {
    const secret = "local-secret-value";
    const provider = new OpenAIImageGenerationProvider({
      config: {
        apiKey: { contractVersion: "1", secretId: "openai-live-media", value: secret },
        baseUrl: "https://api.openai.com/v1",
      },
      transport: { send: () => Promise.reject(new Error(`raw provider output ${secret}`)) },
    });

    await expect(provider.generate(imageRequest())).rejects.toMatchObject({
      code: "image_transport_failed",
    });
  });
});

class FakeTextGateway implements LlmGateway {
  public readonly requests: ModelRequest[] = [];

  public generate(modelRequest: ModelRequest): Promise<ModelResponse> {
    this.requests.push(modelRequest);
    return Promise.resolve({
      completedAt: "2026-07-16T20:00:00.000Z",
      contractVersion: "1",
      modelRequestId: modelRequest.modelRequestId,
      output: {
        format: "json",
        value: {
          editorialAngle: "Pratico e sobrio, con oggetti comuni ordinati per la vendita.",
          title: "5 oggetti da vendere subito",
          visualSceneSummary: "Cinque oggetti domestici ordinati su una superficie nera, luce radente e dettagli gialli.",
        },
      },
      provider: { modelId: "gpt-4o-mini", providerId: "fake" },
      status: "succeeded",
      usage: { costUsd: 0.00006, inputTokens: 120, outputTokens: 70, totalTokens: 190 },
    });
  }
}

class FakeImageProvider implements MediaGenerationProvider {
  public readonly providerId = "fake";
  public readonly requests: MediaGenerationRequest[] = [];

  public generate(request_: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    this.requests.push(request_);
    return Promise.resolve({
      image: {
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        height: 1536,
        mimeType: "image/png",
        sha256: "a".repeat(64),
        width: 1024,
      },
      modelId: request_.modelId,
      providerId: this.providerId,
      status: "succeeded",
    });
  }
}

class FakeOpenAIImageTransport implements OpenAIImageGenerationTransport {
  public readonly requests: OpenAIImageGenerationTransportRequest[] = [];
  readonly #response: { readonly body: unknown; readonly status: number };

  public constructor(response: { readonly body: unknown; readonly status: number }) {
    this.#response = response;
  }

  public send(
    request_: OpenAIImageGenerationTransportRequest,
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    this.requests.push(request_);
    return Promise.resolve(this.#response);
  }
}

function request() {
  return {
    correlationId: "pilot-correlation-001",
    invocationId: "pilot-invocation-001",
    requestId: "pilot-request-001",
    sessionId: "pilot-session-001",
    taskId: "pilot-task-001",
    textProfileId: "openai-live-media-text",
    topic: "preparare oggetti usati con criteri osservabili",
  } as const;
}

class FakeAuthorization implements LivePilotAuthorizationPort {
  public readonly reservations: string[] = [];
  #actual = 0;

  public close(): void {
    return;
  }

  public preflight(
    _sessionId: string,
    _operation: "OPENAI_TEXT_PROVIDER_SMOKE" | "OPENAI_METODO_VELOCE_MASTER_IMAGE",
    model: string,
    maxCostUsd: number,
  ) {
    return {
      authorizedCounts: {
        image: this.reservations.filter((value) => value.includes("MASTER_IMAGE")).length,
        providerCalls: this.reservations.length,
        text: this.reservations.filter((value) => value.includes("TEXT_PROVIDER")).length,
      },
      maxCostUsd,
      model,
      residualBudgetUsd: 0.1 - this.#actual,
      status: this.reservations.length < 2 ? "ready" as const : "blocked" as const,
    };
  }

  public reconcile(
    _sessionId: string,
    _operationId: string,
    result: { readonly actualCostUsd: number; readonly status: "failed" | "succeeded" },
  ): void {
    this.#actual += result.actualCostUsd;
  }

  public reserve(input: { readonly operationId: string }): void {
    this.reservations.push(input.operationId);
  }

  public snapshot(sessionId: string) {
    return {
      actualCostUsd: this.#actual,
      actorId: "Fabio" as const,
      authorizedCounts: {
        image: this.reservations.filter((value) => value.includes("MASTER_IMAGE")).length,
        providerCalls: this.reservations.length,
        text: this.reservations.filter((value) => value.includes("TEXT_PROVIDER")).length,
      },
      dailyResidualBudgetUsd: 4 - this.#actual,
      expiresAt: "2026-07-17T10:15:00.000Z",
      liveCalls: this.reservations.length,
      reservedCostUsd: 0.011,
      sessionId,
      sessionResidualBudgetUsd: 0.1 - this.#actual,
      status: this.reservations.length === 2 ? "RELOCKED" as const : "ACTIVE" as const,
      workspaceId: "metodo-veloce-live-ai-pilot",
    };
  }
}

function imageRequest(): MediaGenerationRequest {
  return {
    contractVersion: "1",
    maxEstimatedCostUsd: 0.006,
    modelId: "gpt-image-1-mini",
    outputFormat: "png",
    prompt: "Test prompt",
    quality: "low",
    requestId: "image-request-001",
    size: "1024x1536",
  };
}
