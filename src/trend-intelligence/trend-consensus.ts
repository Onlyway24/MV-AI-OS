import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import { MAX_TREND_SIGNALS, TREND_INTELLIGENCE_CONTRACT_VERSION, deepFreezeTrend, type TrendRightsClass, type TrendSignal, type TrendSignalFamily } from "./trend-intelligence-contract.js";
import { trendSourceByKey } from "./trend-source-catalog.js";

export type TrendConsensusValidationCode =
  | "SIGNAL_EVIDENCE_REFERENCE_INVALID"
  | "SIGNAL_FAMILY_INVALID"
  | "SIGNAL_FINGERPRINT_INVALID"
  | "SIGNAL_OBSERVED_AT_INVALID"
  | "SIGNAL_OBSERVED_IN_FUTURE"
  | "SIGNAL_PROVIDER_REFERENCE_INVALID"
  | "SIGNAL_RETENTION_EXPIRED"
  | "SIGNAL_RETENTION_INVALID"
  | "SIGNAL_SOURCE_BINDING_INVALID"
  | "SIGNAL_SOURCE_NOT_AUTHORIZED"
  | "SIGNAL_SOURCE_REGISTRY_BOUNDARY_INVALID"
  | "SIGNAL_SOURCE_RUNTIME_DISABLED"
  | "SIGNAL_STALE";

export class TrendConsensusValidationError extends Error {
  public constructor(public readonly code: TrendConsensusValidationCode) {
    super(`Trend consensus rejected signal: ${code}`);
    this.name = "TrendConsensusValidationError";
  }
}

export interface TrendConsensusProvenance {
  readonly attributionRequired: boolean;
  readonly canonicalReference: string;
  readonly observedAt: string;
  readonly providerReference: string;
  readonly reliability: SourceRegistryEntry["reliability"];
  readonly rightsClass: TrendRightsClass;
  readonly signalFamily: TrendSignalFamily;
  readonly signalFingerprint: string;
  readonly signalId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceReference: string;
}

export interface TrendConsensusCandidate {
  readonly candidateFingerprint: string;
  readonly candidateId: string;
  readonly missingEvidence: readonly ("THREE_INDEPENDENT_SOURCES_REQUIRED" | "THREE_SIGNAL_FAMILIES_REQUIRED")[];
  readonly normalizedTopic: string;
  readonly provenance: readonly TrendConsensusProvenance[];
  readonly signalCount: number;
  readonly sourceFamilies: readonly TrendSignalFamily[];
  readonly sourceFamilyCount: number;
  readonly sourceCount: number;
  readonly status: "CORROBORATED" | "INSUFFICIENT_CORROBORATION" | "MISSING_PROVENANCE";
  readonly topic: string;
}

export interface TrendConsensusView {
  readonly candidates: readonly TrendConsensusCandidate[];
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly externalWrites: "LOCKED";
  readonly generatedAt: string;
  readonly methodology: "DISTINCT_AUTHORIZED_SOURCE_CORROBORATION_NO_SCORE";
  readonly missing: readonly ("NO_SIGNALS" | "NO_CORROBORATED_CANDIDATE")[];
  readonly publication: "LOCKED";
  readonly status: "CORROBORATED" | "EMPTY" | "PARTIAL";
}

export function buildTrendConsensusView(input: {
  readonly generatedAt: string;
  readonly maxCandidates?: number;
  readonly signals: readonly TrendSignal[];
  readonly sources: readonly SourceRegistryEntry[];
}): TrendConsensusView {
  if (!timestamp(input.generatedAt) || input.signals.length > MAX_TREND_SIGNALS || input.sources.length > 100) throw new Error("Trend consensus input is invalid");
  const maxCandidates = input.maxCandidates ?? 50;
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) throw new Error("Trend consensus candidate limit is invalid");
  if (new Set(input.signals.map(({ signalId }) => signalId)).size !== input.signals.length) throw new Error("Trend consensus contains duplicate signal IDs");
  if (new Set(input.sources.map(({ sourceId }) => sourceId)).size !== input.sources.length) throw new Error("Trend consensus contains duplicate source IDs");

  const registry = new Map(input.sources.map((source) => [source.sourceId, source]));
  const groups = new Map<string, TrendSignal[]>();
  for (const signal of input.signals) {
    validateSignal(signal, registry, input.generatedAt);
    const key = normalizedTopic(signal.topic);
    if (key.length === 0) throw new Error("Trend consensus signal is invalid");
    const current = groups.get(key) ?? [];
    current.push(signal);
    groups.set(key, current);
  }

  const candidates = [...groups.entries()]
    .map(([topicKey, signals]) => candidate(topicKey, signals, registry))
    .sort((left, right) => candidateOrder(left.status) - candidateOrder(right.status) || right.sourceCount - left.sourceCount || left.normalizedTopic.localeCompare(right.normalizedTopic))
    .slice(0, maxCandidates);
  const corroborated = candidates.some(({ status }) => status === "CORROBORATED");
  const missing: TrendConsensusView["missing"] = input.signals.length === 0 ? ["NO_SIGNALS", "NO_CORROBORATED_CANDIDATE"] : corroborated ? [] : ["NO_CORROBORATED_CANDIDATE"];
  return deepFreezeTrend({
    candidates,
    contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
    externalWrites: "LOCKED",
    generatedAt: input.generatedAt,
    methodology: "DISTINCT_AUTHORIZED_SOURCE_CORROBORATION_NO_SCORE",
    missing,
    publication: "LOCKED",
    status: input.signals.length === 0 ? "EMPTY" : corroborated ? "CORROBORATED" : "PARTIAL",
  });
}

function candidate(topicKey: string, signals: readonly TrendSignal[], registry: ReadonlyMap<string, SourceRegistryEntry>): TrendConsensusCandidate {
  const validSources = new Set<string>();
  const provenance = [...signals]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.signalId.localeCompare(right.signalId))
    .map((signal): TrendConsensusProvenance => {
      const source = registry.get(signal.sourceId);
      if (source?.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new Error("Trend consensus source invariant violated");
      validSources.add(signal.sourceId);
      return deepFreezeTrend({
        attributionRequired: signal.attributionRequired,
        canonicalReference: source.canonicalReference,
        observedAt: signal.observedAt,
        providerReference: signal.providerReference,
        reliability: source.reliability,
        rightsClass: signal.rightsClass,
        signalFamily: signal.signalFamily,
        signalFingerprint: signal.signalFingerprint,
        signalId: signal.signalId,
        sourceId: signal.sourceId,
        sourceName: source.name,
        sourceReference: signal.evidenceReference ?? signal.providerReference,
      });
    });
  const sourceCount = validSources.size;
  const sourceFamilies = Object.freeze([...new Set(signals.map(({ signalFamily }) => signalFamily))].sort());
  const sourceFamilyCount = sourceFamilies.length;
  const status: TrendConsensusCandidate["status"] = sourceCount >= 3 && sourceFamilyCount >= 3 ? "CORROBORATED" : "INSUFFICIENT_CORROBORATION";
  const missingEvidence: TrendConsensusCandidate["missingEvidence"] = [
    ...(sourceCount < 3 ? ["THREE_INDEPENDENT_SOURCES_REQUIRED" as const] : []),
    ...(sourceFamilyCount < 3 ? ["THREE_SIGNAL_FAMILIES_REQUIRED" as const] : []),
  ];
  const base = {
    missingEvidence,
    normalizedTopic: topicKey,
    provenance,
    signalCount: signals.length,
    sourceFamilies,
    sourceFamilyCount,
    sourceCount,
    status,
    topic: canonicalTopic(signals),
  };
  const candidateFingerprint = canonicalSha256(base);
  return deepFreezeTrend({
    ...base,
    candidateFingerprint,
    candidateId: `trend-candidate-${candidateFingerprint.slice(0, 32)}`,
  });
}

function normalizedTopic(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function canonicalTopic(signals: readonly TrendSignal[]): string {
  return [...signals].sort((left, right) => right.observedAt.localeCompare(left.observedAt) || left.topic.localeCompare(right.topic))[0]?.topic ?? "";
}

function candidateOrder(status: TrendConsensusCandidate["status"]): number {
  return status === "CORROBORATED" ? 0 : status === "INSUFFICIENT_CORROBORATION" ? 1 : 2;
}

function timestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validateSignal(signal: TrendSignal, registry: ReadonlyMap<string, SourceRegistryEntry>, generatedAt: string): void {
  const { signalFingerprint, signalId: _signalId, ...fingerprintPayload } = signal;
  void _signalId;
  if (
    !/^[a-f0-9]{64}$/u.test(signalFingerprint) ||
    canonicalSha256(fingerprintPayload) !== signalFingerprint
  ) throw new TrendConsensusValidationError("SIGNAL_FINGERPRINT_INVALID");
  const catalog = trendSourceByKey(signal.sourceKey);
  if (catalog.sourceId !== signal.sourceId) throw new TrendConsensusValidationError("SIGNAL_SOURCE_BINDING_INVALID");
  if (catalog.providerRuntime !== "CONFIGURABLE") throw new TrendConsensusValidationError("SIGNAL_SOURCE_RUNTIME_DISABLED");
  const source = registry.get(signal.sourceId);
  if (source?.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new TrendConsensusValidationError("SIGNAL_SOURCE_NOT_AUTHORIZED");
  if (!referenceWithinBoundary(source.canonicalReference, catalog.canonicalReference)) {
    throw new TrendConsensusValidationError("SIGNAL_SOURCE_REGISTRY_BOUNDARY_INVALID");
  }
  if (!referenceWithinBoundary(signal.providerReference, source.canonicalReference)) throw new TrendConsensusValidationError("SIGNAL_PROVIDER_REFERENCE_INVALID");
  if (signal.evidenceReference !== undefined && !safePersistedReference(signal.evidenceReference)) throw new TrendConsensusValidationError("SIGNAL_EVIDENCE_REFERENCE_INVALID");
  if (!catalog.signalFamilies.includes(signal.signalFamily)) throw new TrendConsensusValidationError("SIGNAL_FAMILY_INVALID");
  if (!timestamp(signal.observedAt)) throw new TrendConsensusValidationError("SIGNAL_OBSERVED_AT_INVALID");
  const generated = Date.parse(generatedAt);
  const observed = Date.parse(signal.observedAt);
  if (observed > generated) throw new TrendConsensusValidationError("SIGNAL_OBSERVED_IN_FUTURE");
  if (generated - observed > source.maxFreshnessDays * 86_400_000) throw new TrendConsensusValidationError("SIGNAL_STALE");
  if (signal.retentionExpiresAt !== undefined) {
    if (!timestamp(signal.retentionExpiresAt)) throw new TrendConsensusValidationError("SIGNAL_RETENTION_INVALID");
    if (Date.parse(signal.retentionExpiresAt) <= generated) throw new TrendConsensusValidationError("SIGNAL_RETENTION_EXPIRED");
  }
}

function referenceWithinBoundary(value: string, boundary: string): boolean {
  if (!safePersistedReference(value)) return false;
  try {
    const candidate = new URL(value);
    const canonical = new URL(boundary);
    const path = canonical.pathname.endsWith("/") ? canonical.pathname : `${canonical.pathname}/`;
    return safePersistedReference(boundary) &&
      candidate.hostname === canonical.hostname &&
      candidate.port === canonical.port &&
      (candidate.pathname === canonical.pathname || candidate.pathname.startsWith(path));
  } catch {
    return false;
  }
}

function safePersistedReference(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}
