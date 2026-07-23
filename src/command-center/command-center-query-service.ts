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
import type { FounderWorkdayRecord } from "../agent-company/founder-workday.js";
import type { DailyOperatingBriefRecord } from "../daily-brief/daily-operating-brief.js";
import type {
  ControlActionReceipt,
  OperationsControlAction,
  OperationsIncidentRecord,
  ProductionControlRecord,
} from "../operations-control/operations-control.js";
import { controlFingerprint } from "../operations-control/operations-control-validator.js";
import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type {
  OperationsJobSummary,
  OperationsRuntimeCounts,
  OperationsRuntimeUsageSummary,
} from "../operations-runtime/operations-runtime.js";
import type { ReferenceVaultCommandCenterQuery } from "./reference-vault-query.js";
import type { CommandCenterReferenceVaultView } from "./reference-vault-view.js";
import {
  buildCommandCenterRevenueView,
  type CommandCenterRevenueView,
} from "./command-center-revenue-view.js";
import {
  EMPTY_COMMAND_CENTER_VENTURE_VIEW,
  type CommandCenterVentureQuery,
  type CommandCenterVentureView,
} from "./command-center-venture-view.js";

export const COMMAND_CENTER_CONTRACT_VERSION = "1" as const;

const BUSINESS_LIMIT = 25;
const ORACLE_APPROVED_BUSINESS_LIMIT = 100;
const EXPOSED_WORKDAY_LIMIT = 3;
const FOUNDER_WORKDAY_LIMIT = 25;
const INCIDENT_LIMIT = 100;
const OPERATIONS_JOB_LIMIT = 100;
const PRODUCTION_LIMIT = 25;
const RESEARCH_LIMIT = 25;
const SOCIAL_LIVE_LIMIT = 500;
const WORKDAY_LIMIT = 25;

const EMPTY_REFERENCE_VAULT_VIEW: CommandCenterReferenceVaultView = Object.freeze({
  assets: Object.freeze([]),
  businessContext: null,
  coverage: "NOT_AVAILABLE",
  decisions: Object.freeze([]),
  missingInputs: Object.freeze(["Nessun riferimento importato."]),
  outcomeLinks: Object.freeze([]),
  queryStatus: "UNAVAILABLE",
  rightsBlockers: Object.freeze([]),
  sequences: Object.freeze([]),
  visualFingerprint: null,
  writingFingerprint: null,
});

export interface CommandCenterClock {
  now(): Date;
}

export interface CommandCenterSnapshot {
  readonly agentCompany: readonly AgentCompanyWorkday[];
  readonly agents: readonly CommandCenterAgentSummary[];
  readonly business: readonly BusinessMissionDossier[];
  readonly contractVersion: typeof COMMAND_CENTER_CONTRACT_VERSION;
  readonly controls: CommandCenterControlSummary;
  readonly dailyOperatingBriefs: readonly DailyOperatingBriefRecord[];
  readonly evidence: CommandCenterEvidenceSummary;
  readonly founderWorkdays: readonly FounderWorkdayRecord[];
  readonly generatedAt: string;
  readonly overview: CommandCenterOverview;
  readonly oracleBusinessMissions: readonly BusinessMissionDossier[];
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
  readonly referenceVault: CommandCenterReferenceVaultView;
  readonly revenue: CommandCenterRevenueView;
  readonly research: readonly AuthorizedResearchMission[];
  readonly runtime: CommandCenterRuntimeSummary;
  readonly socialIntelligence: CommandCenterSocialIntelligenceSummary;
  readonly socialLive: DailySocialOperationsReport;
  readonly venture: CommandCenterVentureView;
}

export interface CommandCenterSocialIntelligenceSummary {
  readonly blocked: number;
  readonly coverage: "COMPLETE" | "LIMIT_REACHED";
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
  readonly coverage: "COMPLETE" | "LIMIT_REACHED";
  readonly displayName: string;
  readonly executor: string;
  readonly measuredCostCents: number;
  readonly measuredDurationMs: number;
  readonly observedWorkdays: number;
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
  readonly decisionInbox: readonly CommandCenterDecisionInboxItem[];
  readonly decisionInboxCoverage: "COMPLETE" | "LIMIT_REACHED";
  readonly decisionsRequired: number;
  readonly dailyBrief: {
    readonly decision: string;
    readonly detail: string;
    readonly priority: string;
  };
  readonly externalActions: "LOCKED";
  readonly metrics: readonly CommandCenterMetric[];
  readonly operationalWindow: {
    readonly agentCompanyWorkdays: CommandCenterWindowCoverage;
    readonly businessMissions: CommandCenterWindowCoverage;
    readonly productions: CommandCenterWindowCoverage;
  };
  readonly system: "READY" | "ATTENTION_REQUIRED";
}

export interface CommandCenterWindowCoverage {
  readonly limit: number;
  readonly observed: number;
  readonly status: "COMPLETE" | "LIMIT_REACHED";
}

export interface CommandCenterDecisionInboxItem {
  readonly decisionKey: string;
  readonly entityId: string;
  readonly entityType:
    | "AGENT_COMPANY_WORKDAY"
    | "BUSINESS_MISSION"
    | "CONTENT_PRODUCTION"
    | "FOUNDER_WORKDAY"
    | "OPERATIONS_INCIDENT"
    | "OPERATIONS_JOB"
    | "RESEARCH_MISSION"
    | "VENTURE"
    | "VENTURE_EXPERIMENT"
    | "VENTURE_THESIS";
  readonly priority: "HIGH" | "MEDIUM";
  readonly question: string;
  readonly reasonCode: string;
  readonly updatedAt: string;
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
  readonly continuousWorker: "NOT_REGISTERED" | "READY" | "STALE";
  readonly counts: OperationsRuntimeCounts;
  readonly killSwitch: "LOCKED" | "TRIGGERED";
  readonly jobs: readonly OperationsJobSummary[];
  readonly maintenanceMode: "DISABLED" | "ENABLED";
  readonly productionCounts: ProductionRuntimeJobCounts;
  readonly scheduler: "MISSING" | "READY" | "STALE";
  readonly status: "ATTENTION_REQUIRED" | "READY";
  readonly telegram: "NOT_OBSERVED";
  readonly usage: OperationsRuntimeUsageSummary;
  readonly workers: Readonly<{ readonly active: number; readonly stale: number }>;
}

export interface CommandCenterControlSummary {
  readonly incidents: readonly OperationsIncidentRecord[];
  readonly productionControls: readonly ProductionControlRecord[];
  readonly receipts: readonly ControlActionReceipt[];
  readonly targets: readonly CommandCenterControlTarget[];
}

/** Redaction-safe, version-bound targets used by the two-step operator boundary. */
export interface CommandCenterControlTarget {
  readonly actions: readonly OperationsControlAction[];
  readonly contentPackageFingerprint?: string;
  readonly entityId: string;
  readonly fingerprint: string;
  readonly kind: "INCIDENT" | "JOB" | "PRODUCTION";
  readonly state: string;
  readonly updatedAt: string;
  readonly version: number;
}

export class CommandCenterQueryService {
  readonly #actorId: string;
  readonly #clock: CommandCenterClock;
  readonly #referenceVault: Pick<ReferenceVaultCommandCenterQuery, "snapshot"> | undefined;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #venture: Pick<CommandCenterVentureQuery, "snapshot"> | undefined;
  readonly #workspaceId: string;

  public constructor(input: {
    readonly actorId: string;
    readonly clock?: CommandCenterClock;
    readonly referenceVault?: Pick<ReferenceVaultCommandCenterQuery, "snapshot">;
    readonly repositories: RepositoryTransactionRunner;
    readonly venture?: Pick<CommandCenterVentureQuery, "snapshot">;
    readonly workspaceId: string;
  }) {
    this.#actorId = input.actorId;
    this.#clock = input.clock ?? systemClock;
    this.#referenceVault = input.referenceVault;
    this.#repositories = input.repositories;
    this.#venture = input.venture;
    this.#workspaceId = input.workspaceId;
  }

  public async snapshot(): Promise<CommandCenterSnapshot> {
    // Each projection owns a separate SQLite connection whose transaction runner uses
    // BEGIN IMMEDIATE. Reading them sequentially prevents a truthful projection from
    // being downgraded to UNAVAILABLE solely because two local read snapshots raced.
    const referenceVault = this.#referenceVault === undefined
      ? EMPTY_REFERENCE_VAULT_VIEW
      : await this.#referenceVault.snapshot().catch(() => Object.freeze({
        ...EMPTY_REFERENCE_VAULT_VIEW,
        missingInputs: Object.freeze(["Reference Vault temporaneamente non disponibile: nessun riferimento è stato esposto."]),
      }));
    const venture = this.#venture === undefined
      ? EMPTY_COMMAND_CENTER_VENTURE_VIEW
      : await this.#venture.snapshot().catch(() => Object.freeze({
        ...EMPTY_COMMAND_CENTER_VENTURE_VIEW,
        health: Object.freeze({
          nextAction: "Ripristina la query locale del Venture Portfolio senza dedurre stato dai dati parziali.",
          reasonCode: "VENTURE_QUERY_UNAVAILABLE",
          status: "ATTENTION_REQUIRED" as const,
        }),
      }));
    return this.#repositories.transaction(async ({
      businessMissions,
      agentCompanyWorkdays,
      authorizedResearch,
      contentProductions,
      dailyOperatingBriefs,
      founderWorkdays,
      operationalPlanes,
      operationsControls,
      operationsRuntime,
      productionRuntimeJobs,
    }) => {
      const now = this.#clock.now();
      const [
        productions,
        workdays,
        business,
        oracleBusiness,
        sources,
        evidence,
        evidencePacks,
        productionRuntimeCounts,
        research,
        socialLiveRecords,
        dailyBriefs,
        founderAcceptanceWorkdays,
        operationsCounts,
        operationsControl,
        schedulerLeases,
        workerLeases,
        productionControls,
        incidents,
        controlReceipts,
        operationsJobs,
        operationsUsage,
      ] = await Promise.all([
        contentProductions.listByWorkspaceId(this.#workspaceId, PRODUCTION_LIMIT),
        agentCompanyWorkdays.listByOwner({ actorId: this.#actorId, workspaceId: this.#workspaceId }, WORKDAY_LIMIT),
        businessMissions.listByWorkspaceId(this.#workspaceId, BUSINESS_LIMIT),
        businessMissions.listApprovedByOwner({ actorId: this.#actorId, workspaceId: this.#workspaceId }, ORACLE_APPROVED_BUSINESS_LIMIT),
        operationalPlanes.listSourcesByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidenceByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidencePacksByWorkspaceId(this.#workspaceId, 100),
        productionRuntimeJobs.summarize(this.#workspaceId),
        authorizedResearch.listMissionsByWorkspaceId(this.#workspaceId, RESEARCH_LIMIT),
        operationalPlanes.listSocialLiveRecordsByWorkspaceId(this.#workspaceId, SOCIAL_LIVE_LIMIT),
        dailyOperatingBriefs.listByWorkspaceId(this.#workspaceId, 14),
        founderWorkdays.listByWorkspaceId(this.#workspaceId, FOUNDER_WORKDAY_LIMIT),
        operationsRuntime.summarize(this.#workspaceId),
        operationsRuntime.getControl(this.#workspaceId),
        operationsRuntime.listProcessLeases(this.#workspaceId, "SCHEDULER", 10),
        operationsRuntime.listProcessLeases(this.#workspaceId, "WORKER", 100),
        operationsControls.listProductionControls(this.#workspaceId, 100),
        operationsControls.listIncidents(this.#workspaceId, INCIDENT_LIMIT),
        operationsControls.listReceipts(this.#workspaceId, 100),
        operationsRuntime.listJobsByWorkspaceId(this.#workspaceId, OPERATIONS_JOB_LIMIT),
        operationsRuntime.summarizeUsage(this.#workspaceId),
      ]);
      if (workdays.some((workday) => workday.workspaceId !== this.#workspaceId || workday.actorId !== this.#actorId)) throw new RepositoryValidationError("Command Center Agent Company read returned cross-identity data");
      if (oracleBusiness.some((mission) => mission.workspaceId !== this.#workspaceId || mission.actorId !== this.#actorId || mission.status !== "APPROVED")) throw new RepositoryValidationError("Command Center ORACLE read returned invalid mission data");
      const ownedBusiness = business.filter((mission) => mission.workspaceId === this.#workspaceId && mission.actorId === this.#actorId);
      const pendingFabio = productions.filter(
        ({ status }) => status === "PENDING_FABIO_APPROVAL",
      ).length;
      const pendingBusiness = ownedBusiness.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").length;
      const pendingWorkdays = workdays.filter(({ status }) => status === "AWAITING_FABIO").length;
      const blockedWorkdays = workdays.filter(({ status }) => status === "BLOCKED").length;
      const blockedBusiness = ownedBusiness.filter(({ status }) => status === "BLOCKED").length;
      const blockedResearch = research.filter(({ status }) => status === "BLOCKED").length;
      const blockedClaims = research.flatMap(({ claimResults }) => claimResults).filter(({ status }) => status !== "VERIFIED").length;
      const pendingEvidenceAttested = productions.filter(
        ({ evidencePack, status }) =>
          status === "PENDING_FABIO_APPROVAL" && evidencePack !== undefined,
      ).length;
      const blocked = productions.filter(
        ({ status }) => status === "BLOCKED",
      ).length;
      const schedulerLease = schedulerLeases.find(({ leaseKey }) => leaseKey === "scheduler");
      const schedulerStatus = schedulerLease === undefined
        ? "MISSING" as const
        : Date.parse(schedulerLease.expiresAt) > now.getTime()
          ? "READY" as const
          : "STALE" as const;
      const activeWorkers = workerLeases.filter(({ expiresAt }) => Date.parse(expiresAt) > now.getTime()).length;
      const staleWorkers = workerLeases.length - activeWorkers;
      const continuousWorker = activeWorkers > 0
        ? "READY" as const
        : workerLeases.length > 0
          ? "STALE" as const
          : "NOT_REGISTERED" as const;
      const operationalStop = operationsControl?.killSwitch === "ACTIVE" || operationsControl?.maintenanceMode === "ENABLED";
      const averageQuality = productions.length === 0
        ? undefined
        : Math.round(productions.reduce((total, production) => total + production.package.quality.readinessScore, 0) / productions.length);
      const socialPacks = productions.flatMap(({ package: contentPackage }) => contentPackage.socialPublishingPack === undefined ? [] : [contentPackage.socialPublishingPack]);
      const snapshotAt = now.getTime();
      const currentDailyBriefs = latestDailyBriefSnapshots(dailyBriefs);
      const productionWindow = windowCoverage(productions.length, PRODUCTION_LIMIT);
      const businessWindow = windowCoverage(business.length, BUSINESS_LIMIT);
      const workdayWindow = windowCoverage(workdays.length, WORKDAY_LIMIT);
      const approvalWindowLimited = productionWindow.status === "LIMIT_REACHED" || businessWindow.status === "LIMIT_REACHED" || workdayWindow.status === "LIMIT_REACHED";
      const latestDailyBrief = currentDailyBriefs[0];
      const decisionInbox = commandCenterDecisionInbox({
        business: ownedBusiness,
        founderWorkdays: founderAcceptanceWorkdays,
        incidents,
        jobs: operationsJobs,
        productions,
        research,
        venture,
        workdays,
      });
      const decisionInboxCoverage = completeDecisionCoverage({
        business: ownedBusiness,
        founderWorkdays: founderAcceptanceWorkdays,
        incidents,
        jobs: operationsJobs,
        productions,
        research,
        workdays,
      }) && venture.coverage !== "LIMIT_REACHED" ? "COMPLETE" as const : "LIMIT_REACHED" as const;
      const socialCoverage = socialLiveRecords.length < SOCIAL_LIVE_LIMIT && productionWindow.status === "COMPLETE"
        ? "COMPLETE" as const
        : "LIMIT_REACHED" as const;
      const attentionRequired = operationalStop
        || schedulerStatus !== "READY"
        || continuousWorker !== "READY"
        || operationsCounts.blocked > 0
        || operationsCounts.deadLetter > 0
        || operationsCounts.failed > 0
        || blocked > 0
        || blockedBusiness > 0
        || blockedWorkdays > 0
        || blockedResearch > 0
        || incidents.some(({ status }) => status === "OPEN")
        || venture.coverage === "LIMIT_REACHED"
        || venture.health.status === "ATTENTION_REQUIRED"
        || decisionInboxCoverage === "LIMIT_REACHED"
        || socialCoverage === "LIMIT_REACHED";
      const pendingApprovals = pendingFabio + pendingBusiness + pendingWorkdays;
      const controlTargets = commandCenterControlTargets({ incidents, jobs: operationsJobs, productionControls, productions });
      const revenue = buildCommandCenterRevenueView({
        agentCompany: workdays,
        businessContext: referenceVault.businessContext,
        businessMissions: ownedBusiness,
        coverage: decisionInboxCoverage,
        evidencePacks,
        productions,
      });

      return Object.freeze({
        // The overview carries complete task detail only for the three highest-
        // priority workdays. Metrics and Decision Inbox still use the bounded
        // 25-record control-plane window, preventing large outputs from
        // multiplying into an unbounded API/DOM response.
        agentCompany: Object.freeze(workdays.slice(0, EXPOSED_WORKDAY_LIMIT)),
        agents: agentSummaries(workdays),
        business: Object.freeze([...ownedBusiness]),
        contractVersion: COMMAND_CENTER_CONTRACT_VERSION,
        controls: Object.freeze({
          incidents: Object.freeze([...incidents]),
          productionControls: Object.freeze([...productionControls]),
          receipts: Object.freeze([...controlReceipts]),
          targets: controlTargets,
        }),
        dailyOperatingBriefs: currentDailyBriefs,
        evidence: Object.freeze({
          evidence: Object.freeze([...evidence]),
          evidencePacks: Object.freeze([...evidencePacks]),
          researchMissions: Object.freeze([...research]),
          sources: Object.freeze([...sources]),
        }),
        founderWorkdays: Object.freeze([...founderAcceptanceWorkdays]),
        generatedAt: now.toISOString(),
        overview: Object.freeze({
          autonomy: "A3 — Controllata" as const,
          decisionInbox,
          decisionInboxCoverage,
          dailyBrief: latestDailyBrief === undefined ? dailyBrief({
            blocked,
            blockedBusiness,
            blockedResearch,
            coverageLimited: decisionInboxCoverage === "LIMIT_REACHED" || socialCoverage === "LIMIT_REACHED",
            evidencePacks: evidencePacks.length,
            pendingFabio,
            pendingBusiness,
            pendingWorkdays,
            blockedWorkdays,
            pendingEvidenceAttested,
            runtimeCounts: operationsCounts,
            venture,
          }) : durableDailyBrief(latestDailyBrief),
          decisionsRequired: decisionInbox.length,
          externalActions: "LOCKED" as const,
          metrics: Object.freeze([
            metric(
              "approval",
              "Revisione Fabio",
              lowerBoundValue(pendingApprovals, approvalWindowLimited),
              pendingApprovals === 0
                ? approvalWindowLimited
                  ? "Nessuna richiesta di revisione nella finestra osservata; la copertura è parziale e il totale globale non è determinabile."
                  : "Nessun pacchetto o giornata operativa richiede una decisione."
                : `${String(pendingWorkdays)} giornate operative, ${String(pendingBusiness)} dossier Business e ${String(pendingFabio)} pacchetto/i contenuto richiedono una decisione nella finestra osservata.${pendingEvidenceAttested === pendingFabio ? " I contenuti in attesa hanno attestazione delle evidenze." : " Alcuni contenuti richiedono ancora un'attestazione dell'Evidence Pack."}${approvalWindowLimited ? " Copertura parziale: il valore è un limite inferiore, non un totale globale." : ""}`,
              pendingApprovals === 0 ? approvalWindowLimited ? "attention" : "neutral" : "gold",
            ),
            metric(
              "production-queue",
              "Coda di produzione",
              operationsCounts.queued + operationsCounts.retryScheduled + operationsCounts.running,
              "Job durevoli osservati nel runtime H24 supervisionato.",
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
                : productionWindow.status === "LIMIT_REACHED"
                  ? `Media calcolata sui ${String(productionWindow.observed)} pacchetti più recenti; copertura parziale, non è una media globale.`
                  : `Media calcolata su tutti i ${String(productionWindow.observed)} pacchetti persistiti osservati.`,
              averageQuality === undefined ? "neutral" : "success",
            ),
            metric(
              "worker",
              "Stato worker",
              continuousWorker === "READY" ? "READY" : continuousWorker === "STALE" ? "STALE" : "NON REGISTRATO",
              continuousWorker === "READY" ? `${String(activeWorkers)} worker supervisionato/i con lease attiva.` : continuousWorker === "STALE" ? "Esiste una lease worker scaduta: è richiesta la riconciliazione." : "Coda, lease e retry sono disponibili; nessun processo H24 è registrato.",
              continuousWorker === "READY" ? "success" : "attention",
            ),
            metric(
              "dead-letter",
              "Coda dead-letter",
              operationsCounts.deadLetter,
              operationsCounts.deadLetter === 0
                ? "Nessun job richiede recupero."
                : "È richiesto il recupero manuale prima di proseguire.",
              operationsCounts.deadLetter === 0 ? "success" : "attention",
            ),
          ]),
          operationalWindow: Object.freeze({
            agentCompanyWorkdays: workdayWindow,
            businessMissions: businessWindow,
            productions: productionWindow,
          }),
          system: attentionRequired ? "ATTENTION_REQUIRED" : "READY",
        }),
        oracleBusinessMissions: Object.freeze([...oracleBusiness]),
        productions: Object.freeze([...productions]),
        referenceVault,
        revenue,
        research: Object.freeze([...research]),
        runtime: Object.freeze({
          continuousWorker,
          counts: Object.freeze({ ...operationsCounts }),
          killSwitch: operationsControl?.killSwitch === "ACTIVE" ? "TRIGGERED" : "LOCKED",
          jobs: Object.freeze([...operationsJobs]),
          maintenanceMode: operationsControl?.maintenanceMode ?? "DISABLED",
          productionCounts: Object.freeze({ ...productionRuntimeCounts }),
          scheduler: schedulerStatus,
          status: attentionRequired ? "ATTENTION_REQUIRED" : "READY",
          telegram: "NOT_OBSERVED" as const,
          usage: Object.freeze({ ...operationsUsage }),
          workers: Object.freeze({ active: activeWorkers, stale: staleWorkers }),
        }),
        socialIntelligence: Object.freeze({
          blocked: socialPacks.filter(({ status }) => status === "BLOCKED").length,
          coverage: socialCoverage,
          expiringWithin24Hours: socialPacks.filter(({ trendAnalysis }) => trendAnalysis.status === "ACTIVE" && trendAnalysis.publishBy !== undefined && Date.parse(trendAnalysis.publishBy) > snapshotAt && Date.parse(trendAnalysis.publishBy) <= snapshotAt + 86_400_000).length,
          packs: Object.freeze([...socialPacks]),
          readyForFabio: socialPacks.filter(({ status }) => status === "READY_FOR_FABIO_APPROVAL").length,
          requiresResearch: socialPacks.filter(({ status }) => status === "REQUIRES_RESEARCH").length,
        }),
        socialLive: buildDailySocialOperationsReport(socialLiveRecords, now, sources.map(({ sourceId }) => sourceId)),
        venture,
      });
    });
  }
}

function completeDecisionCoverage(input: {
  readonly business: readonly unknown[];
  readonly founderWorkdays: readonly unknown[];
  readonly incidents: readonly unknown[];
  readonly jobs: readonly unknown[];
  readonly productions: readonly unknown[];
  readonly research: readonly unknown[];
  readonly workdays: readonly unknown[];
}): boolean {
  return input.business.length < BUSINESS_LIMIT
    && input.founderWorkdays.length < FOUNDER_WORKDAY_LIMIT
    && input.incidents.length < INCIDENT_LIMIT
    && input.jobs.length < OPERATIONS_JOB_LIMIT
    && input.productions.length < PRODUCTION_LIMIT
    && input.research.length < RESEARCH_LIMIT
    && input.workdays.length < WORKDAY_LIMIT;
}

function commandCenterControlTargets(input: {
  readonly incidents: readonly OperationsIncidentRecord[];
  readonly jobs: readonly OperationsJobSummary[];
  readonly productionControls: readonly ProductionControlRecord[];
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
}): readonly CommandCenterControlTarget[] {
  const controls = new Map(input.productionControls.map((control) => [control.productionId, control]));
  const productions = input.productions.flatMap((production): readonly CommandCenterControlTarget[] => {
    const control = controls.get(production.productionId);
    const state = control?.state ?? "ACTIVE";
    const actions: readonly OperationsControlAction[] = state === "ACTIVE"
      ? ["REQUEST_PRODUCTION_REVISION", "PAUSE_PRODUCTION", "CANCEL_PRODUCTION"]
      : state === "PAUSED"
        ? ["REQUEST_PRODUCTION_REVISION", "RESUME_PRODUCTION", "CANCEL_PRODUCTION"]
        : [];
    return actions.length === 0 ? [] : [Object.freeze({
      actions: Object.freeze([...actions]),
      contentPackageFingerprint: canonicalSha256(production.package),
      entityId: production.productionId,
      fingerprint: controlFingerprint(control ?? production),
      kind: "PRODUCTION" as const,
      state,
      updatedAt: control?.updatedAt ?? production.updatedAt,
      version: control?.version ?? production.version,
    })];
  });
  const jobs = input.jobs.flatMap((job): readonly CommandCenterControlTarget[] => {
    const action: OperationsControlAction | undefined = job.status === "FAILED"
      ? "RETRY_FAILED_JOB"
      : job.status === "DEAD_LETTER"
        ? "REQUEUE_DEAD_LETTER_JOB"
        : undefined;
    return action === undefined ? [] : [Object.freeze({
      actions: Object.freeze([action]),
      entityId: job.jobId,
      fingerprint: job.targetFingerprint,
      kind: "JOB" as const,
      state: job.status,
      updatedAt: job.updatedAt,
      version: job.version,
    })];
  });
  const incidents = input.incidents.flatMap((incident): readonly CommandCenterControlTarget[] => incident.status !== "OPEN" ? [] : [Object.freeze({
    actions: Object.freeze(["ACKNOWLEDGE_INCIDENT" as const]),
    entityId: incident.incidentId,
    fingerprint: incident.fingerprint,
    kind: "INCIDENT" as const,
    state: incident.status,
    updatedAt: incident.updatedAt,
    version: incident.version,
  })]);
  return Object.freeze([...productions, ...jobs, ...incidents]);
}

function commandCenterDecisionInbox(input: {
  readonly business: readonly BusinessMissionDossier[];
  readonly founderWorkdays: readonly FounderWorkdayRecord[];
  readonly incidents: readonly OperationsIncidentRecord[];
  readonly jobs: readonly OperationsJobSummary[];
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
  readonly research: readonly AuthorizedResearchMission[];
  readonly venture: CommandCenterVentureView;
  readonly workdays: readonly AgentCompanyWorkday[];
}): readonly CommandCenterDecisionInboxItem[] {
  const inbox = new Map<string, CommandCenterDecisionInboxItem>();
  const add = (item: CommandCenterDecisionInboxItem): void => {
    if (!inbox.has(item.decisionKey)) inbox.set(item.decisionKey, Object.freeze(item));
  };

  for (const production of input.productions) {
    if (production.status !== "PENDING_FABIO_APPROVAL" && production.status !== "BLOCKED") continue;
    add({
      decisionKey: `CONTENT_PRODUCTION:${production.productionId}`,
      entityId: production.productionId,
      entityType: "CONTENT_PRODUCTION",
      priority: production.status === "BLOCKED" ? "HIGH" : "MEDIUM",
      question: production.status === "BLOCKED" ? "Risolvi il blocker del pacchetto di contenuto." : "Revisiona il pacchetto di contenuto senza pubblicarlo.",
      reasonCode: production.status,
      updatedAt: production.updatedAt,
    });
  }
  for (const mission of input.business) {
    if (mission.status !== "PENDING_FABIO_APPROVAL" && mission.status !== "BLOCKED") continue;
    add({
      decisionKey: `BUSINESS_MISSION:${mission.mission.missionId}`,
      entityId: mission.mission.missionId,
      entityType: "BUSINESS_MISSION",
      priority: mission.status === "BLOCKED" ? "HIGH" : "MEDIUM",
      question: mission.status === "BLOCKED" ? "Risolvi dati, economics o gate della Business Mission." : "Revisiona il dossier Business Mission.",
      reasonCode: mission.status,
      updatedAt: mission.updatedAt,
    });
  }
  for (const workday of input.workdays) {
    if (workday.status !== "AWAITING_FABIO" && workday.status !== "BLOCKED") continue;
    add({
      decisionKey: `AGENT_COMPANY_WORKDAY:${workday.workdayId}`,
      entityId: workday.workdayId,
      entityType: "AGENT_COMPANY_WORKDAY",
      priority: workday.status === "BLOCKED" ? "HIGH" : "MEDIUM",
      question: workday.status === "BLOCKED" ? "Risolvi il task o gate bloccato della Agent Company." : "Revisiona gli output della giornata Agent Company.",
      reasonCode: workday.status,
      updatedAt: workday.updatedAt,
    });
  }
  for (const mission of input.research) {
    if (mission.status !== "BLOCKED") continue;
    add({
      decisionKey: `RESEARCH_MISSION:${mission.input.missionId}`,
      entityId: mission.input.missionId,
      entityType: "RESEARCH_MISSION",
      priority: "HIGH",
      question: "Risolvi il blocker della Research Mission senza aggirare il Source Registry.",
      reasonCode: mission.blockers[0] ?? mission.status,
      updatedAt: mission.updatedAt,
    });
  }
  for (const job of input.jobs) {
    if (job.status !== "FAILED" && job.status !== "DEAD_LETTER") continue;
    add({
      decisionKey: `OPERATIONS_JOB:${job.jobId}`,
      entityId: job.jobId,
      entityType: "OPERATIONS_JOB",
      priority: "HIGH",
      question: job.status === "DEAD_LETTER" ? "Ispeziona e, se corretto, crea l'unico successor manuale." : "Ispeziona il fallimento prima di richiedere un retry.",
      reasonCode: job.status,
      updatedAt: job.updatedAt,
    });
  }
  for (const incident of input.incidents) {
    if (incident.status !== "OPEN") continue;
    add({
      decisionKey: `OPERATIONS_INCIDENT:${incident.incidentId}`,
      entityId: incident.incidentId,
      entityType: "OPERATIONS_INCIDENT",
      priority: "HIGH",
      question: "Revisiona e riconosci l'incidente operativo aperto.",
      reasonCode: incident.summaryCode,
      updatedAt: incident.updatedAt,
    });
  }
  for (const decision of input.venture.decisions) {
    add({
      decisionKey: `${decision.entityType}:${decision.entityId}:${decision.decisionId}`,
      entityId: decision.entityId,
      entityType: decision.entityType,
      priority: decision.priority,
      question: decision.question,
      reasonCode: decision.reasonCode,
      updatedAt: decision.updatedAt,
    });
  }

  const latestFounderWorkday = [...input.founderWorkdays].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  if (latestFounderWorkday !== undefined) {
    for (const decision of latestFounderWorkday.artifacts.decisionList) {
      const productionId = founderProductionDecisionId(decision.evidence);
      if (productionId !== undefined) {
        // Current production state above is authoritative. A dossier snapshot must
        // never resurrect a decision that was already resolved.
        continue;
      }
      add({
        decisionKey: `FOUNDER_WORKDAY:${latestFounderWorkday.workdayId}:${decision.decisionId}`,
        entityId: latestFounderWorkday.workdayId,
        entityType: "FOUNDER_WORKDAY",
        priority: decision.priority === "HIGH" ? "HIGH" : "MEDIUM",
        question: decision.question,
        reasonCode: decision.decisionId,
        updatedAt: latestFounderWorkday.updatedAt,
      });
    }
  }

  const rank = { HIGH: 0, MEDIUM: 1 } as const;
  return Object.freeze([...inbox.values()].sort((left, right) => rank[left.priority] - rank[right.priority] || left.decisionKey.localeCompare(right.decisionKey)));
}

function founderProductionDecisionId(evidence: readonly string[]): string | undefined {
  const prefix = "metodo_veloce_content_productions:";
  return evidence.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function dailyBrief(input: {
  readonly blocked: number;
  readonly blockedBusiness: number;
  readonly blockedResearch: number;
  readonly blockedWorkdays: number;
  readonly coverageLimited: boolean;
  readonly evidencePacks: number;
  readonly pendingFabio: number;
  readonly pendingBusiness: number;
  readonly pendingEvidenceAttested: number;
  readonly pendingWorkdays: number;
  readonly runtimeCounts: OperationsRuntimeCounts;
  readonly venture: CommandCenterVentureView;
}): CommandCenterOverview["dailyBrief"] {
  if (input.venture.decisions.length > 0) {
    return Object.freeze({
      decision: "Il Venture Portfolio richiede una decisione di Fabio",
      detail: `${String(input.venture.decisions.length)} decisione/i version-bound attendono revisione. Nessuna Venture è stata attivata automaticamente.`,
      priority: "Apri Venture Studio e verifica tesi, evidenze, economics, esperimenti e fingerprint prima di decidere.",
    });
  }
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
  if (input.blocked > 0) {
    return Object.freeze({
      decision: "È richiesta la correzione del contenuto",
      detail: `${String(input.blocked)} pacchetto/i di contenuto restano bloccati.`,
      priority: "Risolvi il rilievo di rischio registrato prima della revisione.",
    });
  }
  if (input.coverageLimited) {
    return Object.freeze({
      decision: "La copertura operativa è parziale",
      detail: "Una o più finestre hanno raggiunto il limite: l'assenza di elementi nella vista non dimostra l'assenza globale di decisioni o blocchi.",
      priority: "Riduci o pagina la finestra osservata e riconcilia tutti i record prima di dichiarare il sistema pronto.",
    });
  }
  if (input.evidencePacks === 0) {
    return Object.freeze({
      decision: "L'acquisizione delle evidenze è la prossima decisione",
      detail: "Nessun Evidence Pack immutabile è disponibile per una nuova produzione Metodo Veloce.",
      priority: "Acquisisci evidenze autorizzate prima della produzione del contenuto.",
    });
  }
  return Object.freeze({
    decision: "Nessuna decisione immediata dell'operatore",
    detail: "La dashboard non rileva approvazioni in attesa, job dead-letter o contenuti bloccati.",
    priority: "Crea una missione di ricerca quando nuove evidenze autorizzate sono pronte da acquisire.",
  });
}

function durableDailyBrief(brief: DailyOperatingBriefRecord): CommandCenterOverview["dailyBrief"] {
  const decisions = brief.sections.recommendedFounderDecisions.value;
  const blocked = brief.sections.blockedTasks.value;
  const unavailable = Object.values(brief.sections).filter(({ kind }) => kind === "UNAVAILABLE").length;
  const firstDecision = decisions[0];
  if (firstDecision !== undefined) {
    return Object.freeze({
      decision: firstDecision.question,
      detail: `Brief durevole ${brief.businessDate}: ${String(blocked.length)} task bloccati, ${String(decisions.length)} decisioni aperte, ${String(unavailable)} sezioni non disponibili.`,
      priority: `${firstDecision.priority} · Apri il Daily Operating Brief e verifica evidenze, provenienza e limitazioni.`,
    });
  }
  return Object.freeze({
    decision: "Daily Operating Brief disponibile",
    detail: `Brief durevole ${brief.businessDate}: ${String(blocked.length)} task bloccati, nessuna decisione fondatore aperta, ${String(unavailable)} sezioni non disponibili.`,
    priority: externalEffectsBriefLine(brief.sections.externalActionsPerformed),
  });
}

function externalEffectsBriefLine(section: DailyOperatingBriefRecord["sections"]["externalActionsPerformed"]): string {
  if (section.kind !== "MEASURED") return "Copertura globale degli effetti esterni non disponibile: consulta provenienza e limitazioni prima di avviare nuovo lavoro.";
  const total = Object.values(section.value).reduce((sum, value) => sum + value, 0);
  return total === 0
    ? "Le receipt con copertura attestata misurano zero effetti esterni; consulta comunque le sezioni complete."
    : `Le receipt misurano ${String(total)} effetto/i esterno/i: ispeziona il dettaglio prima di qualsiasi nuova azione.`;
}

function agentSummaries(
  workdays: readonly AgentCompanyWorkday[],
): readonly CommandCenterAgentSummary[] {
  const coverage = workdays.length < WORKDAY_LIMIT ? "COMPLETE" as const : "LIMIT_REACHED" as const;
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
      coverage,
      displayName: agent.displayName,
      executor: agent.executorId,
      measuredCostCents: tasks.reduce((total, { costCents }) => total + costCents, 0),
      measuredDurationMs: tasks.reduce((total, { durationMs }) => total + durationMs, 0),
      observedWorkdays: workdays.length,
      revisionsRequired: tasks.reduce((total, { attempts }) => total + Math.max(0, attempts - 1), 0),
      role: agent.role,
      state,
      supportedTasks: agent.supportedTasks,
      validationErrors: blockedTasks,
    });
  }));
}

function lowerBoundValue(value: number, limited: boolean): number | string {
  return limited ? `≥ ${String(value)}` : value;
}

function windowCoverage(observed: number, limit: number): CommandCenterWindowCoverage {
  return Object.freeze({
    limit,
    observed,
    status: observed < limit ? "COMPLETE" as const : "LIMIT_REACHED" as const,
  });
}

function latestDailyBriefSnapshots(records: readonly DailyOperatingBriefRecord[]): readonly DailyOperatingBriefRecord[] {
  const seen = new Set<string>();
  return Object.freeze(records.filter((record) => {
    if (seen.has(record.businessDate)) return false;
    seen.add(record.businessDate);
    return true;
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
