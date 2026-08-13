import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  OpenAIModelProvider,
  OpenAiTextFailureDiagnosis,
  OpenAiTextDiagnosticSessionLedger,
  ValidatedLlmGateway,
  type LlmGateway,
  type OpenAiTextDiagnosticAuthorizationPort,
  type OpenAiTextDiagnosticOperation,
  type OpenAiTextDiagnosticPreflight,
  type OpenAiTextDiagnosticSnapshot,
  type OpenAIResponsesTransport,
  type OpenAIResponsesTransportRequest,
  type OpenAIResponsesTransportResponse,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("OpenAI text failure diagnosis", () => {
  it("passes the plain probe before the strict structured probe through a fake transport", async () => {
    const transport = new SequentialOpenAITransport([
      response("ONLYWAY_PROVIDER_OK"),
      response(JSON.stringify({ status: "OK", title: "Diagnostica completata" })),
    ]);
    const authorization = new FakeAuthorization();
    const result = await new OpenAiTextFailureDiagnosis({
      authorization,
      gateway: gateway(transport),
    }).run(request());

    expect(result).toMatchObject({
      plainText: { status: "PASS" },
      providerStatus: "READY",
      status: "READY",
      structuredOutput: { status: "PASS" },
    });
    expect(authorization.closed).toBe(true);
    expect(authorization.reservations).toEqual([
      "OPENAI_TEXT_PLAIN_DIAGNOSTIC",
      "OPENAI_TEXT_STRUCTURED_DIAGNOSTIC",
    ]);
    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]?.body.text).toEqual({ format: { type: "text" } });
    expect(transport.requests[1]?.body.text).toMatchObject({
      format: {
        name: "mv_ai_os_output",
        strict: true,
        type: "json_schema",
      },
    });
  });

  it("classifies an authentication failure and never attempts structured output", async () => {
    const transport = new SequentialOpenAITransport([{
      body: { error: { message: "redacted" } },
      status: 401,
    }]);
    const result = await new OpenAiTextFailureDiagnosis({
      authorization: new FakeAuthorization(),
      gateway: gateway(transport),
    }).run(request());

    expect(result).toMatchObject({
      providerStatus: "BLOCKED",
      reasonCode: "PROVIDER_AUTHENTICATION",
      stage: "provider_response",
      status: "BLOCKED",
      structuredOutput: { status: "NOT_RUN" },
    });
    expect(transport.requests).toHaveLength(1);
  });

  it("classifies a malformed structured success locally without leaking its body", async () => {
    const transport = new SequentialOpenAITransport([
      response("ONLYWAY_PROVIDER_OK"),
      response(JSON.stringify({ status: "NO", title: "bad" })),
    ]);
    const result = await new OpenAiTextFailureDiagnosis({
      authorization: new FakeAuthorization(),
      gateway: gateway(transport),
    }).run(request());

    expect(result).toMatchObject({
      providerStatus: "BLOCKED",
      reasonCode: "STRUCTURED_OUTPUT_VALIDATION",
      stage: "structured_output",
      status: "BLOCKED",
      structuredOutput: { status: "BLOCKED" },
    });
  });

  it("classifies a redacted transport exception and reconciles conservatively", async () => {
    const secret = "never-expose-this";
    const transport = new SequentialOpenAITransport([
      new Error(`transport body ${secret}`),
    ]);
    const authorization = new FakeAuthorization();
    const result = await new OpenAiTextFailureDiagnosis({
      authorization,
      gateway: gateway(transport),
    }).run(request());

    expect(result).toMatchObject({
      reasonCode: "PROVIDER_HTTP_TRANSPORT",
      stage: "provider_http",
      status: "BLOCKED",
    });
    expect(authorization.reconciliations).toContainEqual(expect.objectContaining({
      costClassification: "RECONCILIATION_PENDING",
      status: "failed",
    }));
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("reports usage reconciliation when the isolated ledger cannot settle a call", async () => {
    const authorization = new FakeAuthorization({ failReconciliation: true });
    const result = await new OpenAiTextFailureDiagnosis({
      authorization,
      gateway: gateway(new SequentialOpenAITransport([response("ONLYWAY_PROVIDER_OK")])),
    }).run(request());

    expect(result).toMatchObject({
      reasonCode: "USAGE_RECONCILIATION",
      stage: "usage_reconciliation",
      status: "BLOCKED",
    });
    expect(authorization.closed).toBe(true);
  });

  it("enforces the two-call and USD 0.02 session limits in its isolated SQLite ledger", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-openai-text-diagnosis-"));
    const clock = new FixedClock("2026-07-17T10:00:00.000Z");
    const ledger = new OpenAiTextDiagnosticSessionLedger({
      clock,
      path: join(directory, "diagnosis.sqlite"),
      priorLiveCallsToday: 1,
    });
    try {
      ledger.createDisabled({
        expiresAt: "2026-07-17T10:10:00.000Z",
        sessionId: "diagnostic-ledger-001",
      });
      ledger.activate("diagnostic-ledger-001");
      expect(ledger.preflight("diagnostic-ledger-001", "OPENAI_TEXT_PLAIN_DIAGNOSTIC", "gpt-4o-mini", 0.01)).toMatchObject({
        residualBudgetUsd: 0.02,
        status: "ready",
        totalCallsToday: 1,
      });
      ledger.reserve({
        maxCostUsd: 0.01,
        model: "gpt-4o-mini",
        operation: "OPENAI_TEXT_PLAIN_DIAGNOSTIC",
        operationId: "plain-001",
        sessionId: "diagnostic-ledger-001",
      });
      ledger.reconcile({
        costClassification: "ESTIMATED",
        costUsd: 0.000004,
        operationId: "plain-001",
        sessionId: "diagnostic-ledger-001",
        status: "succeeded",
      });
      ledger.reserve({
        maxCostUsd: 0.01,
        model: "gpt-4o-mini",
        operation: "OPENAI_TEXT_STRUCTURED_DIAGNOSTIC",
        operationId: "structured-001",
        sessionId: "diagnostic-ledger-001",
      });
      expect(ledger.snapshot("diagnostic-ledger-001")).toMatchObject({
        liveCalls: 2,
        reservedCostUsd: 0.02,
        sessionResidualBudgetUsd: 0,
        status: "RELOCKED",
      });
      ledger.close("diagnostic-ledger-001");
      expect(ledger.snapshot("diagnostic-ledger-001").status).toBe("CLOSED");
    } finally {
      ledger.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });
});

class SequentialOpenAITransport implements OpenAIResponsesTransport {
  public readonly requests: OpenAIResponsesTransportRequest[] = [];
  readonly #results: readonly (Error | OpenAIResponsesTransportResponse)[];
  #index = 0;

  public constructor(results: readonly (Error | OpenAIResponsesTransportResponse)[]) {
    this.#results = results;
  }

  public send(request_: OpenAIResponsesTransportRequest): Promise<OpenAIResponsesTransportResponse> {
    this.requests.push(request_);
    const next = this.#results[this.#index];
    this.#index += 1;
    if (next instanceof Error) return Promise.reject(next);
    if (next === undefined) return Promise.reject(new Error("unexpected extra provider call"));
    return Promise.resolve(next);
  }
}

class FakeAuthorization implements OpenAiTextDiagnosticAuthorizationPort {
  public closed = false;
  public readonly reconciliations: Record<string, unknown>[] = [];
  public readonly reservations: OpenAiTextDiagnosticOperation[] = [];
  readonly #failReconciliation: boolean;

  public constructor(options: { readonly failReconciliation?: boolean } = {}) {
    this.#failReconciliation = options.failReconciliation ?? false;
  }

  public close(): void {
    this.closed = true;
  }

  public preflight(
    _sessionId: string,
    operation: OpenAiTextDiagnosticOperation,
    model: string,
    maxCostUsd: number,
  ): OpenAiTextDiagnosticPreflight {
    return {
      authorizedCalls: this.reservations.length,
      maxCostUsd,
      model,
      residualBudgetUsd: 0.02 - this.reservations.length * 0.01,
      status: this.reservations.includes(operation) || this.reservations.length >= 2 ? "blocked" : "ready",
      totalCallsToday: 1 + this.reservations.length,
    };
  }

  public reconcile(input: {
    readonly costClassification: "EFFECTIVE" | "ESTIMATED" | "RECONCILIATION_PENDING";
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void {
    if (this.#failReconciliation) throw new Error("ledger unavailable");
    this.reconciliations.push({ ...input });
  }

  public reserve(input: { readonly operation: OpenAiTextDiagnosticOperation }): void {
    this.reservations.push(input.operation);
  }

  public snapshot(sessionId: string): OpenAiTextDiagnosticSnapshot {
    return {
      estimatedCostUsd: 0.000004,
      expiresAt: "2026-07-17T10:10:00.000Z",
      liveCalls: this.reservations.length,
      priorLiveCallsToday: 1,
      reconciliationPendingCostUsd: 0,
      reservedCostUsd: this.reservations.length * 0.01,
      sessionId,
      sessionResidualBudgetUsd: 0.02 - this.reservations.length * 0.01,
      status: this.closed ? "CLOSED" : "ACTIVE",
    };
  }
}

function gateway(transport: OpenAIResponsesTransport): LlmGateway {
  const clock = new FixedClock("2026-07-17T10:00:00.000Z");
  const provider = new OpenAIModelProvider({
    clock,
    config: {
      apiKey: { contractVersion: "1", secretId: "openai-text-diagnosis", value: "local-test-secret" },
      baseUrl: "https://api.openai.com/v1",
      contractVersion: "1",
      providerId: "openai",
    },
    transport,
  });
  const profile = {
    contractVersion: "1" as const,
    limits: { maxCostUsd: 0.01, maxInputCharacters: 1_000, maxOutputTokens: 32, timeoutMs: 20_000 },
    modelId: "gpt-4o-mini",
    profileId: "openai-text-failure-diagnosis-v1",
    providerId: "openai",
    supportedOutputFormats: ["json", "text"] as const,
  };
  return new ValidatedLlmGateway({
    budgetConfig: {
      contractVersion: "1",
      required: true,
      rules: [{
        contractVersion: "1",
        maxEstimatedCostUsd: 0.01,
        maxRequestedCostUsd: 0.01,
        modelId: profile.modelId,
        profileId: profile.profileId,
        providerId: profile.providerId,
        requireEstimatedCost: true,
        requireRequestCost: true,
      }],
    },
    clock,
    operationLimits: {
      contractVersion: "1",
      maxCostUsd: 0.01,
      maxInputCharacters: 1_000,
      maxOutputTokens: 32,
      maxProviderCalls: 1,
      maxTotalTokens: 1_000,
      timeoutMs: 20_000,
    },
    profileValidator: new ModelProfileValidator(),
    providerRegistry: { get: (providerId) => providerId === "openai" ? provider : undefined },
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: { select: () => Promise.resolve(profile) },
    usageAccountingConfig: {
      contractVersion: "1",
      pricing: [{
        contractVersion: "1",
        currency: "USD",
        inputTokenUsdPerMillion: 0.15,
        modelId: profile.modelId,
        outputTokenUsdPerMillion: 0.6,
        profileId: profile.profileId,
        providerId: profile.providerId,
      }],
      required: true,
    },
  });
}

function request() {
  return {
    correlationId: "diagnosis-correlation-001",
    invocationId: "diagnosis-invocation-001",
    requestId: "diagnosis-request-001",
    sessionId: "diagnosis-session-001",
    taskId: "diagnosis-task-001",
    textProfileId: "openai-text-failure-diagnosis-v1",
  } as const;
}

function response(outputText: string): OpenAIResponsesTransportResponse {
  return {
    body: {
      created_at: 1_784_281_200,
      output_text: outputText,
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    },
    status: 200,
  };
}
