import { RepositoryValidationError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import { evaluateReferenceEligibility, isCompetitorMaterial } from "./reference-vault-eligibility.js";
import {
  REFERENCE_ROLES,
  REFERENCE_VAULT_LIMITS,
  type BusinessContext,
  type BusinessContextDatum,
  type CreativeDecision,
  type CreativeFingerprint,
  type OutcomeLink,
  type ReferenceAllowedUse,
  type ReferenceAsset,
  type ReferenceAssetRef,
  type ReferenceBrief,
  type ReferenceBriefAsset,
  type ReferenceCollectionProjection,
  type ReferencePlatform,
  type ReferenceRole,
} from "./reference-vault.js";
import type { ReferenceVaultRepository, ReferenceVaultTransactionRunner } from "./reference-vault-repository.js";
import { deepFreezeReference, referenceFingerprint } from "./reference-vault-validator.js";

export interface ReferenceVaultBriefQuery {
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
  readonly roles?: readonly ReferenceRole[];
  readonly limit?: number;
}

export interface ReferenceCollectionProjectionQuery {
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
}

export interface ReferenceVaultQueryAgentDependencies {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly repositories: ReferenceVaultTransactionRunner;
}

type ReferenceVaultReader = Pick<ReferenceVaultRepository, "getBlob" | "getRecord" | "listRecords">;

export class ReferenceVaultQueryAgent {
  public constructor(private readonly dependencies: ReferenceVaultQueryAgentDependencies) {}

  public getBrief(query: ReferenceVaultBriefQuery): Promise<ReferenceBrief> {
    const checked = validateQuery(query);
    return this.dependencies.repositories.transaction((repository) => buildReferenceBriefFromRepository(repository, this.dependencies, checked));
  }

  public getCollectionProjection(collectionId: string, query: ReferenceCollectionProjectionQuery): Promise<ReferenceCollectionProjection> {
    const checkedId = validId(collectionId);
    const checked = validateProjectionQuery(query);
    return this.dependencies.repositories.transaction((repository) => buildCollectionProjection(repository, this.dependencies, checkedId, checked));
  }
}

export async function buildReferenceBriefFromRepository(
  repository: ReferenceVaultReader,
  context: Pick<ReferenceVaultQueryAgentDependencies, "actorId" | "clock" | "workspaceId">,
  query: unknown,
): Promise<ReferenceBrief> {
  const checked = validateQuery(query);
  const identity = { actorId: context.actorId, workspaceId: context.workspaceId };
  const scanLimit = Math.min(REFERENCE_VAULT_LIMITS.maxRecordScan, Math.max(checked.limit * 10, 100));
  const [assetVersions, fingerprints, contexts, decisions, outcomes] = await Promise.all([
    repository.listRecords({ ...identity, limit: scanLimit, type: "REFERENCE_ASSET" }),
    repository.listRecords({ ...identity, limit: 20, type: "CREATIVE_FINGERPRINT" }),
    repository.listRecords({ ...identity, limit: 20, type: "BUSINESS_CONTEXT" }),
    repository.listRecords({ ...identity, limit: scanLimit, type: "CREATIVE_DECISION" }),
    repository.listRecords({ ...identity, limit: scanLimit, type: "OUTCOME_LINK" }),
  ]);
  assertIdentity([...assetVersions, ...fingerprints, ...contexts, ...decisions, ...outcomes], identity);
  const latestAssets = latestBy(assetVersions, (item) => item.assetId);
  const blockedAssets = latestAssets.filter(isCompetitorMaterial);
  const blockedAssetIds = new Set(blockedAssets.map((item) => item.assetId));
  const now = context.clock.now().getTime();
  const safeAssets: ReferenceAsset[] = [];
  for (const item of latestAssets) {
    const decision = evaluateReferenceEligibility(item, { now, purpose: checked.purpose, ...(checked.platform === undefined ? {} : { platform: checked.platform }) });
    if (!decision.eligible || (checked.roles.length > 0 && !checked.roles.some((role) => item.roles.includes(role)))) continue;
    if (!await hasReconciledCas(repository, identity, item)) continue;
    safeAssets.push(item);
    if (safeAssets.length === checked.limit) break;
  }
  const safeRefs = new Map(safeAssets.map((item) => [referenceKey(item), item]));
  const safeDecisions = decisions.filter((item) => referencesAreSafe(item.assetRefs, safeRefs, blockedAssetIds) && (item.expiresAt === "NOT_AVAILABLE" || Date.parse(item.expiresAt) > now)).slice(0, checked.limit);
  const safeOutcomes = outcomes.filter((item) => referencesAreSafe(item.assetRefs, safeRefs, blockedAssetIds)).slice(0, checked.limit);
  const creative = fingerprints.find((item) => referencesAreSafe(item.sampleAssetRefs, safeRefs, blockedAssetIds) && fingerprintEvidenceIsSafe(item, safeRefs, blockedAssetIds));
  const business = contexts.find((item) => businessEvidenceIsSafe(item, safeRefs, blockedAssetIds));
  const base = {
    actorId: context.actorId,
    assets: safeAssets.map(toBriefAsset),
    businessContext: business ?? { reasonCode: "REFERENCE_BUSINESS_CONTEXT_NOT_AVAILABLE" as const, status: "NOT_AVAILABLE" as const },
    ...(creative === undefined ? {} : { creativeFingerprint: creative }),
    competitorOutputPolicy: "BLOCKED" as const,
    contractVersion: "1" as const,
    decisions: safeDecisions,
    excludedCompetitorCount: blockedAssets.length,
    externalEffectsExecuted: false as const,
    generatedAt: context.clock.now().toISOString(),
    outcomes: safeOutcomes,
    ...(checked.platform === undefined ? {} : { platform: checked.platform }),
    purpose: checked.purpose,
    workspaceId: context.workspaceId,
  };
  return deepFreezeReference({ ...base, fingerprint: referenceFingerprint(base) });
}

export async function buildCollectionProjection(
  repository: ReferenceVaultReader,
  context: Pick<ReferenceVaultQueryAgentDependencies, "actorId" | "clock" | "workspaceId">,
  collectionId: string,
  query: ReferenceCollectionProjectionQuery,
): Promise<ReferenceCollectionProjection> {
  const identity = { actorId: context.actorId, workspaceId: context.workspaceId };
  const collection = await repository.getRecord({ ...identity, entityId: collectionId, type: "REFERENCE_COLLECTION" });
  if (collection === undefined) throw new RepositoryValidationError("Reference Vault collection does not exist");
  assertIdentity([collection], identity);
  const now = context.clock.now().getTime();
  const items: ReferenceCollectionProjection["items"][number][] = [];
  for (const requestedAssetRef of collection.assets) {
    const current = await repository.getRecord({ ...identity, entityId: requestedAssetRef.assetId, type: "REFERENCE_ASSET" });
    if (current === undefined) {
      items.push({ assetId: requestedAssetRef.assetId, eligibility: "MISSING", reasonCodes: ["REFERENCE_CURRENT_ASSET_MISSING"], requestedAssetRef });
      continue;
    }
    assertIdentity([current], identity);
    const decision = evaluateReferenceEligibility(current, { now, purpose: query.purpose, ...(query.platform === undefined ? {} : { platform: query.platform }) });
    const casReady = decision.eligible && await hasReconciledCas(repository, identity, current);
    items.push({
      assetId: current.assetId,
      currentAssetRef: toAssetRef(current),
      eligibility: decision.eligible && casReady ? "ELIGIBLE" : "BLOCKED",
      reasonCodes: decision.eligible && !casReady ? ["REFERENCE_CAS_MISSING"] : decision.reasonCodes,
      requestedAssetRef,
    });
  }
  const base = {
    actorId: context.actorId,
    collectionId: collection.collectionId,
    collectionVersion: collection.version,
    contractVersion: "1" as const,
    externalEffectsExecuted: false as const,
    items,
    ...(query.platform === undefined ? {} : { platform: query.platform }),
    purpose: query.purpose,
    resolvedAt: context.clock.now().toISOString(),
    workspaceId: context.workspaceId,
  };
  return deepFreezeReference({ ...base, fingerprint: referenceFingerprint(base) });
}

function validateQuery(query: unknown): Required<Pick<ReferenceVaultBriefQuery, "limit" | "purpose" | "roles">> & Pick<ReferenceVaultBriefQuery, "platform"> {
  if (typeof query !== "object" || query === null || Array.isArray(query)) throw new RepositoryValidationError("Reference Vault query is invalid");
  const candidate = query as Readonly<Record<string, unknown>>;
  const keys = Object.keys(candidate);
  if (!keys.every((key) => key === "roles" || key === "limit" || key === "purpose" || key === "platform")) throw new RepositoryValidationError("Reference Vault query is invalid");
  const roles = candidate.roles ?? [];
  const limit = candidate.limit ?? 50;
  const purpose = validPurpose(candidate.purpose);
  const platform = candidate.platform === undefined ? undefined : validPlatform(candidate.platform);
  if (!Array.isArray(roles) || roles.length > REFERENCE_ROLES.length - 1 || new Set(roles).size !== roles.length || !roles.every(safeRole) || typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Reference Vault query is invalid");
  return { limit, ...(platform === undefined ? {} : { platform }), purpose, roles };
}

function validateProjectionQuery(query: unknown): ReferenceCollectionProjectionQuery {
  if (typeof query !== "object" || query === null || Array.isArray(query)) throw new RepositoryValidationError("Reference Vault collection projection query is invalid");
  const candidate = query as Readonly<Record<string, unknown>>;
  if (!Object.keys(candidate).every((key) => key === "purpose" || key === "platform")) throw new RepositoryValidationError("Reference Vault collection projection query is invalid");
  const purpose = validPurpose(candidate.purpose);
  const platform = candidate.platform === undefined ? undefined : validPlatform(candidate.platform);
  return platform === undefined ? { purpose } : { platform, purpose };
}

function validPurpose(value: unknown): ReferenceAllowedUse {
  if (typeof value !== "string" || !["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"].includes(value)) throw new RepositoryValidationError("Reference Vault query purpose is invalid");
  return value as ReferenceAllowedUse;
}

function validPlatform(value: unknown): ReferencePlatform {
  if (typeof value !== "string" || !["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"].includes(value)) throw new RepositoryValidationError("Reference Vault query platform is invalid");
  return value as ReferencePlatform;
}

function validId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError("Reference Vault collection ID is invalid");
  return value;
}

function safeRole(value: unknown): value is Exclude<ReferenceRole, "COMPETITOR_REFERENCE"> {
  return typeof value === "string" && value !== "COMPETITOR_REFERENCE" && REFERENCE_ROLES.some((role) => role === value);
}

function assertIdentity(records: readonly { readonly actorId: string; readonly workspaceId: string }[], identity: { readonly actorId: string; readonly workspaceId: string }): void {
  if (records.some((item) => item.actorId !== identity.actorId || item.workspaceId !== identity.workspaceId)) throw new RepositoryValidationError("Reference Vault repository returned cross-identity data");
}

async function hasReconciledCas(repository: ReferenceVaultReader, identity: { readonly actorId: string; readonly workspaceId: string }, asset: ReferenceAsset): Promise<boolean> {
  const blob = await repository.getBlob(identity, asset.sha256);
  return blob?.sha256 === asset.sha256 && blob.byteLength === asset.byteLength && blob.mimeType === asset.mimeType;
}

function referenceKey(reference: Pick<ReferenceAsset, "assetId" | "fingerprint" | "version"> | ReferenceAssetRef): string {
  return `${reference.assetId}:${String(reference.version)}:${reference.fingerprint}`;
}

function referencesAreSafe(references: readonly ReferenceAssetRef[], safe: ReadonlyMap<string, ReferenceAsset>, blockedIds: ReadonlySet<string>): boolean {
  return references.length > 0 && references.every((reference) => !blockedIds.has(reference.assetId) && safe.has(referenceKey(reference)));
}

function fingerprintEvidenceIsSafe(fingerprint: CreativeFingerprint, safe: ReadonlyMap<string, ReferenceAsset>, blockedIds: ReadonlySet<string>): boolean {
  return referencesAreSafe(fingerprint.visual.sampleAssetRefs, safe, blockedIds) && referencesAreSafe(fingerprint.writing.sampleAssetRefs, safe, blockedIds);
}

function businessEvidenceIsSafe(context: BusinessContext, safe: ReadonlyMap<string, ReferenceAsset>, blockedIds: ReadonlySet<string>): boolean {
  const fields: readonly BusinessContextDatum[] = [context.founderConstraints, context.revenueTargets, context.budget, context.availableTime, context.riskTolerance, context.audience, context.offers, context.pricing, context.deliveryCapacity, context.channels, context.currentAssets, context.commercialExclusions, context.successMetrics, context.unitEconomics, context.customerJourney, context.activeExperiments];
  return fields.every((field) => field.status === "NOT_AVAILABLE" || referencesAreSafe(field.evidenceAssetRefs, safe, blockedIds));
}

function toBriefAsset(asset: ReferenceAsset): ReferenceBriefAsset {
  const roles = asset.roles.filter((role): role is Exclude<ReferenceRole, "COMPETITOR_REFERENCE"> => role !== "COMPETITOR_REFERENCE");
  return deepFreezeReference({ assetRef: toAssetRef(asset), audience: asset.audience, businessObjective: asset.businessObjective, platforms: asset.platforms, referenceId: asset.referenceId, roles, title: asset.title, whatNotToCopy: asset.whatNotToCopy, whatToLearn: asset.whatToLearn });
}

function toAssetRef(asset: ReferenceAsset): ReferenceAssetRef {
  return { assetId: asset.assetId, fingerprint: asset.fingerprint, version: asset.version };
}

function latestBy<T extends { readonly version: number }>(records: readonly T[], identity: (record: T) => string): readonly T[] {
  const latest = new Map<string, T>();
  for (const item of records) {
    const key = identity(item);
    const current = latest.get(key);
    if (current === undefined || item.version > current.version) latest.set(key, item);
  }
  return [...latest.values()];
}

export function referenceBriefContainsCompetitorMaterial(brief: ReferenceBrief, blockedAssets: readonly ReferenceAsset[]): boolean {
  const blockedIds = new Set(blockedAssets.filter(isCompetitorMaterial).map((item) => item.assetId));
  return [...brief.assets.map((item) => item.assetRef), ...brief.decisions.flatMap((item: CreativeDecision) => item.assetRefs), ...brief.outcomes.flatMap((item: OutcomeLink) => item.assetRefs)].some((reference) => blockedIds.has(reference.assetId));
}
