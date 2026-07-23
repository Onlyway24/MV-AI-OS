import type { JsonObject } from "../contracts/json.js";

export const VENTURE_HOLDING_CONTRACT_VERSION = "1" as const;
export const VENTURE_STAGES = Object.freeze([
  "DISCOVERED", "RESEARCHING", "EVIDENCE_INSUFFICIENT", "THESIS_READY", "AWAITING_FABIO", "VALIDATION_READY", "VALIDATING", "SIGNAL_POSITIVE", "SIGNAL_NEGATIVE", "LAUNCH_READY", "ACTIVE", "PAUSED", "SCALE_REVIEW", "KILL_REVIEW", "KILLED", "ARCHIVED",
] as const);
export type VentureStage = typeof VENTURE_STAGES[number];

export type VentureAvailability<T> =
  | { readonly status: "AVAILABLE"; readonly value: T; readonly evidenceRefs: readonly string[] }
  | { readonly status: "FOUNDER_INPUT_REQUIRED"; readonly reasonCode: "FOUNDER_INPUT_REQUIRED" }
  | { readonly status: "NOT_AVAILABLE"; readonly reasonCode: "NOT_AVAILABLE" };

export type VentureRiskLevel = "HIGH" | "LOW" | "MEDIUM" | "NOT_AVAILABLE";
export type VentureCustomerModel = "B2B" | "B2C" | "BOTH";
export type VentureApprovalRequirement = "FABIO_EXPLICIT" | "FABIO_VERSION_BOUND";
export type VentureMonetaryAmount = VentureAvailability<string>;

export interface VentureRecordBase {
  readonly actorId: string;
  readonly contractVersion: typeof VENTURE_HOLDING_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface FounderVenturePolicy extends VentureRecordBase {
  readonly policyId: string;
  readonly economicObjective: VentureAvailability<string>;
  readonly maximumDaysToFirstSignal: VentureAvailability<number>;
  readonly maximumCapitalMinorUnits: VentureMonetaryAmount;
  readonly maximumFabioHoursPerWeek: VentureAvailability<string>;
  readonly economicRisk: VentureAvailability<VentureRiskLevel>;
  readonly reputationalRisk: VentureAvailability<VentureRiskLevel>;
  readonly allowedMarkets: VentureAvailability<readonly string[]>;
  readonly forbiddenMarkets: VentureAvailability<readonly string[]>;
  readonly customerModel: VentureAvailability<VentureCustomerModel>;
  readonly allowedRevenueModels: VentureAvailability<readonly string[]>;
  readonly minimumMarginBps: VentureAvailability<number>;
  readonly maximumDeliveryLoad: VentureAvailability<string>;
  readonly maximumFabioDependency: VentureAvailability<string>;
  readonly acceptableAutomation: VentureAvailability<string>;
  readonly evidenceRequirements: VentureAvailability<readonly string[]>;
  readonly killConditions: VentureAvailability<readonly string[]>;
  readonly scaleConditions: VentureAvailability<readonly string[]>;
  readonly approvalRequirements: readonly VentureApprovalRequirement[];
}

export interface VentureInvestmentPolicy { readonly policyId: string; readonly maximumCapitalMinorUnits: VentureMonetaryAmount; readonly minimumMarginBps: VentureAvailability<number>; readonly allowedRevenueModels: VentureAvailability<readonly string[]>; }
export interface VentureApprovalPolicy { readonly policyId: string; readonly requirements: readonly VentureApprovalRequirement[]; readonly staleApprovalRejected: true; }
export interface VentureRiskPolicy { readonly policyId: string; readonly economicRisk: VentureAvailability<VentureRiskLevel>; readonly reputationalRisk: VentureAvailability<VentureRiskLevel>; readonly forbiddenMarkets: VentureAvailability<readonly string[]>; }
export interface VentureCapitalPolicy { readonly policyId: string; readonly currency: VentureAvailability<string>; readonly maximumPortfolioCapitalMinorUnits: VentureMonetaryAmount; readonly spendAuthorization: "NEVER_AUTOMATIC"; }
export interface VentureExperimentPolicy { readonly policyId: string; readonly maximumExperimentBudgetMinorUnits: VentureMonetaryAmount; readonly realObservationRequired: true; readonly externalExecution: "LOCKED"; }
export interface VentureKillPolicy { readonly policyId: string; readonly conditions: VentureAvailability<readonly string[]>; readonly killedVentureCanReopen: false; }
export interface VentureScalePolicy { readonly policyId: string; readonly conditions: VentureAvailability<readonly string[]>; readonly requiresFabio: true; }
export interface VenturePortfolioPolicy { readonly policyId: string; readonly concentrationLimitBps: VentureAvailability<number>; readonly maximumActiveVentures: VentureAvailability<number>; readonly founderCapacity: VentureAvailability<string>; }

export interface VentureOpportunitySource {
  readonly sourceId: string;
  readonly kind: "AUTHORIZED_RESEARCH" | "BUSINESS_CONTEXT" | "CREATIVE_VAULT" | "EVIDENCE_PACK" | "FOUNDER_INPUT" | "INTERNAL_ANALYTICS" | "SOCIAL_INTELLIGENCE";
  readonly reference: string;
  readonly fingerprint: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly demandEvidence: boolean;
  readonly willingnessToPayEvidence: boolean;
}

export interface VentureEvidenceMap {
  readonly evidenceMapId: string;
  readonly opportunityId: string;
  readonly sourceRefs: readonly string[];
  readonly claimRefs: readonly string[];
  readonly contradictions: readonly string[];
  readonly missingInputs: readonly string[];
  readonly freshness: "CURRENT" | "STALE" | "NOT_AVAILABLE";
  readonly fingerprint: string;
}

export interface VentureScoreCriterion {
  readonly criterion: string;
  readonly valueBps?: number;
  readonly formula: string;
  readonly weightBps?: number;
  readonly evidenceRefs: readonly string[];
  readonly confidenceBps: number;
  readonly missingInputs: readonly string[];
  readonly sensitivity: { readonly outcomeCanChange: boolean; readonly lowContributionBps?: number; readonly highContributionBps?: number };
}

export interface VentureScorecard extends VentureRecordBase {
  readonly scorecardId: string;
  readonly opportunityId: string;
  readonly criteria: readonly VentureScoreCriterion[];
  readonly totalScoreBps?: number;
  readonly confidenceAdjustedScoreBps?: number;
  readonly outcome: "FOUNDER_REVIEW_REQUIRED" | "REJECT" | "RESEARCH_MORE" | "THESIS_CANDIDATE";
  readonly blockingReasonCodes: readonly string[];
  readonly sensitiveToSingleAssumption: boolean;
}

export interface VentureOpportunity extends VentureRecordBase {
  readonly opportunityId: string;
  readonly title: string;
  readonly category: string;
  readonly origin: "FOUNDER_SUPPLIED_CANDIDATE" | "RADAR";
  readonly problem: string;
  readonly customer: string;
  readonly sources: readonly VentureOpportunitySource[];
  readonly evidenceMap: VentureEvidenceMap;
  readonly frequency: VentureAvailability<string>;
  readonly urgency: VentureAvailability<string>;
  readonly demand: "DEMAND_NOT_VERIFIED" | "VERIFIED";
  readonly willingnessToPay: "DEMAND_NOT_VERIFIED" | "VERIFIED";
  readonly competition: VentureAvailability<string>;
  readonly customerAccess: VentureAvailability<string>;
  readonly founderFit: VentureAvailability<string>;
  readonly capitalRequiredMinorUnits: VentureMonetaryAmount;
  readonly timeToFirstSignalDays: VentureAvailability<number>;
  readonly deliveryComplexity: VentureAvailability<"HIGH" | "LOW" | "MEDIUM">;
  readonly marginPotentialBps: VentureAvailability<number>;
  readonly risk: VentureAvailability<VentureRiskLevel>;
  readonly onlywaySynergy: VentureAvailability<string>;
  readonly unknowns: readonly string[];
  readonly expiresAt: string;
  readonly stage: Extract<VentureStage, "DISCOVERED" | "EVIDENCE_INSUFFICIENT" | "RESEARCHING">;
  readonly tombstoned: boolean;
}

export interface VentureHypothesis { readonly hypothesisId: string; readonly statement: string; readonly evidenceRefs: readonly string[]; readonly falsifiable: boolean; }
export interface VentureKillCriteria { readonly criteriaId: string; readonly conditions: readonly string[]; readonly configured: boolean; readonly evidenceRefs: readonly string[]; }
export interface VentureScaleCriteria { readonly criteriaId: string; readonly conditions: readonly string[]; readonly configured: boolean; readonly evidenceRefs: readonly string[]; }
export interface VentureRisk { readonly riskId: string; readonly domain: "ECONOMIC" | "LEGAL" | "OPERATIONAL" | "REPUTATIONAL" | "SECURITY"; readonly level: VentureRiskLevel; readonly description: string; readonly mitigation: string; readonly evidenceRefs: readonly string[]; }
export interface VentureDependency { readonly dependencyId: string; readonly description: string; readonly status: "AVAILABLE" | "BLOCKED" | "FOUNDER_INPUT_REQUIRED"; readonly owner: string; }
export interface VentureSynergy { readonly synergyId: string; readonly assetRef: string; readonly description: string; readonly evidenceRefs: readonly string[]; }

export interface VentureThesis extends VentureRecordBase {
  readonly thesisId: string;
  readonly opportunityId: string;
  readonly title: string;
  readonly hypothesis: VentureHypothesis;
  readonly positioning: VentureAvailability<string>;
  readonly valueProposition: VentureAvailability<string>;
  readonly scorecardRef: { readonly scorecardId: string; readonly version: number; readonly fingerprint: string };
  readonly evidenceMapFingerprint: string;
  readonly killCriteria: VentureKillCriteria;
  readonly scaleCriteria: VentureScaleCriteria;
  readonly risks: readonly VentureRisk[];
  readonly dependencies: readonly VentureDependency[];
  readonly synergies: readonly VentureSynergy[];
  readonly status: "AWAITING_FABIO" | "BLOCKED" | "DRAFT" | "REJECTED";
  readonly approval: "NOT_APPROVED";
  readonly tombstoned: boolean;
}

export interface VentureStageTransition extends VentureRecordBase {
  readonly transitionId: string;
  readonly ventureId: string;
  readonly from: VentureStage;
  readonly to: VentureStage;
  readonly reasonCode: string;
  readonly decisionRef?: string;
  readonly resultingVentureFingerprint: string;
}

export interface VentureBudget {
  readonly budgetId: string;
  readonly currency: VentureAvailability<string>;
  readonly maximumMinorUnits: VentureMonetaryAmount;
  readonly reservedMinorUnits: string;
  readonly actualMinorUnits: string;
  readonly spendAuthorized: false;
  readonly status: "FOUNDER_INPUT_REQUIRED" | "PROPOSAL_ONLY";
}

export interface VentureEconomicsScenario { readonly name: "AMBITIOUS" | "BASE" | "PRUDENT"; readonly inputsFingerprint: string; readonly results: JsonObject; }
export interface VentureEconomics extends VentureRecordBase {
  readonly economicsId: string;
  readonly ventureId: string;
  readonly currency: VentureAvailability<string>;
  readonly scenarios: readonly VentureEconomicsScenario[];
  readonly sensitivityMatrix: readonly { readonly field: string; readonly low: VentureAvailability<string>; readonly base: VentureAvailability<string>; readonly high: VentureAvailability<string> }[];
  readonly formulasVersion: "1";
  readonly status: "CALCULATED" | "NOT_AVAILABLE";
}

export interface CapitalAllocationProposal extends VentureRecordBase {
  readonly proposalId: string;
  readonly ventureId: string;
  readonly amountMinorUnits: VentureMonetaryAmount;
  readonly currency: VentureAvailability<string>;
  readonly expectedImpact: VentureAvailability<string>;
  readonly risk: VentureRiskLevel;
  readonly speed: VentureAvailability<string>;
  readonly reversibility: VentureAvailability<string>;
  readonly strategicFit: VentureAvailability<string>;
  readonly evidenceConfidenceBps: VentureAvailability<number>;
  readonly opportunityCost: VentureAvailability<string>;
  readonly status: "CAPITAL_ALLOCATION_PROPOSAL";
  readonly spendAuthorized: false;
  readonly externalActionsExecuted: false;
}

export interface ExperimentMetric { readonly metricId: string; readonly name: string; readonly kind: "PRIMARY" | "SECONDARY"; readonly unit: string; readonly successThreshold: VentureAvailability<string>; readonly failureThreshold: VentureAvailability<string>; }
export interface ExperimentObservation { readonly observationId: string; readonly kind: "REAL" | "SIMULATED"; readonly observedAt: string; readonly metricId: string; readonly value: string; readonly evidenceRefs: readonly string[]; }
export interface ExperimentDecision { readonly decisionId: string; readonly outcome: "AWAITING_REAL_OBSERVATION" | "SIGNAL_NEGATIVE" | "SIGNAL_POSITIVE" | "STOPPED"; readonly reasonCodes: readonly string[]; readonly observationRefs: readonly string[]; }
export interface VentureExperiment extends VentureRecordBase {
  readonly experimentId: string;
  readonly ventureId: string;
  readonly hypothesis: VentureHypothesis;
  readonly experimentType: "CONTENT_SIGNAL_TEST" | "CUSTOMER_INTERVIEW" | "DELIVERY_PROTOTYPE" | "INTERNAL_TECH_PROTOTYPE" | "LANDING_WAITLIST" | "MANUAL_OUTREACH_DRAFT" | "PILOT_OFFER" | "PREORDER_PROPOSAL" | "PRICE_TEST";
  readonly target: string;
  readonly method: string;
  readonly assetRefs: readonly string[];
  readonly durationDays: VentureAvailability<number>;
  readonly budgetMaximumMinorUnits: VentureMonetaryAmount;
  readonly sample: VentureAvailability<number>;
  readonly metrics: readonly ExperimentMetric[];
  readonly stopCondition: VentureAvailability<string>;
  readonly evidenceRequired: readonly string[];
  readonly externalActionsProposed: readonly string[];
  readonly owner: string;
  readonly observations: readonly ExperimentObservation[];
  readonly decision: ExperimentDecision;
  readonly status: "AWAITING_FABIO" | "BLOCKED" | "COMPLETED" | "DRAFT" | "READY";
  readonly externalActionsExecuted: false;
}

export interface VentureAsset { readonly assetId: string; readonly ventureId: string; readonly kind: string; readonly sourceRef: string; readonly fingerprint: string; readonly allowedUse: "INTERNAL_PACKAGE_ONLY" | "PROPOSAL_ONLY"; }
export interface VentureArtifact extends VentureRecordBase {
  readonly artifactId: string;
  readonly ventureId: string;
  readonly kind: "CRM_SCHEMA" | "DELIVERY_CHECKLIST" | "EMAIL_DRAFTS" | "EXECUTIVE_DECISION" | "LANDING_PAGE_SOURCE" | "LAUNCH_DOSSIER" | "LAUNCH_PACK_INDEX" | "OFFER_SOURCE" | "ONBOARDING_SOURCE" | "OPPORTUNITY_REPORT" | "OUTREACH_DRAFTS" | "PRESENTATION_SOURCE" | "SOCIAL_CONTENT_SERIES" | "SOCIAL_CONTENT_SOURCE" | "VALIDATION_PLAN" | "WEB_SOURCE";
  readonly mediaType: "application/json" | "text/csv" | "text/html" | "text/markdown";
  readonly content: string;
  readonly evidenceRefs: readonly string[];
  readonly authoringAgent: string;
  readonly reviewState: "AWAITING_FABIO" | "BLOCKED" | "DRAFT" | "REVIEWED";
  readonly allowedUse: "INTERNAL_PACKAGE_ONLY" | "PROPOSAL_ONLY";
  readonly externalActionsExecuted: false;
  readonly tombstoned: boolean;
}

export interface VentureDecision extends VentureRecordBase {
  readonly decisionId: string;
  readonly decision: "APPROVE_EXPERIMENT" | "APPROVE_THESIS" | "ARCHIVE_VENTURE" | "PAUSE_VENTURE" | "REJECT_EXPERIMENT" | "REJECT_THESIS" | "REQUEST_KILL_REVIEW" | "REQUEST_MORE_RESEARCH" | "REQUEST_SCALE_REVIEW" | "RESUME_VENTURE";
  readonly entityId: string;
  readonly entityType: "VENTURE" | "VENTURE_EXPERIMENT" | "VENTURE_THESIS";
  readonly entityVersion: number;
  readonly entityFingerprint: string;
  readonly decidedBy: string;
  readonly reasonCode: string;
  readonly externalActionsExecuted: false;
}

export interface Venture extends VentureRecordBase {
  readonly ventureId: string;
  readonly portfolioId: string;
  readonly thesisRef?: { readonly thesisId: string; readonly version: number; readonly fingerprint: string };
  readonly title: string;
  readonly stage: VentureStage;
  readonly budget: VentureBudget;
  readonly experimentIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly artifactIds: readonly string[];
  readonly risks: readonly VentureRisk[];
  readonly dependencies: readonly VentureDependency[];
  readonly synergies: readonly VentureSynergy[];
  readonly approvalState: "AWAITING_FABIO" | "NOT_APPROVED" | "REJECTED";
  readonly externalActions: "LOCKED";
  readonly publication: "LOCKED";
  readonly tombstoned: boolean;
}

export interface VenturePortfolio extends VentureRecordBase {
  readonly portfolioId: string;
  readonly policyRef: { readonly policyId: string; readonly version: number; readonly fingerprint: string };
  readonly opportunityIds: readonly string[];
  readonly thesisIds: readonly string[];
  readonly ventureIds: readonly string[];
  readonly capitalProposalIds: readonly string[];
  readonly founderDecisionIds: readonly string[];
  readonly externalActions: "LOCKED";
  readonly publication: "LOCKED";
  readonly tombstoned: boolean;
}

export interface VentureOperatingReport extends VentureRecordBase {
  readonly reportId: string;
  readonly ventureId: string;
  readonly stage: VentureStage;
  readonly evidenceFreshness: "CURRENT" | "STALE" | "NOT_AVAILABLE";
  readonly experimentStatus: string;
  readonly blockerCodes: readonly string[];
  readonly costStatus: "NOT_AVAILABLE" | "PROPOSAL_ONLY";
  readonly riskCount: number;
  readonly founderDecisionIds: readonly string[];
  readonly nextActions: readonly string[];
  readonly externalEffects: "ZERO";
}

export interface FounderPortfolioBrief extends VentureRecordBase {
  readonly briefId: string;
  readonly portfolioId: string;
  readonly kind: "DAILY" | "MONTHLY_CAPITAL_PLACEHOLDER" | "WEEKLY";
  readonly ventureReportIds: readonly string[];
  readonly opportunityIds: readonly string[];
  readonly experimentIds: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly founderDecisionIds: readonly string[];
  readonly costStatus: "NOT_AVAILABLE" | "PROPOSAL_ONLY";
  readonly riskCount: number;
  readonly externalEffects: "ZERO";
  readonly nextActions: readonly string[];
}

export interface VentureReceipt extends VentureRecordBase {
  readonly receiptId: string;
  readonly commandId: string;
  readonly idempotencyKeyFingerprint: string;
  readonly requestFingerprint: string;
  readonly operation: VentureCommandOperation;
  readonly status: "COMMITTED" | "REJECTED" | "REPLAYED";
  readonly resultRefs: readonly { readonly recordType: VentureRecordType; readonly entityId: string; readonly version: number; readonly fingerprint: string }[];
  readonly reasonCode: string;
  readonly externalEffects: "ZERO";
}

export const VENTURE_RECORD_TYPES = Object.freeze([
  "FOUNDER_VENTURE_POLICY", "VENTURE_PORTFOLIO", "VENTURE_OPPORTUNITY", "VENTURE_SCORECARD", "VENTURE_THESIS", "VENTURE", "VENTURE_STAGE_TRANSITION", "VENTURE_ECONOMICS", "CAPITAL_ALLOCATION_PROPOSAL", "VENTURE_EXPERIMENT", "VENTURE_ARTIFACT", "VENTURE_DECISION", "VENTURE_OPERATING_REPORT", "FOUNDER_PORTFOLIO_BRIEF", "VENTURE_RECEIPT",
] as const);
export type VentureRecordType = typeof VENTURE_RECORD_TYPES[number];
export interface VentureRecordMap {
  readonly FOUNDER_VENTURE_POLICY: FounderVenturePolicy;
  readonly VENTURE_PORTFOLIO: VenturePortfolio;
  readonly VENTURE_OPPORTUNITY: VentureOpportunity;
  readonly VENTURE_SCORECARD: VentureScorecard;
  readonly VENTURE_THESIS: VentureThesis;
  readonly VENTURE: Venture;
  readonly VENTURE_STAGE_TRANSITION: VentureStageTransition;
  readonly VENTURE_ECONOMICS: VentureEconomics;
  readonly CAPITAL_ALLOCATION_PROPOSAL: CapitalAllocationProposal;
  readonly VENTURE_EXPERIMENT: VentureExperiment;
  readonly VENTURE_ARTIFACT: VentureArtifact;
  readonly VENTURE_DECISION: VentureDecision;
  readonly VENTURE_OPERATING_REPORT: VentureOperatingReport;
  readonly FOUNDER_PORTFOLIO_BRIEF: FounderPortfolioBrief;
  readonly VENTURE_RECEIPT: VentureReceipt;
}

export type VentureCommandOperation = "APPEND_RECORD" | "CREATE_POLICY" | "DECIDE" | "REGISTER_OPPORTUNITY" | "RUN_VENTURE_001" | "SET_KILL_SWITCH" | "TRANSITION_STAGE";
export interface VentureCommand {
  readonly actorId: string;
  readonly commandId: string;
  readonly contractVersion: typeof VENTURE_HOLDING_CONTRACT_VERSION;
  readonly expectedVersion: number | "NOT_EXISTS";
  readonly idempotencyKey: string;
  readonly input: JsonObject;
  readonly operation: VentureCommandOperation;
  readonly requestFingerprint: string;
  readonly targetFingerprint: string;
  readonly targetId: string;
  readonly targetType: VentureRecordType | "VENTURE_CONTROL";
  readonly workspaceId: string;
}
export interface VentureCommandReceipt {
  readonly actorId: string;
  readonly commandId: string;
  readonly contractVersion: typeof VENTURE_HOLDING_CONTRACT_VERSION;
  readonly idempotencyKeyFingerprint: string;
  readonly recordedAt: string;
  readonly requestFingerprint: string;
  readonly responseFingerprint: string;
  readonly resultRefs: VentureReceipt["resultRefs"];
  readonly status: "COMMITTED" | "REJECTED";
  readonly workspaceId: string;
  readonly fingerprint: string;
}
export interface VentureAuditEvent { readonly actorId: string; readonly workspaceId: string; readonly contractVersion: "1"; readonly eventId: string; readonly commandId: string; readonly occurredAt: string; readonly operation: VentureCommandOperation; readonly targetId: string; readonly targetType: VentureCommand["targetType"]; readonly outcome: "COMMITTED" | "REJECTED"; readonly reasonCode: string; readonly fingerprint: string; }
export interface VentureEvent { readonly actorId: string; readonly workspaceId: string; readonly contractVersion: "1"; readonly eventId: string; readonly occurredAt: string; readonly aggregateType: VentureRecordType | "VENTURE_CONTROL"; readonly entityId: string; readonly entityVersion: number; readonly eventType: "KILL_SWITCH_CHANGED" | "RECORD_APPENDED" | "STAGE_CHANGED"; readonly safeSummaryCode: "venture_kill_switch_changed" | "venture_record_appended" | "venture_stage_changed"; readonly fingerprint: string; }
export interface VentureKillSwitch { readonly actorId: string; readonly workspaceId: string; readonly contractVersion: "1"; readonly enabled: boolean; readonly updatedAt: string; readonly updatedBy: string; readonly version: number; readonly fingerprint: string; }

export function ventureRecordEntityId<K extends VentureRecordType>(type: K, record: VentureRecordMap[K]): string {
  const ids: Readonly<Record<VentureRecordType, string>> = {
    FOUNDER_VENTURE_POLICY: "policyId", VENTURE_PORTFOLIO: "portfolioId", VENTURE_OPPORTUNITY: "opportunityId", VENTURE_SCORECARD: "scorecardId", VENTURE_THESIS: "thesisId", VENTURE: "ventureId", VENTURE_STAGE_TRANSITION: "transitionId", VENTURE_ECONOMICS: "economicsId", CAPITAL_ALLOCATION_PROPOSAL: "proposalId", VENTURE_EXPERIMENT: "experimentId", VENTURE_ARTIFACT: "artifactId", VENTURE_DECISION: "decisionId", VENTURE_OPERATING_REPORT: "reportId", FOUNDER_PORTFOLIO_BRIEF: "briefId", VENTURE_RECEIPT: "receiptId",
  };
  return String((record as unknown as Readonly<Record<string, unknown>>)[ids[type]]);
}
