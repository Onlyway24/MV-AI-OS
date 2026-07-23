import type { DatabaseSync } from "node:sqlite";

import { canonicalSha256 } from "../../contracts/canonical-fingerprint.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import {
  VENTURE_RECORD_TYPES,
  ventureRecordEntityId,
  type VentureAuditEvent,
  type VentureCommandReceipt,
  type VentureEvent,
  type VentureKillSwitch,
  type VentureRecordMap,
  type VentureRecordType,
} from "../../venture-holding/venture-domain.js";
import type {
  VentureHoldingRepository,
  VentureIdentity,
  VentureRecordListQuery,
  VentureRecordQuery,
} from "../../venture-holding/venture-repository.js";
import {
  validateVentureRecord,
  VentureAuditEventValidator,
  VentureCommandReceiptValidator,
  VentureEventValidator,
  VentureKillSwitchValidator,
} from "../../venture-holding/venture-validator.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { SqliteOperationalEventRepository } from "./sqlite-operational-event-repository.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

const MAX_LIST_LIMIT = 250;

export class SqliteVentureHoldingRepository implements VentureHoldingRepository {
  readonly #receiptValidator = new VentureCommandReceiptValidator();
  readonly #auditValidator = new VentureAuditEventValidator();
  readonly #eventValidator = new VentureEventValidator();
  readonly #killSwitchValidator = new VentureKillSwitchValidator();

  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getRecord<K extends VentureRecordType>(query: VentureRecordQuery<K>): Promise<VentureRecordMap[K] | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(query);
    assertRecordType(query.type);
    assertId(query.entityId, "entity ID");
    if (query.version !== undefined) assertVersion(query.version);
    const row = query.version === undefined
      ? this.database.prepare("SELECT workspace_id, actor_id, record_type, entity_id, version, updated_at, tombstoned, fingerprint, record_json FROM venture_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? ORDER BY version DESC LIMIT 1").get(query.workspaceId, query.actorId, query.type, query.entityId)
      : this.database.prepare("SELECT workspace_id, actor_id, record_type, entity_id, version, updated_at, tombstoned, fingerprint, record_json FROM venture_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? AND version = ?").get(query.workspaceId, query.actorId, query.type, query.entityId, query.version);
    return Promise.resolve(row === undefined ? undefined : this.#decodeRecord(query.type, row, query));
  }

  public listRecords<K extends VentureRecordType>(query: VentureRecordListQuery<K>): Promise<readonly VentureRecordMap[K][]> {
    assertActiveTransaction(this.scope);
    validateIdentity(query);
    assertRecordType(query.type);
    assertLimit(query.limit);
    const rows = this.database.prepare("SELECT workspace_id, actor_id, record_type, entity_id, version, updated_at, tombstoned, fingerprint, record_json FROM venture_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? ORDER BY sequence DESC LIMIT ?").all(query.workspaceId, query.actorId, query.type, query.limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decodeRecord(query.type, row, query))));
  }

  public appendRecord<K extends VentureRecordType>(type: K, entityId: string, record: VentureRecordMap[K], expectedPreviousVersion?: number): Promise<void> {
    assertActiveTransaction(this.scope);
    assertRecordType(type);
    assertId(entityId, "entity ID");
    const checked = validatedRecord(type, record);
    if (ventureRecordEntityId(type, checked) !== entityId) throw new RepositoryValidationError("Venture record entity ID does not match the record");
    const latestRow = this.database.prepare("SELECT workspace_id, actor_id, record_type, entity_id, version, updated_at, tombstoned, fingerprint, record_json FROM venture_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? ORDER BY version DESC LIMIT 1").get(checked.workspaceId, checked.actorId, type, entityId);
    const latest = latestRow === undefined ? undefined : this.#decodeRecord(type, latestRow, checked);
    if (checked.version === 0) {
      if (expectedPreviousVersion !== undefined) throw new RepositoryValidationError("Initial Venture record cannot declare a previous version");
      if (latest !== undefined) throw new RepositoryConflictError("Venture record already exists");
    } else {
      if (expectedPreviousVersion !== checked.version - 1) throw new RepositoryValidationError("Venture append requires the exact previous version");
      if (latest?.version !== expectedPreviousVersion) throw new RepositoryConflictError("Venture record changed before append");
      if (latest.createdAt !== checked.createdAt) throw new RepositoryConflictError("Venture record immutable identity changed");
      if (isTombstoned(latest)) throw new RepositoryConflictError("Tombstoned Venture record cannot be reopened");
    }
    const tombstoned = isTombstoned(checked) ? 1 : 0;
    try {
      this.database.prepare("INSERT INTO venture_records (workspace_id, actor_id, record_type, entity_id, version, updated_at, tombstoned, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, type, entityId, checked.version, checked.updatedAt, tombstoned, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Venture append conflicts with durable state");
      throw new SqliteRepositoryError("Venture record append failed", "venture.record.append");
    }
    return Promise.resolve();
  }

  public getCommandReceipt(identity: VentureIdentity, idempotencyKey: string): Promise<VentureCommandReceipt | undefined> {
    assertId(idempotencyKey, "idempotency key");
    return this.#getReceipt(identity, "idempotency_key_fingerprint", canonicalSha256(idempotencyKey));
  }

  public getCommandReceiptByCommandId(identity: VentureIdentity, commandId: string): Promise<VentureCommandReceipt | undefined> {
    assertId(commandId, "command ID");
    return this.#getReceipt(identity, "command_id", commandId);
  }

  public insertCommandReceipt(receipt: VentureCommandReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(receipt, this.#receiptValidator, "Venture command receipt");
    try {
      this.database.prepare("INSERT INTO venture_command_receipts (workspace_id, actor_id, idempotency_key_fingerprint, command_id, request_fingerprint, response_fingerprint, recorded_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.idempotencyKeyFingerprint, checked.commandId, checked.requestFingerprint, checked.responseFingerprint, checked.recordedAt, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Venture command receipt already exists");
      throw new SqliteRepositoryError("Venture command receipt write failed", "venture.receipt.insert");
    }
    return Promise.resolve();
  }

  public appendAudit(event: VentureAuditEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(event, this.#auditValidator, "Venture audit event");
    try {
      this.database.prepare("INSERT INTO venture_audit_events (workspace_id, actor_id, event_id, command_id, occurred_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.eventId, checked.commandId, checked.occurredAt, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Venture audit event already exists");
      throw new SqliteRepositoryError("Venture audit append failed", "venture.audit.append");
    }
    return Promise.resolve();
  }

  public listAudit(identity: VentureIdentity, limit: number): Promise<readonly VentureAuditEvent[]> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertLimit(limit);
    const rows = this.database.prepare("SELECT workspace_id, actor_id, event_id, command_id, occurred_at, fingerprint, record_json FROM venture_audit_events WHERE workspace_id = ? AND actor_id = ? ORDER BY sequence DESC LIMIT ?").all(identity.workspaceId, identity.actorId, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decodeAudit(row, identity))));
  }

  public appendEvent(event: VentureEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(event, this.#eventValidator, "Venture event");
    try {
      this.database.prepare("INSERT INTO venture_events (workspace_id, actor_id, event_id, aggregate_type, entity_id, entity_version, occurred_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.eventId, checked.aggregateType, checked.entityId, checked.entityVersion, checked.occurredAt, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Venture event already exists");
      throw new SqliteRepositoryError("Venture event append failed", "venture.event.append");
    }
    const operationalEventId = `venture:${canonicalSha256([checked.workspaceId, checked.actorId, checked.eventId]).slice(0, 64)}`;
    return new SqliteOperationalEventRepository(this.database, this.scope).append({
      aggregateType: "VENTURE",
      contractVersion: "1",
      entityId: checked.entityId.length <= 127 ? checked.entityId : `venture:${canonicalSha256(checked.entityId).slice(0, 64)}`,
      entityVersion: checked.entityVersion,
      eventId: operationalEventId,
      eventType: "VENTURE_STATE_CHANGED",
      occurredAt: checked.occurredAt,
      safeSummaryCode: "venture_state_changed",
      workspaceId: checked.workspaceId,
    }).then(() => undefined);
  }

  public listEvents(identity: VentureIdentity, afterSequence: number, limit: number): Promise<readonly (VentureEvent & { readonly sequence: number })[]> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new RepositoryValidationError("Venture event cursor is invalid");
    assertLimit(limit);
    const rows = this.database.prepare("SELECT sequence, workspace_id, actor_id, event_id, aggregate_type, entity_id, entity_version, occurred_at, fingerprint, record_json FROM venture_events WHERE workspace_id = ? AND actor_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?").all(identity.workspaceId, identity.actorId, afterSequence, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decodeEvent(row, identity))));
  }

  public getKillSwitch(identity: VentureIdentity): Promise<VentureKillSwitch | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    const row = this.database.prepare("SELECT workspace_id, actor_id, enabled, version, updated_at, fingerprint, record_json FROM venture_runtime_controls WHERE workspace_id = ? AND actor_id = ?").get(identity.workspaceId, identity.actorId);
    return Promise.resolve(row === undefined ? undefined : this.#decodeKillSwitch(row, identity));
  }

  public async setKillSwitch(value: VentureKillSwitch, expectedVersion: number | "NOT_EXISTS"): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(value, this.#killSwitchValidator, "Venture kill switch");
    const current = await this.getKillSwitch(checked);
    if (expectedVersion === "NOT_EXISTS") {
      if (current !== undefined || checked.version !== 0) throw new RepositoryConflictError("Venture kill switch already exists");
      try {
        this.database.prepare("INSERT INTO venture_runtime_controls (workspace_id, actor_id, enabled, version, updated_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.enabled ? 1 : 0, checked.version, checked.updatedAt, checked.fingerprint, JSON.stringify(checked));
      } catch (error) {
        if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Venture kill switch already exists");
        throw new SqliteRepositoryError("Venture kill switch write failed", "venture.kill_switch.insert");
      }
      return;
    }
    assertVersion(expectedVersion);
    if (current?.version !== expectedVersion) throw new RepositoryConflictError("Venture kill switch changed before update");
    if (checked.version !== expectedVersion + 1 || current.actorId !== checked.actorId || current.workspaceId !== checked.workspaceId || Date.parse(checked.updatedAt) < Date.parse(current.updatedAt)) throw new RepositoryConflictError("Venture kill switch transition is invalid");
    const result = this.database.prepare("UPDATE venture_runtime_controls SET enabled = ?, version = ?, updated_at = ?, fingerprint = ?, record_json = ? WHERE workspace_id = ? AND actor_id = ? AND version = ?").run(checked.enabled ? 1 : 0, checked.version, checked.updatedAt, checked.fingerprint, JSON.stringify(checked), checked.workspaceId, checked.actorId, expectedVersion);
    if (result.changes !== 1) throw new RepositoryConflictError("Venture kill switch changed during update");
  }

  #getReceipt(identity: VentureIdentity, column: "command_id" | "idempotency_key_fingerprint", value: string): Promise<VentureCommandReceipt | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    const row = this.database.prepare(`SELECT workspace_id, actor_id, idempotency_key_fingerprint, command_id, request_fingerprint, response_fingerprint, recorded_at, fingerprint, record_json FROM venture_command_receipts WHERE workspace_id = ? AND actor_id = ? AND ${column} = ?`).get(identity.workspaceId, identity.actorId, value);
    return Promise.resolve(row === undefined ? undefined : this.#decodeReceipt(row, identity));
  }

  #decodeRecord<K extends VentureRecordType>(type: K, row: Readonly<Record<string, unknown>>, identity: VentureIdentity): VentureRecordMap[K] {
    const parsed = parseJson(row.record_json, "Venture record");
    const checked = validatedRecord(type, parsed);
    if (row.workspace_id !== identity.workspaceId || row.actor_id !== identity.actorId || row.record_type !== type || row.entity_id !== ventureRecordEntityId(type, checked) || row.version !== checked.version || row.updated_at !== checked.updatedAt || row.tombstoned !== (isTombstoned(checked) ? 1 : 0) || row.fingerprint !== checked.fingerprint || checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId) throw new RepositoryValidationError("Venture record columns do not match stored content");
    return checked;
  }

  #decodeReceipt(row: Readonly<Record<string, unknown>>, identity: VentureIdentity): VentureCommandReceipt {
    const checked = validate(parseJson(row.record_json, "Venture command receipt"), this.#receiptValidator, "Venture command receipt");
    if (row.workspace_id !== identity.workspaceId || row.actor_id !== identity.actorId || row.command_id !== checked.commandId || row.idempotency_key_fingerprint !== checked.idempotencyKeyFingerprint || row.request_fingerprint !== checked.requestFingerprint || row.response_fingerprint !== checked.responseFingerprint || row.recorded_at !== checked.recordedAt || row.fingerprint !== checked.fingerprint || checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId) throw new RepositoryValidationError("Venture command receipt columns do not match stored content");
    return checked;
  }

  #decodeAudit(row: Readonly<Record<string, unknown>>, identity: VentureIdentity): VentureAuditEvent {
    const checked = validate(parseJson(row.record_json, "Venture audit event"), this.#auditValidator, "Venture audit event");
    if (row.workspace_id !== identity.workspaceId || row.actor_id !== identity.actorId || row.event_id !== checked.eventId || row.command_id !== checked.commandId || row.occurred_at !== checked.occurredAt || row.fingerprint !== checked.fingerprint || checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId) throw new RepositoryValidationError("Venture audit columns do not match stored content");
    return checked;
  }

  #decodeEvent(row: Readonly<Record<string, unknown>>, identity: VentureIdentity): VentureEvent & { readonly sequence: number } {
    const checked = validate(parseJson(row.record_json, "Venture event"), this.#eventValidator, "Venture event");
    if (!Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1 || row.workspace_id !== identity.workspaceId || row.actor_id !== identity.actorId || row.event_id !== checked.eventId || row.aggregate_type !== checked.aggregateType || row.entity_id !== checked.entityId || row.entity_version !== checked.entityVersion || row.occurred_at !== checked.occurredAt || row.fingerprint !== checked.fingerprint || checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId) throw new RepositoryValidationError("Venture event columns do not match stored content");
    return Object.freeze({ ...checked, sequence: row.sequence as number });
  }

  #decodeKillSwitch(row: Readonly<Record<string, unknown>>, identity: VentureIdentity): VentureKillSwitch {
    const checked = validate(parseJson(row.record_json, "Venture kill switch"), this.#killSwitchValidator, "Venture kill switch");
    if (row.workspace_id !== identity.workspaceId || row.actor_id !== identity.actorId || row.enabled !== (checked.enabled ? 1 : 0) || row.version !== checked.version || row.updated_at !== checked.updatedAt || row.fingerprint !== checked.fingerprint || checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId) throw new RepositoryValidationError("Venture kill switch columns do not match stored content");
    return checked;
  }
}

function validatedRecord<K extends VentureRecordType>(type: K, value: unknown): VentureRecordMap[K] { const result = validateVentureRecord(type, value); if (!result.ok) throw new RepositoryValidationError("Venture record is invalid", { issueCount: result.issues.length, recordType: type }); return result.value; }
function validate<T>(value: unknown, validator: { validate(input: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} is invalid`, { issueCount: result.issues.length }); return result.value; }
function parseJson(value: unknown, label: string): unknown { if (typeof value !== "string") throw new RepositoryValidationError(`${label} is corrupted`); try { return JSON.parse(value) as unknown; } catch { throw new RepositoryValidationError(`${label} is corrupted`); } }
function isTombstoned(value: unknown): boolean { return typeof value === "object" && value !== null && !Array.isArray(value) && "tombstoned" in value && value.tombstoned === true; }
function validateIdentity(value: VentureIdentity): void { assertId(value.workspaceId, "workspace ID"); assertId(value.actorId, "actor ID"); }
function assertRecordType(value: unknown): asserts value is VentureRecordType { if (typeof value !== "string" || !VENTURE_RECORD_TYPES.includes(value as VentureRecordType)) throw new RepositoryValidationError("Venture record type is invalid"); }
function assertId(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,191}$/u.test(value)) throw new RepositoryValidationError(`Venture ${label} is invalid`); }
function assertVersion(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) throw new RepositoryValidationError("Venture version is invalid"); }
function assertLimit(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_LIST_LIMIT) throw new RepositoryValidationError("Venture list limit is invalid"); }
