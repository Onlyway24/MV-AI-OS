import {
  BUSINESS_SCORE_CRITERIA,
  type BusinessConfidence,
  type BusinessCriterionScore,
  type BusinessOpportunityCandidate,
  type BusinessOpportunityScorecard,
  type BusinessScoreCriterion,
} from "./business-mission.js";

export const BUSINESS_SCORE_WEIGHTS: Readonly<Record<BusinessScoreCriterion, number>> = Object.freeze({
  CAPITAL_EFFICIENCY: 15,
  CUSTOMER_ACCESS: 15,
  FABIO_ADVANTAGE: 10,
  MARGIN_POTENTIAL: 15,
  RISK_CONTROL: 10,
  VALIDATION_SPEED: 15,
  VERIFIED_DEMAND: 20,
});

const CONFIDENCE_FACTORS: Readonly<Record<BusinessConfidence, number>> = Object.freeze({
  HIGH: 1,
  LOW: 0.5,
  MEDIUM: 0.75,
  NONE: 0,
});

export interface ScoredOpportunityInput {
  readonly candidate: BusinessOpportunityCandidate;
  readonly evidencePackFingerprint: string;
}

export interface OpportunitySelection {
  readonly explanation: string;
  readonly scorecards: readonly BusinessOpportunityScorecard[];
  readonly selectedOpportunityId?: string;
}

export class DeterministicOpportunityScorer {
  public compare(inputs: readonly ScoredOpportunityInput[]): OpportunitySelection {
    const scorecards = Object.freeze(inputs.map(({ candidate, evidencePackFingerprint }) => this.#score(candidate, evidencePackFingerprint)));
    if (scorecards.some(({ complete }) => !complete)) {
      return Object.freeze({
        explanation: "Selezione bloccata: almeno una scorecard contiene dati mancanti. Nessun valore è stato imputato artificialmente.",
        scorecards,
      });
    }
    const ranked = [...scorecards].sort((left, right) => (right.totalScore ?? 0) - (left.totalScore ?? 0) || left.opportunityId.localeCompare(right.opportunityId));
    const winner = ranked[0];
    const runnerUp = ranked[1];
    if (winner === undefined || runnerUp === undefined || winner.totalScore === runnerUp.totalScore) {
      return Object.freeze({
        explanation: "Selezione bloccata: il confronto deterministico produce un pareggio e richiede una decisione esplicita di Fabio.",
        scorecards,
      });
    }
    return Object.freeze({
      explanation: `${winner.opportunityId} vince con ${String(winner.totalScore)}/100 contro ${String(runnerUp.totalScore)}/100. La selezione deriva esclusivamente dai sette criteri pesati dichiarati.`,
      scorecards,
      selectedOpportunityId: winner.opportunityId,
    });
  }

  #score(candidate: BusinessOpportunityCandidate, evidencePackFingerprint: string): BusinessOpportunityScorecard {
    const byCriterion = new Map(candidate.scoreInputs.map((input) => [input.criterion, input]));
    const criteria: readonly BusinessCriterionScore[] = Object.freeze(BUSINESS_SCORE_CRITERIA.map((criterion): BusinessCriterionScore => {
      const input = byCriterion.get(criterion);
      const weight = BUSINESS_SCORE_WEIGHTS[criterion];
      if (input === undefined || input.dataKind === "MISSING" || input.value === undefined) {
        return Object.freeze({
          confidence: input?.confidence ?? "NONE" as const,
          criterion,
          dataKind: "MISSING" as const,
          formula: input?.formula ?? "Dato non disponibile",
          weight,
        });
      }
      return Object.freeze({
        ...input,
        weight,
        weightedContribution: round(input.value * weight / 100),
      });
    }));
    const complete = criteria.every((criterion) => criterion.weightedContribution !== undefined);
    if (!complete) return Object.freeze({ complete, criteria, evidencePackFingerprint, evidencePackId: candidate.evidencePackId, opportunityId: candidate.opportunityId });
    const totalScore = round(criteria.reduce((sum, criterion) => sum + (criterion.weightedContribution ?? 0), 0));
    const confidenceAdjustedScore = round(criteria.reduce((sum, criterion) => {
      return sum + (criterion.weightedContribution ?? 0) * CONFIDENCE_FACTORS[criterion.confidence];
    }, 0));
    return Object.freeze({ complete, confidenceAdjustedScore, criteria, evidencePackFingerprint, evidencePackId: candidate.evidencePackId, opportunityId: candidate.opportunityId, totalScore });
  }
}

function round(value: number): number { return Math.round(value * 100) / 100; }
