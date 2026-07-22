import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { QualityGuardianReport } from "../guardians/quality-guardian.js";
import type { SocialPublishingPack } from "../social-intelligence/metodo-veloce-social-intelligence.js";

export const METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION = "1" as const;

export type ContentProductionObjective = "educate" | "engage" | "lead_generation" | "soft_sell";
export type ContentProductionRiskStatus = "BLOCKED" | "CLEAR";
export type ContentProductionStatus = "BLOCKED" | "READY_FOR_FABIO_APPROVAL";

export interface ContentEvidence {
  readonly evidenceId: string;
  readonly limitations?: readonly string[];
  readonly sourceRef: string;
  readonly statement: string;
}

export interface MetodoVeloceContentProductionBrief {
  readonly callToAction: string;
  readonly contractVersion: RequestContractVersion;
  readonly audience: string;
  readonly evidence: readonly ContentEvidence[];
  readonly language: "it";
  readonly missionReference: string;
  readonly objective: ContentProductionObjective;
  readonly offer: string;
  readonly productionId: string;
  readonly topic: string;
}

export interface ContentCarouselSlide {
  readonly body: string;
  readonly slide: number;
  readonly title: string;
}

export interface ContentShortFormBeat {
  readonly beat: number;
  readonly onScreenText: string;
  readonly spokenText: string;
}

export interface MetodoVeloceContentAssets {
  readonly carousel: readonly ContentCarouselSlide[];
  readonly instagram: { readonly caption: string; readonly firstLine: string; readonly hashtags: readonly string[] };
  readonly tiktok: { readonly beats: readonly ContentShortFormBeat[]; readonly durationSeconds: 35; readonly hook: string; readonly caption: string };
  readonly variants: { readonly instagramOpeners: readonly string[]; readonly tiktokHooks: readonly string[] };
}

export interface MetodoVeloceContentProductionPackage {
  readonly approval: { readonly required: true; readonly status: "NOT_ELIGIBLE" | "PENDING_FABIO" };
  readonly contractVersion: RequestContractVersion;
  readonly editorialPlan: { readonly angle: string; readonly audience: string; readonly objective: ContentProductionObjective; readonly selectedIdea: string };
  readonly evidence: { readonly items: readonly ContentEvidence[]; readonly limitations: readonly string[] };
  readonly externalActionsAllowed: false;
  readonly generatedAt: string;
  readonly metrics: { readonly measures: readonly string[]; readonly reviewCadence: "weekly" };
  readonly missionReference: string;
  readonly productionId: string;
  readonly quality: { readonly report: QualityGuardianReport; readonly readinessScore: number };
  readonly risk: { readonly findings: readonly string[]; readonly status: ContentProductionRiskStatus };
  readonly status: ContentProductionStatus;
  readonly version: 1;
  readonly assets?: MetodoVeloceContentAssets;
  readonly socialPublishingPack?: SocialPublishingPack;
}
