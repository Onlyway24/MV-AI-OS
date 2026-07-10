import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError } from "../../errors/core-error.js";
import type {
  WorkflowApprovalCheckpoint,
  WorkflowGuardianCheckpoint,
} from "../../workflows/runtime/workflow-control-checkpoint.js";
import { readTextColumn, SqliteRecordCodec } from "./sqlite-record-codec.js";

export function assertSqliteWorkflowCheckpointSnapshot(
  database: DatabaseSync,
  codec: SqliteRecordCodec,
  checkpoint: WorkflowApprovalCheckpoint | WorkflowGuardianCheckpoint,
): void {
  const instanceRow = database.prepare(
    "SELECT record_json FROM workflow_instances WHERE instance_id = ?",
  ).get(checkpoint.instanceId);
  if (instanceRow === undefined) {
    throw new RepositoryConflictError("Workflow instance does not exist", {
      instanceId: checkpoint.instanceId,
    });
  }
  const instance = codec.decodeWorkflowInstance(
    readTextColumn(instanceRow, "record_json"),
  );
  const definitionRow = database.prepare(
    "SELECT record_json FROM workflow_definitions WHERE definition_id = ?",
  ).get(instance.definitionId);
  if (definitionRow === undefined) {
    throw new RepositoryConflictError("Workflow definition does not exist", {
      definitionId: instance.definitionId,
    });
  }
  const definition = codec.decodeWorkflowDefinition(
    readTextColumn(definitionRow, "record_json"),
  );
  if (
    instance.version !== checkpoint.instanceVersion ||
    definition.definitionId !== checkpoint.definitionId ||
    definition.workflowVersion !== checkpoint.workflowVersion ||
    !definition.steps.some(({ stepId }) => stepId === checkpoint.stepId)
  ) {
    throw new RepositoryConflictError(
      "Workflow control checkpoint does not match the current snapshot",
      { evidenceId: checkpoint.evidenceId },
    );
  }
}
