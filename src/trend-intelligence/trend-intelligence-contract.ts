import type { SecretReference } from "../config/secret-reference.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";

export const TREND_INTELLIGENCE_CONTRACT_VERSION = "1" as const;
export const MAX_TREND_ITEMS_PER_REQUEST = 100;
export const MAX_TREND_RECEIPTS = 250;
export const MAX_TREND_SIGNALS = 500;

export const TREND_SOURCE_KEYS = Object.freeze([
  "GOOGLE_TRENDS",
  "GDELT",
  "WIKIMEDIA",
  "ARXIV",
  "GITHUB",
  "YOUTUBE",
  "META_AD_LIBRARY",
  "PINTEREST_TRENDS",
  "PINTEREST_PREDICTS",
  "TIKTOK_COMMERCIAL_CONTENT",
  "TIKTOK_CREATIVE_CENTER",
  "GOOGLE_ADS",
  "REDDIT",
  "PRODUCT_HUNT",
  "HACKER_NEWS",
  "ETSY",
  "WGSN_INTELLIGENCE",
  "EXPLODING_TOPICS",
  "SIMILARWEB",
  "TRENDALYTICS",
] as const);

export type TrendSourceKey = typeof TREND_SOURCE_KEYS[number];
export type TrendSourceAccessRequirement =
  | "ACCOUNT_AND_DEVELOPER_APPROVAL_REQUIRED"
  | "AUTHORIZED_IMPORT_REQUIRED"
  | "LICENSE_REQUIRED"
  | "OAUTH_AND_APP_REVIEW_REQUIRED"
  | "PUBLIC_OFFICIAL_ENDPOINT"
  | "SECRET_REFERENCE_REQUIRED";
export type TrendSourceAcquisitionMode =
  | "COMMERCIAL_PROVIDER"
  | "OFFICIAL_API"
  | "OFFICIAL_EXPORT"
  | "OFFICIAL_FEED"
  | "OPERATOR_RESEARCH";
export type TrendSignalFamily = "ATTENTION_SIGNAL" | "COMMERCE_INTENT" | "MARKET_EVIDENCE" | "SEARCH_INTENT";
export type TrendRightsClass = "AGGREGATE" | "LICENSED" | "LINK_ONLY" | "METADATA_ONLY";
export type TrendSourceLicenseState =
  | "AUTHORIZED_IMPORT_ONLY"
  | "COMMERCIAL_DISCOVERY_REQUIRED"
  | "LICENSE_REQUIRED"
  | "PLATFORM_TERMS_REVIEW_REQUIRED"
  | "PUBLIC_TERMS_REVIEW_REQUIRED";
export type TrendAccessGrant =
  | "ACCOUNT_APPROVAL_CONFIRMED"
  | "APP_REVIEW_CONFIRMED"
  | "AUTHORIZED_IMPORT_CONFIRMED"
  | "COMMERCIAL_TERMS_CONFIRMED"
  | "LICENSE_CONFIRMED"
  | "OAUTH_CONNECTION_CONFIRMED"
  | "PUBLIC_TERMS_CONFIRMED";

export interface TrendCredentialRequirement {
  readonly bindingId: string;
  readonly description: string;
}

export interface TrendSourceCatalogEntry {
  readonly accessRequirement: TrendSourceAccessRequirement;
  readonly acquisitionMode: TrendSourceAcquisitionMode;
  readonly canonicalReference: string;
  readonly connectionDeclaration: "NOT_CONFIGURED";
  readonly dataClasses: readonly ("ATTENTION" | "COMMERCE" | "CULTURE" | "NEWS" | "RESEARCH" | "SEARCH" | "SOCIAL" | "TECHNOLOGY")[];
  readonly displayName: string;
  readonly licenseState: TrendSourceLicenseState;
  readonly owner: string;
  readonly providerRuntime: "CONFIGURABLE" | "DISABLED";
  readonly requiredCredentialBindings: readonly TrendCredentialRequirement[];
  readonly requiredGrants: readonly TrendAccessGrant[];
  readonly sourceId: string;
  readonly sourceKey: TrendSourceKey;
  readonly signalFamilies: readonly TrendSignalFamily[];
  readonly termsNote: string;
}

export interface TrendCredentialBinding {
  readonly bindingId: string;
  readonly secretReference: SecretReference;
}

export interface TrendSourceConnectionProfile {
  readonly actorId: string;
  readonly accessGrants: readonly TrendAccessGrant[];
  readonly credentialBindings: readonly TrendCredentialBinding[];
  readonly sourceKey: TrendSourceKey;
  readonly sourceRegistryEntry?: SourceRegistryEntry;
  readonly transportConfigured: boolean;
  readonly workspaceId: string;
}

export type TrendPreflightReasonCode =
  | "ACCESS_GRANT_MISSING"
  | "ACTOR_MISMATCH"
  | "CATALOG_SOURCE_DISABLED"
  | "CREDENTIAL_REFERENCE_MISSING"
  | "DUPLICATE_CREDENTIAL_BINDING"
  | "SOURCE_CANONICAL_REFERENCE_MISMATCH"
  | "SOURCE_FORBIDDEN"
  | "SOURCE_NOT_REGISTERED"
  | "SOURCE_REGISTRATION_MISMATCH"
  | "TRANSPORT_NOT_CONFIGURED"
  | "WORKSPACE_MISMATCH";

export interface TrendSourcePreflight {
  readonly capabilityState: "BLOCKED" | "PREFLIGHT_READY";
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly executionEligible: boolean;
  readonly externalWrites: "LOCKED";
  readonly paidCalls: "DISABLED";
  readonly publication: "LOCKED";
  readonly reasonCodes: readonly TrendPreflightReasonCode[];
  readonly retryCount: 0;
  readonly registryPolicyAuthorized: boolean;
  readonly sourceId: string;
  readonly sourceKey: TrendSourceKey;
  readonly sourceRegistered: boolean;
  readonly transportConfigured: boolean;
}

export interface TrendAcquisitionRequest {
  readonly clientRequestId: string;
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly idempotencyKey: string;
  readonly maxCostUsd: 0;
  readonly maxItems: number;
  readonly queryFingerprint: string;
  readonly retryCount: 0;
  readonly sourceKey: TrendSourceKey;
  readonly timeoutMs: number;
}

export interface TrendTransportRequest {
  readonly clientRequestId: string;
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly idempotencyKeyFingerprint: string;
  readonly maxItems: number;
  readonly queryFingerprint: string;
  readonly retryCount: 0;
  readonly sourceKey: TrendSourceKey;
  readonly timeoutMs: number;
}

export interface TrendTransportReconciliationRequest {
  readonly clientRequestId: string;
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly operationId: string;
  readonly sourceKey: TrendSourceKey;
  readonly timeoutMs: number;
}

export interface TrendTransportItem {
  readonly attributionRequired: boolean;
  readonly evidenceReference?: string;
  readonly evidenceKind: "METRIC" | "PUBLICATION" | "RANKING" | "SEARCH_TERM";
  readonly externalId: string;
  readonly metric?: {
    readonly name: string;
    readonly normalization?: string;
    readonly unit: string;
    readonly value: number;
    readonly window: string;
  };
  readonly observedAt: string;
  readonly providerReference: string;
  readonly providerUpdatedAt?: string;
  readonly publishedAt?: string;
  readonly retentionExpiresAt?: string;
  readonly rightsClass: TrendRightsClass;
  readonly signalFamily: TrendSignalFamily;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly territory: string;
  readonly topic: string;
}

export interface TrendTransportResponse {
  readonly body?: unknown;
  readonly operationId?: string;
  readonly providerRequestId?: string;
  readonly statusCode: number;
}

export interface TrendSourceTransport {
  readonly transportId: string;
  acquire(request: TrendTransportRequest): Promise<TrendTransportResponse>;
  reconcile(request: TrendTransportReconciliationRequest): Promise<TrendTransportResponse>;
}

export interface TrendSignal {
  readonly attributionRequired: boolean;
  readonly evidenceReference?: string;
  readonly evidenceKind: TrendTransportItem["evidenceKind"];
  readonly externalId: string;
  readonly metric?: TrendTransportItem["metric"];
  readonly observedAt: string;
  readonly providerReference: string;
  readonly providerUpdatedAt?: string;
  readonly publishedAt?: string;
  readonly retentionExpiresAt?: string;
  readonly rightsClass: TrendRightsClass;
  readonly signalFamily: TrendSignalFamily;
  readonly signalFingerprint: string;
  readonly signalId: string;
  readonly sourceId: string;
  readonly sourceKey: TrendSourceKey;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly territory: string;
  readonly topic: string;
}

export type TrendConnectorReasonCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_REQUIRED"
  | "IDEMPOTENT_REPLAY"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_PROVIDER_RESPONSE"
  | "PREFLIGHT_BLOCKED"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "RECONCILIATION_COMPLETED"
  | "RECONCILIATION_FAILED"
  | "RECONCILIATION_PENDING"
  | "REQUEST_COMPLETED"
  | "TRANSPORT_FAILED";

export interface TrendConnectorReceipt {
  readonly actorId: string;
  readonly clientRequestId: string;
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly cost:
    | { readonly classification: "NO_PAID_CALL"; readonly amountUsd: 0 }
    | { readonly classification: "RECONCILIATION_PENDING" };
  readonly diagnostic: {
    readonly reasonCode: TrendConnectorReasonCode;
    readonly stage: "IDEMPOTENCY" | "PREFLIGHT" | "RECONCILIATION" | "TRANSPORT" | "VALIDATION";
    readonly statusCode?: number;
  };
  readonly externalEffectOccurred: false;
  readonly externalWrites: "LOCKED";
  readonly idempotencyKeyFingerprint: string;
  readonly itemCount: number;
  readonly operationId: string;
  readonly providerOperationId?: string;
  readonly providerRequestId?: string;
  readonly publication: "LOCKED";
  readonly rawPayloadStored: false;
  readonly receiptId: string;
  readonly reconcilesReceiptId?: string;
  readonly recordedAt: string;
  readonly replayOfReceiptId?: string;
  readonly requestFingerprint: string;
  readonly retryCount: 0;
  readonly secretMaterialStored: false;
  readonly sequence: number;
  readonly signalFingerprints: readonly string[];
  readonly sourceId: string;
  readonly sourceKey: TrendSourceKey;
  readonly status: "BLOCKED" | "COMPLETED" | "FAILED" | "RECONCILED" | "REPLAYED" | "UNCERTAIN";
  readonly transportId: string;
  readonly workspaceId: string;
}

export interface TrendConnectorResult {
  readonly receipt: TrendConnectorReceipt;
  readonly signals: readonly TrendSignal[];
}

export function deepFreezeTrend<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeTrend(item);
    return Object.freeze(value);
  }
  for (const item of Object.values(value)) deepFreezeTrend(item);
  return Object.freeze(value);
}

export function frozenTrendClone<T>(value: T): T {
  return deepFreezeTrend(structuredClone(value));
}
