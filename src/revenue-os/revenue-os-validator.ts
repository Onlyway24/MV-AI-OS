import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";
import {
  FUNNEL_STAGE_KINDS,
  REVENUE_CALCULATION_FORMULAS,
  REVENUE_OS_CONTRACT_VERSION,
  REVENUE_PERIODS,
  type ApprovalState,
  type DeliveryCapacity,
  type FunnelStage,
  type Lead,
  type Offer,
  type OfferEconomics,
  type RevenueExperiment,
  type RevenueCalculatedMetric,
  type RevenueMetric,
  type RevenueMission,
  type RevenueOpportunity,
  type RevenuePlan,
  type RevenueScorecard,
  type RevenueTarget,
} from "./revenue-os.js";
import { multiplySafeIntegers, roundSafeIntegerRatio, subtractSafeIntegers } from "./revenue-math.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_JSON_BYTES = 2_000_000;

export class ApprovalStateValidator implements Validator<ApprovalState> { public validate(value: unknown): ValidationResult<ApprovalState> { return result(value, approval, "ApprovalState"); } }
export class OfferValidator implements Validator<Offer> { public validate(value: unknown): ValidationResult<Offer> { return result(value, offer, "Offer"); } }
export class OfferEconomicsValidator implements Validator<OfferEconomics> { public validate(value: unknown): ValidationResult<OfferEconomics> { return result(value, offerEconomics, "OfferEconomics"); } }
export class RevenueTargetValidator implements Validator<RevenueTarget> { public validate(value: unknown): ValidationResult<RevenueTarget> { return result(value, revenueTarget, "RevenueTarget"); } }
export class RevenueExperimentValidator implements Validator<RevenueExperiment> { public validate(value: unknown): ValidationResult<RevenueExperiment> { return result(value, revenueExperiment, "RevenueExperiment"); } }
export class FunnelStageValidator implements Validator<FunnelStage> { public validate(value: unknown): ValidationResult<FunnelStage> { return result(value, funnelStage, "FunnelStage"); } }
export class LeadValidator implements Validator<Lead> { public validate(value: unknown): ValidationResult<Lead> { return result(value, lead, "Lead"); } }
export class RevenueOpportunityValidator implements Validator<RevenueOpportunity> { public validate(value: unknown): ValidationResult<RevenueOpportunity> { return result(value, opportunity, "RevenueOpportunity"); } }
export class DeliveryCapacityValidator implements Validator<DeliveryCapacity> { public validate(value: unknown): ValidationResult<DeliveryCapacity> { return result(value, deliveryCapacity, "DeliveryCapacity"); } }
export class RevenuePlanValidator implements Validator<RevenuePlan> { public validate(value: unknown): ValidationResult<RevenuePlan> { return result(value, revenuePlan, "RevenuePlan"); } }
export class RevenueMissionValidator implements Validator<RevenueMission> { public validate(value: unknown): ValidationResult<RevenueMission> { return result(value, revenueMission, "RevenueMission"); } }
export class RevenueScorecardValidator implements Validator<RevenueScorecard> { public validate(value: unknown): ValidationResult<RevenueScorecard> { return result(value, revenueScorecard, "RevenueScorecard"); } }

function result<T>(value: unknown, predicate: (candidate: unknown) => boolean, label: string): ValidationResult<T> {
  if (!predicate(value) || !boundedJson(value)) return validationFailure([{ code: "invalid", message: `${label} is invalid`, path: "" }]);
  return validationSuccess(deepFreeze(structuredClone(value)) as T);
}

function approval(value: unknown): boolean {
  if (!record(value) || value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || !version(value.version) || typeof value.status !== "string") return false;
  if (value.status === "DRAFT") return exact(value, ["contractVersion", "status", "version"]);
  if (value.status === "PENDING_FABIO_REVIEW") return exact(value, ["contractVersion", "requestedAt", "status", "version"]) && timestamp(value.requestedAt);
  return ["APPROVED_BY_FABIO", "REJECTED_BY_FABIO", "REVISION_REQUESTED"].includes(value.status)
    && exact(value, ["contractVersion", "decidedAt", "decidedBy", "note", "status", "version"])
    && timestamp(value.decidedAt)
    && value.decidedBy === "FABIO"
    && text(value.note, 1, 2_000);
}

function offer(value: unknown): boolean {
  if (!record(value) || !exact(value, ["approval", "audience", "contractVersion", "currency", "deliverables", "exclusions", "name", "offerId", "outcome", "priceMinorUnits", "status", "version"])) return false;
  if (value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || !id(value.offerId) || !version(value.version) || !text(value.name, 1, 200) || !text(value.audience, 1, 1_000) || !text(value.outcome, 1, 2_000) || !strings(value.deliverables, 1, 50, 500) || !strings(value.exclusions, 0, 50, 500) || !currency(value.currency) || !metric(value.priceMinorUnits, 0, Number.MAX_SAFE_INTEGER, true) || !approval(value.approval) || !["ACTIVE", "ARCHIVED", "DRAFT", "PAUSED"].includes(String(value.status))) return false;
  return value.status !== "ACTIVE" || (record(value.approval) && value.approval.status === "APPROVED_BY_FABIO");
}

function offerEconomics(value: unknown): boolean {
  return record(value)
    && exact(value, ["acquisitionCostMinorUnits", "allocatedFixedCostsMinorUnits", "contractVersion", "currency", "offerId", "refundRateBps", "unitPriceMinorUnits", "variableDeliveryCostMinorUnits", "version"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.offerId)
    && version(value.version)
    && currency(value.currency)
    && metric(value.unitPriceMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.variableDeliveryCostMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.acquisitionCostMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.allocatedFixedCostsMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.refundRateBps, 0, 10_000, true);
}

function revenueTarget(value: unknown): boolean {
  return record(value)
    && exact(value, ["approval", "contractVersion", "currency", "endsAt", "period", "recognizedRevenueMinorUnits", "startsAt", "targetId", "targetRevenueMinorUnits", "version"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.targetId)
    && version(value.version)
    && currency(value.currency)
    && REVENUE_PERIODS.includes(value.period as never)
    && timestamp(value.startsAt)
    && timestamp(value.endsAt)
    && Date.parse(value.endsAt) > Date.parse(value.startsAt)
    && metric(value.targetRevenueMinorUnits, 1, Number.MAX_SAFE_INTEGER, true)
    && metric(value.recognizedRevenueMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && approval(value.approval);
}

function revenueExperiment(value: unknown): boolean {
  return record(value)
    && exact(value, ["approval", "confidenceScore", "contractVersion", "effortScore", "executionMode", "experimentId", "externalActionsExecuted", "hypothesis", "impactScore", "maxBudgetMinorUnits", "offerId", "primaryMetric", "status", "successThreshold", "version"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.experimentId)
    && id(value.offerId)
    && version(value.version)
    && text(value.hypothesis, 1, 2_000)
    && text(value.primaryMetric, 1, 500)
    && text(value.successThreshold, 1, 500)
    && metric(value.maxBudgetMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.impactScore, 0, 100, false)
    && metric(value.confidenceScore, 0, 100, false)
    && metric(value.effortScore, 1, 100, false)
    && ["CANCELLED", "COMPLETED", "DRAFT", "PLANNED"].includes(String(value.status))
    && value.executionMode === "LOCAL_ONLY"
    && value.externalActionsExecuted === false
    && approval(value.approval);
}

function funnelStage(value: unknown): boolean {
  if (!record(value) || !exact(value, ["contractVersion", "entryCriteria", "exitCriteria", "kind", "label", "order", "stageId", "terminal", "version"]) || value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || !id(value.stageId) || !version(value.version) || !text(value.label, 1, 200) || !integer(value.order, 0, 1_000) || !FUNNEL_STAGE_KINDS.includes(value.kind as never) || typeof value.terminal !== "boolean" || !strings(value.entryCriteria, 1, 30, 500) || !strings(value.exitCriteria, 1, 30, 500)) return false;
  return value.kind === "OUTCOME" ? value.terminal : !value.terminal;
}

function lead(value: unknown): boolean {
  return record(value)
    && exact(value, ["approval", "contractVersion", "displayName", "externalActionsExecuted", "leadId", "offerInterestIds", "source", "stageId", "status", "storageScope", "version"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.leadId)
    && version(value.version)
    && text(value.displayName, 1, 500)
    && text(value.source, 1, 500)
    && id(value.stageId)
    && ids(value.offerInterestIds, 0, 50)
    && ["ARCHIVED", "CONVERTED", "DISQUALIFIED", "OPEN", "QUALIFIED"].includes(String(value.status))
    && value.storageScope === "LOCAL_ONLY"
    && value.externalActionsExecuted === false
    && approval(value.approval);
}

function opportunity(value: unknown): boolean {
  return record(value)
    && exact(value, ["approval", "contractVersion", "displayName", "estimatedValueMinorUnits", "externalActionsExecuted", "leadId", "nextAction", "offerId", "opportunityId", "probabilityBps", "stageId", "status", "storageScope", "version"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.opportunityId)
    && (value.leadId === null || id(value.leadId))
    && id(value.offerId)
    && id(value.stageId)
    && version(value.version)
    && text(value.displayName, 1, 500)
    && text(value.nextAction, 1, 1_000)
    && metric(value.estimatedValueMinorUnits, 0, Number.MAX_SAFE_INTEGER, true)
    && metric(value.probabilityBps, 0, 10_000, true)
    && ["COMMITTED", "LOST", "OPEN", "WON"].includes(String(value.status))
    && value.storageScope === "LOCAL_ONLY"
    && value.externalActionsExecuted === false
    && approval(value.approval);
}

function deliveryCapacity(value: unknown): boolean {
  if (!record(value) || !exact(value, ["availableHours", "contractVersion", "endsAt", "maxConcurrentDeliveries", "offerRequirements", "period", "reservedHours", "startsAt", "version"]) || value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || !version(value.version) || !REVENUE_PERIODS.includes(value.period as never) || !timestamp(value.startsAt) || !timestamp(value.endsAt) || Date.parse(value.endsAt) <= Date.parse(value.startsAt) || !metric(value.availableHours, 0, 100_000, false) || !metric(value.reservedHours, 0, 100_000, false) || !metric(value.maxConcurrentDeliveries, 0, 1_000_000, true) || !Array.isArray(value.offerRequirements) || value.offerRequirements.length > 1_000 || !value.offerRequirements.every(offerRequirement)) return false;
  if (duplicates(value.offerRequirements.map((item) => record(item) ? item.offerId : undefined))) return false;
  if (availableMetric(value.availableHours) && availableMetric(value.reservedHours) && value.reservedHours.value > value.availableHours.value) return false;
  return true;
}

function offerRequirement(value: unknown): boolean {
  return record(value) && exact(value, ["hoursPerDelivery", "offerId"]) && id(value.offerId) && metric(value.hoursPerDelivery, 0.01, 100_000, false);
}

function revenuePlan(value: unknown): boolean {
  if (!record(value) || !exact(value, ["approval", "capacity", "contractVersion", "economics", "experiments", "funnelStages", "leads", "missionId", "offers", "opportunities", "planId", "status", "target", "version"]) || value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || !id(value.planId) || !id(value.missionId) || !version(value.version) || !["BLOCKED", "DRAFT", "READY_FOR_FABIO_REVIEW"].includes(String(value.status)) || !approval(value.approval) || !array(value.offers, offer, 0, 500) || !array(value.economics, offerEconomics, 0, 500) || !revenueTarget(value.target) || !array(value.experiments, revenueExperiment, 0, 500) || !array(value.funnelStages, funnelStage, 1, 100) || !array(value.leads, lead, 0, 10_000) || !array(value.opportunities, opportunity, 0, 10_000) || !deliveryCapacity(value.capacity)) return false;
  const offers = value.offers as readonly Offer[];
  const economics = value.economics as readonly OfferEconomics[];
  const experiments = value.experiments as readonly RevenueExperiment[];
  const stages = value.funnelStages as readonly FunnelStage[];
  const leads = value.leads as readonly Lead[];
  const opportunities = value.opportunities as readonly RevenueOpportunity[];
  const capacity = value.capacity as DeliveryCapacity;
  const target = value.target as RevenueTarget;
  if (duplicates(offers.map(({ offerId }) => offerId)) || duplicates(economics.map(({ offerId }) => offerId)) || duplicates(experiments.map(({ experimentId }) => experimentId)) || duplicates(stages.map(({ stageId }) => stageId)) || duplicates(stages.map(({ order }) => order)) || duplicates(leads.map(({ leadId }) => leadId)) || duplicates(opportunities.map(({ opportunityId }) => opportunityId))) return false;
  const offerById = new Map(offers.map((item) => [item.offerId, item]));
  const stageById = new Map(stages.map((item) => [item.stageId, item]));
  const leadIds = new Set(leads.map(({ leadId }) => leadId));
  if (economics.some((item) => !economicsMatches(item, offerById.get(item.offerId), target.currency))) return false;
  if (experiments.some(({ offerId }) => !offerById.has(offerId))) return false;
  if (capacity.offerRequirements.some(({ offerId }) => !offerById.has(offerId))) return false;
  if (leads.some((item) => stageById.get(item.stageId)?.kind !== "LEAD" || item.offerInterestIds.some((offerId) => !offerById.has(offerId)))) return false;
  if (opportunities.some((item) => !opportunityReferences(item, offerById, stageById, leadIds))) return false;
  return offers.every(({ currency: offerCurrency }) => offerCurrency === target.currency);
}

function revenueMission(value: unknown): boolean {
  return record(value)
    && exact(value, ["actorId", "approval", "contractVersion", "createdAt", "externalActionsAllowed", "externalActionsExecuted", "missionId", "objective", "plan", "updatedAt", "version", "workspaceId"])
    && value.contractVersion === REVENUE_OS_CONTRACT_VERSION
    && id(value.missionId)
    && id(value.workspaceId)
    && id(value.actorId)
    && version(value.version)
    && text(value.objective, 1, 2_000)
    && timestamp(value.createdAt)
    && timestamp(value.updatedAt)
    && Date.parse(value.updatedAt) >= Date.parse(value.createdAt)
    && value.externalActionsAllowed === false
    && value.externalActionsExecuted === false
    && approval(value.approval)
    && revenuePlan(value.plan)
    && record(value.plan)
    && value.plan.missionId === value.missionId;
}

function revenueScorecard(value: unknown): boolean {
  if (!record(value) || !exact(value, ["blockingReasonCodes", "contractVersion", "evaluatedAt", "experimentPriorities", "externalActionsExecuted", "missionId", "offerScores", "pipelineCoverageBps", "planId", "readiness", "targetGapMinorUnits", "version", "weightedPipelineMinorUnits"]) || value.contractVersion !== REVENUE_OS_CONTRACT_VERSION || value.version !== 0 || !id(value.missionId) || !id(value.planId) || !timestamp(value.evaluatedAt) || value.externalActionsExecuted !== false || !["BLOCKED", "READY_FOR_FABIO_REVIEW"].includes(String(value.readiness)) || !enumStrings(value.blockingReasonCodes, ["DELIVERY_CAPACITY_NOT_AVAILABLE", "EXPERIMENT_PRIORITY_NOT_AVAILABLE", "NO_OFFERS", "OFFER_ECONOMICS_NOT_AVAILABLE", "PIPELINE_COVERAGE_NOT_AVAILABLE", "PIPELINE_NOT_AVAILABLE", "TARGET_GAP_NOT_AVAILABLE"], 0, 7) || !calculatedMetric(value.targetGapMinorUnits) || !calculatedMetric(value.weightedPipelineMinorUnits) || !calculatedMetric(value.pipelineCoverageBps) || !Array.isArray(value.offerScores) || value.offerScores.length > 500 || !value.offerScores.every(offerScore) || !Array.isArray(value.experimentPriorities) || value.experimentPriorities.length > 500 || !value.experimentPriorities.every(experimentPriority)) return false;
  const scorecard = value as unknown as RevenueScorecard;
  const blockers = scorecard.blockingReasonCodes;
  const offerScores = scorecard.offerScores;
  const experimentPriorities = scorecard.experimentPriorities;
  if (!sameSequence(blockers, expectedScorecardBlockers(scorecard))) return false;
  if (!scorecardMetricContractsMatch(scorecard) || !pipelineCoverageMatches(scorecard) || !offerScores.every(offerScoreRelationsMatch)) return false;
  if ((blockers.length === 0) !== (value.readiness === "READY_FOR_FABIO_REVIEW")) return false;
  if (duplicates(offerScores.map(({ offerId }) => offerId)) || duplicates(experimentPriorities.map(({ experimentId }) => experimentId))) return false;
  return experimentRanksMatch(experimentPriorities);
}

function expectedScorecardBlockers(scorecard: RevenueScorecard): RevenueScorecard["blockingReasonCodes"] {
  const blockers: RevenueScorecard["blockingReasonCodes"][number][] = [];
  if (scorecard.offerScores.length === 0) blockers.push("NO_OFFERS");
  if (scorecard.targetGapMinorUnits.status === "NOT_AVAILABLE") blockers.push("TARGET_GAP_NOT_AVAILABLE");
  if (scorecard.weightedPipelineMinorUnits.status === "NOT_AVAILABLE") blockers.push("PIPELINE_NOT_AVAILABLE");
  if (scorecard.targetGapMinorUnits.status === "CALCULATED" && scorecard.weightedPipelineMinorUnits.status === "CALCULATED" && scorecard.pipelineCoverageBps.status === "NOT_AVAILABLE") blockers.push("PIPELINE_COVERAGE_NOT_AVAILABLE");
  if (scorecard.offerScores.some((score) => [score.breakEvenUnits, score.capacityRevenueMinorUnits, score.contributionMarginBps, score.netUnitRevenueMinorUnits, score.unitContributionMinorUnits, score.variableUnitCostMinorUnits].some(({ status }) => status === "NOT_AVAILABLE"))) blockers.push("OFFER_ECONOMICS_NOT_AVAILABLE");
  if (scorecard.offerScores.some(({ deliveryCapacityUnits }) => deliveryCapacityUnits.status === "NOT_AVAILABLE")) blockers.push("DELIVERY_CAPACITY_NOT_AVAILABLE");
  if (scorecard.experimentPriorities.some(({ priorityScore }) => priorityScore.status === "NOT_AVAILABLE")) blockers.push("EXPERIMENT_PRIORITY_NOT_AVAILABLE");
  return blockers;
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function pipelineCoverageMatches(scorecard: RevenueScorecard): boolean {
  const gap = scorecard.targetGapMinorUnits;
  const pipeline = scorecard.weightedPipelineMinorUnits;
  const coverage = scorecard.pipelineCoverageBps;
  if (gap.status === "NOT_AVAILABLE" || pipeline.status === "NOT_AVAILABLE") {
    const missingInputs = [
      ...(pipeline.status === "NOT_AVAILABLE" ? ["weightedPipelineMinorUnits", ...pipeline.missingInputs.map((item) => `weightedPipelineMinorUnits.${item}`)] : []),
      ...(gap.status === "NOT_AVAILABLE" ? ["targetGapMinorUnits", ...gap.missingInputs.map((item) => `targetGapMinorUnits.${item}`)] : []),
    ];
    return canonicalUnavailable(coverage, "NOT_AVAILABLE", missingInputs);
  }
  const expected = gap.value === 0 ? 10_000 : roundSafeIntegerRatio(pipeline.value, 10_000, gap.value);
  return expected === null ? canonicalUnavailable(coverage, "INVALID_INPUT", ["safeCalculatedValue"]) : calculatedEquals(coverage, expected);
}

function scorecardMetricContractsMatch(scorecard: RevenueScorecard): boolean {
  return metricContract(scorecard.targetGapMinorUnits, REVENUE_CALCULATION_FORMULAS.targetGap, "MINOR_CURRENCY")
    && metricContract(scorecard.weightedPipelineMinorUnits, REVENUE_CALCULATION_FORMULAS.weightedPipeline, "MINOR_CURRENCY")
    && metricContract(scorecard.pipelineCoverageBps, REVENUE_CALCULATION_FORMULAS.pipelineCoverage, "BASIS_POINTS")
    && scorecard.offerScores.every((score) => metricContract(score.breakEvenUnits, REVENUE_CALCULATION_FORMULAS.breakEven, "COUNT")
      && metricContract(score.capacityRevenueMinorUnits, REVENUE_CALCULATION_FORMULAS.capacityRevenue, "MINOR_CURRENCY")
      && metricContract(score.contributionMarginBps, REVENUE_CALCULATION_FORMULAS.contributionMarginBps, "BASIS_POINTS")
      && metricContract(score.deliveryCapacityUnits, REVENUE_CALCULATION_FORMULAS.deliveryCapacity, "COUNT")
      && metricContract(score.netUnitRevenueMinorUnits, REVENUE_CALCULATION_FORMULAS.netUnitRevenue, "MINOR_CURRENCY")
      && metricContract(score.unitContributionMinorUnits, REVENUE_CALCULATION_FORMULAS.unitContribution, "MINOR_CURRENCY")
      && metricContract(score.variableUnitCostMinorUnits, REVENUE_CALCULATION_FORMULAS.variableUnitCost, "MINOR_CURRENCY"))
    && scorecard.experimentPriorities.every(({ priorityScore }) => metricContract(priorityScore, REVENUE_CALCULATION_FORMULAS.experimentPriority, "SCORE"));
}

function metricContract(metricValue: RevenueCalculatedMetric, formula: string, unit: RevenueCalculatedMetric["unit"]): boolean {
  return metricValue.formula === formula && metricValue.unit === unit;
}

function canonicalUnavailable(metricValue: RevenueCalculatedMetric, reasonCode: Extract<RevenueCalculatedMetric, { readonly status: "NOT_AVAILABLE" }>["reasonCode"], missingInputs: readonly string[]): boolean {
  return metricValue.status === "NOT_AVAILABLE" && metricValue.reasonCode === reasonCode && sameSequence(metricValue.missingInputs, missingInputs);
}

function offerScoreRelationsMatch(score: RevenueScorecard["offerScores"][number]): boolean {
  const contribution = score.unitContributionMinorUnits;
  if (score.netUnitRevenueMinorUnits.status === "CALCULATED" && score.variableUnitCostMinorUnits.status === "CALCULATED") {
    const expected = subtractSafeIntegers(score.netUnitRevenueMinorUnits.value, score.variableUnitCostMinorUnits.value);
    if (expected === null ? !canonicalUnavailable(contribution, "INVALID_INPUT", ["safeCalculatedValue"]) : !calculatedEquals(contribution, expected)) return false;
  } else if (!canonicalUnavailable(contribution, "NOT_AVAILABLE", missingCalculatedInputs([["netUnitRevenueMinorUnits", score.netUnitRevenueMinorUnits], ["variableUnitCostMinorUnits", score.variableUnitCostMinorUnits]]))) return false;

  const margin = score.contributionMarginBps;
  if (contribution.status === "CALCULATED" && score.netUnitRevenueMinorUnits.status === "CALCULATED" && score.netUnitRevenueMinorUnits.value > 0) {
    const expected = roundSafeIntegerRatio(contribution.value, 10_000, score.netUnitRevenueMinorUnits.value);
    if (expected === null ? !canonicalUnavailable(margin, "INVALID_INPUT", ["safeCalculatedValue"]) : !calculatedEquals(margin, expected)) return false;
  } else if (contribution.status === "CALCULATED" && score.netUnitRevenueMinorUnits.status === "CALCULATED") {
    if (!canonicalUnavailable(margin, "INVALID_INPUT", ["positiveNetUnitRevenueMinorUnits"])) return false;
  } else if (!canonicalUnavailable(margin, "NOT_AVAILABLE", missingCalculatedInputs([["unitContributionMinorUnits", contribution], ["netUnitRevenueMinorUnits", score.netUnitRevenueMinorUnits]]))) return false;

  const capacityRevenue = score.capacityRevenueMinorUnits;
  if (score.deliveryCapacityUnits.status === "CALCULATED" && score.netUnitRevenueMinorUnits.status === "CALCULATED") {
    const expected = multiplySafeIntegers(score.deliveryCapacityUnits.value, score.netUnitRevenueMinorUnits.value);
    if (expected === null ? !canonicalUnavailable(capacityRevenue, "INVALID_INPUT", ["safeCalculatedValue"]) : !calculatedEquals(capacityRevenue, expected)) return false;
  } else if (!canonicalUnavailable(capacityRevenue, "NOT_AVAILABLE", missingCalculatedInputs([["deliveryCapacityUnits", score.deliveryCapacityUnits], ["netUnitRevenueMinorUnits", score.netUnitRevenueMinorUnits]]))) return false;
  return true;
}

function missingCalculatedInputs(values: readonly (readonly [string, RevenueCalculatedMetric])[]): readonly string[] {
  return values.filter(([, metricValue]) => metricValue.status === "NOT_AVAILABLE").flatMap(([name, metricValue]) => metricValue.status === "NOT_AVAILABLE" ? [name, ...metricValue.missingInputs.map((item) => `${name}.${item}`)] : [name]);
}

function experimentRanksMatch(priorities: RevenueScorecard["experimentPriorities"]): boolean {
  const ranked = priorities
    .filter((item): item is typeof item & { readonly priorityScore: Extract<RevenueCalculatedMetric, { readonly status: "CALCULATED" }> } => item.priorityScore.status === "CALCULATED")
    .sort((left, right) => right.priorityScore.value - left.priorityScore.value || left.experimentId.localeCompare(right.experimentId));
  const expectedRank = new Map(ranked.map((item, index) => [item.experimentId, index + 1]));
  return priorities.every(({ experimentId, priorityScore, rank }) => priorityScore.status === "CALCULATED" ? rank === expectedRank.get(experimentId) : rank === null);
}

function calculatedEquals(metricValue: RevenueScorecard["pipelineCoverageBps"], expected: number): boolean {
  return metricValue.status === "CALCULATED" && metricValue.value === expected;
}

function offerScore(value: unknown): boolean {
  return record(value) && exact(value, ["breakEvenUnits", "capacityRevenueMinorUnits", "contributionMarginBps", "deliveryCapacityUnits", "netUnitRevenueMinorUnits", "offerId", "unitContributionMinorUnits", "variableUnitCostMinorUnits"]) && id(value.offerId) && calculatedMetric(value.breakEvenUnits) && calculatedMetric(value.capacityRevenueMinorUnits) && calculatedMetric(value.contributionMarginBps) && calculatedMetric(value.deliveryCapacityUnits) && calculatedMetric(value.netUnitRevenueMinorUnits) && calculatedMetric(value.unitContributionMinorUnits) && calculatedMetric(value.variableUnitCostMinorUnits);
}

function experimentPriority(value: unknown): boolean {
  return record(value) && exact(value, ["experimentId", "priorityScore", "rank"]) && id(value.experimentId) && calculatedMetric(value.priorityScore) && (value.rank === null || integer(value.rank, 1, 500)) && ((record(value.priorityScore) && value.priorityScore.status === "CALCULATED") === (value.rank !== null));
}

function calculatedMetric(value: unknown): boolean {
  if (!record(value) || typeof value.status !== "string" || !text(value.formula, 1, 500) || !["BASIS_POINTS", "COUNT", "HOURS", "MINOR_CURRENCY", "SCORE"].includes(String(value.unit))) return false;
  const integerUnit = value.unit === "BASIS_POINTS" || value.unit === "COUNT" || value.unit === "MINOR_CURRENCY";
  if (value.status === "CALCULATED") return exact(value, ["formula", "status", "unit", "value"]) && (integerUnit ? integer(value.value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : finite(value.value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  return value.status === "NOT_AVAILABLE" && exact(value, ["formula", "missingInputs", "reasonCode", "status", "unit"]) && strings(value.missingInputs, 1, 100, 500) && ["INVALID_INPUT", "NON_POSITIVE_CONTRIBUTION", "NOT_AVAILABLE"].includes(String(value.reasonCode));
}

function metric(value: unknown, minimum: number, maximum: number, integerOnly: boolean): boolean {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "AVAILABLE") return exact(value, ["provenance", "status", "value"]) && (integerOnly ? integer(value.value, minimum, maximum) : finite(value.value, minimum, maximum)) && provenance(value.provenance);
  return value.status === "NOT_AVAILABLE" && exact(value, ["note", "reasonCode", "status"]) && ["MISSING_INPUT", "NOT_AVAILABLE", "NOT_VERIFIED"].includes(String(value.reasonCode)) && text(value.note, 1, 1_000);
}

function provenance(value: unknown): boolean {
  return record(value) && exact(value, ["dataKind", "recordedAt", "sourceRef"]) && ["FABIO_SUPPLIED", "MEASURED", "VERIFIED_ESTIMATE"].includes(String(value.dataKind)) && timestamp(value.recordedAt) && text(value.sourceRef, 1, 1_000);
}

function economicsMatches(economics: OfferEconomics, offerValue: Offer | undefined, targetCurrency: string): boolean {
  if (offerValue?.currency !== economics.currency || economics.currency !== targetCurrency) return false;
  if (economics.unitPriceMinorUnits.status !== offerValue.priceMinorUnits.status) return false;
  return economics.unitPriceMinorUnits.status === "NOT_AVAILABLE" || (offerValue.priceMinorUnits.status === "AVAILABLE" && economics.unitPriceMinorUnits.value === offerValue.priceMinorUnits.value);
}

function opportunityReferences(opportunityValue: RevenueOpportunity, offers: ReadonlyMap<string, Offer>, stages: ReadonlyMap<string, FunnelStage>, leads: ReadonlySet<string>): boolean {
  if (!offers.has(opportunityValue.offerId) || (opportunityValue.leadId !== null && !leads.has(opportunityValue.leadId))) return false;
  const stage = stages.get(opportunityValue.stageId);
  if (stage === undefined) return false;
  return opportunityValue.status === "WON" || opportunityValue.status === "LOST" ? stage.kind === "OUTCOME" : stage.kind === "OPPORTUNITY";
}

function availableMetric(value: unknown): value is Extract<RevenueMetric, { readonly status: "AVAILABLE" }> {
  return record(value) && value.status === "AVAILABLE" && typeof value.value === "number";
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function array(value: unknown, predicate: (item: unknown) => boolean, minimum: number, maximum: number): boolean {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(predicate);
}

function text(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length >= minimum && value.length <= maximum;
}

function strings(value: unknown, minimum: number, maximum: number, maxLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((item) => text(item, 1, maxLength)) && !duplicates(value);
}

function ids(value: unknown, minimum: number, maximum: number): value is readonly string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(id) && !duplicates(value);
}

function enumStrings(value: unknown, allowed: readonly string[], minimum: number, maximum: number): boolean {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((item) => typeof item === "string" && allowed.includes(item)) && !duplicates(value);
}

function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function currency(value: unknown): value is string { return typeof value === "string" && CURRENCY.test(value); }
function version(value: unknown): boolean { return integer(value, 0, Number.MAX_SAFE_INTEGER); }
function integer(value: unknown, minimum: number, maximum: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function finite(value: unknown, minimum: number, maximum: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum; }

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 35) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function duplicates(values: readonly unknown[]): boolean {
  return new Set(values).size !== values.length;
}

function boundedJson(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return Buffer.byteLength(serialized, "utf8") <= MAX_JSON_BYTES;
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (record(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }
  return value;
}
