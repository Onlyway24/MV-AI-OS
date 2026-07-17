import { describe, expect, it } from "vitest";

import {
  buildOpenAiResponsesPlainTextRequest,
  buildOpenAiResponsesStructuredOutputRequest,
  OpenAiResponsesRequestConformanceError,
} from "../../src/index.js";

describe("OpenAI Responses canonical request builder", () => {
  it("creates the exact plain-text golden object", () => {
    const request = buildOpenAiResponsesPlainTextRequest({
      input: "Reply exactly with ONLYWAY_PROVIDER_OK",
      model: "gpt-4o-mini",
    });

    expect(request.body).toEqual({
      input: "Reply exactly with ONLYWAY_PROVIDER_OK",
      model: "gpt-4o-mini",
    });
    expect(request.serializedBody).toBe(
      "{\"model\":\"gpt-4o-mini\",\"input\":\"Reply exactly with ONLYWAY_PROVIDER_OK\"}",
    );
  });

  it("declares POST, /v1/responses and application/json without body values", () => {
    const request = plain();

    expect(request.manifest).toMatchObject({
      contentType: "application/json",
      endpoint: "/v1/responses",
      fieldNames: ["model", "input"],
      method: "POST",
      operationType: "PLAIN_TEXT_V1",
    });
    expect(JSON.stringify(request.manifest)).not.toContain("ONLYWAY_PROVIDER_OK");
  });

  it("keeps secrets out of the request shape manifest", () => {
    const request = plain();
    const serialized = JSON.stringify(request.manifest);

    expect(serialized).not.toContain("local-test-secret");
    expect(request.manifest.headerNames).toEqual([
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
    ]);
  });

  it("removes undefined fields before allowlist evaluation", () => {
    const request = buildOpenAiResponsesPlainTextRequest({
      input: "Reply exactly with ONLYWAY_PROVIDER_OK",
      model: "gpt-4o-mini",
      unused: undefined,
    });

    expect(Object.keys(request.body)).toEqual(["model", "input"]);
  });

  it("rejects null field values", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: null, model: "gpt-4o-mini" }),
      "RESPONSES_REQUEST_NULL_NOT_ALLOWED",
      "input",
    );
  });

  it("rejects absent or empty required values", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: "", model: "gpt-4o-mini" }),
      "RESPONSES_REQUEST_INVALID",
      "input",
    );
  });

  it("blocks messages before a transport can be selected", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: "x", messages: [], model: "gpt-4o-mini" }),
      "RESPONSES_REQUEST_FIELD_NOT_ALLOWED",
      "messages",
    );
  });

  it("blocks response_format before transport", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: "x", model: "gpt-4o-mini", response_format: {} }),
      "RESPONSES_REQUEST_FIELD_NOT_ALLOWED",
      "response_format",
    );
  });

  it("blocks max_tokens before transport", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: "x", max_tokens: 12, model: "gpt-4o-mini" }),
      "RESPONSES_REQUEST_FIELD_NOT_ALLOWED",
      "max_tokens",
    );
  });

  it("blocks all Chat Completions-only fields before transport", () => {
    for (const field of ["max_completion_tokens", "n", "logprobs", "functions", "function_call"]) {
      expectConformanceError(
        () => buildOpenAiResponsesPlainTextRequest({ input: "x", model: "gpt-4o-mini", [field]: true }),
        "RESPONSES_REQUEST_FIELD_NOT_ALLOWED",
        field,
      );
    }
  });

  it("rejects unknown fields", () => {
    expectConformanceError(
      () => buildOpenAiResponsesPlainTextRequest({ input: "x", model: "gpt-4o-mini", temperature: 0 }),
      "RESPONSES_REQUEST_UNKNOWN_FIELD",
      "temperature",
    );
  });

  it("creates the canonical offline-only Structured Output contract", () => {
    const request = buildOpenAiResponsesStructuredOutputRequest({
      input: "offline-only",
      model: "gpt-4o-mini",
    });

    expect(request.body).toEqual({
      input: "offline-only",
      model: "gpt-4o-mini",
      text: {
        format: {
          name: "onlyway_provider_status",
          schema: {
            additionalProperties: false,
            properties: {
              status: { enum: ["OK"], type: "string" },
              title: { type: "string" },
            },
            required: ["status", "title"],
            type: "object",
          },
          strict: true,
          type: "json_schema",
        },
      },
    });
    expect(request.manifest.operationType).toBe("STRUCTURED_OUTPUT_V1");
  });

  it("has a stable safe fingerprint on refresh", () => {
    expect(plain().manifest.fingerprint).toBe(plain().manifest.fingerprint);
  });
});

function plain() {
  return buildOpenAiResponsesPlainTextRequest({
    input: "Reply exactly with ONLYWAY_PROVIDER_OK",
    model: "gpt-4o-mini",
  });
}

function expectConformanceError(
  operation: () => unknown,
  code: OpenAiResponsesRequestConformanceError["code"],
  field: string,
): void {
  try {
    operation();
    throw new Error("Expected a conformance error");
  } catch (error) {
    expect(error).toBeInstanceOf(OpenAiResponsesRequestConformanceError);
    expect(error).toMatchObject({ code, field });
  }
}
