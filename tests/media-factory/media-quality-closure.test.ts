import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  MediaGenerationProvider,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaQualityDirectionProvider,
} from "../../src/index.js";
import {
  MediaGenerationProviderError,
  MediaQualityClosure,
  MediaQualitySessionLedger,
} from "../../src/index.js";

describe("MediaQualityClosure", () => {
  it("runs one strict direction call then one GPT Image 2 call", async () => withLedger(async (ledger) => {
    const direction = new FakeDirectionProvider();
    const image = new FakeImageProvider();
    const closure = new MediaQualityClosure({ authorization: ledger, directionProvider: direction, imageProvider: image });

    const result = await closure.run(request());

    expect(result).toMatchObject({
      cost: { imageEstimatedCostUsd: 0.17 },
      imageCalls: 1,
      status: "READY_FOR_LOCAL_RENDER",
      textCalls: 1,
    });
    expect(direction.calls).toHaveLength(1);
    expect(direction.calls[0]?.request.body).toMatchObject({
      model: "gpt-4o-mini",
      text: { format: { name: "metodo_veloce_media_direction", strict: true, type: "json_schema" } },
    });
    expect(image.calls).toHaveLength(1);
    expect(image.calls[0]).toMatchObject({ modelId: "gpt-image-2", quality: "high", size: "1024x1536" });
    expect(image.calls[0]?.prompt).not.toContain("Metodo Veloce");
    expect(image.calls[0]?.prompt).toContain("NO logo");
  }));

  it("does not generate an image when structured validation fails", async () => withLedger(async (ledger) => {
    const image = new FakeImageProvider();
    const closure = new MediaQualityClosure({
      authorization: ledger,
      directionProvider: new FakeDirectionProvider("{\"title\":\"incomplete\"}"),
      imageProvider: image,
    });

    await expect(closure.run(request())).resolves.toMatchObject({
      imageCalls: 0,
      reasonCode: "STRUCTURED_OUTPUT_VALIDATION",
      status: "BLOCKED",
    });
    expect(image.calls).toEqual([]);
  }));

  it("redacts provider failures into a precise reason code", async () => withLedger(async (ledger) => {
    const closure = new MediaQualityClosure({
      authorization: ledger,
      directionProvider: {
        execute: () => Promise.resolve({ diagnostic: { httpStatus: 401, providerCode: "invalid_api_key" }, status: "failure" }),
      },
      imageProvider: new FakeImageProvider(),
    });
    await expect(closure.run(request())).resolves.toMatchObject({ reasonCode: "PROVIDER_AUTHENTICATION", status: "BLOCKED" });
  }));

  it("never retries either transport", async () => withLedger(async (ledger) => {
    let calls = 0;
    const closure = new MediaQualityClosure({
      authorization: ledger,
      directionProvider: { execute: () => { calls += 1; return Promise.reject(new Error("network")); } },
      imageProvider: new FakeImageProvider(),
    });
    await closure.run(request());
    expect(calls).toBe(1);
  }));

  it("records one attempted image call and a precise timeout without retry", async () => withLedger(async (ledger) => {
    let calls = 0;
    const closure = new MediaQualityClosure({
      authorization: ledger,
      directionProvider: new FakeDirectionProvider(),
      imageProvider: {
        generate: () => {
          calls += 1;
          return Promise.reject(new MediaGenerationProviderError("image_transport_timeout", "redacted"));
        },
        providerId: "fake-openai",
      },
    });

    await expect(closure.run(request())).resolves.toMatchObject({
      imageCalls: 1,
      reasonCode: "IMAGE_PROVIDER_TRANSPORT_TIMEOUT",
      status: "BLOCKED",
      structuredOutput: {
        receipt: { operation: "STRUCTURED_CONTENT_DIRECTION", status: "SUCCEEDED" },
      },
      textCalls: 1,
    });
    expect(calls).toBe(1);
  }));
});

class FakeDirectionProvider implements MediaQualityDirectionProvider {
  public readonly calls: Parameters<MediaQualityDirectionProvider["execute"]>[0][] = [];
  readonly #output: string;
  public constructor(output = JSON.stringify({
    editorialAngle: "Trasformare il disordine in una checklist concreta, senza promesse.",
    hook: "Cinque categorie da controllare prima del prossimo annuncio.",
    negativeRules: ["nessun testo AI", "nessun logo", "nessun watermark", "nessun duplicato"],
    requiredObjects: ["smartphone usato", "cuffie", "sneakers", "accessorio streetwear", "piccolo oggetto di valore"],
    title: "5 oggetti da riscoprire in casa",
    visualMood: "dark luxury cinematografico",
    visualScene: "still life premium con spazio negativo",
  })) { this.#output = output; }
  public execute(input: Parameters<MediaQualityDirectionProvider["execute"]>[0]) {
    this.calls.push(input);
    return Promise.resolve({
      outputText: this.#output,
      responseFingerprint: "a".repeat(64),
      status: "success" as const,
      usage: { inputTokens: 180, outputTokens: 120, totalTokens: 300 },
    });
  }
}

class FakeImageProvider implements MediaGenerationProvider {
  public readonly calls: MediaGenerationRequest[] = [];
  public readonly providerId = "fake-openai";
  public generate(input: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    this.calls.push(input);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return Promise.resolve({
      image: { bytes, height: 1536, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex"), width: 1024 },
      modelId: input.modelId,
      providerId: this.providerId,
      status: "succeeded",
    });
  }
}

function request() {
  return {
    imageIdempotencyKey: "media-quality-image-key",
    imageOperationId: "media-quality:image",
    sessionId: "media-quality-session",
    textIdempotencyKey: "media-quality-text-key",
    textOperationId: "media-quality:text",
  };
}

async function withLedger(operation: (ledger: MediaQualitySessionLedger) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-media-closure-"));
  const ledger = new MediaQualitySessionLedger({
    clock: { now: () => new Date("2026-07-17T13:00:00.000Z") },
    path: join(directory, "ledger.sqlite"),
    priorLiveCallsToday: 3,
    priorReservedExposureUsd: 0.025,
  });
  try {
    ledger.createDisabled({ expiresAt: "2026-07-17T13:10:00.000Z", sessionId: "media-quality-session" });
    ledger.activate("media-quality-session");
    await operation(ledger);
  } finally {
    ledger.closeDatabase();
    await rm(directory, { force: true, recursive: true });
  }
}
