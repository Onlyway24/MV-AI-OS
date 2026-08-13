import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import { DeterministicFakeTrendTransport, type FakeTrendTransportOutcome } from "../../src/trend-intelligence/fake-trend-source-transport.js";
import { MAX_TREND_RECEIPTS, TREND_INTELLIGENCE_CONTRACT_VERSION, type TrendAcquisitionRequest, type TrendSourceConnectionProfile, type TrendSourceTransport, type TrendTransportResponse } from "../../src/trend-intelligence/trend-intelligence-contract.js";
import { TrendSourceConnector, TrendTransportTimeoutError } from "../../src/trend-intelligence/trend-source-connector.js";
import { preflightTrendSource } from "../../src/trend-intelligence/trend-source-preflight.js";

const NOW = "2026-07-25T10:00:00.000Z";
const QUERY = createHash("sha256").update("methodo veloce").digest("hex");

describe("TrendSourceConnector", () => {
  it("normalizes a successful response and emits a deeply frozen redacted zero-paid-call receipt", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = configuredConnector(transport);
    const output = await connector.acquire(request());

    expect(output.receipt).toMatchObject({
      actorId: "fabio",
      cost: { amountUsd: 0, classification: "NO_PAID_CALL" },
      diagnostic: { reasonCode: "REQUEST_COMPLETED", stage: "VALIDATION", statusCode: 200 },
      externalEffectOccurred: false,
      externalWrites: "LOCKED",
      itemCount: 1,
      publication: "LOCKED",
      rawPayloadStored: false,
      retryCount: 0,
      secretMaterialStored: false,
      status: "COMPLETED",
      workspaceId: "onlyway",
    });
    expect(output.signals[0]).toMatchObject({
      evidenceKind: "SEARCH_TERM",
      sourceId: "trend-gdelt",
      sourceKey: "GDELT",
      topic: "Metodo Veloce",
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.receipt.diagnostic)).toBe(true);
    expect(Object.isFrozen(output.signals[0]?.tags)).toBe(true);
    expect(JSON.stringify(output.receipt)).not.toContain("idem-one");
    expect(JSON.stringify(output.receipt)).not.toContain("items");
    expect(transport.acquisitionCalls()).toHaveLength(1);
    expect(transport.acquisitionCalls()[0]).toMatchObject({ retryCount: 0, sourceKey: "GDELT" });
  });

  it("accepts an empty 200 result and replays it as a successful zero-paid-call observation", async () => {
    const transport = fake({ kind: "RESPONSE", response: { body: { items: [] }, statusCode: 200 } });
    const connector = configuredConnector(transport);

    const first = await connector.acquire(request());
    expect(first).toMatchObject({
      receipt: {
        cost: { amountUsd: 0, classification: "NO_PAID_CALL" },
        itemCount: 0,
        status: "COMPLETED",
      },
      signals: [],
    });

    const replay = await connector.acquire(request());
    expect(replay).toMatchObject({
      receipt: {
        diagnostic: { reasonCode: "IDEMPOTENT_REPLAY" },
        itemCount: 0,
        replayOfReceiptId: first.receipt.receiptId,
        status: "REPLAYED",
      },
      signals: [],
    });
    expect(transport.acquisitionCalls()).toHaveLength(1);
  });

  it("serializes concurrent requests with the same idempotency binding", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = configuredConnector(transport);
    const [first, replay] = await Promise.all([
      connector.acquire(request()),
      connector.acquire(request()),
    ]);

    expect(first.receipt.status).toBe("COMPLETED");
    expect(replay.receipt).toMatchObject({
      replayOfReceiptId: first.receipt.receiptId,
      status: "REPLAYED",
    });
    expect(transport.acquisitionCalls()).toHaveLength(1);
  });

  it("blocks a registry-only profile because registration never implies connector readiness", async () => {
    const profile = configuredProfile({ accessGrants: [] });
    const preflight = preflightTrendSource(profile);
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = new TrendSourceConnector({ now: clock, profile, transport });

    expect(preflight).toMatchObject({ capabilityState: "BLOCKED", executionEligible: false, sourceRegistered: true });
    expect(preflight.reasonCodes).toContain("ACCESS_GRANT_MISSING");
    const output = await connector.acquire(request());
    expect(output.receipt.diagnostic.reasonCode).toBe("PREFLIGHT_BLOCKED");
    expect(output.receipt.status).toBe("BLOCKED");
    expect(transport.acquisitionCalls()).toHaveLength(0);
  });

  it("uses the catalog source ID for a blocked unregistered preflight receipt", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const { sourceRegistryEntry: _registry, ...unregisteredProfile } = configuredProfile();
    expect(_registry).toBeDefined();
    const connector = new TrendSourceConnector({
      now: clock,
      profile: unregisteredProfile,
      transport,
    });

    const output = await connector.acquire(request());
    expect(output.receipt).toMatchObject({
      diagnostic: { reasonCode: "PREFLIGHT_BLOCKED", stage: "PREFLIGHT" },
      sourceId: "trend-gdelt",
      status: "BLOCKED",
    });
    expect(transport.acquisitionCalls()).toHaveLength(0);
  });

  it("uses the catalog source ID when a mismatched registry entry blocks preflight", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = new TrendSourceConnector({
      now: clock,
      profile: configuredProfile({
        sourceRegistryEntry: registry({
          canonicalReference: "https://export.arxiv.org/api/",
          sourceId: "trend-arxiv",
        }),
      }),
      transport,
    });

    const output = await connector.acquire(request());
    expect(output.receipt).toMatchObject({
      diagnostic: { reasonCode: "PREFLIGHT_BLOCKED", stage: "PREFLIGHT" },
      sourceId: "trend-gdelt",
      sourceKey: "GDELT",
      status: "BLOCKED",
    });
    expect(transport.acquisitionCalls()).toHaveLength(0);
  });

  it("rejects an unsafe transport ID before any request or receipt exists", () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const unsafeTransport = {
      acquire: transport.acquire.bind(transport),
      reconcile: transport.reconcile.bind(transport),
      transportId: "https://provider.example/token=raw",
    };

    expect(() => new TrendSourceConnector({
      now: clock,
      profile: configuredProfile(),
      transport: unsafeTransport,
    })).toThrow("Trend source transport ID is invalid");
  });

  it("checks receipt capacity and clock before dispatching transport", async () => {
    const acquisitions = Object.fromEntries(Array.from(
      { length: MAX_TREND_RECEIPTS + 1 },
      (_, index) => [
        `trend-request-${String(index)}`,
        { kind: "RESPONSE", response: { body: { items: [] }, statusCode: 200 } } as const,
      ],
    ));
    const transport = new DeterministicFakeTrendTransport({ acquisitions });
    const connector = configuredConnector(transport);
    for (let index = 0; index < MAX_TREND_RECEIPTS; index += 1) {
      await connector.acquire(request({
        clientRequestId: `trend-request-${String(index)}`,
        idempotencyKey: `idem-${String(index)}`,
        queryFingerprint: createHash("sha256").update(`query-${String(index)}`).digest("hex"),
      }));
    }

    await expect(connector.acquire(request({
      clientRequestId: `trend-request-${String(MAX_TREND_RECEIPTS)}`,
      idempotencyKey: `idem-${String(MAX_TREND_RECEIPTS)}`,
      queryFingerprint: createHash("sha256").update("query-over-limit").digest("hex"),
    }))).rejects.toMatchObject({ code: "RECEIPT_LIMIT_REACHED" });
    expect(transport.acquisitionCalls()).toHaveLength(MAX_TREND_RECEIPTS);

    const invalidClockTransport = fake({ kind: "RESPONSE", response: successResponse() });
    const invalidClockConnector = new TrendSourceConnector({
      now: () => new Date(Number.NaN),
      profile: configuredProfile(),
      transport: invalidClockTransport,
    });
    await expect(invalidClockConnector.acquire(request())).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(invalidClockTransport.acquisitionCalls()).toHaveLength(0);
  });

  it("enforces the local timeout and releases the serialized queue for the next request", async () => {
    const calls: string[] = [];
    const transport: TrendSourceTransport = {
      acquire: (transportRequest) => {
        calls.push(transportRequest.clientRequestId);
        if (transportRequest.clientRequestId === "trend-request-one") {
          return new Promise<TrendTransportResponse>(() => undefined);
        }
        return Promise.resolve({ body: { items: [] }, statusCode: 200 });
      },
      reconcile: () => Promise.resolve({ statusCode: 500 }),
      transportId: "hung-then-success-transport",
    };
    const connector = configuredConnector(transport);
    const first = connector.acquire(request({ timeoutMs: 100 }));
    const second = connector.acquire(request({
      clientRequestId: "trend-request-two",
      idempotencyKey: "idem-two",
      queryFingerprint: createHash("sha256").update("query-two").digest("hex"),
      timeoutMs: 100,
    }));

    const [timedOut, completed] = await Promise.all([first, second]);
    expect(timedOut.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "TRANSPORT" },
      status: "UNCERTAIN",
    });
    expect(completed.receipt).toMatchObject({
      diagnostic: { reasonCode: "REQUEST_COMPLETED" },
      status: "COMPLETED",
    });
    expect(calls).toEqual(["trend-request-one", "trend-request-two"]);
    expect(connector.receipts().map(({ sequence }) => sequence)).toEqual([1, 2]);
  });

  it("rejects any paid-call cap, retry request or incompatible contract before transport", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = configuredConnector(transport);
    const unsafeRequests: readonly TrendAcquisitionRequest[] = [
      { ...request(), maxCostUsd: 0.01 } as unknown as TrendAcquisitionRequest,
      { ...request(), retryCount: 1 } as unknown as TrendAcquisitionRequest,
      { ...request(), contractVersion: "2" } as unknown as TrendAcquisitionRequest,
    ];

    for (const candidate of unsafeRequests) {
      await expect(connector.acquire(candidate)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    }
    expect(transport.acquisitionCalls()).toHaveLength(0);
  });

  it.each([
    [400, "PROVIDER_INVALID_REQUEST", "FAILED"],
    [401, "AUTHENTICATION_REQUIRED", "BLOCKED"],
    [403, "AUTHORIZATION_REQUIRED", "BLOCKED"],
    [429, "PROVIDER_RATE_LIMITED", "FAILED"],
    [500, "PROVIDER_UNAVAILABLE", "FAILED"],
    [503, "PROVIDER_UNAVAILABLE", "FAILED"],
  ] as const)("classifies HTTP %i without retry as %s", async (statusCode, reasonCode, status) => {
    const transport = fake({ kind: "RESPONSE", response: { statusCode } });
    const output = await configuredConnector(transport).acquire(request());

    expect(output.receipt).toMatchObject({
      diagnostic: { reasonCode, stage: "TRANSPORT", statusCode },
      retryCount: 0,
      status,
    });
    expect(output.signals).toEqual([]);
    expect(transport.acquisitionCalls()).toHaveLength(1);
  });

  it("fails closed on an invalid 200 schema and duplicate provider items", async () => {
    const invalid = await configuredConnector(fake({
      kind: "RESPONSE",
      response: { body: { items: [{ raw: "provider-secret-payload" }] }, statusCode: 200 },
    })).acquire(request());
    expect(invalid.receipt.diagnostic.reasonCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(JSON.stringify(invalid.receipt)).not.toContain("provider-secret-payload");

    const item = transportItem();
    const duplicate = await configuredConnector(fake({
      kind: "RESPONSE",
      response: { body: { items: [item, { ...item, topic: "Altro titolo" }] }, statusCode: 200 },
    })).acquire(request({ maxItems: 2 }));
    expect(duplicate.receipt.diagnostic.reasonCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(duplicate.signals).toEqual([]);
  });

  it("enforces the narrower Source Registry path boundary for provider references", async () => {
    const transport = fake({
      kind: "RESPONSE",
      response: { body: { items: [transportItem()] }, statusCode: 200 },
    });
    const connector = new TrendSourceConnector({
      now: clock,
      profile: configuredProfile({
        sourceRegistryEntry: registry({ canonicalReference: "https://api.gdeltproject.org/api/v2/doc/authorized/" }),
      }),
      transport,
    });

    const output = await connector.acquire(request());
    expect(output.receipt.diagnostic.reasonCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(output.signals).toEqual([]);
  });

  it.each([
    ["provider query", { providerReference: "https://api.gdeltproject.org/api/v2/doc/item-one?token=redacted" }],
    ["provider hash", { providerReference: "https://api.gdeltproject.org/api/v2/doc/item-one#fragment" }],
    ["provider credentials", { providerReference: "https://user:password@api.gdeltproject.org/api/v2/doc/item-one" }],
    ["evidence query", { evidenceReference: "https://evidence.example/item?key=redacted" }],
    ["evidence hash", { evidenceReference: "https://evidence.example/item#fragment" }],
    ["evidence credentials", { evidenceReference: "https://user:password@evidence.example/item" }],
  ] as const)("rejects persisted %s URL material", async (_label, overrides) => {
    const item = { ...transportItem(), ...overrides };
    const output = await configuredConnector(fake({
      kind: "RESPONSE",
      response: { body: { items: [item] }, statusCode: 200 },
    })).acquire(request());

    expect(output.receipt.diagnostic.reasonCode).toBe("INVALID_PROVIDER_RESPONSE");
    expect(JSON.stringify(output.receipt)).not.toContain("redacted");
  });

  it("redacts transport failures and performs no automatic retry", async () => {
    const transport = fake({ kind: "FAILURE" });
    const output = await configuredConnector(transport).acquire(request());

    expect(output.receipt).toMatchObject({
      diagnostic: { reasonCode: "TRANSPORT_FAILED", stage: "TRANSPORT" },
      rawPayloadStored: false,
      retryCount: 0,
      status: "FAILED",
    });
    expect(transport.acquisitionCalls()).toHaveLength(1);
  });

  it("keeps an unknown post-dispatch transport error UNCERTAIN and redacts its details", async () => {
    const transport: TrendSourceTransport = {
      acquire: () => Promise.reject(new Error("socket reset after token sk-proj-sensitive was dispatched")),
      reconcile: () => Promise.resolve({ statusCode: 500 }),
      transportId: "unknown-error-transport",
    };
    const output = await configuredConnector(transport).acquire(request());

    expect(output.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "TRANSPORT" },
      status: "UNCERTAIN",
    });
    expect(JSON.stringify(output.receipt)).not.toContain("sk-proj-sensitive");
  });

  it("records timeout as UNCERTAIN and reconciles exactly once before replaying the terminal result", async () => {
    const transport = new DeterministicFakeTrendTransport({
      acquisitions: { "trend-request-one": { kind: "TIMEOUT", operationId: "provider-operation-one" } },
      reconciliations: { "provider-operation-one": { kind: "RESPONSE", response: successResponse() } },
    });
    const connector = configuredConnector(transport);
    const uncertain = await connector.acquire(request());

    expect(uncertain.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING" },
      providerOperationId: "provider-operation-one",
      status: "UNCERTAIN",
    });

    const pendingReplay = await connector.acquire(request());
    expect(pendingReplay.receipt.receiptId).toBe(uncertain.receipt.receiptId);
    expect(pendingReplay.receipt.cost).toEqual({ classification: "RECONCILIATION_PENDING" });
    expect(connector.receipts()).toHaveLength(1);

    const [reconciled, reconciliationReplay] = await Promise.all([
      connector.reconcile(uncertain.receipt.receiptId),
      connector.reconcile(uncertain.receipt.receiptId),
    ]);
    expect(reconciled.receipt).toMatchObject({
      cost: { amountUsd: 0, classification: "NO_PAID_CALL" },
      diagnostic: { reasonCode: "RECONCILIATION_COMPLETED", stage: "RECONCILIATION" },
      reconcilesReceiptId: uncertain.receipt.receiptId,
      status: "RECONCILED",
    });
    expect(reconciled.signals).toHaveLength(1);

    expect(reconciliationReplay.receipt).toMatchObject({
      diagnostic: { reasonCode: "IDEMPOTENT_REPLAY" },
      replayOfReceiptId: reconciled.receipt.receiptId,
      status: "REPLAYED",
    });

    const replay = await connector.acquire(request());
    expect(replay.receipt).toMatchObject({
      diagnostic: { reasonCode: "IDEMPOTENT_REPLAY" },
      replayOfReceiptId: reconciled.receipt.receiptId,
      status: "REPLAYED",
    });
    expect(replay.signals).toEqual(reconciled.signals);
    expect(transport.acquisitionCalls()).toHaveLength(1);
    expect(transport.reconciliationCalls()).toHaveLength(1);
    expect(connector.receipts().map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
  });

  it("does not repeat a reconciliation that already ended BLOCKED", async () => {
    const transport = new DeterministicFakeTrendTransport({
      acquisitions: { "trend-request-one": { kind: "TIMEOUT", operationId: "provider-operation-one" } },
      reconciliations: {
        "provider-operation-one": {
          kind: "RESPONSE",
          response: { statusCode: 401 },
        },
      },
    });
    const connector = configuredConnector(transport);
    const uncertain = await connector.acquire(request());
    const blocked = await connector.reconcile(uncertain.receipt.receiptId);
    const replay = await connector.reconcile(uncertain.receipt.receiptId);

    expect(blocked.receipt).toMatchObject({
      diagnostic: {
        reasonCode: "AUTHENTICATION_REQUIRED",
        stage: "RECONCILIATION",
      },
      reconcilesReceiptId: uncertain.receipt.receiptId,
      status: "BLOCKED",
    });
    expect(replay.receipt.receiptId).toBe(blocked.receipt.receiptId);
    expect(transport.reconciliationCalls()).toHaveLength(1);
  });

  it("keeps reconciliation pending when a timeout has no provider operation ID", async () => {
    const transport = fake({ kind: "TIMEOUT" });
    const connector = configuredConnector(transport);
    const uncertain = await connector.acquire(request());
    const reconciled = await connector.reconcile(uncertain.receipt.receiptId);

    expect(reconciled.receipt.receiptId).toBe(uncertain.receipt.receiptId);
    expect(reconciled.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "TRANSPORT" },
      status: "UNCERTAIN",
    });
    expect(connector.receipts()).toHaveLength(1);
    expect(transport.reconciliationCalls()).toHaveLength(0);
  });

  it("does not restart a locally timed-out reconciliation through either the root or child receipt", async () => {
    let reconciliationCalls = 0;
    const transport: TrendSourceTransport = {
      acquire: () => Promise.reject(new TrendTransportTimeoutError("provider-operation-one")),
      reconcile: () => {
        reconciliationCalls += 1;
        return new Promise<TrendTransportResponse>(() => undefined);
      },
      transportId: "hung-reconciliation-transport",
    };
    const connector = configuredConnector(transport);
    const uncertain = await connector.acquire(request({ timeoutMs: 100 }));
    const reconciliation = await connector.reconcile(uncertain.receipt.receiptId);
    const rootReplay = await connector.reconcile(uncertain.receipt.receiptId);
    const childReplay = await connector.reconcile(reconciliation.receipt.receiptId);

    expect(reconciliation.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "RECONCILIATION" },
      reconcilesReceiptId: uncertain.receipt.receiptId,
      status: "UNCERTAIN",
    });
    expect(rootReplay.receipt.receiptId).toBe(reconciliation.receipt.receiptId);
    expect(childReplay.receipt.receiptId).toBe(reconciliation.receipt.receiptId);
    expect(reconciliationCalls).toBe(1);
    expect(connector.receipts()).toHaveLength(2);
  });

  it("keeps the original operation pending when reconciliation proves only that its own dispatch did not occur", async () => {
    const transport = new DeterministicFakeTrendTransport({
      acquisitions: {
        "trend-request-one": { kind: "TIMEOUT", operationId: "provider-operation-one" },
      },
      reconciliations: {
        "provider-operation-one": { kind: "FAILURE" },
      },
    });
    const connector = configuredConnector(transport);
    const uncertain = await connector.acquire(request());
    const reconciliation = await connector.reconcile(uncertain.receipt.receiptId);
    const replay = await connector.reconcile(uncertain.receipt.receiptId);

    expect(reconciliation.receipt).toMatchObject({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "RECONCILIATION" },
      providerOperationId: "provider-operation-one",
      reconcilesReceiptId: uncertain.receipt.receiptId,
      status: "UNCERTAIN",
    });
    expect(replay.receipt.receiptId).toBe(reconciliation.receipt.receiptId);
    expect(transport.reconciliationCalls()).toHaveLength(1);
  });

  it("replays the same idempotent request and blocks a conflicting binding without another call", async () => {
    const transport = fake({ kind: "RESPONSE", response: successResponse() });
    const connector = configuredConnector(transport);
    const first = await connector.acquire(request());
    const replay = await connector.acquire(request());
    const conflict = await connector.acquire(request({ queryFingerprint: createHash("sha256").update("different").digest("hex") }));

    expect(first.receipt.status).toBe("COMPLETED");
    expect(replay.receipt).toMatchObject({ replayOfReceiptId: first.receipt.receiptId, status: "REPLAYED" });
    expect(conflict.receipt).toMatchObject({
      diagnostic: { reasonCode: "IDEMPOTENCY_CONFLICT", stage: "IDEMPOTENCY" },
      status: "BLOCKED",
    });
    expect(transport.acquisitionCalls()).toHaveLength(1);
  });
});

function configuredConnector(transport: TrendSourceTransport): TrendSourceConnector {
  return new TrendSourceConnector({ now: clock, profile: configuredProfile(), transport });
}

function configuredProfile(overrides: Partial<TrendSourceConnectionProfile> = {}): TrendSourceConnectionProfile {
  return {
    accessGrants: ["PUBLIC_TERMS_CONFIRMED"],
    actorId: "fabio",
    credentialBindings: [],
    sourceKey: "GDELT",
    sourceRegistryEntry: registry(),
    transportConfigured: true,
    workspaceId: "onlyway",
    ...overrides,
  };
}

function registry(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    actorId: "fabio",
    canonicalReference: "https://api.gdeltproject.org/api/v2/doc/",
    category: "AUTHORIZED_DATASET",
    createdAt: NOW,
    maxFreshnessDays: 1,
    name: "GDELT official",
    permittedRiskDomains: ["GENERAL"],
    publicCitationAllowed: true,
    reliability: "MEDIUM",
    requiresSecondSource: true,
    sourceId: "trend-gdelt",
    status: "AUTHORIZED",
    version: 0,
    workspaceId: "onlyway",
    ...overrides,
  };
}

function request(overrides: Partial<TrendAcquisitionRequest> = {}): TrendAcquisitionRequest {
  return {
    clientRequestId: "trend-request-one",
    contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
    idempotencyKey: "idem-one",
    maxCostUsd: 0,
    maxItems: 10,
    queryFingerprint: QUERY,
    retryCount: 0,
    sourceKey: "GDELT",
    timeoutMs: 2_000,
    ...overrides,
  };
}

function fake(outcome: FakeTrendTransportOutcome): DeterministicFakeTrendTransport {
  return new DeterministicFakeTrendTransport({ acquisitions: { "trend-request-one": outcome } });
}

function successResponse(): TrendTransportResponse {
  return {
    body: { items: [transportItem()] },
    operationId: "provider-operation-one",
    providerRequestId: "provider-request-one",
    statusCode: 200,
  };
}

function transportItem() {
  return {
    attributionRequired: true,
    evidenceKind: "SEARCH_TERM" as const,
    externalId: "gdelt-item-one",
    observedAt: NOW,
    providerReference: "https://api.gdeltproject.org/api/v2/doc/item-one",
    publishedAt: "2026-07-25T09:00:00.000Z",
    rightsClass: "METADATA_ONLY" as const,
    signalFamily: "MARKET_EVIDENCE" as const,
    summary: "Segnale GDELT attribuito.",
    tags: ["metodo"],
    territory: "IT",
    topic: "Metodo Veloce",
  };
}

function clock(): Date {
  return new Date(NOW);
}
