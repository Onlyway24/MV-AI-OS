export const SOCIAL_INTELLIGENCE_LIVE_CONTRACT_VERSION = "1" as const;

export type SocialLivePlatform = "INSTAGRAM" | "TIKTOK";
export type SocialLiveRecordKind = "ACCOUNT" | "ANALYTICS" | "AUDIO_RIGHTS" | "COMPETITOR" | "COMPETITOR_OBSERVATION" | "COMPETITOR_PACK" | "EXPERIMENT" | "TREND";

interface SocialLiveRecordBase {
  readonly actorId: string;
  readonly contractVersion: typeof SOCIAL_INTELLIGENCE_LIVE_CONTRACT_VERSION;
  readonly fingerprint: string;
  readonly importedAt: string;
  readonly kind: SocialLiveRecordKind;
  readonly recordId: string;
  readonly workspaceId: string;
}

export interface SocialAccountRecord extends SocialLiveRecordBase {
  readonly accountRef: string;
  readonly country: string;
  readonly kind: "ACCOUNT";
  readonly ownership: "OWNED";
  readonly platform: SocialLivePlatform;
  readonly publicFollowers?: number;
  readonly publicObservedAt?: string;
  readonly publicVisibleContentCount?: number;
}

export interface SocialTrendObservation extends SocialLiveRecordBase {
  readonly approximateTraffic?: string;
  readonly audience: string;
  readonly classificationEvidenceRecordIds?: readonly string[];
  readonly classificationRationale?: string;
  readonly classifiedAt?: string;
  readonly classifiedBy?: string;
  readonly compatibility?: "COMPATIBLE" | "INCOMPATIBLE" | "UNCLASSIFIED";
  readonly expiresAt: string;
  readonly keyword: string;
  readonly kind: "TREND";
  readonly observedAt: string;
  readonly phase: "UNCLASSIFIED" | "EMERGING" | "DECLINING" | "GROWING" | "PEAK" | "SATURATED";
  readonly platform: SocialLivePlatform | "GOOGLE_TRENDS";
  readonly publishedAt?: string;
  readonly saturation?: number;
  readonly sourceId: string;
  readonly sourceByteLength?: number;
  readonly sourceContentHash?: string;
  readonly sourceFinalUrl?: string;
  readonly territory: string;
  readonly velocity?: number;
}

export interface SocialAnalyticsMetrics {
  readonly carouselCompletions?: number;
  readonly comments?: number;
  readonly followersGained?: number;
  readonly profileVisits?: number;
  readonly reach?: number;
  readonly saves?: number;
  readonly shares?: number;
  readonly slideDropOff?: readonly number[];
  readonly views?: number;
}

export interface SocialAnalyticsSnapshot extends SocialLiveRecordBase {
  readonly accountRecordId: string;
  readonly capturedAt: string;
  readonly contentId: string;
  readonly correctionOfRecordId?: string;
  readonly format: string;
  readonly kind: "ANALYTICS";
  readonly metrics: SocialAnalyticsMetrics;
  readonly platform: SocialLivePlatform;
  readonly publishedAt: string;
  readonly sourceId: string;
}

export interface AuthorizedCompetitorRecord extends SocialLiveRecordBase {
  readonly accountRef: string;
  readonly authorizedAt: string;
  readonly authorizedBy: string;
  readonly categories: readonly string[];
  readonly kind: "COMPETITOR";
  readonly platform: SocialLivePlatform;
  readonly publicObservationOnly: true;
  readonly replacementReason?: string;
  readonly replacesCompetitorRecordId?: string;
  readonly status: "AUTHORIZED" | "REVOKED";
}

export interface CompetitorObservation extends SocialLiveRecordBase {
  readonly audio?: string;
  readonly callToAction: string;
  readonly competitorRecordId: string;
  readonly coverPattern: string;
  readonly editorialGap: string;
  readonly format: string;
  readonly frequency: string;
  readonly hashtags: readonly string[];
  readonly hook: string;
  readonly kind: "COMPETITOR_OBSERVATION";
  readonly observedAt: string;
  readonly repetitions: readonly string[];
  readonly sourceId: string;
  readonly sourceContentHash?: string;
  readonly sourceExcerpt?: string;
  readonly sourceUrl?: string;
  readonly topics: readonly string[];
  readonly visibleEngagement?: number;
}

export interface SocialAudioRightsObservation extends SocialLiveRecordBase {
  readonly accountRef: string;
  readonly accountCompatibility: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
  readonly audioId: string;
  readonly available: boolean;
  readonly commercialUse: "ALLOWED" | "NOT_AUTHORIZED" | "UNKNOWN";
  readonly country: string;
  readonly expiresAt: string;
  readonly kind: "AUDIO_RIGHTS";
  readonly mood: string;
  readonly observedAt: string;
  readonly platform: SocialLivePlatform;
  readonly saturation?: number;
  readonly sourceId: string;
  readonly title: string;
}

export interface SocialPublicationExperiment extends SocialLiveRecordBase {
  readonly arms: readonly [
    { readonly label: "FASCIA_SERALE"; readonly publicationAt?: string },
    { readonly label: "FASCIA_PRANZO"; readonly publicationAt?: string },
  ];
  readonly contentTheme: string;
  readonly hypothesis: string;
  readonly invariants: readonly ["FORMAT", "STYLE", "CTA", "QUALITY"];
  readonly kind: "EXPERIMENT";
  readonly metrics: readonly ["SAVES_PER_REACH", "SHARES_PER_REACH", "PROFILE_VISITS_PER_REACH", "CAROUSEL_COMPLETION"];
  readonly primaryVariable: "PUBLICATION_WINDOW";
  readonly status: "AWAITING_FABIO_PARAMETERS" | "READY_FOR_INTERNAL_SCHEDULING";
}

export interface CompetitorIntelligencePackRecord extends SocialLiveRecordBase {
  readonly kind: "COMPETITOR_PACK";
  readonly pack: CompetitorIntelligencePack;
}

export type SocialLiveRecord = SocialAccountRecord | SocialAnalyticsSnapshot | SocialAudioRightsObservation | AuthorizedCompetitorRecord | CompetitorObservation | CompetitorIntelligencePackRecord | SocialPublicationExperiment | SocialTrendObservation;

export interface SocialAccountBaseline {
  readonly accountRecordId?: string;
  readonly postCount: number;
  readonly ratios: {
    readonly profileVisitsPerReach?: number;
    readonly savesPerReach?: number;
    readonly sharesPerReach?: number;
  };
  readonly status: "INSUFFICIENT_DATA" | "MEASURED";
  readonly timingConclusion: "EXPERIMENT_REQUIRED" | "MEASURED_PATTERN_AVAILABLE";
}

export interface CompetitorIntelligenceFinding {
  readonly accountRef: string;
  readonly callToAction: string;
  readonly competitorRecordId: string;
  readonly editorialGap: string;
  readonly format: string;
  readonly frequency: string;
  readonly hook: string;
  readonly observedAt: string;
  readonly observationRecordId: string;
  readonly role: string;
  readonly sourceUrl?: string;
  readonly usable: boolean;
  readonly visibleEngagement?: number;
}

export interface CompetitorIntelligencePack {
  readonly contractVersion: "1";
  readonly copyingAllowed: false;
  readonly coverage: {
    readonly authorizedAccounts: number;
    readonly expectedAccounts: 6;
    readonly observedAccounts: number;
    readonly usableObservations: number;
  };
  readonly externalActionsAllowed: false;
  readonly findings: readonly CompetitorIntelligenceFinding[];
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly nextAction: string;
  readonly opportunityGaps: readonly string[];
  readonly packId: string;
  readonly restrictions: readonly ["NO_COPYING", "NO_OUTREACH", "NO_PROFILE_INTERACTION", "NO_EXTERNAL_ACTIONS"];
  readonly risks: readonly string[];
  readonly sourceRecordIds: readonly string[];
  readonly status: "BLOCKED" | "PARTIAL" | "READY";
  readonly supersedesFingerprint?: string;
  readonly version: number;
}

export interface DailySocialOperationsReport {
  readonly acquisitionReadiness: "NOT_CONFIGURED" | "PARTIAL" | "READY";
  readonly audioAuthorized: number;
  readonly audioNotAuthorized: number;
  readonly baseline: SocialAccountBaseline;
  readonly compatibleTrends: number;
  readonly competitorAccountsAuthorized: number;
  readonly competitorIntelligencePack: CompetitorIntelligencePack;
  readonly competitorIntelligencePackHistory: readonly CompetitorIntelligencePack[];
  readonly competitorObservations: number;
  readonly cycleReadiness: {
    readonly analyticsSnapshots: number;
    readonly audioDecision: "AUDIO_AUTORIZZATO" | "AUDIO_NON_AUTORIZZATO" | "NON_VERIFICATO";
    readonly blockers: readonly string[];
    readonly competitorAccounts: number;
    readonly competitorObservations: number;
    readonly status: "BLOCKED" | "READY_FOR_EVIDENCE_PRODUCTION";
    readonly trendObservations: number;
  };
  readonly decisionsRequired: number;
  readonly experiment?: SocialPublicationExperiment;
  readonly firstPackageReadiness: {
    readonly blockers: readonly string[];
    readonly inputs: {
      readonly analyticsImported: boolean;
      readonly audioLibraryVerified: boolean;
      readonly competitorObservationsComplete: boolean;
      readonly competitorSetAuthorized: boolean;
      readonly compatibleTrendAvailable: boolean;
      readonly trendFeedAcquired: boolean;
    };
    readonly publication: "LOCKED";
    readonly status: "BLOCKED" | "READY_FOR_EVIDENCE_PRODUCTION";
    readonly theme: "5 oggetti in casa che puoi vendere subito — nuova versione evidence-led";
  };
  readonly generatedAt: string;
  readonly missingInputs: readonly string[];
  readonly officialSourcesRegistered: number;
  readonly totalTrends: number;
  readonly unclassifiedTrends: number;
  readonly trendsExpiringWithin24Hours: number;
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface SocialLiveImportBatchRequest {
  readonly batchId: string;
  readonly records: readonly SocialLiveRecord[];
}

export interface SocialLiveImportBatchReceipt {
  readonly batchFingerprint: string;
  readonly batchId: string;
  readonly blockers: readonly string[];
  readonly counts: Readonly<Record<SocialLiveRecordKind, number>>;
  readonly generatedAt: string;
  readonly recordCount: number;
  readonly status: "BLOCKED" | "COMMITTED" | "READY" | "REPLAYED";
  readonly unauthorizedExternalEffectOccurred: false;
}
