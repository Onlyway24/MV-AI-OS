import type { CapitalAllocationProposal as CapitalAllocationProposalRecord } from "./venture-domain.js";

export const CAPITAL_BOARD_CRITERIA = Object.freeze(["COST_EFFICIENCY", "EVIDENCE_CONFIDENCE", "EXPECTED_IMPACT", "OPPORTUNITY_COST", "REVERSIBILITY", "RISK_CONTROL", "SPEED", "STRATEGIC_FIT"] as const);
export type CapitalBoardCriterion = typeof CAPITAL_BOARD_CRITERIA[number];

export interface CapitalBoardCriterionInput {
  readonly criterion: CapitalBoardCriterion;
  readonly evidenceRefs: readonly string[];
  readonly formula: string;
  readonly missingInputs: readonly string[];
  readonly valueBps?: number;
}

export interface CapitalBoardCandidate {
  readonly criteria: readonly CapitalBoardCriterionInput[];
  readonly founderMinutesRequired: number;
  readonly opportunityId: string;
  readonly proposedCapitalMinorUnits?: string;
  readonly reversibility: "HIGH" | "LOW" | "MEDIUM";
  readonly ventureId?: string;
}

export interface CapitalBoardPolicy {
  readonly capitalMaximumMinorUnits?: string;
  readonly weightsBps: Readonly<Partial<Record<CapitalBoardCriterion, number>>>;
}

export interface CapitalAllocationCandidateScore {
  readonly blockingReasonCodes: readonly string[];
  readonly criteria: readonly (CapitalBoardCriterionInput & { readonly weightBps?: number; readonly weightedContributionBps?: number })[];
  readonly founderMinutesRequired: number;
  readonly opportunityId: string;
  readonly proposedCapitalMinorUnits?: string;
  readonly rank: number | null;
  readonly scoreBps?: number;
  readonly ventureId?: string;
}

export interface CapitalAllocationProposal extends Pick<CapitalAllocationProposalRecord, "externalActionsExecuted" | "spendAuthorized" | "status"> {
  readonly allocationAuthorized: false;
  readonly candidates: readonly CapitalAllocationCandidateScore[];
  readonly externalActionsExecuted: false;
  readonly proposalType: "CAPITAL_ALLOCATION_PROPOSAL";
  readonly reasonCodes: readonly string[];
  readonly state: "BLOCKED" | "PROPOSAL_ONLY";
  readonly totalProposedCapitalMinorUnits?: string;
}

export class DeterministicCapitalBoard {
  public propose(candidates: readonly CapitalBoardCandidate[], policy: CapitalBoardPolicy): CapitalAllocationProposal {
    if (candidates.length === 0 || candidates.length > 100) throw new Error("Capital Board candidate set is invalid");
    const weightValues = CAPITAL_BOARD_CRITERIA.map((criterion) => policy.weightsBps[criterion]);
    const weightsReady = weightValues.every(bps) && weightValues.reduce<number>((sum, value) => sum + value, 0) === 10_000;
    const capReady = policy.capitalMaximumMinorUnits !== undefined && canonicalUnsigned(policy.capitalMaximumMinorUnits);
    const reasonCodes = new Set<string>();
    if (!weightsReady) reasonCodes.add("CAPITAL_WEIGHTS_NOT_CONFIGURED");
    if (!capReady) reasonCodes.add("FOUNDER_CAPITAL_LIMIT_REQUIRED");

    const unranked = candidates.map((candidate): CapitalAllocationCandidateScore => {
      validateCandidate(candidate);
      const byCriterion = new Map(candidate.criteria.map((criterion) => [criterion.criterion, criterion]));
      if (byCriterion.size !== candidate.criteria.length) throw new Error("Capital Board criteria must be unique");
      const blockers: string[] = [];
      if (candidate.proposedCapitalMinorUnits === undefined) blockers.push("CAPITAL_REQUIRED_NOT_AVAILABLE");
      const criteria = Object.freeze(CAPITAL_BOARD_CRITERIA.map((criterion) => {
        const source = byCriterion.get(criterion) ?? { criterion, evidenceRefs: Object.freeze([]), formula: "NOT_AVAILABLE", missingInputs: Object.freeze([criterion]) };
        validateCriterion(source);
        const weight = policy.weightsBps[criterion];
        if (source.valueBps === undefined || source.missingInputs.length > 0) blockers.push(`MISSING_${criterion}`);
        const contribution = weightsReady && weight !== undefined && source.valueBps !== undefined ? ratioRound(source.valueBps, weight, 10_000) : undefined;
        return Object.freeze({ ...source, ...(weight === undefined ? {} : { weightBps: weight }), ...(contribution === undefined ? {} : { weightedContributionBps: contribution }) });
      }));
      const score = blockers.length === 0 && weightsReady ? criteria.reduce((sum, criterion) => sum + (criterion.weightedContributionBps ?? 0), 0) : undefined;
      return Object.freeze({ blockingReasonCodes: Object.freeze([...new Set(blockers)].sort()), criteria, founderMinutesRequired: candidate.founderMinutesRequired, opportunityId: candidate.opportunityId, ...(candidate.proposedCapitalMinorUnits === undefined ? {} : { proposedCapitalMinorUnits: candidate.proposedCapitalMinorUnits }), rank: null, ...(score === undefined ? {} : { scoreBps: score }), ...(candidate.ventureId === undefined ? {} : { ventureId: candidate.ventureId }) });
    });

    const availableCapital = unranked.every(({ proposedCapitalMinorUnits }) => proposedCapitalMinorUnits !== undefined);
    const total = availableCapital ? unranked.reduce((sum, candidate) => sum + BigInt(candidate.proposedCapitalMinorUnits ?? "0"), 0n) : undefined;
    if (total !== undefined && capReady && total > BigInt(policy.capitalMaximumMinorUnits ?? "0")) reasonCodes.add("CAPITAL_PROPOSAL_EXCEEDS_POLICY");
    if (unranked.some(({ blockingReasonCodes }) => blockingReasonCodes.length > 0)) reasonCodes.add("CAPITAL_CANDIDATE_DATA_INCOMPLETE");

    const rankedEligible = [...unranked].filter((candidate): candidate is CapitalAllocationCandidateScore & { readonly scoreBps: number } => candidate.scoreBps !== undefined).sort((left, right) => right.scoreBps - left.scoreBps || left.opportunityId.localeCompare(right.opportunityId));
    const rankById = new Map<string, number>();
    for (const [index, candidate] of rankedEligible.entries()) {
      const previous = rankedEligible[index - 1];
      rankById.set(candidate.opportunityId, previous?.scoreBps === candidate.scoreBps ? (rankById.get(previous.opportunityId) ?? index + 1) : index + 1);
    }
    const scored = Object.freeze(unranked.map((candidate) => Object.freeze({ ...candidate, rank: rankById.get(candidate.opportunityId) ?? null })));
    const blocked = reasonCodes.size > 0;
    return Object.freeze({
      allocationAuthorized: false,
      candidates: scored,
      externalActionsExecuted: false,
      proposalType: "CAPITAL_ALLOCATION_PROPOSAL",
      reasonCodes: Object.freeze([...reasonCodes].sort()),
      state: blocked ? "BLOCKED" : "PROPOSAL_ONLY",
      spendAuthorized: false,
      status: "CAPITAL_ALLOCATION_PROPOSAL",
      ...(total === undefined ? {} : { totalProposedCapitalMinorUnits: total.toString() }),
    });
  }
}

function validateCandidate(candidate: CapitalBoardCandidate): void {
  if (!id(candidate.opportunityId) || (candidate.ventureId !== undefined && !id(candidate.ventureId)) || !Number.isSafeInteger(candidate.founderMinutesRequired) || candidate.founderMinutesRequired < 0 || !["HIGH", "LOW", "MEDIUM"].includes(candidate.reversibility) || (candidate.proposedCapitalMinorUnits !== undefined && !canonicalUnsigned(candidate.proposedCapitalMinorUnits))) throw new Error("Capital Board candidate is invalid");
}
function validateCriterion(value: CapitalBoardCriterionInput): void { if (!CAPITAL_BOARD_CRITERIA.includes(value.criterion) || (value.valueBps !== undefined && !bps(value.valueBps)) || !text(value.formula) || !strings(value.evidenceRefs) || !strings(value.missingInputs)) throw new Error("Capital Board criterion is invalid"); }
function ratioRound(left: number, right: number, denominator: number): number { const divisor = BigInt(denominator); return Number((BigInt(left) * BigInt(right) + divisor / 2n) / divisor); }
function bps(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000; }
function canonicalUnsigned(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9]\d{0,39})$/u.test(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 1_000; }
function strings(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 100 && value.every(text); }
