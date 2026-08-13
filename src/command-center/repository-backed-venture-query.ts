import type { CapitalAllocationProposal, FounderPortfolioBrief, Venture, VentureArtifact, VentureExperiment, VentureOpportunity, VenturePortfolio, VentureScorecard, VentureThesis } from "../venture-holding/venture-domain.js";
import type { VentureHoldingTransactionRunner } from "../venture-holding/venture-repository.js";
import { buildCommandCenterVentureView, type CommandCenterVentureQuery, type CommandCenterVentureView } from "./command-center-venture-view.js";

const LIMIT = 101;

export class RepositoryBackedCommandCenterVentureQuery implements CommandCenterVentureQuery {
  public constructor(private readonly dependencies: { readonly actorId: string; readonly repositories: VentureHoldingTransactionRunner; readonly workspaceId: string }) {}

  public snapshot(): Promise<CommandCenterVentureView> {
    const identity = { actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId };
    return this.dependencies.repositories.transaction(async (repository) => {
      const [portfoliosRaw, opportunitiesRaw, scorecardsRaw, thesesRaw, venturesRaw, experimentsRaw, capitalRaw, artifactsRaw, briefsRaw] = await Promise.all([
        repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_PORTFOLIO" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_OPPORTUNITY" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_SCORECARD" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_THESIS" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_EXPERIMENT" }), repository.listRecords({ ...identity, limit: LIMIT, type: "CAPITAL_ALLOCATION_PROPOSAL" }), repository.listRecords({ ...identity, limit: LIMIT, type: "VENTURE_ARTIFACT" }), repository.listRecords({ ...identity, limit: LIMIT, type: "FOUNDER_PORTFOLIO_BRIEF" }),
      ]);
      const coverage = [portfoliosRaw, opportunitiesRaw, scorecardsRaw, thesesRaw, venturesRaw, experimentsRaw, capitalRaw, artifactsRaw, briefsRaw].some((entries) => entries.length >= LIMIT) ? "LIMIT_REACHED" as const : "COMPLETE" as const;
      const portfolios = latest(portfoliosRaw, (entry) => entry.portfolioId);
      const opportunities = latest(opportunitiesRaw, (entry) => entry.opportunityId);
      const scorecards = latest(scorecardsRaw, (entry) => entry.opportunityId);
      const theses = latest(thesesRaw, (entry) => entry.thesisId);
      const ventures = latest(venturesRaw, (entry) => entry.ventureId);
      const experiments = latest(experimentsRaw, (entry) => entry.experimentId);
      const capital = latest(capitalRaw, (entry) => entry.proposalId);
      const artifacts = latest(artifactsRaw, (entry) => entry.artifactId);
      const briefs = latest(briefsRaw, (entry) => entry.briefId);
      return this.#project({ artifacts, briefs, capital, coverage, experiments, opportunities, portfolios, scorecards, theses, ventures });
    });
  }

  #project(input: { readonly artifacts: readonly VentureArtifact[]; readonly briefs: readonly FounderPortfolioBrief[]; readonly capital: readonly CapitalAllocationProposal[]; readonly coverage: "COMPLETE" | "LIMIT_REACHED"; readonly experiments: readonly VentureExperiment[]; readonly opportunities: readonly VentureOpportunity[]; readonly portfolios: readonly VenturePortfolio[]; readonly scorecards: readonly VentureScorecard[]; readonly theses: readonly VentureThesis[]; readonly ventures: readonly Venture[] }): CommandCenterVentureView {
    const scoreByOpportunity = new Map(input.scorecards.map((scorecard) => [scorecard.opportunityId, scorecard]));
    const decisions = [
      ...input.ventures.filter(({ approvalState, stage }) => approvalState === "AWAITING_FABIO" || stage === "AWAITING_FABIO" || stage === "EVIDENCE_INSUFFICIENT").map((venture) => ({ decisionId: `${venture.ventureId}-founder-review`, entityFingerprint: venture.fingerprint, entityId: venture.ventureId, entityType: "VENTURE" as const, entityVersion: venture.version, priority: "HIGH" as const, question: "Richiedere nuova ricerca, archiviare o mantenere bloccata questa Venture?", reasonCode: venture.stage === "EVIDENCE_INSUFFICIENT" ? "DEMAND_NOT_VERIFIED" : "FOUNDER_REVIEW_REQUIRED", updatedAt: venture.updatedAt })),
      ...input.theses.filter(({ status }) => status === "AWAITING_FABIO").map((thesis) => ({ decisionId: `${thesis.thesisId}-founder-review`, entityFingerprint: thesis.fingerprint, entityId: thesis.thesisId, entityType: "VENTURE_THESIS" as const, entityVersion: thesis.version, priority: "HIGH" as const, question: "Approvare, rifiutare o richiedere ricerca aggiuntiva per questa Thesis?", reasonCode: "THESIS_REVIEW_REQUIRED", updatedAt: thesis.updatedAt })),
      ...input.experiments.filter(({ status }) => status === "AWAITING_FABIO").map((experiment) => ({ decisionId: `${experiment.experimentId}-founder-review`, entityFingerprint: experiment.fingerprint, entityId: experiment.experimentId, entityType: "VENTURE_EXPERIMENT" as const, entityVersion: experiment.version, priority: "MEDIUM" as const, question: "Approvare o rifiutare il design dell’esperimento, senza autorizzare esecuzione esterna?", reasonCode: "EXPERIMENT_REVIEW_REQUIRED", updatedAt: experiment.updatedAt })),
    ];
    const riskCount = input.ventures.reduce((sum, venture) => sum + venture.risks.length, 0);
    const proposed = sumAvailableMinorUnits(input.capital.map(({ amountMinorUnits }) => amountMinorUnits));
    const portfolio = input.portfolios[0];
    const founderInputRequired = decisions.length > 0 || input.opportunities.some(({ demand }) => demand === "DEMAND_NOT_VERIFIED");
    const health = portfolio === undefined
      ? { nextAction: "Registra la Founder Venture Policy e il portfolio prima di valutare una Venture.", reasonCode: "VENTURE_PORTFOLIO_NOT_AVAILABLE", status: "NOT_AVAILABLE" as const }
      : founderInputRequired
        ? { nextAction: "Fabio deve definire i parametri materiali e decidere se autorizzare nuova ricerca; nessuna Venture è attiva.", reasonCode: "FOUNDER_INPUT_REQUIRED", status: "FOUNDER_INPUT_REQUIRED" as const }
        : { nextAction: "Verifica il dossier corrente prima di qualsiasi transizione.", reasonCode: "PORTFOLIO_READY", status: "READY" as const };
    return buildCommandCenterVentureView({
      artifacts: input.artifacts.map((artifact) => ({ allowedUse: artifact.allowedUse, artifactKind: artifact.kind, entityId: artifact.artifactId, fingerprint: artifact.fingerprint, reviewState: artifact.reviewState, title: titleFromId(artifact.artifactId), updatedAt: artifact.updatedAt, ventureId: artifact.ventureId, version: artifact.version })),
      briefs: input.briefs.map((brief) => ({ briefKind: brief.kind, entityId: brief.briefId, fingerprint: brief.fingerprint, founderDecisions: brief.founderDecisionIds.length, riskCount: brief.riskCount, title: brief.kind.replaceAll("_", " "), updatedAt: brief.updatedAt, version: brief.version })),
      capital: { approvedCents: "NOT_AVAILABLE", proposedCents: proposed },
      capitalProposals: input.capital.map((proposal) => ({ amountCents: availableMinorUnits(proposal.amountMinorUnits), currency: proposal.currency.status === "AVAILABLE" ? proposal.currency.value : "NOT_AVAILABLE", entityId: proposal.proposalId, fingerprint: proposal.fingerprint, proposalOnly: true, status: "AWAITING_FABIO", title: titleFromId(proposal.proposalId), updatedAt: proposal.updatedAt, ventureId: proposal.ventureId, version: proposal.version })),
      coverage: input.coverage,
      decisions,
      experiments: input.experiments.map((experiment) => ({ entityId: experiment.experimentId, fingerprint: experiment.fingerprint, observation: experiment.decision.outcome === "AWAITING_REAL_OBSERVATION" ? "AWAITING_REAL_OBSERVATION" : "AVAILABLE", status: experiment.status, title: experiment.experimentType.replaceAll("_", " "), updatedAt: experiment.updatedAt, ventureId: experiment.ventureId, version: experiment.version })),
      health,
      opportunities: input.opportunities.map((opportunity) => { const score = scoreByOpportunity.get(opportunity.opportunityId); return { demand: opportunity.demand, entityId: opportunity.opportunityId, evidenceRefs: opportunity.evidenceMap.sourceRefs, expiry: opportunity.expiresAt, fingerprint: opportunity.fingerprint, outcome: score?.outcome ?? "RESEARCH_MORE", title: opportunity.title, updatedAt: opportunity.updatedAt, version: opportunity.version }; }),
      portfolio: portfolio === undefined ? null : { entityId: portfolio.portfolioId, fingerprint: portfolio.fingerprint, title: "Onlyway Venture Portfolio", updatedAt: portfolio.updatedAt, version: portfolio.version },
      summaries: { blockedVentures: input.ventures.filter(({ stage }) => ["EVIDENCE_INSUFFICIENT", "PAUSED", "KILL_REVIEW"].includes(stage)).length, capacity: "FOUNDER_INPUT_REQUIRED", founderDecisions: decisions.length, portfolioRiskCount: riskCount, readyExperiments: input.experiments.filter(({ status }) => status === "READY").length, venturesInProgress: input.ventures.filter(({ stage }) => !["ARCHIVED", "KILLED"].includes(stage)).length },
      ventures: input.ventures.map((venture) => ({ blockerCodes: venture.stage === "EVIDENCE_INSUFFICIENT" ? ["DEMAND_NOT_VERIFIED", "FOUNDER_INPUT_REQUIRED"] : [], entityId: venture.ventureId, fingerprint: venture.fingerprint, stage: venture.stage, title: venture.title, updatedAt: venture.updatedAt, version: venture.version })),
    });
  }
}

function latest<T extends { readonly version: number; readonly updatedAt: string }>(records: readonly T[], id: (record: T) => string): readonly T[] { const byId = new Map<string, T>(); for (const record of records) { const current = byId.get(id(record)); if (current === undefined || record.version > current.version) byId.set(id(record), record); } return Object.freeze([...byId.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))); }
function availableMinorUnits(value: CapitalAllocationProposal["amountMinorUnits"]): number | "NOT_AVAILABLE" { if (value.status !== "AVAILABLE") return "NOT_AVAILABLE"; const parsed = Number(value.value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : "NOT_AVAILABLE"; }
function sumAvailableMinorUnits(values: readonly CapitalAllocationProposal["amountMinorUnits"][]): number | "NOT_AVAILABLE" { if (values.length === 0 || values.some(({ status }) => status !== "AVAILABLE")) return "NOT_AVAILABLE"; let sum = 0n; for (const value of values) if (value.status === "AVAILABLE") sum += BigInt(value.value); return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : "NOT_AVAILABLE"; }
function titleFromId(value: string): string { return value.replaceAll("-", " ").replace(/\b\w/gu, (character) => character.toUpperCase()); }
