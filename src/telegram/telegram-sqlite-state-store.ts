import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { Clock } from "../ports/clock.js";
import { openSqliteDatabase } from "../persistence/sqlite/sqlite-database.js";
import type { SqliteConnectionConfig } from "../persistence/sqlite/sqlite-connection-config.js";
import type { TelegramCallbackToken, TelegramInboundUpdateReceipt, TelegramOperatorAction, TelegramPollingOffset } from "./telegram-contracts.js";
import { isTelegramSessionTransitionAllowed, TelegramOperatorSessionValidator, TelegramSessionTransitionValidator, type TelegramOperatorSessionRecord, type TelegramSessionTransition } from "./telegram-operator-session.js";
import { TelegramMissionDraftStateEngine, TelegramMissionDraftOperationValidator, type TelegramMissionDraftApplyResult, type TelegramMissionDraftOperation } from "./telegram-mission-draft-state-engine.js";
import { TelegramMissionDraftValidator, type TelegramMissionDraft } from "./telegram-mission-draft.js";

export class TelegramSqliteStateStore {
  readonly #database: DatabaseSync;
  #closed = false;
  readonly #sessionValidator = new TelegramOperatorSessionValidator();
  readonly #transitionValidator = new TelegramSessionTransitionValidator();
  readonly #draftValidator = new TelegramMissionDraftValidator();
  readonly #draftOperationValidator = new TelegramMissionDraftOperationValidator();
  readonly #draftEngine = new TelegramMissionDraftStateEngine();
  public constructor(config: SqliteConnectionConfig, private readonly clock: Clock, private readonly tokenSource: () => string = randomUUID) { this.#database = openSqliteDatabase(config).database; }
  public claim(action: TelegramOperatorAction, retentionSeconds: number): "CLAIMED" | "REPLAYED" {
    this.#assertOpen(); const existing = this.#database.prepare("SELECT action_fingerprint FROM telegram_inbound_receipts WHERE update_id = ?").get(action.updateId);
    if (existing !== undefined) { if (existing.action_fingerprint !== action.fingerprint) throw new Error("Telegram update identity conflicts with prior normalized action"); return "REPLAYED"; }
    const now = this.clock.now(); const receipt = receiptFor(action, retentionSeconds, now);
    this.#database.prepare("INSERT INTO telegram_inbound_receipts (update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)").run(receipt.updateId, receipt.actionFingerprint, receipt.identityBinding, receipt.actionKind, receipt.processingState, receipt.receivedAt, receipt.expiresAt);
    return "CLAIMED";
  }
  public complete(updateId: string, commandId?: string): void { this.#assertOpen(); this.#database.prepare("UPDATE telegram_inbound_receipts SET processing_state = 'COMPLETED', command_id = ? WHERE update_id = ?").run(commandId ?? null, updateId); }
  public startSession(identityBinding: string, actorId: string, workspaceId: string, retentionSeconds: number): TelegramOperatorSessionRecord {
    this.#assertOpen(); const existing = this.getSession(identityBinding); if (existing !== undefined && existing.state !== "EXPIRED") return existing;
    const now = this.clock.now().toISOString(); const record = validateSession({ actorId, contractVersion: "1", createdAt: now, expiresAt: new Date(this.clock.now().getTime() + retentionSeconds * 1_000).toISOString(), identityBinding, navigationState: "IDLE", sessionId: `telegram-session-${identityBinding.slice(0, 32)}`, state: "IDLE", updatedAt: now, version: 0, workspaceId: workspaceId });
    this.#database.prepare("INSERT INTO telegram_operator_sessions (session_id, identity_binding, state, expires_at, updated_at, version, navigation_state, selected_action, workflow_instance_id, expected_workflow_version, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?) ON CONFLICT(session_id) DO UPDATE SET state = excluded.state, expires_at = excluded.expires_at, updated_at = excluded.updated_at, version = excluded.version, navigation_state = excluded.navigation_state, record_json = excluded.record_json").run(record.sessionId, record.identityBinding, record.state, record.expiresAt, record.updatedAt, record.version, record.navigationState, JSON.stringify(record));
    return record;
  }
  public getSession(identityBinding: string): TelegramOperatorSessionRecord | undefined {
    this.#assertOpen(); const row = this.#database.prepare("SELECT record_json FROM telegram_operator_sessions WHERE identity_binding = ? ORDER BY updated_at DESC LIMIT 1").get(identityBinding); if (row === undefined || typeof row.record_json !== "string") return undefined; return parseSession(row.record_json, this.#sessionValidator);
  }
  public createMissionDraft(candidate: TelegramMissionDraft): TelegramMissionDraft {
    this.#assertOpen(); const draft = validDraft(candidate, this.#draftValidator);
    const existing = this.getMissionDraft(draft.sessionId);
    if (existing !== undefined) { if (JSON.stringify(existing) !== JSON.stringify(draft)) throw new Error("Telegram Mission draft conflicts with existing session draft"); return existing; }
    this.#database.prepare("INSERT INTO telegram_operator_drafts (session_id, expires_at, record_json) VALUES (?, ?, ?)").run(draft.sessionId, draft.expiresAt, JSON.stringify(draft));
    return draft;
  }
  public getMissionDraft(sessionId: string): TelegramMissionDraft | undefined {
    this.#assertOpen(); const row = this.#database.prepare("SELECT record_json FROM telegram_operator_drafts WHERE session_id = ?").get(sessionId);
    if (row === undefined || typeof row.record_json !== "string") return undefined;
    try { return validDraft(JSON.parse(row.record_json) as unknown, this.#draftValidator); } catch { throw new Error("Telegram Mission draft record is corrupt"); }
  }
  public applyMissionDraftOperation(candidate: TelegramMissionDraftOperation): TelegramMissionDraftApplyResult {
    this.#assertOpen(); const operation = validDraftOperation(candidate, this.#draftOperationValidator); const fingerprint = hash(JSON.stringify(operation));
    const receipt = this.#database.prepare("SELECT fingerprint, record_json FROM telegram_mission_draft_operations WHERE operation_id = ?").get(operation.operationId);
    if (receipt !== undefined) { if (receipt.fingerprint !== fingerprint || typeof receipt.record_json !== "string") throw new Error("Telegram Mission draft operation conflicts with prior receipt"); return parseDraftResult(receipt.record_json); }
    const current = this.getMissionDraft(operation.sessionId); if (current === undefined) throw new Error("Telegram Mission draft is not found");
    const result = this.#draftEngine.apply(current, operation, this.clock.now().toISOString());
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      if (result.ok) { const write = this.#database.prepare("UPDATE telegram_operator_drafts SET expires_at = ?, record_json = ? WHERE session_id = ? AND record_json = ?").run(result.draft.expiresAt, JSON.stringify(result.draft), result.draft.sessionId, JSON.stringify(current)); if (write.changes !== 1) throw new Error("Telegram Mission draft operation conflicted"); }
      this.#database.prepare("INSERT INTO telegram_mission_draft_operations (operation_id, draft_id, fingerprint, resulting_version, applied_at, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(operation.operationId, operation.draftId, fingerprint, result.ok ? result.draft.version : current.version, this.clock.now().toISOString(), JSON.stringify(result));
      this.#database.exec("COMMIT"); return result;
    } catch (error) { try { this.#database.exec("ROLLBACK"); } catch {} throw error; }
  }
  public transitionSession(identityBinding: string, candidate: TelegramSessionTransition): TelegramOperatorSessionRecord {
    this.#assertOpen(); const transition = validateTransition(candidate, this.#transitionValidator); const current = this.getSession(identityBinding); if (current === undefined) throw new Error("Telegram session transition is invalid or stale"); if (current.sessionId !== transition.sessionId || current.version !== transition.expectedVersion || current.expiresAt <= this.clock.now().toISOString() || !isTelegramSessionTransitionAllowed(current.state, transition.nextState)) throw new Error("Telegram session transition is invalid or stale");
    const next = validateSession({ ...current, expiresAt: transition.expiresAt, navigationState: transition.nextState === "CANCELLED" ? "IDLE" : current.navigationState, selectedAction: transition.action, state: transition.nextState, updatedAt: this.clock.now().toISOString(), version: current.version + 1, ...(transition.workflowInstanceId === undefined ? {} : { workflowInstanceId: transition.workflowInstanceId }), ...(transition.expectedWorkflowVersion === undefined ? {} : { expectedWorkflowVersion: transition.expectedWorkflowVersion }) });
    const result = this.#database.prepare("UPDATE telegram_operator_sessions SET state = ?, expires_at = ?, updated_at = ?, version = ?, navigation_state = ?, selected_action = ?, workflow_instance_id = ?, expected_workflow_version = ?, record_json = ? WHERE session_id = ? AND version = ?").run(next.state, next.expiresAt, next.updatedAt, next.version, next.navigationState, next.selectedAction ?? null, next.workflowInstanceId ?? null, next.expectedWorkflowVersion ?? null, JSON.stringify(next), next.sessionId, current.version);
    if (result.changes !== 1) throw new Error("Telegram session transition conflicted"); return next;
  }
  public offset(): TelegramPollingOffset | undefined { this.#assertOpen(); const row = this.#database.prepare("SELECT offset, updated_at FROM telegram_polling_state WHERE state_id = 1").get(); if (row === undefined || typeof row.offset !== "string" || typeof row.updated_at !== "string") return undefined; return Object.freeze({ contractVersion: "1", offset: row.offset, updatedAt: row.updated_at }); }
  public saveOffset(offset: string): void { this.#assertOpen(); this.#database.prepare("INSERT INTO telegram_polling_state (state_id, offset, updated_at) VALUES (1, ?, ?) ON CONFLICT(state_id) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at").run(offset, this.clock.now().toISOString()); }
  public issueCallback(identityBinding: string, actionKind: TelegramCallbackToken["actionKind"], retentionSeconds: number, workflowId?: string, workflowVersion?: string): TelegramCallbackToken { this.#assertOpen(); const token = createHash("sha256").update(`${identityBinding}:${actionKind}:${this.tokenSource()}`, "utf8").digest("hex").slice(0, 32); const tokenHash = hash(token); const expiresAt = new Date(this.clock.now().getTime() + retentionSeconds * 1_000).toISOString(); this.#database.prepare("INSERT INTO telegram_callback_tokens (token_hash, identity_binding, action_kind, expires_at, workflow_id, workflow_version) VALUES (?, ?, ?, ?, ?, ?)").run(tokenHash, identityBinding, actionKind, expiresAt, workflowId ?? null, workflowVersion ?? null); return Object.freeze({ actionKind, contractVersion: "1", expiresAt, identityBinding, token: `cb_${token}`, tokenHash, ...(workflowId === undefined ? {} : { workflowId }), ...(workflowVersion === undefined ? {} : { workflowVersion }) }); }
  public consumeCallback(token: string, identityBinding: string): TelegramCallbackToken | undefined { this.#assertOpen(); const tokenHash = hash(token.replace(/^cb_/u, "")); const row = this.#database.prepare("SELECT * FROM telegram_callback_tokens WHERE token_hash = ?").get(tokenHash); if (row === undefined || typeof row.identity_binding !== "string" || typeof row.action_kind !== "string" || typeof row.expires_at !== "string" || row.identity_binding !== identityBinding || row.expires_at <= this.clock.now().toISOString()) return undefined; this.#database.prepare("DELETE FROM telegram_callback_tokens WHERE token_hash = ?").run(tokenHash); return Object.freeze({ actionKind: row.action_kind as TelegramCallbackToken["actionKind"], contractVersion: "1", expiresAt: row.expires_at, identityBinding: row.identity_binding, token, tokenHash, ...(typeof row.workflow_id === "string" ? { workflowId: row.workflow_id } : {}), ...(typeof row.workflow_version === "string" ? { workflowVersion: row.workflow_version } : {}) }); }
  public purgeExpired(): void { this.#assertOpen(); const now = this.clock.now().toISOString(); this.#database.prepare("UPDATE telegram_operator_sessions SET state = 'EXPIRED', navigation_state = 'IDLE', version = version + 1, updated_at = ? WHERE expires_at <= ? AND state NOT IN ('EXPIRED', 'CANCELLED', 'COMPLETED')").run(now, now); for (const table of ["telegram_callback_tokens", "telegram_inbound_receipts", "telegram_operator_drafts", "telegram_pending_confirmations"] as const) this.#database.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now); }
  public close(): Promise<void> { if (!this.#closed) { this.#closed = true; this.#database.close(); } return Promise.resolve(); }
  #assertOpen(): void { if (this.#closed) throw new Error("Telegram state store is closed"); }
}

function receiptFor(action: TelegramOperatorAction, retentionSeconds: number, now: Date): TelegramInboundUpdateReceipt { return Object.freeze({ actionFingerprint: action.fingerprint, actionKind: action.kind, contractVersion: "1", expiresAt: new Date(now.getTime() + retentionSeconds * 1_000).toISOString(), identityBinding: hash(`${action.userId}:${action.chatId}`), processingState: "RECEIVED", receivedAt: now.toISOString(), updateId: action.updateId }); }
function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function validateSession(value: unknown): TelegramOperatorSessionRecord { const result = new TelegramOperatorSessionValidator().validate(value); if (!result.ok) throw new Error("Telegram session failed validation"); return result.value; }
function validDraft(value: unknown, validator: TelegramMissionDraftValidator): TelegramMissionDraft { const result = validator.validate(value); if (!result.ok) throw new Error("Telegram Mission draft failed validation"); return result.value; }
function validDraftOperation(value: unknown, validator: TelegramMissionDraftOperationValidator): TelegramMissionDraftOperation { const result = validator.validate(value); if (!result.ok) throw new Error("Telegram Mission draft operation failed validation"); return result.value; }
function parseDraftResult(value: string): TelegramMissionDraftApplyResult { const parsed = JSON.parse(value) as TelegramMissionDraftApplyResult; if (parsed.ok && new TelegramMissionDraftValidator().validate(parsed.draft).ok) return Object.freeze(parsed); if (!parsed.ok && typeof parsed.reasonCode === "string") return Object.freeze(parsed); throw new Error("Telegram Mission draft receipt is corrupt"); }
function validateTransition(value: unknown, validator: TelegramSessionTransitionValidator): TelegramSessionTransition { const result = validator.validate(value); if (!result.ok) throw new Error("Telegram session transition failed validation"); return result.value; }
function parseSession(value: string, validator: TelegramOperatorSessionValidator): TelegramOperatorSessionRecord { try { return validateSessionWith(value, validator); } catch { throw new Error("Telegram session record is corrupt"); } }
function validateSessionWith(value: string, validator: TelegramOperatorSessionValidator): TelegramOperatorSessionRecord { const result = validator.validate(JSON.parse(value) as unknown); if (!result.ok) throw new Error("Telegram session record is invalid"); return result.value; }
