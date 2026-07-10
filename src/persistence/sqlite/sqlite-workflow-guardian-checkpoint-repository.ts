import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { WorkflowGuardianCheckpoint } from "../../workflows/runtime/workflow-control-checkpoint.js";
import type { WorkflowGuardianCheckpointRepository } from "../../workflows/runtime/workflow-persistence.js";
import { isSqliteConstraintError, SqliteRepositoryError, withSqliteErrors } from "./sqlite-error.js";
import { readIntegerColumn, readNullableTextColumn, readTextColumn, SqliteRecordCodec } from "./sqlite-record-codec.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";
import { assertSqliteWorkflowCheckpointSnapshot } from "./sqlite-workflow-checkpoint-snapshot.js";

export class SqliteWorkflowGuardianCheckpointRepository
  implements WorkflowGuardianCheckpointRepository
{
  readonly #codec: SqliteRecordCodec;
  readonly #database: DatabaseSync;
  readonly #scope: SqliteTransactionScope;

  public constructor(
    database: DatabaseSync,
    scope: SqliteTransactionScope,
    codec: SqliteRecordCodec,
  ) {
    this.#database = database;
    this.#scope = scope;
    this.#codec = codec;
  }

  public getById(evidenceId: string): Promise<WorkflowGuardianCheckpoint | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(withSqliteErrors("workflow_guardian_checkpoint.get", () => {
      const row = this.#select(evidenceId);
      return row === undefined ? undefined : this.#decode(row);
    }));
  }

  public insert(checkpoint: WorkflowGuardianCheckpoint): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeWorkflowGuardianCheckpoint(checkpoint);
    withSqliteErrors("workflow_guardian_checkpoint.insert", () => {
      assertSqliteWorkflowCheckpointSnapshot(this.#database, this.#codec, encoded.value);
      if (this.#select(encoded.value.evidenceId) !== undefined) {
        throw new RepositoryConflictError("Workflow Guardian checkpoint ID already exists", {
          evidenceId: encoded.value.evidenceId,
        });
      }
      try {
        this.#database.prepare(
          "INSERT INTO workflow_guardian_checkpoints (evidence_id, definition_id, workflow_version, instance_id, instance_version, step_id, domain, guardian_id, status, supersedes_evidence_id, recorded_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          encoded.value.evidenceId,
          encoded.value.definitionId,
          encoded.value.workflowVersion,
          encoded.value.instanceId,
          encoded.value.instanceVersion,
          encoded.value.stepId,
          encoded.value.domain,
          encoded.value.guardianId,
          encoded.value.status,
          encoded.value.supersedesEvidenceId ?? null,
          encoded.value.recordedAt,
          encoded.json,
        );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RepositoryConflictError("Workflow Guardian checkpoint identity is invalid", {
            evidenceId: encoded.value.evidenceId,
          });
        }
        throw new SqliteRepositoryError(
          "SQLite workflow Guardian checkpoint insertion failed",
          "workflow_guardian_checkpoint.insert",
        );
      }
    });
    return Promise.resolve();
  }

  public listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowGuardianCheckpoint[]> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(withSqliteErrors("workflow_guardian_checkpoint.list", () => {
      const rows = this.#database.prepare(
        "SELECT sequence, evidence_id, definition_id, workflow_version, instance_id, instance_version, step_id, domain, guardian_id, status, supersedes_evidence_id, recorded_at, record_json FROM workflow_guardian_checkpoints WHERE instance_id = ? AND instance_version = ? AND step_id = ? ORDER BY sequence ASC",
      ).all(instanceId, instanceVersion, stepId);
      return Object.freeze(rows.map((row) => this.#decode(row)));
    }));
  }

  #select(evidenceId: string): Readonly<Record<string, unknown>> | undefined {
    return this.#database.prepare(
      "SELECT sequence, evidence_id, definition_id, workflow_version, instance_id, instance_version, step_id, domain, guardian_id, status, supersedes_evidence_id, recorded_at, record_json FROM workflow_guardian_checkpoints WHERE evidence_id = ?",
    ).get(evidenceId);
  }

  #decode(row: Readonly<Record<string, unknown>>): WorkflowGuardianCheckpoint {
    const checkpoint = this.#codec.decodeWorkflowGuardianCheckpoint(
      readTextColumn(row, "record_json"),
    );
    readIntegerColumn(row, "sequence");
    if (
      readTextColumn(row, "evidence_id") !== checkpoint.evidenceId ||
      readTextColumn(row, "definition_id") !== checkpoint.definitionId ||
      readTextColumn(row, "workflow_version") !== checkpoint.workflowVersion ||
      readTextColumn(row, "instance_id") !== checkpoint.instanceId ||
      readIntegerColumn(row, "instance_version") !== checkpoint.instanceVersion ||
      readTextColumn(row, "step_id") !== checkpoint.stepId ||
      readTextColumn(row, "domain") !== checkpoint.domain ||
      readTextColumn(row, "guardian_id") !== checkpoint.guardianId ||
      readTextColumn(row, "status") !== checkpoint.status ||
      readNullableTextColumn(row, "supersedes_evidence_id") !== checkpoint.supersedesEvidenceId ||
      readTextColumn(row, "recorded_at") !== checkpoint.recordedAt
    ) {
      throw new RepositoryValidationError(
        "SQLite workflow Guardian checkpoint columns do not match the record",
        { evidenceId: checkpoint.evidenceId },
      );
    }
    return checkpoint;
  }
}
