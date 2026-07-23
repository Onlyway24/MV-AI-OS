import type { VentureScorecard as VentureScorecardRecord, VentureScoreCriterion as VentureScoreCriterionRecord } from "./venture-domain.js";

export const VENTURE_SCORE_CRITERIA = Object.freeze([
  "VERIFIED_DEMAND",
  "PROBLEM_URGENCY",
  "FIRST_SIGNAL_SPEED",
  "CAPITAL_REQUIRED",
  "FOUNDER_FIT",
  "AUDIENCE_ACCESS",
  "MARGIN_POTENTIAL",
  "DELIVERY_COMPLEXITY",
  "FABIO_DEPENDENCY",
  "COMPETITION",
  "LEGAL_REPUTATIONAL_RISK",
  "DEFENSIBILITY",
  "ONLYWAY_SYNERGY",
  "RECURRING_REVENUE_POTENTIAL",
  "EVIDENCE_QUALITY",
] as const);

export type VentureScoreCriterion = typeof VENTURE_SCORE_CRITERIA[number];
export type VentureScorecardOutcome = "FOUNDER_REVIEW_REQUIRED" | "REJECT" | "RESEARCH_MORE" | "THESIS_CANDIDATE";
export type VentureScoreDataKind = "ASSUMPTION" | "EVIDENCE" | "FOUNDER_INPUT" | "MISSING";

export interface VentureCriterionInput {
  readonly confidenceBps: number;
  readonly contradicted: boolean;
  readonly criterion: VentureScoreCriterion;
  readonly dataKind: VentureScoreDataKind;
  readonly evidenceRefs: readonly string[];
  readonly formula: string;
  readonly missingInputs: readonly string[];
  readonly valueBps?: number;
}

export interface VentureScorePolicy {
  readonly hardRejectReasonCodes: readonly string[];
  readonly thesisCandidateMinimumBps?: number;
  readonly weightsBps: Readonly<Partial<Record<VentureScoreCriterion, number>>>;
}

export type VentureCriterionScore = VentureCriterionInput & VentureScoreCriterionRecord & {
  readonly confidenceAdjustedContributionBps?: number;
  readonly sensitivity: {
    readonly highContributionBps?: number;
    readonly lowContributionBps?: number;
    readonly outcomeCanChange: boolean;
  };
  readonly weightBps?: number;
  readonly weightedContributionBps?: number;
};

export interface DeterministicVentureScorecard extends Pick<VentureScorecardRecord, "blockingReasonCodes" | "confidenceAdjustedScoreBps" | "opportunityId" | "outcome" | "sensitiveToSingleAssumption" | "totalScoreBps"> {
  readonly blockingReasonCodes: readonly string[];
  readonly confidenceAdjustedScoreBps?: number;
  readonly criteria: readonly VentureCriterionScore[];
  readonly formula: "sum(round(valueBps * weightBps / 10000))";
  readonly opportunityId: string;
  readonly outcome: VentureScorecardOutcome;
  readonly sensitiveToSingleAssumption: boolean;
  readonly totalScoreBps?: number;
}

export interface VentureScorecardComparison {
  readonly outcome: "FOUNDER_REVIEW_REQUIRED" | "RANKED";
  readonly rankedOpportunityIds: readonly string[];
  readonly reasonCode: "DETERMINISTIC_RANKING" | "NO_ELIGIBLE_SCORECARD" | "TOP_SCORE_TIE";
}

export class DeterministicVentureScorecardService {
  public evaluate(input: {
    readonly criteria: readonly VentureCriterionInput[];
    readonly opportunityId: string;
    readonly policy: VentureScorePolicy;
  }): DeterministicVentureScorecard {
    assertId(input.opportunityId);
    const byCriterion = new Map(input.criteria.map((criterion) => [criterion.criterion, criterion]));
    if (byCriterion.size !== input.criteria.length) throw new Error("Venture scorecard criteria must be unique");

    const configuredWeights = configuredWeightTotal(input.policy.weightsBps);
    const weightsReady = configuredWeights === 10_000 && VENTURE_SCORE_CRITERIA.every((criterion) => validBps(input.policy.weightsBps[criterion]));
    const thresholdReady = validBps(input.policy.thesisCandidateMinimumBps);
    const blocking = new Set<string>();
    if (!weightsReady) blocking.add("SCORE_WEIGHTS_NOT_CONFIGURED");
    if (!thresholdReady) blocking.add("THESIS_THRESHOLD_NOT_CONFIGURED");
    for (const reason of input.policy.hardRejectReasonCodes) {
      if (!safeReason(reason)) throw new Error("Venture hard reject reason code is invalid");
    }

    const provisional: VentureCriterionScore[] = VENTURE_SCORE_CRITERIA.map((criterion) => {
      const source = byCriterion.get(criterion) ?? missingCriterion(criterion);
      validateCriterion(source);
      const weight = input.policy.weightsBps[criterion];
      if (source.dataKind === "MISSING" || source.valueBps === undefined || source.missingInputs.length > 0) blocking.add(`MISSING_${criterion}`);
      if (source.contradicted) blocking.add(`CONTRADICTED_${criterion}`);
      if (criterion === "VERIFIED_DEMAND" && source.dataKind !== "EVIDENCE") blocking.add("DEMAND_NOT_VERIFIED");
      const weighted = weightsReady && weight !== undefined && source.valueBps !== undefined
        ? ratioRound(source.valueBps, weight, 10_000)
        : undefined;
      const confidenceAdjusted = weighted === undefined ? undefined : ratioRound(weighted, source.confidenceBps, 10_000);
      return Object.freeze({
        ...source,
        sensitivity: Object.freeze({ outcomeCanChange: false }),
        ...(weight === undefined ? {} : { weightBps: weight }),
        ...(weighted === undefined ? {} : { weightedContributionBps: weighted }),
        ...(confidenceAdjusted === undefined ? {} : { confidenceAdjustedContributionBps: confidenceAdjusted }),
      });
    });

    const canCalculate = weightsReady && provisional.every(({ weightedContributionBps, confidenceAdjustedContributionBps }) => weightedContributionBps !== undefined && confidenceAdjustedContributionBps !== undefined);
    const total = canCalculate ? provisional.reduce((sum, criterion) => sum + required(criterion.weightedContributionBps), 0) : undefined;
    const adjusted = canCalculate ? provisional.reduce((sum, criterion) => sum + required(criterion.confidenceAdjustedContributionBps), 0) : undefined;
    const baseline = classify({
      blocking,
      hardRejects: input.policy.hardRejectReasonCodes,
      ...(adjusted === undefined ? {} : { adjusted }),
      ...(input.policy.thesisCandidateMinimumBps === undefined ? {} : { threshold: input.policy.thesisCandidateMinimumBps }),
    });

    const criteria = Object.freeze(provisional.map((criterion): VentureCriterionScore => {
      if (criterion.dataKind !== "ASSUMPTION" || criterion.weightBps === undefined || adjusted === undefined || criterion.confidenceAdjustedContributionBps === undefined || input.policy.thesisCandidateMinimumBps === undefined) return criterion;
      const lowContribution = 0;
      const highWeighted = ratioRound(10_000, criterion.weightBps, 10_000);
      const highContribution = ratioRound(highWeighted, criterion.confidenceBps, 10_000);
      const withoutCurrent = adjusted - criterion.confidenceAdjustedContributionBps;
      const lowOutcome = scoreThresholdOutcome(withoutCurrent + lowContribution, input.policy.thesisCandidateMinimumBps);
      const highOutcome = scoreThresholdOutcome(withoutCurrent + highContribution, input.policy.thesisCandidateMinimumBps);
      const outcomeCanChange = lowOutcome !== highOutcome;
      return Object.freeze({
        ...criterion,
        sensitivity: Object.freeze({ highContributionBps: highContribution, lowContributionBps: lowContribution, outcomeCanChange }),
      });
    }));

    const sensitive = criteria.some(({ sensitivity }) => sensitivity.outcomeCanChange);
    if (sensitive) blocking.add("SINGLE_ASSUMPTION_SENSITIVITY");
    const outcome = sensitive && baseline === "THESIS_CANDIDATE" ? "FOUNDER_REVIEW_REQUIRED" : baseline;
    return Object.freeze({
      blockingReasonCodes: Object.freeze([...blocking].sort()),
      ...(adjusted === undefined ? {} : { confidenceAdjustedScoreBps: adjusted }),
      criteria,
      formula: "sum(round(valueBps * weightBps / 10000))" as const,
      opportunityId: input.opportunityId,
      outcome,
      sensitiveToSingleAssumption: sensitive,
      ...(total === undefined ? {} : { totalScoreBps: total }),
    });
  }
}

export function compareVentureScorecards(scorecards: readonly DeterministicVentureScorecard[]): VentureScorecardComparison {
  const eligible = scorecards
    .filter((scorecard): scorecard is DeterministicVentureScorecard & { readonly confidenceAdjustedScoreBps: number } => scorecard.outcome === "THESIS_CANDIDATE" && scorecard.confidenceAdjustedScoreBps !== undefined)
    .sort((left, right) => right.confidenceAdjustedScoreBps - left.confidenceAdjustedScoreBps || left.opportunityId.localeCompare(right.opportunityId));
  if (eligible.length === 0) return Object.freeze({ outcome: "FOUNDER_REVIEW_REQUIRED", rankedOpportunityIds: Object.freeze([]), reasonCode: "NO_ELIGIBLE_SCORECARD" });
  if (eligible.length > 1 && eligible[0]?.confidenceAdjustedScoreBps === eligible[1]?.confidenceAdjustedScoreBps) return Object.freeze({ outcome: "FOUNDER_REVIEW_REQUIRED", rankedOpportunityIds: Object.freeze(eligible.map(({ opportunityId }) => opportunityId)), reasonCode: "TOP_SCORE_TIE" });
  return Object.freeze({ outcome: "RANKED", rankedOpportunityIds: Object.freeze(eligible.map(({ opportunityId }) => opportunityId)), reasonCode: "DETERMINISTIC_RANKING" });
}

function classify(input: { readonly adjusted?: number; readonly blocking: ReadonlySet<string>; readonly hardRejects: readonly string[]; readonly threshold?: number }): VentureScorecardOutcome {
  if (input.hardRejects.length > 0) return "REJECT";
  if ([...input.blocking].some((reason) => reason.startsWith("CONTRADICTED_") || reason === "SCORE_WEIGHTS_NOT_CONFIGURED" || reason === "THESIS_THRESHOLD_NOT_CONFIGURED")) return "FOUNDER_REVIEW_REQUIRED";
  if (input.adjusted === undefined || input.threshold === undefined || input.blocking.size > 0) return "RESEARCH_MORE";
  return scoreThresholdOutcome(input.adjusted, input.threshold);
}

function scoreThresholdOutcome(score: number, threshold: number): Extract<VentureScorecardOutcome, "RESEARCH_MORE" | "THESIS_CANDIDATE"> {
  return score >= threshold ? "THESIS_CANDIDATE" : "RESEARCH_MORE";
}

function missingCriterion(criterion: VentureScoreCriterion): VentureCriterionInput {
  return Object.freeze({ confidenceBps: 0, contradicted: false, criterion, dataKind: "MISSING", evidenceRefs: Object.freeze([]), formula: "NOT_AVAILABLE", missingInputs: Object.freeze([criterion]) });
}

function validateCriterion(value: VentureCriterionInput): void {
  if (!VENTURE_SCORE_CRITERIA.includes(value.criterion) || !validBps(value.confidenceBps) || typeof value.contradicted !== "boolean" || !text(value.formula, 1, 1_000) || !stringList(value.evidenceRefs, 0, 100) || !stringList(value.missingInputs, 0, 100) || !["ASSUMPTION", "EVIDENCE", "FOUNDER_INPUT", "MISSING"].includes(value.dataKind)) throw new Error("Venture score criterion is invalid");
  if (value.dataKind === "MISSING") {
    if (value.valueBps !== undefined || value.confidenceBps !== 0 || value.evidenceRefs.length !== 0 || value.missingInputs.length === 0) throw new Error("Missing Venture score criterion is inconsistent");
    return;
  }
  if (!validBps(value.valueBps)) throw new Error("Venture score criterion value is invalid");
  if (value.dataKind === "EVIDENCE" && value.evidenceRefs.length === 0) throw new Error("Evidence-backed Venture score criterion has no evidence reference");
}

function configuredWeightTotal(weights: VentureScorePolicy["weightsBps"]): number | undefined {
  const values = VENTURE_SCORE_CRITERIA.map((criterion) => weights[criterion]);
  if (!values.every(validBps)) return undefined;
  return values.reduce<number>((sum, value) => sum + value, 0);
}

function ratioRound(left: number, right: number, denominator: number): number {
  const numerator = BigInt(left) * BigInt(right);
  const divisor = BigInt(denominator);
  return Number((numerator + divisor / 2n) / divisor);
}

function validBps(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000; }
function required(value: number | undefined): number { if (value === undefined) throw new Error("Calculated score is unavailable"); return value; }
function assertId(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new Error("Venture opportunity identifier is invalid"); }
function safeReason(value: string): boolean { return /^[A-Z][A-Z0-9_]{0,127}$/u.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function stringList(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => text(item, 1, 1_000)); }
