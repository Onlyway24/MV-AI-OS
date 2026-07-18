import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ImageRecovery, recoveredValidatedDirection } from "../../src/media-factory/image-recovery.js";
import { ImageRecoverySessionLedger } from "../../src/media-factory/image-recovery-session-ledger.js";
import {
  MediaGenerationProviderError,
  type MediaGenerationProvider,
  type MediaGenerationRequest,
  type MediaGenerationResponse,
} from "../../src/media-factory/media-generation-provider.js";
import {
  OpenAIImageGenerationProvider,
  type OpenAIImageGenerationTransportRequest,
} from "../../src/media-factory/openai-image-generation-provider.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("image recovery session", () => {
  it("relocks atomically after one reservation and remains consumed after restart", async () => {
    const { ledger, path } = await ledgerAt();
    ledger.createDisabled({ expiresAt: "2026-07-18T12:10:00.000Z", sessionId: "session-a" });
    ledger.activate("session-a");
    ledger.reserve({
      clientRequestId: "client-a",
      idempotencyKeyFingerprint: "a".repeat(64),
      maxCostUsd: 0.3,
      modelId: "gpt-image-2-2026-04-21",
      operationId: "operation-a",
      requestFingerprint: "b".repeat(64),
      sessionId: "session-a",
    });
    expect(ledger.snapshot("session-a")).toMatchObject({ callCount: 1, status: "RELOCKED" });
    expect(ledger.preflight({ maxCostUsd: 0.3, sessionId: "session-a" })).toMatchObject({ status: "blocked" });
    ledger.closeDatabase();

    const restarted = new ImageRecoverySessionLedger({
      clock: fixedClock(),
      path,
      priorLiveCallsToday: 0,
      priorPendingExposureUsd: 0.2,
    });
    expect(restarted.snapshot("session-a")).toMatchObject({ callCount: 1, status: "RELOCKED" });
    restarted.closeDatabase();
  });

  it("uses the authorized snapshot, records request IDs and estimates from usage", async () => {
    const { ledger } = await activeLedger("session-b");
    const provider = new FakeProvider({
      image: png(),
      modelId: "gpt-image-2-2026-04-21",
      providerId: "openai",
      providerReceipt: {
        usage: { inputTextTokens: 100, inputTokens: 100, outputImageTokens: 5_500, outputTokens: 5_500, totalTokens: 5_600 },
        xClientRequestId: "client-b",
        xRequestId: "req-provider-b",
      },
      status: "succeeded",
    });
    const result = await new ImageRecovery({ ledger, provider }).run({
      clientRequestId: "client-b",
      direction: recoveredValidatedDirection(),
      idempotencyKey: "idem-b",
      operationId: "operation-b",
      sessionId: "session-b",
    });
    expect(result).toMatchObject({ estimatedCostUsd: 0.1655, status: "READY_FOR_LOCAL_RENDER" });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({ clientRequestId: "client-b", modelId: "gpt-image-2-2026-04-21", quality: "high", size: "1024x1536" });
    expect(ledger.receipt("operation-b")).toMatchObject({ status: "succeeded", xRequestId: "req-provider-b" });
    expect(ledger.snapshot("session-b")).toMatchObject({ callCount: 1, status: "CLOSED" });
    ledger.closeDatabase();
  });

  it("classifies a second timeout as uncertain and makes another call impossible", async () => {
    const { ledger } = await activeLedger("session-c");
    const provider = new FakeProvider(new MediaGenerationProviderError(
      "image_transport_timeout",
      "redacted",
      { xClientRequestId: "client-c" },
    ));
    const recovery = new ImageRecovery({ ledger, provider });
    const first = await recovery.run({
      clientRequestId: "client-c",
      direction: recoveredValidatedDirection(),
      idempotencyKey: "idem-c",
      operationId: "operation-c",
      sessionId: "session-c",
    });
    expect(first).toMatchObject({ reasonCode: "IMAGE_PROVIDER_TRANSPORT_TIMEOUT", status: "BLOCKED" });
    expect(first.receipt).toMatchObject({ costClassification: "RECONCILIATION_PENDING", status: "UNCERTAIN" });
    await expect(recovery.run({
      clientRequestId: "client-c-2",
      direction: recoveredValidatedDirection(),
      idempotencyKey: "idem-c-2",
      operationId: "operation-c-2",
      sessionId: "session-c",
    })).rejects.toMatchObject({ code: "image_recovery_blocked" });
    expect(provider.requests).toHaveLength(1);
    ledger.closeDatabase();
  });

  it("sends X-Client-Request-Id and records the provider request ID without response bodies", async () => {
    const requests: OpenAIImageGenerationTransportRequest[] = [];
    const provider = new OpenAIImageGenerationProvider({
      config: { apiKey: { contractVersion: "1", secretId: "test", value: "test-secret" }, baseUrl: "https://api.openai.test/v1" },
      transport: {
        send: (request) => {
          requests.push(request);
          return Promise.resolve({
            body: {
              created: 1_700_000_000,
              data: [{ b64_json: Buffer.from(png().bytes).toString("base64") }],
              usage: { input_tokens: 10, input_tokens_details: { text_tokens: 10 }, output_tokens: 20, output_tokens_details: { image_tokens: 20 }, total_tokens: 30 },
            },
            headers: { xRequestId: "req-provider-d" },
            status: 200,
          });
        },
      },
    });
    const response = await provider.generate({
      clientRequestId: "client-d",
      contractVersion: "1",
      maxEstimatedCostUsd: 0.3,
      modelId: "gpt-image-2-2026-04-21",
      outputFormat: "png",
      prompt: "safe prompt",
      quality: "high",
      requestId: "idempotency-d",
      size: "1024x1536",
    });
    expect(requests[0]?.headers).toMatchObject({ "Idempotency-Key": "idempotency-d", "X-Client-Request-Id": "client-d" });
    expect(response).toMatchObject({ providerReceipt: { xClientRequestId: "client-d", xRequestId: "req-provider-d" }, status: "succeeded" });
  });
});

class FakeProvider implements MediaGenerationProvider {
  public readonly providerId = "openai";
  public readonly requests: MediaGenerationRequest[] = [];
  readonly #result: Error | MediaGenerationResponse;
  public constructor(result: Error | MediaGenerationResponse) { this.#result = result; }
  public generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    this.requests.push(request);
    return this.#result instanceof Error ? Promise.reject(this.#result) : Promise.resolve(this.#result);
  }
}

async function ledgerAt() {
  const root = await mkdtemp(join(tmpdir(), "mv-image-recovery-"));
  roots.push(root);
  const path = join(root, "ledger.sqlite");
  return {
    ledger: new ImageRecoverySessionLedger({ clock: fixedClock(), path, priorLiveCallsToday: 0, priorPendingExposureUsd: 0.2 }),
    path,
  };
}

async function activeLedger(sessionId: string) {
  const result = await ledgerAt();
  result.ledger.createDisabled({ expiresAt: "2026-07-18T12:10:00.000Z", sessionId });
  result.ledger.activate(sessionId);
  return result;
}

function fixedClock() { return { now: (): Date => new Date("2026-07-18T12:00:00.000Z") }; }
function png() {
  const bytes = Buffer.alloc(16);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  return { bytes, height: 1536, mimeType: "image/png" as const, sha256: "c".repeat(64), width: 1024 };
}
