import { describe, expect, it } from "vitest";

import { CAPITAL_BOARD_CRITERIA, DeterministicCapitalBoard, type CapitalBoardCriterionInput } from "../../src/venture-holding/capital-board.js";
import { OpportunityRadarService, type OpportunityRadarCandidate, type RadarDatum } from "../../src/venture-holding/opportunity-radar.js";
import { DeterministicVentureEconomicsEngine, type VentureEconomicBps, type VentureEconomicValue, type VentureEconomicsScenarioInput } from "../../src/venture-holding/venture-economics.js";
import { DeterministicVentureExperimentEngine, type VentureExperimentPlan } from "../../src/venture-holding/venture-experiment-engine.js";
import { DeterministicVentureLaunchPackFactory, type VentureLaunchDatum, type VentureLaunchPackInput } from "../../src/venture-holding/venture-launch-pack.js";
import { compareVentureScorecards, DeterministicVentureScorecardService, VENTURE_SCORE_CRITERIA, type VentureCriterionInput, type VentureScorePolicy } from "../../src/venture-holding/venture-scorecard.js";

describe("Onlyway Venture scorecard and Opportunity Radar", () => {
  it("scores all fifteen criteria transparently and ranks only non-tied thesis candidates", () => {
    const service = new DeterministicVentureScorecardService();
    const first = service.evaluate({ criteria: criteria(8_000), opportunityId: "opportunity-a", policy: policy(7_000) });
    const second = service.evaluate({ criteria: criteria(7_000), opportunityId: "opportunity-b", policy: policy(6_000) });
    expect(first).toMatchObject({ confidenceAdjustedScoreBps: 8_000, outcome: "THESIS_CANDIDATE", sensitiveToSingleAssumption: false, totalScoreBps: 8_000 });
    expect(first.criteria).toHaveLength(15);
    expect(first.criteria.every(({ evidenceRefs, formula, weightBps }) => evidenceRefs.length === 1 && formula.length > 0 && weightBps !== undefined)).toBe(true);
    expect(compareVentureScorecards([second, first])).toEqual({ outcome: "RANKED", rankedOpportunityIds: ["opportunity-a", "opportunity-b"], reasonCode: "DETERMINISTIC_RANKING" });
    expect(compareVentureScorecards([first, { ...first, opportunityId: "opportunity-c" }])).toMatchObject({ outcome: "FOUNDER_REVIEW_REQUIRED", reasonCode: "TOP_SCORE_TIE" });
  });

  it("fails closed for unverified demand, missing weights, contradictions, and single-assumption sensitivity", () => {
    const service = new DeterministicVentureScorecardService();
    const noDemand = criteria(8_000).map((criterion) => criterion.criterion === "VERIFIED_DEMAND" ? { ...criterion, dataKind: "FOUNDER_INPUT" as const, evidenceRefs: [] } : criterion);
    const demandBlocked = service.evaluate({ criteria: noDemand, opportunityId: "no-demand", policy: policy(7_000) });
    expect(demandBlocked.outcome).toBe("RESEARCH_MORE");
    expect(demandBlocked.blockingReasonCodes).toContain("DEMAND_NOT_VERIFIED");
    expect(service.evaluate({ criteria: criteria(8_000), opportunityId: "weights-missing", policy: { hardRejectReasonCodes: [], thesisCandidateMinimumBps: 7_000, weightsBps: {} } })).toMatchObject({ outcome: "FOUNDER_REVIEW_REQUIRED" });
    const contradicted = criteria(8_000).map((criterion) => criterion.criterion === "COMPETITION" ? { ...criterion, contradicted: true } : criterion);
    expect(service.evaluate({ criteria: contradicted, opportunityId: "contradicted", policy: policy(7_000) })).toMatchObject({ outcome: "FOUNDER_REVIEW_REQUIRED" });

    const highWeightPolicy = sensitivityPolicy();
    const assumed = criteria(8_000).map((criterion) => criterion.criterion === "CAPITAL_REQUIRED" ? { ...criterion, dataKind: "ASSUMPTION" as const, evidenceRefs: [] } : criterion);
    const sensitive = service.evaluate({ criteria: assumed, opportunityId: "sensitive", policy: highWeightPolicy });
    expect(sensitive).toMatchObject({ outcome: "FOUNDER_REVIEW_REQUIRED", sensitiveToSingleAssumption: true });
    expect(sensitive.blockingReasonCodes).toContain("SINGLE_ASSUMPTION_SENSITIVITY");
  });

  it("never promotes social interest or engagement to verified commercial demand", () => {
    const candidate = radarCandidate();
    const socialOnly = new OpportunityRadarService().evaluate(candidate);
    expect(socialOnly).toMatchObject({ demand: { reasonCode: "DEMAND_NOT_VERIFIED", status: "NOT_AVAILABLE" }, externalActionsExecuted: false, willingnessToPay: { reasonCode: "DEMAND_NOT_VERIFIED", status: "NOT_AVAILABLE" } });

    const verified = new OpportunityRadarService().evaluate({ ...candidate, evidence: [...candidate.evidence, { evidenceRef: "pack-commercial", expiresAt: "2026-08-01T00:00:00.000Z", signalKind: "COMMERCIAL_COMMITMENT", sourceKind: "EVIDENCE_PACK", verified: true }] });
    expect(verified).toMatchObject({ demand: { status: "AVAILABLE", value: "VERIFIED" }, willingnessToPay: { status: "AVAILABLE", value: "VERIFIED" } });
    expect(Object.isFrozen(verified)).toBe(true);
  });

  it("keeps score calculations deterministic across bounded fuzz inputs", () => {
    const service = new DeterministicVentureScorecardService();
    let state = 17;
    for (let index = 0; index < 128; index += 1) {
      state = (state * 48_271) % 2_147_483_647;
      const value = state % 10_001;
      const output = service.evaluate({ criteria: criteria(value), opportunityId: `fuzz-${String(index)}`, policy: policy(5_000) });
      const expected = VENTURE_SCORE_CRITERIA.reduce((sum, _criterion, criterionIndex) => {
        const weight = criterionIndex === 0 ? 1_600 : 600;
        return sum + Number((BigInt(value) * BigInt(weight) + 5_000n) / 10_000n);
      }, 0);
      expect(output.totalScoreBps).toBe(expected);
      expect(output.confidenceAdjustedScoreBps).toBe(expected);
      expect(output.totalScoreBps).toBeGreaterThanOrEqual(0);
      expect(output.totalScoreBps).toBeLessThanOrEqual(10_000);
    }
  });
});

describe("Onlyway Venture economics, experiments, capital, and launch sources", () => {
  it("calculates exact BigInt/fixed-point economics and returns JSON-safe strings", () => {
    const result = new DeterministicVentureEconomicsEngine().calculate(economicsInput());
    expect(result).toMatchObject({
      breakEvenClients: { status: "CALCULATED", value: "1" },
      capacityClients: { status: "CALCULATED", value: "4" },
      capacityUtilizationBps: { status: "CALCULATED", value: "7500" },
      cashRequirementMinorUnits: { status: "CALCULATED", value: "73500" },
      contributionMarginMinorUnits: { status: "CALCULATED", value: "75500" },
      fixedCostsMinorUnits: { status: "CALCULATED", value: "15000" },
      founderTimeCostMinorUnits: { status: "CALCULATED", value: "4500" },
      maximumSustainableCacMinorUnits: { status: "CALCULATED", value: "61500" },
      monthlyContributionMinorUnits: { status: "CALCULATED", value: "211500" },
      netUnitRevenueMinorUnits: { status: "CALCULATED", value: "95000" },
      paybackMilliMonths: { status: "CALCULATED", value: "62" },
      runwayMilliMonths: { status: "CALCULATED", value: "6666" },
      variableUnitCostMinorUnits: { status: "CALCULATED", value: "19500" },
    });
    expect(() => JSON.stringify(result)).not.toThrow();

    const huge = new DeterministicVentureEconomicsEngine().calculate({ ...economicsInput(), priceMinorUnits: available("900719925474099300000") });
    expect(huge.netUnitRevenueMinorUnits).toMatchObject({ status: "CALCULATED", value: "855683929200394335000" });
  });

  it("propagates NOT_AVAILABLE instead of substituting zero", () => {
    const result = new DeterministicVentureEconomicsEngine().calculate({ ...economicsInput(), priceMinorUnits: unavailable("priceMinorUnits") });
    expect(result.netUnitRevenueMinorUnits).toMatchObject({ missingInputs: ["priceMinorUnits"], status: "NOT_AVAILABLE" });
    expect(result.contributionMarginMinorUnits.status).toBe("NOT_AVAILABLE");
    expect(result.breakEvenClients.status).toBe("NOT_AVAILABLE");
  });

  it("keeps simulations separate from verified real experiment observations", () => {
    const engine = new DeterministicVentureExperimentEngine();
    const plan = experimentPlan();
    expect(engine.decide(plan, [{ evidenceRefs: [], observationId: "simulation-one", observedAt: "2026-07-23T00:00:00.000Z", source: "INTERNAL_SIMULATION", value: "100", verificationStatus: "UNVERIFIED" }])).toMatchObject({ decision: "AWAITING_REAL_OBSERVATION", nextVentureStage: "PROPOSAL_ONLY", reasonCode: "NO_VERIFIED_REAL_OBSERVATION" });
    expect(engine.decide(plan, [{ evidenceRefs: ["pack-real"], observationId: "real-one", observedAt: "2026-07-23T00:00:00.000Z", source: "REAL", value: "10", verificationStatus: "VERIFIED" }])).toMatchObject({ decision: "SIGNAL_POSITIVE", externalActionsExecuted: false });
    expect(engine.decide(plan, [{ evidenceRefs: ["pack-mid"], observationId: "real-mid", observedAt: "2026-07-23T00:00:00.000Z", source: "REAL", value: "5", verificationStatus: "VERIFIED" }])).toMatchObject({ decision: "AWAITING_REAL_OBSERVATION", reasonCode: "THRESHOLD_NOT_REACHED" });
  });

  it("produces capital comparisons as proposals only and blocks absent Founder caps", () => {
    const criteria = CAPITAL_BOARD_CRITERIA.map((criterion): CapitalBoardCriterionInput => ({ criterion, evidenceRefs: ["capital-evidence"], formula: "Founder-configured normalized input", missingInputs: [], valueBps: 7_500 }));
    const weights = Object.fromEntries(CAPITAL_BOARD_CRITERIA.map((criterion) => [criterion, 1_250]));
    const board = new DeterministicCapitalBoard();
    const ready = board.propose([{ criteria, founderMinutesRequired: 120, opportunityId: "opportunity-a", proposedCapitalMinorUnits: "10000", reversibility: "HIGH" }], { capitalMaximumMinorUnits: "20000", weightsBps: weights });
    expect(ready).toMatchObject({ allocationAuthorized: false, externalActionsExecuted: false, proposalType: "CAPITAL_ALLOCATION_PROPOSAL", state: "PROPOSAL_ONLY", totalProposedCapitalMinorUnits: "10000" });
    const blocked = board.propose([{ criteria, founderMinutesRequired: 120, opportunityId: "opportunity-a", proposedCapitalMinorUnits: "10000", reversibility: "HIGH" }], { weightsBps: weights });
    expect(blocked.state).toBe("BLOCKED");
    expect(blocked.reasonCodes).toContain("FOUNDER_CAPITAL_LIMIT_REQUIRED");
  });

  it("creates only local source artifacts and preserves every missing launch input", () => {
    const pack = new DeterministicVentureLaunchPackFactory().produce(launchInput());
    expect(pack).toMatchObject({ externalActionsExecuted: false, publication: "LOCKED", state: "BLOCKED" });
    expect(pack.blockerCodes).toContain("PRICING_FOUNDER_INPUT_REQUIRED");
    expect(pack.blockerCodes).toContain("FOUNDER_DECISIONS_REQUIRED");
    expect(pack.artifacts).toHaveLength(12);
    expect(pack.artifacts.every(({ mediaType }) => !["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mediaType))).toBe(true);
    expect(pack.artifacts.some(({ content }) => content.includes("NOT_AVAILABLE"))).toBe(true);
  });
});

function criteria(valueBps: number): readonly VentureCriterionInput[] { return VENTURE_SCORE_CRITERIA.map((criterion) => ({ confidenceBps: 10_000, contradicted: false, criterion, dataKind: "EVIDENCE", evidenceRefs: [`evidence-${criterion.toLowerCase()}`], formula: "Founder-configured normalized scale 0..10000", missingInputs: [], valueBps })); }
function policy(threshold: number): VentureScorePolicy { return { hardRejectReasonCodes: [], thesisCandidateMinimumBps: threshold, weightsBps: Object.fromEntries(VENTURE_SCORE_CRITERIA.map((criterion, index) => [criterion, index === 0 ? 1_600 : 600])) }; }
function sensitivityPolicy(): VentureScorePolicy { const weights: Partial<Record<typeof VENTURE_SCORE_CRITERIA[number], number>> = {}; VENTURE_SCORE_CRITERIA.forEach((criterion, index) => { weights[criterion] = criterion === "CAPITAL_REQUIRED" ? 5_000 : index === 14 ? 359 : 357; }); return { hardRejectReasonCodes: [], thesisCandidateMinimumBps: 7_000, weightsBps: weights }; }

function radarCandidate(): OpportunityRadarCandidate {
  const unknown = <T>(): RadarDatum<T> => ({ reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" });
  return { accessToCustomer: unknown(), capitalRequiredMinorUnits: unknown(), category: "AI_SERVICES", client: "Creator e piccoli business da verificare", competition: unknown(), deliveryComplexity: unknown(), evidence: [{ evidenceRef: "social-signal", expiresAt: "2026-08-01T00:00:00.000Z", signalKind: "SOCIAL_INTEREST", sourceKind: "SOCIAL_INTELLIGENCE", verified: true }], founderFit: unknown(), frequency: unknown(), marginPotentialBps: unknown(), onlywaySynergy: unknown(), opportunityId: "opportunity-radar", problem: "Problema commerciale da verificare", risk: unknown(), timeToFirstSignalDays: unknown(), unknowns: ["Domanda commerciale"], urgency: unknown() };
}

function available(value: string): VentureEconomicValue { return { evidenceRefs: ["founder-input"], kind: "FOUNDER_SUPPLIED", status: "AVAILABLE", value }; }
function availableBps(value: number): VentureEconomicBps { return { evidenceRefs: ["founder-input"], kind: "FOUNDER_SUPPLIED", status: "AVAILABLE", value }; }
function unavailable(field: string): VentureEconomicValue { return { missingInputs: [field], reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" }; }
function economicsInput(): VentureEconomicsScenarioInput { return { acquisitionCostMinorUnits: available("5000"), availableCapitalMinorUnits: available("100000"), availableFounderTimeMilliHours: available("6500"), currency: "EUR", deliveryCostMinorUnits: available("10000"), fixedCostsMinorUnits: available("10000"), founderHourlyCostMinorUnits: available("3000"), founderTimePerClientMilliHours: available("1500"), minimumContributionMarginBps: availableBps(2_000), monthlyClients: available("3"), name: "BASE", priceMinorUnits: available("100000"), refundRateBps: availableBps(500), targetMonthlyContributionMinorUnits: available("200000"), toolCostsMinorUnits: available("5000") }; }

function experimentPlan(): VentureExperimentPlan { return { budgetMaximumMinorUnits: "0", durationDays: 7, evidenceRequired: ["Verified real observation"], experimentId: "experiment-one", externalActionsProposed: [], failureThreshold: "2", hypothesis: "A verified commercial signal reaches the declared threshold.", method: "INTERNAL_TECH_PROTOTYPE", nextDecision: "Request Fabio review.", owner: "validation-planner", primaryMetric: "Verified signals", sampleMaximum: 10, secondaryMetrics: [], stopCondition: "Stop at the declared duration.", successThreshold: "8", target: "Internal validation target" }; }

function launchInput(): VentureLaunchPackInput {
  const availableDatum = (value: string): VentureLaunchDatum => ({ evidenceRefs: ["pack-one"], status: "AVAILABLE", value });
  const missing: VentureLaunchDatum = { reasonCode: "FOUNDER_INPUT_REQUIRED", status: "NOT_AVAILABLE" };
  return { acquisitionStrategy: availableDatum("Internal draft only"), contentAcquisitionPlan: availableDatum("Evidence-led content plan"), crmSchema: missing, customerOnboarding: missing, deliverySystem: availableDatum("Controlled delivery checklist"), economics: availableDatum("Calculated economics summary"), emailDrafts: missing, evidenceMap: availableDatum("pack-one"), executiveDecision: availableDatum("Review the internal candidate"), experimentPlan: availableDatum("One reversible internal experiment"), founderDecisionsRequired: ["Provide verified pricing"], idealCustomerProfile: availableDatum("Customer profile requiring validation"), killCriteria: availableDatum("Kill if the verified failure threshold is reached"), offerArchitecture: availableDatum("Proposal-only offer structure"), opportunityReport: availableDatum("Opportunity evidence remains bounded"), outreachDrafts: missing, positioning: availableDatum("Internal positioning source"), pricing: missing, riskRegister: availableDatum("No external action is authorized"), scaleCriteria: availableDatum("Scale review requires real observations"), socialContentSeries: missing, thesisId: "thesis-one", validationPlan: availableDatum("Await real observations"), valueProposition: availableDatum("Proposed value requiring Fabio review"), ventureId: "venture-one" };
}
