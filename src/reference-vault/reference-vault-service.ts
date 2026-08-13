import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import type { JsonObject, JsonValue } from "../contracts/json.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import {
  REFERENCE_VAULT_LIMITS,
  type BusinessContext,
  type BusinessContextDatum,
  type CreativeDecision,
  type CreativeFingerprint,
  type OutcomeLink,
  type ReferenceAsset,
  type ReferenceAssetRef,
  type ReferenceBlobTombstone,
  type ReferenceCollection,
  type ReferenceDimensions,
  type ReferenceImportCandidate,
  type ReferenceImportPreview,
  type ReferenceImportRequest,
  type ReferenceImportReceipt,
  type ReferenceVaultCommand,
} from "./reference-vault.js";
import { evaluateReferenceEligibility, isCompetitorMaterial } from "./reference-vault-eligibility.js";
import { ReferenceVaultError } from "./reference-vault-error.js";
import type { ReferenceVaultApprovalAuthority } from "./reference-vault-approval-authority.js";
import type { ReferenceVaultIdentity, ReferenceVaultRepository, ReferenceVaultTransactionRunner } from "./reference-vault-repository.js";
import { buildReferenceBriefFromRepository } from "./reference-vault-query-agent.js";
import {
  AudienceSignalValidator,
  BusinessContextValidator,
  containsDecodedReferenceCredentialMaterial,
  CreativeDecisionValidator,
  CreativeFingerprintValidator,
  CustomerLanguageReferenceValidator,
  NegativeReferenceValidator,
  OfferReferenceValidator,
  OutcomeLinkValidator,
  referenceConfidence,
  referenceFingerprint,
  ReferenceAssetValidator,
  ReferenceBlobTombstoneValidator,
  ReferenceCollectionValidator,
  ReferenceImportPreviewValidator,
  ReferenceImportReceiptValidator,
  ReferenceImportRequestValidator,
  ReferencePrivacyValidator,
  ReferenceReviewValidator,
  ReferenceRightsValidator,
  ReferenceSourceValidator,
  VisualPreferenceValidator,
  WritingPreferenceValidator,
} from "./reference-vault-validator.js";

export interface ReferenceVaultServiceDependencies extends ReferenceVaultIdentity {
  readonly approvalAuthority?: ReferenceVaultApprovalAuthority;
  readonly clock: Clock;
  readonly repositories: ReferenceVaultTransactionRunner;
}

interface DetectedBinary {
  readonly mimeType: string;
  readonly dimensions: ReferenceDimensions;
}

const VISUAL_FIELDS = ["realism", "lighting", "contrast", "depth", "objectDensity", "focalHierarchy", "luxuryLevel", "textDensity", "colorUsage", "composition", "negativeSpace", "forbiddenElements"] as const;
const WRITING_FIELDS = ["titleLength", "sentenceLength", "vocabulary", "directness", "urgency", "practicalDensity", "guruRisk", "ctaStyle", "evidenceLanguage", "forbiddenExpressions"] as const;
const BUSINESS_FIELDS = ["founderConstraints", "revenueTargets", "budget", "availableTime", "riskTolerance", "audience", "offers", "pricing", "deliveryCapacity", "channels", "currentAssets", "commercialExclusions", "successMetrics", "unitEconomics", "customerJourney", "activeExperiments"] as const;
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) === 0 ? 0 : 0xedb88320);
  return value >>> 0;
}));
const DECODER_UNAVAILABLE_MIME_TYPES = new Set(["application/pdf", "image/gif", "image/jpeg"]);

export class ReferenceVaultService {
  public constructor(private readonly dependencies: ReferenceVaultServiceDependencies) {}

  public previewImport(candidate: unknown): Promise<ReferenceImportPreview> {
    const request = checked(candidate, new ReferenceImportRequestValidator(), "Reference import request");
    return this.dependencies.repositories.transaction((repository) => this.previewImportInTransaction(repository, request));
  }

  public executeInTransaction(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<unknown> {
    switch (command.operation) {
      case "PREVIEW_REFERENCE_IMPORT": return this.previewImportInTransaction(repository, checked(command.input.request, new ReferenceImportRequestValidator(), "Reference import request"));
      case "IMPORT_REFERENCE_ASSET": return this.#import(repository, checked(command.input.request, new ReferenceImportRequestValidator(), "Reference import request"), command);
      case "REVIEW_REFERENCE_ASSET": return this.#transitionAsset(repository, command, "REVIEW");
      case "APPROVE_REFERENCE_ASSET": return this.#transitionAsset(repository, command, "APPROVE");
      case "REJECT_REFERENCE_ASSET": return this.#transitionAsset(repository, command, "REJECT");
      case "ARCHIVE_REFERENCE_ASSET": return this.#transitionAsset(repository, command, "ARCHIVE");
      case "RECORD_CREATIVE_DECISION": return this.#recordDecision(repository, command);
      case "UPDATE_CREATIVE_FINGERPRINT": return this.#updateCreativeFingerprint(repository, command);
      case "UPDATE_BUSINESS_CONTEXT": return this.#updateBusinessContext(repository, command);
      case "LINK_REFERENCE_OUTCOME": return this.#linkOutcome(repository, command);
      case "GET_REFERENCE_BRIEF": return buildReferenceBriefFromRepository(repository, this.dependencies, command.input);
      case "PURGE_EXPIRED_REFERENCE_CONTENT": return this.#purgeExpiredContent(repository, command);
    }
  }

  public async previewImportInTransaction(repository: ReferenceVaultRepository, request: ReferenceImportRequest): Promise<ReferenceImportPreview> {
    const now = this.dependencies.clock.now().getTime();
    const usage = await repository.getStorageUsage(this.#identity());
    let projectedBlobCount = usage.blobCount;
    let projectedTotalBytes = usage.totalBytes;
    const seenHashes = new Set<string>();
    const items: ReferenceImportPreview["items"][number][] = [];
    for (const candidate of request.assets) {
      const reasons: string[] = [];
      const bytes = decodeBase64(candidate.contentBase64);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      const detected = detectBinary(bytes, candidate.mimeType);
      if (bytes.byteLength !== candidate.declaredByteLength || actualHash !== candidate.declaredSha256) reasons.push("REFERENCE_CONTENT_CORRUPT");
      if (detected === undefined) reasons.push(binaryValidationBlocker(bytes, candidate.mimeType));
      else {
        if (detected.mimeType !== candidate.mimeType) reasons.push("REFERENCE_MIME_MISMATCH");
        if (!sameDimensions(detected.dimensions, candidate.dimensions)) reasons.push("REFERENCE_DIMENSIONS_MISMATCH");
      }
      const duplicateInBatch = seenHashes.has(candidate.declaredSha256);
      if (duplicateInBatch) reasons.push("REFERENCE_DUPLICATE_IN_BATCH");
      seenHashes.add(candidate.declaredSha256);
      reasons.push(
        ...freshnessBlockers(candidate.freshness, now),
        ...importRightsBlockers(candidate, now, this.dependencies),
        ...importPrivacyBlockers(candidate, now),
        ...credentialMaterialBlockers(bytes, detected),
      );
      const byId = await repository.getRecord({ ...this.#identity(), entityId: candidate.assetId, type: "REFERENCE_ASSET" });
      const byHash = await repository.findAssetBySha256(this.#identity(), candidate.declaredSha256);
      if (byHash !== undefined && await repository.getBlob(this.#identity(), candidate.declaredSha256) === undefined) reasons.push("REFERENCE_CONTENT_PREVIOUSLY_PURGED");
      if (byId !== undefined && byId.sha256 !== candidate.declaredSha256) reasons.push("REFERENCE_ASSET_ID_CONFLICT");
      if (byHash !== undefined && byId !== undefined && byHash.assetId !== byId.assetId) reasons.push("REFERENCE_ASSET_ID_CONFLICT");
      if (reasons.length === 0 && byHash === undefined && !duplicateInBatch) {
        const nextBlobCount = projectedBlobCount + 1;
        const nextTotalBytes = projectedTotalBytes + candidate.declaredByteLength;
        if (nextBlobCount > REFERENCE_VAULT_LIMITS.maxBlobCountPerActorWorkspace || nextTotalBytes > REFERENCE_VAULT_LIMITS.maxTotalBytesPerActorWorkspace) reasons.push("REFERENCE_QUOTA_EXCEEDED");
        else {
          projectedBlobCount = nextBlobCount;
          projectedTotalBytes = nextTotalBytes;
        }
      }
      const reasonCodes = [...new Set(reasons)].sort();
      items.push({
        assetId: candidate.assetId,
        detectedMimeType: detected?.mimeType ?? "NOT_AVAILABLE",
        disposition: reasonCodes.length > 0 ? "BLOCKED" : byHash === undefined ? "IMPORT" : "DUPLICATE",
        reasonCodes,
        referenceId: candidate.referenceId,
        sha256: candidate.declaredSha256,
      });
    }
    const blockerCodes = [...new Set(items.flatMap((item) => item.reasonCodes))].sort();
    const base = {
      ...this.#identity(),
      batchId: request.batchId,
      blockerCodes,
      contractVersion: "1" as const,
      duplicateCount: items.filter((item) => item.disposition === "DUPLICATE").length,
      importableCount: items.filter((item) => item.disposition === "IMPORT").length,
      items,
      status: blockerCodes.length === 0 ? "READY" as const : "BLOCKED" as const,
    };
    return checked({ ...base, fingerprint: referenceFingerprint(base) }, new ReferenceImportPreviewValidator(), "Reference import preview");
  }

  async #import(repository: ReferenceVaultRepository, request: ReferenceImportRequest, command: ReferenceVaultCommand): Promise<ReferenceImportReceipt> {
    this.#assertCreateControl(command, request.batchId);
    const preview = await this.previewImportInTransaction(repository, request);
    if (preview.status !== "READY") throw new ReferenceVaultError("reference_vault_import_blocked", "Reference import is blocked", { batchId: request.batchId, blockerCodes: preview.blockerCodes });
    const now = this.dependencies.clock.now().toISOString();
    const imported: ReferenceAssetRef[] = [];
    const duplicates: ReferenceAssetRef[] = [];
    for (const candidate of request.assets) {
      const existing = await repository.findAssetBySha256(this.#identity(), candidate.declaredSha256);
      if (existing !== undefined) {
        duplicates.push(assetRef(existing));
        continue;
      }
      const bytes = decodeBase64(candidate.contentBase64);
      const detected = detectBinary(bytes, candidate.mimeType);
      if (detected === undefined) throw new ReferenceVaultError("reference_vault_corrupt", "Reference binary changed after preview", { referenceId: candidate.referenceId });
      if (detected.mimeType !== candidate.mimeType || !sameDimensions(detected.dimensions, candidate.dimensions)) throw new ReferenceVaultError("reference_vault_corrupt", "Reference binary changed after preview", { referenceId: candidate.referenceId });
      await repository.putBlob({ ...this.#identity(), byteLength: bytes.byteLength, bytes, mimeType: detected.mimeType, sha256: candidate.declaredSha256, storedAt: now });
      const asset = buildAsset(candidate, this.dependencies.actorId, this.dependencies.workspaceId, now);
      await repository.appendRecord("REFERENCE_ASSET", asset.assetId, asset);
      imported.push(assetRef(asset));
    }
    const allRefs = [...imported, ...duplicates];
    const collection = request.collection === undefined ? undefined : await this.#createCollection(repository, request.collection, allRefs, now);
    const receiptBase = {
      ...this.#identity(),
      batchId: request.batchId,
      commandId: command.commandId,
      ...(collection === undefined ? {} : { collectionRef: { collectionId: collection.collectionId, fingerprint: collection.fingerprint, version: collection.version } }),
      contractVersion: "1" as const,
      duplicateAssets: duplicates,
      duplicateCount: duplicates.length,
      durableOriginals: true as const,
      externalEffectsExecuted: false as const,
      importedAssets: imported,
      importedCount: imported.length,
      previewFingerprint: preview.fingerprint,
      receiptId: `reference-import-${command.commandId}`,
      recordedAt: now,
      version: 0 as const,
    };
    const receipt = checked({ ...receiptBase, fingerprint: referenceFingerprint(receiptBase) }, new ReferenceImportReceiptValidator(), "Reference import receipt");
    await repository.appendRecord("REFERENCE_IMPORT_RECEIPT", receipt.receiptId, receipt);
    return receipt;
  }

  async #createCollection(repository: ReferenceVaultRepository, input: NonNullable<ReferenceImportRequest["collection"]>, assets: readonly ReferenceAssetRef[], now: string): Promise<ReferenceCollection> {
    const existing = await repository.getRecord({ ...this.#identity(), entityId: input.collectionId, type: "REFERENCE_COLLECTION" });
    if (existing !== undefined) throw new ReferenceVaultError("reference_vault_conflict", "Reference collection already exists", { collectionId: input.collectionId });
    const base = { ...this.#identity(), assets, collectionId: input.collectionId, contractVersion: "1" as const, createdAt: now, description: input.description, roles: input.roles, title: input.title, updatedAt: now, version: 0 };
    const collection = checked({ ...base, fingerprint: referenceFingerprint(base) }, new ReferenceCollectionValidator(), "Reference collection");
    await repository.appendRecord("REFERENCE_COLLECTION", collection.collectionId, collection);
    return collection;
  }

  async #transitionAsset(repository: ReferenceVaultRepository, command: ReferenceVaultCommand, transition: "APPROVE" | "ARCHIVE" | "REJECT" | "REVIEW"): Promise<ReferenceAsset> {
    if (transition === "APPROVE") assertShape(command.input, ["assetId", "findings", "purpose", "reason"], ["platform"]);
    else assertShape(command.input, ["assetId", "findings", "reason"]);
    const assetId = requiredId(command.input.assetId, "assetId");
    const current = await this.#latestAsset(repository, assetId);
    this.#assertExistingControl(command, current.assetId, current.version, current.fingerprint);
    if (current.status === "ARCHIVED") throw new ReferenceVaultError("reference_vault_conflict", "Archived reference asset cannot transition", { assetId });
    const now = this.dependencies.clock.now().toISOString();
    const purpose = transition === "APPROVE" ? requiredEnum(command.input.purpose, "purpose", ["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"]) : "CREATIVE_DIRECTION";
    const platform = transition === "APPROVE" && command.input.platform !== undefined ? requiredEnum(command.input.platform, "platform", ["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"]) : undefined;
    const eligibility = evaluateReferenceEligibility({ ...current, status: "APPROVED" }, { now: Date.parse(now), purpose, ...(platform === undefined ? {} : { platform }) });
    const stale = eligibility.reasonCodes.some((code) => code === "REFERENCE_STALE" || code === "REFERENCE_EXPIRED");
    const privacyBlocked = eligibility.reasonCodes.some((code) => code.startsWith("REFERENCE_PRIVACY_") || code === "REFERENCE_RETENTION_EXPIRED");
    const rightsBlocked = eligibility.reasonCodes.some((code) => code.startsWith("REFERENCE_RIGHTS_") || code === "REFERENCE_PURPOSE_NOT_AUTHORIZED" || code === "REFERENCE_PLATFORM_NOT_AUTHORIZED" || code === "REFERENCE_COMPETITOR_OUTPUT_BLOCKED");
    if (transition === "APPROVE" && privacyBlocked) throw new ReferenceVaultError("reference_vault_privacy_blocked", "Reference asset privacy evidence is not eligible for output", { assetId, reasonCodes: eligibility.reasonCodes });
    if (transition === "APPROVE" && rightsBlocked) throw new ReferenceVaultError("reference_vault_rights_blocked", "Reference asset rights do not authorize the requested output purpose", { assetId, reasonCodes: eligibility.reasonCodes });
    if (transition === "APPROVE" && stale) throw new ReferenceVaultError("reference_vault_stale", "Reference asset is stale or expired", { assetId, reasonCodes: eligibility.reasonCodes });
    if (transition === "APPROVE" && !["IMPORTED", "PENDING_FABIO_REVIEW"].includes(current.status)) throw new ReferenceVaultError("reference_vault_conflict", "Reference asset is not eligible for approval", { assetId, status: current.status });
    if (transition === "APPROVE") await this.#assertCas(repository, current);
    const reason = requiredText(command.input.reason, "reason", 4_000);
    const status = transition === "ARCHIVE" ? "ARCHIVED" as const
      : transition === "REJECT" ? "REJECTED" as const
        : transition === "APPROVE" ? "APPROVED" as const
          : stale ? "EXPIRED" as const
            : rightsBlocked ? "RIGHTS_BLOCKED" as const
              : "PENDING_FABIO_REVIEW" as const;
    const fabioApproval = transition === "APPROVE" ? { decidedAt: now, decidedBy: this.dependencies.actorId, reason, status: "APPROVED" as const }
      : transition === "REJECT" ? { decidedAt: now, decidedBy: this.dependencies.actorId, reason, status: "REJECTED" as const }
        : current.fabioApproval.status === "PENDING" ? { reason, status: "PENDING" as const }
          : current.fabioApproval;
    const nextBase = { ...omitFingerprint(current), fabioApproval, status, updatedAt: now, version: current.version + 1 };
    const next = checked({ ...nextBase, fingerprint: referenceFingerprint(nextBase) }, new ReferenceAssetValidator(), "Reference asset transition");
    const reviewBase = { ...this.#identity(), assetRef: assetRef(next), contractVersion: "1" as const, decision: status, findings: requiredStrings(command.input.findings, "findings", 0, 100, 1_000), reason, reviewId: `reference-review-${command.commandId}`, reviewedAt: now, version: 0 as const };
    const review = checked({ ...reviewBase, fingerprint: referenceFingerprint(reviewBase) }, new ReferenceReviewValidator(), "Reference review");
    await repository.appendRecord("REFERENCE_REVIEW", review.reviewId, review);
    await repository.appendRecord("REFERENCE_ASSET", next.assetId, next, { previousVersion: current.version });
    return next;
  }

  async #recordDecision(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<CreativeDecision> {
    assertShape(command.input, ["affectedElement", "assetRefs", "audience", "businessObjective", "confidence", "decidedAt", "decision", "decisionId", "expiresAt", "links", "packageRefs", "rationale", "resultingRevision", "reusableRule", "scope"]);
    const decisionId = requiredId(command.input.decisionId, "decisionId");
    this.#assertCreateControl(command, decisionId);
    const references = requiredRefs(command.input.assetRefs, "assetRefs");
    const decisionType = requiredEnum(command.input.decision, "decision", ["ACCEPT", "AVOID", "PREFER", "REJECT", "REQUEST_REVISION"]);
    await this.#assertAssetRefs(repository, references, decisionType === "ACCEPT" || decisionType === "PREFER");
    const packageReferences = requiredPackageRefs(command.input.packageRefs);
    await this.#assertAuthoritativePackageRefs(repository, packageReferences);
    const resultingRevision = requiredResultingRevision(command.input.resultingRevision);
    if (resultingRevision.status === "AVAILABLE") await this.#assertAuthoritativePackageRefs(repository, [resultingRevision]);
    const confidence = requiredEnum(command.input.confidence, "confidence", ["HIGH", "LOW", "MEDIUM"]);
    const confidenceCap = referenceConfidence(references.length + packageReferences.length);
    if (!confidenceAtMost(confidence, confidenceCap)) throw new ReferenceVaultError("reference_vault_confidence_exceeds_evidence", "Creative decision confidence exceeds its deterministic evidence cap", { confidence, confidenceCap, evidenceCount: references.length + packageReferences.length });
    const base = { ...this.#identity(), affectedElement: requiredText(command.input.affectedElement, "affectedElement", 1_000), assetRefs: references, audience: requiredStrings(command.input.audience, "audience", 1, 50, 500), businessObjective: requiredText(command.input.businessObjective, "businessObjective", 2_000), confidence, contractVersion: "1" as const, decidedAt: requiredTimestamp(command.input.decidedAt, "decidedAt"), decision: decisionType, decisionId, expiresAt: requiredExpiry(command.input.expiresAt), links: requiredLinks(command.input.links), packageRefs: packageReferences, rationale: requiredText(command.input.rationale, "rationale", 4_000), resultingRevision, reusableRule: requiredText(command.input.reusableRule, "reusableRule", 2_000), scope: requiredEnum(command.input.scope, "scope", ["ASSET", "GLOBAL", "PACKAGE"]), version: 0 as const };
    const decision = checked({ ...base, fingerprint: referenceFingerprint(base) }, new CreativeDecisionValidator(), "Creative decision");
    await repository.appendRecord("CREATIVE_DECISION", decision.decisionId, decision);
    return decision;
  }

  async #updateCreativeFingerprint(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<CreativeFingerprint> {
    assertShape(command.input, ["creativeFingerprintId", "negativeReferences", "visual", "writing"]);
    const fingerprintId = requiredId(command.input.creativeFingerprintId, "creativeFingerprintId");
    const current = await repository.getRecord({ ...this.#identity(), entityId: fingerprintId, type: "CREATIVE_FINGERPRINT" });
    this.#assertVersionControl(command, fingerprintId, current);
    const visualInput = requiredRecord(command.input.visual, "visual");
    const writingInput = requiredRecord(command.input.writing, "writing");
    assertShape(visualInput, ["preferenceId", "sampleAssetRefs", ...VISUAL_FIELDS]);
    assertShape(writingInput, ["preferenceId", "sampleAssetRefs", ...WRITING_FIELDS]);
    const visualRefs = requiredRefs(visualInput.sampleAssetRefs, "visual.sampleAssetRefs");
    const writingRefs = requiredRefs(writingInput.sampleAssetRefs, "writing.sampleAssetRefs");
    await this.#assertAssetRefs(repository, visualRefs, true);
    await this.#assertAssetRefs(repository, writingRefs, true);
    const sampleRefs = uniqueRefs([...visualRefs, ...writingRefs]);
    const nextVersion = current === undefined ? 0 : current.version + 1;
    const visualBase = preferenceBase(visualInput, VISUAL_FIELDS, visualRefs, nextVersion);
    const visual = checked({ ...visualBase, fingerprint: referenceFingerprint(visualBase) }, new VisualPreferenceValidator(), "Visual preference");
    const writingBase = preferenceBase(writingInput, WRITING_FIELDS, writingRefs, nextVersion);
    const writing = checked({ ...writingBase, fingerprint: referenceFingerprint(writingBase) }, new WritingPreferenceValidator(), "Writing preference");
    const negativeIds = await this.#createNegativeReferences(repository, requiredRecords(command.input.negativeReferences, "negativeReferences", 0, 100), this.dependencies.clock.now().toISOString());
    const now = this.dependencies.clock.now().toISOString();
    const base = { ...this.#identity(), confidence: referenceConfidence(sampleRefs.length), contractVersion: "1" as const, createdAt: current?.createdAt ?? now, creativeFingerprintId: fingerprintId, negativeReferenceIds: negativeIds, sampleAssetRefs: sampleRefs, sampleCount: sampleRefs.length, updatedAt: now, version: nextVersion, visual, writing };
    const next = checked({ ...base, fingerprint: referenceFingerprint(base) }, new CreativeFingerprintValidator(), "Creative fingerprint");
    await repository.appendRecord("CREATIVE_FINGERPRINT", fingerprintId, next, current === undefined ? undefined : { previousVersion: current.version });
    return next;
  }

  async #createNegativeReferences(repository: ReferenceVaultRepository, inputs: readonly Readonly<Record<string, unknown>>[], now: string): Promise<readonly string[]> {
    const identifiers: string[] = [];
    for (const input of inputs) {
      assertShape(input, ["assetRef", "negativeReferenceId", "prohibitedTraits", "reason"]);
      const references = requiredRefs([input.assetRef], "negativeReference.assetRef");
      await this.#assertAssetRefs(repository, references, false, true);
      const reference = references[0];
      if (reference === undefined) throw new ReferenceVaultError("reference_vault_invalid", "Negative reference asset is invalid");
      const base = { ...this.#identity(), assetRef: reference, contractVersion: "1" as const, createdAt: now, negativeReferenceId: requiredId(input.negativeReferenceId, "negativeReferenceId"), prohibitedTraits: requiredStrings(input.prohibitedTraits, "prohibitedTraits", 1, 50, 500), reason: requiredText(input.reason, "reason", 2_000), version: 0 as const };
      const negative = checked({ ...base, fingerprint: referenceFingerprint(base) }, new NegativeReferenceValidator(), "Negative reference");
      const existing = await repository.getRecord({ ...this.#identity(), entityId: negative.negativeReferenceId, type: "NEGATIVE_REFERENCE" });
      if (existing === undefined) await repository.appendRecord("NEGATIVE_REFERENCE", negative.negativeReferenceId, negative);
      else if (existing.fingerprint !== negative.fingerprint) throw new ReferenceVaultError("reference_vault_conflict", "Negative reference identifier already has different content", { negativeReferenceId: negative.negativeReferenceId });
      identifiers.push(negative.negativeReferenceId);
    }
    return identifiers;
  }

  async #updateBusinessContext(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<BusinessContext> {
    assertShape(command.input, ["audienceSignals", "businessContextId", "customerLanguageReferences", "notAvailableReasons", "offerReferences", "status", ...BUSINESS_FIELDS]);
    const contextId = requiredId(command.input.businessContextId, "businessContextId");
    const current = await repository.getRecord({ ...this.#identity(), entityId: contextId, type: "BUSINESS_CONTEXT" });
    this.#assertVersionControl(command, contextId, current);
    const status = requiredEnum(command.input.status, "status", ["AVAILABLE", "NOT_AVAILABLE"]);
    const fields: Record<typeof BUSINESS_FIELDS[number], BusinessContextDatum> = Object.create(null) as Record<typeof BUSINESS_FIELDS[number], BusinessContextDatum>;
    for (const field of BUSINESS_FIELDS) fields[field] = await this.#businessDatum(repository, command.input[field], field);
    const availableCount = BUSINESS_FIELDS.filter((field) => fields[field].status === "AVAILABLE").length;
    if ((status === "NOT_AVAILABLE" && availableCount !== 0) || (status === "AVAILABLE" && availableCount === 0)) throw new ReferenceVaultError("reference_vault_invalid", "Business context availability is inconsistent");
    const signalIds = await this.#createAudienceSignals(repository, requiredRecords(command.input.audienceSignals, "audienceSignals", 0, 100));
    const offerIds = await this.#createOfferReferences(repository, requiredRecords(command.input.offerReferences, "offerReferences", 0, 100));
    const languageIds = await this.#createCustomerLanguage(repository, requiredRecords(command.input.customerLanguageReferences, "customerLanguageReferences", 0, 100));
    if (status === "NOT_AVAILABLE" && (signalIds.length > 0 || offerIds.length > 0 || languageIds.length > 0)) throw new ReferenceVaultError("reference_vault_invalid", "NOT_AVAILABLE Business context cannot contain inferred records");
    const now = this.dependencies.clock.now().toISOString();
    const base = { ...this.#identity(), ...fields, audienceSignalIds: signalIds, businessContextId: contextId, contractVersion: "1" as const, createdAt: current?.createdAt ?? now, customerLanguageReferenceIds: languageIds, notAvailableReasons: requiredStrings(command.input.notAvailableReasons, "notAvailableReasons", status === "NOT_AVAILABLE" ? 1 : 0, 50, 1_000), offerReferenceIds: offerIds, status, updatedAt: now, version: current === undefined ? 0 : current.version + 1 };
    const context = checked({ ...base, fingerprint: referenceFingerprint(base) }, new BusinessContextValidator(), "Business context");
    await repository.appendRecord("BUSINESS_CONTEXT", contextId, context, current === undefined ? undefined : { previousVersion: current.version });
    return context;
  }

  async #businessDatum(repository: ReferenceVaultRepository, candidate: unknown, field: string): Promise<BusinessContextDatum> {
    const value = requiredRecord(candidate, field);
    if (value.status === "NOT_AVAILABLE") {
      assertShape(value, ["reasonCode", "status"]);
      if (value.reasonCode !== "NOT_AVAILABLE") throw new ReferenceVaultError("reference_vault_invalid", `${field} must use NOT_AVAILABLE`);
      return { reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" };
    }
    assertShape(value, ["evidenceAssetRefs", "status", "value"]);
    if (value.status !== "AVAILABLE" || !jsonSafe(value.value)) throw new ReferenceVaultError("reference_vault_invalid", `${field} is invalid`);
    const references = requiredRefs(value.evidenceAssetRefs, `${field}.evidenceAssetRefs`);
    await this.#assertAssetRefs(repository, references, true);
    return { evidenceAssetRefs: references, status: "AVAILABLE", value: value.value as JsonValue };
  }

  async #createAudienceSignals(repository: ReferenceVaultRepository, inputs: readonly Readonly<Record<string, unknown>>[]): Promise<readonly string[]> {
    const identifiers: string[] = [];
    const now = this.dependencies.clock.now().toISOString();
    for (const input of inputs) {
      assertShape(input, ["audience", "audienceSignalId", "confidence", "evidenceAssetRefs", "freshness", "signal"]);
      const references = requiredRefs(input.evidenceAssetRefs, "audienceSignal.evidenceAssetRefs");
      await this.#assertAssetRefs(repository, references, true);
      const confidence = requiredEnum(input.confidence, "confidence", ["HIGH", "LOW", "MEDIUM"]);
      const confidenceCap = referenceConfidence(references.length);
      if (!confidenceAtMost(confidence, confidenceCap)) throw new ReferenceVaultError("reference_vault_confidence_exceeds_evidence", "Audience signal confidence exceeds its deterministic evidence cap", { confidence, confidenceCap, evidenceCount: references.length });
      const base = { ...this.#identity(), audience: requiredText(input.audience, "audience", 500), audienceSignalId: requiredId(input.audienceSignalId, "audienceSignalId"), confidence, contractVersion: "1" as const, createdAt: now, evidenceAssetRefs: references, freshness: requiredFreshness(input.freshness), signal: requiredText(input.signal, "signal", 4_000), version: 0 as const };
      const item = checked({ ...base, fingerprint: referenceFingerprint(base) }, new AudienceSignalValidator(), "Audience signal");
      await repository.appendRecord("AUDIENCE_SIGNAL", item.audienceSignalId, item);
      identifiers.push(item.audienceSignalId);
    }
    return identifiers;
  }

  async #createOfferReferences(repository: ReferenceVaultRepository, inputs: readonly Readonly<Record<string, unknown>>[]): Promise<readonly string[]> {
    const identifiers: string[] = [];
    const now = this.dependencies.clock.now().toISOString();
    for (const input of inputs) {
      assertShape(input, ["evidenceAssetRefs", "mechanism", "offerReferenceId", "pricingStatus", "promise", "title"], ["priceCents"]);
      const references = requiredRefs(input.evidenceAssetRefs, "offerReference.evidenceAssetRefs");
      await this.#assertAssetRefs(repository, references, true);
      const pricingStatus = requiredEnum(input.pricingStatus, "pricingStatus", ["AVAILABLE", "NOT_AVAILABLE"]);
      const base = { ...this.#identity(), contractVersion: "1" as const, createdAt: now, evidenceAssetRefs: references, mechanism: requiredText(input.mechanism, "mechanism", 2_000), offerReferenceId: requiredId(input.offerReferenceId, "offerReferenceId"), ...(pricingStatus === "AVAILABLE" ? { priceCents: requiredInteger(input.priceCents, "priceCents", 0) } : {}), pricingStatus, promise: requiredText(input.promise, "promise", 2_000), title: requiredText(input.title, "title", 500), version: 0 as const };
      const item = checked({ ...base, fingerprint: referenceFingerprint(base) }, new OfferReferenceValidator(), "Offer reference");
      await repository.appendRecord("OFFER_REFERENCE", item.offerReferenceId, item);
      identifiers.push(item.offerReferenceId);
    }
    return identifiers;
  }

  async #createCustomerLanguage(repository: ReferenceVaultRepository, inputs: readonly Readonly<Record<string, unknown>>[]): Promise<readonly string[]> {
    const identifiers: string[] = [];
    const now = this.dependencies.clock.now().toISOString();
    for (const input of inputs) {
      assertShape(input, ["audience", "customerLanguageReferenceId", "evidenceAssetRefs", "freshness", "intent", "phrases"]);
      const references = requiredRefs(input.evidenceAssetRefs, "customerLanguage.evidenceAssetRefs");
      await this.#assertAssetRefs(repository, references, true);
      const base = { ...this.#identity(), audience: requiredText(input.audience, "audience", 500), contractVersion: "1" as const, createdAt: now, customerLanguageReferenceId: requiredId(input.customerLanguageReferenceId, "customerLanguageReferenceId"), evidenceAssetRefs: references, freshness: requiredFreshness(input.freshness), intent: requiredText(input.intent, "intent", 1_000), phrases: requiredStrings(input.phrases, "phrases", 1, 100, 1_000), version: 0 as const };
      const item = checked({ ...base, fingerprint: referenceFingerprint(base) }, new CustomerLanguageReferenceValidator(), "Customer language reference");
      await repository.appendRecord("CUSTOMER_LANGUAGE_REFERENCE", item.customerLanguageReferenceId, item);
      identifiers.push(item.customerLanguageReferenceId);
    }
    return identifiers;
  }

  async #linkOutcome(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<OutcomeLink> {
    assertShape(command.input, ["assetRefs", "links", "metrics", "observedAt", "outcomeLinkId", "result"]);
    const outcomeLinkId = requiredId(command.input.outcomeLinkId, "outcomeLinkId");
    this.#assertCreateControl(command, outcomeLinkId);
    const references = requiredRefs(command.input.assetRefs, "assetRefs");
    await this.#assertAssetRefs(repository, references, false);
    if (!record(command.input.metrics) || !jsonSafe(command.input.metrics)) throw new ReferenceVaultError("reference_vault_invalid", "Outcome metrics must be a JSON-safe object");
    const base = { ...this.#identity(), assetRefs: references, contractVersion: "1" as const, links: requiredLinks(command.input.links), metrics: command.input.metrics as JsonObject, observedAt: requiredTimestamp(command.input.observedAt, "observedAt"), outcomeLinkId, result: requiredEnum(command.input.result, "result", ["MIXED", "NEGATIVE", "NOT_AVAILABLE", "POSITIVE"]), version: 0 as const };
    const outcome = checked({ ...base, fingerprint: referenceFingerprint(base) }, new OutcomeLinkValidator(), "Outcome link");
    await repository.appendRecord("OUTCOME_LINK", outcome.outcomeLinkId, outcome);
    return outcome;
  }

  async #purgeExpiredContent(repository: ReferenceVaultRepository, command: ReferenceVaultCommand): Promise<ReferenceBlobTombstone> {
    assertShape(command.input, ["assetId", "reason"]);
    const assetId = requiredId(command.input.assetId, "assetId");
    const current = await this.#latestAsset(repository, assetId);
    this.#assertExistingControl(command, current.assetId, current.version, current.fingerprint);
    const now = this.dependencies.clock.now().toISOString();
    if (Date.parse(current.privacy.retentionExpiresAt) > Date.parse(now)) throw new ReferenceVaultError("reference_vault_retention_active", "Reference content cannot be purged before retention expiry", { assetId, retentionExpiresAt: current.privacy.retentionExpiresAt });
    const expiredBase = { ...omitFingerprint(current), status: "EXPIRED" as const, updatedAt: now, version: current.version + 1 };
    const expired = checked({ ...expiredBase, fingerprint: referenceFingerprint(expiredBase) }, new ReferenceAssetValidator(), "Expired reference asset");
    await repository.appendRecord("REFERENCE_ASSET", expired.assetId, expired, { previousVersion: current.version });
    const tombstoneBase = {
      ...this.#identity(),
      assetRef: assetRef(expired),
      byteContentStatus: "PURGED" as const,
      byteLength: current.byteLength,
      commandId: command.commandId,
      contentSha256: current.sha256,
      contractVersion: "1" as const,
      externalEffectsExecuted: false as const,
      metadataStatus: "IMMUTABLE_RETAINED" as const,
      mimeType: current.mimeType,
      policyFingerprint: current.privacy.policyFingerprint,
      purgedAt: now,
      purgedBy: this.dependencies.actorId,
      reason: requiredText(command.input.reason, "reason", 4_000),
      retentionExpiresAt: current.privacy.retentionExpiresAt,
      tombstoneId: `reference-blob-tombstone-${command.commandId}`,
      version: 0 as const,
    };
    const tombstone = checked({ ...tombstoneBase, fingerprint: referenceFingerprint(tombstoneBase) }, new ReferenceBlobTombstoneValidator(), "Reference blob tombstone");
    await repository.appendRecord("REFERENCE_BLOB_TOMBSTONE", tombstone.tombstoneId, tombstone);
    await repository.deleteBlobAfterRetentionTombstone(this.#identity(), current.sha256);
    return tombstone;
  }

  async #latestAsset(repository: ReferenceVaultRepository, assetId: string): Promise<ReferenceAsset> {
    const item = await repository.getRecord({ ...this.#identity(), entityId: assetId, type: "REFERENCE_ASSET" });
    if (item === undefined) throw new ReferenceVaultError("reference_vault_not_found", "Reference asset does not exist", { assetId });
    this.#assertIdentity(item);
    return item;
  }

  async #assertAssetRefs(repository: ReferenceVaultRepository, references: readonly ReferenceAssetRef[], requireApproved: boolean, requireNegative = false): Promise<void> {
    for (const reference of references) {
      const item = await repository.getRecord({ ...this.#identity(), entityId: reference.assetId, type: "REFERENCE_ASSET", version: reference.version });
      if (item === undefined) throw new ReferenceVaultError("reference_vault_not_found", "Referenced asset version is unavailable", { assetId: reference.assetId, version: reference.version });
      if (item.fingerprint !== reference.fingerprint) throw new ReferenceVaultError("reference_vault_not_found", "Referenced asset version is unavailable", { assetId: reference.assetId, version: reference.version });
      this.#assertIdentity(item);
      if (requireApproved && !evaluateReferenceEligibility(item, { now: this.dependencies.clock.now().getTime(), purpose: "CREATIVE_DIRECTION" }).eligible) throw new ReferenceVaultError("reference_vault_rights_blocked", "Referenced asset is not eligible as an approved creative sample", { assetId: reference.assetId });
      if (requireApproved) await this.#assertCas(repository, item);
      if (requireNegative && !item.roles.includes("NEGATIVE_REFERENCE") && !["REJECTED", "RIGHTS_BLOCKED"].includes(item.status)) throw new ReferenceVaultError("reference_vault_invalid", "Negative reference must target a rejected or explicitly negative asset", { assetId: reference.assetId });
      if (requireNegative && isCompetitorMaterial(item)) throw new ReferenceVaultError("reference_vault_rights_blocked", "Competitor material cannot enter the output creative fingerprint", { assetId: reference.assetId });
    }
  }

  async #assertAuthoritativePackageRefs(repository: ReferenceVaultRepository, references: readonly { readonly fingerprint: string; readonly packageId: string; readonly version: number }[]): Promise<void> {
    for (const reference of references) {
      const authoritative = await repository.getAuthoritativeContentPackageRef(this.#identity(), reference.packageId);
      if (authoritative?.version !== reference.version || authoritative.fingerprint !== reference.fingerprint) throw new ReferenceVaultError("reference_vault_not_found", "Referenced content package version is unavailable", { packageId: reference.packageId, version: reference.version });
    }
  }

  async #assertCas(repository: ReferenceVaultRepository, asset: ReferenceAsset): Promise<void> {
    const blob = await repository.getBlob(this.#identity(), asset.sha256);
    if (blob?.byteLength !== asset.byteLength || blob.mimeType !== asset.mimeType || blob.sha256 !== asset.sha256) throw new ReferenceVaultError("reference_vault_corrupt", "Reference asset CAS reconciliation failed", { assetId: asset.assetId });
  }

  #assertCreateControl(command: ReferenceVaultCommand, targetId: string): void {
    if (command.targetId !== targetId || command.expectedVersion !== "NOT_EXISTS" || command.targetFingerprint !== "NOT_AVAILABLE") throw new ReferenceVaultError("reference_vault_conflict", "Reference mutation create controls do not match the target", { targetId });
  }

  #assertExistingControl(command: ReferenceVaultCommand, targetId: string, version: number, fingerprint: string): void {
    if (command.targetId !== targetId || command.expectedVersion !== version || command.targetFingerprint !== fingerprint) throw new ReferenceVaultError("reference_vault_conflict", "Reference mutation controls do not match current state", { targetId, version });
  }

  #assertVersionControl(command: ReferenceVaultCommand, targetId: string, current: { readonly version: number; readonly fingerprint: string } | undefined): void {
    if (current === undefined) this.#assertCreateControl(command, targetId);
    else this.#assertExistingControl(command, targetId, current.version, current.fingerprint);
  }

  #assertIdentity(value: { readonly actorId: string; readonly workspaceId: string }): void {
    if (value.actorId !== this.dependencies.actorId || value.workspaceId !== this.dependencies.workspaceId) throw new ReferenceVaultError("reference_vault_identity_mismatch", "Reference record is outside the bound actor/workspace");
  }

  #identity(): ReferenceVaultIdentity {
    return { actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId };
  }
}

function buildAsset(candidate: ReferenceImportCandidate, actorId: string, workspaceId: string, now: string): ReferenceAsset {
  const sourceBase = { ...candidate.source, contractVersion: "1" as const, version: 0 as const };
  const source = checked({ ...sourceBase, fingerprint: referenceFingerprint(sourceBase) }, new ReferenceSourceValidator(), "Reference source");
  const rightsBase = { ...candidate.rights, contractVersion: "1" as const, version: 0 as const };
  const rights = checked({ ...rightsBase, fingerprint: referenceFingerprint(rightsBase) }, new ReferenceRightsValidator(), "Reference rights");
  const privacyBase = { ...candidate.privacy, contractVersion: "1" as const, version: 0 as const };
  const privacy = checked({ ...privacyBase, fingerprint: referenceFingerprint(privacyBase) }, new ReferencePrivacyValidator(), "Reference privacy");
  const base = {
    actorId,
    aspectRatio: candidate.aspectRatio,
    assetId: candidate.assetId,
    audience: candidate.audience,
    businessObjective: candidate.businessObjective,
    byteLength: candidate.declaredByteLength,
    contractVersion: "1" as const,
    createdAt: now,
    dimensions: candidate.dimensions,
    fabioApproval: { reason: candidate.fabioApprovalReason, status: "PENDING" as const },
    freshness: candidate.freshness,
    links: candidate.links,
    mimeType: candidate.mimeType,
    originalFilename: candidate.originalFilename,
    platforms: candidate.platforms,
    privacy,
    referenceId: candidate.referenceId,
    rights,
    roles: candidate.roles,
    sha256: candidate.declaredSha256,
    source,
    status: "IMPORTED" as const,
    storage: { contentSha256: candidate.declaredSha256, durability: "DURABLE" as const, immutable: true as const, kind: "SQLITE_PRIVATE_CAS" as const },
    title: candidate.title,
    updatedAt: now,
    version: 0,
    whatNotToCopy: candidate.whatNotToCopy,
    whatToLearn: candidate.whatToLearn,
    workspaceId,
  };
  return checked({ ...base, fingerprint: referenceFingerprint(base) }, new ReferenceAssetValidator(), "Reference asset");
}

function preferenceBase<const K extends string>(input: Readonly<Record<string, unknown>>, fields: readonly K[], references: readonly ReferenceAssetRef[], version: number): Readonly<Record<K, readonly string[]>> & { readonly confidence: ReturnType<typeof referenceConfidence>; readonly contractVersion: "1"; readonly preferenceId: string; readonly sampleAssetRefs: readonly ReferenceAssetRef[]; readonly sampleCount: number; readonly version: number } {
  const dimensions: Record<string, readonly string[]> = {};
  for (const field of fields) dimensions[field] = requiredStrings(input[field], field, 0, 100, 1_000);
  return { ...dimensions, confidence: referenceConfidence(references.length), contractVersion: "1", preferenceId: requiredId(input.preferenceId, "preferenceId"), sampleAssetRefs: references, sampleCount: references.length, version } as Readonly<Record<K, readonly string[]>> & { readonly confidence: ReturnType<typeof referenceConfidence>; readonly contractVersion: "1"; readonly preferenceId: string; readonly sampleAssetRefs: readonly ReferenceAssetRef[]; readonly sampleCount: number; readonly version: number };
}

function assetRef(item: ReferenceAsset): ReferenceAssetRef { return { assetId: item.assetId, fingerprint: item.fingerprint, version: item.version }; }
function omitFingerprint<T extends { readonly fingerprint: string }>(value: T): Omit<T, "fingerprint"> { const { fingerprint, ...rest } = value; void fingerprint; return rest; }
function uniqueRefs(references: readonly ReferenceAssetRef[]): readonly ReferenceAssetRef[] { return [...new Map(references.map((item) => [`${item.assetId}:${String(item.version)}:${item.fingerprint}`, item])).values()]; }

function confidenceAtMost(value: "HIGH" | "LOW" | "MEDIUM", maximum: ReturnType<typeof referenceConfidence>): boolean {
  const rank = { HIGH: 3, LOW: 1, MEDIUM: 2, NONE: 0 } as const;
  return rank[value] <= rank[maximum];
}

function importRightsBlockers(candidate: ReferenceImportCandidate, now: number, authorityContext: Pick<ReferenceVaultServiceDependencies, "actorId" | "approvalAuthority" | "workspaceId">): readonly string[] {
  const blockers: string[] = [];
  const verifiedRights = candidate.rights.status === "AUTHORIZED" || candidate.rights.status === "OWNED";
  if (candidate.rights.status === "BLOCKED" || candidate.rights.status === "UNKNOWN") blockers.push("REFERENCE_RIGHTS_UNAVAILABLE");
  if (candidate.rights.status === "PUBLIC_ANALYSIS_ONLY") blockers.push("REFERENCE_RIGHTS_STORAGE_UNAUTHORIZED");
  if (verifiedRights && (authorityContext.approvalAuthority?.authorityId !== authorityContext.actorId || authorityContext.approvalAuthority.workspaceId !== authorityContext.workspaceId || candidate.rights.verifiedBy !== authorityContext.approvalAuthority.authorityId)) blockers.push("REFERENCE_RIGHTS_VERIFIER_UNCONFIRMED");
  if (verifiedRights && candidate.rights.verifiedAt !== undefined && Date.parse(candidate.rights.verifiedAt) > now) blockers.push("REFERENCE_RIGHTS_EVIDENCE_NOT_YET_VALID");
  if (candidate.rights.expiresAt !== undefined && Date.parse(candidate.rights.expiresAt) <= now) blockers.push("REFERENCE_RIGHTS_EXPIRED");
  if (candidate.rights.status === "PUBLIC_ANALYSIS_ONLY" && !candidate.roles.includes("COMPETITOR_REFERENCE") && candidate.source.type !== "COMPETITOR_PUBLIC_URL") blockers.push("REFERENCE_RIGHTS_ROLE_MISMATCH");
  if (candidate.source.type === "COMPETITOR_PUBLIC_URL" && candidate.rights.status !== "PUBLIC_ANALYSIS_ONLY") blockers.push("REFERENCE_COMPETITOR_RIGHTS_INVALID");
  return blockers;
}

function importPrivacyBlockers(candidate: ReferenceImportCandidate, now: number): readonly string[] {
  const blockers: string[] = [];
  const privacyVerifiedAt = Date.parse(candidate.privacy.verifiedAt);
  const evidenceVerifiedAt = [candidate.privacy.consentEvidence, candidate.privacy.releaseEvidence].flatMap((evidence) => evidence.status === "NOT_VERIFIED" ? [] : [Date.parse(evidence.verifiedAt)]);
  if (candidate.privacy.status !== "CLEARED") blockers.push("REFERENCE_PRIVACY_NOT_CLEARED");
  if (privacyVerifiedAt > now || evidenceVerifiedAt.some((verifiedAt) => verifiedAt > now)) blockers.push("REFERENCE_PRIVACY_EVIDENCE_NOT_YET_VALID");
  if (evidenceVerifiedAt.some((verifiedAt) => verifiedAt > privacyVerifiedAt)) blockers.push("REFERENCE_PRIVACY_EVIDENCE_SEQUENCE_INVALID");
  if (Date.parse(candidate.privacy.retentionExpiresAt) <= now) blockers.push("REFERENCE_RETENTION_EXPIRED");
  return blockers;
}

function credentialMaterialBlockers(bytes: Uint8Array, detected: DetectedBinary | undefined): readonly string[] {
  if (detected === undefined) return [];
  const decoded = detected.mimeType === "application/json" || detected.mimeType === "text/plain"
    ? decodeUtf8(bytes)
    : Buffer.from(bytes).toString("latin1");
  if (decoded === undefined) return [];
  const structured: unknown = detected.mimeType === "application/json" ? JSON.parse(decoded) : decoded;
  const credentialAssignment = /\b(?:api[_-]?key|authorization|cookie|password|secret|token)\b\s*[:=]\s*["']?[^\s"']{8,}/iu.test(decoded);
  return containsDecodedReferenceCredentialMaterial(structured) || credentialAssignment ? ["REFERENCE_CREDENTIAL_MATERIAL_DETECTED"] : [];
}

function freshnessBlockers(freshness: ReferenceImportCandidate["freshness"], now: number): readonly string[] {
  return [...(Date.parse(freshness.freshUntil) <= now ? ["REFERENCE_STALE"] : []), ...(freshness.expiresAt !== undefined && Date.parse(freshness.expiresAt) <= now ? ["REFERENCE_EXPIRED"] : [])];
}

function decodeBase64(value: string): Uint8Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new ReferenceVaultError("reference_vault_corrupt", "Reference content is not canonical base64");
  return bytes;
}

function detectBinary(bytes: Uint8Array, declaredMimeType: string): DetectedBinary | undefined {
  if (hasDecoderUnavailableSignature(bytes)) return undefined;
  const png = pngDimensions(bytes);
  if (png !== undefined) return { dimensions: png, mimeType: "image/png" };
  if (declaredMimeType === "application/json") {
    const decoded = decodeUtf8(bytes);
    if (decoded === undefined) return undefined;
    try { JSON.parse(decoded); } catch { return undefined; }
    return { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "application/json" };
  }
  if (declaredMimeType === "text/plain") {
    const decoded = decodeUtf8(bytes);
    if (decoded !== undefined && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(decoded)) return { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "text/plain" };
  }
  return undefined;
}

function binaryValidationBlocker(bytes: Uint8Array, declaredMimeType: string): string {
  if (DECODER_UNAVAILABLE_MIME_TYPES.has(declaredMimeType) || hasDecoderUnavailableSignature(bytes)) return "REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1";
  if (declaredMimeType === "image/png" || signature(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return "REFERENCE_BINARY_VALIDATION_FAILED";
  return "REFERENCE_MIME_UNSUPPORTED";
}

function hasDecoderUnavailableSignature(bytes: Uint8Array): boolean {
  const prefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 1_024))).toString("latin1");
  return signature(bytes, [255, 216]) || ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a" || prefix.includes("%PDF-");
}

function pngDimensions(bytes: Uint8Array): ReferenceDimensions | undefined {
  if (!signature(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return undefined;
  let offset = 8;
  let dimensions: ReferenceDimensions | undefined;
  let bitsPerPixel: number | undefined;
  let expectedDecodedBytes: number | undefined;
  let imageDataEnded = false;
  const imageData: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    if (length > bytes.length - dataOffset - 4) return undefined;
    const chunkType = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/u.test(chunkType) || !["IDAT", "IEND", "IHDR", "tEXt"].includes(chunkType)) return undefined;
    if (readUint32(bytes, crcOffset) !== crc32(bytes.slice(offset + 4, crcOffset))) return undefined;
    if (offset === 8) {
      if (chunkType !== "IHDR" || length !== 13) return undefined;
      const width = readUint32(bytes, dataOffset);
      const height = readUint32(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      const interlace = bytes[dataOffset + 12];
      const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : undefined;
      if (width < 1 || height < 1 || width > REFERENCE_VAULT_LIMITS.maxWidth || height > REFERENCE_VAULT_LIMITS.maxHeight || width * height > REFERENCE_VAULT_LIMITS.maxPixels || bitDepth !== 8 || channels === undefined || compression !== 0 || filter !== 0 || interlace !== 0) return undefined;
      bitsPerPixel = bitDepth * channels;
      const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
      expectedDecodedBytes = height * (rowBytes + 1);
      if (!Number.isSafeInteger(expectedDecodedBytes) || expectedDecodedBytes > REFERENCE_VAULT_LIMITS.maxBlobBytes * 4) return undefined;
      dimensions = { height, status: "AVAILABLE", width };
    } else if (chunkType === "IHDR") return undefined;
    if (chunkType === "tEXt") {
      if (!validPngText(bytes.slice(dataOffset, crcOffset))) return undefined;
      if (imageData.length > 0) imageDataEnded = true;
    } else if (chunkType === "IDAT") {
      if (imageDataEnded || length === 0) return undefined;
      imageData.push(bytes.slice(dataOffset, crcOffset));
    }
    const nextOffset = crcOffset + 4;
    if (chunkType === "IEND") {
      if (length !== 0 || imageData.length === 0 || nextOffset !== bytes.length || dimensions?.status !== "AVAILABLE" || bitsPerPixel === undefined || expectedDecodedBytes === undefined) return undefined;
      return validDecodedPngRaster(imageData, dimensions.width, dimensions.height, bitsPerPixel, expectedDecodedBytes) ? dimensions : undefined;
    }
    offset = nextOffset;
  }
  return undefined;
}

function validDecodedPngRaster(chunks: readonly Uint8Array[], width: number, height: number, bitsPerPixel: number, expectedBytes: number): boolean {
  try {
    const compressed = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const result: unknown = inflateSync(compressed, { info: true, maxOutputLength: expectedBytes + 1 });
    if (!decodedPngInflateResult(result)) return false;
    if (result.engine.bytesWritten !== compressed.byteLength) return false;
    const decoded = result.buffer;
    if (decoded.byteLength !== expectedBytes) return false;
    const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
    for (let row = 0; row < height; row += 1) if ((decoded[row * (rowBytes + 1)] ?? 5) > 4) return false;
    return true;
  } catch {
    return false;
  }
}

function decodedPngInflateResult(value: unknown): value is { readonly buffer: Uint8Array; readonly engine: { readonly bytesWritten: number } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Readonly<Record<string, unknown>>;
  const engine = result.engine;
  return result.buffer instanceof Uint8Array
    && typeof engine === "object"
    && engine !== null
    && !Array.isArray(engine)
    && typeof (engine as Readonly<Record<string, unknown>>).bytesWritten === "number";
}

function validPngText(bytes: Uint8Array): boolean {
  const separator = bytes.indexOf(0);
  if (separator < 1 || separator > 79) return false;
  const keyword = bytes.slice(0, separator);
  return !keyword.some((byte) => byte < 32 || (byte > 126 && byte < 161)) && !keyword.every((byte) => byte === 32) && (keyword[0] ?? 32) !== 32 && (keyword[keyword.length - 1] ?? 32) !== 32;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ((crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function sameDimensions(left: ReferenceDimensions, right: ReferenceDimensions): boolean {
  return left.status === right.status && (left.status === "NOT_AVAILABLE" || (right.status === "AVAILABLE" && left.width === right.width && left.height === right.height));
}

function signature(bytes: Uint8Array, expected: readonly number[]): boolean { return expected.every((value, index) => bytes[index] === value); }
function ascii(bytes: Uint8Array, offset: number, length: number): string { return String.fromCharCode(...bytes.slice(offset, offset + length)); }
function readUint32(bytes: Uint8Array, offset: number): number { return (((bytes[offset] ?? 0) * 16_777_216) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)); }
function decodeUtf8(bytes: Uint8Array): string | undefined { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return undefined; } }

function checked<T>(value: unknown, validator: Validator<T>, label: string): T {
  const result = validator.validate(value);
  if (!result.ok) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`, { issueCount: result.issues.length });
  return result.value;
}

function assertShape(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (!required.every((key) => Object.hasOwn(value, key)) || !Object.keys(value).every((key) => allowed.has(key)) || Object.values(value).some((entry) => entry === undefined)) throw new ReferenceVaultError("reference_vault_invalid", "Reference Vault input shape is invalid");
}

function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function requiredRecord(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!record(value)) throw new ReferenceVaultError("reference_vault_invalid", `${label} must be an object`); return value; }
function requiredId(value: unknown, label: string): string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`); return value; }
function requiredText(value: unknown, label: string, maximum: number): string { if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maximum) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`); return value; }
function requiredInteger(value: unknown, label: string, minimum: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`); return value; }
function requiredTimestamp(value: unknown, label: string): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`); return value; }
function requiredEnum<const T extends string>(value: unknown, label: string, allowed: readonly T[]): T { if (typeof value !== "string" || !allowed.some((item) => item === value)) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`); return value as T; }

function requiredStrings(value: unknown, label: string, minimum: number, maximum: number, maximumLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every((item) => typeof item === "string" && item.trim() === item && item.length >= 1 && item.length <= maximumLength) || new Set(value).size !== value.length) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`);
  return value as readonly string[];
}

function requiredRecords(value: unknown, label: string, minimum: number, maximum: number): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every(record)) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`);
  return value;
}

function requiredRefs(value: unknown, label: string): readonly ReferenceAssetRef[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500 || !value.every((item) => record(item) && Object.keys(item).length === 3 && requiredRef(item))) throw new ReferenceVaultError("reference_vault_invalid", `${label} is invalid`);
  const references = value as readonly ReferenceAssetRef[];
  if (new Set(references.map((item) => `${item.assetId}:${String(item.version)}`)).size !== references.length) throw new ReferenceVaultError("reference_vault_invalid", `${label} contains duplicates`);
  return references;
}

function requiredRef(value: Readonly<Record<string, unknown>>): boolean { return typeof value.assetId === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value.assetId) && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version >= 0 && typeof value.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(value.fingerprint); }

function requiredPackageRefs(value: unknown): readonly { readonly fingerprint: string; readonly packageId: string; readonly version: number }[] {
  if (!Array.isArray(value) || value.length > 500) throw new ReferenceVaultError("reference_vault_invalid", "packageRefs is invalid");
  const candidates: readonly unknown[] = value;
  const references: { readonly fingerprint: string; readonly packageId: string; readonly version: number }[] = [];
  for (const candidate of candidates) {
    if (!record(candidate) || Object.keys(candidate).length !== 3 || typeof candidate.packageId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(candidate.packageId) || typeof candidate.version !== "number" || !Number.isSafeInteger(candidate.version) || candidate.version < 0 || typeof candidate.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(candidate.fingerprint)) throw new ReferenceVaultError("reference_vault_invalid", "packageRefs is invalid");
    references.push({ fingerprint: candidate.fingerprint, packageId: candidate.packageId, version: candidate.version });
  }
  if (new Set(references.map((item) => `${item.packageId}:${String(item.version)}`)).size !== references.length) throw new ReferenceVaultError("reference_vault_invalid", "packageRefs contains duplicates");
  return references;
}

function requiredResultingRevision(value: unknown): { readonly status: "NOT_AVAILABLE" } | { readonly status: "AVAILABLE"; readonly packageId: string; readonly version: number; readonly fingerprint: string } {
  const item = requiredRecord(value, "resultingRevision");
  if (item.status === "NOT_AVAILABLE") { assertShape(item, ["status"]); return { status: "NOT_AVAILABLE" }; }
  assertShape(item, ["fingerprint", "packageId", "status", "version"]);
  if (item.status !== "AVAILABLE" || typeof item.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(item.fingerprint)) throw new ReferenceVaultError("reference_vault_invalid", "resultingRevision is invalid");
  return { fingerprint: item.fingerprint, packageId: requiredId(item.packageId, "resultingRevision.packageId"), status: "AVAILABLE", version: requiredInteger(item.version, "resultingRevision.version", 0) };
}

function requiredExpiry(value: unknown): string { return value === "NOT_AVAILABLE" ? value : requiredTimestamp(value, "expiresAt"); }

function requiredLinks(value: unknown): { readonly missionIds: readonly string[]; readonly outcomeIds: readonly string[]; readonly packageIds: readonly string[] } {
  const item = requiredRecord(value, "links"); assertShape(item, ["missionIds", "outcomeIds", "packageIds"]);
  return { missionIds: requiredStrings(item.missionIds, "missionIds", 0, 500, 128), outcomeIds: requiredStrings(item.outcomeIds, "outcomeIds", 0, 500, 128), packageIds: requiredStrings(item.packageIds, "packageIds", 0, 500, 128) };
}

function requiredFreshness(value: unknown): { readonly expiresAt?: string; readonly freshUntil: string; readonly observedAt: string } {
  const item = requiredRecord(value, "freshness"); assertShape(item, ["freshUntil", "observedAt"], ["expiresAt"]);
  const observedAt = requiredTimestamp(item.observedAt, "observedAt");
  const freshUntil = requiredTimestamp(item.freshUntil, "freshUntil");
  const expiresAt = item.expiresAt === undefined ? undefined : requiredTimestamp(item.expiresAt, "expiresAt");
  if (Date.parse(freshUntil) <= Date.parse(observedAt) || (expiresAt !== undefined && Date.parse(expiresAt) < Date.parse(freshUntil))) throw new ReferenceVaultError("reference_vault_invalid", "freshness range is invalid");
  return expiresAt === undefined ? { freshUntil, observedAt } : { expiresAt, freshUntil, observedAt };
}

function jsonSafe(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => jsonSafe(item, depth + 1));
  return record(value) && Object.values(value).every((item) => jsonSafe(item, depth + 1));
}
