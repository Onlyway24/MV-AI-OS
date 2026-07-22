import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { DeterministicRevenuePlanningService } from "../../src/revenue-os/revenue-planning-service.js";
import type {
  ApprovalState,
  DeliveryCapacity,
  FunnelStage,
  Lead,
  Offer,
  OfferEconomics,
  RevenueExperiment,
  RevenueMetric,
  RevenueMission,
  RevenueOpportunity,
  RevenuePlan,
  RevenueTarget,
} from "../../src/revenue-os/revenue-os.js";
import {
  DeliveryCapacityValidator,
  OfferValidator,
  RevenueMissionValidator,
  RevenuePlanValidator,
  RevenueScorecardValidator,
} from "../../src/revenue-os/revenue-os-validator.js";

const NOW = "2026-07-21T08:00:00.000Z";
const LATER = "2026-08-21T08:00:00.000Z";

describe("Revenue Operating System V1 contracts", () => {
  it("ships a valid input template with every unknown business value explicit", async () => {
    const candidate = JSON.parse(await readFile(new URL("../../assets/revenue-os/revenue-mission-input.template.json", import.meta.url), "utf8")) as unknown;
    const result = new RevenueMissionValidator().validate(candidate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scorecard = new DeterministicRevenuePlanningService().evaluate(result.value);
    expect(scorecard.readiness).toBe("BLOCKED");
    expect(scorecard.blockingReasonCodes).toEqual(expect.arrayContaining(["NO_OFFERS", "PIPELINE_NOT_AVAILABLE", "TARGET_GAP_NOT_AVAILABLE"]));
    expect(scorecard.weightedPipelineMinorUnits.status).toBe("NOT_AVAILABLE");
    expect(scorecard.externalActionsExecuted).toBe(false);
  });

  it("accepts a strict JSON-safe aggregate, clones it, and freezes the validated read-model", () => {
    const source = mission();
    const result = new RevenueMissionValidator().validate(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(source);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.plan.offers)).toBe(true);
    expect(Object.isFrozen(result.value.plan.offers[0]?.approval)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(source);
  });

  it("fails closed for unknown keys, non-finite values, and an ACTIVE offer without Fabio approval", () => {
    const base = offer();
    expect(new OfferValidator().validate({ ...base, untrusted: true }).ok).toBe(false);
    expect(new OfferValidator().validate({ ...base, priceMinorUnits: available(Number.NaN) }).ok).toBe(false);
    expect(new OfferValidator().validate({ ...base, status: "ACTIVE" }).ok).toBe(false);
    expect(new OfferValidator().validate({ ...base, approval: approved(), status: "ACTIVE" }).ok).toBe(true);
  });

  it("rejects parallel external state and broken aggregate references", () => {
    const base = mission();
    expect(new RevenueMissionValidator().validate({ ...base, externalActionsExecuted: true }).ok).toBe(false);
    expect(new RevenueMissionValidator().validate({ ...base, plan: { ...base.plan, missionId: "other-mission" } }).ok).toBe(false);
    expect(new RevenuePlanValidator().validate({ ...base.plan, opportunities: [{ ...base.plan.opportunities[0], offerId: "missing-offer" }] }).ok).toBe(false);
    expect(new RevenuePlanValidator().validate({ ...base.plan, capacity: { ...base.plan.capacity, offerRequirements: [{ hoursPerDelivery: available(20), offerId: "missing-offer" }] } }).ok).toBe(false);
  });

  it("rejects impossible capacity instead of silently normalizing it", () => {
    const capacity = mission().plan.capacity;
    const impossible: DeliveryCapacity = { ...capacity, availableHours: available(10), reservedHours: available(11) };
    expect(new DeliveryCapacityValidator().validate(impossible).ok).toBe(false);
  });
});

describe("DeterministicRevenuePlanningService", () => {
  it("calculates break-even, delivery capacity, target gap, and pipeline coverage from explicit inputs", () => {
    const scorecard = new DeterministicRevenuePlanningService().evaluate(mission());
    expect(scorecard).toMatchObject({
      blockingReasonCodes: [],
      readiness: "READY_FOR_FABIO_REVIEW",
      targetGapMinorUnits: { status: "CALCULATED", value: 900_000 },
      weightedPipelineMinorUnits: { status: "CALCULATED", value: 300_000 },
      pipelineCoverageBps: { status: "CALCULATED", value: 3_333 },
    });
    expect(scorecard.offerScores[0]).toMatchObject({
      breakEvenUnits: { status: "CALCULATED", value: 2 },
      capacityRevenueMinorUnits: { status: "CALCULATED", value: 855_000 },
      contributionMarginBps: { status: "CALCULATED", value: 7_193 },
      deliveryCapacityUnits: { status: "CALCULATED", value: 3 },
      netUnitRevenueMinorUnits: { status: "CALCULATED", value: 285_000 },
      unitContributionMinorUnits: { status: "CALCULATED", value: 205_000 },
      variableUnitCostMinorUnits: { status: "CALCULATED", value: 80_000 },
    });
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
  });

  it("propagates every unknown input to NOT_AVAILABLE and returns precise blocker codes", () => {
    const base = mission();
    const unknownPrice = notAvailable("Fabio has not supplied a verified price.");
    const input: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        capacity: { ...base.plan.capacity, availableHours: notAvailable("Capacity not supplied.") },
        economics: [{ ...base.plan.economics[0], unitPriceMinorUnits: unknownPrice } as OfferEconomics],
        experiments: [{ ...base.plan.experiments[0], impactScore: notAvailable("Impact not measured.") } as RevenueExperiment],
        offers: [{ ...base.plan.offers[0], priceMinorUnits: unknownPrice } as Offer],
        opportunities: [{ ...base.plan.opportunities[0], estimatedValueMinorUnits: notAvailable("Value not verified.") } as RevenueOpportunity],
        target: { ...base.plan.target, targetRevenueMinorUnits: notAvailable("Target not supplied.") },
      },
    };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.readiness).toBe("BLOCKED");
    expect(scorecard.blockingReasonCodes).toEqual([
      "TARGET_GAP_NOT_AVAILABLE",
      "PIPELINE_NOT_AVAILABLE",
      "OFFER_ECONOMICS_NOT_AVAILABLE",
      "DELIVERY_CAPACITY_NOT_AVAILABLE",
      "EXPERIMENT_PRIORITY_NOT_AVAILABLE",
    ]);
    expect(scorecard.targetGapMinorUnits).toMatchObject({ missingInputs: ["targetRevenueMinorUnits"], reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" });
    expect(scorecard.offerScores[0]?.breakEvenUnits.status).toBe("NOT_AVAILABLE");
    expect(scorecard.experimentPriorities[0]).toMatchObject({ priorityScore: { status: "NOT_AVAILABLE" }, rank: null });
  });

  it("marks break-even NOT_AVAILABLE when contribution is non-positive", () => {
    const base = mission();
    const negativeContribution: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        economics: [{ ...base.plan.economics[0], acquisitionCostMinorUnits: available(400_000) } as OfferEconomics],
      },
    };
    const score = new DeterministicRevenuePlanningService().evaluate(negativeContribution).offerScores[0];
    expect(score?.unitContributionMinorUnits).toMatchObject({ status: "CALCULATED", value: -165_000 });
    expect(score?.breakEvenUnits).toMatchObject({ reasonCode: "NON_POSITIVE_CONTRIBUTION", status: "NOT_AVAILABLE" });
  });

  it("ranks experiments deterministically and breaks equal scores by stable identifier", () => {
    const base = mission();
    const first = experiment("experiment-b", 80, 75, 20);
    const second = experiment("experiment-a", 60, 100, 20);
    const third = experiment("experiment-top", 60, 90, 10);
    const input: RevenueMission = { ...base, plan: { ...base.plan, experiments: [first, second, third] } };
    const priorities = new DeterministicRevenuePlanningService().evaluate(input).experimentPriorities;
    expect(priorities.map(({ experimentId, priorityScore, rank }) => ({ experimentId, rank, value: priorityScore.status === "CALCULATED" ? priorityScore.value : null }))).toEqual([
      { experimentId: "experiment-b", rank: 3, value: 3 },
      { experimentId: "experiment-a", rank: 2, value: 3 },
      { experimentId: "experiment-top", rank: 1, value: 5.4 },
    ]);
  });

  it("calculates decimal delivery hours and two-decimal experiment scores exactly", () => {
    const base = mission();
    const input: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        capacity: {
          ...base.plan.capacity,
          availableHours: available(0.3),
          maxConcurrentDeliveries: available(10),
          offerRequirements: [{ hoursPerDelivery: available(0.1), offerId: "offer-one" }],
          reservedHours: available(0),
        },
        experiments: [experiment("experiment-decimal", 67, 3, 2)],
      },
    };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.offerScores[0]?.deliveryCapacityUnits).toMatchObject({ status: "CALCULATED", value: 3 });
    expect(scorecard.experimentPriorities[0]?.priorityScore).toMatchObject({ status: "CALCULATED", value: 1.01 });
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
  });

  it("does not let an explicitly LOST opportunity with unknown values poison the open pipeline", () => {
    const base = mission();
    const primary = base.plan.opportunities[0];
    if (primary === undefined) throw new Error("Revenue fixture requires one opportunity");
    const lost: RevenueOpportunity = {
      ...primary,
      estimatedValueMinorUnits: notAvailable("Lost opportunity has no verified value."),
      opportunityId: "opportunity-lost",
      probabilityBps: notAvailable("Lost opportunity has no probability."),
      stageId: "outcome",
      status: "LOST",
    };
    const input: RevenueMission = { ...base, plan: { ...base.plan, opportunities: [...base.plan.opportunities, lost] } };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    expect(new DeterministicRevenuePlanningService().evaluate(input).weightedPipelineMinorUnits).toMatchObject({ status: "CALCULATED", value: 300_000 });
  });

  it("keeps already WON revenue out of the open weighted pipeline", () => {
    const base = mission();
    const primary = base.plan.opportunities[0];
    if (primary === undefined) throw new Error("Revenue fixture requires one opportunity");
    const won: RevenueOpportunity = {
      ...primary,
      estimatedValueMinorUnits: notAvailable("Won revenue is reconciled outside the open pipeline."),
      probabilityBps: notAvailable("Won revenue has no open probability."),
      stageId: "outcome",
      status: "WON",
    };
    const input: RevenueMission = { ...base, plan: { ...base.plan, opportunities: [won] } };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    expect(new DeterministicRevenuePlanningService().evaluate(input).weightedPipelineMinorUnits).toMatchObject({ status: "CALCULATED", value: 0 });
  });

  it("uses exact integer arithmetic before rounding currency and basis-point products", () => {
    const base = mission();
    const sourceOffer = base.plan.offers[0];
    const sourceEconomics = base.plan.economics[0];
    const primary = base.plan.opportunities[0];
    if (sourceOffer === undefined || sourceEconomics === undefined || primary === undefined) throw new Error("Revenue fixture requires one complete offer");
    const maximum = Number.MAX_SAFE_INTEGER;
    const exactRoundedHalf = 4_503_599_627_370_496;
    const expensiveOffer: Offer = { ...sourceOffer, priceMinorUnits: available(maximum) };
    const input: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        capacity: {
          ...base.plan.capacity,
          availableHours: available(20),
          maxConcurrentDeliveries: available(1),
          offerRequirements: [{ hoursPerDelivery: available(20), offerId: expensiveOffer.offerId }],
          reservedHours: available(0),
        },
        economics: [{
          ...sourceEconomics,
          acquisitionCostMinorUnits: available(0),
          allocatedFixedCostsMinorUnits: available(0),
          refundRateBps: available(5_000),
          unitPriceMinorUnits: available(maximum),
          variableDeliveryCostMinorUnits: available(0),
        }],
        offers: [expensiveOffer],
        opportunities: [{ ...primary, estimatedValueMinorUnits: available(maximum), probabilityBps: available(5_000) }],
      },
    };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.offerScores[0]?.netUnitRevenueMinorUnits).toMatchObject({ status: "CALCULATED", value: exactRoundedHalf });
    expect(scorecard.weightedPipelineMinorUnits).toMatchObject({ status: "CALCULATED", value: exactRoundedHalf });
    expect(scorecard.offerScores[0]?.capacityRevenueMinorUnits).toMatchObject({ status: "CALCULATED", value: exactRoundedHalf });
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
  });

  it("fails calculated aggregates closed when valid inputs would overflow safe integers", () => {
    const base = mission();
    const primary = base.plan.opportunities[0];
    const sourceOffer = base.plan.offers[0];
    const sourceEconomics = base.plan.economics[0];
    if (primary === undefined || sourceOffer === undefined || sourceEconomics === undefined) throw new Error("Revenue fixture requires one complete offer");
    const maximum = Number.MAX_SAFE_INTEGER;
    const expensiveOffer: Offer = { ...sourceOffer, priceMinorUnits: available(maximum) };
    const expensiveEconomics: OfferEconomics = {
      ...sourceEconomics,
      acquisitionCostMinorUnits: available(0),
      refundRateBps: available(0),
      unitPriceMinorUnits: available(maximum),
      variableDeliveryCostMinorUnits: available(0),
    };
    const secondOpportunity: RevenueOpportunity = { ...primary, estimatedValueMinorUnits: available(maximum), opportunityId: "opportunity-two", probabilityBps: available(10_000), status: "COMMITTED" };
    const input: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        capacity: {
          ...base.plan.capacity,
          availableHours: available(100_000),
          maxConcurrentDeliveries: available(1_000_000),
          offerRequirements: [{ hoursPerDelivery: available(0.01), offerId: expensiveOffer.offerId }],
          reservedHours: available(0),
        },
        economics: [expensiveEconomics],
        offers: [expensiveOffer],
        opportunities: [{ ...primary, estimatedValueMinorUnits: available(maximum), probabilityBps: available(10_000) }, secondOpportunity],
      },
    };
    expect(new RevenueMissionValidator().validate(input).ok).toBe(true);
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.offerScores[0]?.capacityRevenueMinorUnits).toMatchObject({ missingInputs: ["safeCalculatedValue"], reasonCode: "INVALID_INPUT", status: "NOT_AVAILABLE" });
    expect(scorecard.weightedPipelineMinorUnits).toMatchObject({ missingInputs: ["safeCalculatedValue"], reasonCode: "INVALID_INPUT", status: "NOT_AVAILABLE" });
    expect(scorecard.blockingReasonCodes).toEqual(expect.arrayContaining(["OFFER_ECONOMICS_NOT_AVAILABLE", "PIPELINE_NOT_AVAILABLE"]));
    expect(scorecard.readiness).toBe("BLOCKED");
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
    const offerScore = scorecard.offerScores[0];
    if (offerScore?.capacityRevenueMinorUnits.status !== "NOT_AVAILABLE") throw new Error("Overflow fixture must block capacity revenue");
    expect(new RevenueScorecardValidator().validate({
      ...scorecard,
      offerScores: [{ ...offerScore, capacityRevenueMinorUnits: { ...offerScore.capacityRevenueMinorUnits, missingInputs: ["fabricated"], reasonCode: "NOT_AVAILABLE" } }],
    }).ok).toBe(false);
  });

  it("blocks a pipeline coverage ratio that cannot fit in a safe integer", () => {
    const base = mission();
    const primary = base.plan.opportunities[0];
    if (primary === undefined) throw new Error("Revenue fixture requires one opportunity");
    const input: RevenueMission = {
      ...base,
      plan: {
        ...base.plan,
        opportunities: [{ ...primary, estimatedValueMinorUnits: available(Number.MAX_SAFE_INTEGER), probabilityBps: available(10_000) }],
        target: { ...base.plan.target, recognizedRevenueMinorUnits: available(0), targetRevenueMinorUnits: available(1) },
      },
    };
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.weightedPipelineMinorUnits).toMatchObject({ status: "CALCULATED", value: Number.MAX_SAFE_INTEGER });
    expect(scorecard.pipelineCoverageBps).toMatchObject({ missingInputs: ["safeCalculatedValue"], reasonCode: "INVALID_INPUT", status: "NOT_AVAILABLE" });
    expect(scorecard.blockingReasonCodes).toContain("PIPELINE_COVERAGE_NOT_AVAILABLE");
    expect(scorecard.readiness).toBe("BLOCKED");
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, pipelineCoverageBps: { ...scorecard.pipelineCoverageBps, missingInputs: ["fabricated"], reasonCode: "NOT_AVAILABLE" } }).ok).toBe(false);
  });

  it("treats an empty pipeline as NOT_AVAILABLE because completeness is not evidenced", () => {
    const base = mission();
    const input: RevenueMission = { ...base, plan: { ...base.plan, leads: [], opportunities: [] } };
    const scorecard = new DeterministicRevenuePlanningService().evaluate(input);
    expect(scorecard.weightedPipelineMinorUnits).toMatchObject({ missingInputs: ["opportunities"], status: "NOT_AVAILABLE" });
    expect(scorecard.blockingReasonCodes).toContain("PIPELINE_NOT_AVAILABLE");
  });

  it("validates scorecards fail-closed after calculation", () => {
    const scorecard = new DeterministicRevenuePlanningService().evaluate(mission());
    const offerScore = scorecard.offerScores[0];
    if (offerScore?.unitContributionMinorUnits.status !== "CALCULATED") throw new Error("Revenue score fixture must be calculated");
    expect(new RevenueScorecardValidator().validate({ ...scorecard, shadowTotal: 1 }).ok).toBe(false);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, readiness: "BLOCKED" }).ok).toBe(false);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, pipelineCoverageBps: { ...scorecard.pipelineCoverageBps, value: 999_999 } }).ok).toBe(false);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, pipelineCoverageBps: { ...scorecard.pipelineCoverageBps, formula: "fabricated" } }).ok).toBe(false);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, pipelineCoverageBps: { ...scorecard.pipelineCoverageBps, unit: "COUNT" } }).ok).toBe(false);
    expect(new RevenueScorecardValidator().validate({ ...scorecard, offerScores: [{ ...offerScore, unitContributionMinorUnits: { ...offerScore.unitContributionMinorUnits, value: 1 } }] }).ok).toBe(false);

    const base = mission();
    const blocked = new DeterministicRevenuePlanningService().evaluate({
      ...base,
      plan: { ...base.plan, target: { ...base.plan.target, targetRevenueMinorUnits: notAvailable("Target not supplied.") } },
    });
    expect(new RevenueScorecardValidator().validate({ ...blocked, blockingReasonCodes: [], readiness: "READY_FOR_FABIO_REVIEW" }).ok).toBe(false);
  });

  it("binds experiment ranks to score order and stable identifier tie-breaking", () => {
    const base = mission();
    const scorecard = new DeterministicRevenuePlanningService().evaluate({
      ...base,
      plan: {
        ...base.plan,
        experiments: [experiment("experiment-high", 100, 100, 10), experiment("experiment-low", 50, 100, 10)],
      },
    });
    const first = scorecard.experimentPriorities[0];
    const second = scorecard.experimentPriorities[1];
    if (first?.rank === null || first?.rank === undefined || second?.rank === null || second?.rank === undefined) throw new Error("Rank fixture must be calculated");
    expect(new RevenueScorecardValidator().validate(scorecard).ok).toBe(true);
    expect(new RevenueScorecardValidator().validate({
      ...scorecard,
      experimentPriorities: [{ ...first, rank: second.rank }, { ...second, rank: first.rank }],
    }).ok).toBe(false);
  });
});

function mission(): RevenueMission {
  const missionId = "revenue-mission-v1";
  const primaryOffer = offer();
  const stages: readonly FunnelStage[] = [
    { contractVersion: "1", entryCriteria: ["Lead acquired locally"], exitCriteria: ["Qualification recorded"], kind: "LEAD", label: "Lead", order: 0, stageId: "lead", terminal: false, version: 0 },
    { contractVersion: "1", entryCriteria: ["Qualification complete"], exitCriteria: ["Commercial outcome recorded"], kind: "OPPORTUNITY", label: "Opportunity", order: 1, stageId: "opportunity", terminal: false, version: 0 },
    { contractVersion: "1", entryCriteria: ["Commercial decision recorded"], exitCriteria: ["No further transition"], kind: "OUTCOME", label: "Outcome", order: 2, stageId: "outcome", terminal: true, version: 0 },
  ];
  const primaryLead: Lead = { approval: draftApproval(), contractVersion: "1", displayName: "Qualified local lead", externalActionsExecuted: false, leadId: "lead-one", offerInterestIds: [primaryOffer.offerId], source: "Fabio local input", stageId: "lead", status: "QUALIFIED", storageScope: "LOCAL_ONLY", version: 0 };
  const primaryOpportunity: RevenueOpportunity = { approval: draftApproval(), contractVersion: "1", displayName: "Local pilot opportunity", estimatedValueMinorUnits: available(600_000), externalActionsExecuted: false, leadId: primaryLead.leadId, nextAction: "Prepare a local proposal for Fabio review", offerId: primaryOffer.offerId, opportunityId: "opportunity-one", probabilityBps: available(5_000), stageId: "opportunity", status: "OPEN", storageScope: "LOCAL_ONLY", version: 0 };
  const target: RevenueTarget = { approval: draftApproval(), contractVersion: "1", currency: "EUR", endsAt: LATER, period: "MONTH", recognizedRevenueMinorUnits: available(300_000), startsAt: NOW, targetId: "target-one", targetRevenueMinorUnits: available(1_200_000), version: 0 };
  const capacity: DeliveryCapacity = { availableHours: available(80), contractVersion: "1", endsAt: LATER, maxConcurrentDeliveries: available(4), offerRequirements: [{ hoursPerDelivery: available(20), offerId: primaryOffer.offerId }], period: "MONTH", reservedHours: available(16), startsAt: NOW, version: 0 };
  const plan: RevenuePlan = {
    approval: draftApproval(),
    capacity,
    contractVersion: "1",
    economics: [economics()],
    experiments: [experiment("experiment-one", 80, 75, 20)],
    funnelStages: stages,
    leads: [primaryLead],
    missionId,
    offers: [primaryOffer],
    opportunities: [primaryOpportunity],
    planId: "revenue-plan-v1",
    status: "DRAFT",
    target,
    version: 0,
  };
  return { actorId: "fabio", approval: draftApproval(), contractVersion: "1", createdAt: NOW, externalActionsAllowed: false, externalActionsExecuted: false, missionId, objective: "Build a verified local revenue plan without invented numbers", plan, updatedAt: NOW, version: 0, workspaceId: "onlyway" };
}

function offer(): Offer {
  return { approval: draftApproval(), audience: "Italian founders who need an evidence-led operating system", contractVersion: "1", currency: "EUR", deliverables: ["Revenue diagnosis", "Execution plan"], exclusions: ["Guaranteed financial results"], name: "Onlyway Revenue Pilot", offerId: "offer-one", outcome: "A reviewable revenue operating plan", priceMinorUnits: available(300_000), status: "DRAFT", version: 0 };
}

function economics(): OfferEconomics {
  return { acquisitionCostMinorUnits: available(30_000), allocatedFixedCostsMinorUnits: available(410_000), contractVersion: "1", currency: "EUR", offerId: "offer-one", refundRateBps: available(500), unitPriceMinorUnits: available(300_000), variableDeliveryCostMinorUnits: available(50_000), version: 0 };
}

function experiment(experimentId: string, impact: number, confidence: number, effort: number): RevenueExperiment {
  return { approval: draftApproval(), confidenceScore: available(confidence), contractVersion: "1", effortScore: available(effort), executionMode: "LOCAL_ONLY", experimentId, externalActionsExecuted: false, hypothesis: "A verified offer will create a measurable local conversion signal", impactScore: available(impact), maxBudgetMinorUnits: available(0), offerId: "offer-one", primaryMetric: "Qualified responses", status: "DRAFT", successThreshold: "Threshold must be supplied by Fabio before execution", version: 0 };
}

function available(value: number): RevenueMetric {
  return { provenance: { dataKind: "FABIO_SUPPLIED", recordedAt: NOW, sourceRef: "tests.explicit-input" }, status: "AVAILABLE", value };
}

function notAvailable(note: string): RevenueMetric {
  return { note, reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" };
}

function draftApproval(): ApprovalState { return { contractVersion: "1", status: "DRAFT", version: 0 }; }
function approved(): ApprovalState { return { contractVersion: "1", decidedAt: NOW, decidedBy: "FABIO", note: "Explicit test approval.", status: "APPROVED_BY_FABIO", version: 1 }; }
