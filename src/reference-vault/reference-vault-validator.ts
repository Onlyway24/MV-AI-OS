import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";
import {
  REFERENCE_ASSET_STATUSES,
  REFERENCE_DATA_CLASSES,
  REFERENCE_PRIVACY_STATUSES,
  REFERENCE_RIGHTS_STATUSES,
  REFERENCE_ROLES,
  REFERENCE_VAULT_LIMITS,
  REFERENCE_VAULT_OPERATIONS,
  type AudienceSignal,
  type BusinessContext,
  type BusinessContextDatum,
  type CreativeDecision,
  type CreativeFingerprint,
  type CustomerLanguageReference,
  type NegativeReference,
  type OfferReference,
  type OutcomeLink,
  type ReferenceAsset,
  type ReferenceAssetRef,
  type ReferenceBlobTombstone,
  type ReferenceBrief,
  type ReferenceCollection,
  type ReferenceConfidence,
  type FabioReferenceApproval,
  type ReferenceImportPreview,
  type ReferenceImportReceipt,
  type ReferenceImportRequest,
  type ReferenceReview,
  type ReferenceLinks,
  type ReferencePrivacy,
  type ReferencePrivacyEvidence,
  type ReferenceRights,
  type ReferenceSource,
  type ReferenceVaultAuditEvent,
  type ReferenceVaultCommand,
  type ReferenceVaultCommandReceipt,
  type ReferenceVaultCommandResult,
  type ReferenceVaultCommandResponse,
  type ReferenceVaultOperation,
  type ReferenceVaultRecordMap,
  type ReferenceVaultRecordType,
  type VisualPreference,
  type WritingPreference,
} from "./reference-vault.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u;
const ASPECT_RATIO = /^(?:\d{1,5}:\d{1,5}|NOT_AVAILABLE)$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_RECORD_BYTES = 1_048_576;
const MAX_IMPORT_BYTES = 75_000_000;
const REFERENCE_VAULT_RECORD_TYPES: readonly ReferenceVaultRecordType[] = [
  "AUDIENCE_SIGNAL",
  "BUSINESS_CONTEXT",
  "REFERENCE_BLOB_TOMBSTONE",
  "CREATIVE_DECISION",
  "CREATIVE_FINGERPRINT",
  "CUSTOMER_LANGUAGE_REFERENCE",
  "NEGATIVE_REFERENCE",
  "OFFER_REFERENCE",
  "OUTCOME_LINK",
  "REFERENCE_ASSET",
  "REFERENCE_COLLECTION",
  "REFERENCE_COMMAND_RESULT",
  "REFERENCE_IMPORT_RECEIPT",
  "REFERENCE_REVIEW",
];

export class ReferenceSourceValidator implements Validator<ReferenceSource> { public validate(value: unknown): ValidationResult<ReferenceSource> { return result(value, source, "ReferenceSource"); } }
export class ReferenceRightsValidator implements Validator<ReferenceRights> { public validate(value: unknown): ValidationResult<ReferenceRights> { return result(value, rights, "ReferenceRights"); } }
export class ReferencePrivacyValidator implements Validator<ReferencePrivacy> { public validate(value: unknown): ValidationResult<ReferencePrivacy> { return result(value, privacy, "ReferencePrivacy"); } }
export class ReferenceAssetValidator implements Validator<ReferenceAsset> { public validate(value: unknown): ValidationResult<ReferenceAsset> { return result(value, asset, "ReferenceAsset"); } }
export class ReferenceCollectionValidator implements Validator<ReferenceCollection> { public validate(value: unknown): ValidationResult<ReferenceCollection> { return result(value, collection, "ReferenceCollection"); } }
export class VisualPreferenceValidator implements Validator<VisualPreference> { public validate(value: unknown): ValidationResult<VisualPreference> { return result(value, visualPreference, "VisualPreference"); } }
export class WritingPreferenceValidator implements Validator<WritingPreference> { public validate(value: unknown): ValidationResult<WritingPreference> { return result(value, writingPreference, "WritingPreference"); } }
export class NegativeReferenceValidator implements Validator<NegativeReference> { public validate(value: unknown): ValidationResult<NegativeReference> { return result(value, negativeReference, "NegativeReference"); } }
export class CreativeFingerprintValidator implements Validator<CreativeFingerprint> { public validate(value: unknown): ValidationResult<CreativeFingerprint> { return result(value, creativeFingerprint, "CreativeFingerprint"); } }
export class BusinessContextValidator implements Validator<BusinessContext> { public validate(value: unknown): ValidationResult<BusinessContext> { return result(value, businessContext, "BusinessContext"); } }
export class AudienceSignalValidator implements Validator<AudienceSignal> { public validate(value: unknown): ValidationResult<AudienceSignal> { return result(value, audienceSignal, "AudienceSignal"); } }
export class OfferReferenceValidator implements Validator<OfferReference> { public validate(value: unknown): ValidationResult<OfferReference> { return result(value, offerReference, "OfferReference"); } }
export class CustomerLanguageReferenceValidator implements Validator<CustomerLanguageReference> { public validate(value: unknown): ValidationResult<CustomerLanguageReference> { return result(value, customerLanguageReference, "CustomerLanguageReference"); } }
export class CreativeDecisionValidator implements Validator<CreativeDecision> { public validate(value: unknown): ValidationResult<CreativeDecision> { return result(value, creativeDecision, "CreativeDecision"); } }
export class OutcomeLinkValidator implements Validator<OutcomeLink> { public validate(value: unknown): ValidationResult<OutcomeLink> { return result(value, outcomeLink, "OutcomeLink"); } }
export class ReferenceReviewValidator implements Validator<ReferenceReview> { public validate(value: unknown): ValidationResult<ReferenceReview> { return result(value, review, "ReferenceReview"); } }
export class ReferenceImportReceiptValidator implements Validator<ReferenceImportReceipt> { public validate(value: unknown): ValidationResult<ReferenceImportReceipt> { return result(value, importReceipt, "ReferenceImportReceipt"); } }
export class ReferenceBlobTombstoneValidator implements Validator<ReferenceBlobTombstone> { public validate(value: unknown): ValidationResult<ReferenceBlobTombstone> { return result(value, blobTombstone, "ReferenceBlobTombstone"); } }
export class ReferenceImportRequestValidator implements Validator<ReferenceImportRequest> { public validate(value: unknown): ValidationResult<ReferenceImportRequest> { return result(value, importRequest, "ReferenceImportRequest"); } }
export class ReferenceImportPreviewValidator implements Validator<ReferenceImportPreview> { public validate(value: unknown): ValidationResult<ReferenceImportPreview> { return result(value, importPreview, "ReferenceImportPreview"); } }
export class ReferenceBriefValidator implements Validator<ReferenceBrief> { public validate(value: unknown): ValidationResult<ReferenceBrief> { return result(value, referenceBrief, "ReferenceBrief"); } }

export class ReferenceVaultCommandValidator implements Validator<ReferenceVaultCommand> {
  public validate(value: unknown): ValidationResult<ReferenceVaultCommand> {
    return result(value, referenceVaultCommand, "ReferenceVaultCommand");
  }
}

export class ReferenceVaultCommandResponseValidator implements Validator<ReferenceVaultCommandResponse> {
  public validate(value: unknown): ValidationResult<ReferenceVaultCommandResponse> {
    return result(value, referenceVaultCommandResponse, "ReferenceVaultCommandResponse");
  }
}

export class ReferenceVaultCommandReceiptValidator implements Validator<ReferenceVaultCommandReceipt> {
  public validate(value: unknown): ValidationResult<ReferenceVaultCommandReceipt> {
    return result(value, referenceVaultCommandReceipt, "ReferenceVaultCommandReceipt");
  }
}

export class ReferenceVaultCommandResultValidator implements Validator<ReferenceVaultCommandResult> {
  public validate(value: unknown): ValidationResult<ReferenceVaultCommandResult> {
    return result(value, referenceVaultCommandResult, "ReferenceVaultCommandResult");
  }
}

export class ReferenceVaultAuditEventValidator implements Validator<ReferenceVaultAuditEvent> {
  public validate(value: unknown): ValidationResult<ReferenceVaultAuditEvent> {
    return result(value, referenceVaultAuditEvent, "ReferenceVaultAuditEvent");
  }
}

export function validateReferenceVaultRecord<K extends ReferenceVaultRecordType>(type: K, value: unknown): ValidationResult<ReferenceVaultRecordMap[K]> {
  const valid = type === "REFERENCE_ASSET" ? asset(value)
    : type === "REFERENCE_COLLECTION" ? collection(value)
      : type === "CREATIVE_FINGERPRINT" ? creativeFingerprint(value)
        : type === "CREATIVE_DECISION" ? creativeDecision(value)
          : type === "BUSINESS_CONTEXT" ? businessContext(value)
            : type === "AUDIENCE_SIGNAL" ? audienceSignal(value)
              : type === "OFFER_REFERENCE" ? offerReference(value)
                : type === "CUSTOMER_LANGUAGE_REFERENCE" ? customerLanguageReference(value)
                  : type === "OUTCOME_LINK" ? outcomeLink(value)
                    : type === "REFERENCE_REVIEW" ? review(value)
                      : type === "NEGATIVE_REFERENCE" ? negativeReference(value)
                        : type === "REFERENCE_IMPORT_RECEIPT" ? importReceipt(value)
                          : type === "REFERENCE_BLOB_TOMBSTONE" ? blobTombstone(value)
                            : type === "REFERENCE_COMMAND_RESULT" && referenceVaultCommandResult(value);
  if (!valid) return validationFailure([{ code: "invalid", message: `${type} is invalid`, path: "" }]);
  return validationSuccess(deepFreezeReference(structuredClone(value)) as ReferenceVaultRecordMap[K]);
}

export function referenceFingerprint(value: Readonly<Record<string, unknown>>): string {
  const payload: Record<string, unknown> = { ...value };
  delete payload.fingerprint;
  return canonicalSha256(payload);
}

export function referenceInputFingerprint(value: Readonly<Record<string, unknown>>): string {
  return canonicalSha256(value);
}

export function referenceConfidence(sampleCount: number): "HIGH" | "LOW" | "MEDIUM" | "NONE" {
  return sampleCount === 0 ? "NONE" : sampleCount <= 2 ? "LOW" : sampleCount <= 5 ? "MEDIUM" : "HIGH";
}

export function deepFreezeReference<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeReference(item);
    return Object.freeze(value);
  }
  if (record(value)) {
    for (const item of Object.values(value)) deepFreezeReference(item);
    return Object.freeze(value);
  }
  return value;
}

function source(value: unknown): value is ReferenceSource {
  if (!record(value) || !shape(value, ["capturedAt", "contractVersion", "fingerprint", "owner", "sourceId", "type", "version"], ["url"]) || value.contractVersion !== "1" || !id(value.sourceId) || value.version !== 0 || !["AUTHORIZED_LIBRARY", "COMPETITOR_PUBLIC_URL", "FABIO_SUPPLIED_FILE", "INTERNAL_GENERATED", "PUBLIC_URL"].includes(String(value.type)) || !text(value.owner, 1, 500) || !timestamp(value.capturedAt)) return false;
  const requiresUrl = ["AUTHORIZED_LIBRARY", "COMPETITOR_PUBLIC_URL", "PUBLIC_URL"].includes(String(value.type));
  return requiresUrl === (value.url !== undefined) && (value.url === undefined || httpsUrl(value.url)) && fingerprint(value);
}

function rights(value: unknown): value is ReferenceRights {
  if (!record(value) || !shape(value, ["allowedUse", "contractVersion", "fingerprint", "owner", "rightsId", "status", "version"], ["evidenceFingerprint", "evidenceReference", "expiresAt", "verifiedAt", "verifiedBy"]) || value.contractVersion !== "1" || !id(value.rightsId) || value.version !== 0 || !REFERENCE_RIGHTS_STATUSES.some((status) => status === value.status) || !text(value.owner, 1, 500) || !enumStrings(value.allowedUse, ["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"], 0, 5) || (value.evidenceFingerprint !== undefined && !hash(value.evidenceFingerprint)) || (value.evidenceReference !== undefined && !text(value.evidenceReference, 1, 2_000)) || (value.verifiedBy !== undefined && !id(value.verifiedBy)) || (value.verifiedAt !== undefined && !timestamp(value.verifiedAt)) || (value.expiresAt !== undefined && !timestamp(value.expiresAt))) return false;
  const verifiedRights = value.status === "AUTHORIZED" || value.status === "OWNED";
  if (verifiedRights && (value.evidenceFingerprint === undefined || value.evidenceReference === undefined || value.verifiedBy === undefined || value.verifiedAt === undefined || value.allowedUse.length === 0)) return false;
  if (!verifiedRights && (value.evidenceFingerprint !== undefined || value.evidenceReference !== undefined || value.verifiedBy !== undefined || value.verifiedAt !== undefined)) return false;
  if (value.status === "FABIO_SUPPLIED" && value.allowedUse.length !== 0) return false;
  if (value.status === "PUBLIC_ANALYSIS_ONLY" && (value.allowedUse.length !== 1 || value.allowedUse[0] !== "INTERNAL_ANALYSIS")) return false;
  if ((value.status === "UNKNOWN" || value.status === "BLOCKED") && value.allowedUse.length !== 0) return false;
  return fingerprint(value);
}

function privacy(value: unknown): value is ReferencePrivacy {
  if (!record(value) || !shape(value, ["consentEvidence", "contractVersion", "dataClasses", "fingerprint", "policyFingerprint", "privacyId", "purpose", "releaseEvidence", "retentionExpiresAt", "status", "verifiedAt", "version"]) || value.contractVersion !== "1" || !id(value.privacyId) || value.version !== 0 || !REFERENCE_PRIVACY_STATUSES.some((status) => status === value.status) || !enumStrings(value.dataClasses, REFERENCE_DATA_CLASSES, 1, REFERENCE_DATA_CLASSES.length) || !privacyEvidence(value.consentEvidence) || !privacyEvidence(value.releaseEvidence) || !["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"].includes(String(value.purpose)) || !timestamp(value.verifiedAt) || !timestamp(value.retentionExpiresAt) || Date.parse(value.retentionExpiresAt) <= Date.parse(value.verifiedAt) || !hash(value.policyFingerprint)) return false;
  const hasNone = value.dataClasses.includes("NONE");
  if (hasNone !== (value.dataClasses.length === 1)) return false;
  if (value.status === "CLEARED") {
    if (hasNone && (value.consentEvidence.status !== "NOT_APPLICABLE" || value.releaseEvidence.status !== "NOT_APPLICABLE")) return false;
    if (!hasNone && (value.consentEvidence.status !== "PROVIDED" || value.releaseEvidence.status !== "PROVIDED")) return false;
  }
  return fingerprint(value);
}

function privacyEvidence(value: unknown): value is ReferencePrivacyEvidence {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "PROVIDED") return shape(value, ["evidenceFingerprint", "evidenceReference", "status", "verifiedAt"]) && text(value.evidenceReference, 1, 2_000) && hash(value.evidenceFingerprint) && timestamp(value.verifiedAt);
  if (value.status === "NOT_APPLICABLE") return shape(value, ["attestationFingerprint", "reasonCode", "status", "verifiedAt"]) && value.reasonCode === "SAFE_NON_PERSONAL_ASSET" && hash(value.attestationFingerprint) && timestamp(value.verifiedAt);
  return value.status === "NOT_VERIFIED" && shape(value, ["reasonCode", "status"]) && value.reasonCode === "NOT_VERIFIED";
}

function asset(value: unknown): value is ReferenceAsset {
  if (!record(value) || !shape(value, ["actorId", "aspectRatio", "assetId", "audience", "businessObjective", "byteLength", "contractVersion", "createdAt", "dimensions", "fabioApproval", "fingerprint", "freshness", "links", "mimeType", "originalFilename", "platforms", "privacy", "referenceId", "rights", "roles", "sha256", "source", "status", "storage", "title", "updatedAt", "version", "whatNotToCopy", "whatToLearn", "workspaceId"]) || value.contractVersion !== "1" || !id(value.referenceId) || value.referenceId !== value.assetId || !id(value.assetId) || !id(value.workspaceId) || !id(value.actorId) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !text(value.title, 1, 500) || !filename(value.originalFilename) || !hash(value.sha256) || !integer(value.byteLength, 1, REFERENCE_VAULT_LIMITS.maxBlobBytes) || !mime(value.mimeType) || !dimensions(value.dimensions, value.mimeType) || !storage(value.storage, value.sha256) || !source(value.source) || !rights(value.rights) || !privacy(value.privacy) || !enumStrings(value.roles, REFERENCE_ROLES, 1, REFERENCE_ROLES.length) || !enumStrings(value.platforms, ["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"], 1, 5) || typeof value.aspectRatio !== "string" || !ASPECT_RATIO.test(value.aspectRatio) || !text(value.businessObjective, 1, 2_000) || !strings(value.audience, 1, 50, 500) || !strings(value.whatToLearn, 1, 50, 2_000) || !strings(value.whatNotToCopy, 1, 50, 2_000) || !freshness(value.freshness) || !links(value.links) || !REFERENCE_ASSET_STATUSES.some((status) => status === value.status) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) return false;
  const fabioApproval = value.fabioApproval;
  if (!approval(fabioApproval)) return false;
  if (value.status === "APPROVED" && fabioApproval.status !== "APPROVED") return false;
  if (value.status === "REJECTED" && fabioApproval.status !== "REJECTED") return false;
  if (["IMPORTED", "PENDING_FABIO_REVIEW"].includes(String(value.status)) && fabioApproval.status !== "PENDING") return false;
  return fingerprint(value) && boundedJson(value);
}

function collection(value: unknown): value is ReferenceCollection {
  return record(value) && shape(value, ["actorId", "assets", "collectionId", "contractVersion", "createdAt", "description", "fingerprint", "roles", "title", "updatedAt", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.collectionId) && id(value.workspaceId) && id(value.actorId) && integer(value.version, 0, Number.MAX_SAFE_INTEGER) && text(value.title, 1, 500) && text(value.description, 1, 4_000) && enumStrings(value.roles, REFERENCE_ROLES, 1, REFERENCE_ROLES.length) && refs(value.assets, 1, 500) && timestamp(value.createdAt) && timestamp(value.updatedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt) && fingerprint(value) && boundedJson(value);
}

const VISUAL_FIELDS = ["realism", "lighting", "contrast", "depth", "objectDensity", "focalHierarchy", "luxuryLevel", "textDensity", "colorUsage", "composition", "negativeSpace", "forbiddenElements"] as const;
const WRITING_FIELDS = ["titleLength", "sentenceLength", "vocabulary", "directness", "urgency", "practicalDensity", "guruRisk", "ctaStyle", "evidenceLanguage", "forbiddenExpressions"] as const;

function visualPreference(value: unknown): value is VisualPreference {
  const required = ["confidence", "contractVersion", "fingerprint", "preferenceId", "sampleAssetRefs", "sampleCount", "version", ...VISUAL_FIELDS];
  return record(value) && shape(value, required) && value.contractVersion === "1" && id(value.preferenceId) && integer(value.version, 0, Number.MAX_SAFE_INTEGER) && VISUAL_FIELDS.every((field) => strings(value[field], 0, 50, 500)) && refs(value.sampleAssetRefs, 1, 500) && value.sampleCount === value.sampleAssetRefs.length && value.confidence === referenceConfidence(value.sampleCount) && fingerprint(value);
}

function writingPreference(value: unknown): value is WritingPreference {
  const required = ["confidence", "contractVersion", "fingerprint", "preferenceId", "sampleAssetRefs", "sampleCount", "version", ...WRITING_FIELDS];
  return record(value) && shape(value, required) && value.contractVersion === "1" && id(value.preferenceId) && integer(value.version, 0, Number.MAX_SAFE_INTEGER) && WRITING_FIELDS.every((field) => strings(value[field], 0, 100, 1_000)) && refs(value.sampleAssetRefs, 1, 500) && value.sampleCount === value.sampleAssetRefs.length && value.confidence === referenceConfidence(value.sampleCount) && fingerprint(value);
}

function negativeReference(value: unknown): value is NegativeReference {
  return record(value) && shape(value, ["actorId", "assetRef", "contractVersion", "createdAt", "fingerprint", "negativeReferenceId", "prohibitedTraits", "reason", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.negativeReferenceId) && id(value.workspaceId) && id(value.actorId) && value.version === 0 && ref(value.assetRef) && text(value.reason, 1, 2_000) && strings(value.prohibitedTraits, 1, 50, 500) && timestamp(value.createdAt) && fingerprint(value);
}

function creativeFingerprint(value: unknown): value is CreativeFingerprint {
  if (!record(value) || !shape(value, ["actorId", "confidence", "contractVersion", "createdAt", "creativeFingerprintId", "fingerprint", "negativeReferenceIds", "sampleAssetRefs", "sampleCount", "updatedAt", "version", "visual", "workspaceId", "writing"]) || value.contractVersion !== "1" || !id(value.creativeFingerprintId) || !id(value.workspaceId) || !id(value.actorId) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !visualPreference(value.visual) || !writingPreference(value.writing) || !ids(value.negativeReferenceIds, 0, 500) || !refs(value.sampleAssetRefs, 1, 500) || value.sampleCount !== value.sampleAssetRefs.length || value.confidence !== referenceConfidence(value.sampleCount) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) return false;
  const samples = new Set(value.sampleAssetRefs.map((entry) => `${entry.assetId}:${String(entry.version)}`));
  return [...value.visual.sampleAssetRefs, ...value.writing.sampleAssetRefs].every((entry) => samples.has(`${entry.assetId}:${String(entry.version)}`)) && fingerprint(value) && boundedJson(value);
}

const BUSINESS_FIELDS = ["founderConstraints", "revenueTargets", "budget", "availableTime", "riskTolerance", "audience", "offers", "pricing", "deliveryCapacity", "channels", "currentAssets", "commercialExclusions", "successMetrics", "unitEconomics", "customerJourney", "activeExperiments"] as const;

function businessContext(value: unknown): value is BusinessContext {
  const required = ["actorId", "audienceSignalIds", "businessContextId", "contractVersion", "createdAt", "customerLanguageReferenceIds", "fingerprint", "notAvailableReasons", "offerReferenceIds", "status", "updatedAt", "version", "workspaceId", ...BUSINESS_FIELDS];
  if (!record(value) || !shape(value, required) || value.contractVersion !== "1" || !id(value.businessContextId) || !id(value.workspaceId) || !id(value.actorId) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !["AVAILABLE", "NOT_AVAILABLE"].includes(String(value.status)) || !BUSINESS_FIELDS.every((field) => businessDatum(value[field])) || !ids(value.audienceSignalIds, 0, 500) || !ids(value.offerReferenceIds, 0, 500) || !ids(value.customerLanguageReferenceIds, 0, 500) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) return false;
  const availableCount = BUSINESS_FIELDS.filter((field) => record(value[field]) && value[field].status === "AVAILABLE").length;
  if (value.status === "NOT_AVAILABLE" && (availableCount !== 0 || !strings(value.notAvailableReasons, 1, 50, 1_000) || value.audienceSignalIds.length !== 0 || value.offerReferenceIds.length !== 0 || value.customerLanguageReferenceIds.length !== 0)) return false;
  if (value.status === "AVAILABLE" && (availableCount === 0 || !strings(value.notAvailableReasons, 0, 50, 1_000))) return false;
  return fingerprint(value) && boundedJson(value);
}

function businessDatum(value: unknown): value is BusinessContextDatum {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "NOT_AVAILABLE") return shape(value, ["reasonCode", "status"]) && value.reasonCode === "NOT_AVAILABLE";
  return value.status === "AVAILABLE" && shape(value, ["evidenceAssetRefs", "status", "value"]) && jsonSafe(value.value) && refs(value.evidenceAssetRefs, 1, 100);
}

function audienceSignal(value: unknown): value is AudienceSignal {
  return record(value) && shape(value, ["actorId", "audience", "audienceSignalId", "confidence", "contractVersion", "createdAt", "evidenceAssetRefs", "fingerprint", "freshness", "signal", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.audienceSignalId) && id(value.workspaceId) && id(value.actorId) && value.version === 0 && text(value.audience, 1, 500) && text(value.signal, 1, 4_000) && refs(value.evidenceAssetRefs, 1, 500) && ["HIGH", "LOW", "MEDIUM"].includes(String(value.confidence)) && confidenceAtMost(String(value.confidence) as Exclude<ReferenceConfidence, "NONE">, referenceConfidence(value.evidenceAssetRefs.length)) && freshness(value.freshness) && timestamp(value.createdAt) && fingerprint(value);
}

function offerReference(value: unknown): value is OfferReference {
  if (!record(value) || !shape(value, ["actorId", "contractVersion", "createdAt", "evidenceAssetRefs", "fingerprint", "mechanism", "offerReferenceId", "pricingStatus", "promise", "title", "version", "workspaceId"], ["priceCents"]) || value.contractVersion !== "1" || !id(value.offerReferenceId) || !id(value.workspaceId) || !id(value.actorId) || value.version !== 0 || !text(value.title, 1, 500) || !text(value.promise, 1, 2_000) || !text(value.mechanism, 1, 2_000) || !["AVAILABLE", "NOT_AVAILABLE"].includes(String(value.pricingStatus)) || !refs(value.evidenceAssetRefs, 1, 500) || !timestamp(value.createdAt)) return false;
  return (value.pricingStatus === "AVAILABLE") === (value.priceCents !== undefined) && (value.priceCents === undefined || integer(value.priceCents, 0, Number.MAX_SAFE_INTEGER)) && fingerprint(value);
}

function customerLanguageReference(value: unknown): value is CustomerLanguageReference {
  return record(value) && shape(value, ["actorId", "audience", "contractVersion", "createdAt", "customerLanguageReferenceId", "evidenceAssetRefs", "fingerprint", "freshness", "intent", "phrases", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.customerLanguageReferenceId) && id(value.workspaceId) && id(value.actorId) && value.version === 0 && text(value.audience, 1, 500) && strings(value.phrases, 1, 100, 1_000) && text(value.intent, 1, 1_000) && refs(value.evidenceAssetRefs, 1, 500) && freshness(value.freshness) && timestamp(value.createdAt) && fingerprint(value);
}

function creativeDecision(value: unknown): value is CreativeDecision {
  return record(value) && shape(value, ["actorId", "affectedElement", "assetRefs", "audience", "businessObjective", "confidence", "contractVersion", "decidedAt", "decision", "decisionId", "expiresAt", "fingerprint", "links", "packageRefs", "rationale", "resultingRevision", "reusableRule", "scope", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.decisionId) && id(value.workspaceId) && id(value.actorId) && value.version === 0 && ["ACCEPT", "AVOID", "PREFER", "REJECT", "REQUEST_REVISION"].includes(String(value.decision)) && refs(value.assetRefs, 1, 500) && packageRefs(value.packageRefs) && text(value.affectedElement, 1, 1_000) && text(value.reusableRule, 1, 2_000) && ["HIGH", "LOW", "MEDIUM"].includes(String(value.confidence)) && confidenceAtMost(String(value.confidence) as Exclude<ReferenceConfidence, "NONE">, referenceConfidence(value.assetRefs.length + value.packageRefs.length)) && ["ASSET", "GLOBAL", "PACKAGE"].includes(String(value.scope)) && (value.expiresAt === "NOT_AVAILABLE" || timestamp(value.expiresAt)) && resultingRevision(value.resultingRevision) && text(value.rationale, 1, 4_000) && text(value.businessObjective, 1, 2_000) && strings(value.audience, 1, 50, 500) && links(value.links) && timestamp(value.decidedAt) && fingerprint(value);
}

function packageRefs(value: unknown): value is readonly { readonly fingerprint: string; readonly packageId: string; readonly version: number }[] {
  return Array.isArray(value) && value.length <= 500 && value.every((item) => record(item) && shape(item, ["fingerprint", "packageId", "version"]) && id(item.packageId) && integer(item.version, 0, Number.MAX_SAFE_INTEGER) && hash(item.fingerprint)) && unique(value.map((item) => `${String((item as Readonly<Record<string, unknown>>).packageId)}:${String((item as Readonly<Record<string, unknown>>).version)}`));
}

function resultingRevision(value: unknown): boolean {
  if (!record(value) || typeof value.status !== "string") return false;
  return value.status === "NOT_AVAILABLE"
    ? shape(value, ["status"])
    : value.status === "AVAILABLE" && shape(value, ["fingerprint", "packageId", "status", "version"]) && id(value.packageId) && integer(value.version, 0, Number.MAX_SAFE_INTEGER) && hash(value.fingerprint);
}

function outcomeLink(value: unknown): value is OutcomeLink {
  if (!record(value) || !shape(value, ["actorId", "assetRefs", "contractVersion", "fingerprint", "links", "metrics", "observedAt", "outcomeLinkId", "result", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.outcomeLinkId) || !id(value.workspaceId) || !id(value.actorId) || value.version !== 0 || !refs(value.assetRefs, 1, 500) || !["MIXED", "NEGATIVE", "NOT_AVAILABLE", "POSITIVE"].includes(String(value.result)) || !record(value.metrics) || !jsonSafe(value.metrics) || !timestamp(value.observedAt)) return false;
  const outcomeLinks = value.links;
  return links(outcomeLinks) && (outcomeLinks.outcomeIds.length > 0 || outcomeLinks.missionIds.length > 0 || outcomeLinks.packageIds.length > 0) && fingerprint(value) && boundedJson(value);
}

function review(value: unknown): value is ReferenceReview {
  return record(value) && shape(value, ["actorId", "assetRef", "contractVersion", "decision", "findings", "fingerprint", "reason", "reviewId", "reviewedAt", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.reviewId) && id(value.workspaceId) && id(value.actorId) && value.version === 0 && ref(value.assetRef) && ["APPROVED", "ARCHIVED", "EXPIRED", "PENDING_FABIO_REVIEW", "REJECTED", "RIGHTS_BLOCKED"].includes(String(value.decision)) && text(value.reason, 1, 4_000) && strings(value.findings, 0, 100, 1_000) && timestamp(value.reviewedAt) && fingerprint(value);
}

function importReceipt(value: unknown): value is ReferenceImportReceipt {
  if (!record(value) || !shape(value, ["actorId", "batchId", "commandId", "contractVersion", "duplicateAssets", "duplicateCount", "durableOriginals", "externalEffectsExecuted", "fingerprint", "importedAssets", "importedCount", "previewFingerprint", "receiptId", "recordedAt", "version", "workspaceId"], ["collectionRef"]) || value.contractVersion !== "1" || !id(value.receiptId) || !id(value.workspaceId) || !id(value.actorId) || !id(value.commandId) || !id(value.batchId) || value.version !== 0 || !refs(value.importedAssets, 0, 500) || !refs(value.duplicateAssets, 0, 500) || value.importedCount !== value.importedAssets.length || value.duplicateCount !== value.duplicateAssets.length || !hash(value.previewFingerprint) || !timestamp(value.recordedAt) || value.durableOriginals !== true || value.externalEffectsExecuted !== false) return false;
  if (value.collectionRef !== undefined && (!record(value.collectionRef) || !shape(value.collectionRef, ["collectionId", "fingerprint", "version"]) || !id(value.collectionRef.collectionId) || !integer(value.collectionRef.version, 0, Number.MAX_SAFE_INTEGER) || !hash(value.collectionRef.fingerprint))) return false;
  return fingerprint(value) && boundedJson(value);
}

function blobTombstone(value: unknown): value is ReferenceBlobTombstone {
  return record(value) && shape(value, ["actorId", "assetRef", "byteContentStatus", "byteLength", "commandId", "contentSha256", "contractVersion", "externalEffectsExecuted", "fingerprint", "metadataStatus", "mimeType", "policyFingerprint", "purgedAt", "purgedBy", "reason", "retentionExpiresAt", "tombstoneId", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.tombstoneId) && value.version === 0 && id(value.workspaceId) && id(value.actorId) && id(value.commandId) && ref(value.assetRef) && hash(value.contentSha256) && integer(value.byteLength, 1, REFERENCE_VAULT_LIMITS.maxBlobBytes) && mime(value.mimeType) && timestamp(value.retentionExpiresAt) && hash(value.policyFingerprint) && timestamp(value.purgedAt) && Date.parse(value.retentionExpiresAt) <= Date.parse(value.purgedAt) && id(value.purgedBy) && text(value.reason, 1, 4_000) && value.byteContentStatus === "PURGED" && value.metadataStatus === "IMMUTABLE_RETAINED" && value.externalEffectsExecuted === false && fingerprint(value) && boundedJson(value);
}

function importRequest(value: unknown): value is ReferenceImportRequest {
  if (!record(value) || !shape(value, ["assets", "batchId"], ["collection"]) || !id(value.batchId) || !Array.isArray(value.assets) || value.assets.length < 1 || value.assets.length > 25 || !value.assets.every(importCandidate) || !jsonSafe(value) || serializedSize(value) > MAX_IMPORT_BYTES) return false;
  return value.collection === undefined || (record(value.collection) && shape(value.collection, ["collectionId", "description", "roles", "title"]) && id(value.collection.collectionId) && text(value.collection.title, 1, 500) && text(value.collection.description, 1, 4_000) && enumStrings(value.collection.roles, REFERENCE_ROLES, 1, REFERENCE_ROLES.length));
}

function importCandidate(value: unknown): boolean {
  return record(value) && shape(value, ["aspectRatio", "assetId", "audience", "businessObjective", "contentBase64", "declaredByteLength", "declaredSha256", "dimensions", "fabioApprovalReason", "freshness", "links", "mimeType", "originalFilename", "platforms", "privacy", "referenceId", "rights", "roles", "source", "title", "whatNotToCopy", "whatToLearn"]) && !containsImportCandidateCredentialMaterial(value) && id(value.referenceId) && value.referenceId === value.assetId && id(value.assetId) && text(value.title, 1, 500) && filename(value.originalFilename) && hash(value.declaredSha256) && integer(value.declaredByteLength, 1, REFERENCE_VAULT_LIMITS.maxBlobBytes) && typeof value.contentBase64 === "string" && value.contentBase64.length >= 4 && value.contentBase64.length <= 70_000_000 && BASE64.test(value.contentBase64) && mime(value.mimeType) && dimensions(value.dimensions, value.mimeType) && sourceInput(value.source) && rightsInput(value.rights) && privacyInput(value.privacy) && enumStrings(value.roles, REFERENCE_ROLES, 1, REFERENCE_ROLES.length) && enumStrings(value.platforms, ["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"], 1, 5) && ASPECT_RATIO.test(String(value.aspectRatio)) && text(value.businessObjective, 1, 2_000) && strings(value.audience, 1, 50, 500) && strings(value.whatToLearn, 1, 50, 2_000) && strings(value.whatNotToCopy, 1, 50, 2_000) && text(value.fabioApprovalReason, 1, 2_000) && freshness(value.freshness) && links(value.links);
}

function importPreview(value: unknown): value is ReferenceImportPreview {
  if (!record(value) || !shape(value, ["actorId", "batchId", "blockerCodes", "contractVersion", "duplicateCount", "fingerprint", "importableCount", "items", "status", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.batchId) || !["BLOCKED", "READY"].includes(String(value.status)) || !Array.isArray(value.items) || !value.items.every(previewItem) || !integer(value.importableCount, 0, 25) || !integer(value.duplicateCount, 0, 25) || !strings(value.blockerCodes, 0, 50, 128)) return false;
  const blocked = value.items.filter((item) => record(item) && item.disposition === "BLOCKED").length;
  return value.importableCount === value.items.filter((item) => record(item) && item.disposition === "IMPORT").length && value.duplicateCount === value.items.filter((item) => record(item) && item.disposition === "DUPLICATE").length && (value.status === "BLOCKED") === (blocked > 0) && fingerprint(value);
}

function previewItem(value: unknown): boolean {
  return record(value) && shape(value, ["assetId", "detectedMimeType", "disposition", "reasonCodes", "referenceId", "sha256"]) && id(value.referenceId) && value.referenceId === value.assetId && id(value.assetId) && hash(value.sha256) && (value.detectedMimeType === "NOT_AVAILABLE" || mime(value.detectedMimeType)) && ["BLOCKED", "DUPLICATE", "IMPORT"].includes(String(value.disposition)) && strings(value.reasonCodes, 0, 50, 128) && (value.disposition === "BLOCKED") === (value.reasonCodes.length > 0);
}

function referenceBrief(value: unknown): value is ReferenceBrief {
  if (!record(value) || !shape(value, ["actorId", "assets", "businessContext", "competitorOutputPolicy", "contractVersion", "decisions", "excludedCompetitorCount", "externalEffectsExecuted", "fingerprint", "generatedAt", "outcomes", "purpose", "workspaceId"], ["creativeFingerprint", "platform"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !timestamp(value.generatedAt) || !["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"].includes(String(value.purpose)) || (value.platform !== undefined && (typeof value.platform !== "string" || !["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"].includes(value.platform))) || value.competitorOutputPolicy !== "BLOCKED" || value.externalEffectsExecuted !== false || !integer(value.excludedCompetitorCount, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(value.assets) || !value.assets.every(briefAsset) || !Array.isArray(value.decisions) || !value.decisions.every(creativeDecision) || !Array.isArray(value.outcomes) || !value.outcomes.every(outcomeLink)) return false;
  const contextValid = businessContext(value.businessContext) || (record(value.businessContext) && shape(value.businessContext, ["reasonCode", "status"]) && value.businessContext.status === "NOT_AVAILABLE" && value.businessContext.reasonCode === "REFERENCE_BUSINESS_CONTEXT_NOT_AVAILABLE");
  return contextValid && (value.creativeFingerprint === undefined || creativeFingerprint(value.creativeFingerprint)) && fingerprint(value) && boundedJson(value);
}

function briefAsset(value: unknown): boolean {
  return record(value) && shape(value, ["assetRef", "audience", "businessObjective", "platforms", "referenceId", "roles", "title", "whatNotToCopy", "whatToLearn"]) && id(value.referenceId) && ref(value.assetRef) && value.referenceId === value.assetRef.assetId && text(value.title, 1, 500) && enumStrings(value.roles, REFERENCE_ROLES.filter((role) => role !== "COMPETITOR_REFERENCE"), 1, REFERENCE_ROLES.length - 1) && enumStrings(value.platforms, ["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"], 1, 5) && text(value.businessObjective, 1, 2_000) && strings(value.audience, 1, 50, 500) && strings(value.whatToLearn, 1, 50, 2_000) && strings(value.whatNotToCopy, 1, 50, 2_000);
}

function referenceVaultCommand(value: unknown): value is ReferenceVaultCommand {
  if (!record(value) || !shape(value, ["actorId", "commandId", "contractVersion", "expectedVersion", "idempotencyKey", "input", "inputFingerprint", "operation", "targetFingerprint", "targetId", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.commandId) || !id(value.idempotencyKey) || !id(value.workspaceId) || !REFERENCE_VAULT_OPERATIONS.some((operation) => operation === value.operation) || !id(value.targetId) || !expectedVersion(value.expectedVersion) || !(value.targetFingerprint === "NOT_AVAILABLE" || hash(value.targetFingerprint)) || !record(value.input) || commandInputContainsCredentialMaterial(value.operation, value.input) || !hash(value.inputFingerprint) || value.inputFingerprint !== referenceInputFingerprint(value.input) || !jsonSafe(value) || serializedSize(value) > MAX_IMPORT_BYTES) return false;
  const readOnly = value.operation === "GET_REFERENCE_BRIEF" || value.operation === "PREVIEW_REFERENCE_IMPORT";
  return readOnly ? value.expectedVersion === "NOT_APPLICABLE" && value.targetFingerprint === "NOT_AVAILABLE" : value.expectedVersion !== "NOT_APPLICABLE";
}

function referenceVaultCommandResponse(value: unknown): value is ReferenceVaultCommandResponse {
  return record(value) && shape(value, ["commandId", "contractVersion", "nextAction", "operation", "replayed", "result", "status", "unauthorizedExternalEffectOccurred"]) && value.contractVersion === "1" && id(value.commandId) && REFERENCE_VAULT_OPERATIONS.some((operation) => operation === value.operation) && value.status === "ok" && text(value.nextAction, 1, 1_000) && typeof value.replayed === "boolean" && value.unauthorizedExternalEffectOccurred === false && jsonSafe(value.result) && serializedSize(value) <= 4_194_304;
}

function referenceVaultCommandReceipt(value: unknown): value is ReferenceVaultCommandReceipt {
  return record(value) && shape(value, ["actorId", "commandId", "contractVersion", "entityRefs", "fingerprint", "idempotencyKeyFingerprint", "inputFingerprint", "operation", "reasonCode", "recordedAt", "requestFingerprint", "resultFingerprint", "resultRecordId", "targetFingerprint", "targetId", "unauthorizedExternalEffectOccurred", "workspaceId"]) && value.contractVersion === "1" && id(value.actorId) && id(value.commandId) && hash(value.idempotencyKeyFingerprint) && id(value.workspaceId) && REFERENCE_VAULT_OPERATIONS.some((operation) => operation === value.operation) && id(value.targetId) && (value.targetFingerprint === "NOT_AVAILABLE" || hash(value.targetFingerprint)) && hash(value.inputFingerprint) && hash(value.requestFingerprint) && timestamp(value.recordedAt) && id(value.resultRecordId) && hash(value.resultFingerprint) && Array.isArray(value.entityRefs) && value.entityRefs.length <= 100 && value.entityRefs.every(commandEntityRef) && value.reasonCode === "REFERENCE_COMMAND_COMPLETED" && value.unauthorizedExternalEffectOccurred === false && fingerprint(value) && boundedJson(value);
}

function referenceVaultCommandResult(value: unknown): value is ReferenceVaultCommandResult {
  return record(value) && shape(value, ["actorId", "commandId", "contractVersion", "fingerprint", "operation", "recordedAt", "replay", "resultFingerprint", "resultId", "sensitivity", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.resultId) && value.version === 0 && id(value.workspaceId) && id(value.actorId) && id(value.commandId) && vaultOperation(value.operation) && hash(value.resultFingerprint) && replayEnvelope(value.replay, value.operation, value.resultFingerprint) && timestamp(value.recordedAt) && value.sensitivity === "PRIVATE_REPLAY_RESULT" && fingerprint(value) && boundedJson(value);
}

function replayEnvelope(value: unknown, operation: ReferenceVaultOperation, resultFingerprint: string): boolean {
  if (!record(value) || typeof value.mode !== "string") return false;
  if (value.mode === "AUTHORITATIVE_ENTITY") {
    return operation !== "GET_REFERENCE_BRIEF" && operation !== "PREVIEW_REFERENCE_IMPORT" && shape(value, ["entityRef", "mode"]) && commandEntityRef(value.entityRef);
  }
  if (value.mode !== "REDACTED_SUMMARY" || !shape(value, ["mode", "result"])) return false;
  if (operation === "PREVIEW_REFERENCE_IMPORT") return importPreview(value.result) && commandResultFingerprint(value.result) === resultFingerprint;
  return operation === "GET_REFERENCE_BRIEF" && referenceBriefCommandSummary(value.result) && commandResultFingerprint(value.result) === resultFingerprint;
}

function referenceBriefCommandSummary(value: unknown): boolean {
  return record(value) && shape(value, ["actorId", "assetCount", "businessContextStatus", "competitorOutputPolicy", "contractVersion", "creativeFingerprintStatus", "decisionCount", "excludedCompetitorCount", "externalEffectsExecuted", "generatedAt", "kind", "outcomeCount", "purpose", "sourceBriefFingerprint", "workspaceId"], ["platform"]) && value.kind === "REFERENCE_BRIEF_SUMMARY" && value.contractVersion === "1" && id(value.workspaceId) && id(value.actorId) && timestamp(value.generatedAt) && ["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"].includes(String(value.purpose)) && (value.platform === undefined || (typeof value.platform === "string" && ["EMAIL", "GENERAL", "INSTAGRAM", "TIKTOK", "WEB"].includes(value.platform))) && integer(value.assetCount, 0, 100) && integer(value.decisionCount, 0, 100) && integer(value.outcomeCount, 0, 100) && integer(value.excludedCompetitorCount, 0, Number.MAX_SAFE_INTEGER) && ["AVAILABLE", "NOT_AVAILABLE"].includes(String(value.businessContextStatus)) && ["AVAILABLE", "NOT_AVAILABLE"].includes(String(value.creativeFingerprintStatus)) && value.competitorOutputPolicy === "BLOCKED" && value.externalEffectsExecuted === false && hash(value.sourceBriefFingerprint);
}

function commandEntityRef(value: unknown): boolean {
  return record(value) && shape(value, ["entityId", "entityType", "fingerprint"], ["version"]) && id(value.entityId) && [...REFERENCE_VAULT_RECORD_TYPES, "REFERENCE_BRIEF", "REFERENCE_IMPORT_PREVIEW"].includes(String(value.entityType)) && hash(value.fingerprint) && (value.version === undefined || integer(value.version, 0, Number.MAX_SAFE_INTEGER));
}

function referenceVaultAuditEvent(value: unknown): value is ReferenceVaultAuditEvent {
  return record(value) && shape(value, ["actorId", "commandId", "contractVersion", "eventId", "eventType", "externalEffectsExecuted", "fingerprint", "idempotencyKeyFingerprint", "occurredAt", "operation", "outcome", "subjectFingerprint", "workspaceId"]) && value.contractVersion === "1" && id(value.actorId) && id(value.commandId) && id(value.eventId) && id(value.workspaceId) && hash(value.idempotencyKeyFingerprint) && REFERENCE_VAULT_OPERATIONS.some((operation) => operation === value.operation) && value.eventType === "REFERENCE_VAULT_COMMAND_COMPLETED" && value.outcome === "SUCCESS" && value.externalEffectsExecuted === false && timestamp(value.occurredAt) && hash(value.subjectFingerprint) && fingerprint(value);
}

function sourceInput(value: unknown): boolean {
  if (!record(value) || !shape(value, ["capturedAt", "owner", "sourceId", "type"], ["url"]) || !id(value.sourceId) || !["AUTHORIZED_LIBRARY", "COMPETITOR_PUBLIC_URL", "FABIO_SUPPLIED_FILE", "INTERNAL_GENERATED", "PUBLIC_URL"].includes(String(value.type)) || !text(value.owner, 1, 500) || !timestamp(value.capturedAt)) return false;
  const requiresUrl = ["AUTHORIZED_LIBRARY", "COMPETITOR_PUBLIC_URL", "PUBLIC_URL"].includes(String(value.type));
  return requiresUrl === (value.url !== undefined) && (value.url === undefined || httpsUrl(value.url));
}

function rightsInput(value: unknown): boolean {
  if (!record(value) || !shape(value, ["allowedUse", "owner", "rightsId", "status"], ["evidenceFingerprint", "evidenceReference", "expiresAt", "verifiedAt", "verifiedBy"]) || !id(value.rightsId) || !REFERENCE_RIGHTS_STATUSES.some((status) => status === value.status) || !text(value.owner, 1, 500) || !enumStrings(value.allowedUse, ["CREATIVE_DIRECTION", "DERIVATIVE_GENERATION", "INTERNAL_ANALYSIS", "LOCAL_OVERLAY", "TRAINING_REFERENCE"], 0, 5) || (value.evidenceFingerprint !== undefined && !hash(value.evidenceFingerprint)) || (value.evidenceReference !== undefined && !text(value.evidenceReference, 1, 2_000)) || (value.verifiedBy !== undefined && !id(value.verifiedBy)) || (value.verifiedAt !== undefined && !timestamp(value.verifiedAt)) || (value.expiresAt !== undefined && !timestamp(value.expiresAt))) return false;
  const verifiedRights = value.status === "AUTHORIZED" || value.status === "OWNED";
  if (verifiedRights && (value.evidenceFingerprint === undefined || value.evidenceReference === undefined || value.verifiedBy === undefined || value.verifiedAt === undefined || value.allowedUse.length === 0)) return false;
  if (!verifiedRights && (value.evidenceFingerprint !== undefined || value.evidenceReference !== undefined || value.verifiedBy !== undefined || value.verifiedAt !== undefined)) return false;
  if (value.status === "FABIO_SUPPLIED" && value.allowedUse.length !== 0) return false;
  if (value.status === "PUBLIC_ANALYSIS_ONLY" && (value.allowedUse.length !== 1 || value.allowedUse[0] !== "INTERNAL_ANALYSIS")) return false;
  return !((value.status === "UNKNOWN" || value.status === "BLOCKED") && value.allowedUse.length !== 0);
}

function privacyInput(value: unknown): boolean {
  if (!record(value) || !shape(value, ["consentEvidence", "dataClasses", "policyFingerprint", "privacyId", "purpose", "releaseEvidence", "retentionExpiresAt", "status", "verifiedAt"])) return false;
  const base = { ...value, contractVersion: "1" as const, version: 0 as const };
  return privacy({ ...base, fingerprint: referenceFingerprint(base) });
}

function storage(value: unknown, sha256: unknown): boolean {
  return record(value) && shape(value, ["contentSha256", "durability", "immutable", "kind"]) && value.kind === "SQLITE_PRIVATE_CAS" && value.durability === "DURABLE" && value.immutable === true && value.contentSha256 === sha256;
}

function approval(value: unknown): value is FabioReferenceApproval {
  return record(value) && shape(value, ["reason", "status"], ["decidedAt", "decidedBy"]) && ["APPROVED", "PENDING", "REJECTED"].includes(String(value.status)) && text(value.reason, 1, 2_000) && ((value.status === "PENDING" && value.decidedAt === undefined && value.decidedBy === undefined) || (value.status !== "PENDING" && timestamp(value.decidedAt) && id(value.decidedBy)));
}

function freshness(value: unknown): boolean {
  return record(value) && shape(value, ["freshUntil", "observedAt"], ["expiresAt"]) && timestamp(value.observedAt) && timestamp(value.freshUntil) && Date.parse(value.freshUntil) > Date.parse(value.observedAt) && (value.expiresAt === undefined || (timestamp(value.expiresAt) && Date.parse(value.expiresAt) >= Date.parse(value.freshUntil)));
}

function links(value: unknown): value is ReferenceLinks {
  return record(value) && shape(value, ["missionIds", "outcomeIds", "packageIds"]) && ids(value.missionIds, 0, 500) && ids(value.packageIds, 0, 500) && ids(value.outcomeIds, 0, 500);
}

function dimensions(value: unknown, mimeType: unknown): boolean {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "AVAILABLE") return shape(value, ["height", "status", "width"]) && integer(value.width, 1, REFERENCE_VAULT_LIMITS.maxWidth) && integer(value.height, 1, REFERENCE_VAULT_LIMITS.maxHeight) && value.width * value.height <= REFERENCE_VAULT_LIMITS.maxPixels && typeof mimeType === "string" && mimeType.startsWith("image/");
  return value.status === "NOT_AVAILABLE" && shape(value, ["status"]) && typeof mimeType === "string" && !mimeType.startsWith("image/");
}

function refs(value: unknown, minimum: number, maximum: number): value is readonly ReferenceAssetRef[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(ref) && unique(value.map((entry) => `${entry.assetId}:${String(entry.version)}`));
}

function ref(value: unknown): value is ReferenceAssetRef {
  return record(value) && shape(value, ["assetId", "fingerprint", "version"]) && id(value.assetId) && integer(value.version, 0, Number.MAX_SAFE_INTEGER) && hash(value.fingerprint);
}

function expectedVersion(value: unknown): boolean {
  return value === "NOT_APPLICABLE" || value === "NOT_EXISTS" || integer(value, 0, Number.MAX_SAFE_INTEGER);
}

function fingerprint(value: Readonly<Record<string, unknown>>): boolean {
  return hash(value.fingerprint) && value.fingerprint === referenceFingerprint(value);
}

function result<T>(value: unknown, predicate: (candidate: unknown) => candidate is T, label: string): ValidationResult<T> {
  if (!predicate(value)) return validationFailure([{ code: "invalid", message: `${label} is invalid`, path: "" }]);
  return validationSuccess(deepFreezeReference(structuredClone(value)) as T);
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function shape(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key)) && Object.values(value).every((entry) => entry !== undefined);
}

function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function mime(value: unknown): value is string { return typeof value === "string" && MIME.test(value) && value.length <= 128; }
function text(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length >= minimum && value.length <= maximum; }
function integer(value: unknown, minimum: number, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function filename(value: unknown): value is string { return text(value, 1, 255) && !value.includes("/") && !value.includes("\\") && value !== "." && value !== ".."; }

function strings(value: unknown, minimum: number, maximum: number, maximumLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((entry) => text(entry, 1, maximumLength)) && unique(value);
}

function ids(value: unknown, minimum: number, maximum: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(id) && unique(value);
}

function enumStrings(value: unknown, allowed: readonly string[], minimum: number, maximum: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((entry) => typeof entry === "string" && allowed.includes(entry)) && unique(value);
}

function unique(values: readonly string[]): boolean { return new Set(values).size === values.length; }
function vaultOperation(value: unknown): value is ReferenceVaultOperation { return typeof value === "string" && REFERENCE_VAULT_OPERATIONS.some((operation) => operation === value); }

function confidenceAtMost(value: Exclude<ReferenceConfidence, "NONE">, maximum: ReferenceConfidence): boolean {
  const rank: Readonly<Record<ReferenceConfidence, number>> = { HIGH: 3, LOW: 1, MEDIUM: 2, NONE: 0 };
  return rank[value] <= rank[maximum];
}

function commandResultFingerprint(value: unknown): string {
  return canonicalSha256(value);
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

function jsonSafe(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => jsonSafe(entry, depth + 1));
  return record(value) && Object.values(value).every((entry) => jsonSafe(entry, depth + 1));
}

function serializedSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function boundedJson(value: unknown): boolean { return jsonSafe(value) && serializedSize(value) <= MAX_RECORD_BYTES; }

export function containsReferenceCredentialMaterial(value: unknown, depth = 0): boolean {
  return containsCredentialMaterial(value, depth, false);
}

export function containsDecodedReferenceCredentialMaterial(value: unknown): boolean {
  return containsCredentialMaterial(value, 0, false);
}

function containsCredentialMaterial(value: unknown, depth: number, skipEncodedImportContent: boolean): boolean {
  if (depth > 32) return true;
  if (typeof value === "string") {
    return /(?:\bsk-[A-Za-z0-9_-]{16,}\b|\bBearer\s+[A-Za-z0-9._~-]{16,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b)/u.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => containsCredentialMaterial(entry, depth + 1, skipEncodedImportContent));
  if (!record(value)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "contentBase64" && skipEncodedImportContent && depth === 0) continue;
    if (key === "contentBase64" && entry !== null && entry !== "" && entry !== false) return true;
    if (/(?:token|secret|password|api[_-]?key|cookie|authorization)/iu.test(key) && entry !== null && entry !== "" && entry !== false) return true;
    if (containsCredentialMaterial(entry, depth + 1, skipEncodedImportContent)) return true;
  }
  return false;
}

function containsImportCandidateCredentialMaterial(value: unknown): boolean {
  return containsCredentialMaterial(value, 0, true);
}

function commandInputContainsCredentialMaterial(operation: unknown, input: Readonly<Record<string, unknown>>): boolean {
  if (operation !== "IMPORT_REFERENCE_ASSET" && operation !== "PREVIEW_REFERENCE_IMPORT") return containsReferenceCredentialMaterial(input);
  const inputMetadata = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "request"));
  if (containsReferenceCredentialMaterial(inputMetadata)) return true;
  if (!record(input.request)) return containsReferenceCredentialMaterial(input.request);
  const requestMetadata = Object.fromEntries(Object.entries(input.request).filter(([key]) => key !== "assets"));
  if (containsReferenceCredentialMaterial(requestMetadata)) return true;
  return Array.isArray(input.request.assets)
    ? input.request.assets.some((candidate) => containsImportCandidateCredentialMaterial(candidate))
    : containsReferenceCredentialMaterial(input.request.assets);
}
