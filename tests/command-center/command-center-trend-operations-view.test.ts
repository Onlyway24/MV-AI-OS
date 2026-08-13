import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_AGENT_IDS,
  type AgentCompanyWorkday,
} from "../../src/agent-company/operational-agent-company.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import {
  buildCommandCenterTrendOperationsView,
  latestObservedAgentWork,
} from "../../src/command-center/command-center-trend-operations-view.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import type { SocialTrendObservation } from "../../src/social-intelligence-live/social-intelligence-live.js";
import { SocialIntelligenceLiveService } from "../../src/social-intelligence-live/social-intelligence-live-service.js";
import type { TrendConnectorReceipt } from "../../src/trend-intelligence/trend-intelligence-contract.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import { FixedClock } from "../support/fixtures.js";

const ACTOR_ID = "fabio";
const WORKSPACE_ID = "onlyway";
const NOW = "2026-07-25T10:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const EXPECTED_CALL_SIGNS = Object.freeze([
  "AEGIS",
  "ARCHIVE",
  "BRIDGE",
  "CIPHER",
  "FORGE",
  "LAUNCH",
  "LEDGER",
  "NEXUS",
  "ORACLE",
  "PRIME",
  "PRISM",
  "PULSE",
  "SCALE",
  "SENTINEL",
  "TITAN",
  "VAULT",
  "VECTOR",
]);

describe("Command Center Trend Operations projection", () => {
  it("maps all 17 real operator capabilities exactly once and fails data and connectors closed", () => {
    const view = buildCommandCenterTrendOperationsView({
      actorId: ACTOR_ID,
      generatedAt: NOW,
      receipts: [],
      socialTrends: [],
      sources: [],
      workdays: [],
      workspaceId: WORKSPACE_ID,
    });
    const members = view.cells.flatMap(({ operatorCallSigns }) => operatorCallSigns);

    expect(view.cells).toHaveLength(6);
    expect(members).toHaveLength(OPERATIONAL_AGENT_IDS.length);
    expect(new Set(members).size).toBe(OPERATIONAL_AGENT_IDS.length);
    expect([...members].sort()).toEqual(EXPECTED_CALL_SIGNS);
    expect(view.cells.every(({ reasonCode, state }) =>
      reasonCode === "CAPABILITY_READY_NO_WORK_OBSERVED" && state === "CAPABILITY_READY")).toBe(true);
    expect(view.summary).toMatchObject({
      authorizedPolicies: 0,
      dataStatus: "NOT_OBSERVED",
      freshSources: 0,
      receiptBackedConnectors: 0,
    });
    expect(view.sources.every(({ connectorStatus }) => connectorStatus !== "RECEIPT_BACKED")).toBe(true);
    expect(view.candidates).toEqual([]);
    expect(view.publication).toBe("LOCKED");
    expect(view.externalWrites).toBe("LOCKED");
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("keeps policy, catalog capability, receipt-backed connection and fresh data independent", () => {
    const source = googleSource();
    const socialTrend = googleTrend();
    const withoutReceipt = buildCommandCenterTrendOperationsView({
      actorId: ACTOR_ID,
      generatedAt: NOW,
      receipts: [],
      socialTrends: [socialTrend],
      sources: [source],
      workdays: [],
      workspaceId: WORKSPACE_ID,
    });
    const googleWithoutReceipt = withoutReceipt.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS");

    expect(googleWithoutReceipt).toMatchObject({
      capabilityStatus: "CATALOGUED",
      connectorStatus: "NOT_CONFIGURED",
      dataStatus: "NOT_OBSERVED",
      policyStatus: "AUTHORIZED",
    });
    expect(withoutReceipt.summary).toMatchObject({
      authorizedPolicies: 1,
      dataStatus: "NOT_OBSERVED",
      freshSources: 0,
      receiptBackedConnectors: 0,
    });
    expect(withoutReceipt.candidates).toEqual([]);

    const withReceipt = buildCommandCenterTrendOperationsView({
      actorId: ACTOR_ID,
      generatedAt: NOW,
      receipts: [completedReceipt()],
      socialTrends: [socialTrend],
      sources: [source],
      workdays: [],
      workspaceId: WORKSPACE_ID,
    });
    const googleWithReceipt = withReceipt.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS");

    expect(googleWithReceipt).toMatchObject({
      connectorStatus: "RECEIPT_BACKED",
      dataStatus: "FRESH",
      latestReceipt: {
        reasonCode: "REQUEST_COMPLETED",
        receiptId: "trend-receipt-google-001",
        status: "COMPLETED",
      },
    });
    expect(withReceipt.summary.receiptBackedConnectors).toBe(1);
    expect(withReceipt.summary.dataStatus).toBe("FRESH");
    expect(withReceipt.candidates).toEqual([
      expect.objectContaining({
        independentSourceCount: 1,
        publication: "LOCKED",
        reasonCode: "CORROBORATING_SOURCE_REQUIRED",
        status: "BLOCKED",
      }),
    ]);
    expect(JSON.stringify(googleWithReceipt)).not.toContain("provider-request-private");
    expect(JSON.stringify(googleWithReceipt)).not.toContain("client-request-private");

    expect(withReceipt.sources.find(({ sourceKey }) => sourceKey === "HACKER_NEWS")).toMatchObject({
      capabilityStatus: "DISABLED",
      tier: "PUBLIC",
    });
  });

  it("derives observed work only from the latest durable workday task for each operator", () => {
    const older = workday("2026-07-25T08:00:00.000Z", "COMPLETED");
    const newer = workday("2026-07-25T09:00:00.000Z", "RUNNING");
    const work = latestObservedAgentWork([older, newer]);
    const view = buildCommandCenterTrendOperationsView({
      actorId: ACTOR_ID,
      generatedAt: NOW,
      receipts: [],
      socialTrends: [],
      sources: [],
      workdays: [older, newer],
      workspaceId: WORKSPACE_ID,
    });

    expect(work).toHaveLength(OPERATIONAL_AGENT_IDS.length);
    expect(work.every(({ observedAt, state }) =>
      observedAt === "2026-07-25T09:00:00.000Z" && state === "RUNNING")).toBe(true);
    expect(view.cells.every(({ observedWorkCount, operatorCount, reasonCode, state }) =>
      observedWorkCount === operatorCount && reasonCode === "WORK_RUNNING" && state === "RUNNING")).toBe(true);
  });

  it("builds the server snapshot with empty connector receipts until durable receipt persistence exists", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const clock = new FixedClock(NOW);
    const planes = new OperationalPlaneService({
      actorId: ACTOR_ID,
      clock,
      repositories,
      workspaceId: WORKSPACE_ID,
    });
    await planes.registerSource({
      canonicalReference: "https://trends.google.com/trending/",
      category: "OFFICIAL_SITE",
      maxFreshnessDays: 1,
      name: "Google Trends",
      permittedRiskDomains: ["GENERAL"],
      publicCitationAllowed: true,
      reliability: "MEDIUM",
      requiresSecondSource: true,
      sourceId: "social-google-trends-it",
      status: "AUTHORIZED",
    });
    const social = new SocialIntelligenceLiveService({
      actorId: ACTOR_ID,
      clock,
      repositories,
      workspaceId: WORKSPACE_ID,
    });
    await social.importRecord(social.createRecord({
      audience: "Italia",
      expiresAt: "2026-07-26T10:00:00.000Z",
      keyword: "Metodo Veloce",
      kind: "TREND",
      observedAt: NOW,
      phase: "UNCLASSIFIED",
      platform: "GOOGLE_TRENDS",
      recordId: "trend-command-center-google-001",
      sourceId: "social-google-trends-it",
      territory: "IT",
    }));

    const snapshot = await new CommandCenterQueryService({
      actorId: ACTOR_ID,
      clock,
      repositories,
      workspaceId: WORKSPACE_ID,
    }).snapshot();
    const google = snapshot.trendOperations.sources.find(({ sourceKey }) => sourceKey === "GOOGLE_TRENDS");

    expect(google).toMatchObject({
      connectorStatus: "NOT_CONFIGURED",
      dataStatus: "NOT_OBSERVED",
      policyStatus: "AUTHORIZED",
    });
    expect(snapshot.trendOperations.summary.receiptBackedConnectors).toBe(0);
    expect(snapshot.trendOperations.publication).toBe("LOCKED");
    expect(snapshot.trendOperations.externalWrites).toBe("LOCKED");
  });
});

function googleSource(): SourceRegistryEntry {
  return {
    actorId: ACTOR_ID,
    canonicalReference: "https://trends.google.com/trending/",
    category: "OFFICIAL_SITE",
    createdAt: NOW,
    maxFreshnessDays: 1,
    name: "Google Trends",
    permittedRiskDomains: ["GENERAL"],
    publicCitationAllowed: true,
    reliability: "MEDIUM",
    requiresSecondSource: true,
    sourceId: "social-google-trends-it",
    status: "AUTHORIZED",
    version: 0,
    workspaceId: WORKSPACE_ID,
  };
}

function googleTrend(): SocialTrendObservation {
  return {
    actorId: ACTOR_ID,
    audience: "Italia",
    contractVersion: "1",
    expiresAt: "2026-07-26T10:00:00.000Z",
    fingerprint: HASH_A,
    importedAt: NOW,
    keyword: "Metodo Veloce",
    kind: "TREND",
    observedAt: NOW,
    phase: "UNCLASSIFIED",
    platform: "GOOGLE_TRENDS",
    recordId: "trend-google-001",
    sourceId: "social-google-trends-it",
    territory: "IT",
    workspaceId: WORKSPACE_ID,
  };
}

function completedReceipt(): TrendConnectorReceipt {
  return {
    actorId: ACTOR_ID,
    clientRequestId: "client-request-private",
    contractVersion: "1",
    cost: { amountUsd: 0, classification: "NO_PAID_CALL" },
    diagnostic: {
      reasonCode: "REQUEST_COMPLETED",
      stage: "VALIDATION",
      statusCode: 200,
    },
    externalEffectOccurred: false,
    externalWrites: "LOCKED",
    idempotencyKeyFingerprint: HASH_A,
    itemCount: 1,
    operationId: "trend-operation-google-001",
    providerRequestId: "provider-request-private",
    publication: "LOCKED",
    rawPayloadStored: false,
    receiptId: "trend-receipt-google-001",
    recordedAt: NOW,
    requestFingerprint: HASH_B,
    retryCount: 0,
    secretMaterialStored: false,
    sequence: 1,
    signalFingerprints: [googleSignalFingerprint()],
    sourceId: "social-google-trends-it",
    sourceKey: "GOOGLE_TRENDS",
    status: "COMPLETED",
    transportId: "fake-google-trends",
    workspaceId: WORKSPACE_ID,
  };
}

function googleSignalFingerprint(): string {
  return canonicalSha256({
    attributionRequired: true,
    evidenceKind: "SEARCH_TERM",
    externalId: "trend-google-001",
    observedAt: NOW,
    providerReference: "https://trends.google.com/trending/",
    retentionExpiresAt: "2026-07-26T10:00:00.000Z",
    rightsClass: "AGGREGATE",
    signalFamily: "SEARCH_INTENT",
    sourceId: "social-google-trends-it",
    sourceKey: "GOOGLE_TRENDS",
    summary: "Segnale osservato; metrica quantitativa non disponibile.",
    tags: [],
    territory: "IT",
    topic: "Metodo Veloce",
  });
}

function workday(updatedAt: string, status: "COMPLETED" | "RUNNING"): AgentCompanyWorkday {
  return {
    actorId: ACTOR_ID,
    contractVersion: "1",
    createdAt: updatedAt,
    externalActionsExecuted: false,
    input: {} as AgentCompanyWorkday["input"],
    inputFingerprint: HASH_A,
    status: "RUNNING",
    tasks: OPERATIONAL_AGENT_IDS.map((agentId) => ({
      agentId,
      attempts: status === "RUNNING" ? 1 : 0,
      ...(status === "COMPLETED" ? { completedAt: updatedAt } : { startedAt: updatedAt }),
      costCents: 0,
      dependencies: [],
      durationMs: 0,
      executorId: `test-${agentId}`,
      gates: [],
      status,
      taskType: "trend.test",
      workItemId: `trend-${agentId}`,
    })),
    updatedAt,
    version: 0,
    workdayId: `workday-${updatedAt.replaceAll(/[^0-9]/gu, "")}`,
    workspaceId: WORKSPACE_ID,
  };
}
