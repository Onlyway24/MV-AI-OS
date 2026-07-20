import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { canonicalSha256 } from "../../contracts/canonical-fingerprint.js";
import { MetodoVeloceContentProductionRecordValidator } from "../../content-production/metodo-veloce-content-production-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import {
  REFERENCE_VAULT_LIMITS,
  type ReferenceVaultAuditEvent,
  type ReferenceVaultCommandReceipt,
  type ReferenceVaultRecordMap,
  type ReferenceVaultRecordType,
} from "../../reference-vault/reference-vault.js";
import {
  referenceVaultEntityId,
  type AuthoritativeContentPackageRef,
  type ReferenceVaultBlob,
  type ReferenceVaultIdentity,
  type ReferenceVaultRepository,
  type ReferenceVaultRecordQuery,
  type ReferenceVaultListQuery,
  type ReferenceVaultAppendExpectation,
  type ReferenceVaultStorageUsage,
} from "../../reference-vault/reference-vault-repository.js";
import {
  ReferenceVaultAuditEventValidator,
  ReferenceVaultCommandReceiptValidator,
  validateReferenceVaultRecord,
} from "../../reference-vault/reference-vault-validator.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

const RECORD_TYPES = new Set<ReferenceVaultRecordType>([
  "AUDIENCE_SIGNAL", "BUSINESS_CONTEXT", "CREATIVE_DECISION", "CREATIVE_FINGERPRINT", "CUSTOMER_LANGUAGE_REFERENCE", "NEGATIVE_REFERENCE", "OFFER_REFERENCE", "OUTCOME_LINK", "REFERENCE_ASSET", "REFERENCE_BLOB_TOMBSTONE", "REFERENCE_COLLECTION", "REFERENCE_COMMAND_RESULT", "REFERENCE_IMPORT_RECEIPT", "REFERENCE_REVIEW",
]);

export class SqliteReferenceVaultRepository implements ReferenceVaultRepository {
  readonly #receiptValidator = new ReferenceVaultCommandReceiptValidator();
  readonly #auditValidator = new ReferenceVaultAuditEventValidator();
  readonly #contentProductionValidator = new MetodoVeloceContentProductionRecordValidator();

  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getRecord<K extends ReferenceVaultRecordType>(query: ReferenceVaultRecordQuery<K>): Promise<ReferenceVaultRecordMap[K] | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(query);
    assertId(query.entityId, "entity ID");
    assertRecordType(query.type);
    if (query.version !== undefined) assertVersion(query.version);
    const row = query.version === undefined
      ? this.database.prepare("SELECT record_type, entity_id, version, content_sha256, fingerprint, record_json FROM reference_vault_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? ORDER BY version DESC LIMIT 1").get(query.workspaceId, query.actorId, query.type, query.entityId)
      : this.database.prepare("SELECT record_type, entity_id, version, content_sha256, fingerprint, record_json FROM reference_vault_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? AND version = ?").get(query.workspaceId, query.actorId, query.type, query.entityId, query.version);
    return Promise.resolve(row === undefined ? undefined : this.#decodeRecord(query.type, row, query));
  }

  public listRecords<K extends ReferenceVaultRecordType>(query: ReferenceVaultListQuery<K>): Promise<readonly ReferenceVaultRecordMap[K][]> {
    assertActiveTransaction(this.scope);
    validateIdentity(query);
    assertRecordType(query.type);
    assertLimit(query.limit);
    const rows = this.database.prepare("SELECT record_type, entity_id, version, content_sha256, fingerprint, record_json FROM reference_vault_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? ORDER BY sequence DESC LIMIT ?").all(query.workspaceId, query.actorId, query.type, query.limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decodeRecord(query.type, row, query))));
  }

  public async findAssetBySha256(identity: ReferenceVaultIdentity, sha256: string): Promise<ReferenceVaultRecordMap["REFERENCE_ASSET"] | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertHash(sha256, "asset SHA-256");
    const row = this.database.prepare("SELECT entity_id FROM reference_vault_records WHERE workspace_id = ? AND actor_id = ? AND record_type = 'REFERENCE_ASSET' AND content_sha256 = ? AND version = 0 LIMIT 1").get(identity.workspaceId, identity.actorId, sha256);
    if (row === undefined) return undefined;
    if (typeof row.entity_id !== "string") throw new RepositoryValidationError("Reference Vault SHA index is corrupted");
    return this.getRecord({ ...identity, entityId: row.entity_id, type: "REFERENCE_ASSET" });
  }

  public getAuthoritativeContentPackageRef(identity: ReferenceVaultIdentity, packageId: string): Promise<AuthoritativeContentPackageRef | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertId(packageId, "content package ID");
    const row = this.database.prepare("SELECT record_json FROM metodo_veloce_content_productions WHERE workspace_id = ? AND actor_id = ? AND production_id = ?").get(identity.workspaceId, identity.actorId, packageId);
    if (row === undefined) return Promise.resolve(undefined);
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Authoritative content package record is corrupted");
    let decoded: unknown;
    try { decoded = JSON.parse(row.record_json); }
    catch { throw new RepositoryValidationError("Authoritative content package record is corrupted"); }
    const validated = this.#contentProductionValidator.validate(decoded);
    if (!validated.ok || validated.value.workspaceId !== identity.workspaceId || validated.value.actorId !== identity.actorId || validated.value.productionId !== packageId) throw new RepositoryValidationError("Authoritative content package record is invalid");
    return Promise.resolve(Object.freeze({ fingerprint: canonicalSha256(validated.value.package), packageId, version: validated.value.package.version }));
  }

  public appendRecord<K extends ReferenceVaultRecordType>(type: K, entityId: string, record: ReferenceVaultRecordMap[K], expectation?: ReferenceVaultAppendExpectation): Promise<void> {
    assertActiveTransaction(this.scope);
    assertRecordType(type);
    assertId(entityId, "entity ID");
    const checked = validateRecord(type, record);
    validateIdentity(checked);
    if (referenceVaultEntityId(type, checked) !== entityId) throw new RepositoryValidationError("Reference Vault entity ID does not match its record");
    const expectedPrevious = expectation?.previousVersion;
    if (checked.version === 0 && expectedPrevious !== undefined) throw new RepositoryValidationError("Initial Reference Vault records cannot declare a previous version");
    if (checked.version > 0 && expectedPrevious !== checked.version - 1) throw new RepositoryValidationError("Reference Vault append requires the exact previous version");
    const latest = this.database.prepare("SELECT version, fingerprint FROM reference_vault_records WHERE workspace_id = ? AND actor_id = ? AND record_type = ? AND entity_id = ? ORDER BY version DESC LIMIT 1").get(checked.workspaceId, checked.actorId, type, entityId);
    if (checked.version === 0 && latest !== undefined) throw new RepositoryConflictError("Reference Vault entity already exists");
    if (checked.version > 0 && (latest === undefined || latest.version !== expectedPrevious || typeof latest.fingerprint !== "string")) throw new RepositoryConflictError("Reference Vault entity version changed before append");
    const contentSha256 = type === "REFERENCE_ASSET" ? (checked as ReferenceVaultRecordMap["REFERENCE_ASSET"]).sha256 : null;
    try {
      this.database.prepare("INSERT INTO reference_vault_records (workspace_id, actor_id, record_type, entity_id, version, content_sha256, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, type, entityId, checked.version, contentSha256, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Reference Vault append conflicts with durable state");
      throw new SqliteRepositoryError("Reference Vault record append failed", "reference_vault.record.append");
    }
    return Promise.resolve();
  }

  public getBlob(identity: ReferenceVaultIdentity, sha256: string): Promise<ReferenceVaultBlob | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertHash(sha256, "blob SHA-256");
    const row = this.database.prepare("SELECT byte_length, mime_type, stored_at, content FROM reference_vault_blobs WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").get(identity.workspaceId, identity.actorId, sha256);
    if (row === undefined) return Promise.resolve(undefined);
    if (typeof row.byte_length !== "number" || !Number.isSafeInteger(row.byte_length) || row.byte_length < 1 || typeof row.mime_type !== "string" || !mime(row.mime_type) || typeof row.stored_at !== "string" || !timestamp(row.stored_at) || !(row.content instanceof Uint8Array)) throw new RepositoryValidationError("Reference Vault blob metadata is corrupted");
    const bytes = Uint8Array.from(row.content);
    if (bytes.byteLength !== row.byte_length || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new RepositoryValidationError("Reference Vault blob content is corrupted");
    return Promise.resolve(Object.freeze({ ...identity, byteLength: row.byte_length, bytes, mimeType: row.mime_type, sha256, storedAt: row.stored_at }));
  }

  public async putBlob(blob: ReferenceVaultBlob): Promise<void> {
    assertActiveTransaction(this.scope);
    validateIdentity(blob);
    assertHash(blob.sha256, "blob SHA-256");
    if (!Number.isSafeInteger(blob.byteLength) || blob.byteLength < 1 || blob.byteLength > REFERENCE_VAULT_LIMITS.maxBlobBytes || blob.bytes.byteLength !== blob.byteLength || !mime(blob.mimeType) || !timestamp(blob.storedAt) || createHash("sha256").update(blob.bytes).digest("hex") !== blob.sha256) throw new RepositoryValidationError("Reference Vault blob is invalid");
    const existing = await this.getBlob(blob, blob.sha256);
    if (existing !== undefined) {
      if (existing.byteLength !== blob.byteLength || existing.mimeType !== blob.mimeType || !Buffer.from(existing.bytes).equals(Buffer.from(blob.bytes))) throw new RepositoryValidationError("Reference Vault immutable blob conflicts with stored content");
      return;
    }
    try {
      this.database.prepare("INSERT INTO reference_vault_blobs (workspace_id, actor_id, sha256, byte_length, mime_type, stored_at, content) VALUES (?, ?, ?, ?, ?, ?, ?)").run(blob.workspaceId, blob.actorId, blob.sha256, blob.byteLength, blob.mimeType, blob.storedAt, blob.bytes);
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Reference Vault blob already exists");
      throw new SqliteRepositoryError("Reference Vault blob write failed", "reference_vault.blob.put");
    }
  }

  public deleteBlobAfterRetentionTombstone(identity: ReferenceVaultIdentity, sha256: string): Promise<void> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertHash(sha256, "blob SHA-256");
    const deleted = this.database.prepare("DELETE FROM reference_vault_blobs WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run(identity.workspaceId, identity.actorId, sha256);
    if (Number(deleted.changes) !== 1) throw new RepositoryConflictError("Reference Vault blob changed before retention purge");
    return Promise.resolve();
  }

  public getStorageUsage(identity: ReferenceVaultIdentity): Promise<ReferenceVaultStorageUsage> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    const row = this.database.prepare("SELECT COUNT(*) AS blob_count, COALESCE(SUM(byte_length), 0) AS total_bytes FROM reference_vault_blobs WHERE workspace_id = ? AND actor_id = ?").get(identity.workspaceId, identity.actorId);
    if (row === undefined || typeof row.blob_count !== "number" || !Number.isSafeInteger(row.blob_count) || row.blob_count < 0 || typeof row.total_bytes !== "number" || !Number.isSafeInteger(row.total_bytes) || row.total_bytes < 0) throw new RepositoryValidationError("Reference Vault storage usage is corrupted");
    return Promise.resolve(Object.freeze({ blobCount: row.blob_count, totalBytes: row.total_bytes }));
  }

  public getCommandReceipt(identity: ReferenceVaultIdentity, idempotencyKey: string): Promise<ReferenceVaultCommandReceipt | undefined> {
    assertId(idempotencyKey, "idempotency key");
    return this.#getReceipt(identity, "idempotency_key", canonicalSha256(idempotencyKey));
  }

  public getCommandReceiptByCommandId(identity: ReferenceVaultIdentity, commandId: string): Promise<ReferenceVaultCommandReceipt | undefined> {
    return this.#getReceipt(identity, "command_id", commandId);
  }

  public insertCommandReceipt(receipt: ReferenceVaultCommandReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(receipt, this.#receiptValidator, "Reference Vault command receipt");
    try {
      this.database.prepare("INSERT INTO reference_vault_command_receipts (workspace_id, actor_id, command_id, idempotency_key, request_fingerprint, recorded_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.commandId, checked.idempotencyKeyFingerprint, checked.requestFingerprint, checked.recordedAt, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Reference Vault command receipt already exists");
      throw new SqliteRepositoryError("Reference Vault command receipt write failed", "reference_vault.receipt.insert");
    }
    return Promise.resolve();
  }

  public appendAudit(event: ReferenceVaultAuditEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = validate(event, this.#auditValidator, "Reference Vault audit event");
    try {
      this.database.prepare("INSERT INTO reference_vault_audit_events (workspace_id, actor_id, event_id, command_id, occurred_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.actorId, checked.eventId, checked.commandId, checked.occurredAt, checked.fingerprint, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Reference Vault audit event already exists");
      throw new SqliteRepositoryError("Reference Vault audit append failed", "reference_vault.audit.append");
    }
    return Promise.resolve();
  }

  public listAudit(identity: ReferenceVaultIdentity, limit: number): Promise<readonly ReferenceVaultAuditEvent[]> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    assertLimit(limit);
    const rows = this.database.prepare("SELECT workspace_id, actor_id, event_id, command_id, occurred_at, fingerprint, record_json FROM reference_vault_audit_events WHERE workspace_id = ? AND actor_id = ? ORDER BY sequence DESC LIMIT ?").all(identity.workspaceId, identity.actorId, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decodeAudit(row, identity))));
  }

  #getReceipt(identity: ReferenceVaultIdentity, column: "command_id" | "idempotency_key", value: string): Promise<ReferenceVaultCommandReceipt | undefined> {
    assertActiveTransaction(this.scope);
    validateIdentity(identity);
    if (column === "command_id") assertId(value, "command ID");
    else assertHash(value, "idempotency key fingerprint");
    const row = this.database.prepare(`SELECT workspace_id, actor_id, command_id, idempotency_key, request_fingerprint, recorded_at, fingerprint, record_json FROM reference_vault_command_receipts WHERE workspace_id = ? AND actor_id = ? AND ${column} = ?`).get(identity.workspaceId, identity.actorId, value);
    return Promise.resolve(row === undefined ? undefined : this.#decodeReceipt(row, identity));
  }

  #decodeRecord<K extends ReferenceVaultRecordType>(type: K, row: Readonly<Record<string, unknown>>, identity: ReferenceVaultIdentity): ReferenceVaultRecordMap[K] {
    if (row.record_type !== type || typeof row.entity_id !== "string" || typeof row.version !== "number" || typeof row.fingerprint !== "string" || typeof row.record_json !== "string") throw new RepositoryValidationError("Reference Vault record columns are corrupted");
    const parsed = parseJson(row.record_json, "Reference Vault record");
    const checked = validateRecord(type, parsed);
    if (checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId || referenceVaultEntityId(type, checked) !== row.entity_id || checked.version !== row.version || checked.fingerprint !== row.fingerprint) throw new RepositoryValidationError("Reference Vault record columns do not match stored content");
    if (type === "REFERENCE_ASSET" && row.content_sha256 !== (checked as ReferenceVaultRecordMap["REFERENCE_ASSET"]).sha256) throw new RepositoryValidationError("Reference Vault asset SHA column is corrupted");
    if (type !== "REFERENCE_ASSET" && row.content_sha256 !== null) throw new RepositoryValidationError("Reference Vault non-asset has an invalid content SHA");
    return checked;
  }

  #decodeReceipt(row: Readonly<Record<string, unknown>>, identity: ReferenceVaultIdentity): ReferenceVaultCommandReceipt {
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Reference Vault command receipt is corrupted");
    const checked = validate(parseJson(row.record_json, "Reference Vault command receipt"), this.#receiptValidator, "Reference Vault command receipt");
    if (checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId || checked.commandId !== row.command_id || checked.idempotencyKeyFingerprint !== row.idempotency_key || checked.requestFingerprint !== row.request_fingerprint || checked.recordedAt !== row.recorded_at || checked.fingerprint !== row.fingerprint) throw new RepositoryValidationError("Reference Vault command receipt columns do not match stored content");
    return checked;
  }

  #decodeAudit(row: Readonly<Record<string, unknown>>, identity: ReferenceVaultIdentity): ReferenceVaultAuditEvent {
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Reference Vault audit event is corrupted");
    const checked = validate(parseJson(row.record_json, "Reference Vault audit event"), this.#auditValidator, "Reference Vault audit event");
    if (checked.workspaceId !== identity.workspaceId || checked.actorId !== identity.actorId || checked.eventId !== row.event_id || checked.commandId !== row.command_id || checked.occurredAt !== row.occurred_at || checked.fingerprint !== row.fingerprint) throw new RepositoryValidationError("Reference Vault audit columns do not match stored content");
    return checked;
  }
}

function validateRecord<K extends ReferenceVaultRecordType>(type: K, value: unknown): ReferenceVaultRecordMap[K] {
  const checked = validateReferenceVaultRecord(type, value);
  if (!checked.ok) throw new RepositoryValidationError("Reference Vault record is invalid", { issueCount: checked.issues.length });
  return checked.value;
}

function validate<T>(value: unknown, validator: { validate(candidate: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T {
  const checked = validator.validate(value);
  if (!checked.ok) throw new RepositoryValidationError(`${label} is invalid`, { issueCount: checked.issues.length });
  return checked.value;
}

function parseJson(serialized: string, label: string): unknown {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return parsed;
  } catch {
    throw new RepositoryValidationError(`${label} JSON is corrupted`);
  }
}

function validateIdentity(value: ReferenceVaultIdentity): void { assertId(value.workspaceId, "workspace ID"); assertId(value.actorId, "actor ID"); }
function assertId(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError(`Reference Vault ${label} is invalid`); }
function assertHash(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new RepositoryValidationError(`Reference Vault ${label} is invalid`); }
function assertVersion(value: unknown): asserts value is number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RepositoryValidationError("Reference Vault version is invalid"); }
function assertLimit(value: unknown): asserts value is number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > REFERENCE_VAULT_LIMITS.maxRecordScan) throw new RepositoryValidationError("Reference Vault list limit is invalid"); }
function assertRecordType(value: unknown): asserts value is ReferenceVaultRecordType { if (typeof value !== "string" || !RECORD_TYPES.has(value as ReferenceVaultRecordType)) throw new RepositoryValidationError("Reference Vault record type is invalid"); }
function timestamp(value: string): boolean { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function mime(value: string): boolean { return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u.test(value) && value.length <= 128; }
