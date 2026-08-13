import { describe, expect, it } from "vitest";

import {
  FetchOpenAIResponsesTransport,
  type OpenAIResponsesTransportRequest,
} from "../../src/index.js";

const RESPONSE_BYTE_LIMIT = 1_048_576;

describe("FetchOpenAIResponsesTransport", () => {
  it("parses a bounded JSON response and rejects redirects", async () => {
    let observedInit: RequestInit | undefined;
    const response = new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
    });
    const fetchImplementation: typeof fetch = (input, init) => {
      void input;
      observedInit = init;
      return Promise.resolve(response);
    };

    await expect(
      new FetchOpenAIResponsesTransport(fetchImplementation).send(request()),
    ).resolves.toEqual({
      body: { status: "ok" },
      status: 200,
    });
    expect(observedInit).toMatchObject({ redirect: "error" });
  });

  it("rejects an oversized declared response and cancels its body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode("{}"));
      },
    });
    const response = new Response(body, {
      headers: {
        "content-length": String(RESPONSE_BYTE_LIMIT + 1),
      },
    });

    await expect(
      new FetchOpenAIResponsesTransport(fetchReturning(response)).send(
        request(),
      ),
    ).rejects.toThrow("OpenAI response exceeds the byte limit");
    expect(cancelled).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["misleading", "2"],
  ] as const)(
    "enforces the streamed byte limit with %s Content-Length",
    async (_label, contentLength) => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        cancel: () => {
          cancelled = true;
        },
        start: (controller) => {
          controller.enqueue(new Uint8Array(700_000));
          controller.enqueue(new Uint8Array(400_000));
        },
      });
      const response = new Response(body, {
        ...(contentLength === undefined
          ? {}
          : { headers: { "content-length": contentLength } }),
      });

      await expect(
        new FetchOpenAIResponsesTransport(fetchReturning(response)).send(
          request(),
        ),
      ).rejects.toThrow("OpenAI response exceeds the byte limit");
      expect(cancelled).toBe(true);
    },
  );
});

function fetchReturning(response: Response): typeof fetch {
  return (input, init) => {
    void input;
    void init;
    return Promise.resolve(response);
  };
}

function request(): OpenAIResponsesTransportRequest {
  return {
    body: {},
    headers: {
      Authorization: "Bearer redacted-test-value",
      "Content-Type": "application/json",
    },
    method: "POST",
    timeoutMs: 1_000,
    url: "https://api.openai.com/v1/responses",
  };
}
