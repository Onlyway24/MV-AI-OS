import type { Clock } from "../ports/clock.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { EvidencePack } from "../operational-planes/operational-plane.js";
import type { BusinessGate, BusinessMissionDossier, BusinessMissionExecutionInput, BusinessOpportunityCandidate } from "./business-mission.js";
import { BusinessMissionExecutionInputValidator, BusinessMissionReviewRequestValidator, dossierFingerprint } from "./business-mission-validator.js";
import { DeterministicOpportunityScorer } from "./deterministic-opportunity-scorer.js";
import { DeterministicBusinessEconomicsEngine } from "./deterministic-economics-engine.js";
import { DeterministicBusinessArtifactFactory } from "./deterministic-business-artifact-factory.js";

export class BusinessMissionService {
  readonly #artifacts = new DeterministicBusinessArtifactFactory();
  readonly #economics = new DeterministicBusinessEconomicsEngine();
  readonly #inputValidator = new BusinessMissionExecutionInputValidator();
  readonly #reviewValidator = new BusinessMissionReviewRequestValidator();
  readonly #scorer = new DeterministicOpportunityScorer();

  public constructor(private readonly dependencies: { readonly actorId: string; readonly clock: Clock; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string }) {}

  public create(input: unknown): Promise<BusinessMissionDossier> {
    const checked = validate(input, this.#inputValidator.validate.bind(this.#inputValidator), "Business Mission input");
    return this.dependencies.repositories.transaction(async ({ businessMissions, operationalPlanes }) => {
      if (await businessMissions.getById(checked.mission.missionId) !== undefined) throw new RepositoryConflictError("Business Mission dossier already exists");
      const packs = await Promise.all(checked.candidates.map(async (candidate) => {
        const pack = await operationalPlanes.getEvidencePackById(candidate.evidencePackId);
        this.#assertEvidence(candidate, pack);
        return pack;
      }));
      const selection = this.#scorer.compare(checked.candidates.map((candidate, index) => ({ candidate, evidencePackFingerprint: requiredPack(packs[index]).fingerprint })));
      const selected = checked.candidates.find(({ opportunityId }) => opportunityId === selection.selectedOpportunityId);
      if (selected !== undefined && checked.commercialPlan.offer.opportunityId !== selected.opportunityId) throw new RepositoryValidationError("Commercial plan must target the deterministically selected opportunity");
      const economics = Object.freeze(checked.commercialPlan.economics.map((scenario) => this.#economics.calculate(scenario)));
      const gates = this.#gates(checked, selection.selectedOpportunityId, selection.scorecards, economics);
      const passed = gates.every(({ status }) => status === "PASSED") && selected !== undefined;
      const createdAt = this.dependencies.clock.now().toISOString();
      const evidencePackIds = Object.freeze(checked.candidates.map(({ evidencePackId }) => evidencePackId));
      const artifacts = selected === undefined ? Object.freeze([]) : this.#artifacts.produce({ commercialPlan: checked.commercialPlan, economics, evidencePackIds, mission: checked.mission, selected, selectionExplanation: selection.explanation, scorecards: selection.scorecards });
      const base = {
        actorId: this.dependencies.actorId,
        artifacts,
        candidates: checked.candidates,
        commercialPlan: checked.commercialPlan,
        contractVersion: "1" as const,
        createdAt,
        economics,
        evidencePackIds,
        externalActionsExecuted: false as const,
        gates,
        mission: checked.mission,
        scorecards: selection.scorecards,
        ...(selection.selectedOpportunityId === undefined ? {} : { selectedOpportunityId: selection.selectedOpportunityId }),
        selectionExplanation: selection.explanation,
        workspaceId: this.dependencies.workspaceId,
      };
      const dossier: BusinessMissionDossier = Object.freeze({ ...base, fingerprint: dossierFingerprint(base), status: passed ? "PENDING_FABIO_APPROVAL" : "BLOCKED", updatedAt: createdAt, version: 0 });
      await businessMissions.insert(dossier);
      return dossier;
    });
  }

  public inspect(missionId: string): Promise<BusinessMissionDossier> { return this.dependencies.repositories.transaction(async ({ businessMissions }) => this.#owned(await businessMissions.getById(missionId))); }
  public list(limit: number): Promise<readonly BusinessMissionDossier[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Business Mission list limit is invalid"); return this.dependencies.repositories.transaction(({ businessMissions }) => businessMissions.listByWorkspaceId(this.dependencies.workspaceId, limit)); }

  public review(input: unknown): Promise<BusinessMissionDossier> {
    const checked = validate(input, this.#reviewValidator.validate.bind(this.#reviewValidator), "Business Mission review");
    return this.dependencies.repositories.transaction(async ({ businessMissions }) => {
      const current = this.#owned(await businessMissions.getById(checked.missionId));
      if (current.status !== "PENDING_FABIO_APPROVAL" || current.version !== checked.expectedVersion) throw new RepositoryConflictError("Business Mission dossier is not eligible for review");
      const reviewedAt = this.dependencies.clock.now().toISOString();
      const next: BusinessMissionDossier = Object.freeze({
        ...current,
        review: Object.freeze({ decision: checked.decision, note: checked.note, reviewedAt, reviewedBy: this.dependencies.actorId }),
        status: checked.decision,
        updatedAt: reviewedAt,
        version: current.version + 1,
      });
      await businessMissions.update(next, { version: current.version });
      return next;
    });
  }

  #assertEvidence(candidate: BusinessOpportunityCandidate, pack: EvidencePack | undefined): asserts pack is EvidencePack {
    if (pack?.workspaceId !== this.dependencies.workspaceId || pack.actorId !== this.dependencies.actorId) throw new RepositoryConflictError(`Evidence Pack ${candidate.evidencePackId} is unavailable`);
    if (Date.parse(pack.minFreshnessExpiresAt) <= this.dependencies.clock.now().getTime()) throw new RepositoryConflictError(`Evidence Pack ${candidate.evidencePackId} is stale`);
    const allowed = new Set(pack.evidenceIds);
    for (const score of candidate.scoreInputs) if (score.evidenceId !== undefined && !allowed.has(score.evidenceId)) throw new RepositoryValidationError(`Score evidence ${score.evidenceId} is not part of ${candidate.evidencePackId}`);
  }

  #gates(input: BusinessMissionExecutionInput, selectedId: string | undefined, scorecards: BusinessMissionDossier["scorecards"], economics: BusinessMissionDossier["economics"]): readonly BusinessGate[] {
    const selected = input.candidates.find(({ opportunityId }) => opportunityId === selectedId);
    const scorecard = scorecards.find(({ opportunityId }) => opportunityId === selectedId);
    const qualityFindings: string[] = [];
    if (selected === undefined) qualityFindings.push("Nessun vincitore deterministico disponibile.");
    if (scorecard?.totalScore !== undefined && scorecard.totalScore < input.mission.minimumThresholds.minOpportunityScore) qualityFindings.push("Il punteggio del vincitore è sotto la soglia minima della Missione.");
    if (economics.some((scenario) => scenario.revenueCents.status === "NOT_AVAILABLE")) qualityFindings.push("Uno o più scenari economici contengono input mancanti.");
    const quality = gate("QUALITY", qualityFindings, qualityFindings.length === 0 ? 100 : Math.max(0, 100 - qualityFindings.length * 25));

    const riskFindings: string[] = [];
    if (selected?.risk === "HIGH" && input.mission.riskTolerance !== "HIGH") riskFindings.push("Il rischio dell'opportunità supera la tolleranza dichiarata.");
    if (input.commercialPlan.validation.some(({ authorizationRequired }) => authorizationRequired)) riskFindings.push("Gli esperimenti con azione esterna restano bloccati fino ad autorizzazione separata.");
    const riskBlocking = riskFindings.filter((finding) => finding.includes("supera la tolleranza"));
    const risk = gate("RISK", riskFindings, riskBlocking.length === 0 ? 100 : 0, riskBlocking.length > 0);

    const costFindings: string[] = [];
    const validationBudget = input.commercialPlan.validation.reduce((sum, experiment) => sum + experiment.maxCostCents, 0);
    const capital = (selected?.capitalRequiredCents ?? 0) + validationBudget;
    if (capital > input.mission.maxCapitalCents) costFindings.push("Capitale richiesto e budget di validazione superano il limite della Missione.");
    const base = economics.find(({ name }) => name === "BASE");
    if (base?.grossMarginCents.value !== undefined && base.netRevenueCents.value !== undefined && base.netRevenueCents.value > 0) {
      const marginBps = Math.round(base.grossMarginCents.value / base.netRevenueCents.value * 10_000);
      if (marginBps < input.mission.minimumThresholds.minGrossMarginBps) costFindings.push("Il margine lordo BASE è sotto la soglia dichiarata.");
    } else costFindings.push("Il margine lordo BASE non è calcolabile.");
    const cost = gate("COST", costFindings, costFindings.length === 0 ? 100 : Math.max(0, 100 - costFindings.length * 50));
    return Object.freeze([quality, risk, cost]);
  }

  #owned(record: BusinessMissionDossier | undefined): BusinessMissionDossier { if (record?.workspaceId !== this.dependencies.workspaceId || record.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Business Mission dossier is unavailable"); return record; }
}

function gate(name: BusinessGate["name"], findings: readonly string[], score: number, forceBlocked = findings.length > 0): BusinessGate { return Object.freeze({ findings: Object.freeze([...findings]), name, score, status: forceBlocked ? "BLOCKED" as const : "PASSED" as const }); }
function requiredPack(value: EvidencePack | undefined): EvidencePack { if (value === undefined) throw new RepositoryConflictError("Evidence Pack is unavailable"); return value; }
function validate<T>(value: unknown, validator: (value: unknown) => { readonly ok: boolean; readonly value?: T }, label: string): T { const result = validator(value); if (!result.ok || result.value === undefined) throw new RepositoryValidationError(`${label} failed validation`); return result.value; }
