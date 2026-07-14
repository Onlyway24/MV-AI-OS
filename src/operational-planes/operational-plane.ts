import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const OPERATIONAL_PLANE_CONTRACT_VERSION = "1" as const;

export type EvidenceStatus = "CONTESTED" | "INSUFFICIENT" | "STALE" | "VERIFIED";
export type SourceCategory = "AUTHORIZED_DATASET" | "EDITORIAL" | "FORBIDDEN" | "OFFICIAL_DOCUMENTATION" | "OFFICIAL_SITE" | "SECONDARY";
export type ReliabilityLevel = "HIGH" | "LOW" | "MEDIUM";
export type RiskDomain = "FINANCE" | "GENERAL" | "HEALTH" | "LEGAL";

export interface SourceRegistryEntry {
  readonly actorId: string;
  readonly canonicalReference: string;
  readonly category: SourceCategory;
  readonly createdAt: string;
  readonly maxFreshnessDays: number;
  readonly name: string;
  readonly permittedRiskDomains: readonly RiskDomain[];
  readonly publicCitationAllowed: boolean;
  readonly reliability: ReliabilityLevel;
  readonly requiresSecondSource: boolean;
  readonly sourceId: string;
  readonly status: "AUTHORIZED" | "FORBIDDEN";
  readonly version: 0;
  readonly workspaceId: string;
}

export interface EvidenceClaimMapping { readonly claimId: string; readonly statement: string; }

export interface EvidenceRecord {
  readonly acquiredAt: string;
  readonly actorId: string;
  readonly claimMappings: readonly EvidenceClaimMapping[];
  readonly contentPublishedAt: string;
  readonly corroboratingEvidenceIds: readonly string[];
  readonly evidenceId: string;
  readonly excerpt: string;
  readonly fingerprint: string;
  readonly freshnessExpiresAt: string;
  readonly limitations: readonly string[];
  readonly riskDomain: RiskDomain;
  readonly sourceId: string;
  readonly sourceReference: string;
  readonly status: EvidenceStatus;
  readonly version: 0;
  readonly workspaceId: string;
}

export type PublicationPlatform = "instagram" | "tiktok";
export type PublicationStatus = "AUTHORIZED" | "CANCELLED" | "DRY_RUN" | "FAILED" | "SUCCEEDED" | "UNCERTAIN";

export interface PublicationAuthorization { readonly authorizedAt: string; readonly authorizedBy: string; }
export interface PublicationReceipt { readonly outcome: "FAILED" | "SUCCEEDED" | "UNCERTAIN"; readonly platformContentRef?: string; readonly receiptFingerprint: string; readonly recordedAt: string; }
export interface PublicationPlan {
  readonly accountRef: string;
  readonly actorId: string;
  readonly authorization?: PublicationAuthorization;
  readonly contentPackageFingerprint: string;
  readonly contentVersion: number;
  readonly createdAt: string;
  readonly dryRun: true;
  readonly idempotencyKey: string;
  readonly platform: PublicationPlatform;
  readonly productionId: string;
  readonly publicationId: string;
  readonly receipt?: PublicationReceipt;
  readonly scheduledFor: string;
  readonly status: PublicationStatus;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface PublicationKillSwitch {
  readonly enabled: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface FeedbackMetrics {
  readonly clicks: number;
  readonly comments: number;
  readonly completionCount: number;
  readonly conversions: number;
  readonly leadCount: number;
  readonly profileVisits: number;
  readonly saves: number;
  readonly shares: number;
  readonly views: number;
  readonly watchTimeSeconds: number;
}

export interface FeedbackMetricSnapshot {
  readonly actorId: string;
  readonly capturedAt: string;
  readonly conversionAttribution: "NOT_ATTRIBUTED" | "VERIFIED";
  readonly correctionOfSnapshotId?: string;
  readonly metrics: FeedbackMetrics;
  readonly periodEnd: string;
  readonly periodStart: string;
  readonly platform: PublicationPlatform;
  readonly productionId: string;
  readonly publicationId: string;
  readonly publicationReceiptFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly snapshotId: string;
  readonly workspaceId: string;
}

export interface SourceRegistrationRequest {
  readonly canonicalReference: string; readonly category: SourceCategory; readonly maxFreshnessDays: number; readonly name: string; readonly permittedRiskDomains: readonly RiskDomain[]; readonly publicCitationAllowed: boolean; readonly reliability: ReliabilityLevel; readonly requiresSecondSource: boolean; readonly sourceId: string; readonly status: "AUTHORIZED" | "FORBIDDEN";
}
export interface EvidenceRecordRequest {
  readonly claimMappings: readonly EvidenceClaimMapping[]; readonly contentPublishedAt: string; readonly corroboratingEvidenceIds: readonly string[]; readonly evidenceId: string; readonly excerpt: string; readonly fingerprint: string; readonly freshnessExpiresAt: string; readonly limitations: readonly string[]; readonly riskDomain: RiskDomain; readonly sourceId: string; readonly sourceReference: string; readonly status: EvidenceStatus;
}
export interface PublicationDryRunRequest { readonly accountRef: string; readonly contentVersion: number; readonly idempotencyKey: string; readonly platform: PublicationPlatform; readonly productionId: string; readonly publicationId: string; readonly scheduledFor: string; }
export interface PublicationAuthorizationRequest { readonly expectedVersion: number; readonly publicationId: string; }
export interface PublicationReceiptRequest { readonly expectedVersion: number; readonly outcome: "FAILED" | "SUCCEEDED" | "UNCERTAIN"; readonly platformContentRef?: string; readonly publicationId: string; readonly receiptFingerprint: string; }
export interface PublicationKillSwitchRequest { readonly enabled: boolean; readonly expectedVersion: number; }
export interface FeedbackMetricImportRequest { readonly conversionAttribution: "NOT_ATTRIBUTED" | "VERIFIED"; readonly correctionOfSnapshotId?: string; readonly metrics: FeedbackMetrics; readonly periodEnd: string; readonly periodStart: string; readonly publicationId: string; readonly publicationReceiptFingerprint: string; readonly snapshotFingerprint: string; readonly snapshotId: string; }

export interface FeedbackAnalysis {
  readonly contractVersion: RequestContractVersion;
  readonly correctionCount: number;
  readonly latest?: FeedbackMetricSnapshot;
  readonly publicationId: string;
  readonly snapshotCount: number;
  readonly unauthorizedExternalEffectOccurred: false;
}

export function isPublicationTransitionAllowed(from: PublicationStatus, to: PublicationStatus): boolean {
  return (from === "DRY_RUN" && ["AUTHORIZED", "CANCELLED"].includes(to)) || (from === "AUTHORIZED" && ["FAILED", "SUCCEEDED", "UNCERTAIN", "CANCELLED"].includes(to));
}
