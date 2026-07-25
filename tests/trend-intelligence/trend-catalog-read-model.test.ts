import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { OPERATIONAL_AGENT_IDS } from "../../src/agent-company/operational-agent-company.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import type { SocialTrendObservation } from "../../src/social-intelligence-live/social-intelligence-live.js";
import type { TrendConnectorReceipt } from "../../src/trend-intelligence/trend-intelligence-contract.js";
import { TREND_OPERATOR_CELL_CATALOG, buildTrendIntelligenceReadModel } from "../../src/trend-intelligence/trend-intelligence-read-model.js";
import { PREMIUM_TREND_SOURCE_CATALOG, trendSourceByKey } from "../../src/trend-intelligence/trend-source-catalog.js";
import { preflightTrendSource } from "../../src/trend-intelligence/trend-source-preflight.js";

const NOW = "2026-07-25T10:00:00.000Z";

describe("Premium Trend source catalog and read model", () => {
  it("catalogs stable honest source capabilities without declaring any live connection", () => {
    expect(PREMIUM_TREND_SOURCE_CATALOG).toHaveLength(20);
    expect(new Set(PREMIUM_TREND_SOURCE_CATALOG.map(({ sourceId }) => sourceId)).size).toBe(20);
    expect(new Set(PREMIUM_TREND_SOURCE_CATALOG.map(({ connectionDeclaration }) => connectionDeclaration))).toEqual(new Set(["NOT_CONFIGURED"]));
    expect(Object.isFrozen(PREMIUM_TREND_SOURCE_CATALOG)).toBe(true);
    expect(trendSourceByKey("GOOGLE_TRENDS").sourceId).toBe("social-google-trends-it");
    expect(trendSourceByKey("GITHUB")).toMatchObject({ accessRequirement: "PUBLIC_OFFICIAL_ENDPOINT", requiredCredentialBindings: [] });
    expect(trendSourceByKey("TIKTOK_COMMERCIAL_CONTENT")).toMatchObject({ accessRequirement: "ACCOUNT_AND_DEVELOPER_APPROVAL_REQUIRED", providerRuntime: "DISABLED" });
    expect(trendSourceByKey("ETSY")).toMatchObject({ acquisitionMode: "OFFICIAL_EXPORT", accessRequirement: "AUTHORIZED_IMPORT_REQUIRED", providerRuntime: "DISABLED" });
    for (const sourceKey of ["YOUTUBE", "META_AD_LIBRARY", "PINTEREST_TRENDS", "PINTEREST_PREDICTS", "TIKTOK_COMMERCIAL_CONTENT", "TIKTOK_CREATIVE_CENTER", "GOOGLE_ADS", "REDDIT", "PRODUCT_HUNT", "HACKER_NEWS", "ETSY", "WGSN_INTELLIGENCE", "EXPLODING_TOPICS", "SIMILARWEB", "TRENDALYTICS"] as const) {
      expect(trendSourceByKey(sourceKey).providerRuntime).toBe("DISABLED");
    }
  });

  it("rejects a same-host registry path outside the canonical connector boundary", () => {
    const output = preflightTrendSource({
      accessGrants: ["PUBLIC_TERMS_CONFIRMED"],
      actorId: "fabio",
      credentialBindings: [],
      sourceKey: "GDELT",
      sourceRegistryEntry: source({ canonicalReference: "https://api.gdeltproject.org/api/v2/geo/" }),
      transportConfigured: true,
      workspaceId: "onlyway",
    });
    expect(output.executionEligible).toBe(false);
    expect(output.reasonCodes).toContain("SOURCE_CANONICAL_REFERENCE_MISMATCH");
  });

  it("uses PREFLIGHT_READY without a generic READY reason or connection claim", () => {
    const output = preflightTrendSource({
      accessGrants: ["PUBLIC_TERMS_CONFIRMED"],
      actorId: "fabio",
      credentialBindings: [],
      sourceKey: "GDELT",
      sourceRegistryEntry: source(),
      transportConfigured: true,
      workspaceId: "onlyway",
    });

    expect(output).toMatchObject({
      capabilityState: "PREFLIGHT_READY",
      executionEligible: true,
      paidCalls: "DISABLED",
      publication: "LOCKED",
      reasonCodes: [],
    });
    expect(output).not.toHaveProperty("connectionState");
  });

  it("maps all 17 existing agents exactly once across six cells without simulating work", () => {
    const mapped = TREND_OPERATOR_CELL_CATALOG.flatMap(({ agentIds }) => agentIds);
    expect(TREND_OPERATOR_CELL_CATALOG).toHaveLength(6);
    expect(mapped).toHaveLength(OPERATIONAL_AGENT_IDS.length);
    expect(new Set(mapped)).toEqual(new Set(OPERATIONAL_AGENT_IDS));

    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [],
      socialTrends: [],
      sources: [],
      workspaceId: "onlyway",
    });
    expect(output.cells.flatMap(({ members }) => members).every(({ capabilityState }) => capabilityState === "READY")).toBe(true);
    expect(output.cells.flatMap(({ members }) => members).every(({ observedWorkState }) => observedWorkState === "NOT_OBSERVED")).toBe(true);
    expect(output.cells.every(({ observedWorkState }) => observedWorkState === "NOT_OBSERVED")).toBe(true);
  });

  it("keeps legacy observations out of consensus until their fingerprint is receipt-backed", () => {
    const withoutReceipt = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [],
      socialTrends: [socialTrend()],
      sources: [googleSource()],
      workspaceId: "onlyway",
    });
    const googleWithoutReceipt = withoutReceipt.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS");

    expect(googleWithoutReceipt).toMatchObject({
      connectorState: "NOT_CONFIGURED",
      observedSignalCount: 0,
      registrationState: "AUTHORIZED",
    });
    expect(withoutReceipt.summary).toMatchObject({ configuredConnectors: 0, observedSignals: 0 });
    expect(withoutReceipt.candidates).toEqual([]);
    expect(withoutReceipt.pipeline.find(({ stageId }) => stageId === "NORMALIZE")?.status).toBe("NOT_OBSERVED");
    expect(googleWithoutReceipt?.dataState).toBe("NOT_OBSERVED");

    const withReceipt = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt()],
      socialTrends: [socialTrend()],
      sources: [googleSource()],
      workspaceId: "onlyway",
    });
    const googleWithReceipt = withReceipt.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS");
    expect(googleWithReceipt).toMatchObject({
      connectorState: "READY",
      dataState: "FRESH",
      observedSignalCount: 1,
    });
    expect(withReceipt.summary).toMatchObject({ configuredConnectors: 1, observedSignals: 1 });
    expect(withReceipt.candidates[0]).toMatchObject({
      decisionState: "BLOCKED",
      publication: "LOCKED",
      status: "INSUFFICIENT_CORROBORATION",
    });
    expect(withReceipt.candidates[0]?.provenance[0]?.providerReference).toBe("https://trends.google.com/trending/");
    expect(withReceipt.candidates[0]?.provenance[0]?.attributionRequired).toBe(true);
    expect(withReceipt.pipeline.find(({ stageId }) => stageId === "NORMALIZE")?.status).toBe("OBSERVED");
    expect(withReceipt.pipeline.find(({ stageId }) => stageId === "TRANSLATE")?.status).toBe("NOT_OBSERVED");
    expect(withReceipt.publication).toBe("LOCKED");
    expect(withReceipt.externalWrites).toBe("LOCKED");
    expect(Object.isFrozen(withReceipt.sources)).toBe(true);
  });

  it("separates connector execution evidence from receipt-backed data freshness", () => {
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [receipt()],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    });
    const gdelt = output.sources.find(({ sourceKey }) => sourceKey === "GDELT");

    expect(gdelt).toMatchObject({
      connectorState: "READY",
      dataState: "INVALID",
      latestReceipt: {
        itemCount: 1,
        reasonCode: "REQUEST_COMPLETED",
        status: "COMPLETED",
      },
    });
    expect(gdelt?.latestReceipt).not.toHaveProperty("rawPayloadStored");
    expect(gdelt?.latestReceipt).not.toHaveProperty("signalFingerprints");
  });

  it("requires current policy, complete receipt coverage and an enabled runtime before consensus", () => {
    const withoutPolicy = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt()],
      socialTrends: [socialTrend()],
      sources: [],
      workspaceId: "onlyway",
    });
    expect(withoutPolicy.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS")).toMatchObject({
      connectorState: "BLOCKED",
      dataState: "INVALID",
      registrationState: "NOT_REGISTERED",
    });
    expect(withoutPolicy.candidates).toEqual([]);

    const partialCoverage = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt({
        itemCount: 2,
        signalFingerprints: [
          googleSignalFingerprint(),
          createHash("sha256").update("missing-signal").digest("hex"),
        ],
      })],
      socialTrends: [socialTrend()],
      sources: [googleSource()],
      workspaceId: "onlyway",
    });
    expect(partialCoverage.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS")).toMatchObject({
      connectorState: "READY",
      dataState: "INVALID",
      observedSignalCount: 0,
    });
    expect(partialCoverage.candidates).toEqual([]);

    const disabled = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [tiktokReceipt()],
      socialTrends: [tiktokTrend()],
      sources: [tiktokSource()],
      workspaceId: "onlyway",
    });
    expect(disabled.sources.find(({ sourceKey }) => sourceKey === "TIKTOK_CREATIVE_CENTER")).toMatchObject({
      connectorState: "DISABLED",
      dataState: "INVALID",
      observedSignalCount: 0,
    });
    expect(disabled.candidates).toEqual([]);
  });

  it("rejects an off-boundary legacy final URL instead of laundering it through the catalog reference", () => {
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt()],
      socialTrends: [socialTrend({
        sourceFinalUrl: "https://www.instagram.com/explore/",
      })],
      sources: [googleSource()],
      workspaceId: "onlyway",
    });

    expect(output.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS")).toMatchObject({
      connectorState: "READY",
      dataState: "INVALID",
      observedSignalCount: 0,
    });
    expect(output.candidates).toEqual([]);
  });

  it("keeps an expired receipt-backed legacy observation out of consensus", () => {
    const expired = {
      expiresAt: "2026-07-25T09:30:00.000Z",
      observedAt: "2026-07-25T09:00:00.000Z",
    };
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt({
        signalFingerprints: [googleSignalFingerprint(expired)],
      })],
      socialTrends: [socialTrend(expired)],
      sources: [googleSource()],
      workspaceId: "onlyway",
    });

    expect(output.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS")).toMatchObject({
      connectorState: "READY",
      dataState: "STALE",
      observedSignalCount: 1,
    });
    expect(output.summary.observedSignals).toBe(0);
    expect(output.candidates).toEqual([]);
  });

  it("blocks a registry reference outside the catalog boundary", () => {
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [googleReceipt()],
      socialTrends: [socialTrend()],
      sources: [googleSource({
        canonicalReference: "https://evil.example/trending/",
      })],
      workspaceId: "onlyway",
    });

    expect(output.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS")).toMatchObject({
      connectorState: "BLOCKED",
      dataState: "INVALID",
      observedSignalCount: 0,
      registrationState: "CONFLICT",
    });
    expect(output.candidates).toEqual([]);
  });

  it("keeps an idempotent replay of a successful empty result READY without inventing data", () => {
    const completed = receipt({
      itemCount: 0,
      receiptId: "trend-receipt-empty",
      signalFingerprints: [],
    });
    const replay = receipt({
      diagnostic: { reasonCode: "IDEMPOTENT_REPLAY", stage: "IDEMPOTENCY" },
      itemCount: 0,
      receiptId: "trend-receipt-empty-replay",
      replayOfReceiptId: completed.receiptId,
      sequence: 2,
      signalFingerprints: [],
      status: "REPLAYED",
    });
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [completed, replay],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    });
    expect(output.sources.find(({ sourceKey }) => sourceKey === "GDELT")).toMatchObject({
      connectorState: "READY",
      dataState: "NOT_OBSERVED",
      latestReceipt: { itemCount: 0, status: "REPLAYED" },
      observedSignalCount: 0,
    });
  });

  it("keeps an unresolved root operation reconciliation-pending when the reconciliation attempt is blocked", () => {
    const uncertain = receipt({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "TRANSPORT" },
      itemCount: 0,
      providerOperationId: "provider-operation-pending",
      receiptId: "trend-receipt-pending-root",
      signalFingerprints: [],
      status: "UNCERTAIN",
    });
    const blockedReconciliation = receipt({
      diagnostic: { reasonCode: "AUTHENTICATION_REQUIRED", stage: "RECONCILIATION", statusCode: 401 },
      itemCount: 0,
      providerOperationId: "provider-operation-pending",
      receiptId: "trend-receipt-pending-blocked-reconciliation",
      reconcilesReceiptId: uncertain.receiptId,
      sequence: 2,
      signalFingerprints: [],
      status: "BLOCKED",
    });
    const output = buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [uncertain, blockedReconciliation],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    });

    expect(output.sources.find(({ sourceKey }) => sourceKey === "GDELT")).toMatchObject({
      connectorState: "RECONCILIATION_PENDING",
      dataState: "RECONCILIATION_PENDING",
      latestReasonCode: "AUTHENTICATION_REQUIRED",
    });
    expect(output.summary.reconciliationPending).toBe(1);
  });

  it("rejects cross-tenant, duplicate and mismatched receipt bindings", () => {
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [],
      socialTrends: [],
      sources: [{ ...source(), actorId: "other-actor" }],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    const trend = socialTrend();
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [],
      socialTrends: [trend, trend],
      sources: [googleSource()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [receipt({ sourceId: "trend-wikimedia" })],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [receipt({ workspaceId: "other-workspace" })],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    const completed = receipt({
      itemCount: 0,
      receiptId: "trend-receipt-lineage-original",
      signalFingerprints: [],
    });
    const forgedReplay = receipt({
      diagnostic: { reasonCode: "IDEMPOTENT_REPLAY", stage: "IDEMPOTENCY" },
      itemCount: 0,
      receiptId: "trend-receipt-lineage-replay",
      replayOfReceiptId: completed.receiptId,
      requestFingerprint: createHash("sha256").update("different-request").digest("hex"),
      sequence: 2,
      signalFingerprints: [],
      status: "REPLAYED",
    });
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [completed, forgedReplay],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    const uncertainWithoutProviderOperation = receipt({
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "TRANSPORT" },
      itemCount: 0,
      receiptId: "trend-receipt-uncertain-no-provider-operation",
      signalFingerprints: [],
      status: "UNCERTAIN",
    });
    const forgedReconciliation = receipt({
      diagnostic: { reasonCode: "RECONCILIATION_COMPLETED", stage: "RECONCILIATION", statusCode: 200 },
      itemCount: 0,
      receiptId: "trend-receipt-forged-reconciliation",
      reconcilesReceiptId: uncertainWithoutProviderOperation.receiptId,
      sequence: 2,
      signalFingerprints: [],
      status: "RECONCILED",
    });
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [uncertainWithoutProviderOperation, forgedReconciliation],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");

    const chronologicalParent = receipt({
      itemCount: 0,
      receiptId: "trend-receipt-chronology-parent",
      signalFingerprints: [],
    });
    const earlierReplay = receipt({
      diagnostic: { reasonCode: "IDEMPOTENT_REPLAY", stage: "IDEMPOTENCY" },
      itemCount: 0,
      receiptId: "trend-receipt-chronology-child",
      recordedAt: "2026-07-25T09:59:59.999Z",
      replayOfReceiptId: chronologicalParent.receiptId,
      sequence: 2,
      signalFingerprints: [],
      status: "REPLAYED",
    });
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [chronologicalParent, earlierReplay],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");
  });

  it.each([
    ["preflight reason at validation", {
      diagnostic: { reasonCode: "PREFLIGHT_BLOCKED", stage: "VALIDATION" },
      itemCount: 0,
      signalFingerprints: [],
      status: "BLOCKED",
    }],
    ["transport failure at idempotency", {
      diagnostic: { reasonCode: "TRANSPORT_FAILED", stage: "IDEMPOTENCY" },
      itemCount: 0,
      signalFingerprints: [],
      status: "FAILED",
    }],
    ["provider unavailable at preflight", {
      diagnostic: { reasonCode: "PROVIDER_UNAVAILABLE", stage: "PREFLIGHT", statusCode: 503 },
      itemCount: 0,
      signalFingerprints: [],
      status: "FAILED",
    }],
    ["reconciliation pending without parent link", {
      cost: { classification: "RECONCILIATION_PENDING" },
      diagnostic: { reasonCode: "RECONCILIATION_PENDING", stage: "RECONCILIATION" },
      itemCount: 0,
      signalFingerprints: [],
      status: "UNCERTAIN",
    }],
  ] as const)("rejects impossible receipt stage matrix: %s", (_label, overrides) => {
    expect(() => buildTrendIntelligenceReadModel({
      actorId: "fabio",
      generatedAt: NOW,
      receipts: [receipt(overrides as Partial<TrendConnectorReceipt>)],
      socialTrends: [],
      sources: [source()],
      workspaceId: "onlyway",
    })).toThrow("identity or receipt binding");
  });
});

function source(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    actorId: "fabio",
    canonicalReference: "https://api.gdeltproject.org/api/v2/doc/",
    category: "AUTHORIZED_DATASET",
    createdAt: NOW,
    maxFreshnessDays: 1,
    name: "GDELT",
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

function googleSource(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return source({
    canonicalReference: "https://trends.google.com/trending/",
    name: "Google Trends",
    sourceId: "social-google-trends-it",
    ...overrides,
  });
}

function socialTrend(overrides: Partial<SocialTrendObservation> = {}): SocialTrendObservation {
  return {
    actorId: "fabio",
    approximateTraffic: "500+",
    audience: "Italia",
    contractVersion: "1",
    expiresAt: "2026-07-26T10:00:00.000Z",
    fingerprint: createHash("sha256").update("trend").digest("hex"),
    importedAt: NOW,
    keyword: "Metodo Veloce",
    kind: "TREND",
    observedAt: NOW,
    phase: "UNCLASSIFIED",
    platform: "GOOGLE_TRENDS",
    recordId: "social-trend-one",
    sourceId: "social-google-trends-it",
    sourceFinalUrl: "https://trends.google.com/trending/rss?geo=IT",
    territory: "IT",
    workspaceId: "onlyway",
    ...overrides,
  };
}

function googleReceipt(overrides: Partial<TrendConnectorReceipt> = {}): TrendConnectorReceipt {
  return receipt({
    operationId: "trend-operation-google",
    receiptId: "trend-receipt-google",
    signalFingerprints: [googleSignalFingerprint()],
    sourceId: "social-google-trends-it",
    sourceKey: "GOOGLE_TRENDS",
    transportId: "deterministic-fake-google-trends-transport",
    ...overrides,
  });
}

function googleSignalFingerprint(overrides: Pick<SocialTrendObservation, "expiresAt" | "observedAt"> = {
  expiresAt: "2026-07-26T10:00:00.000Z",
  observedAt: NOW,
}): string {
  return canonicalSha256({
    attributionRequired: true,
    evidenceKind: "SEARCH_TERM",
    externalId: "social-trend-one",
    observedAt: overrides.observedAt,
    providerReference: "https://trends.google.com/trending/",
    retentionExpiresAt: overrides.expiresAt,
    rightsClass: "AGGREGATE",
    signalFamily: "SEARCH_INTENT",
    sourceId: "social-google-trends-it",
    sourceKey: "GOOGLE_TRENDS",
    summary: "500+",
    tags: [],
    territory: "IT",
    topic: "Metodo Veloce",
  });
}

function tiktokSource(): SourceRegistryEntry {
  return source({
    canonicalReference: "https://ads.tiktok.com/business/creativecenter/",
    name: "TikTok Creative Center",
    sourceId: "social-tiktok-creative-center",
  });
}

function tiktokTrend(): SocialTrendObservation {
  return {
    actorId: "fabio",
    audience: "Italia",
    contractVersion: "1",
    expiresAt: "2026-07-26T10:00:00.000Z",
    fingerprint: createHash("sha256").update("tiktok-trend").digest("hex"),
    importedAt: NOW,
    keyword: "Metodo Veloce",
    kind: "TREND",
    observedAt: NOW,
    phase: "UNCLASSIFIED",
    platform: "TIKTOK",
    recordId: "social-tiktok-trend-one",
    sourceId: "social-tiktok-creative-center",
    sourceFinalUrl: "https://ads.tiktok.com/business/creativecenter/trend/methodo",
    territory: "IT",
    workspaceId: "onlyway",
  };
}

function tiktokReceipt(): TrendConnectorReceipt {
  return receipt({
    operationId: "trend-operation-tiktok",
    receiptId: "trend-receipt-tiktok",
    signalFingerprints: [canonicalSha256({
      attributionRequired: true,
      evidenceKind: "RANKING",
      externalId: "social-tiktok-trend-one",
      observedAt: NOW,
      providerReference: "https://ads.tiktok.com/business/creativecenter/trend/methodo",
      retentionExpiresAt: "2026-07-26T10:00:00.000Z",
      rightsClass: "AGGREGATE",
      signalFamily: "ATTENTION_SIGNAL",
      sourceId: "social-tiktok-creative-center",
      sourceKey: "TIKTOK_CREATIVE_CENTER",
      summary: "Segnale osservato; metrica quantitativa non disponibile.",
      tags: [],
      territory: "IT",
      topic: "Metodo Veloce",
    })],
    sourceId: "social-tiktok-creative-center",
    sourceKey: "TIKTOK_CREATIVE_CENTER",
    transportId: "deterministic-fake-tiktok-transport",
  });
}

function receipt(overrides: Partial<TrendConnectorReceipt> = {}): TrendConnectorReceipt {
  return {
    actorId: "fabio",
    clientRequestId: "trend-request-one",
    contractVersion: "1",
    cost: { amountUsd: 0, classification: "NO_PAID_CALL" },
    diagnostic: { reasonCode: "REQUEST_COMPLETED", stage: "VALIDATION", statusCode: 200 },
    externalEffectOccurred: false,
    externalWrites: "LOCKED",
    idempotencyKeyFingerprint: createHash("sha256").update("idem").digest("hex"),
    itemCount: 1,
    operationId: "trend-operation-one",
    publication: "LOCKED",
    rawPayloadStored: false,
    receiptId: "trend-receipt-one",
    recordedAt: NOW,
    requestFingerprint: createHash("sha256").update("request").digest("hex"),
    retryCount: 0,
    secretMaterialStored: false,
    sequence: 1,
    signalFingerprints: [createHash("sha256").update("signal").digest("hex")],
    sourceId: "trend-gdelt",
    sourceKey: "GDELT",
    status: "COMPLETED",
    transportId: "deterministic-fake-trend-transport",
    workspaceId: "onlyway",
    ...overrides,
  };
}
