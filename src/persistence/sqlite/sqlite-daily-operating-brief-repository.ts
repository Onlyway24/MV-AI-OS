import type { DatabaseSync } from "node:sqlite";

import type { DailyOperatingBriefRepository } from "../../daily-brief/daily-operating-brief-repository.js";
import type { DailyOperatingBriefRecord } from "../../daily-brief/daily-operating-brief.js";
import { DailyOperatingBriefRecordValidator } from "../../daily-brief/daily-operating-brief-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteDailyOperatingBriefRepository implements DailyOperatingBriefRepository {
  readonly #validator = new DailyOperatingBriefRecordValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getByBusinessDate(workspaceId: string, businessDate: string): Promise<DailyOperatingBriefRecord | undefined> { assertActiveTransaction(this.scope); assertId(workspaceId); assertDate(businessDate); const row = this.database.prepare("SELECT record_json FROM daily_operating_briefs WHERE workspace_id = ? AND business_date = ? ORDER BY version DESC LIMIT 1").get(workspaceId, businessDate); return Promise.resolve(row === undefined ? undefined : this.#decode(row)); }
  public getById(briefId: string): Promise<DailyOperatingBriefRecord | undefined> { assertActiveTransaction(this.scope); assertId(briefId); const row = this.database.prepare("SELECT record_json FROM daily_operating_briefs WHERE brief_id = ?").get(briefId); return Promise.resolve(row === undefined ? undefined : this.#decode(row)); }
  public insert(record: DailyOperatingBriefRecord): Promise<void> { assertActiveTransaction(this.scope); const checked = this.#validate(record); try { this.database.prepare("INSERT INTO daily_operating_briefs (brief_id, workspace_id, actor_id, business_date, version, generated_at, fingerprint, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.briefId, checked.workspaceId, checked.actorId, checked.businessDate, checked.version, checked.generatedAt, checked.fingerprint, JSON.stringify(checked)); } catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Daily Operating Brief already exists"); throw new SqliteRepositoryError("Daily Operating Brief write failed", "daily_operating_brief.insert"); } return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly DailyOperatingBriefRecord[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertLimit(limit); const rows = this.database.prepare("SELECT record_json FROM daily_operating_briefs WHERE workspace_id = ? ORDER BY business_date DESC, version DESC, brief_id ASC LIMIT ?").all(workspaceId, limit); return Promise.resolve(Object.freeze(rows.map((row) => this.#decode(row)))); }
  #decode(row: Readonly<Record<string, unknown>>): DailyOperatingBriefRecord { if (typeof row.record_json !== "string") throw new RepositoryValidationError("Daily Operating Brief is corrupted"); try { return this.#validate(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Daily Operating Brief is corrupted"); } }
  #validate(value: unknown): DailyOperatingBriefRecord { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Daily Operating Brief is invalid", { issueCount: checked.issues.length }); return checked.value; }
}

function assertId(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError("Daily Operating Brief identifier is invalid"); }
function assertDate(value: unknown): asserts value is string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new RepositoryValidationError("Daily Operating Brief business date is invalid"); }
function assertLimit(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Daily Operating Brief list limit is invalid"); }
