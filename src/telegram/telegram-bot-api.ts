import { createHash } from "node:crypto";

import { TelegramInboundUpdateValidator, TelegramOperatorActionValidator, type TelegramInboundUpdate, type TelegramOperatorAction, type TelegramOperatorConfig, type TelegramOutboundMessageIntent, TelegramOutboundMessageIntentValidator } from "./telegram-contracts.js";
import { TelegramOperatorError } from "./telegram-operator-errors.js";

export interface TelegramBotApiRequest { readonly method: "answerCallbackQuery" | "deleteWebhook" | "editMessageText" | "getMe" | "getUpdates" | "sendMessage" | "setMyCommands"; readonly token: string; readonly body: Readonly<Record<string, unknown>>; }
export interface TelegramBotApiTransport { request(request: TelegramBotApiRequest): Promise<unknown>; }
export interface TelegramBotIdentity { readonly id: string; readonly isBot: true; }
export interface TelegramUpdateAuthorization { readonly action?: TelegramOperatorAction; readonly rejection?: "UNAUTHORIZED" | "UNSUPPORTED"; }

export class TelegramBotApiClient {
  readonly #inboundValidator = new TelegramInboundUpdateValidator();
  readonly #actionValidator = new TelegramOperatorActionValidator();
  readonly #outboundValidator = new TelegramOutboundMessageIntentValidator();
  public constructor(private readonly config: TelegramOperatorConfig, private readonly token: string, private readonly transport: TelegramBotApiTransport) {}

  public async identify(): Promise<TelegramBotIdentity> {
    const value = await this.#request("getMe", {}, "IDENTITY");
    if (!record(value) || !record(value.result) || value.result.is_bot !== true || sourceId(value.result.id) === undefined) throw new TelegramOperatorError("TELEGRAM_IDENTITY_FAILED", "BOOTSTRAP", false);
    return Object.freeze({ id: sourceId(value.result.id) ?? "0", isBot: true });
  }
  public async bootstrap(existingOffset?: string): Promise<string> {
    await this.#request("deleteWebhook", { drop_pending_updates: false }, "BOOTSTRAP");
    return existingOffset ?? "0";
  }
  public async poll(offset: string): Promise<readonly unknown[]> { const response = await this.#request("getUpdates", { allowed_updates: ["message", "callback_query"], limit: this.config.polling.limit, offset: Number(offset), timeout: this.config.polling.timeoutSeconds }, "POLLING"); return Object.freeze(botResults(response)); }
  /** Validates the complete outbound intent before a durable delivery intent is opened. */
  public validateDeliveryIntent(intent: TelegramOutboundMessageIntent): TelegramOutboundMessageIntent {
    const valid = this.#outboundValidator.validate(intent);
    if (!valid.ok || valid.value.chatId !== this.config.allowedChatId) throw new TelegramOperatorError("OUTBOUND_DELIVERY_FAILED", "UPDATE", false);
    return valid.value;
  }
  public async deliver(intent: TelegramOutboundMessageIntent): Promise<void> {
    const valid = this.validateDeliveryIntent(intent);
    if (valid.callbackId !== undefined) { await this.#request("answerCallbackQuery", { callback_query_id: valid.callbackId, text: valid.text }, "OUTBOUND"); return; }
    if (valid.editMessageId !== undefined) { await this.#request("editMessageText", { chat_id: valid.chatId, message_id: Number(valid.editMessageId), text: valid.text }, "OUTBOUND"); return; }
    await this.#request("sendMessage", { chat_id: valid.chatId, text: valid.text, ...(valid.buttons === undefined ? {} : { reply_markup: { inline_keyboard: [valid.buttons.map((button) => ({ callback_data: button.callbackData, text: button.text }))] } }) }, "OUTBOUND");
  }
  public async setCommands(): Promise<void> { await this.#request("setMyCommands", { commands: ["start", "help", "status", "daily_brief", "venture_brief", "mission", "workflow", "workflows", "report", "productions", "production", "evidencepack", "cancel_action", "stop", "developer"].map((command) => ({ command, description: commandDescription(command) })) }, "BOOTSTRAP"); }
  public normalize(raw: unknown): TelegramUpdateAuthorization {
    const inbound = normalizeInbound(raw);
    if (inbound === undefined) return Object.freeze({ rejection: "UNSUPPORTED" });
    const validation = this.#inboundValidator.validate(inbound);
    if (!validation.ok) return Object.freeze({ rejection: "UNSUPPORTED" });
    const update = validation.value;
    const identity = update.type === "message" ? update.message : update.callback;
    if (identity.userId !== this.config.allowedUserId || identity.chatId !== this.config.allowedChatId) return Object.freeze({ rejection: "UNAUTHORIZED" });
    const text = update.type === "message" ? update.message.text : update.callback.data;
    const kind = actionKind(text, update.type === "callback_query");
    if (kind === undefined) return Object.freeze({ rejection: "UNSUPPORTED" });
    const payload = update.type === "callback_query" || ["CONTENT_PRODUCTION", "DAILY_BRIEF", "EVIDENCE_PACK", "MISSION_DRAFT", "REPORT", "VENTURE_BRIEF", "WORKFLOW"].includes(kind) ? text : undefined;
    const action: TelegramOperatorAction = { chatId: identity.chatId, contractVersion: "1", fingerprint: fingerprint(identity.updateId, kind, payload), kind, ...(payload === undefined ? {} : { payload }), updateId: identity.updateId, userId: identity.userId };
    const actionValidation = this.#actionValidator.validate(action);
    return actionValidation.ok ? Object.freeze({ action: actionValidation.value }) : Object.freeze({ rejection: "UNSUPPORTED" });
  }
  async #request(method: TelegramBotApiRequest["method"], body: Readonly<Record<string, unknown>>, operation: "BOOTSTRAP" | "IDENTITY" | "OUTBOUND" | "POLLING"): Promise<unknown> {
    try {
      const response = await this.transport.request({ body, method, token: this.token });
      if (!record(response) || response.ok !== true) throw new TelegramOperatorError(operation === "IDENTITY" ? "TELEGRAM_IDENTITY_FAILED" : operation === "BOOTSTRAP" ? "TELEGRAM_BOOTSTRAP_FAILED" : operation === "OUTBOUND" ? "OUTBOUND_DELIVERY_FAILED" : "POLLING_TRANSIENT_FAILURE", operation === "OUTBOUND" ? "UPDATE" : operation === "POLLING" ? "POLLING" : "BOOTSTRAP", operation === "POLLING" && retryableResponse(response));
      return response;
    } catch (error) {
      if (error instanceof TelegramOperatorError) throw error;
      throw new TelegramOperatorError(operation === "IDENTITY" ? "TELEGRAM_IDENTITY_FAILED" : operation === "BOOTSTRAP" ? "TELEGRAM_BOOTSTRAP_FAILED" : operation === "OUTBOUND" ? "OUTBOUND_DELIVERY_FAILED" : "POLLING_TRANSIENT_FAILURE", operation === "OUTBOUND" ? "UPDATE" : operation === "POLLING" ? "POLLING" : "BOOTSTRAP", operation === "POLLING");
    }
  }
}

export class FetchTelegramBotApiTransport implements TelegramBotApiTransport {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}
  public async request(request: TelegramBotApiRequest): Promise<unknown> {
    try { const response = await this.fetcher(`https://api.telegram.org/bot${request.token}/${request.method}`, { body: JSON.stringify(request.body), headers: { "content-type": "application/json" }, method: "POST" }); return await response.json(); }
    catch { throw new Error("Telegram transport failed"); }
  }
}

function normalizeInbound(raw: unknown): TelegramInboundUpdate | undefined {
  if (!record(raw)) return undefined; const updateId = sourceId(raw.update_id); if (updateId === undefined) return undefined;
  if (record(raw.message)) { const message = raw.message; const messageId = sourceId(message.message_id); const userId = record(message.from) ? sourceId(message.from.id) : undefined; const chatId = record(message.chat) ? sourceId(message.chat.id) : undefined; if (!privateMessage(message) || typeof message.text !== "string" || messageId === undefined || userId === undefined || chatId === undefined) return undefined; return { contractVersion: "1", message: { chatId, contractVersion: "1", messageId, text: message.text, updateId, userId }, type: "message" }; }
  if (record(raw.callback_query)) { const callback = raw.callback_query; const message = callback.message; const from = callback.from; const callbackId = sourceId(callback.id); const userId = record(from) ? sourceId(from.id) : undefined; const messageId = record(message) ? sourceId(message.message_id) : undefined; const chatId = record(message) && record(message.chat) ? sourceId(message.chat.id) : undefined; if (!record(message) || !privateMessage(message) || !record(from) || from.is_bot === true || typeof callback.data !== "string" || callbackId === undefined || userId === undefined || messageId === undefined || chatId === undefined) return undefined; return { callback: { callbackId, chatId, contractVersion: "1", data: callback.data, messageId, updateId, userId }, contractVersion: "1", type: "callback_query" }; }
  return undefined;
}
function privateMessage(value: Record<string, unknown>): boolean { return sourceId(value.message_id) !== undefined && record(value.from) && sourceId(value.from.id) !== undefined && value.from.is_bot !== true && record(value.chat) && sourceId(value.chat.id) !== undefined && value.chat.type === "private" && value.forward_origin === undefined && value.forward_from === undefined && value.sender_chat === undefined && value.business_connection_id === undefined && value.is_topic_message !== true && ["animation", "audio", "contact", "dice", "document", "location", "photo", "poll", "sticker", "venue", "video", "video_note", "voice", "users_shared", "chat_shared"].every((field) => value[field] === undefined); }
function actionKind(value: string, callback: boolean): TelegramOperatorAction["kind"] | undefined { const command = value.trim().split(/\s+/u, 1)[0]?.toLowerCase(); const commands: Readonly<Record<string, TelegramOperatorAction["kind"]>> = { "/cancel_action": "CANCEL_ACTION", "/daily_brief": "DAILY_BRIEF", "/developer": "DEVELOPER", "/evidencepack": "EVIDENCE_PACK", "/help": "HELP", "/mission": "MISSION_DRAFT", "/production": "CONTENT_PRODUCTION", "/productions": "CONTENT_QUEUE", "/report": "REPORT", "/settings": "SETTINGS", "/start": "START", "/status": "STATUS", "/stop": "STOP", "/venture_brief": "VENTURE_BRIEF", "/workflow": "WORKFLOW", "/workflows": "WORKFLOWS" }; if (callback) return /^cb_[A-Za-z0-9_-]{16,128}$/u.test(value) ? "WORKFLOW_CREATE" : undefined; return command === undefined ? undefined : commands[command] ?? (value.startsWith("/") ? undefined : "MISSION_DRAFT"); }
function botResults(value: unknown): readonly unknown[] { return record(value) && Array.isArray(value.result) ? value.result : []; }
function commandDescription(command: string): string { return ({ cancel_action: "Annulla azione", daily_brief: "Daily Operating Brief", developer: "Sviluppatore", evidencepack: "Apri Evidence Pack", help: "Aiuto", mission: "Pianifica Missione", production: "Apri contenuto", productions: "Coda contenuti", report: "Report Workflow", start: "Avvia", status: "Stato", stop: "Arresta interazione", venture_brief: "Venture Portfolio Brief", workflow: "Crea Workflow", workflows: "Guida Workflow" } as Record<string, string>)[command] ?? ""; }
function fingerprint(updateId: string, kind: string, payload: string | undefined): string { return createHash("sha256").update(`${updateId}:${kind}:${payload ?? ""}`, "utf8").digest("hex"); }
function sourceId(value: unknown): string | undefined { const normalized = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : undefined; return normalized !== undefined && /^-?[1-9][0-9]{0,18}$/u.test(normalized) ? normalized : undefined; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function retryableResponse(value: unknown): boolean { return !record(value) || typeof value.error_code !== "number" || value.error_code === 429 || value.error_code >= 500; }
