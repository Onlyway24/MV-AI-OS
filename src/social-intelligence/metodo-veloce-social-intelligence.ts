import type { ContentCarouselSlide } from "../content-production/metodo-veloce-content-production.js";

export const METODO_VELOCE_SOCIAL_INTELLIGENCE_CONTRACT_VERSION = "1" as const;

export const SOCIAL_OPPORTUNITY_CRITERIA = Object.freeze([
  "AUDIENCE_DEMAND",
  "TREND_VELOCITY",
  "BRAND_FIT",
  "PRACTICAL_VALUE",
  "CONVERSION_POTENTIAL",
  "EVIDENCE_STRENGTH",
  "COMPETITOR_GAP",
  "DISTINCTIVENESS",
  "PRODUCTION_FEASIBILITY",
  "FRESHNESS",
  "CLAIM_SAFETY",
  "FATIGUE_RESILIENCE",
] as const);

export type SocialOpportunityCriterion = typeof SOCIAL_OPPORTUNITY_CRITERIA[number];
export type SocialDataKind = "ASSUMPTION" | "EVIDENCE" | "MEASURED" | "MISSING";
export type SocialPlatform = "INSTAGRAM" | "TIKTOK";
export type SocialTrendPhase = "EMERGENTE" | "IN_CALO" | "IN_CRESCITA" | "NON_CLASSIFICATO" | "PICCO" | "SATURO" | "SCADUTO";
export type SocialOpportunityDecision = "CALENDARIO" | "ENTRO_24_ORE" | "PRODURRE_ORA" | "RICHIEDE_RICERCA" | "SCARTARE";
export type SocialPublishingPackStatus = "BLOCKED" | "READY_FOR_FABIO_APPROVAL" | "REQUIRES_RESEARCH";

export interface SocialSignalProvenance {
  readonly dataKind: SocialDataKind;
  readonly evidenceId?: string;
  readonly note: string;
  readonly observedAt: string;
  readonly sourceId?: string;
}

export interface SocialOpportunityCriterionInput extends SocialSignalProvenance {
  readonly criterion: SocialOpportunityCriterion;
  readonly value?: number;
}

export interface SocialTrendSignal {
  readonly expiresAt: string;
  readonly phrase: string;
  readonly phase: SocialTrendPhase;
  readonly provenance: readonly SocialSignalProvenance[];
  readonly publishBy: string;
}

export interface SocialAudienceSignal extends SocialSignalProvenance {
  readonly intent: "ACQUISTO" | "APPRENDIMENTO" | "CONFRONTO" | "PROBLEMA";
  readonly query: string;
  readonly strength?: number;
}

export interface SocialCompetitorSignal extends SocialSignalProvenance {
  readonly authorized: boolean;
  readonly competitorId: string;
  readonly format: string;
  readonly observedGap: string;
}

export interface SocialHashtagCandidate extends SocialSignalProvenance {
  readonly cluster: "BRAND" | "EXPERIMENTAL" | "NICHE" | "TOPIC";
  readonly expiresAt?: string;
  readonly relevance: number;
  readonly saturation?: number;
  readonly tag: string;
}

export interface SocialAudioCandidate extends SocialSignalProvenance {
  readonly accountAvailable: boolean;
  readonly audioId: string;
  readonly expiresAt?: string;
  readonly rightsStatus: "COMMERCIAL_ALLOWED" | "NOT_AUTHORIZED" | "UNKNOWN";
  readonly title: string;
}

export interface SocialPublicationWindowCandidate extends SocialSignalProvenance {
  readonly endAt: string;
  readonly label: string;
  readonly startAt: string;
}

export interface SocialSchedulingInput {
  readonly audienceSampleCount: number;
  readonly candidateWindows: readonly SocialPublicationWindowCandidate[];
  readonly historicalPostCount: number;
}

export interface SocialRecentContent {
  readonly format: string;
  readonly hookPattern: string;
  readonly publishedAt?: string;
  readonly topic: string;
  readonly visualPattern: string;
}

export interface SocialBrandCheck {
  readonly component: "CTA" | "FONT" | "LOGO" | "PALETTE" | "STRUCTURE" | "TONE" | "VISUAL_DIRECTION";
  readonly score: number;
}

export interface SocialConversionIntent {
  readonly commercialStep: string;
  readonly doNext: string;
  readonly feel: string;
  readonly understand: string;
}

export interface SocialCulturalRisk {
  readonly category: "AMBIGUOUS_LANGUAGE" | "CLAIM" | "CULTURAL" | "IMAGE" | "MEME" | "REPUTATION";
  readonly description: string;
  readonly evidenceId?: string;
  readonly severity: "HIGH" | "LOW" | "MEDIUM";
}

export interface MetodoVeloceSocialIntelligenceRequest {
  readonly audienceSignals: readonly SocialAudienceSignal[];
  readonly audioCandidates: readonly SocialAudioCandidate[];
  readonly brandChecks: readonly SocialBrandCheck[];
  readonly competitorSignals: readonly SocialCompetitorSignal[];
  readonly contractVersion: typeof METODO_VELOCE_SOCIAL_INTELLIGENCE_CONTRACT_VERSION;
  readonly conversionIntent: SocialConversionIntent;
  readonly criterionInputs: readonly SocialOpportunityCriterionInput[];
  readonly culturalRisks: readonly SocialCulturalRisk[];
  readonly hashtagCandidates: readonly SocialHashtagCandidate[];
  readonly mode: "EVERGREEN" | "TREND_REACTIVE";
  readonly observedAt: string;
  readonly platforms: readonly SocialPlatform[];
  readonly portfolioRole: "AUTHORITY" | "COMMUNITY" | "CONVERSION" | "DISCOVERY" | "RETENTION";
  readonly productionId: string;
  readonly recentContents: readonly SocialRecentContent[];
  readonly scheduling: SocialSchedulingInput;
  readonly topic: string;
  readonly trend?: SocialTrendSignal;
}

export interface SocialOpportunityCriterionResult extends SocialOpportunityCriterionInput {
  readonly confidenceFactor: number;
  readonly weight: number;
  readonly weightedContribution?: number;
}

export interface SocialMetricSnapshotDefinition {
  readonly metrics: readonly string[];
  readonly status: "AWAITING_REAL_IMPORT";
  readonly window: "2H" | "7D" | "24H" | "30M" | "72H";
}

export interface SocialPublishingPack {
  readonly abTest: {
    readonly control: string;
    readonly hypothesis: string;
    readonly measurementWindow: "24H";
    readonly primaryMetric: string;
    readonly variable: "CTA" | "HOOK" | "VISUAL_OPENING";
    readonly variant: string;
  };
  readonly audienceDemand: {
    readonly intents: readonly string[];
    readonly provenance: readonly SocialSignalProvenance[];
    readonly status: "INSUFFICIENT_DATA" | "VERIFIED";
  };
  readonly audioPlan: {
    readonly selected?: { readonly audioId: string; readonly title: string };
    readonly status: "AUDIO_AUTORIZZATO" | "AUDIO_NON_AUTORIZZATO" | "NESSUN_AUDIO_SELEZIONATO";
    readonly unauthorized: readonly string[];
  };
  readonly approvalScope: {
    readonly consequences: readonly string[];
    readonly invalidatedByAnyChange: true;
    readonly publicationAuthorized: false;
    readonly schedulingAuthorized: false;
    readonly scope: "INTERNAL_PACKAGE_ONLY";
  };
  readonly blockingReasons: readonly string[];
  readonly brandDistinctiveness: { readonly score: number; readonly status: "DISTINCTIVE" | "REMEDIATE" };
  readonly carousel: readonly ContentCarouselSlide[];
  readonly competitorGap: {
    readonly authorizedCompetitors: number;
    readonly gaps: readonly string[];
    readonly status: "INSUFFICIENT_DATA" | "VERIFIED";
  };
  readonly contractVersion: typeof METODO_VELOCE_SOCIAL_INTELLIGENCE_CONTRACT_VERSION;
  readonly conversionIntent: SocialConversionIntent;
  readonly culturalRisk: { readonly findings: readonly SocialCulturalRisk[]; readonly status: "BLOCKED" | "CLEAR" };
  readonly decision: SocialOpportunityDecision;
  readonly externalActionsAllowed: false;
  readonly fatigue: { readonly repeatedSignals: readonly string[]; readonly score: number; readonly status: "FRESH" | "HIGH" | "WATCH" };
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly hashtagSets: {
    readonly alternate: readonly string[];
    readonly experimental: readonly string[];
    readonly main: readonly string[];
    readonly status: "INSUFFICIENT_DATA" | "VERIFIED";
  };
  readonly measurement: {
    readonly nextDecision: string;
    readonly snapshots: readonly SocialMetricSnapshotDefinition[];
  };
  readonly masterContentPack: {
    readonly brandInvariants: readonly ["TOPIC", "IDENTITY", "LOGO", "MESSAGE", "TYPOGRAPHY", "PALETTE", "CTA"];
    readonly fingerprint: string;
    readonly nativeVariants: {
      readonly instagram: SocialNativeContentVariant;
      readonly tiktok: SocialNativeContentVariant;
    };
    readonly reelIncluded: false;
    readonly reelOmissionReason: string;
    readonly slideCount: 6;
    readonly topic: string;
  };
  readonly opportunity: {
    readonly completeness: number;
    readonly criteria: readonly SocialOpportunityCriterionResult[];
    readonly score?: number;
  };
  readonly portfolioRole: MetodoVeloceSocialIntelligenceRequest["portfolioRole"];
  readonly productionId: string;
  readonly publicationWindows: {
    readonly mode: "DYNAMIC" | "EXPERIMENTAL";
    readonly status: "DATA_SUFFICIENT" | "DATI_INSUFFICIENTI";
    readonly testPlan?: string;
    readonly windows: readonly { readonly endAt: string; readonly label: string; readonly startAt: string }[];
  };
  readonly sequence: readonly {
    readonly callToAction: string;
    readonly position: number;
    readonly role: "CASO_PRATICO" | "CHECKLIST" | "CTA_OFFERTA" | "ERRORI" | "METODO" | "PROBLEMA";
  }[];
  readonly socialSeo: {
    readonly captionKeywords: readonly string[];
    readonly onScreenPhrases: readonly string[];
    readonly searchIntent: string;
  };
  readonly status: SocialPublishingPackStatus;
  readonly trendAnalysis: {
    readonly expiresAt?: string;
    readonly phase: SocialTrendPhase | "NESSUN_TREND";
    readonly publishBy?: string;
    readonly status: "ACTIVE" | "EXPIRED" | "NOT_PROVIDED";
  };
  readonly visualDirection: {
    readonly aspectRatio: "4:5";
    readonly brandSignature: string;
    readonly canvas: "1080x1350";
    readonly imageStyle: "ULTRAREALISTIC_CINEMATIC";
    readonly palette: readonly ["#050505", "#FFD400", "#F7F7F4"];
    readonly slidePrompts: readonly string[];
  };
}

export interface SocialNativeContentVariant {
  readonly aspectRatio: "4:5" | "9:16";
  readonly audio: {
    readonly fallback: "AUDIO_ORIGINALE_METODO_VELOCE_O_NESSUN_AUDIO" | "NON_APPLICABILE";
    readonly status: "AUDIO_AUTORIZZATO" | "AUDIO_NON_AUTORIZZATO" | "NESSUN_AUDIO_SELEZIONATO" | "NON_APPLICABILE";
  };
  readonly canvas: "1080x1350" | "1080x1920";
  readonly caption: string;
  readonly cta: string;
  readonly format: "CAROUSEL" | "SLIDESHOW";
  readonly hashtagSets: SocialPublishingPack["hashtagSets"];
  readonly platform: SocialPlatform;
  readonly publicationWindowLabels: readonly string[];
  readonly slides: readonly {
    readonly body: string;
    readonly layoutInstruction: string;
    readonly slide: number;
    readonly title: string;
  }[];
}
