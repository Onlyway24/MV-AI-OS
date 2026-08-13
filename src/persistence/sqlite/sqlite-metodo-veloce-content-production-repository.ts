import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { MetodoVeloceContentProductionRepository, MetodoVeloceContentProductionUpdateExpectation } from "../../content-production/metodo-veloce-content-production-repository.js";
import { isMetodoVeloceContentProductionTransitionAllowed, type MetodoVeloceContentProductionRecord } from "../../content-production/metodo-veloce-content-production-record.js";
import { MetodoVeloceContentProductionRecordValidator } from "../../content-production/metodo-veloce-content-production-validator.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteMetodoVeloceContentProductionRepository implements MetodoVeloceContentProductionRepository {
  readonly #validator = new MetodoVeloceContentProductionRecordValidator();

  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getById(productionId: string): Promise<MetodoVeloceContentProductionRecord | undefined> {
    assertActiveTransaction(this.scope);
    assertId(productionId);
    const row = this.database.prepare("SELECT record_json FROM metodo_veloce_content_productions WHERE production_id = ?").get(productionId);
    if (row === undefined) return Promise.resolve(undefined);
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Metodo Veloce content production record is corrupted");
    return Promise.resolve(this.#decode(row.record_json));
  }

  public insert(record: MetodoVeloceContentProductionRecord): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = this.#validate(record);
    if (checked.version !== 0) throw new RepositoryValidationError("A new Metodo Veloce content production must start at version zero");
    try { this.database.prepare("INSERT INTO metodo_veloce_content_productions (production_id, workspace_id, actor_id, status, version, scheduled_for, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.productionId, checked.workspaceId, checked.actorId, checked.status, checked.version, checked.schedule?.scheduledFor ?? null, checked.updatedAt, JSON.stringify(checked)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Metodo Veloce content production already exists", { productionId: checked.productionId }); throw new SqliteRepositoryError("Metodo Veloce content production write failed", "metodo_veloce_content_production.insert"); }
    return Promise.resolve();
  }

  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly MetodoVeloceContentProductionRecord[]> {
    assertActiveTransaction(this.scope);
    assertId(workspaceId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Metodo Veloce content production queue limit is invalid");
    const rows = this.database.prepare("SELECT record_json FROM metodo_veloce_content_productions WHERE workspace_id = ? ORDER BY CASE status WHEN 'SCHEDULED' THEN 0 WHEN 'PENDING_FABIO_APPROVAL' THEN 1 WHEN 'APPROVED_FOR_SCHEDULING' THEN 2 WHEN 'BLOCKED' THEN 3 ELSE 4 END, COALESCE(scheduled_for, updated_at) ASC, production_id ASC LIMIT ?").all(workspaceId, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => { if (typeof row.record_json !== "string") throw new RepositoryValidationError("Metodo Veloce content production record is corrupted"); return this.#decode(row.record_json); })));
  }

  public update(record: MetodoVeloceContentProductionRecord, expectation: MetodoVeloceContentProductionUpdateExpectation): Promise<void> {
    assertActiveTransaction(this.scope);
    const checked = this.#validate(record);
    if (!Number.isSafeInteger(expectation.version) || expectation.version < 0) throw new RepositoryValidationError("Metodo Veloce content production update expectation is invalid");
    const existing = this.#select(checked.productionId);
    if (existing === undefined) throw new RepositoryConflictError("Metodo Veloce content production does not exist", { productionId: checked.productionId });
    if (existing.version !== expectation.version || checked.version !== expectation.version + 1) throw new RepositoryConflictError("Metodo Veloce content production changed after read", { actualVersion: existing.version, expectedVersion: expectation.version, productionId: checked.productionId });
    if (!sameIdentity(existing, checked) || !isTransitionValid(existing, checked)) throw new RepositoryConflictError("Metodo Veloce content production transition is invalid", { productionId: checked.productionId });
    const result = this.database.prepare("UPDATE metodo_veloce_content_productions SET status = ?, version = ?, scheduled_for = ?, updated_at = ?, record_json = ? WHERE production_id = ? AND version = ?").run(checked.status, checked.version, checked.schedule?.scheduledFor ?? null, checked.updatedAt, JSON.stringify(checked), checked.productionId, expectation.version);
    if (result.changes !== 1) throw new RepositoryConflictError("Metodo Veloce content production changed during update", { productionId: checked.productionId });
    return Promise.resolve();
  }

  #select(productionId: string): MetodoVeloceContentProductionRecord | undefined {
    const row = this.database.prepare("SELECT record_json FROM metodo_veloce_content_productions WHERE production_id = ?").get(productionId);
    if (row === undefined) return undefined;
    if (typeof row.record_json !== "string") throw new RepositoryValidationError("Metodo Veloce content production record is corrupted");
    return this.#decode(row.record_json);
  }

  #decode(value: string): MetodoVeloceContentProductionRecord { try { return this.#validate(JSON.parse(value)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Metodo Veloce content production record is corrupted"); } }
  #validate(value: unknown): MetodoVeloceContentProductionRecord { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Metodo Veloce content production record is invalid", { issueCount: result.issues.length }); return result.value; }
}

function isTransitionValid(previous: MetodoVeloceContentProductionRecord, next: MetodoVeloceContentProductionRecord): boolean {
  if (!isMetodoVeloceContentProductionTransitionAllowed(previous.status, next.status)) return false;
  if (previous.status === "SCHEDULED" && next.status === "SCHEDULED") return previous.metrics === undefined && next.metrics !== undefined && JSON.stringify({ ...previous, metrics: next.metrics, updatedAt: next.updatedAt, version: next.version }) === JSON.stringify(next);
  return true;
}
function sameIdentity(previous: MetodoVeloceContentProductionRecord, next: MetodoVeloceContentProductionRecord): boolean { return previous.actorId === next.actorId && previous.createdAt === next.createdAt && previous.productionId === next.productionId && previous.workspaceId === next.workspaceId && JSON.stringify(previous.package) === JSON.stringify(next.package); }
function assertId(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[a-zA-Z0-9@._:-]{1,128}$/u.test(value)) throw new RepositoryValidationError("Metodo Veloce content production ID is invalid"); }
