import { createHash } from "node:crypto";
import type { Clock } from "../ports/clock.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import type { TelegramOperatorConfig, TelegramOutboundMessageIntent } from "./telegram-contracts.js";
import { TelegramBotApiClient } from "./telegram-bot-api.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";
import type { TelegramMissionDraftSessionCoordinator } from "./telegram-mission-draft-session-coordinator.js";
import type { TelegramDailyBriefConsole } from "./telegram-daily-brief-console.js";
import { TelegramMissionPlanningConsole } from "./telegram-mission-planning-console.js";
import { TelegramWorkflowOperatorConsole } from "./telegram-workflow-operator-console.js";
import type { TelegramOperatorProcessLock } from "./telegram-operator-lock.js";
import { isTelegramDatabaseFailure, TelegramOperatorError } from "./telegram-operator-errors.js";

export class ControlledTelegramOperatorConsole {
  #started = false;
  #stopped = false;
  #closePromise: Promise<void> | undefined;
  public constructor(private readonly input: { readonly actorId: string; readonly api: TelegramBotApiClient; readonly config: TelegramOperatorConfig; readonly clock: Clock; readonly dailyBrief?: TelegramDailyBriefConsole; readonly dailyBriefResource?: { close(): Promise<void> }; readonly lock?: TelegramOperatorProcessLock; readonly missionDrafts?: TelegramMissionDraftSessionCoordinator; readonly runtime: LocalRuntime; readonly state: TelegramSqliteStateStore; readonly workspaceId: string }) {}

  public get isStopped(): boolean { return this.#stopped; }

  public async bootstrap(): Promise<void> {
    if (this.#started) return;
    await this.input.api.identify();
    const offset = await this.input.api.bootstrap(this.input.state.offset()?.offset);
    this.input.state.saveOffset(offset);
    await this.input.api.setCommands();
    this.#started = true;
  }
  public async pollOnce(): Promise<void> {
    if (!this.#started || this.#stopped) throw new Error("Telegram console is not polling");
    this.#databaseState(() => { this.input.state.purgeExpired(); });
    const offset = this.#databaseState(() => this.input.state.offset()?.offset ?? "0");
    for (const raw of await this.input.api.poll(offset)) {
      await this.#processUpdate(raw);
      if (this.isStopped) break;
    }
  }
  public close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closePromise = this.#close();
    return this.#closePromise;
  }

  async #close(): Promise<void> {
    this.#stopped = true;
    const results = await Promise.allSettled([this.input.runtime.close(), this.input.state.close(), this.input.dailyBriefResource?.close(), this.input.lock?.close()]);
    if (results.some((result) => result.status === "rejected")) throw new TelegramOperatorError("OPERATOR_SHUTDOWN_FAILED", "SHUTDOWN", false);
  }

  async #processUpdate(raw: unknown): Promise<void> {
    const updateId = rawUpdateId(raw);
    const nextOffset = updateId === undefined ? undefined : nextUpdateOffset(updateId);
    if (nextOffset === undefined) return;
    const normalized = this.input.api.normalize(raw);
    if (normalized.action === undefined) {
      this.#databaseState(() => { this.input.state.saveOffset(nextOffset); });
      return;
    }
    const action = normalized.action;
    let stopConfirmed = false;
    try {
      const claim = this.#state(() => this.input.state.claim(action, this.input.config.polling.updateReceiptRetentionSeconds));
      if (claim === "REPLAYED") {
        this.#databaseState(() => { this.input.state.saveOffset(nextOffset); });
        return;
      }
      if (claim === "DELIVERY_UNCERTAIN") {
        this.#databaseState(() => { this.input.state.advanceDeliveryUncertainOffset(action.updateId, nextOffset); });
        throw new TelegramOperatorError("DELIVERY_RECONCILIATION_REQUIRED", "UPDATE", false);
      }
      const binding = createHash("sha256").update(`${action.userId}:${action.chatId}`, "utf8").digest("hex");
      const mission = this.input.missionDrafts === undefined ? undefined : new TelegramMissionPlanningConsole({ actorId: this.input.actorId, chatId: this.input.config.allowedChatId, clock: this.input.clock, coordinator: this.input.missionDrafts, runtime: this.input.runtime, state: this.input.state, workspaceId: this.input.workspaceId });
      const workflow = new TelegramWorkflowOperatorConsole({ actorId: this.input.actorId, chatId: this.input.config.allowedChatId, clock: this.input.clock, confirmationRetentionSeconds: this.input.config.polling.confirmationRetentionSeconds, runtime: this.input.runtime, state: this.input.state, workspaceId: this.input.workspaceId });
      if (isCallbackUpdate(raw) && action.payload?.startsWith("cb_") === true) {
        const workflowResponse = await workflow.handleCallback(binding, action.payload);
        let missionResponse: TelegramOutboundMessageIntent | undefined;
        if (workflowResponse === undefined && mission !== undefined) missionResponse = await mission.handleCallback(binding, action.payload);
        const intent = workflowResponse ?? missionResponse ?? { chatId: this.input.config.allowedChatId, contractVersion: "1" as const, text: "Conferma non valida o non più attuale." };
        await this.#deliverUpdate(action.updateId, nextOffset, intent, "COMPLETED");
      }
      else if (action.kind === "DAILY_BRIEF" && this.input.dailyBrief !== undefined) await this.#deliverUpdate(action.updateId, nextOffset, await this.input.dailyBrief.handle(action.payload ?? "/daily_brief"), "COMPLETED");
      else if (action.kind === "MISSION_DRAFT" && mission !== undefined) await this.#deliverUpdate(action.updateId, nextOffset, await mission.handle(binding, action.updateId, action.payload ?? "/mission"), "COMPLETED");
      else if (["CONTENT_PRODUCTION", "CONTENT_QUEUE", "EVIDENCE_PACK", "REPORT", "WORKFLOW", "WORKFLOWS"].includes(action.kind)) await this.#deliverUpdate(action.updateId, nextOffset, await workflow.handle(binding, action.payload ?? workflowCommand(action.kind)), "COMPLETED");
      else if (action.kind === "CANCEL_ACTION" && mission !== undefined) await this.#deliverUpdate(action.updateId, nextOffset, mission.cancel(binding, action.updateId), "COMPLETED");
      else {
        const standard = this.#standardAction(binding, action.kind);
        stopConfirmed = standard.stopConfirmed;
        await this.#deliverUpdate(action.updateId, nextOffset, standard.intent, "COMPLETED");
      }
    } catch (error) {
      if (isTelegramDatabaseFailure(error)) throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "UPDATE", false);
      if (error instanceof TelegramOperatorError && error.code === "DELIVERY_RECONCILIATION_REQUIRED") throw error;
      await this.#deliverUpdate(action.updateId, nextOffset, { chatId: this.input.config.allowedChatId, contractVersion: "1", text: "Aggiornamento non elaborato. Invia un nuovo comando supportato." }, "REJECTED");
      return;
    }
    if (stopConfirmed) await this.close();
  }

  async #deliverUpdate(updateId: string, nextOffset: string, intent: TelegramOutboundMessageIntent, terminalState: "COMPLETED" | "REJECTED"): Promise<void> {
    const validatedIntent = this.input.api.validateDeliveryIntent(intent);
    const deliveryId = this.#databaseState(() => this.input.state.beginDelivery(updateId));
    try { await this.input.api.deliver(validatedIntent); }
    catch {
      this.#databaseState(() => { this.input.state.advanceDeliveryUncertainOffset(updateId, nextOffset, deliveryId); });
      throw new TelegramOperatorError("DELIVERY_RECONCILIATION_REQUIRED", "UPDATE", false);
    }
    this.#databaseState(() => { this.input.state.completeDeliveryAndAdvanceOffset(updateId, deliveryId, nextOffset, terminalState); });
  }

  #standardAction(binding: string, kind: string): Readonly<{ readonly intent: TelegramOutboundMessageIntent; readonly stopConfirmed: boolean }> {
    const session = this.#state(() => this.input.state.startSession(binding, this.input.actorId, this.input.workspaceId, this.input.config.polling.sessionRetentionSeconds));
    if (kind === "CANCEL_ACTION" && session.state !== "CANCELLED") this.#state(() => this.input.state.transitionSession(binding, { action: "CANCEL", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "CANCELLED", sessionId: session.sessionId }));
    const stopConfirmed = kind === "STOP" && session.state === "WAITING_CONFIRMATION";
    if (kind === "STOP" && session.state === "IDLE") this.#state(() => this.input.state.transitionSession(binding, { action: "STOP", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "WAITING_CONFIRMATION", sessionId: session.sessionId }));
    if (stopConfirmed) this.#state(() => this.input.state.transitionSession(binding, { action: "CONFIRM", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "COMPLETED", sessionId: session.sessionId }));
    return Object.freeze({ intent: Object.freeze({ chatId: this.input.config.allowedChatId, contractVersion: "1", text: response(kind, stopConfirmed) }), stopConfirmed });
  }

  #state<T>(operation: () => T): T {
    try { return operation(); }
    catch (error) {
      if (isTelegramDatabaseFailure(error)) throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "UPDATE", false);
      throw new TelegramOperatorError("UPDATE_PROCESSING_FAILED", "UPDATE", false);
    }
  }

  #databaseState<T>(operation: () => T): T {
    try { return operation(); }
    catch { throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "UPDATE", false); }
  }
}

function response(kind: string, stopConfirmed = false): string {
  const values: Readonly<Record<string, string>> = {
    CANCEL_ACTION: "Azione annullata.",
    HELP: "Comandi attivi: /start, /help, /status, /daily_brief, /mission, /workflow, /workflows, /report, /productions, /production, /cancel_action, /stop, /developer.",
    DEVELOPER: "Modalità sviluppatore non ancora attiva. La Fase 2 non è stata avviata.",
    MISSION_DRAFT: "Usa /mission per avviare la pianificazione guidata della Missione.",
    SETTINGS: "Impostazioni locali protette. Nessun dato personale Telegram è disponibile.",
    START: "MV-AI-OS è pronto. Comandi attivi: /help, /status, /daily_brief, /mission, /workflows, /productions, /cancel_action, /stop.",
    STATUS: "MV-AI-OS locale è disponibile. Nessuna azione esterna è stata eseguita.",
    STOP: stopConfirmed ? "Processo Telegram arrestato in modo sicuro." : "Conferma l'arresto inviando di nuovo /stop. Nessuna azione Core V1 verrà modificata.",
  };
  return values[kind] ?? "Comando non disponibile.";
}
function workflowCommand(kind: string): string { return kind === "CONTENT_QUEUE" ? "/productions" : kind === "EVIDENCE_PACK" ? "/evidencepack" : `/${kind.toLowerCase()}`; }
function rawUpdateId(value: unknown): string | undefined { return typeof value === "object" && value !== null && "update_id" in value && (typeof value.update_id === "number" || typeof value.update_id === "string") && /^-?[1-9][0-9]{0,18}$/u.test(String(value.update_id)) ? String(value.update_id) : undefined; }
function nextUpdateOffset(updateId: string): string | undefined { const numeric = Number(updateId); return Number.isSafeInteger(numeric) && numeric >= 0 && numeric < Number.MAX_SAFE_INTEGER ? String(numeric + 1) : undefined; }
function isCallbackUpdate(value: unknown): boolean { return typeof value === "object" && value !== null && "callback_query" in value; }
