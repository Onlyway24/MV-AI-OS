import { createHash } from "node:crypto";
import type { Clock } from "../ports/clock.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import type { TelegramOperatorConfig } from "./telegram-contracts.js";
import { TelegramBotApiClient } from "./telegram-bot-api.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";
import type { TelegramMissionDraftSessionCoordinator } from "./telegram-mission-draft-session-coordinator.js";

export class ControlledTelegramOperatorConsole {
  #started = false;
  #stopped = false;
  public constructor(private readonly input: { readonly actorId: string; readonly api: TelegramBotApiClient; readonly config: TelegramOperatorConfig; readonly clock: Clock; readonly missionDrafts?: TelegramMissionDraftSessionCoordinator; readonly runtime: LocalRuntime; readonly state: TelegramSqliteStateStore; readonly workspaceId: string }) {}

  public async bootstrap(): Promise<void> {
    if (this.#started) return;
    await this.input.api.identify();
    const offset = await this.input.api.bootstrap();
    this.input.state.saveOffset(offset);
    await this.input.api.setCommands();
    this.#started = true;
  }
  public async pollOnce(): Promise<void> {
    if (!this.#started || this.#stopped) throw new Error("Telegram console is not polling");
    this.input.state.purgeExpired();
    const offset = this.input.state.offset()?.offset ?? "0";
    for (const raw of await this.input.api.poll(offset)) {
      const normalized = this.input.api.normalize(raw);
      const updateId = rawUpdateId(raw);
      if (updateId !== undefined) this.input.state.saveOffset(String(Number(updateId) + 1));
      if (normalized.action === undefined) continue;
      if (normalized.action.payload?.startsWith("cb_") === true) {
        const binding = createHash("sha256").update(`${normalized.action.userId}:${normalized.action.chatId}`, "utf8").digest("hex");
        if (this.input.state.consumeCallback(normalized.action.payload, binding) === undefined) continue;
      }
      const claim = this.input.state.claim(normalized.action, this.input.config.polling.updateReceiptRetentionSeconds);
      if (claim === "REPLAYED") continue;
      const binding = createHash("sha256").update(`${normalized.action.userId}:${normalized.action.chatId}`, "utf8").digest("hex");
      const session = this.input.state.startSession(binding, this.input.actorId, this.input.workspaceId, this.input.config.polling.sessionRetentionSeconds);
      if (normalized.action.kind === "CANCEL_ACTION" && session.state !== "CANCELLED") this.input.state.transitionSession(binding, { action: "CANCEL", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "CANCELLED", sessionId: session.sessionId });
      const stopConfirmed = normalized.action.kind === "STOP" && session.state === "WAITING_CONFIRMATION";
      if (normalized.action.kind === "STOP" && session.state === "IDLE") this.input.state.transitionSession(binding, { action: "STOP", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "WAITING_CONFIRMATION", sessionId: session.sessionId });
      if (stopConfirmed) this.input.state.transitionSession(binding, { action: "CONFIRM", contractVersion: "1", expectedVersion: session.version, expiresAt: session.expiresAt, nextState: "COMPLETED", sessionId: session.sessionId });
      await this.input.api.deliver({ chatId: this.input.config.allowedChatId, contractVersion: "1", text: response(normalized.action.kind, stopConfirmed) });
      this.input.state.complete(normalized.action.updateId);
      if (stopConfirmed) await this.close();
    }
  }
  public async close(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    await Promise.allSettled([this.input.runtime.close(), this.input.state.close()]);
  }
}

function response(kind: string, stopConfirmed = false): string {
  const values: Readonly<Record<string, string>> = {
    CANCEL_ACTION: "Azione annullata.",
    HELP: "Comandi attivi: /start, /help, /status, /cancel_action, /stop, /developer.",
    DEVELOPER: "Modalità sviluppatore non ancora attiva. La Fase 2 non è stata avviata.",
    MISSION_DRAFT: "La creazione guidata delle missioni sarà attivata nella prossima fase. Nessuna azione è stata eseguita.",
    REPORT: "Report Workflow non disponibile in Telegram Phase 1A.",
    SETTINGS: "Impostazioni locali protette. Nessun dato personale Telegram è disponibile.",
    START: "MV-AI-OS è pronto. Comandi attivi: /help, /status, /cancel_action, /stop.",
    STATUS: "MV-AI-OS locale è disponibile. Nessuna azione esterna è stata eseguita.",
    STOP: stopConfirmed ? "Processo Telegram arrestato in modo sicuro." : "Conferma l'arresto inviando di nuovo /stop. Nessuna azione Core V1 verrà modificata.",
    WORKFLOWS: "Workflow non disponibili in Telegram Phase 1A.",
  };
  return values[kind] ?? "Comando non disponibile.";
}
function rawUpdateId(value: unknown): string | undefined { return typeof value === "object" && value !== null && "update_id" in value && (typeof value.update_id === "number" || typeof value.update_id === "string") && /^-?[1-9][0-9]{0,18}$/u.test(String(value.update_id)) ? String(value.update_id) : undefined; }
