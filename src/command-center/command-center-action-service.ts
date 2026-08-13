import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { RepositoryConflictError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { LocalWorkflowCommandBoundary, LocalWorkflowCommandResponse } from "../runtime/local-workflow-command.js";
import type { CommandCenterContentApprovalGate } from "./visual-approval-gate.js";

const ACTION_TTL_MS = 5 * 60_000;
const ID = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;

export type CommandCenterContentAction = "APPROVE_CONTENT" | "REJECT_CONTENT";
export type CommandCenterBusinessAction = "APPROVE_BUSINESS" | "REJECT_BUSINESS" | "REQUEST_BUSINESS_REVISION";

export interface CommandCenterActionClock {
  now(): Date;
}

export interface CommandCenterActionProposal {
  readonly action: CommandCenterContentAction;
  readonly actionId: string;
  readonly confirmationToken: string;
  readonly expiresAt: string;
  readonly summary: {
    readonly evidencePackFingerprint?: string;
    readonly evidencePackId?: string;
    readonly packageFingerprint: string;
    readonly productionId: string;
    readonly qualityScore: number;
    readonly riskStatus: string;
    readonly version: number;
    readonly visualApprovalBindingFingerprint?: string;
  };
}

export interface CommandCenterActionReceipt {
  readonly action: CommandCenterContentAction;
  readonly command: LocalWorkflowCommandResponse;
  readonly packageFingerprint: string;
  readonly productionId: string;
  readonly version: number;
}

export interface CommandCenterBusinessActionProposal {
  readonly action: CommandCenterBusinessAction;
  readonly actionId: string;
  readonly confirmationToken: string;
  readonly expiresAt: string;
  readonly summary: {
    readonly dossierFingerprint: string;
    readonly evidencePackIds: readonly string[];
    readonly gates: readonly { readonly name: string; readonly score: number; readonly status: string }[];
    readonly missionId: string;
    readonly objective: string;
    readonly packageFingerprint: string;
    readonly selectedOpportunityId: string;
    readonly version: number;
  };
}

export interface CommandCenterBusinessActionReceipt {
  readonly action: CommandCenterBusinessAction;
  readonly command: LocalWorkflowCommandResponse;
  readonly missionId: string;
  readonly packageFingerprint: string;
  readonly version: number;
}

export type CommandCenterAnyActionProposal = CommandCenterActionProposal | CommandCenterBusinessActionProposal;
export type CommandCenterAnyActionReceipt = CommandCenterActionReceipt | CommandCenterBusinessActionReceipt;

/**
 * Converts a narrow set of reviewed UI intents into existing durable commands.
 * It never writes repositories itself: state changes remain inside the command boundary.
 */
export class CommandCenterActionService {
  readonly #actions = new Map<string, CommandCenterAnyActionProposal>();
  readonly #actorId: string;
  readonly #clock: CommandCenterActionClock;
  readonly #commands: LocalWorkflowCommandBoundary;
  readonly #contentApprovalGate: CommandCenterContentApprovalGate;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #workspaceId: string;

  public constructor(input: {
    readonly actorId: string;
    readonly clock?: CommandCenterActionClock;
    readonly commands: LocalWorkflowCommandBoundary;
    readonly contentApprovalGate?: CommandCenterContentApprovalGate;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) {
    this.#actorId = input.actorId;
    this.#clock = input.clock ?? systemClock;
    this.#commands = input.commands;
    this.#contentApprovalGate = input.contentApprovalGate ?? FAIL_CLOSED_CONTENT_APPROVAL_GATE;
    this.#repositories = input.repositories;
    this.#workspaceId = input.workspaceId;
  }

  public async proposeContentReview(input: {
    readonly action: CommandCenterContentAction;
    readonly productionId: string;
  }): Promise<CommandCenterActionProposal> {
    if (!ID.test(input.productionId)) throw new RepositoryConflictError("Identificativo della produzione non valido");
    this.#clearExpired();
    const { control, record } = await this.#repositories.transaction(async ({ contentProductions, operationsControls }) => {
      const found = await contentProductions.getById(input.productionId);
      if (found?.workspaceId !== this.#workspaceId || found.actorId !== this.#actorId) {
        throw new RepositoryConflictError("La produzione richiesta non è disponibile per questo operatore");
      }
      const productionControl = await operationsControls.getProductionControl(input.productionId);
      if (productionControl !== undefined && (productionControl.workspaceId !== this.#workspaceId || productionControl.actorId !== this.#actorId)) throw new RepositoryConflictError("Il controllo produzione non è disponibile per questo operatore");
      return { control: productionControl, record: found };
    });
    if (control !== undefined && control.state !== "ACTIVE") throw new RepositoryConflictError("L'approvazione precedente è invalidata dal controllo produzione corrente");
    if (record.status !== "PENDING_FABIO_APPROVAL") {
      throw new RepositoryConflictError("Il pacchetto non è nello stato corretto per la revisione di Fabio");
    }
    if (input.action === "APPROVE_CONTENT" && record.evidencePack === undefined) {
      throw new RepositoryConflictError("L'approvazione dal Centro di Comando richiede un Evidence Pack immutabile");
    }
    const visualBinding = input.action === "APPROVE_CONTENT"
      ? await this.#contentApprovalGate.verify({ production: record, stage: "PROPOSE" })
      : undefined;
    const packageFingerprint = fingerprint(record);
    const proposal: CommandCenterActionProposal = Object.freeze({
      action: input.action,
      actionId: `cc-action-${randomUUID()}`,
      confirmationToken: randomBytes(32).toString("hex"),
      expiresAt: new Date(this.#clock.now().getTime() + ACTION_TTL_MS).toISOString(),
      summary: Object.freeze({
        ...(record.evidencePack === undefined ? {} : {
          evidencePackFingerprint: record.evidencePack.fingerprint,
          evidencePackId: record.evidencePack.packId,
        }),
        packageFingerprint,
        productionId: record.productionId,
        qualityScore: record.package.quality.readinessScore,
        riskStatus: record.package.risk.status,
        version: record.version,
        ...(visualBinding === undefined ? {} : { visualApprovalBindingFingerprint: visualBinding.bindingFingerprint }),
      }),
    });
    this.#actions.set(proposal.actionId, proposal);
    return proposal;
  }

  public async proposeBusinessReview(input: { readonly action: CommandCenterBusinessAction; readonly missionId: string }): Promise<CommandCenterBusinessActionProposal> {
    if (!ID.test(input.missionId)) throw new RepositoryConflictError("Identificativo della Business Mission non valido");
    this.#clearExpired();
    const record = await this.#repositories.transaction(async ({ businessMissions }) => {
      const found = await businessMissions.getById(input.missionId);
      if (found?.workspaceId !== this.#workspaceId || found.actorId !== this.#actorId) throw new RepositoryConflictError("La Business Mission non è disponibile per questo operatore");
      return found;
    });
    if (record.status !== "PENDING_FABIO_APPROVAL" || record.selectedOpportunityId === undefined || record.gates.some(({ status }) => status !== "PASSED")) throw new RepositoryConflictError("Il dossier Business non è idoneo alla decisione di Fabio");
    const packageFingerprint = fingerprint(record);
    const proposal: CommandCenterBusinessActionProposal = Object.freeze({
      action: input.action,
      actionId: `cc-business-${randomUUID()}`,
      confirmationToken: randomBytes(32).toString("hex"),
      expiresAt: new Date(this.#clock.now().getTime() + ACTION_TTL_MS).toISOString(),
      summary: Object.freeze({ dossierFingerprint: record.fingerprint, evidencePackIds: record.evidencePackIds, gates: record.gates, missionId: record.mission.missionId, objective: record.mission.objective, packageFingerprint, selectedOpportunityId: record.selectedOpportunityId, version: record.version }),
    });
    this.#actions.set(proposal.actionId, proposal);
    return proposal;
  }

  public async confirmContentReview(input: {
    readonly actionId: string;
    readonly confirmationToken: string;
    readonly packageFingerprint: string;
  }): Promise<CommandCenterActionReceipt> {
    this.#clearExpired();
    const proposal = this.#actions.get(input.actionId);
    if (proposal === undefined || !isContentProposal(proposal) || !sameToken(proposal.confirmationToken, input.confirmationToken)) {
      throw new RepositoryConflictError("La conferma dell'azione è scaduta, non valida o già utilizzata");
    }
    if (!sameToken(proposal.summary.packageFingerprint, input.packageFingerprint)) {
      throw new RepositoryConflictError("Il fingerprint indicato per la conferma non è più valido");
    }
    const { control, current } = await this.#repositories.transaction(async ({ contentProductions, operationsControls }) => {
      const record = await contentProductions.getById(proposal.summary.productionId);
      if (record?.workspaceId !== this.#workspaceId || record.actorId !== this.#actorId) {
        throw new RepositoryConflictError("Il pacchetto non è più disponibile per questo operatore");
      }
      const productionControl = await operationsControls.getProductionControl(proposal.summary.productionId);
      if (productionControl !== undefined && (productionControl.workspaceId !== this.#workspaceId || productionControl.actorId !== this.#actorId)) throw new RepositoryConflictError("Il controllo produzione non è più disponibile per questo operatore");
      return { control: productionControl, current: record };
    });
    if (control !== undefined && control.state !== "ACTIVE") throw new RepositoryConflictError("La conferma è stata invalidata da un controllo produzione successivo");
    if (current.status !== "PENDING_FABIO_APPROVAL" || current.version !== proposal.summary.version || fingerprint(current) !== proposal.summary.packageFingerprint) {
      throw new RepositoryConflictError("Il pacchetto è cambiato: fingerprint o versione non sono più validi");
    }
    if (proposal.action === "APPROVE_CONTENT") {
      let currentBinding;
      try {
        currentBinding = await this.#contentApprovalGate.verify({ production: current, stage: "CONFIRM" });
      } catch (error) {
        this.#actions.delete(proposal.actionId);
        throw error;
      }
      if (proposal.summary.visualApprovalBindingFingerprint === undefined || !sameToken(proposal.summary.visualApprovalBindingFingerprint, currentBinding.bindingFingerprint)) {
        this.#actions.delete(proposal.actionId);
        throw new RepositoryConflictError("Il binding del Visual Gate è cambiato dopo la proposta: è richiesta una nuova review");
      }
    }
    this.#actions.delete(proposal.actionId);
    const command = await this.#commands.execute({
      actorId: this.#actorId,
      commandId: `cc-review-${proposal.actionId}`,
      contractVersion: "1",
      input: {
        decision: proposal.action === "APPROVE_CONTENT" ? "APPROVED" : "REJECTED",
        expectedVersion: proposal.summary.version,
        note: proposal.action === "APPROVE_CONTENT"
          ? "Approvato da Fabio via Centro di Comando Onlyway."
          : "Rifiutato da Fabio via Centro di Comando Onlyway.",
        productionId: proposal.summary.productionId,
      },
      operation: "REVIEW_METODO_VELOCE_CONTENT",
      workspaceId: this.#workspaceId,
    });
    return Object.freeze({
      action: proposal.action,
      command,
      packageFingerprint: proposal.summary.packageFingerprint,
      productionId: proposal.summary.productionId,
      version: proposal.summary.version,
    });
  }

  public async confirmReview(input: { readonly actionId: string; readonly confirmationToken: string; readonly packageFingerprint: string }): Promise<CommandCenterAnyActionReceipt> {
    this.#clearExpired();
    const proposal = this.#actions.get(input.actionId);
    if (proposal !== undefined && isBusinessProposal(proposal)) return this.#confirmBusinessReview(proposal, input);
    return this.confirmContentReview(input);
  }

  async #confirmBusinessReview(proposal: CommandCenterBusinessActionProposal, input: { readonly actionId: string; readonly confirmationToken: string; readonly packageFingerprint: string }): Promise<CommandCenterBusinessActionReceipt> {
    if (!sameToken(proposal.confirmationToken, input.confirmationToken)) throw new RepositoryConflictError("La conferma dell'azione è scaduta, non valida o già utilizzata");
    if (!sameToken(proposal.summary.packageFingerprint, input.packageFingerprint)) throw new RepositoryConflictError("Il fingerprint indicato per la conferma non è più valido");
    this.#actions.delete(proposal.actionId);
    const current = await this.#repositories.transaction(async ({ businessMissions }) => {
      const record = await businessMissions.getById(proposal.summary.missionId);
      if (record?.workspaceId !== this.#workspaceId || record.actorId !== this.#actorId) throw new RepositoryConflictError("Il dossier Business non è più disponibile per questo operatore");
      return record;
    });
    if (current.status !== "PENDING_FABIO_APPROVAL" || current.version !== proposal.summary.version || current.fingerprint !== proposal.summary.dossierFingerprint || fingerprint(current) !== proposal.summary.packageFingerprint) throw new RepositoryConflictError("Il dossier Business è cambiato: fingerprint o versione non sono più validi");
    const decision = proposal.action === "APPROVE_BUSINESS" ? "APPROVED" : proposal.action === "REJECT_BUSINESS" ? "REJECTED" : "REVISION_REQUESTED";
    const note = proposal.action === "APPROVE_BUSINESS" ? "Approvato da Fabio via Centro di Comando Onlyway." : proposal.action === "REJECT_BUSINESS" ? "Rifiutato da Fabio via Centro di Comando Onlyway." : "Revisione richiesta da Fabio via Centro di Comando Onlyway.";
    const command = await this.#commands.execute({ actorId: this.#actorId, commandId: `cc-business-review-${proposal.actionId}`, contractVersion: "1", input: { decision, expectedVersion: proposal.summary.version, missionId: proposal.summary.missionId, note }, operation: "REVIEW_BUSINESS_MISSION_DOSSIER", workspaceId: this.#workspaceId });
    return Object.freeze({ action: proposal.action, command, missionId: proposal.summary.missionId, packageFingerprint: proposal.summary.packageFingerprint, version: proposal.summary.version });
  }

  #clearExpired(): void {
    const now = this.#clock.now().getTime();
    for (const [actionId, proposal] of this.#actions) {
      if (Date.parse(proposal.expiresAt) <= now) this.#actions.delete(actionId);
    }
  }
}

function isContentProposal(proposal: CommandCenterAnyActionProposal): proposal is CommandCenterActionProposal { return proposal.action === "APPROVE_CONTENT" || proposal.action === "REJECT_CONTENT"; }
function isBusinessProposal(proposal: CommandCenterAnyActionProposal): proposal is CommandCenterBusinessActionProposal { return !isContentProposal(proposal); }

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function sameToken(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(received)) return false;
  const candidate = Buffer.from(received, "hex");
  const trusted = Buffer.from(expected, "hex");
  return candidate.length === trusted.length && timingSafeEqual(candidate, trusted);
}

const systemClock: CommandCenterActionClock = Object.freeze({ now: () => new Date() });

const FAIL_CLOSED_CONTENT_APPROVAL_GATE: CommandCenterContentApprovalGate = Object.freeze({
  verify: () => Promise.reject(new RepositoryConflictError("Visual Gate bloccato: VISUAL_APPROVAL_GATE_NOT_CONFIGURED")),
});
