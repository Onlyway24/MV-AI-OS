import type { JsonValue } from "../contracts/json.js";
import { evaluateReferenceEligibility } from "../reference-vault/reference-vault-eligibility.js";
import type {
  BusinessContext,
  BusinessContextDatum,
  CreativeDecision,
  CreativeFingerprint,
  OutcomeLink,
  ReferenceAsset,
  ReferenceCollection,
  ReferenceConfidence,
  ReferenceEligibilityReasonCode,
  ReferenceRightsStatus,
  ReferenceRole,
} from "../reference-vault/reference-vault.js";

export interface CommandCenterReferenceVaultView {
  readonly assets: readonly CommandCenterReferenceAssetView[];
  readonly businessContext: CommandCenterBusinessContextView | null;
  readonly coverage: "COMPLETE" | "LIMIT_REACHED" | "NOT_AVAILABLE";
  readonly decisions: readonly CommandCenterCreativeDecisionView[];
  readonly missingInputs: readonly string[];
  readonly outcomeLinks: readonly CommandCenterOutcomeLinkView[];
  readonly queryStatus: "READY" | "UNAVAILABLE";
  readonly rightsBlockers: readonly CommandCenterRightsBlockerView[];
  readonly sequences: readonly CommandCenterReferenceSequenceView[];
  readonly visualFingerprint: CommandCenterFingerprintView | null;
  readonly writingFingerprint: CommandCenterFingerprintView | null;
}

export interface CommandCenterReferenceSequenceView {
  readonly collectionId: string;
  readonly description: string;
  readonly items: readonly Readonly<{
    readonly available: boolean;
    readonly currentVersion?: number;
    readonly eligibilityReasonCodes: readonly (ReferenceEligibilityReasonCode | "REFERENCE_CAS_MISSING" | "REFERENCE_CURRENT_ASSET_MISSING")[];
    readonly referenceId: string;
    readonly requestedVersion: number;
    readonly version: number;
  }>[];
  readonly roles: readonly ReferenceRole[];
  readonly title: string;
  readonly version: number;
}

export interface CommandCenterReferenceAssetView {
  readonly assetId: string;
  readonly approvalReason: string;
  readonly audience: readonly string[];
  readonly businessObjective: string;
  readonly current: true;
  readonly dimensions: Readonly<{ readonly height?: number; readonly status: "AVAILABLE" | "NOT_AVAILABLE"; readonly width?: number }>;
  readonly fingerprint: string;
  readonly eligible: boolean;
  readonly eligibilityReasonCodes: readonly (ReferenceEligibilityReasonCode | "REFERENCE_CAS_MISSING")[];
  readonly linkedMission: readonly string[];
  readonly linkedOutcome: readonly string[];
  readonly linkedPackage: readonly string[];
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly referenceId: string;
  readonly referenceRoles: readonly ReferenceRole[];
  readonly rights: Readonly<{
    readonly allowedUse: readonly string[];
    readonly expiresAt?: string;
    readonly status: ReferenceRightsStatus;
  }>;
  readonly rightsBlocked: boolean;
  readonly privacy: Readonly<{
    readonly retentionExpiresAt: string;
    readonly status: ReferenceAsset["privacy"]["status"];
  }>;
  readonly sha256: string;
  readonly source: Readonly<{ readonly type: string }>;
  readonly status: ReferenceAsset["status"];
  readonly title: string;
  readonly version: number;
  readonly whatNotToCopy: readonly string[];
  readonly whatToLearn: readonly string[];
}

export interface CommandCenterFingerprintView {
  readonly confidence: ReferenceConfidence;
  readonly preferences: Readonly<Record<string, readonly string[]>>;
  readonly sampleCount: number;
  readonly version: number;
}

export interface CommandCenterBusinessContextView {
  readonly activeExperiments: JsonValue;
  readonly audience: JsonValue;
  readonly availableTime: JsonValue;
  readonly budget: JsonValue;
  readonly channels: JsonValue;
  readonly commercialExclusions: JsonValue;
  readonly currentAssets: JsonValue;
  readonly customerJourney: JsonValue;
  readonly deliveryCapacity: JsonValue;
  readonly founderConstraints: JsonValue;
  readonly offers: JsonValue;
  readonly pricing: JsonValue;
  readonly revenueTargets: JsonValue;
  readonly riskTolerance: JsonValue;
  readonly successMetrics: JsonValue;
  readonly unitEconomics: JsonValue;
  readonly version: number;
}

export interface CommandCenterCreativeDecisionView {
  readonly affectedElement: string;
  readonly confidence: CreativeDecision["confidence"];
  readonly createdAt: string;
  readonly decision: CreativeDecision["decision"];
  readonly expiresAt: CreativeDecision["expiresAt"];
  readonly packageIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly resultingRevision: CreativeDecision["resultingRevision"];
  readonly reusableRule: string;
  readonly scope: CreativeDecision["scope"];
  readonly structuredReason: string;
}

export interface CommandCenterOutcomeLinkView {
  readonly observedAt: string;
  readonly outcomeLinkId: string;
  readonly referenceId: string;
  readonly result: OutcomeLink["result"];
}

export interface CommandCenterRightsBlockerView {
  readonly reasonCode: ReferenceEligibilityReasonCode | "REFERENCE_CAS_MISSING";
  readonly referenceId: string;
}

export function buildCommandCenterReferenceVaultView(input: {
  readonly actorId: string;
  readonly assets: readonly ReferenceAsset[];
  readonly businessContexts: readonly BusinessContext[];
  readonly casUnavailableAssetKeys?: ReadonlySet<string>;
  readonly collections: readonly ReferenceCollection[];
  readonly coverage?: "COMPLETE" | "LIMIT_REACHED";
  readonly decisions: readonly CreativeDecision[];
  readonly fingerprints: readonly CreativeFingerprint[];
  readonly now: Date;
  readonly outcomes: readonly OutcomeLink[];
  readonly workspaceId: string;
}): CommandCenterReferenceVaultView {
  const ownedAssets = input.assets.filter((asset) => asset.actorId === input.actorId && asset.workspaceId === input.workspaceId);
  const currentAssets = latestBy(ownedAssets, ({ assetId }) => assetId);
  const assets = currentAssets.map((asset) => toAssetView(asset, input.now, input.casUnavailableAssetKeys?.has(assetKey(asset)) === true));
  const assetViewsById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const fingerprints = latestBy(input.fingerprints.filter((record) => record.actorId === input.actorId && record.workspaceId === input.workspaceId), ({ creativeFingerprintId }) => creativeFingerprintId);
  const businessContexts = latestBy(input.businessContexts.filter((record) => record.actorId === input.actorId && record.workspaceId === input.workspaceId), ({ businessContextId }) => businessContextId);
  const collections = latestBy(input.collections.filter((record) => record.actorId === input.actorId && record.workspaceId === input.workspaceId), ({ collectionId }) => collectionId);
  const decisions = input.decisions
    .filter((record) => record.actorId === input.actorId && record.workspaceId === input.workspaceId)
    .sort((left, right) => Date.parse(right.decidedAt) - Date.parse(left.decidedAt));
  const outcomes = input.outcomes
    .filter((record) => record.actorId === input.actorId && record.workspaceId === input.workspaceId)
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const creative = fingerprints[0];
  const business = businessContexts[0];
  const missingInputs: string[] = [];
  if (assets.length === 0) missingInputs.push("Nessun riferimento importato.");
  if (creative === undefined) missingInputs.push("Creative Fingerprint non disponibile: servono decisioni esplicite di Fabio.");
  if (business === undefined) missingInputs.push("Business Context non disponibile: i valori mancanti non vengono stimati.");

  return freeze({
    assets,
    businessContext: business === undefined ? null : toBusinessContextView(business),
    coverage: input.coverage ?? "COMPLETE",
    decisions: decisions.map((decision) => ({
      affectedElement: decision.affectedElement,
      confidence: decision.confidence,
      createdAt: decision.decidedAt,
      decision: decision.decision,
      expiresAt: decision.expiresAt,
      packageIds: decision.packageRefs.map(({ packageId }) => packageId),
      referenceIds: decision.assetRefs.map(({ assetId }) => assetId),
      resultingRevision: decision.resultingRevision,
      reusableRule: decision.reusableRule,
      scope: decision.scope,
      structuredReason: decision.rationale,
    })),
    missingInputs,
    outcomeLinks: outcomes.flatMap((outcome) => outcome.assetRefs.map(({ assetId }) => ({ observedAt: outcome.observedAt, outcomeLinkId: outcome.outcomeLinkId, referenceId: assetId, result: outcome.result }))),
    queryStatus: "READY" as const,
    rightsBlockers: assets.flatMap((asset) => asset.eligibilityReasonCodes.map((reasonCode) => ({ reasonCode, referenceId: asset.referenceId }))),
    sequences: collections.map((collection) => toSequenceView(collection, assetViewsById)),
    visualFingerprint: creative === undefined ? null : toFingerprintView(creative.visual, visualFields),
    writingFingerprint: creative === undefined ? null : toFingerprintView(creative.writing, writingFields),
  });
}

function toSequenceView(collection: ReferenceCollection, currentAssets: ReadonlyMap<string, CommandCenterReferenceAssetView>): CommandCenterReferenceSequenceView {
  return freeze({
    collectionId: collection.collectionId,
    description: collection.description,
    items: collection.assets.map((reference) => {
      const asset = currentAssets.get(reference.assetId);
      if (asset === undefined) return { available: false, eligibilityReasonCodes: ["REFERENCE_CURRENT_ASSET_MISSING" as const], referenceId: reference.assetId, requestedVersion: reference.version, version: reference.version };
      return {
        available: asset.eligible,
        currentVersion: asset.version,
        eligibilityReasonCodes: asset.eligibilityReasonCodes,
        referenceId: asset.referenceId,
        requestedVersion: reference.version,
        version: asset.version,
      };
    }),
    roles: collection.roles,
    title: collection.title,
    version: collection.version,
  });
}

const visualFields = Object.freeze(["realism", "lighting", "contrast", "depth", "objectDensity", "focalHierarchy", "luxuryLevel", "textDensity", "colorUsage", "composition", "negativeSpace", "forbiddenElements"] as const);
const writingFields = Object.freeze(["titleLength", "sentenceLength", "vocabulary", "directness", "urgency", "practicalDensity", "guruRisk", "ctaStyle", "evidenceLanguage", "forbiddenExpressions"] as const);

function toAssetView(asset: ReferenceAsset, now: Date, casUnavailable: boolean): CommandCenterReferenceAssetView {
  const eligibility = evaluateReferenceEligibility(asset, { now: now.getTime(), purpose: "CREATIVE_DIRECTION" });
  const eligibilityReasonCodes = Object.freeze([
    ...eligibility.reasonCodes,
    ...(casUnavailable ? ["REFERENCE_CAS_MISSING" as const] : []),
  ]);
  const eligible = eligibility.eligible && !casUnavailable;
  return freeze({
    approvalReason: asset.fabioApproval.reason,
    assetId: asset.assetId,
    audience: asset.audience,
    businessObjective: asset.businessObjective,
    current: true as const,
    dimensions: asset.dimensions,
    eligible,
    eligibilityReasonCodes,
    fingerprint: asset.fingerprint,
    linkedMission: asset.links.missionIds,
    linkedOutcome: asset.links.outcomeIds,
    linkedPackage: asset.links.packageIds,
    mimeType: asset.mimeType,
    originalFilename: asset.originalFilename,
    privacy: { retentionExpiresAt: asset.privacy.retentionExpiresAt, status: asset.privacy.status },
    referenceId: asset.referenceId,
    referenceRoles: asset.roles,
    rights: {
      allowedUse: asset.rights.allowedUse,
      ...(asset.rights.expiresAt === undefined ? {} : { expiresAt: asset.rights.expiresAt }),
      status: asset.rights.status,
    },
    rightsBlocked: !eligible,
    sha256: asset.sha256,
    source: { type: asset.source.type },
    status: asset.status,
    title: asset.title,
    version: asset.version,
    whatNotToCopy: asset.whatNotToCopy,
    whatToLearn: asset.whatToLearn,
  });
}

function toFingerprintView(preference: CreativeFingerprint["visual"] | CreativeFingerprint["writing"], fields: readonly string[]): CommandCenterFingerprintView {
  const preferences: Record<string, readonly string[]> = {};
  for (const [field, value] of Object.entries(preference)) {
    if (fields.includes(field) && Array.isArray(value) && value.every((item) => typeof item === "string")) preferences[field] = value;
  }
  return freeze({ confidence: preference.confidence, preferences, sampleCount: preference.sampleCount, version: preference.version });
}

function toBusinessContextView(context: BusinessContext): CommandCenterBusinessContextView {
  return freeze({
    activeExperiments: datum(context.activeExperiments),
    audience: datum(context.audience),
    availableTime: datum(context.availableTime),
    budget: datum(context.budget),
    channels: datum(context.channels),
    commercialExclusions: datum(context.commercialExclusions),
    currentAssets: datum(context.currentAssets),
    customerJourney: datum(context.customerJourney),
    deliveryCapacity: datum(context.deliveryCapacity),
    founderConstraints: datum(context.founderConstraints),
    offers: datum(context.offers),
    pricing: datum(context.pricing),
    revenueTargets: datum(context.revenueTargets),
    riskTolerance: datum(context.riskTolerance),
    successMetrics: datum(context.successMetrics),
    unitEconomics: datum(context.unitEconomics),
    version: context.version,
  });
}

function datum(value: BusinessContextDatum): JsonValue {
  return value.status === "AVAILABLE" ? value.value : "NOT_AVAILABLE";
}

function assetKey(asset: Pick<ReferenceAsset, "assetId" | "fingerprint" | "version">): string { return `${asset.assetId}:${String(asset.version)}:${asset.fingerprint}`; }

function latestBy<T extends { readonly version: number }>(records: readonly T[], identity: (record: T) => string): readonly T[] {
  const latest = new Map<string, T>();
  for (const record of records) {
    const key = identity(record);
    const current = latest.get(key);
    if (current === undefined || record.version > current.version) latest.set(key, record);
  }
  return [...latest.values()].sort((left, right) => right.version - left.version);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
