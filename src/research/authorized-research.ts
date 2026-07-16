import type { EvidenceStatus, RiskDomain } from "../operational-planes/operational-plane.js";

export const AUTHORIZED_RESEARCH_CONTRACT_VERSION = "1" as const;

export interface AuthorizedResearchClaimRequest {
  readonly claimId: string;
  readonly contradictionPhrases: readonly string[];
  readonly requiredPhrases: readonly string[];
  readonly riskDomain: RiskDomain;
  readonly statement: string;
}

export interface AuthorizedResearchTarget {
  readonly claimIds: readonly string[];
  readonly evidenceId: string;
  readonly limitations: readonly string[];
  readonly sourceId: string;
  readonly url: string;
}

export interface AuthorizedResearchPackPlan {
  readonly evidenceIds: readonly string[];
  readonly opportunityId: string;
  readonly packId: string;
}

export interface AuthorizedResearchMissionInput {
  readonly claims: readonly AuthorizedResearchClaimRequest[];
  readonly maxBytesPerSource: number;
  readonly maxRedirects: number;
  readonly missionId: string;
  readonly packs: readonly AuthorizedResearchPackPlan[];
  readonly targets: readonly AuthorizedResearchTarget[];
  readonly timeoutMs: number;
}

export interface ExtractedResearchFact {
  readonly claimId: string;
  readonly excerpt: string;
  readonly statement: string;
  readonly status: "CONTESTED" | "INSUFFICIENT" | "SUPPORTED";
}

export interface ResearchAcquisitionSnapshot {
  readonly acquiredAt: string;
  readonly actorId: string;
  readonly attribution: {
    readonly authorOrPublisher: string;
    readonly origin: "PAGE_METADATA" | "SOURCE_REGISTRY";
  };
  readonly byteLength: number;
  readonly contentPublishedAt?: string;
  readonly contentText: string;
  readonly contentType: "application/json" | "text/csv" | "text/html" | "text/plain" | "text/xml";
  readonly evidenceId: string;
  readonly extractedFacts: readonly ExtractedResearchFact[];
  readonly extractedTables: readonly (readonly (readonly string[])[])[];
  readonly finalUrl: string;
  readonly fingerprint: string;
  readonly limitations: readonly string[];
  readonly missionId: string;
  readonly redirectChain: readonly string[];
  readonly requestedUrl: string;
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly workspaceId: string;
}

export interface AuthorizedResearchClaimResult {
  readonly claimId: string;
  readonly evidenceIds: readonly string[];
  readonly independentSourceCount: number;
  readonly requiredSourceCount: 1 | 2;
  readonly status: EvidenceStatus;
  readonly statement: string;
}

export interface AuthorizedResearchMission {
  readonly actorId: string;
  readonly blockers: readonly string[];
  readonly claimResults: readonly AuthorizedResearchClaimResult[];
  readonly contractVersion: typeof AUTHORIZED_RESEARCH_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly evidenceIds: readonly string[];
  readonly input: AuthorizedResearchMissionInput;
  readonly inputFingerprint: string;
  readonly packIds: readonly string[];
  readonly snapshotIds: readonly string[];
  readonly status: "BLOCKED" | "READY" | "RUNNING";
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface RestrictedHttpsAcquisition {
  readonly body: string;
  readonly byteLength: number;
  readonly contentType: ResearchAcquisitionSnapshot["contentType"];
  readonly finalUrl: string;
  readonly lastModified?: string;
  readonly redirectChain: readonly string[];
}
