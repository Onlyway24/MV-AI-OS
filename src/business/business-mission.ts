export const BUSINESS_MISSION_CONTRACT_VERSION = "1" as const;

export const BUSINESS_SCORE_CRITERIA = Object.freeze([
  "VERIFIED_DEMAND",
  "VALIDATION_SPEED",
  "CAPITAL_EFFICIENCY",
  "MARGIN_POTENTIAL",
  "CUSTOMER_ACCESS",
  "FABIO_ADVANTAGE",
  "RISK_CONTROL",
] as const);

export type BusinessScoreCriterion = typeof BUSINESS_SCORE_CRITERIA[number];
export type BusinessDataKind = "ASSUMPTION" | "ESTIMATE" | "MISSING" | "REAL";
export type BusinessConfidence = "HIGH" | "LOW" | "MEDIUM" | "NONE";
export type BusinessRiskTolerance = "HIGH" | "LOW" | "MEDIUM";
export type BusinessMissionStatus = "APPROVED" | "BLOCKED" | "PENDING_FABIO_APPROVAL" | "REJECTED" | "REVISION_REQUESTED";
export type BusinessReviewDecision = "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

export interface BusinessMissionDefinition {
  readonly assets: readonly string[];
  readonly availableDays: number;
  readonly competencies: readonly string[];
  readonly customerModel: "B2B" | "B2C" | "BOTH";
  readonly forbiddenActions: readonly string[];
  readonly geography: string;
  readonly maxCapitalCents: number;
  readonly minimumThresholds: {
    readonly maxValidationDays: number;
    readonly minGrossMarginBps: number;
    readonly minOpportunityScore: number;
  };
  readonly missionId: string;
  readonly objective: string;
  readonly revenueModels: readonly string[];
  readonly riskTolerance: BusinessRiskTolerance;
}

export interface BusinessCriterionInput {
  readonly confidence: BusinessConfidence;
  readonly criterion: BusinessScoreCriterion;
  readonly dataKind: BusinessDataKind;
  readonly evidenceId?: string;
  readonly formula: string;
  readonly value?: number;
}

export interface BusinessOpportunityCandidate {
  readonly assumptions: readonly string[];
  readonly capitalRequiredCents: number;
  readonly competition: string;
  readonly customer: string;
  readonly demand: string;
  readonly entryBarrier: string;
  readonly evidencePackId: string;
  readonly marginPotentialBps: number;
  readonly missingInformation: readonly string[];
  readonly operationalComplexity: "HIGH" | "LOW" | "MEDIUM";
  readonly opportunityId: string;
  readonly problem: string;
  readonly risk: "HIGH" | "LOW" | "MEDIUM";
  readonly scoreInputs: readonly BusinessCriterionInput[];
  readonly title: string;
  readonly validationSpeedDays: number;
}

export interface BusinessOfferDesign {
  readonly bonuses: readonly string[];
  readonly customerExclusions: readonly string[];
  readonly differentiation: string;
  readonly deliverables: readonly string[];
  readonly guarantee: string;
  readonly idealCustomer: string;
  readonly limits: readonly string[];
  readonly mechanism: string;
  readonly objections: readonly { readonly objection: string; readonly response: string }[];
  readonly opportunityId: string;
  readonly positioning: string;
  readonly primaryProblem: string;
  readonly promisedOutcome: string;
  readonly tiers: readonly {
    readonly deliverables: readonly string[];
    readonly name: string;
    readonly priceCents?: number;
  }[];
}

export interface BusinessEconomicsValueProvenance {
  readonly dataKind: Exclude<BusinessDataKind, "MISSING">;
  readonly evidenceId?: string;
  readonly field: keyof Omit<BusinessEconomicsScenarioInput, "name" | "provenance">;
  readonly note: string;
}

export interface BusinessEconomicsScenarioInput {
  readonly acquisitionCostCents?: number;
  readonly conversionRateBps?: number;
  readonly deliveryCostCents?: number;
  readonly fixedCostsCents?: number;
  readonly hourlyCostCents?: number;
  readonly humanHoursPerClient?: number;
  readonly monthlyVolume?: number;
  readonly name: "AMBITIOUS" | "BASE" | "PRUDENT";
  readonly priceCents?: number;
  readonly provenance: readonly BusinessEconomicsValueProvenance[];
  readonly refundRateBps?: number;
  readonly taxRateBps?: number;
  readonly toolCostsCents?: number;
}

export interface BusinessCalculatedValue {
  readonly formula: string;
  readonly value?: number;
  readonly status: "CALCULATED" | "NOT_AVAILABLE";
}

export interface BusinessEconomicsScenario {
  readonly breakEvenClients: BusinessCalculatedValue;
  readonly contributionMarginCents: BusinessCalculatedValue;
  readonly fixedCostsCents: BusinessCalculatedValue;
  readonly grossMarginCents: BusinessCalculatedValue;
  readonly maximumSustainableCacCents: BusinessCalculatedValue;
  readonly name: BusinessEconomicsScenarioInput["name"];
  readonly netRevenueCents: BusinessCalculatedValue;
  readonly paybackMonths: BusinessCalculatedValue;
  readonly revenueCents: BusinessCalculatedValue;
  readonly sensitivity: readonly string[];
  readonly variableCostsCents: BusinessCalculatedValue;
}

export interface BusinessValidationExperiment {
  readonly assetNeeded: string;
  readonly authorizationRequired: boolean;
  readonly audience: string;
  readonly durationDays: number;
  readonly experimentId: string;
  readonly hypothesis: string;
  readonly maxCostCents: number;
  readonly method: "CONTENT_CTA" | "INTERVIEWS" | "LANDING_PAGE" | "MANUAL_OUTREACH" | "PILOT_PROPOSAL" | "PREORDER" | "SIMULATED_CAMPAIGN" | "WAITLIST" | "PRICE_TEST";
  readonly minimumThreshold: string;
  readonly nextDecision: string;
  readonly primaryMetric: string;
  readonly sampleSize: number;
  readonly stopCondition: string;
}

export interface BusinessAcquisitionPlan {
  readonly channels: readonly { readonly channel: string; readonly message: string; readonly priority: number }[];
  readonly emailSequence: readonly { readonly body: string; readonly subject: string }[];
  readonly faq: readonly { readonly answer: string; readonly question: string }[];
  readonly landingCopy: { readonly callToAction: string; readonly headline: string; readonly proof: string; readonly subheadline: string };
  readonly outreachScript: string;
  readonly socialSupport: readonly string[];
}

export interface BusinessCommercialPlan {
  readonly acquisition: BusinessAcquisitionPlan;
  readonly economics: readonly BusinessEconomicsScenarioInput[];
  readonly offer: BusinessOfferDesign;
  readonly validation: readonly BusinessValidationExperiment[];
}

export interface BusinessMissionExecutionInput {
  readonly candidates: readonly BusinessOpportunityCandidate[];
  readonly commercialPlan: BusinessCommercialPlan;
  readonly mission: BusinessMissionDefinition;
}

export interface BusinessCriterionScore extends BusinessCriterionInput {
  readonly weight: number;
  readonly weightedContribution?: number;
}

export interface BusinessOpportunityScorecard {
  readonly complete: boolean;
  readonly confidenceAdjustedScore?: number;
  readonly criteria: readonly BusinessCriterionScore[];
  readonly evidencePackFingerprint: string;
  readonly evidencePackId: string;
  readonly opportunityId: string;
  readonly totalScore?: number;
}

export interface BusinessArtifact {
  readonly agent: "artifact-producer@1.0.0";
  readonly approvalStatus: "PENDING";
  readonly artifactId: string;
  readonly content: string;
  readonly evidencePackIds: readonly string[];
  readonly fingerprint: string;
  readonly kind: "ECONOMICS_SHEET" | "EMAIL_SEQUENCE" | "FAQ" | "LANDING_COPY" | "OFFER_DOCUMENT" | "OPPORTUNITY_REPORT" | "OUTREACH_SCRIPT" | "PRESENTATION" | "SOCIAL_SUPPORT" | "VALIDATION_PLAN";
  readonly mediaType: "application/json" | "text/csv" | "text/html" | "text/markdown" | "text/plain";
  readonly missionId: string;
  readonly opportunityId: string;
  readonly reviewStatus: "PENDING";
  readonly version: 0;
}

export interface BusinessGate {
  readonly findings: readonly string[];
  readonly name: "COST" | "QUALITY" | "RISK";
  readonly score: number;
  readonly status: "BLOCKED" | "PASSED";
}

export interface BusinessMissionReview {
  readonly decision: BusinessReviewDecision;
  readonly note: string;
  readonly reviewedAt: string;
  readonly reviewedBy: string;
}

export interface BusinessMissionDossier {
  readonly actorId: string;
  readonly artifacts: readonly BusinessArtifact[];
  readonly candidates: readonly BusinessOpportunityCandidate[];
  readonly commercialPlan: BusinessCommercialPlan;
  readonly contractVersion: typeof BUSINESS_MISSION_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly economics: readonly BusinessEconomicsScenario[];
  readonly evidencePackIds: readonly string[];
  readonly externalActionsExecuted: false;
  readonly fingerprint: string;
  readonly gates: readonly BusinessGate[];
  readonly mission: BusinessMissionDefinition;
  readonly review?: BusinessMissionReview;
  readonly scorecards: readonly BusinessOpportunityScorecard[];
  readonly selectedOpportunityId?: string;
  readonly selectionExplanation: string;
  readonly status: BusinessMissionStatus;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface BusinessMissionReviewRequest {
  readonly decision: BusinessReviewDecision;
  readonly expectedVersion: number;
  readonly missionId: string;
  readonly note: string;
}
