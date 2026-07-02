import { describe, expect, it } from "vitest";

import {
  ModelResponseValidator,
  type ModelResponse,
} from "../../src/index.js";

describe("ModelResponseValidator", () => {
  const validator = new ModelResponseValidator();

  it("accepts successful and failed model responses", () => {
    expect(validator.validate(successResponse()).ok).toBe(true);
    expect(
      validator.validate({
        completedAt: "2026-07-02T10:00:01.000Z",
        contractVersion: "1",
        error: {
          category: "provider",
          code: "provider_failed",
          message: "Provider failed",
          occurredAt: "2026-07-02T10:00:01.000Z",
          retryable: true,
          stage: "provider_invocation",
        },
        modelRequestId: "model-request-001",
        status: "failed",
      }).ok,
    ).toBe(true);
  });

  it("rejects inconsistent status fields and token totals", () => {
    const result = validator.validate({
      ...successResponse(),
      error: {
        category: "provider",
        code: "unexpected",
        message: "Unexpected",
        occurredAt: "2026-07-02T10:00:01.000Z",
        retryable: false,
        stage: "provider_invocation",
      },
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 99,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "forbidden",
            path: "error",
          }),
          expect.objectContaining({
            code: "invalid_value",
            path: "usage.totalTokens",
          }),
        ]),
      );
    }
  });
});

function successResponse(): ModelResponse {
  return {
    completedAt: "2026-07-02T10:00:01.000Z",
    contractVersion: "1",
    modelRequestId: "model-request-001",
    output: {
      format: "text",
      text: "Deterministic response",
    },
    provider: {
      modelId: "deterministic-model-v1",
      providerId: "deterministic",
    },
    status: "succeeded",
    usage: {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    },
  };
}
