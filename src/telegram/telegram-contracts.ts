import type { SecretReference } from "../config/secret-reference.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

export const TELEGRAM_OPERATOR_CONTRACT_VERSION = "1" as const;
export const TELEGRAM_ALLOWED_UPDATE_TYPES = Object.freeze(["callback_query", "message"] as const);
export type TelegramAllowedUpdateType = (typeof TELEGRAM_ALLOWED_UPDATE_TYPES)[number];
export type TelegramActionKind = "CANCEL_ACTION" | "CONTENT_PRODUCTION" | "CONTENT_QUEUE" | "CONTENT_REVIEW_APPROVE" | "DAILY_BRIEF" | "EVIDENCE_PACK" | "DEVELOPER" | "HELP" | "MISSION_DRAFT" | "REPORT" | "SETTINGS" | "START" | "STATUS" | "STOP" | "VENTURE_BRIEF" | "WORKFLOW" | "WORKFLOW_CREATE" | "WORKFLOWS";

export interface TelegramOperatorConfig {
  readonly contractVersion: "1";
  readonly allowedChatId: string;
  readonly allowedUserId: string;
  readonly botToken: SecretReference;
  readonly polling: { readonly limit: number; readonly timeoutSeconds: number; readonly updateReceiptRetentionSeconds: number; readonly sessionRetentionSeconds: number; readonly confirmationRetentionSeconds: number };
}

export interface TelegramPrivateTextMessage { readonly contractVersion: "1"; readonly updateId: string; readonly messageId: string; readonly userId: string; readonly chatId: string; readonly text: string; }
export interface TelegramCallbackQuery { readonly contractVersion: "1"; readonly updateId: string; readonly callbackId: string; readonly messageId: string; readonly userId: string; readonly chatId: string; readonly data: string; }
export type TelegramInboundUpdate = { readonly contractVersion: "1"; readonly type: "message"; readonly message: TelegramPrivateTextMessage } | { readonly contractVersion: "1"; readonly type: "callback_query"; readonly callback: TelegramCallbackQuery };
export interface TelegramOperatorAction { readonly contractVersion: "1"; readonly updateId: string; readonly kind: TelegramActionKind; readonly fingerprint: string; readonly userId: string; readonly chatId: string; readonly payload?: string; }
export interface TelegramInboundUpdateReceipt { readonly contractVersion: "1"; readonly updateId: string; readonly actionFingerprint: string; readonly identityBinding: string; readonly actionKind: TelegramActionKind; readonly processingState: "COMPLETED" | "DELIVERY_UNCERTAIN" | "RECEIVED" | "REJECTED"; readonly receivedAt: string; readonly expiresAt: string; readonly commandId?: string; }
export interface TelegramPollingOffset { readonly contractVersion: "1"; readonly offset: string; readonly updatedAt: string; }
export interface TelegramOperatorSession { readonly contractVersion: "1"; readonly sessionId: string; readonly identityBinding: string; readonly state: "IDLE" | "MISSION_DRAFT" | "PENDING_CONFIRMATION"; readonly expiresAt: string; readonly updatedAt: string; }
export interface TelegramPendingConfirmation { readonly contractVersion: "1"; readonly confirmationId: string; readonly identityBinding: string; readonly actionKind: TelegramActionKind; readonly actionFingerprint: string; readonly expiresAt: string; readonly createdAt: string; }
export interface TelegramCallbackToken { readonly contractVersion: "1"; readonly token: string; readonly tokenHash: string; readonly identityBinding: string; readonly actionKind: TelegramActionKind; readonly expiresAt: string; readonly workflowId?: string; readonly workflowVersion?: string; }
export interface TelegramOutboundButton { readonly callbackData: string; readonly text: string; }
export interface TelegramOutboundMessageIntent { readonly contractVersion: "1"; readonly chatId: string; readonly text: string; readonly buttons?: readonly TelegramOutboundButton[]; readonly callbackId?: string; readonly editMessageId?: string; }
export interface TelegramOutboundDeliveryResult { readonly contractVersion: "1"; readonly deliveryId: string; readonly state: "DELIVERED" | "UNCERTAIN"; readonly occurredAt: string; }
export interface TelegramTransportError { readonly contractVersion: "1"; readonly code: "telegram_transport_failed" | "telegram_transport_invalid"; readonly retryable: boolean; }
export interface TelegramProcessLifecycleState { readonly contractVersion: "1"; readonly state: "BOOTSTRAPPING" | "POLLING" | "STOPPED"; readonly updatedAt: string; }

export class TelegramOperatorConfigValidator implements Validator<TelegramOperatorConfig> {
  public validate(value: unknown): ValidationResult<TelegramOperatorConfig> {
    if (!record(value) || !exactKeys(value, ["allowedChatId", "allowedUserId", "botToken", "contractVersion", "polling"]) || value.contractVersion !== "1" || !numeric(value.allowedChatId) || !numeric(value.allowedUserId) || !record(value.polling) || !exactKeys(value.polling, ["confirmationRetentionSeconds", "limit", "sessionRetentionSeconds", "timeoutSeconds", "updateReceiptRetentionSeconds"]) || !positive(value.polling.limit, 1, 100) || !positive(value.polling.timeoutSeconds, 1, 50) || !positive(value.polling.updateReceiptRetentionSeconds, 60, 2_592_000) || !positive(value.polling.sessionRetentionSeconds, 60, 86_400) || !positive(value.polling.confirmationRetentionSeconds, 60, 86_400) || !secretReference(value.botToken)) return invalid("Telegram operator configuration is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramOperatorConfig)));
  }
}

export class TelegramInboundUpdateValidator implements Validator<TelegramInboundUpdate> {
  public validate(value: unknown): ValidationResult<TelegramInboundUpdate> {
    if (!record(value) || !exactKeys(value, ["contractVersion", "type", value.type === "message" ? "message" : "callback"]) || value.contractVersion !== "1") return invalid("Telegram inbound update is invalid");
    if (value.type === "message" && validMessage(value.message)) return validationSuccess(freeze(structuredClone(value as TelegramInboundUpdate)));
    if (value.type === "callback_query" && validCallback(value.callback)) return validationSuccess(freeze(structuredClone(value as TelegramInboundUpdate)));
    return invalid("Telegram inbound update is invalid");
  }
}

export class TelegramOperatorActionValidator implements Validator<TelegramOperatorAction> {
  public validate(value: unknown): ValidationResult<TelegramOperatorAction> {
    if (!record(value) || !exactKeys(value, value.payload === undefined ? ["chatId", "contractVersion", "fingerprint", "kind", "updateId", "userId"] : ["chatId", "contractVersion", "fingerprint", "kind", "payload", "updateId", "userId"]) || value.contractVersion !== "1" || !safeId(value.updateId) || !numeric(value.userId) || !numeric(value.chatId) || !["CANCEL_ACTION", "CONTENT_PRODUCTION", "CONTENT_QUEUE", "CONTENT_REVIEW_APPROVE", "DAILY_BRIEF", "EVIDENCE_PACK", "DEVELOPER", "HELP", "MISSION_DRAFT", "REPORT", "SETTINGS", "START", "STATUS", "STOP", "VENTURE_BRIEF", "WORKFLOW", "WORKFLOW_CREATE", "WORKFLOWS"].includes(value.kind as string) || !hash(value.fingerprint) || (value.payload !== undefined && (typeof value.payload !== "string" || value.payload.length > 2_000 || prohibited(value.payload)))) return invalid("Telegram operator action is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramOperatorAction)));
  }
}

export class TelegramOutboundMessageIntentValidator implements Validator<TelegramOutboundMessageIntent> {
  public validate(value: unknown): ValidationResult<TelegramOutboundMessageIntent> {
    if (!record(value) || !exactKeys(value, [...keysWithOptional(value, "callbackId", "editMessageId", ["chatId", "contractVersion", "text"]), ...(value.buttons === undefined ? [] : ["buttons"])]) || value.contractVersion !== "1" || !numeric(value.chatId) || typeof value.text !== "string" || value.text.length < 1 || value.text.length > 4_000 || prohibited(value.text) || (value.buttons !== undefined && (!Array.isArray(value.buttons) || value.buttons.length < 1 || value.buttons.length > 4 || value.buttons.some((button) => !record(button) || !exactKeys(button, ["callbackData", "text"]) || typeof button.text !== "string" || button.text.length < 1 || button.text.length > 64 || typeof button.callbackData !== "string" || !/^cb_[A-Za-z0-9_-]{16,128}$/u.test(button.callbackData)))) || (value.callbackId !== undefined && !safeId(value.callbackId)) || (value.editMessageId !== undefined && !numeric(value.editMessageId))) return invalid("Telegram outbound message intent is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramOutboundMessageIntent)));
  }
}

function validMessage(value: unknown): boolean { return record(value) && exactKeys(value, ["chatId", "contractVersion", "messageId", "text", "updateId", "userId"]) && value.contractVersion === "1" && safeId(value.updateId) && numeric(value.messageId) && numeric(value.userId) && numeric(value.chatId) && typeof value.text === "string" && value.text.length > 0 && value.text.length <= 2_000 && !prohibited(value.text); }
function validCallback(value: unknown): boolean { return record(value) && exactKeys(value, ["callbackId", "chatId", "contractVersion", "data", "messageId", "updateId", "userId"]) && value.contractVersion === "1" && safeId(value.updateId) && safeId(value.callbackId) && numeric(value.messageId) && numeric(value.userId) && numeric(value.chatId) && typeof value.data === "string" && value.data.length > 0 && value.data.length <= 256 && !prohibited(value.data); }
function secretReference(value: unknown): value is SecretReference { return record(value) && value.contractVersion === "1" && typeof value.secretId === "string" && value.secretId.length > 0 && (value.source === "environment" ? exactKeys(value, ["contractVersion", "secretId", "source", "variableName"]) && typeof value.variableName === "string" && value.variableName.length > 0 : value.source === "local-file" && exactKeys(value, ["contractVersion", "encoding", "path", "secretId", "source"]) && value.encoding === "utf8" && typeof value.path === "string" && value.path.length > 0); }
function keysWithOptional(value: Record<string, unknown>, first: string, second: string, base: readonly string[]): readonly string[] { return [...base, ...(value[first] === undefined ? [] : [first]), ...(value[second] === undefined ? [] : [second])].sort(); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function numeric(value: unknown): value is string { return typeof value === "string" && /^-?[1-9][0-9]{0,18}$/u.test(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function positive(value: unknown, min: number, max: number): boolean { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max; }
function prohibited(value: string): boolean { return /(?:\bsk-[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])|https?:\/\/|secret|token|raw update|transcript|stack trace)/iu.test(value); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
