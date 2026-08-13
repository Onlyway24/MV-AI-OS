import {
  REVENUE_CALCULATION_FORMULAS,
  type DeliveryCapacity,
  type OfferEconomics,
  type OfferRevenueScore,
  type RevenueCalculatedMetric,
  type RevenueExperiment,
  type RevenueExperimentPriority,
  type RevenueMetric,
  type RevenueMission,
  type RevenueOpportunity,
  type RevenueScorecard,
} from "./revenue-os.js";
import {
  addSafeIntegers,
  ceilSafeIntegerRatio,
  floorSafeDecimalDifferenceRatio,
  multiplySafeIntegers,
  roundRevenueExperimentPriority,
  roundSafeIntegerRatio,
  subtractSafeIntegers,
  sumSafeIntegers,
} from "./revenue-math.js";

const FORMULAS = REVENUE_CALCULATION_FORMULAS;

export class DeterministicRevenuePlanningService {
  public evaluate(mission: RevenueMission): RevenueScorecard {
    const scoreByOffer = new Map(mission.plan.economics.map((economics) => [economics.offerId, this.#offerScore(economics, mission.plan.capacity)]));
    const offerScores = Object.freeze(mission.plan.offers.map(({ offerId }) => scoreByOffer.get(offerId) ?? unavailableOfferScore(offerId, ["economics"])));
    const targetGapMinorUnits = targetGap(mission.plan.target.targetRevenueMinorUnits, mission.plan.target.recognizedRevenueMinorUnits);
    const weightedPipelineMinorUnits = weightedPipeline(mission.plan.opportunities);
    const pipelineCoverageBps = pipelineCoverage(weightedPipelineMinorUnits, targetGapMinorUnits);
    const experimentPriorities = priorities(mission.plan.experiments);
    const blockingReasonCodes: RevenueScorecard["blockingReasonCodes"][number][] = [];
    if (offerScores.length === 0) blockingReasonCodes.push("NO_OFFERS");
    if (targetGapMinorUnits.status === "NOT_AVAILABLE") blockingReasonCodes.push("TARGET_GAP_NOT_AVAILABLE");
    if (weightedPipelineMinorUnits.status === "NOT_AVAILABLE") blockingReasonCodes.push("PIPELINE_NOT_AVAILABLE");
    if (targetGapMinorUnits.status === "CALCULATED" && weightedPipelineMinorUnits.status === "CALCULATED" && pipelineCoverageBps.status === "NOT_AVAILABLE") blockingReasonCodes.push("PIPELINE_COVERAGE_NOT_AVAILABLE");
    if (offerScores.some((score) => economicsUnavailable(score))) blockingReasonCodes.push("OFFER_ECONOMICS_NOT_AVAILABLE");
    if (offerScores.some(({ deliveryCapacityUnits }) => deliveryCapacityUnits.status === "NOT_AVAILABLE")) blockingReasonCodes.push("DELIVERY_CAPACITY_NOT_AVAILABLE");
    if (experimentPriorities.some(({ priorityScore }) => priorityScore.status === "NOT_AVAILABLE")) blockingReasonCodes.push("EXPERIMENT_PRIORITY_NOT_AVAILABLE");
    const uniqueReasons = Object.freeze([...new Set(blockingReasonCodes)]);
    return Object.freeze({
      blockingReasonCodes: uniqueReasons,
      contractVersion: "1",
      evaluatedAt: mission.updatedAt,
      experimentPriorities,
      externalActionsExecuted: false,
      missionId: mission.missionId,
      offerScores,
      pipelineCoverageBps,
      planId: mission.plan.planId,
      readiness: uniqueReasons.length === 0 ? "READY_FOR_FABIO_REVIEW" : "BLOCKED",
      targetGapMinorUnits,
      version: 0,
      weightedPipelineMinorUnits,
    });
  }

  #offerScore(economics: OfferEconomics, capacity: DeliveryCapacity): OfferRevenueScore {
    const netUnitRevenueMinorUnits = netUnitRevenue(economics.unitPriceMinorUnits, economics.refundRateBps);
    const variableUnitCostMinorUnits = addMetrics(economics.variableDeliveryCostMinorUnits, economics.acquisitionCostMinorUnits, FORMULAS.variableUnitCost, ["variableDeliveryCostMinorUnits", "acquisitionCostMinorUnits"]);
    const unitContributionMinorUnits = subtractCalculated(netUnitRevenueMinorUnits, variableUnitCostMinorUnits, FORMULAS.unitContribution);
    const contributionMarginBps = ratioBps(unitContributionMinorUnits, netUnitRevenueMinorUnits, FORMULAS.contributionMarginBps);
    const breakEvenUnits = breakEven(economics.allocatedFixedCostsMinorUnits, unitContributionMinorUnits);
    const deliveryCapacityUnits = deliveryCapacity(economics.offerId, capacity);
    const capacityRevenueMinorUnits = multiplyCalculated(deliveryCapacityUnits, netUnitRevenueMinorUnits, FORMULAS.capacityRevenue, "MINOR_CURRENCY");
    return Object.freeze({
      breakEvenUnits,
      capacityRevenueMinorUnits,
      contributionMarginBps,
      deliveryCapacityUnits,
      netUnitRevenueMinorUnits,
      offerId: economics.offerId,
      unitContributionMinorUnits,
      variableUnitCostMinorUnits,
    });
  }
}

function netUnitRevenue(price: RevenueMetric, refundRateBps: RevenueMetric): RevenueCalculatedMetric {
  const missing = missingMetrics([["unitPriceMinorUnits", price], ["refundRateBps", refundRateBps]]);
  if (missing.length > 0) return unavailable(FORMULAS.netUnitRevenue, "MINOR_CURRENCY", missing);
  return safeCalculated(FORMULAS.netUnitRevenue, "MINOR_CURRENCY", roundSafeIntegerRatio(available(price), 10_000 - available(refundRateBps), 10_000));
}

function addMetrics(left: RevenueMetric, right: RevenueMetric, formula: string, names: readonly [string, string]): RevenueCalculatedMetric {
  const missing = missingMetrics([[names[0], left], [names[1], right]]);
  return missing.length > 0 ? unavailable(formula, "MINOR_CURRENCY", missing) : safeCalculated(formula, "MINOR_CURRENCY", addSafeIntegers(available(left), available(right)));
}

function subtractCalculated(left: RevenueCalculatedMetric, right: RevenueCalculatedMetric, formula: string): RevenueCalculatedMetric {
  const missing = missingCalculated([["netUnitRevenueMinorUnits", left], ["variableUnitCostMinorUnits", right]]);
  return missing.length > 0 ? unavailable(formula, "MINOR_CURRENCY", missing) : safeCalculated(formula, "MINOR_CURRENCY", subtractSafeIntegers(calculatedValue(left), calculatedValue(right)));
}

function ratioBps(numerator: RevenueCalculatedMetric, denominator: RevenueCalculatedMetric, formula: string): RevenueCalculatedMetric {
  const missing = missingCalculated([["unitContributionMinorUnits", numerator], ["netUnitRevenueMinorUnits", denominator]]);
  if (missing.length > 0) return unavailable(formula, "BASIS_POINTS", missing);
  if (calculatedValue(denominator) <= 0) return unavailable(formula, "BASIS_POINTS", ["positiveNetUnitRevenueMinorUnits"], "INVALID_INPUT");
  return safeCalculated(formula, "BASIS_POINTS", roundSafeIntegerRatio(calculatedValue(numerator), 10_000, calculatedValue(denominator)));
}

function breakEven(fixed: RevenueMetric, contribution: RevenueCalculatedMetric): RevenueCalculatedMetric {
  const missing = [...missingMetrics([["allocatedFixedCostsMinorUnits", fixed]]), ...missingCalculated([["unitContributionMinorUnits", contribution]])];
  if (missing.length > 0) return unavailable(FORMULAS.breakEven, "COUNT", missing);
  if (calculatedValue(contribution) <= 0) return unavailable(FORMULAS.breakEven, "COUNT", ["positiveUnitContributionMinorUnits"], "NON_POSITIVE_CONTRIBUTION");
  return safeCalculated(FORMULAS.breakEven, "COUNT", ceilSafeIntegerRatio(available(fixed), calculatedValue(contribution)));
}

function deliveryCapacity(offerId: string, capacity: DeliveryCapacity): RevenueCalculatedMetric {
  const requirement = capacity.offerRequirements.find((item) => item.offerId === offerId);
  if (requirement === undefined) return unavailable(FORMULAS.deliveryCapacity, "COUNT", ["hoursPerDelivery"]);
  const missing = missingMetrics([
    ["availableHours", capacity.availableHours],
    ["reservedHours", capacity.reservedHours],
    ["maxConcurrentDeliveries", capacity.maxConcurrentDeliveries],
    ["hoursPerDelivery", requirement.hoursPerDelivery],
  ]);
  if (missing.length > 0) return unavailable(FORMULAS.deliveryCapacity, "COUNT", missing);
  const availableHours = available(capacity.availableHours);
  const reservedHours = available(capacity.reservedHours);
  const hours = available(requirement.hoursPerDelivery);
  if (availableHours < reservedHours || hours <= 0) return unavailable(FORMULAS.deliveryCapacity, "COUNT", [availableHours < reservedHours ? "nonNegativeUsableHours" : "positiveHoursPerDelivery"], "INVALID_INPUT");
  const units = floorSafeDecimalDifferenceRatio(availableHours, reservedHours, hours);
  return safeCalculated(FORMULAS.deliveryCapacity, "COUNT", units === null ? null : Math.min(units, available(capacity.maxConcurrentDeliveries)));
}

function targetGap(target: RevenueMetric, recognized: RevenueMetric): RevenueCalculatedMetric {
  const missing = missingMetrics([["targetRevenueMinorUnits", target], ["recognizedRevenueMinorUnits", recognized]]);
  if (missing.length > 0) return unavailable(FORMULAS.targetGap, "MINOR_CURRENCY", missing);
  const difference = subtractSafeIntegers(available(target), available(recognized));
  return safeCalculated(FORMULAS.targetGap, "MINOR_CURRENCY", difference === null ? null : Math.max(difference, 0));
}

function weightedPipeline(opportunities: readonly RevenueOpportunity[]): RevenueCalculatedMetric {
  if (opportunities.length === 0) return unavailable(FORMULAS.weightedPipeline, "MINOR_CURRENCY", ["opportunities"]);
  const eligible = opportunities.filter(({ status }) => status === "OPEN" || status === "COMMITTED");
  const missing = eligible.flatMap((opportunity) => missingMetrics([
    [`opportunities.${opportunity.opportunityId}.estimatedValueMinorUnits`, opportunity.estimatedValueMinorUnits],
    [`opportunities.${opportunity.opportunityId}.probabilityBps`, opportunity.probabilityBps],
  ]));
  if (missing.length > 0) return unavailable(FORMULAS.weightedPipeline, "MINOR_CURRENCY", missing);
  const weightedValues: number[] = [];
  for (const opportunity of eligible) {
    const value = roundSafeIntegerRatio(available(opportunity.estimatedValueMinorUnits), available(opportunity.probabilityBps), 10_000);
    if (value === null) return unavailable(FORMULAS.weightedPipeline, "MINOR_CURRENCY", ["safeCalculatedValue"], "INVALID_INPUT");
    weightedValues.push(value);
  }
  return safeCalculated(FORMULAS.weightedPipeline, "MINOR_CURRENCY", sumSafeIntegers(weightedValues));
}

function pipelineCoverage(pipeline: RevenueCalculatedMetric, gap: RevenueCalculatedMetric): RevenueCalculatedMetric {
  const missing = missingCalculated([["weightedPipelineMinorUnits", pipeline], ["targetGapMinorUnits", gap]]);
  if (missing.length > 0) return unavailable(FORMULAS.pipelineCoverage, "BASIS_POINTS", missing);
  if (calculatedValue(gap) === 0) return calculated(FORMULAS.pipelineCoverage, "BASIS_POINTS", 10_000);
  return safeCalculated(FORMULAS.pipelineCoverage, "BASIS_POINTS", roundSafeIntegerRatio(calculatedValue(pipeline), 10_000, calculatedValue(gap)));
}

function priorities(experiments: readonly RevenueExperiment[]): readonly RevenueExperimentPriority[] {
  const unsorted = experiments.map((experiment) => {
    const missing = missingMetrics([["impactScore", experiment.impactScore], ["confidenceScore", experiment.confidenceScore], ["effortScore", experiment.effortScore]]);
    const priorityScore = missing.length > 0
      ? unavailable(FORMULAS.experimentPriority, "SCORE", missing)
      : available(experiment.effortScore) <= 0
        ? unavailable(FORMULAS.experimentPriority, "SCORE", ["positiveEffortScore"], "INVALID_INPUT")
        : safeCalculated(FORMULAS.experimentPriority, "SCORE", roundRevenueExperimentPriority(available(experiment.impactScore), available(experiment.confidenceScore), available(experiment.effortScore)));
    return { experimentId: experiment.experimentId, priorityScore };
  });
  const ranked = unsorted.filter((item): item is { readonly experimentId: string; readonly priorityScore: Extract<RevenueCalculatedMetric, { readonly status: "CALCULATED" }> } => item.priorityScore.status === "CALCULATED").sort((left, right) => right.priorityScore.value - left.priorityScore.value || left.experimentId.localeCompare(right.experimentId));
  const rankById = new Map(ranked.map((item, index) => [item.experimentId, index + 1]));
  return Object.freeze(unsorted.map((item) => Object.freeze({ ...item, rank: rankById.get(item.experimentId) ?? null })));
}

function multiplyCalculated(left: RevenueCalculatedMetric, right: RevenueCalculatedMetric, formula: string, unit: Extract<RevenueCalculatedMetric, { readonly status: "CALCULATED" }>["unit"]): RevenueCalculatedMetric {
  const missing = missingCalculated([["deliveryCapacityUnits", left], ["netUnitRevenueMinorUnits", right]]);
  return missing.length > 0 ? unavailable(formula, unit, missing) : safeCalculated(formula, unit, multiplySafeIntegers(calculatedValue(left), calculatedValue(right)));
}

function unavailableOfferScore(offerId: string, missingInputs: readonly string[]): OfferRevenueScore {
  return Object.freeze({
    breakEvenUnits: unavailable(FORMULAS.breakEven, "COUNT", missingInputs),
    capacityRevenueMinorUnits: unavailable(FORMULAS.capacityRevenue, "MINOR_CURRENCY", missingInputs),
    contributionMarginBps: unavailable(FORMULAS.contributionMarginBps, "BASIS_POINTS", missingInputs),
    deliveryCapacityUnits: unavailable(FORMULAS.deliveryCapacity, "COUNT", missingInputs),
    netUnitRevenueMinorUnits: unavailable(FORMULAS.netUnitRevenue, "MINOR_CURRENCY", missingInputs),
    offerId,
    unitContributionMinorUnits: unavailable(FORMULAS.unitContribution, "MINOR_CURRENCY", missingInputs),
    variableUnitCostMinorUnits: unavailable(FORMULAS.variableUnitCost, "MINOR_CURRENCY", missingInputs),
  });
}

function economicsUnavailable(score: OfferRevenueScore): boolean {
  return [score.breakEvenUnits, score.capacityRevenueMinorUnits, score.contributionMarginBps, score.netUnitRevenueMinorUnits, score.unitContributionMinorUnits, score.variableUnitCostMinorUnits].some(({ status }) => status === "NOT_AVAILABLE");
}

function missingMetrics(values: readonly (readonly [string, RevenueMetric])[]): string[] {
  return values.filter(([, metric]) => metric.status === "NOT_AVAILABLE").map(([name]) => name);
}

function missingCalculated(values: readonly (readonly [string, RevenueCalculatedMetric])[]): string[] {
  return values.filter(([, metric]) => metric.status === "NOT_AVAILABLE").flatMap(([name, metric]) => metric.status === "NOT_AVAILABLE" ? [name, ...metric.missingInputs.map((item) => `${name}.${item}`)] : [name]);
}

function available(metric: RevenueMetric): number {
  if (metric.status !== "AVAILABLE") throw new Error("Revenue metric is not available");
  return metric.value;
}

function calculatedValue(metric: RevenueCalculatedMetric): number {
  if (metric.status !== "CALCULATED") throw new Error("Revenue metric is not calculated");
  return metric.value;
}

function calculated(formula: string, unit: Extract<RevenueCalculatedMetric, { readonly status: "CALCULATED" }>["unit"], value: number): RevenueCalculatedMetric {
  const integerUnit = unit === "BASIS_POINTS" || unit === "COUNT" || unit === "MINOR_CURRENCY";
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (integerUnit && !Number.isSafeInteger(value))) {
    return unavailable(formula, unit, ["safeCalculatedValue"], "INVALID_INPUT");
  }
  return Object.freeze({ formula, status: "CALCULATED", unit, value });
}

function safeCalculated(formula: string, unit: Extract<RevenueCalculatedMetric, { readonly status: "CALCULATED" }>["unit"], value: number | null): RevenueCalculatedMetric {
  return value === null ? unavailable(formula, unit, ["safeCalculatedValue"], "INVALID_INPUT") : calculated(formula, unit, value);
}

function unavailable(formula: string, unit: Extract<RevenueCalculatedMetric, { readonly status: "NOT_AVAILABLE" }>["unit"], missingInputs: readonly string[], reasonCode: Extract<RevenueCalculatedMetric, { readonly status: "NOT_AVAILABLE" }>["reasonCode"] = "NOT_AVAILABLE"): RevenueCalculatedMetric {
  return Object.freeze({ formula, missingInputs: Object.freeze([...new Set(missingInputs)]), reasonCode, status: "NOT_AVAILABLE", unit });
}
