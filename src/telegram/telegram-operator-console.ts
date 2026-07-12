import { createHash } from "node:crypto";
import type { Clock } from "../ports/clock.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import type { TelegramOperatorConfig } from "./telegram-contracts.js";
import { TelegramBotApiClient } from "./telegram-bot-api.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";

export class ControlledTelegramOperatorConsole {
  #started = false;
  #stopped = false;
  public constructor(private readonly input: { readonly api: TelegramBotApiClient; readonly config: TelegramOperatorConfig; readonly clock: Clock; readonly runtime: LocalRuntime; readonly state: TelegramSqliteStateStore }) {}

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
      await this.input.api.deliver({ chatId: this.input.config.allowedChatId, contractVersion: "1", text: response(normalized.action.kind) });
      this.input.state.complete(normalized.action.updateId);
    }
  }
  public async close(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    await Promise.allSettled([this.input.runtime.close(), this.input.state.close()]);
  }
}

function response(kind: string): string {
  const values: Readonly<Record<string, string>> = {
    CANCEL_ACTION: "Azione annullata.",
    HELP: "Comandi: /start, /help, /status, /mission, /workflows, /report, /settings, /cancel_action, /stop.",
    MISSION_DRAFT: "Bozza Missione ricevuta. Verrà mostrata per conferma prima di diventare dati MV-AI-OS.",
    REPORT: "Per il report, seleziona un Workflow nella sessione guidata.",
    SETTINGS: "Impostazioni locali protette. Nessun dato personale Telegram è disponibile.",
    START: "MV-AI-OS è pronto. Uso solo questa chat privata autorizzata.",
    STATUS: "MV-AI-OS locale è disponibile. Nessuna azione esterna è stata eseguita.",
    STOP: "Interazione Telegram arrestata in modo sicuro.",
    WORKFLOWS: "Seleziona una Missione o un Workflow nella sessione guidata.",
  };
  return values[kind] ?? "Comando non disponibile.";
}
function rawUpdateId(value: unknown): string | undefined { return typeof value === "object" && value !== null && "update_id" in value && (typeof value.update_id === "number" || typeof value.update_id === "string") && /^-?[1-9][0-9]{0,18}$/u.test(String(value.update_id)) ? String(value.update_id) : undefined; }
