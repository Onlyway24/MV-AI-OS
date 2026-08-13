export const REVENUE_OS_CONTRACT_VERSION = "1" as const;

export const REVENUE_CALCULATION_FORMULAS = Object.freeze({
  breakEven: "ceil(allocatedFixedCostsMinorUnits / unitContributionMinorUnits)",
  capacityRevenue: "deliveryCapacityUnits * netUnitRevenueMinorUnits",
  contributionMarginBps: "round(unitContributionMinorUnits / netUnitRevenueMinorUnits * 10000)",
  deliveryCapacity: "min(floor((availableHours - reservedHours) / hoursPerDelivery), maxConcurrentDeliveries)",
  experimentPriority: "round((impactScore * confidenceScore) / (effortScore * 100), 2)",
  netUnitRevenue: "round(unitPriceMinorUnits * (10000 - refundRateBps) / 10000)",
  pipelineCoverage: "round(weightedPipelineMinorUnits / targetGapMinorUnits * 10000)",
  targetGap: "max(targetRevenueMinorUnits - recognizedRevenueMinorUnits, 0)",
  unitContribution: "netUnitRevenueMinorUnits - variableUnitCostMinorUnits",
  variableUnitCost: "variableDeliveryCostMinorUnits + acquisitionCostMinorUnits",
  weightedPipeline: "sum(round(estimatedValueMinorUnits * probabilityBps / 10000))",
} as const);

export const REVENUE_PERIODS = Object.freeze(["WEEK", "MONTH", "QUARTER", "YEAR"] as const);
export type RevenuePeriod = typeof REVENUE_PERIODS[number];

export const FUNNEL_STAGE_KINDS = Object.freeze(["LEAD", "OPPORTUNITY", "OUTCOME"] as const);
export type FunnelStageKind = typeof FUNNEL_STAGE_KINDS[number];

export type RevenueDataKind = "FABIO_SUPPLIED" | "MEASURED" | "VERIFIED_ESTIMATE";
export type RevenueNotAvailableReason = "MISSING_INPUT" | "NOT_AVAILABLE" | "NOT_VERIFIED";

export interface RevenueMetricProvenance {
  readonly dataKind: RevenueDataKind;
  readonly recordedAt: string;
  readonly sourceRef: string;
}

export type RevenueMetric =
  | {
      readonly status: "AVAILABLE";
      readonly value: number;
      readonly provenance: RevenueMetricProvenance;
    }
  | {
      readonly status: "NOT_AVAILABLE";
      readonly reasonCode: RevenueNotAvailableReason;
      readonly note: string;
    };

export type RevenueCalculatedMetric =
  | {
      readonly status: "CALCULATED";
      readonly formula: string;
      readonly unit: "BASIS_POINTS" | "COUNT" | "HOURS" | "MINOR_CURRENCY" | "SCORE";
      readonly value: number;
    }
  | {
      readonly status: "NOT_AVAILABLE";
      readonly formula: string;
      readonly missingInputs: readonly string[];
      readonly reasonCode: "INVALID_INPUT" | "NON_POSITIVE_CONTRIBUTION" | "NOT_AVAILABLE";
      readonly unit: "BASIS_POINTS" | "COUNT" | "HOURS" | "MINOR_CURRENCY" | "SCORE";
    };

export type ApprovalState =
  | {
      readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
      readonly status: "DRAFT";
      readonly version: number;
    }
  | {
      readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
      readonly requestedAt: string;
      readonly status: "PENDING_FABIO_REVIEW";
      readonly version: number;
    }
  | {
      readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
      readonly decidedAt: string;
      readonly decidedBy: "FABIO";
      readonly note: string;
      readonly status: "APPROVED_BY_FABIO" | "REJECTED_BY_FABIO" | "REVISION_REQUESTED";
      readonly version: number;
    };

export interface Offer {
  readonly approval: ApprovalState;
  readonly audience: string;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly currency: string;
  readonly deliverables: readonly string[];
  readonly exclusions: readonly string[];
  readonly name: string;
  readonly offerId: string;
  readonly outcome: string;
  readonly priceMinorUnits: RevenueMetric;
  readonly status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "PAUSED";
  readonly version: number;
}

export interface OfferEconomics {
  readonly acquisitionCostMinorUnits: RevenueMetric;
  readonly allocatedFixedCostsMinorUnits: RevenueMetric;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly currency: string;
  readonly offerId: string;
  readonly refundRateBps: RevenueMetric;
  readonly unitPriceMinorUnits: RevenueMetric;
  readonly variableDeliveryCostMinorUnits: RevenueMetric;
  readonly version: number;
}

export interface RevenueTarget {
  readonly approval: ApprovalState;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly currency: string;
  readonly endsAt: string;
  readonly period: RevenuePeriod;
  readonly recognizedRevenueMinorUnits: RevenueMetric;
  readonly startsAt: string;
  readonly targetId: string;
  readonly targetRevenueMinorUnits: RevenueMetric;
  readonly version: number;
}

export interface RevenueExperiment {
  readonly approval: ApprovalState;
  readonly confidenceScore: RevenueMetric;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly effortScore: RevenueMetric;
  readonly executionMode: "LOCAL_ONLY";
  readonly experimentId: string;
  readonly externalActionsExecuted: false;
  readonly hypothesis: string;
  readonly impactScore: RevenueMetric;
  readonly maxBudgetMinorUnits: RevenueMetric;
  readonly offerId: string;
  readonly primaryMetric: string;
  readonly status: "CANCELLED" | "COMPLETED" | "DRAFT" | "PLANNED";
  readonly successThreshold: string;
  readonly version: number;
}

export interface FunnelStage {
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly entryCriteria: readonly string[];
  readonly exitCriteria: readonly string[];
  readonly kind: FunnelStageKind;
  readonly label: string;
  readonly order: number;
  readonly stageId: string;
  readonly terminal: boolean;
  readonly version: number;
}

export interface Lead {
  readonly approval: ApprovalState;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly displayName: string;
  readonly externalActionsExecuted: false;
  readonly leadId: string;
  readonly offerInterestIds: readonly string[];
  readonly source: string;
  readonly stageId: string;
  readonly status: "ARCHIVED" | "CONVERTED" | "DISQUALIFIED" | "OPEN" | "QUALIFIED";
  readonly storageScope: "LOCAL_ONLY";
  readonly version: number;
}

export interface RevenueOpportunity {
  readonly approval: ApprovalState;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly displayName: string;
  readonly estimatedValueMinorUnits: RevenueMetric;
  readonly externalActionsExecuted: false;
  readonly leadId: string | null;
  readonly nextAction: string;
  readonly offerId: string;
  readonly opportunityId: string;
  readonly probabilityBps: RevenueMetric;
  readonly stageId: string;
  readonly status: "COMMITTED" | "LOST" | "OPEN" | "WON";
  readonly storageScope: "LOCAL_ONLY";
  readonly version: number;
}

export interface OfferDeliveryRequirement {
  readonly hoursPerDelivery: RevenueMetric;
  readonly offerId: string;
}

export interface DeliveryCapacity {
  readonly availableHours: RevenueMetric;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly endsAt: string;
  readonly maxConcurrentDeliveries: RevenueMetric;
  readonly offerRequirements: readonly OfferDeliveryRequirement[];
  readonly period: RevenuePeriod;
  readonly reservedHours: RevenueMetric;
  readonly startsAt: string;
  readonly version: number;
}

export interface RevenuePlan {
  readonly approval: ApprovalState;
  readonly capacity: DeliveryCapacity;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly economics: readonly OfferEconomics[];
  readonly experiments: readonly RevenueExperiment[];
  readonly funnelStages: readonly FunnelStage[];
  readonly leads: readonly Lead[];
  readonly missionId: string;
  readonly offers: readonly Offer[];
  readonly opportunities: readonly RevenueOpportunity[];
  readonly planId: string;
  readonly status: "BLOCKED" | "DRAFT" | "READY_FOR_FABIO_REVIEW";
  readonly target: RevenueTarget;
  readonly version: number;
}

export interface RevenueMission {
  readonly actorId: string;
  readonly approval: ApprovalState;
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly externalActionsAllowed: false;
  readonly externalActionsExecuted: false;
  readonly missionId: string;
  readonly objective: string;
  readonly plan: RevenuePlan;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface OfferRevenueScore {
  readonly breakEvenUnits: RevenueCalculatedMetric;
  readonly capacityRevenueMinorUnits: RevenueCalculatedMetric;
  readonly contributionMarginBps: RevenueCalculatedMetric;
  readonly deliveryCapacityUnits: RevenueCalculatedMetric;
  readonly netUnitRevenueMinorUnits: RevenueCalculatedMetric;
  readonly offerId: string;
  readonly unitContributionMinorUnits: RevenueCalculatedMetric;
  readonly variableUnitCostMinorUnits: RevenueCalculatedMetric;
}

export interface RevenueExperimentPriority {
  readonly experimentId: string;
  readonly priorityScore: RevenueCalculatedMetric;
  readonly rank: number | null;
}

export interface RevenueScorecard {
  readonly blockingReasonCodes: readonly (
    | "DELIVERY_CAPACITY_NOT_AVAILABLE"
    | "EXPERIMENT_PRIORITY_NOT_AVAILABLE"
    | "NO_OFFERS"
    | "OFFER_ECONOMICS_NOT_AVAILABLE"
    | "PIPELINE_COVERAGE_NOT_AVAILABLE"
    | "PIPELINE_NOT_AVAILABLE"
    | "TARGET_GAP_NOT_AVAILABLE"
  )[];
  readonly contractVersion: typeof REVENUE_OS_CONTRACT_VERSION;
  readonly evaluatedAt: string;
  readonly experimentPriorities: readonly RevenueExperimentPriority[];
  readonly externalActionsExecuted: false;
  readonly missionId: string;
  readonly offerScores: readonly OfferRevenueScore[];
  readonly pipelineCoverageBps: RevenueCalculatedMetric;
  readonly planId: string;
  readonly readiness: "BLOCKED" | "READY_FOR_FABIO_REVIEW";
  readonly targetGapMinorUnits: RevenueCalculatedMetric;
  readonly version: 0;
  readonly weightedPipelineMinorUnits: RevenueCalculatedMetric;
}
