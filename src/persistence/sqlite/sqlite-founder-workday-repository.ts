import type { DatabaseSync } from "node:sqlite";

import type { FounderWorkdayRepository } from "../../agent-company/founder-workday-repository.js";
import type { FounderWorkdayRecord } from "../../agent-company/founder-workday.js";
import { FounderWorkdayRecordValidator } from "../../agent-company/founder-workday-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteFounderWorkdayRepository implements FounderWorkdayRepository {
  readonly #validator = new FounderWorkdayRecordValidator();

  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getById(workdayId: string): Promise<FounderWorkdayRecord | undefined> { assertActiveTransaction(this.scope); assertId(workdayId); const row = this.database.prepare("SELECT record_json FROM founder_workdays WHERE workday_id = ?").get(workdayId); return Promise.resolve(row === undefined ? undefined : this.#decode(row)); }

  public insert(record: FounderWorkdayRecord): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#validate(record);
    if (checked.version !== 0) throw new RepositoryValidationError("New Founder workday must start at version zero");
    try { this.database.prepare("INSERT INTO founder_workdays (workday_id, workspace_id, actor_id, status, version, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(checked.workdayId, checked.workspaceId, checked.actorId, checked.status, checked.version, checked.updatedAt, JSON.stringify(checked)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Founder workday already exists"); throw new SqliteRepositoryError("Founder workday write failed", "founder_workday.insert"); }
    return Promise.resolve();
  }

  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly FounderWorkdayRecord[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertLimit(limit); const rows = this.database.prepare("SELECT record_json FROM founder_workdays WHERE workspace_id = ? ORDER BY updated_at DESC, workday_id ASC LIMIT ?").all(workspaceId, limit); return Promise.resolve(Object.freeze(rows.map((row) => this.#decode(row)))); }

  public update(record: FounderWorkdayRecord, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#validate(record); const current = this.#select(checked.workdayId);
    if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.actorId !== checked.actorId || current.workspaceId !== checked.workspaceId || current.workdayId !== checked.workdayId || current.createdAt !== checked.createdAt) throw new RepositoryConflictError("Founder workday transition is invalid");
    const result = this.database.prepare("UPDATE founder_workdays SET status = ?, version = ?, updated_at = ?, record_json = ? WHERE workday_id = ? AND version = ?").run(checked.status, checked.version, checked.updatedAt, JSON.stringify(checked), checked.workdayId, expectation.version);
    if (result.changes !== 1) throw new RepositoryConflictError("Founder workday changed during update");
    return Promise.resolve();
  }

  #select(workdayId: string): FounderWorkdayRecord | undefined { const row = this.database.prepare("SELECT record_json FROM founder_workdays WHERE workday_id = ?").get(workdayId); return row === undefined ? undefined : this.#decode(row); }
  #decode(row: Readonly<Record<string, unknown>>): FounderWorkdayRecord { if (typeof row.record_json !== "string") throw new RepositoryValidationError("Founder workday is corrupted"); try { return this.#validate(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Founder workday is corrupted"); } }
  #validate(value: unknown): FounderWorkdayRecord { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Founder workday is invalid", { issueCount: checked.issues.length }); return checked.value; }
}

function assertId(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError("Founder workday identifier is invalid"); }
function assertLimit(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Founder workday list limit is invalid"); }
