import { describe, expect, it } from "vitest";

import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import { buildTrendConsensusView } from "../../src/trend-intelligence/trend-consensus.js";
import type { TrendSignal, TrendSignalFamily, TrendSourceKey } from "../../src/trend-intelligence/trend-intelligence-contract.js";

const NOW = "2026-07-25T10:00:00.000Z";

describe("Trend consensus", () => {
  it("keeps two sources in the same family below the corroboration gate", () => {
    const output = buildTrendConsensusView({
      generatedAt: NOW,
      signals: [
        signal("one", "GDELT", "trend-gdelt", "Metodo   Veloce!", "ATTENTION_SIGNAL"),
        signal("two", "WIKIMEDIA", "trend-wikimedia", "metodo veloce", "ATTENTION_SIGNAL"),
      ],
      sources: [source("trend-gdelt"), source("trend-wikimedia")],
    });

    expect(output).toMatchObject({
      methodology: "DISTINCT_AUTHORIZED_SOURCE_CORROBORATION_NO_SCORE",
      status: "PARTIAL",
    });
    expect(output.candidates[0]).toMatchObject({
      missingEvidence: ["THREE_INDEPENDENT_SOURCES_REQUIRED", "THREE_SIGNAL_FAMILIES_REQUIRED"],
      normalizedTopic: "metodo veloce",
      signalCount: 2,
      sourceFamilies: ["ATTENTION_SIGNAL"],
      sourceFamilyCount: 1,
      sourceCount: 2,
      status: "INSUFFICIENT_CORROBORATION",
    });
    expect(output.candidates[0]).not.toHaveProperty("score");
    expect(Object.isFrozen(output.candidates[0]?.provenance)).toBe(true);
  });

  it("keeps three sources across only two families below the corroboration gate", () => {
    const output = buildTrendConsensusView({
      generatedAt: NOW,
      signals: [
        signal("one", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL"),
        signal("two", "WIKIMEDIA", "trend-wikimedia", "Onlyway", "ATTENTION_SIGNAL"),
        signal("three", "GITHUB", "trend-github", "Onlyway", "MARKET_EVIDENCE"),
      ],
      sources: [source("trend-gdelt"), source("trend-wikimedia"), source("trend-github")],
    });
    expect(output.candidates[0]).toMatchObject({
      missingEvidence: ["THREE_SIGNAL_FAMILIES_REQUIRED"],
      sourceCount: 3,
      sourceFamilyCount: 2,
      status: "INSUFFICIENT_CORROBORATION",
    });
  });

  it("corroborates only three authorized sources across three signal families", () => {
    const output = buildTrendConsensusView({
      generatedAt: NOW,
      signals: [
        signal("one", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL"),
        signal("two", "GOOGLE_TRENDS", "social-google-trends-it", "Onlyway", "SEARCH_INTENT"),
        signal("three", "GITHUB", "trend-github", "Onlyway", "MARKET_EVIDENCE"),
      ],
      sources: [source("trend-gdelt"), source("social-google-trends-it"), source("trend-github")],
    });
    expect(output.status).toBe("CORROBORATED");
    expect(output.candidates[0]).toMatchObject({
      missingEvidence: [],
      sourceCount: 3,
      sourceFamilyCount: 3,
      status: "CORROBORATED",
    });
    expect(output.candidates[0]?.provenance.every(({ attributionRequired }) => attributionRequired)).toBe(true);
  });

  it("fails closed when a signal has no authorized Source Registry entry", () => {
    expect(() => buildTrendConsensusView({
      generatedAt: NOW,
      signals: [signal("two", "GOOGLE_TRENDS", "social-google-trends-it", "Onlyway", "SEARCH_INTENT")],
      sources: [],
    })).toThrow("SIGNAL_SOURCE_NOT_AUTHORIZED");
  });

  it("rejects a fingerprint that is not canonically bound to the signal payload", () => {
    const valid = signal("forged", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL");
    expect(() => buildTrendConsensusView({
      generatedAt: NOW,
      signals: [{ ...valid, topic: "Mutated after fingerprinting" }],
      sources: [source("trend-gdelt")],
    })).toThrow("SIGNAL_FINGERPRINT_INVALID");
  });

  it.each([
    [
      "source binding",
      signal("invalid-binding", "GDELT", "trend-wikimedia", "Onlyway", "ATTENTION_SIGNAL"),
      [source("trend-wikimedia")],
      "SIGNAL_SOURCE_BINDING_INVALID",
    ],
    [
      "provider boundary",
      signal("invalid-boundary", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { providerReference: "https://api.gdeltproject.org/api/v2/geo/item" }),
      [source("trend-gdelt")],
      "SIGNAL_PROVIDER_REFERENCE_INVALID",
    ],
    [
      "provider query",
      signal("invalid-query", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { providerReference: "https://api.gdeltproject.org/api/v2/doc/item?token=hidden" }),
      [source("trend-gdelt")],
      "SIGNAL_PROVIDER_REFERENCE_INVALID",
    ],
    [
      "provider hash",
      signal("invalid-hash", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { providerReference: "https://api.gdeltproject.org/api/v2/doc/item#hidden" }),
      [source("trend-gdelt")],
      "SIGNAL_PROVIDER_REFERENCE_INVALID",
    ],
    [
      "provider credentials",
      signal("invalid-credentials", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { providerReference: "https://user:password@api.gdeltproject.org/api/v2/doc/item" }),
      [source("trend-gdelt")],
      "SIGNAL_PROVIDER_REFERENCE_INVALID",
    ],
    [
      "family binding",
      signal("invalid-family", "GDELT", "trend-gdelt", "Onlyway", "SEARCH_INTENT"),
      [source("trend-gdelt")],
      "SIGNAL_FAMILY_INVALID",
    ],
    [
      "expired retention",
      signal("expired-retention", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { retentionExpiresAt: NOW }),
      [source("trend-gdelt")],
      "SIGNAL_RETENTION_EXPIRED",
    ],
    [
      "future observation",
      signal("future", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { observedAt: "2026-07-25T10:00:00.001Z" }),
      [source("trend-gdelt")],
      "SIGNAL_OBSERVED_IN_FUTURE",
    ],
    [
      "stale observation",
      signal("stale", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", { observedAt: "2026-07-18T09:59:59.999Z" }),
      [source("trend-gdelt")],
      "SIGNAL_STALE",
    ],
    [
      "registry boundary outside catalog",
      signal("registry-boundary", "GDELT", "trend-gdelt", "Onlyway", "ATTENTION_SIGNAL", {
        providerReference: "https://evil.example/api/v2/doc/item",
      }),
      [source("trend-gdelt", { canonicalReference: "https://evil.example/api/v2/doc/" })],
      "SIGNAL_SOURCE_REGISTRY_BOUNDARY_INVALID",
    ],
    [
      "disabled catalog runtime",
      signal("disabled-runtime", "TIKTOK_CREATIVE_CENTER", "social-tiktok-creative-center", "Onlyway", "ATTENTION_SIGNAL", {
        providerReference: "https://ads.tiktok.com/business/creativecenter/item",
      }),
      [source("social-tiktok-creative-center", {
        canonicalReference: "https://ads.tiktok.com/business/creativecenter/",
      })],
      "SIGNAL_SOURCE_RUNTIME_DISABLED",
    ],
  ] as const)("rejects %s before candidate corroboration", (_label, rejected, sources, reasonCode) => {
    expect(() => buildTrendConsensusView({
      generatedAt: NOW,
      signals: [rejected],
      sources,
    })).toThrow(reasonCode);
  });

  it("reports empty evidence without manufacturing candidates", () => {
    const output = buildTrendConsensusView({ generatedAt: NOW, signals: [], sources: [] });
    expect(output).toMatchObject({
      candidates: [],
      missing: ["NO_SIGNALS", "NO_CORROBORATED_CANDIDATE"],
      status: "EMPTY",
    });
  });
});

function signal(
  id: string,
  sourceKey: TrendSourceKey,
  sourceId: string,
  topic: string,
  signalFamily: TrendSignalFamily,
  overrides: Partial<TrendSignal> = {},
): TrendSignal {
  const { signalFingerprint: _providedFingerprint, ...signalOverrides } = overrides;
  void _providedFingerprint;
  const candidate: Omit<TrendSignal, "signalFingerprint"> = {
    attributionRequired: true,
    evidenceKind: "RANKING" as const,
    externalId: id,
    observedAt: NOW,
    providerReference: providerReference(sourceKey, id),
    rightsClass: "METADATA_ONLY",
    signalFamily,
    signalId: `signal-${id}`,
    sourceId,
    sourceKey,
    summary: "Observed signal",
    tags: [],
    territory: "IT",
    topic,
    ...signalOverrides,
  };
  const { signalId: _signalId, ...payload } = candidate;
  void _signalId;
  return {
    ...candidate,
    signalFingerprint: canonicalSha256(payload),
  };
}

function source(sourceId: string, overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  const canonicalReference = canonicalSourceReference(sourceId);
  return {
    actorId: "fabio",
    canonicalReference,
    category: "AUTHORIZED_DATASET",
    createdAt: NOW,
    maxFreshnessDays: 7,
    name: sourceId,
    permittedRiskDomains: ["GENERAL"],
    publicCitationAllowed: true,
    reliability: "MEDIUM",
    requiresSecondSource: true,
    sourceId,
    status: "AUTHORIZED",
    version: 0,
    workspaceId: "onlyway",
    ...overrides,
  };
}

function canonicalSourceReference(sourceId: string): string {
  if (sourceId === "trend-gdelt") return "https://api.gdeltproject.org/api/v2/doc/";
  if (sourceId === "trend-wikimedia") return "https://wikimedia.org/api/rest_v1/";
  if (sourceId === "social-google-trends-it") return "https://trends.google.com/trending/";
  if (sourceId === "trend-github") return "https://api.github.com/";
  if (sourceId === "social-tiktok-creative-center") return "https://ads.tiktok.com/business/creativecenter/";
  throw new Error("Unknown test source");
}

function providerReference(sourceKey: TrendSourceKey, id: string): string {
  if (sourceKey === "GDELT") return `https://api.gdeltproject.org/api/v2/doc/items/${id}`;
  if (sourceKey === "WIKIMEDIA") return `https://wikimedia.org/api/rest_v1/metrics/${id}`;
  if (sourceKey === "GOOGLE_TRENDS") return `https://trends.google.com/trending/items/${id}`;
  if (sourceKey === "GITHUB") return `https://api.github.com/repos/onlyway/${id}`;
  if (sourceKey === "TIKTOK_CREATIVE_CENTER") return `https://ads.tiktok.com/business/creativecenter/items/${id}`;
  throw new Error("Unknown test provider");
}
