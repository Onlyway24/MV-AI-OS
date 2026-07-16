import type {
  MetodoVeloceContentProductionRecord,
} from "../content-production/metodo-veloce-content-production-record.js";
import type {
  EvidencePack,
  EvidenceRecord,
  SourceRegistryEntry,
} from "../operational-planes/operational-plane.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { ProductionRuntimeJobCounts } from "../production-runtime/production-runtime-job-repository.js";
import type { BusinessMissionDossier } from "../business/business-mission.js";
import {
  OPERATIONAL_AGENT_COMPANY_CATALOG,
  type AgentCompanyWorkday,
  type OperationalAgentState,
} from "../agent-company/operational-agent-company.js";
import type { AuthorizedResearchMission } from "../research/authorized-research.js";
import type { SocialPublishingPack } from "../social-intelligence/metodo-veloce-social-intelligence.js";
import type { DailySocialOperationsReport } from "../social-intelligence-live/social-intelligence-live.js";
import { buildDailySocialOperationsReport } from "../social-intelligence-live/social-intelligence-live-service.js";

export const COMMAND_CENTER_CONTRACT_VERSION = "1" as const;

export interface CommandCenterClock {
  now(): Date;
}

export interface CommandCenterSnapshot {
  readonly agentCompany: readonly AgentCompanyWorkday[];
  readonly agents: readonly CommandCenterAgentSummary[];
  readonly business: readonly BusinessMissionDossier[];
  readonly contractVersion: typeof COMMAND_CENTER_CONTRACT_VERSION;
  readonly evidence: CommandCenterEvidenceSummary;
  readonly generatedAt: string;
  readonly overview: CommandCenterOverview;
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
  readonly research: readonly AuthorizedResearchMission[];
  readonly runtime: CommandCenterRuntimeSummary;
  readonly socialIntelligence: CommandCenterSocialIntelligenceSummary;
  readonly socialLive: DailySocialOperationsReport;
}

export interface CommandCenterSocialIntelligenceSummary {
  readonly blocked: number;
  readonly expiringWithin24Hours: number;
  readonly packs: readonly SocialPublishingPack[];
  readonly readyForFabio: number;
  readonly requiresResearch: number;
}

export interface CommandCenterAgentSummary {
  readonly agentId: string;
  readonly autonomy: "A3 — Controllata";
  readonly acceptedFirstPassTasks: number;
  readonly averageQualityScore: number | "NOT_AVAILABLE";
  readonly blockedTasks: number;
  readonly completedTasks: number;
  readonly displayName: string;
  readonly executor: string;
  readonly measuredCostCents: number;
  readonly measuredDurationMs: number;
  readonly revisionsRequired: number;
  readonly role: string;
  readonly state: OperationalAgentState;
  readonly supportedTasks: readonly string[];
  readonly validationErrors: number;
}

export interface CommandCenterEvidenceSummary {
  readonly evidence: readonly EvidenceRecord[];
  readonly evidencePacks: readonly EvidencePack[];
  readonly researchMissions: readonly AuthorizedResearchMission[];
  readonly sources: readonly SourceRegistryEntry[];
}

export interface CommandCenterOverview {
  readonly autonomy: "A3 — Controllata";
  readonly decisionsRequired: number;
  readonly dailyBrief: {
    readonly decision: string;
    readonly detail: string;
    readonly priority: string;
  };
  readonly externalActions: "LOCKED";
  readonly metrics: readonly CommandCenterMetric[];
  readonly system: "READY" | "ATTENTION_REQUIRED";
}

export interface CommandCenterMetric {
  readonly context: string;
  readonly id:
    | "approval"
    | "claim-blocked"
    | "dead-letter"
    | "evidence-packs"
    | "production-queue"
    | "quality"
    | "worker";
  readonly label: string;
  readonly tone: "attention" | "gold" | "neutral" | "success";
  readonly value: number | string;
}

export interface CommandCenterRuntimeSummary {
  readonly continuousWorker: "NOT_REGISTERED";
  readonly counts: ProductionRuntimeJobCounts;
  readonly killSwitch: "LOCKED" | "TRIGGERED";
  readonly status: "ATTENTION_REQUIRED" | "READY";
  readonly telegram: "NOT_OBSERVED";
}

export class CommandCenterQueryService {
  readonly #clock: CommandCenterClock;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #workspaceId: string;

  public constructor(input: {
    readonly clock?: CommandCenterClock;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) {
    this.#clock = input.clock ?? systemClock;
    this.#repositories = input.repositories;
    this.#workspaceId = input.workspaceId;
  }

  public async snapshot(): Promise<CommandCenterSnapshot> {
    return this.#repositories.transaction(async ({
      businessMissions,
      agentCompanyWorkdays,
      authorizedResearch,
      contentProductions,
      operationalPlanes,
      productionRuntimeJobs,
    }) => {
      const [
        productions,
        workdays,
        business,
        sources,
        evidence,
        evidencePacks,
        runtimeCounts,
        killSwitch,
        research,
        socialLiveRecords,
      ] = await Promise.all([
        contentProductions.listByWorkspaceId(this.#workspaceId, 25),
        agentCompanyWorkdays.listByWorkspaceId(this.#workspaceId, 25),
        businessMissions.listByWorkspaceId(this.#workspaceId, 25),
        operationalPlanes.listSourcesByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidenceByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidencePacksByWorkspaceId(this.#workspaceId, 100),
        productionRuntimeJobs.summarize(this.#workspaceId),
        operationalPlanes.getPublicationKillSwitch(this.#workspaceId),
        authorizedResearch.listMissionsByWorkspaceId(this.#workspaceId, 25),
        operationalPlanes.listSocialLiveRecordsByWorkspaceId(this.#workspaceId, 500),
      ]);
      const pendingFabio = productions.filter(
        ({ status }) => status === "PENDING_FABIO_APPROVAL",
      ).length;
      const pendingBusiness = business.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").length;
      const pendingWorkdays = workdays.filter(({ status }) => status === "AWAITING_FABIO").length;
      const blockedWorkdays = workdays.filter(({ status }) => status === "BLOCKED").length;
      const blockedBusiness = business.filter(({ status }) => status === "BLOCKED").length;
      const blockedResearch = research.filter(({ status }) => status === "BLOCKED").length;
      const blockedClaims = research.flatMap(({ claimResults }) => claimResults).filter(({ status }) => status !== "VERIFIED").length;
      const pendingEvidenceAttested = productions.filter(
        ({ evidencePack, status }) =>
          status === "PENDING_FABIO_APPROVAL" && evidencePack !== undefined,
      ).length;
      const blocked = productions.filter(
        ({ status }) => status === "BLOCKED",
      ).length;
      const attentionRequired = runtimeCounts.deadLetter > 0 || blockedBusiness > 0 || blockedWorkdays > 0 || blockedResearch > 0;
      const averageQuality = productions.length === 0
        ? undefined
        : Math.round(productions.reduce((total, production) => total + production.package.quality.readinessScore, 0) / productions.length);
      const socialPacks = productions.flatMap(({ package: contentPackage }) => contentPackage.socialPublishingPack === undefined ? [] : [contentPackage.socialPublishingPack]);
      const snapshotAt = this.#clock.now().getTime();

      return Object.freeze({
        agentCompany: Object.freeze([...workdays]),
        agents: agentSummaries(workdays),
        business: Object.freeze([...business]),
        contractVersion: COMMAND_CENTER_CONTRACT_VERSION,
        evidence: Object.freeze({
          evidence: Object.freeze([...evidence]),
          evidencePacks: Object.freeze([...evidencePacks]),
          researchMissions: Object.freeze([...research]),
          sources: Object.freeze([...sources]),
        }),
        generatedAt: this.#clock.now().toISOString(),
        overview: Object.freeze({
          autonomy: "A3 — Controllata" as const,
          dailyBrief: dailyBrief({
            blocked,
            blockedBusiness,
            blockedResearch,
            evidencePacks: evidencePacks.length,
            pendingFabio,
            pendingBusiness,
            pendingWorkdays,
            blockedWorkdays,
            pendingEvidenceAttested,
            runtimeCounts,
          }),
          decisionsRequired: pendingFabio + blocked + pendingBusiness + blockedBusiness + pendingWorkdays + blockedWorkdays + blockedResearch + runtimeCounts.deadLetter,
          externalActions: "LOCKED" as const,
          metrics: Object.freeze([
            metric(
              "approval",
              "Revisione Fabio",
              pendingFabio + pendingBusiness + pendingWorkdays,
              pendingFabio + pendingBusiness + pendingWorkdays === 0
                ? "Nessun pacchetto o giornata operativa richiede una decisione."
                : `${String(pendingWorkdays)} giornate operative, ${String(pendingBusiness)} dossier Business e ${String(pendingFabio)} pacchetto/i contenuto richiedono una decisione.${pendingEvidenceAttested === pendingFabio ? " I contenuti in attesa hanno attestazione delle evidenze." : " Alcuni contenuti richiedono ancora un'attestazione dell'Evidence Pack."}`,
              pendingFabio + pendingBusiness + pendingWorkdays === 0 ? "neutral" : "gold",
            ),
            metric(
              "production-queue",
              "Coda di produzione",
              runtimeCounts.queued + runtimeCounts.retryScheduled + runtimeCounts.running,
              "Job durevoli osservati nella coda del runtime controllato.",
              "gold",
            ),
            metric(
              "claim-blocked",
              "Claim bloccati",
              research.length === 0 ? "—" : blockedClaims,
              research.length === 0 ? "Dato non ancora disponibile: nessuna Research Mission durevole è stata eseguita." : `${String(blockedClaims)} claim contestati o insufficienti nelle Research Mission durevoli.`,
              blockedClaims > 0 ? "attention" : research.length === 0 ? "neutral" : "success",
            ),
            metric(
              "quality",
              "Qualità media",
              averageQuality === undefined ? "—" : `${String(averageQuality)}/100`,
              averageQuality === undefined
                ? "Dato non ancora disponibile: nessun pacchetto persistito."
                : "Media calcolata sui pacchetti di contenuto persistiti.",
              averageQuality === undefined ? "neutral" : "success",
            ),
            metric(
              "worker",
              "Stato worker",
              "NON REGISTRATO",
              "Coda, lease e retry sono disponibili; il processo H24 supervisionato non è ancora registrato.",
              "attention",
            ),
            metric(
              "dead-letter",
              "Coda dead-letter",
              runtimeCounts.deadLetter,
              runtimeCounts.deadLetter === 0
                ? "Nessun job richiede recupero."
                : "È richiesto il recupero manuale prima di proseguire.",
              runtimeCounts.deadLetter === 0 ? "success" : "attention",
            ),
          ]),
          system: attentionRequired ? "ATTENTION_REQUIRED" : "READY",
        }),
        productions: Object.freeze([...productions]),
        research: Object.freeze([...research]),
        runtime: Object.freeze({
          continuousWorker: "NOT_REGISTERED" as const,
          counts: Object.freeze({ ...runtimeCounts }),
          killSwitch: killSwitch?.enabled === true ? "TRIGGERED" : "LOCKED",
          status: attentionRequired ? "ATTENTION_REQUIRED" : "READY",
          telegram: "NOT_OBSERVED" as const,
        }),
        socialIntelligence: Object.freeze({
          blocked: socialPacks.filter(({ status }) => status === "BLOCKED").length,
          expiringWithin24Hours: socialPacks.filter(({ trendAnalysis }) => trendAnalysis.status === "ACTIVE" && trendAnalysis.publishBy !== undefined && Date.parse(trendAnalysis.publishBy) > snapshotAt && Date.parse(trendAnalysis.publishBy) <= snapshotAt + 86_400_000).length,
          packs: Object.freeze([...socialPacks]),
          readyForFabio: socialPacks.filter(({ status }) => status === "READY_FOR_FABIO_APPROVAL").length,
          requiresResearch: socialPacks.filter(({ status }) => status === "REQUIRES_RESEARCH").length,
        }),
        socialLive: buildDailySocialOperationsReport(socialLiveRecords, this.#clock.now(), sources.map(({ sourceId }) => sourceId)),
      });
    });
  }
}

function dailyBrief(input: {
  readonly blocked: number;
  readonly blockedBusiness: number;
  readonly blockedResearch: number;
  readonly blockedWorkdays: number;
  readonly evidencePacks: number;
  readonly pendingFabio: number;
  readonly pendingBusiness: number;
  readonly pendingEvidenceAttested: number;
  readonly pendingWorkdays: number;
  readonly runtimeCounts: ProductionRuntimeJobCounts;
}): CommandCenterOverview["dailyBrief"] {
  if (input.pendingWorkdays > 0) {
    return Object.freeze({
      decision: "È richiesta la revisione della giornata Agent Company",
      detail: `${String(input.pendingWorkdays)} giornata/e operative hanno completato i reparti reali e attendono Fabio. Nessuna azione esterna è stata eseguita.`,
      priority: "Apri Compagnia Agenti e verifica output, gate, costi misurati e fingerprint prima di decidere.",
    });
  }
  if (input.blockedWorkdays > 0) {
    return Object.freeze({
      decision: "Una giornata Agent Company è bloccata",
      detail: `${String(input.blockedWorkdays)} giornata/e operative sono state fermate da un blocker o da un gate.`,
      priority: "Ispeziona il task bloccato e correggi l'input senza aggirare Quality, Risk o Cost Guardian.",
    });
  }
  if (input.blockedResearch > 0) {
    return Object.freeze({
      decision: "Una Research Mission è bloccata",
      detail: `${String(input.blockedResearch)} missione/i di ricerca sono state fermate da freshness, attribuzione, corroborazione o policy della fonte.`,
      priority: "Apri il Centro Evidenze e verifica claim, blocker e fonti senza aggirare il Source Registry.",
    });
  }
  if (input.pendingBusiness > 0) {
    return Object.freeze({
      decision: "È richiesta una decisione Business",
      detail: `${String(input.pendingBusiness)} dossier Business Mission contiene confronto, offerta, economics, validazione e gate pronti per Fabio.`,
      priority: "Apri Business e verifica scorecard, assunzioni, formule e conseguenze prima della decisione.",
    });
  }
  if (input.blockedBusiness > 0) {
    return Object.freeze({
      decision: "Una Business Mission richiede dati o correzioni",
      detail: `${String(input.blockedBusiness)} dossier Business è bloccato dai gate deterministici.`,
      priority: "Risolvi evidenze, economics o vincoli di rischio senza imputare valori mancanti.",
    });
  }
  if (input.pendingFabio > 0) {
    return Object.freeze({
      decision: "È richiesta una decisione di approvazione",
      detail: `${String(input.pendingFabio)} pacchetto/i di contenuto attendono Fabio dopo i controlli di qualità e rischio registrati nel pacchetto.${input.pendingEvidenceAttested === input.pendingFabio ? " Ogni pacchetto ha un'attestazione dell'Evidence Pack." : " Alcuni pacchetti richiedono ancora un'attestazione dell'Evidence Pack."}`,
      priority: "Apri il Centro Approvazioni per verificare versione esatta, registro rischi e stato delle evidenze.",
    });
  }
  if (input.runtimeCounts.deadLetter > 0) {
    return Object.freeze({
      decision: "È richiesta una decisione di recupero",
      detail: `${String(input.runtimeCounts.deadLetter)} job del runtime sono nella coda dead-letter.`,
      priority: "Ispeziona il Runtime H24 prima di aggiungere nuovo lavoro in coda.",
    });
  }
  if (input.evidencePacks === 0) {
    return Object.freeze({
      decision: "L'acquisizione delle evidenze è la prossima decisione",
      detail: "Nessun Evidence Pack immutabile è disponibile per una nuova produzione Metodo Veloce.",
      priority: "Acquisisci evidenze autorizzate prima della produzione del contenuto.",
    });
  }
  if (input.blocked > 0) {
    return Object.freeze({
      decision: "È richiesta la correzione del contenuto",
      detail: `${String(input.blocked)} pacchetto/i di contenuto restano bloccati.`,
      priority: "Risolvi il rilievo di rischio registrato prima della revisione.",
    });
  }
  return Object.freeze({
    decision: "Nessuna decisione immediata dell'operatore",
    detail: "La dashboard non rileva approvazioni in attesa, job dead-letter o contenuti bloccati.",
    priority: "Crea una missione di ricerca quando nuove evidenze autorizzate sono pronte da acquisire.",
  });
}

function agentSummaries(
  workdays: readonly AgentCompanyWorkday[],
): readonly CommandCenterAgentSummary[] {
  return Object.freeze(OPERATIONAL_AGENT_COMPANY_CATALOG.map((agent) => {
    const tasks = workdays.flatMap(({ tasks }) =>
      tasks.filter(({ agentId }) => agentId === agent.agentId),
    );
    const hasRunningTask = tasks.some(({ status }) => status === "RUNNING");
    const blockedTasks = tasks.filter(({ status }) => status === "BLOCKED").length;
    const qualityScores = tasks.flatMap(({ gates }) => gates.filter(({ gate }) => gate === "QUALITY").map(({ score }) => score));
    const state: OperationalAgentState = hasRunningTask
      ? "ACTIVE"
      : blockedTasks > 0
        ? "DEGRADED"
        : agent.state;

    return Object.freeze({
      agentId: agent.agentId,
      acceptedFirstPassTasks: tasks.filter(({ attempts, gates, status }) => status === "COMPLETED" && attempts === 1 && gates.every(({ status: gateStatus }) => gateStatus === "PASSED")).length,
      averageQualityScore: qualityScores.length === 0 ? "NOT_AVAILABLE" as const : Math.round(qualityScores.reduce((total, score) => total + score, 0) / qualityScores.length),
      autonomy: "A3 — Controllata" as const,
      blockedTasks,
      completedTasks: tasks.filter(({ status }) => status === "COMPLETED").length,
      displayName: agent.displayName,
      executor: agent.executorId,
      measuredCostCents: tasks.reduce((total, { costCents }) => total + costCents, 0),
      measuredDurationMs: tasks.reduce((total, { durationMs }) => total + durationMs, 0),
      revisionsRequired: tasks.reduce((total, { attempts }) => total + Math.max(0, attempts - 1), 0),
      role: agent.role,
      state,
      supportedTasks: agent.supportedTasks,
      validationErrors: blockedTasks,
    });
  }));
}

function metric(
  id: CommandCenterMetric["id"],
  label: string,
  value: number | string,
  context: string,
  tone: CommandCenterMetric["tone"],
): CommandCenterMetric {
  return Object.freeze({ context, id, label, tone, value });
}

const systemClock: CommandCenterClock = Object.freeze({
  now: () => new Date(),
});
