import type { ContentProductionObjective } from "../content-production/metodo-veloce-content-production.js";

export const ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION = "1" as const;

export const ORACLE_CREATIVE_DELIVERABLES = Object.freeze([
  "CAROUSEL",
  "INSTAGRAM_COPY",
  "TIKTOK_VIDEO_BLUEPRINT",
  "IMAGE_MASTER",
  "VIDEO_RENDER",
] as const);

/** The current deterministic FORGE line persists this complete local bundle. */
export const ORACLE_LOCAL_CONTENT_BUNDLE = Object.freeze([
  "CAROUSEL",
  "INSTAGRAM_COPY",
  "TIKTOK_VIDEO_BLUEPRINT",
] as const);

export type OracleCreativeDeliverable = typeof ORACLE_CREATIVE_DELIVERABLES[number];
export type OracleCreativePlatform = "instagram" | "tiktok";
export type OracleCreativeReasonCode =
  | "BUSINESS_GATES_NOT_PASSED"
  | "BUSINESS_MISSION_NOT_APPROVED"
  | "BUSINESS_MISSION_REQUIRED"
  | "BUSINESS_OPPORTUNITY_NOT_SELECTED"
  | "FORGE_BRIEF_INVALID"
  | "ORACLE_EVIDENCE_FINGERPRINT_MISMATCH"
  | "ORACLE_EVIDENCE_REQUIRED"
  | "ORACLE_EVIDENCE_SET_INVALID"
  | "ORACLE_EVIDENCE_STALE"
  | "READY_FOR_DRAFT_CONFIRMATION"
  | "SUPPORTED_LOCAL_DELIVERABLE_REQUIRED";

export interface OracleCreativePromptRequest {
  readonly businessMissionId: string;
  readonly contractVersion: typeof ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION;
  readonly deliverables: readonly OracleCreativeDeliverable[];
  readonly objective: ContentProductionObjective;
  readonly platforms: readonly OracleCreativePlatform[];
  readonly prompt: string;
  readonly promptId: string;
}

export interface OracleCreativeAgentStage {
  readonly agentId: "business-agent" | "content-director" | "content-producer" | "onlyway-assistant" | "research-agent";
  readonly callSign: "FORGE" | "NEXUS" | "ORACLE" | "PRISM" | "VECTOR";
  readonly reasonCode: string;
  readonly status: "AWAITING_FABIO" | "BLOCKED" | "COMPLETED" | "IDLE" | "QUEUED" | "RUNNING";
}

export interface OracleCreativeCapability {
  readonly deliverable: OracleCreativeDeliverable;
  readonly providerCalls: 0;
  readonly reasonCode: "IMAGE_GENERATION_SEPARATE_AUTHORIZATION_REQUIRED" | "LOCAL_GENERATION_READY" | "VIDEO_PROVIDER_NOT_CONFIGURED";
  readonly status: "DISABLED_PROVIDER_NOT_CONFIGURED" | "READY_LOCAL" | "SEPARATE_AUTHORIZATION_REQUIRED";
}

export interface OracleCreativePromptProposal {
  readonly businessMission?: {
    readonly dossierFingerprint: string;
    readonly missionId: string;
    readonly selectedOpportunityId: string;
    readonly version: number;
  };
  readonly canConfirm: boolean;
  readonly capabilities: readonly OracleCreativeCapability[];
  readonly confirmationToken: string;
  readonly contractVersion: typeof ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION;
  readonly estimatedCostUsd: 0;
  readonly evidencePacks: readonly {
    readonly fingerprint: string;
    readonly minFreshnessExpiresAt: string;
    readonly packId: string;
    readonly selectedForContent: boolean;
  }[];
  readonly expiresAt: string;
  readonly externalActionsAllowed: false;
  readonly productionId: string;
  readonly promptFingerprint: string;
  readonly promptId: string;
  readonly proposalFingerprint: string;
  readonly proposalId: string;
  readonly providerCalls: 0;
  readonly publication: "LOCKED";
  readonly reasonCode: OracleCreativeReasonCode;
  readonly route: readonly OracleCreativeAgentStage[];
  readonly status: "BLOCKED" | "READY_TO_CREATE_DRAFT";
}

export interface OracleCreativePromptConfirmation {
  readonly confirmationToken: string;
  readonly contractVersion: typeof ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION;
  readonly prompt: string;
  readonly promptFingerprint: string;
  readonly proposalFingerprint: string;
  readonly proposalId: string;
}

export interface OracleCreativePromptReceipt {
  readonly businessMission: NonNullable<OracleCreativePromptProposal["businessMission"]>;
  readonly commandId: string;
  readonly completedDeliverables: readonly OracleCreativeDeliverable[];
  readonly contractVersion: typeof ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION;
  readonly deferredDeliverables: readonly OracleCreativeCapability[];
  readonly estimatedCostUsd: 0;
  readonly externalActionsAllowed: false;
  readonly evidencePacks: OracleCreativePromptProposal["evidencePacks"];
  readonly gates: {
    readonly cost: "PASS";
    readonly quality: "BLOCKED" | "PASS";
    readonly risk: "BLOCKED" | "PASS";
    readonly visual: "NOT_RUN_RENDERED_MEDIA_REQUIRED";
  };
  readonly packageFingerprint: string;
  readonly generationContextFingerprint: string;
  readonly productionId: string;
  readonly promptFingerprint: string;
  readonly providerCalls: 0;
  readonly publication: "LOCKED";
  readonly reasonCode: "CONTENT_RISK_GATE_BLOCKED" | "READY_FOR_FABIO_REVIEW";
  readonly replayed: boolean;
  readonly route: readonly OracleCreativeAgentStage[];
  readonly status: "BLOCKED" | "READY_FOR_FABIO_REVIEW";
  readonly unauthorizedExternalEffectOccurred: false;
}
