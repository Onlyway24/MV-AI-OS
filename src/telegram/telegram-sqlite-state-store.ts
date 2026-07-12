import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { Clock } from "../ports/clock.js";
import { openSqliteDatabase } from "../persistence/sqlite/sqlite-database.js";
import type { SqliteConnectionConfig } from "../persistence/sqlite/sqlite-connection-config.js";
import type { TelegramCallbackToken, TelegramInboundUpdateReceipt, TelegramOperatorAction, TelegramPollingOffset } from "./telegram-contracts.js";

export class TelegramSqliteStateStore {
  readonly #database: DatabaseSync;
  #closed = false;
  public constructor(config: SqliteConnectionConfig, private readonly clock: Clock, private readonly tokenSource: () => string = randomUUID) { this.#database = openSqliteDatabase(config).database; }
  public claim(action: TelegramOperatorAction, retentionSeconds: number): "CLAIMED" | "REPLAYED" {
    this.#assertOpen(); const existing = this.#database.prepare("SELECT action_fingerprint FROM telegram_inbound_receipts WHERE update_id = ?").get(action.updateId);
    if (existing !== undefined) { if (existing.action_fingerprint !== action.fingerprint) throw new Error("Telegram update identity conflicts with prior normalized action"); return "REPLAYED"; }
    const now = this.clock.now(); const receipt = receiptFor(action, retentionSeconds, now);
    this.#database.prepare("INSERT INTO telegram_inbound_receipts (update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)").run(receipt.updateId, receipt.actionFingerprint, receipt.identityBinding, receipt.actionKind, receipt.processingState, receipt.receivedAt, receipt.expiresAt);
    return "CLAIMED";
  }
  public complete(updateId: string, commandId?: string): void { this.#assertOpen(); this.#database.prepare("UPDATE telegram_inbound_receipts SET processing_state = 'COMPLETED', command_id = ? WHERE update_id = ?").run(commandId ?? null, updateId); }
  public offset(): TelegramPollingOffset | undefined { this.#assertOpen(); const row = this.#database.prepare("SELECT offset, updated_at FROM telegram_polling_state WHERE state_id = 1").get(); if (row === undefined || typeof row.offset !== "string" || typeof row.updated_at !== "string") return undefined; return Object.freeze({ contractVersion: "1", offset: row.offset, updatedAt: row.updated_at }); }
  public saveOffset(offset: string): void { this.#assertOpen(); this.#database.prepare("INSERT INTO telegram_polling_state (state_id, offset, updated_at) VALUES (1, ?, ?) ON CONFLICT(state_id) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at").run(offset, this.clock.now().toISOString()); }
  public issueCallback(identityBinding: string, actionKind: TelegramCallbackToken["actionKind"], retentionSeconds: number, workflowId?: string, workflowVersion?: string): TelegramCallbackToken { this.#assertOpen(); const token = createHash("sha256").update(`${identityBinding}:${actionKind}:${this.tokenSource()}`, "utf8").digest("hex").slice(0, 32); const tokenHash = hash(token); const expiresAt = new Date(this.clock.now().getTime() + retentionSeconds * 1_000).toISOString(); this.#database.prepare("INSERT INTO telegram_callback_tokens (token_hash, identity_binding, action_kind, expires_at, workflow_id, workflow_version) VALUES (?, ?, ?, ?, ?, ?)").run(tokenHash, identityBinding, actionKind, expiresAt, workflowId ?? null, workflowVersion ?? null); return Object.freeze({ actionKind, contractVersion: "1", expiresAt, identityBinding, token: `cb_${token}`, tokenHash, ...(workflowId === undefined ? {} : { workflowId }), ...(workflowVersion === undefined ? {} : { workflowVersion }) }); }
  public consumeCallback(token: string, identityBinding: string): TelegramCallbackToken | undefined { this.#assertOpen(); const tokenHash = hash(token.replace(/^cb_/u, "")); const row = this.#database.prepare("SELECT * FROM telegram_callback_tokens WHERE token_hash = ?").get(tokenHash); if (row === undefined || typeof row.identity_binding !== "string" || typeof row.action_kind !== "string" || typeof row.expires_at !== "string" || row.identity_binding !== identityBinding || row.expires_at <= this.clock.now().toISOString()) return undefined; this.#database.prepare("DELETE FROM telegram_callback_tokens WHERE token_hash = ?").run(tokenHash); return Object.freeze({ actionKind: row.action_kind as TelegramCallbackToken["actionKind"], contractVersion: "1", expiresAt: row.expires_at, identityBinding: row.identity_binding, token, tokenHash, ...(typeof row.workflow_id === "string" ? { workflowId: row.workflow_id } : {}), ...(typeof row.workflow_version === "string" ? { workflowVersion: row.workflow_version } : {}) }); }
  public purgeExpired(): void { this.#assertOpen(); const now = this.clock.now().toISOString(); for (const table of ["telegram_callback_tokens", "telegram_inbound_receipts", "telegram_operator_sessions", "telegram_pending_confirmations"] as const) this.#database.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now); }
  public close(): Promise<void> { if (!this.#closed) { this.#closed = true; this.#database.close(); } return Promise.resolve(); }
  #assertOpen(): void { if (this.#closed) throw new Error("Telegram state store is closed"); }
}

function receiptFor(action: TelegramOperatorAction, retentionSeconds: number, now: Date): TelegramInboundUpdateReceipt { return Object.freeze({ actionFingerprint: action.fingerprint, actionKind: action.kind, contractVersion: "1", expiresAt: new Date(now.getTime() + retentionSeconds * 1_000).toISOString(), identityBinding: hash(`${action.userId}:${action.chatId}`), processingState: "RECEIVED", receivedAt: now.toISOString(), updateId: action.updateId }); }
function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
