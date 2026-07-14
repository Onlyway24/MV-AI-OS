import { createHash } from "node:crypto";

import type { Clock } from "../ports/clock.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import type { WorkflowDefinition, WorkflowInstance } from "../workflows/runtime/workflow-runtime.js";
import type { TelegramOutboundMessageIntent } from "./telegram-contracts.js";
import type { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";

const WORKFLOW_VERSION = "1.0.0" as const;

/**
 * Private Telegram boundary for promoting an approval-ready Mission plan into one
 * durable, preparation-only Workflow. It deliberately exposes no execution,
 * approval, Guardian, publication, or external-action control.
 */
export class TelegramWorkflowOperatorConsole {
  public constructor(private readonly input: { readonly actorId: string; readonly chatId: string; readonly clock: Clock; readonly confirmationRetentionSeconds: number; readonly runtime: LocalRuntime; readonly state: TelegramSqliteStateStore; readonly workspaceId: string }) {}

  public async handle(identity: string, command: string): Promise<TelegramOutboundMessageIntent> {
    const normalized = command.trim();
    if (normalized === "/workflows") return this.#message(["Workflow Operator — primo blocco", "1. Completa una Missione con Quality Gate APPROVAL_READY.", "2. Invia /workflow <riferimento-missione> e conferma la creazione.", "3. Invia /report <riferimento-missione> per stato, checkpoint e rischi.", "", "Il Workflow resta preparation-only: non pubblica, non contatta, non spende e non modifica servizi esterni."].join("\n"));
    if (normalized.startsWith("/workflow")) return this.#prepare(identity, normalized);
    if (normalized.startsWith("/report")) return this.#report(normalized);
    return this.#message("Comando Workflow non disponibile. Usa /workflows.");
  }

  public async handleCallback(identity: string, token: string): Promise<TelegramOutboundMessageIntent | undefined> {
    const callback = this.input.state.consumeCallback(token, identity, "WORKFLOW_CREATE");
    if (callback === undefined) return undefined;
    const reference = callback.workflowId;
    if (reference === undefined || callback.workflowVersion !== WORKFLOW_VERSION) return this.#message("Conferma Workflow non valida. Ripeti /workflow <riferimento-missione>.");
    const source = this.#source(reference);
    if (source === undefined) return this.#message("La Missione non è più disponibile o non supera il Quality Gate. Nessun Workflow è stato creato.");
    const objective = source.draft.objective;
    if (objective === undefined) return this.#message("La Missione non è più disponibile o non supera il Quality Gate. Nessun Workflow è stato creato.");
    if (this.input.runtime.executeWorkflowCommand === undefined) return this.#message("Workflow Operator locale non disponibile. Nessun Workflow è stato creato.");
    const workflow = workflowFor(reference, objective, source.draft.updatedAt);
    const response = await this.input.runtime.executeWorkflowCommand({ actorId: this.input.actorId, commandId: commandId("create", reference), contractVersion: "1", input: workflow, operation: "CREATE_WORKFLOW", workspaceId: this.input.workspaceId });
    const created = record(response.result) && response.result.created === true && !response.replayed;
    return this.#message(created
      ? `Workflow creato per la Missione ${reference}.\n\nCheckpoint iniziale: approvazione Fabio, Quality Guardian e Risk Guardian.\nUsa /report ${reference}.\n\nNessuna azione esterna è stata eseguita.`
      : `Workflow già presente per la Missione ${reference}; nessuna duplicazione è stata eseguita.\n\nUsa /report ${reference}.`);
  }

  #prepare(identity: string, command: string): TelegramOutboundMessageIntent {
    const reference = argument(command, "/workflow");
    if (reference === undefined) return this.#message("Indica una Missione: /workflow <riferimento-missione>. Il riferimento compare dopo la pianificazione.");
    if (this.#source(reference) === undefined) return this.#message("La Missione non è disponibile o non è APPROVAL_READY. Nessun Workflow è stato creato.");
    const callback = this.input.state.issueCallback(identity, "WORKFLOW_CREATE", this.input.confirmationRetentionSeconds, reference, WORKFLOW_VERSION);
    return this.#message(`La Missione ${reference} ha superato il Quality Gate.\n\nCreare il Workflow durevole di preparazione? Richiederà poi approvazione Fabio, Quality Guardian e Risk Guardian prima di qualunque Agent Runtime.`, [{ callbackData: callback.token, text: "Crea Workflow" }]);
  }

  async #report(command: string): Promise<TelegramOutboundMessageIntent> {
    const reference = argument(command, "/report");
    if (reference === undefined) return this.#message("Indica una Missione: /report <riferimento-missione>.");
    if (this.input.runtime.executeWorkflowCommand === undefined) return this.#message("Workflow Operator locale non disponibile.");
    try {
      const ids = workflowIds(reference);
      const inspected = await this.input.runtime.executeWorkflowCommand({ actorId: this.input.actorId, commandId: commandId("inspect", reference), contractVersion: "1", input: { instanceId: ids.instanceId }, operation: "INSPECT_WORKFLOW", workspaceId: this.input.workspaceId });
      if (!record(inspected.result) || !Number.isSafeInteger(inspected.result.version)) return this.#message("Il Workflow non è disponibile. Crea prima il Workflow dalla Missione approvata.");
      const report = await this.input.runtime.executeWorkflowCommand({ actorId: this.input.actorId, commandId: commandId(`report-${String(inspected.result.version)}`, reference), contractVersion: "1", input: { contractVersion: "1", expectedVersion: inspected.result.version, instanceId: ids.instanceId, maxItems: 20 }, operation: "GET_OPERATOR_REPORT", workspaceId: this.input.workspaceId });
      return this.#message(formatReport(reference, report.result));
    } catch {
      return this.#message("Il Workflow non è disponibile. Crea prima il Workflow dalla Missione approvata.");
    }
  }

  #source(reference: string): { readonly draft: { readonly objective?: string; readonly updatedAt: string }; readonly response: { readonly result: unknown } } | undefined {
    if (!validReference(reference)) return undefined;
    const source = this.input.state.readMissionResult(reference);
    if (source === undefined || !record(source.response.result) || source.response.result.status !== "APPROVAL_READY" || typeof source.draft.objective !== "string") return undefined;
    return source;
  }

  #message(text: string, buttons?: TelegramOutboundMessageIntent["buttons"]): TelegramOutboundMessageIntent {
    return { chatId: this.input.chatId, contractVersion: "1", text: text.slice(0, 3_900), ...(buttons === undefined ? {} : { buttons }) };
  }
}

function workflowFor(reference: string, objective: string, timestamp: string): { readonly definition: WorkflowDefinition; readonly instance: WorkflowInstance } {
  const ids = workflowIds(reference);
  return {
    definition: { contractVersion: "1", definitionId: ids.definitionId, missionObjective: objective, nonExecuting: true, steps: [{ approvalRequired: true, dependencies: [], guardianRequired: true, nonExecuting: true, stepId: "content-direction" }], workflowId: ids.workflowId, workflowVersion: WORKFLOW_VERSION },
    instance: { contractVersion: "1", createdAt: timestamp, definitionId: ids.definitionId, instanceId: ids.instanceId, nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "PENDING", stepId: "content-direction" }], stopReason: "NONE", updatedAt: timestamp, version: 0 },
  };
}

function workflowIds(reference: string): { readonly definitionId: string; readonly instanceId: string; readonly workflowId: string } {
  const suffix = createHash("sha256").update(reference, "utf8").digest("hex").slice(0, 24);
  const workflowId = `telegram-${suffix}`;
  return { definitionId: `${workflowId}@${WORKFLOW_VERSION}`, instanceId: `${workflowId}-workflow`, workflowId };
}

function commandId(action: string, reference: string): string { return `tg-wf-${action}-${createHash("sha256").update(reference, "utf8").digest("hex").slice(0, 24)}`; }
function argument(command: string, prefix: string): string | undefined { const match = new RegExp(`^${prefix}\\s+([a-z0-9][a-z0-9@._-]{0,127})$`, "u").exec(command); return match?.[1]; }
function validReference(value: string): boolean { return /^[a-z0-9][a-z0-9@._-]{0,127}$/u.test(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function formatReport(reference: string, result: unknown): string {
  if (!record(result) || typeof result.overallStatus !== "string" || !record(result.progress) || typeof result.nextAction !== "string" || !Array.isArray(result.risks) || !record(result.externalActions)) return "Report Workflow non disponibile. Nessuna azione esterna è stata eseguita.";
  const completedSteps = typeof result.progress.completedSteps === "number" ? result.progress.completedSteps : 0;
  const totalSteps = typeof result.progress.totalSteps === "number" ? result.progress.totalSteps : 0;
  const progress = `${String(completedSteps)}/${String(totalSteps)}`;
  const risks = result.risks.filter((value): value is string => typeof value === "string").slice(0, 5);
  const external = result.externalActions.unauthorizedActionOccurred === false ? "nessuna azione esterna non autorizzata" : "verifica richiesta";
  return [`Report Workflow — Missione ${reference}`, `Stato: ${result.overallStatus} · avanzamento ${progress}`, `Checkpoint successivo: ${result.nextAction}`, `Rischi: ${risks.length === 0 ? "nessuno rilevato" : risks.join("; ")}`, `Azioni esterne: ${external}.`].join("\n");
}
