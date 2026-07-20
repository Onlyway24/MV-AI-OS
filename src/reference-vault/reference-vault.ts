import type { JsonObject, JsonValue } from "../contracts/json.js";

export const REFERENCE_VAULT_CONTRACT_VERSION = "1" as const;

export const REFERENCE_ROLES = Object.freeze([
  "BRAND_REFERENCE",
  "LOGO_ASSET",
  "VISUAL_STYLE",
  "PHOTOGRAPHY_REFERENCE",
  "COMPOSITION_REFERENCE",
  "TYPOGRAPHY_REFERENCE",
  "HOOK_REFERENCE",
  "CAROUSEL_STRUCTURE",
  "CTA_REFERENCE",
  "COMPETITOR_REFERENCE",
  "OFFER_REFERENCE",
  "PRICING_REFERENCE",
  "CUSTOMER_LANGUAGE",
  "ANALYTICS_EVIDENCE",
  "NEGATIVE_REFERENCE",
] as const);

export type ReferenceRole = typeof REFERENCE_ROLES[number];

export const REFERENCE_RIGHTS_STATUSES = Object.freeze([
  "OWNED",
  "FABIO_SUPPLIED",
  "AUTHORIZED",
  "PUBLIC_ANALYSIS_ONLY",
  "UNKNOWN",
  "BLOCKED",
] as const);

export type ReferenceRightsStatus = typeof REFERENCE_RIGHTS_STATUSES[number];

export const REFERENCE_ASSET_STATUSES = Object.freeze([
  "IMPORTED",
  "PENDING_FABIO_REVIEW",
  "APPROVED",
  "REJECTED",
  "RIGHTS_BLOCKED",
  "EXPIRED",
  "ARCHIVED",
] as const);

export type ReferenceAssetStatus = typeof REFERENCE_ASSET_STATUSES[number];
export type ReferenceConfidence = "HIGH" | "LOW" | "MEDIUM" | "NONE";
export type ReferencePlatform = "EMAIL" | "GENERAL" | "INSTAGRAM" | "TIKTOK" | "WEB";
export type ReferenceAllowedUse = "CREATIVE_DIRECTION" | "DERIVATIVE_GENERATION" | "INTERNAL_ANALYSIS" | "LOCAL_OVERLAY" | "TRAINING_REFERENCE";

export const REFERENCE_PRIVACY_STATUSES = Object.freeze(["UNKNOWN", "REVIEW_REQUIRED", "CLEARED", "BLOCKED"] as const);
export type ReferencePrivacyStatus = typeof REFERENCE_PRIVACY_STATUSES[number];

export const REFERENCE_DATA_CLASSES = Object.freeze([
  "NONE",
  "PERSONAL_DATA",
  "BIOMETRIC_DATA",
  "LOCATION_DATA",
  "MINOR_DATA",
  "CONFIDENTIAL_BUSINESS_DATA",
] as const);
export type ReferenceDataClass = typeof REFERENCE_DATA_CLASSES[number];

export const REFERENCE_VAULT_LIMITS = Object.freeze({
  maxBlobBytes: 52_428_800,
  maxBlobCountPerActorWorkspace: 1_000,
  maxHeight: 16_384,
  maxPixels: 100_000_000,
  maxRecordScan: 501,
  maxTotalBytesPerActorWorkspace: 536_870_912,
  maxWidth: 16_384,
} as const);

export interface ReferenceSource {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly sourceId: string;
  readonly version: 0;
  readonly type: "AUTHORIZED_LIBRARY" | "COMPETITOR_PUBLIC_URL" | "FABIO_SUPPLIED_FILE" | "INTERNAL_GENERATED" | "PUBLIC_URL";
  readonly url?: string;
  readonly owner: string;
  readonly capturedAt: string;
  readonly fingerprint: string;
}

export interface ReferenceRights {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly rightsId: string;
  readonly version: 0;
  readonly status: ReferenceRightsStatus;
  readonly owner: string;
  readonly allowedUse: readonly ReferenceAllowedUse[];
  readonly evidenceFingerprint?: string;
  readonly evidenceReference?: string;
  readonly verifiedBy?: string;
  readonly verifiedAt?: string;
  readonly expiresAt?: string;
  readonly fingerprint: string;
}

export type ReferencePrivacyEvidence =
  | {
    readonly status: "PROVIDED";
    readonly evidenceReference: string;
    readonly evidenceFingerprint: string;
    readonly verifiedAt: string;
  }
  | {
    readonly status: "NOT_APPLICABLE";
    readonly reasonCode: "SAFE_NON_PERSONAL_ASSET";
    readonly attestationFingerprint: string;
    readonly verifiedAt: string;
  }
  | {
    readonly status: "NOT_VERIFIED";
    readonly reasonCode: "NOT_VERIFIED";
  };

export interface ReferencePrivacy {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly privacyId: string;
  readonly version: 0;
  readonly status: ReferencePrivacyStatus;
  readonly dataClasses: readonly ReferenceDataClass[];
  readonly consentEvidence: ReferencePrivacyEvidence;
  readonly releaseEvidence: ReferencePrivacyEvidence;
  readonly purpose: ReferenceAllowedUse;
  readonly verifiedAt: string;
  readonly retentionExpiresAt: string;
  readonly policyFingerprint: string;
  readonly fingerprint: string;
}

export type ReferenceDimensions =
  | { readonly status: "AVAILABLE"; readonly width: number; readonly height: number }
  | { readonly status: "NOT_AVAILABLE" };

export interface ReferenceAssetRef {
  readonly assetId: string;
  readonly version: number;
  readonly fingerprint: string;
}

export interface ReferenceLinks {
  readonly missionIds: readonly string[];
  readonly packageIds: readonly string[];
  readonly outcomeIds: readonly string[];
}

export interface ReferenceFreshness {
  readonly observedAt: string;
  readonly freshUntil: string;
  readonly expiresAt?: string;
}

export interface FabioReferenceApproval {
  readonly status: "APPROVED" | "PENDING" | "REJECTED";
  readonly reason: string;
  readonly decidedAt?: string;
  readonly decidedBy?: string;
}

export interface ReferenceAssetStorage {
  readonly kind: "SQLITE_PRIVATE_CAS";
  readonly contentSha256: string;
  readonly immutable: true;
  readonly durability: "DURABLE";
}

export interface ReferenceAsset {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  /** Stable compatibility alias required by downstream creative agents. */
  readonly referenceId: string;
  readonly assetId: string;
  readonly version: number;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly title: string;
  readonly originalFilename: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly dimensions: ReferenceDimensions;
  readonly storage: ReferenceAssetStorage;
  readonly source: ReferenceSource;
  readonly rights: ReferenceRights;
  readonly privacy: ReferencePrivacy;
  readonly roles: readonly ReferenceRole[];
  readonly platforms: readonly ReferencePlatform[];
  readonly aspectRatio: string;
  readonly businessObjective: string;
  readonly audience: readonly string[];
  readonly whatToLearn: readonly string[];
  readonly whatNotToCopy: readonly string[];
  readonly fabioApproval: FabioReferenceApproval;
  readonly freshness: ReferenceFreshness;
  readonly links: ReferenceLinks;
  readonly status: ReferenceAssetStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
}

export interface ReferenceCollection {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly collectionId: string;
  readonly version: number;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly title: string;
  readonly description: string;
  readonly roles: readonly ReferenceRole[];
  readonly assets: readonly ReferenceAssetRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
}

export type ReferenceEligibilityReasonCode =
  | "REFERENCE_COMPETITOR_OUTPUT_BLOCKED"
  | "REFERENCE_EXPIRED"
  | "REFERENCE_PLATFORM_NOT_AUTHORIZED"
  | "REFERENCE_PRIVACY_NOT_CLEARED"
  | "REFERENCE_PRIVACY_PROOF_MISSING"
  | "REFERENCE_PRIVACY_PURPOSE_MISMATCH"
  | "REFERENCE_PURPOSE_NOT_AUTHORIZED"
  | "REFERENCE_RETENTION_EXPIRED"
  | "REFERENCE_RIGHTS_EVIDENCE_MISSING"
  | "REFERENCE_RIGHTS_EXPIRED"
  | "REFERENCE_RIGHTS_PROVENANCE_ONLY"
  | "REFERENCE_RIGHTS_UNAVAILABLE"
  | "REFERENCE_STALE"
  | "REFERENCE_STATUS_NOT_APPROVED";

export interface ReferenceCollectionProjectionItem {
  readonly assetId: string;
  readonly requestedAssetRef: ReferenceAssetRef;
  readonly currentAssetRef?: ReferenceAssetRef;
  readonly eligibility: "BLOCKED" | "ELIGIBLE" | "MISSING";
  readonly reasonCodes: readonly (ReferenceEligibilityReasonCode | "REFERENCE_CAS_MISSING" | "REFERENCE_CURRENT_ASSET_MISSING")[];
}

export interface ReferenceCollectionProjection {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly collectionId: string;
  readonly collectionVersion: number;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
  readonly resolvedAt: string;
  readonly items: readonly ReferenceCollectionProjectionItem[];
  readonly externalEffectsExecuted: false;
  readonly fingerprint: string;
}

export interface VisualPreference {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly preferenceId: string;
  readonly version: number;
  readonly realism: readonly string[];
  readonly lighting: readonly string[];
  readonly contrast: readonly string[];
  readonly depth: readonly string[];
  readonly objectDensity: readonly string[];
  readonly focalHierarchy: readonly string[];
  readonly luxuryLevel: readonly string[];
  readonly textDensity: readonly string[];
  readonly colorUsage: readonly string[];
  readonly composition: readonly string[];
  readonly negativeSpace: readonly string[];
  readonly forbiddenElements: readonly string[];
  readonly sampleAssetRefs: readonly ReferenceAssetRef[];
  readonly sampleCount: number;
  readonly confidence: ReferenceConfidence;
  readonly fingerprint: string;
}

export interface WritingPreference {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly preferenceId: string;
  readonly version: number;
  readonly titleLength: readonly string[];
  readonly sentenceLength: readonly string[];
  readonly vocabulary: readonly string[];
  readonly directness: readonly string[];
  readonly urgency: readonly string[];
  readonly practicalDensity: readonly string[];
  readonly guruRisk: readonly string[];
  readonly ctaStyle: readonly string[];
  readonly evidenceLanguage: readonly string[];
  readonly forbiddenExpressions: readonly string[];
  readonly sampleAssetRefs: readonly ReferenceAssetRef[];
  readonly sampleCount: number;
  readonly confidence: ReferenceConfidence;
  readonly fingerprint: string;
}

export interface NegativeReference {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly negativeReferenceId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly assetRef: ReferenceAssetRef;
  readonly reason: string;
  readonly prohibitedTraits: readonly string[];
  readonly createdAt: string;
  readonly fingerprint: string;
}

export interface CreativeFingerprint {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly creativeFingerprintId: string;
  readonly version: number;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly visual: VisualPreference;
  readonly writing: WritingPreference;
  readonly negativeReferenceIds: readonly string[];
  readonly sampleAssetRefs: readonly ReferenceAssetRef[];
  readonly sampleCount: number;
  readonly confidence: ReferenceConfidence;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
}

export type BusinessContextDatum =
  | {
    readonly status: "AVAILABLE";
    readonly value: JsonValue;
    readonly evidenceAssetRefs: readonly ReferenceAssetRef[];
  }
  | {
    readonly status: "NOT_AVAILABLE";
    readonly reasonCode: "NOT_AVAILABLE";
  };

export interface BusinessContext {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly businessContextId: string;
  readonly version: number;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly status: "AVAILABLE" | "NOT_AVAILABLE";
  readonly founderConstraints: BusinessContextDatum;
  readonly revenueTargets: BusinessContextDatum;
  readonly budget: BusinessContextDatum;
  readonly availableTime: BusinessContextDatum;
  readonly riskTolerance: BusinessContextDatum;
  readonly audience: BusinessContextDatum;
  readonly offers: BusinessContextDatum;
  readonly pricing: BusinessContextDatum;
  readonly deliveryCapacity: BusinessContextDatum;
  readonly channels: BusinessContextDatum;
  readonly currentAssets: BusinessContextDatum;
  readonly commercialExclusions: BusinessContextDatum;
  readonly successMetrics: BusinessContextDatum;
  readonly unitEconomics: BusinessContextDatum;
  readonly customerJourney: BusinessContextDatum;
  readonly activeExperiments: BusinessContextDatum;
  readonly notAvailableReasons: readonly string[];
  readonly audienceSignalIds: readonly string[];
  readonly offerReferenceIds: readonly string[];
  readonly customerLanguageReferenceIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
}

export interface AudienceSignal {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly audienceSignalId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly audience: string;
  readonly signal: string;
  readonly evidenceAssetRefs: readonly ReferenceAssetRef[];
  readonly confidence: Exclude<ReferenceConfidence, "NONE">;
  readonly freshness: ReferenceFreshness;
  readonly createdAt: string;
  readonly fingerprint: string;
}

export interface OfferReference {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly offerReferenceId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly title: string;
  readonly promise: string;
  readonly mechanism: string;
  readonly pricingStatus: "AVAILABLE" | "NOT_AVAILABLE";
  readonly priceCents?: number;
  readonly evidenceAssetRefs: readonly ReferenceAssetRef[];
  readonly createdAt: string;
  readonly fingerprint: string;
}

export interface CustomerLanguageReference {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly customerLanguageReferenceId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly audience: string;
  readonly phrases: readonly string[];
  readonly intent: string;
  readonly evidenceAssetRefs: readonly ReferenceAssetRef[];
  readonly freshness: ReferenceFreshness;
  readonly createdAt: string;
  readonly fingerprint: string;
}

export interface CreativeDecision {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly decisionId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly decision: "ACCEPT" | "AVOID" | "PREFER" | "REJECT" | "REQUEST_REVISION";
  readonly assetRefs: readonly ReferenceAssetRef[];
  readonly packageRefs: readonly {
    readonly packageId: string;
    readonly version: number;
    readonly fingerprint: string;
  }[];
  readonly affectedElement: string;
  readonly reusableRule: string;
  readonly confidence: Exclude<ReferenceConfidence, "NONE">;
  readonly scope: "ASSET" | "GLOBAL" | "PACKAGE";
  /** ISO timestamp or the explicit sentinel NOT_AVAILABLE; never silently omitted. */
  readonly expiresAt: string;
  readonly resultingRevision:
    | { readonly status: "NOT_AVAILABLE" }
    | { readonly status: "AVAILABLE"; readonly packageId: string; readonly version: number; readonly fingerprint: string };
  readonly rationale: string;
  readonly businessObjective: string;
  readonly audience: readonly string[];
  readonly links: ReferenceLinks;
  readonly decidedAt: string;
  readonly fingerprint: string;
}

export interface OutcomeLink {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly outcomeLinkId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly assetRefs: readonly ReferenceAssetRef[];
  readonly result: "MIXED" | "NEGATIVE" | "NOT_AVAILABLE" | "POSITIVE";
  readonly metrics: JsonObject;
  readonly links: ReferenceLinks;
  readonly observedAt: string;
  readonly fingerprint: string;
}

export interface ReferenceReview {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly reviewId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly assetRef: ReferenceAssetRef;
  readonly decision: "APPROVED" | "ARCHIVED" | "EXPIRED" | "PENDING_FABIO_REVIEW" | "REJECTED" | "RIGHTS_BLOCKED";
  readonly reason: string;
  readonly findings: readonly string[];
  readonly reviewedAt: string;
  readonly fingerprint: string;
}

export interface ReferenceImportReceipt {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly receiptId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly commandId: string;
  readonly batchId: string;
  readonly importedAssets: readonly ReferenceAssetRef[];
  readonly duplicateAssets: readonly ReferenceAssetRef[];
  readonly collectionRef?: { readonly collectionId: string; readonly version: number; readonly fingerprint: string };
  readonly importedCount: number;
  readonly duplicateCount: number;
  readonly recordedAt: string;
  readonly previewFingerprint: string;
  readonly durableOriginals: true;
  readonly externalEffectsExecuted: false;
  readonly fingerprint: string;
}

export interface ReferenceBlobTombstone {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly tombstoneId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly commandId: string;
  readonly assetRef: ReferenceAssetRef;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly retentionExpiresAt: string;
  readonly policyFingerprint: string;
  readonly purgedAt: string;
  readonly purgedBy: string;
  readonly reason: string;
  readonly byteContentStatus: "PURGED";
  readonly metadataStatus: "IMMUTABLE_RETAINED";
  readonly externalEffectsExecuted: false;
  readonly fingerprint: string;
}

export interface ReferenceImportSourceInput {
  readonly sourceId: string;
  readonly type: ReferenceSource["type"];
  readonly url?: string;
  readonly owner: string;
  readonly capturedAt: string;
}

export interface ReferenceImportRightsInput {
  readonly rightsId: string;
  readonly status: ReferenceRightsStatus;
  readonly owner: string;
  readonly allowedUse: readonly ReferenceAllowedUse[];
  readonly evidenceFingerprint?: string;
  readonly evidenceReference?: string;
  readonly verifiedBy?: string;
  readonly verifiedAt?: string;
  readonly expiresAt?: string;
}

export interface ReferenceImportPrivacyInput {
  readonly privacyId: string;
  readonly status: ReferencePrivacyStatus;
  readonly dataClasses: readonly ReferenceDataClass[];
  readonly consentEvidence: ReferencePrivacyEvidence;
  readonly releaseEvidence: ReferencePrivacyEvidence;
  readonly purpose: ReferenceAllowedUse;
  readonly verifiedAt: string;
  readonly retentionExpiresAt: string;
  readonly policyFingerprint: string;
}

export interface ReferenceImportCandidate {
  readonly referenceId: string;
  readonly assetId: string;
  readonly title: string;
  readonly originalFilename: string;
  readonly declaredSha256: string;
  readonly declaredByteLength: number;
  readonly contentBase64: string;
  readonly mimeType: string;
  readonly dimensions: ReferenceDimensions;
  readonly source: ReferenceImportSourceInput;
  readonly rights: ReferenceImportRightsInput;
  readonly privacy: ReferenceImportPrivacyInput;
  readonly roles: readonly ReferenceRole[];
  readonly platforms: readonly ReferencePlatform[];
  readonly aspectRatio: string;
  readonly businessObjective: string;
  readonly audience: readonly string[];
  readonly whatToLearn: readonly string[];
  readonly whatNotToCopy: readonly string[];
  readonly fabioApprovalReason: string;
  readonly freshness: ReferenceFreshness;
  readonly links: ReferenceLinks;
}

export interface ReferenceImportRequest {
  readonly batchId: string;
  readonly assets: readonly ReferenceImportCandidate[];
  readonly collection?: {
    readonly collectionId: string;
    readonly title: string;
    readonly description: string;
    readonly roles: readonly ReferenceRole[];
  };
}

export interface ReferenceImportPreviewItem {
  readonly referenceId: string;
  readonly assetId: string;
  readonly sha256: string;
  readonly detectedMimeType: string;
  readonly disposition: "BLOCKED" | "DUPLICATE" | "IMPORT";
  readonly reasonCodes: readonly string[];
}

export interface ReferenceImportPreview {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly batchId: string;
  readonly status: "BLOCKED" | "READY";
  readonly items: readonly ReferenceImportPreviewItem[];
  readonly importableCount: number;
  readonly duplicateCount: number;
  readonly blockerCodes: readonly string[];
  readonly fingerprint: string;
}

export interface ReferenceBriefAsset {
  readonly referenceId: string;
  readonly assetRef: ReferenceAssetRef;
  readonly title: string;
  readonly roles: readonly Exclude<ReferenceRole, "COMPETITOR_REFERENCE">[];
  readonly platforms: readonly ReferencePlatform[];
  readonly businessObjective: string;
  readonly audience: readonly string[];
  readonly whatToLearn: readonly string[];
  readonly whatNotToCopy: readonly string[];
}

export interface ReferenceBrief {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly generatedAt: string;
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
  readonly assets: readonly ReferenceBriefAsset[];
  readonly creativeFingerprint?: CreativeFingerprint;
  readonly businessContext: BusinessContext | { readonly status: "NOT_AVAILABLE"; readonly reasonCode: "REFERENCE_BUSINESS_CONTEXT_NOT_AVAILABLE" };
  readonly decisions: readonly CreativeDecision[];
  readonly outcomes: readonly OutcomeLink[];
  readonly competitorOutputPolicy: "BLOCKED";
  readonly excludedCompetitorCount: number;
  readonly externalEffectsExecuted: false;
  readonly fingerprint: string;
}

export const REFERENCE_VAULT_OPERATIONS = Object.freeze([
  "IMPORT_REFERENCE_ASSET",
  "PREVIEW_REFERENCE_IMPORT",
  "REVIEW_REFERENCE_ASSET",
  "APPROVE_REFERENCE_ASSET",
  "REJECT_REFERENCE_ASSET",
  "ARCHIVE_REFERENCE_ASSET",
  "RECORD_CREATIVE_DECISION",
  "UPDATE_CREATIVE_FINGERPRINT",
  "UPDATE_BUSINESS_CONTEXT",
  "LINK_REFERENCE_OUTCOME",
  "GET_REFERENCE_BRIEF",
  "PURGE_EXPIRED_REFERENCE_CONTENT",
] as const);

export type ReferenceVaultOperation = typeof REFERENCE_VAULT_OPERATIONS[number];
export type ReferenceExpectedVersion = number | "NOT_APPLICABLE" | "NOT_EXISTS";
export type ReferenceTargetFingerprint = string;

export interface ReferenceVaultCommand {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly operation: ReferenceVaultOperation;
  readonly targetId: string;
  readonly expectedVersion: ReferenceExpectedVersion;
  readonly targetFingerprint: ReferenceTargetFingerprint;
  readonly inputFingerprint: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ReferenceVaultCommandResponse {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly commandId: string;
  readonly operation: ReferenceVaultOperation;
  readonly status: "ok";
  readonly result: unknown;
  readonly nextAction: string;
  readonly replayed: boolean;
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface ReferenceVaultCommandReceipt {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly commandId: string;
  readonly idempotencyKeyFingerprint: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly operation: ReferenceVaultOperation;
  readonly targetId: string;
  readonly targetFingerprint: ReferenceTargetFingerprint;
  readonly inputFingerprint: string;
  readonly requestFingerprint: string;
  readonly recordedAt: string;
  readonly resultRecordId: string;
  readonly resultFingerprint: string;
  readonly entityRefs: readonly ReferenceVaultCommandEntityRef[];
  readonly reasonCode: "REFERENCE_COMMAND_COMPLETED";
  readonly unauthorizedExternalEffectOccurred: false;
  readonly fingerprint: string;
}

export interface ReferenceVaultCommandEntityRef {
  readonly entityType: ReferenceVaultRecordType | "REFERENCE_BRIEF" | "REFERENCE_IMPORT_PREVIEW";
  readonly entityId: string;
  readonly version?: number;
  readonly fingerprint: string;
}

export interface ReferenceVaultCommandResult {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly resultId: string;
  readonly version: 0;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly commandId: string;
  readonly operation: ReferenceVaultOperation;
  readonly resultFingerprint: string;
  readonly replay:
    | {
      readonly mode: "AUTHORITATIVE_ENTITY";
      readonly entityRef: ReferenceVaultCommandEntityRef;
    }
    | {
      readonly mode: "REDACTED_SUMMARY";
      readonly result: ReferenceImportPreview | ReferenceBriefCommandSummary;
    };
  readonly recordedAt: string;
  readonly sensitivity: "PRIVATE_REPLAY_RESULT";
  readonly fingerprint: string;
}

export interface ReferenceBriefCommandSummary {
  readonly kind: "REFERENCE_BRIEF_SUMMARY";
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly generatedAt: string;
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
  readonly assetCount: number;
  readonly decisionCount: number;
  readonly outcomeCount: number;
  readonly excludedCompetitorCount: number;
  readonly businessContextStatus: "AVAILABLE" | "NOT_AVAILABLE";
  readonly creativeFingerprintStatus: "AVAILABLE" | "NOT_AVAILABLE";
  readonly competitorOutputPolicy: "BLOCKED";
  readonly externalEffectsExecuted: false;
  readonly sourceBriefFingerprint: string;
}

export interface ReferenceVaultAuditEvent {
  readonly contractVersion: typeof REFERENCE_VAULT_CONTRACT_VERSION;
  readonly eventId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly commandId: string;
  readonly idempotencyKeyFingerprint: string;
  readonly operation: ReferenceVaultOperation;
  readonly eventType: "REFERENCE_VAULT_COMMAND_COMPLETED";
  readonly outcome: "SUCCESS";
  readonly occurredAt: string;
  readonly subjectFingerprint: string;
  readonly externalEffectsExecuted: false;
  readonly fingerprint: string;
}

export type ReferenceVaultRecordType =
  | "AUDIENCE_SIGNAL"
  | "BUSINESS_CONTEXT"
  | "REFERENCE_BLOB_TOMBSTONE"
  | "CREATIVE_DECISION"
  | "CREATIVE_FINGERPRINT"
  | "CUSTOMER_LANGUAGE_REFERENCE"
  | "NEGATIVE_REFERENCE"
  | "OFFER_REFERENCE"
  | "OUTCOME_LINK"
  | "REFERENCE_ASSET"
  | "REFERENCE_COLLECTION"
  | "REFERENCE_COMMAND_RESULT"
  | "REFERENCE_IMPORT_RECEIPT"
  | "REFERENCE_REVIEW";

export interface ReferenceVaultRecordMap {
  readonly AUDIENCE_SIGNAL: AudienceSignal;
  readonly BUSINESS_CONTEXT: BusinessContext;
  readonly REFERENCE_BLOB_TOMBSTONE: ReferenceBlobTombstone;
  readonly CREATIVE_DECISION: CreativeDecision;
  readonly CREATIVE_FINGERPRINT: CreativeFingerprint;
  readonly CUSTOMER_LANGUAGE_REFERENCE: CustomerLanguageReference;
  readonly NEGATIVE_REFERENCE: NegativeReference;
  readonly OFFER_REFERENCE: OfferReference;
  readonly OUTCOME_LINK: OutcomeLink;
  readonly REFERENCE_ASSET: ReferenceAsset;
  readonly REFERENCE_COLLECTION: ReferenceCollection;
  readonly REFERENCE_COMMAND_RESULT: ReferenceVaultCommandResult;
  readonly REFERENCE_IMPORT_RECEIPT: ReferenceImportReceipt;
  readonly REFERENCE_REVIEW: ReferenceReview;
}
