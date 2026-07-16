import type { DatabaseSync } from "node:sqlite";

import type { BusinessMissionDossier } from "../../business/business-mission.js";
import type { BusinessMissionRepository } from "../../business/business-mission-repository.js";
import { BusinessMissionDossierValidator } from "../../business/business-mission-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteBusinessMissionRepository implements BusinessMissionRepository {
  readonly #validator = new BusinessMissionDossierValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public getById(missionId: string): Promise<BusinessMissionDossier | undefined> {
    assertActiveTransaction(this.scope); assertId(missionId);
    const row = this.database.prepare("SELECT record_json FROM business_mission_dossiers WHERE mission_id = ?").get(missionId);
    return Promise.resolve(row === undefined ? undefined : this.#decode(row));
  }

  public insert(record: BusinessMissionDossier): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#checked(record);
    if (checked.version !== 0) throw new RepositoryValidationError("A new Business Mission dossier must start at version zero");
    try {
      this.database.prepare("INSERT INTO business_mission_dossiers (mission_id, workspace_id, actor_id, status, version, selected_opportunity_id, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.mission.missionId, checked.workspaceId, checked.actorId, checked.status, checked.version, checked.selectedOpportunityId ?? null, checked.updatedAt, JSON.stringify(checked));
    } catch (error) {
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Business Mission dossier already exists", { missionId: checked.mission.missionId });
      throw new SqliteRepositoryError("Business Mission dossier write failed", "business_mission.insert");
    }
    return Promise.resolve();
  }

  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly BusinessMissionDossier[]> {
    assertActiveTransaction(this.scope); assertId(workspaceId); assertLimit(limit);
    const rows = this.database.prepare("SELECT record_json FROM business_mission_dossiers WHERE workspace_id = ? ORDER BY CASE status WHEN 'PENDING_FABIO_APPROVAL' THEN 0 WHEN 'REVISION_REQUESTED' THEN 1 WHEN 'BLOCKED' THEN 2 ELSE 3 END, updated_at DESC, mission_id ASC LIMIT ?").all(workspaceId, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decode(row))));
  }

  public update(record: BusinessMissionDossier, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#checked(record);
    const current = this.#select(checked.mission.missionId);
    if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || !sameImmutableIdentity(current, checked) || !transitionAllowed(current.status, checked.status)) throw new RepositoryConflictError("Business Mission dossier transition is invalid");
    const result = this.database.prepare("UPDATE business_mission_dossiers SET status = ?, version = ?, selected_opportunity_id = ?, updated_at = ?, record_json = ? WHERE mission_id = ? AND version = ?").run(checked.status, checked.version, checked.selectedOpportunityId ?? null, checked.updatedAt, JSON.stringify(checked), checked.mission.missionId, expectation.version);
    if (result.changes !== 1) throw new RepositoryConflictError("Business Mission dossier changed during update");
    return Promise.resolve();
  }

  #select(missionId: string): BusinessMissionDossier | undefined { const row = this.database.prepare("SELECT record_json FROM business_mission_dossiers WHERE mission_id = ?").get(missionId); return row === undefined ? undefined : this.#decode(row); }
  #decode(row: Record<string, unknown>): BusinessMissionDossier { if (typeof row.record_json !== "string") throw new RepositoryValidationError("Business Mission dossier is corrupted"); try { return this.#checked(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Business Mission dossier is corrupted"); } }
  #checked(value: unknown): BusinessMissionDossier { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Business Mission dossier is invalid", { issueCount: result.issues.length }); return result.value; }
}

function transitionAllowed(from: BusinessMissionDossier["status"], to: BusinessMissionDossier["status"]): boolean { return from === "PENDING_FABIO_APPROVAL" && ["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(to); }
function sameImmutableIdentity(left: BusinessMissionDossier, right: BusinessMissionDossier): boolean { return left.actorId === right.actorId && left.createdAt === right.createdAt && left.fingerprint === right.fingerprint && left.mission.missionId === right.mission.missionId && left.workspaceId === right.workspaceId; }
function assertId(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[a-zA-Z0-9@._:-]{1,128}$/u.test(value)) throw new RepositoryValidationError("Business Mission identifier is invalid"); }
function assertLimit(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Business Mission list limit is invalid"); }
