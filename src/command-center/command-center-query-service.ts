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

export const COMMAND_CENTER_CONTRACT_VERSION = "1" as const;

export interface CommandCenterClock {
  now(): Date;
}

export interface CommandCenterSnapshot {
  readonly agents: readonly CommandCenterAgentSummary[];
  readonly contractVersion: typeof COMMAND_CENTER_CONTRACT_VERSION;
  readonly evidence: CommandCenterEvidenceSummary;
  readonly generatedAt: string;
  readonly overview: CommandCenterOverview;
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
  readonly runtime: CommandCenterRuntimeSummary;
}

export interface CommandCenterAgentSummary {
  readonly autonomy: "A3 — Propositiva";
  readonly executor: "content-director@1.0.0";
  readonly role: "Divisione strategica";
  readonly state: "AVAILABLE";
  readonly telemetry: "Nessuna telemetria di esecuzione raccolta";
}

export interface CommandCenterEvidenceSummary {
  readonly evidence: readonly EvidenceRecord[];
  readonly evidencePacks: readonly EvidencePack[];
  readonly sources: readonly SourceRegistryEntry[];
}

export interface CommandCenterOverview {
  readonly autonomy: "A3 — Propositiva";
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
    | "blocked"
    | "dead-letter"
    | "evidence-packs"
    | "production-queue"
    | "scheduled";
  readonly label: string;
  readonly tone: "attention" | "gold" | "neutral" | "success";
  readonly value: number;
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
      contentProductions,
      operationalPlanes,
      productionRuntimeJobs,
    }) => {
      const [
        productions,
        sources,
        evidence,
        evidencePacks,
        runtimeCounts,
        killSwitch,
      ] = await Promise.all([
        contentProductions.listByWorkspaceId(this.#workspaceId, 25),
        operationalPlanes.listSourcesByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidenceByWorkspaceId(this.#workspaceId, 100),
        operationalPlanes.listEvidencePacksByWorkspaceId(this.#workspaceId, 100),
        productionRuntimeJobs.summarize(this.#workspaceId),
        operationalPlanes.getPublicationKillSwitch(this.#workspaceId),
      ]);
      const pendingFabio = productions.filter(
        ({ status }) => status === "PENDING_FABIO_APPROVAL",
      ).length;
      const pendingEvidenceAttested = productions.filter(
        ({ evidencePack, status }) =>
          status === "PENDING_FABIO_APPROVAL" && evidencePack !== undefined,
      ).length;
      const blocked = productions.filter(
        ({ status }) => status === "BLOCKED",
      ).length;
      const scheduled = productions.filter(
        ({ status }) => status === "SCHEDULED",
      ).length;
      const attentionRequired = runtimeCounts.deadLetter > 0;

      return Object.freeze({
        agents: Object.freeze([
          Object.freeze({
            autonomy: "A3 — Propositiva" as const,
            executor: "content-director@1.0.0" as const,
            role: "Divisione strategica" as const,
            state: "AVAILABLE" as const,
            telemetry: "Nessuna telemetria di esecuzione raccolta",
          }),
        ]),
        contractVersion: COMMAND_CENTER_CONTRACT_VERSION,
        evidence: Object.freeze({
          evidence: Object.freeze([...evidence]),
          evidencePacks: Object.freeze([...evidencePacks]),
          sources: Object.freeze([...sources]),
        }),
        generatedAt: this.#clock.now().toISOString(),
        overview: Object.freeze({
          autonomy: "A3 — Propositiva" as const,
          dailyBrief: dailyBrief({
            blocked,
            evidencePacks: evidencePacks.length,
            pendingFabio,
            pendingEvidenceAttested,
            runtimeCounts,
          }),
          externalActions: "LOCKED" as const,
          metrics: Object.freeze([
            metric(
              "approval",
              "Revisione Fabio",
              pendingFabio,
              pendingFabio === 0
                ? "Nessun pacchetto richiede una decisione."
                : pendingEvidenceAttested === pendingFabio
                  ? "I pacchetti attestati dalle evidenze richiedono la decisione di Fabio."
                  : "Alcuni pacchetti attendono la revisione senza un'attestazione dell'Evidence Pack.",
              pendingFabio === 0 ? "neutral" : "gold",
            ),
            metric(
              "production-queue",
              "Coda di produzione",
              runtimeCounts.queued + runtimeCounts.retryScheduled + runtimeCounts.running,
              "Job durevoli osservati nella coda del runtime controllato.",
              "gold",
            ),
            metric(
              "blocked",
              "Contenuti bloccati",
              blocked,
              blocked === 0
                ? "Nessun contenuto bloccato è stato registrato."
                : "Richiede correzione prima dell'approvazione.",
              blocked === 0 ? "neutral" : "attention",
            ),
            metric(
              "evidence-packs",
              "Pacchetti di evidenze",
              evidencePacks.length,
              evidencePacks.length === 0
                ? "Non è stato creato alcun pacchetto immutabile per la revisione."
                : "Insiemi di evidenze immutabili pronti per la revisione.",
              evidencePacks.length === 0 ? "neutral" : "success",
            ),
            metric(
              "scheduled",
              "Calendario interno",
              scheduled,
              scheduled === 0
                ? "Nessun contenuto è pianificato internamente."
                : "Pianificato internamente; la pubblicazione resta bloccata separatamente.",
              scheduled === 0 ? "neutral" : "success",
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
        runtime: Object.freeze({
          continuousWorker: "NOT_REGISTERED" as const,
          counts: Object.freeze({ ...runtimeCounts }),
          killSwitch: killSwitch?.enabled === true ? "TRIGGERED" : "LOCKED",
          status: attentionRequired ? "ATTENTION_REQUIRED" : "READY",
          telegram: "NOT_OBSERVED" as const,
        }),
      });
    });
  }
}

function dailyBrief(input: {
  readonly blocked: number;
  readonly evidencePacks: number;
  readonly pendingFabio: number;
  readonly pendingEvidenceAttested: number;
  readonly runtimeCounts: ProductionRuntimeJobCounts;
}): CommandCenterOverview["dailyBrief"] {
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

function metric(
  id: CommandCenterMetric["id"],
  label: string,
  value: number,
  context: string,
  tone: CommandCenterMetric["tone"],
): CommandCenterMetric {
  return Object.freeze({ context, id, label, tone, value });
}

const systemClock: CommandCenterClock = Object.freeze({
  now: () => new Date(),
});
