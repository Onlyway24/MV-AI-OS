import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildOpenAiResponsesPlainTextRequest,
  OpenAiResponsesPlainConformanceCheck,
  OpenAiResponsesPlainConformanceProvider,
  OpenAiResponsesConformanceSessionLedger,
  type OpenAiResponsesConformanceTransport,
  type OpenAiResponsesConformanceTransportRequest,
  type OpenAiResponsesConformanceTransportResponse,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("OpenAI Responses plain conformance operation", () => {
  it("sends only the canonical serialized body and the three required headers", async () => {
    const transport = new FakeTransport([successResponse()]);
    const result = await execute(transport);

    expect(result.status).toBe("PROVIDER_PLAIN_READY");
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]).toMatchObject({
      body: "{\"model\":\"gpt-4o-mini\",\"input\":\"Reply exactly with ONLYWAY_PROVIDER_OK\"}",
      method: "POST",
      url: "https://api.openai.com/v1/responses",
    });
    expect(Object.keys(transport.requests[0]?.headers ?? {})).toEqual([
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
    ]);
    expect(transport.requests[0]?.headers.Authorization).toBe("Bearer local-test-secret");
  });

  it("classifies HTTP 400 with the precise redacted provider parameter", async () => {
    const secret = "do-not-leak";
    const transport = new FakeTransport([{
      body: { error: { code: "invalid_value", message: secret, param: "input", type: "invalid_request_error" } },
      status: 400,
    }]);
    const result = await execute(transport);

    expect(result).toMatchObject({
      providerDiagnostic: { httpStatus: 400, providerParameter: "input" },
      reasonCode: "PROVIDER_INVALID_REQUEST",
      status: "BLOCKED",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("extracts output_text from a successful HTTP 200 response", async () => {
    const transport = new FakeTransport([successResponse()]);
    const result = await execute(transport);

    expect(result).toMatchObject({
      providerStatus: "READY",
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    });
  });

  it("blocks a successful response missing output without exposing it", async () => {
    const transport = new FakeTransport([{
      body: { id: "resp_01", usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } },
      status: 200,
    }]);
    const result = await execute(transport);

    expect(result).toMatchObject({
      reasonCode: "PROVIDER_RESPONSE_EXTRACTION",
      status: "BLOCKED",
    });
  });

  it("records an estimated cost only when provider usage is present", async () => {
    const result = await execute(new FakeTransport([successResponse()]));

    expect(result.ledger).toMatchObject({
      estimatedCostUsd: 0.00000195,
      reconciliationPendingCostUsd: 0,
      reservedCostUsd: 0.01,
    });
    expect(result.usage?.estimatedCostUsd).toBe(0.00000195);
  });

  it("holds the reservation for reconciliation when usage is absent", async () => {
    const transport = new FakeTransport([{
      body: { id: "resp_01", output_text: "ONLYWAY_PROVIDER_OK" },
      status: 200,
    }]);
    const result = await execute(transport);

    expect(result).toMatchObject({
      reasonCode: "USAGE_RECONCILIATION",
      status: "BLOCKED",
    });
    expect(result.ledger.reconciliationPendingCostUsd).toBe(0.01);
  });

  it("has no automatic retry after a transport failure", async () => {
    const transport = new FakeTransport([new Error("redacted transport failure")]);
    const result = await execute(transport);

    expect(result).toMatchObject({
      reasonCode: "PROVIDER_HTTP_TRANSPORT",
      status: "BLOCKED",
    });
    expect(transport.requests).toHaveLength(1);
  });

  it("closes and relocks the session so a second call is impossible after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-responses-conformance-"));
    const path = join(directory, "ledger.sqlite");
    const clock = new FixedClock("2026-07-17T11:00:00.000Z");
    const sessionId = "conformance-ledger-001";
    const ledger = new OpenAiResponsesConformanceSessionLedger({
      clock,
      path,
      priorLiveCallsToday: 2,
    });
    try {
      ledger.createDisabled({ expiresAt: "2026-07-17T11:10:00.000Z", sessionId });
      ledger.activate(sessionId);
      ledger.reserve({
        maxCostUsd: 0.01,
        model: "gpt-4o-mini",
        operationId: `${sessionId}:OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK`,
        sessionId,
      });
      ledger.reconcile({
        costClassification: "ESTIMATED",
        costUsd: 0.00000195,
        operationId: `${sessionId}:OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK`,
        sessionId,
        status: "succeeded",
      });
      ledger.close(sessionId);
      expect(ledger.snapshot(sessionId)).toMatchObject({
        liveCalls: 1,
        status: "CLOSED",
      });
    } finally {
      ledger.closeDatabase();
    }
    const reopened = new OpenAiResponsesConformanceSessionLedger({
      clock,
      path,
      priorLiveCallsToday: 2,
    });
    try {
      expect(reopened.preflight(sessionId, "gpt-4o-mini", 0.01)).toMatchObject({
        reason: "session_not_active",
        status: "blocked",
      });
    } finally {
      reopened.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not call transport when the canonical builder rejects a contaminated request", () => {
    const transport = new FakeTransport([successResponse()]);
    expect(() => buildOpenAiResponsesPlainTextRequest({
      input: "x",
      messages: [],
      model: "gpt-4o-mini",
    })).toThrow("OpenAI Responses request did not meet the canonical contract");
    expect(transport.requests).toHaveLength(0);
  });
});

async function execute(transport: FakeTransport) {
  const directory = await mkdtemp(join(tmpdir(), "mv-responses-operation-"));
  const path = join(directory, "ledger.sqlite");
  const clock = new FixedClock("2026-07-17T11:00:00.000Z");
  const sessionId = `conformance-${Math.random().toString(16).slice(2)}`;
  const ledger = new OpenAiResponsesConformanceSessionLedger({
    clock,
    path,
    priorLiveCallsToday: 2,
  });
  try {
    ledger.createDisabled({ expiresAt: "2026-07-17T11:10:00.000Z", sessionId });
    ledger.activate(sessionId);
    return await new OpenAiResponsesPlainConformanceCheck({
      authorization: ledger,
      provider: new OpenAiResponsesPlainConformanceProvider({
        apiKey: { contractVersion: "1", secretId: "test", value: "local-test-secret" },
        baseUrl: "https://api.openai.com/v1",
        transport,
      }),
    }).run({
      idempotencyKey: "a".repeat(64),
      operationId: `${sessionId}:OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK`,
      request: buildOpenAiResponsesPlainTextRequest({
        input: "Reply exactly with ONLYWAY_PROVIDER_OK",
        model: "gpt-4o-mini",
      }),
      sessionId,
    });
  } finally {
    ledger.closeDatabase();
    await rm(directory, { force: true, recursive: true });
  }
}

class FakeTransport implements OpenAiResponsesConformanceTransport {
  public readonly requests: OpenAiResponsesConformanceTransportRequest[] = [];
  readonly #responses: readonly (Error | OpenAiResponsesConformanceTransportResponse)[];
  #index = 0;

  public constructor(responses: readonly (Error | OpenAiResponsesConformanceTransportResponse)[]) {
    this.#responses = responses;
  }

  public send(request: OpenAiResponsesConformanceTransportRequest): Promise<OpenAiResponsesConformanceTransportResponse> {
    this.requests.push(request);
    const response = this.#responses[this.#index];
    this.#index += 1;
    if (response instanceof Error) return Promise.reject(response);
    if (response === undefined) return Promise.reject(new Error("unexpected retry"));
    return Promise.resolve(response);
  }
}

function successResponse(): OpenAiResponsesConformanceTransportResponse {
  return {
    body: {
      id: "resp_01",
      output_text: "ONLYWAY_PROVIDER_OK",
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    },
    status: 200,
  };
}
