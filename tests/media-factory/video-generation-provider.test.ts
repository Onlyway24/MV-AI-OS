import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DisabledVideoGenerationProvider, VideoGenerationOperationValidator, VideoGenerationProviderError, VideoGenerationRequestValidator, bindVideoGenerationOperation, bindVideoGenerationSubmission } from "../../src/media-factory/video-generation-provider.js";

describe("provider-neutral video generation boundary", () => {
  it("fails closed without a configured provider and performs no transport fallback", async () => {
    const provider = new DisabledVideoGenerationProvider();
    expect(provider.capability()).toEqual({ providerId: "disabled-video-provider", reasonCode: "VIDEO_PROVIDER_NOT_CONFIGURED", status: "DISABLED" });
    await expect(provider.submit({ aspectRatio: "9:16", clientRequestId: "video-client-001", contractVersion: "1", durationSeconds: 15, idempotencyKey: "video-idempotency-001", maxCostUsd: 0.2, modelId: "explicit-model-required", promptFingerprint: "a".repeat(64), retryCount: 0 })).rejects.toMatchObject({ code: "video_provider_disabled", name: "VideoGenerationProviderError" });
    await expect(provider.inspect("video-operation-001")).rejects.toBeInstanceOf(VideoGenerationProviderError);
  });

  it("binds provider receipts to the exact request, budget and content hash", () => {
    const request = videoRequest();
    const bytes = new TextEncoder().encode("deterministic-video-fixture");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(new VideoGenerationRequestValidator().validate(request).ok).toBe(true);
    expect(bindVideoGenerationSubmission(request, { clientRequestId: request.clientRequestId, estimatedCostUsd: 0.12, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-001", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "QUEUED" })).toMatchObject({ operationId: "video-operation-001", status: "QUEUED" });
    expect(bindVideoGenerationOperation(request, { actualCostUsd: 0.13, clientRequestId: request.clientRequestId, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-001", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "COMPLETED", video: { bytes, mediaType: "video/mp4", sha256 } })).toMatchObject({ status: "COMPLETED", video: { sha256 } });
  });

  it("rejects budget drift, broken hashes and impossible operation shapes", () => {
    const request = videoRequest();
    expect(() => bindVideoGenerationSubmission(request, { clientRequestId: request.clientRequestId, estimatedCostUsd: 0.21, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-002", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "RUNNING" })).toThrow(VideoGenerationProviderError);
    expect(new VideoGenerationOperationValidator().validate({ actualCostUsd: 0.1, clientRequestId: request.clientRequestId, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-003", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "COMPLETED" }).ok).toBe(false);
    expect(new VideoGenerationOperationValidator().validate({ clientRequestId: request.clientRequestId, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-004", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "FAILED", video: { bytes: new Uint8Array([1]), mediaType: "video/mp4", sha256: "0".repeat(64) } }).ok).toBe(false);
    expect(() => bindVideoGenerationOperation(request, { actualCostUsd: 0.1, clientRequestId: request.clientRequestId, idempotencyKey: request.idempotencyKey, modelId: request.modelId, operationId: "video-operation-005", promptFingerprint: request.promptFingerprint, providerId: "fake-video-provider", status: "COMPLETED", video: { bytes: new Uint8Array([1]), mediaType: "video/mp4", sha256: "0".repeat(64) } })).toThrow(VideoGenerationProviderError);
  });
});

function videoRequest() {
  return { aspectRatio: "9:16", clientRequestId: "video-client-001", contractVersion: "1", durationSeconds: 15, idempotencyKey: "video-idempotency-001", maxCostUsd: 0.2, modelId: "explicit-model-required", promptFingerprint: "a".repeat(64), retryCount: 0 } as const;
}
