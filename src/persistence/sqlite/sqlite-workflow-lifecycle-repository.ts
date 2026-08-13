import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type {
  WorkflowLifecycleEvent,
  WorkflowLifecycleRecord,
} from "../../workflows/runtime/workflow-lifecycle.js";
import {
  WorkflowLifecycleEventValidator,
  WorkflowLifecycleRecordValidator,
} from "../../workflows/runtime/workflow-lifecycle.js";
import type {
  WorkflowLifecycleEventRepository,
  WorkflowLifecycleRecordRepository,
} from "../../workflows/runtime/workflow-persistence.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
} from "./sqlite-error.js";
import {
  parseSqliteRecordJson,
  readIntegerColumn,
  readTextColumn,
  stringifySqliteRecordJson,
} from "./sqlite-record-codec.js";
import {
  assertActiveTransaction,
  type SqliteTransactionScope,
} from "./sqlite-transaction-scope.js";

export const WORKFLOW_LIFECYCLE_RECORD_COLUMNS =
  "record_id, fingerprint, kind, instance_id, instance_version, step_id, recorded_at, record_json";
const WORKFLOW_LIFECYCLE_EVENT_COLUMNS =
  "event_id, record_id, instance_id, occurred_at, record_json";

export class SqliteWorkflowLifecycleRecordRepository
  implements WorkflowLifecycleRecordRepository
{
  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public getById(
    recordId: string,
  ): Promise<WorkflowLifecycleRecord | undefined> {
    assertActiveTransaction(this.scope);
    const row = this.database
      .prepare(
        `SELECT ${WORKFLOW_LIFECYCLE_RECORD_COLUMNS} FROM workflow_lifecycle_records WHERE record_id = ?`,
      )
      .get(recordId);
    return Promise.resolve(
      row === undefined
        ? undefined
        : decodeWorkflowLifecycleRecordRow(row, { recordId }),
    );
  }

  public insert(record: WorkflowLifecycleRecord): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(record);
    const json = stringifySqliteRecordJson(
      value,
      "Workflow lifecycle record",
    );
    try {
      this.database
        .prepare(
          "INSERT INTO workflow_lifecycle_records (record_id, fingerprint, kind, instance_id, instance_version, step_id, recorded_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          value.recordId,
          value.fingerprint,
          value.kind,
          value.instanceId,
          value.instanceVersion,
          value.stepId,
          value.recordedAt,
          json,
        );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new RepositoryConflictError(
          "Workflow lifecycle record already exists",
        );
      }
      throw new SqliteRepositoryError(
        "Workflow lifecycle record write failed",
        "workflow_lifecycle_record.write",
      );
    }
    return Promise.resolve();
  }

  public listByStep(
    instanceId: string,
    stepId: string,
    limit?: number,
  ): Promise<readonly WorkflowLifecycleRecord[]> {
    assertActiveTransaction(this.scope);
    if (
      limit !== undefined &&
      (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    ) {
      throw new RepositoryValidationError(
        "Workflow lifecycle list limit is invalid",
      );
    }
    const rows =
      limit === undefined
        ? this.database
            .prepare(
              `SELECT ${WORKFLOW_LIFECYCLE_RECORD_COLUMNS} FROM workflow_lifecycle_records WHERE instance_id = ? AND step_id = ? ORDER BY sequence ASC`,
            )
            .all(instanceId, stepId)
        : this.database
            .prepare(
              `SELECT ${WORKFLOW_LIFECYCLE_RECORD_COLUMNS} FROM (SELECT sequence, ${WORKFLOW_LIFECYCLE_RECORD_COLUMNS} FROM workflow_lifecycle_records WHERE instance_id = ? AND step_id = ? ORDER BY sequence DESC LIMIT ?) ORDER BY sequence ASC`,
            )
            .all(instanceId, stepId, limit);
    return Promise.resolve(
      Object.freeze(
        rows.map((row) =>
          decodeWorkflowLifecycleRecordRow(row, { instanceId, stepId }),
        ),
      ),
    );
  }

  #validate(value: unknown): WorkflowLifecycleRecord {
    return validateWorkflowLifecycleRecord(value);
  }
}

export class SqliteWorkflowLifecycleEventRepository
  implements WorkflowLifecycleEventRepository
{
  readonly #validator = new WorkflowLifecycleEventValidator();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public append(event: WorkflowLifecycleEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(event);
    const json = stringifySqliteRecordJson(
      value,
      "Workflow lifecycle event",
    );
    try {
      this.database
        .prepare(
          "INSERT INTO workflow_lifecycle_events (event_id, record_id, instance_id, occurred_at, record_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          value.eventId,
          value.recordId,
          value.instanceId,
          value.occurredAt,
          json,
        );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new RepositoryConflictError(
          "Workflow lifecycle event already exists",
        );
      }
      throw new SqliteRepositoryError(
        "Workflow lifecycle event write failed",
        "workflow_lifecycle_event.write",
      );
    }
    return Promise.resolve();
  }

  public listByRecordId(
    recordId: string,
  ): Promise<readonly WorkflowLifecycleEvent[]> {
    assertActiveTransaction(this.scope);
    const rows = this.database
      .prepare(
        `SELECT ${WORKFLOW_LIFECYCLE_EVENT_COLUMNS} FROM workflow_lifecycle_events WHERE record_id = ? ORDER BY sequence ASC`,
      )
      .all(recordId);
    return Promise.resolve(
      Object.freeze(rows.map((row) => this.#decodeRow(row, recordId))),
    );
  }

  #validate(value: unknown): WorkflowLifecycleEvent {
    const result = this.#validator.validate(value);
    if (!result.ok) {
      throw new RepositoryValidationError(
        "Workflow lifecycle event failed validation",
        { issueCount: result.issues.length },
      );
    }
    return result.value;
  }

  #decodeRow(
    row: Readonly<Record<string, unknown>>,
    expectedRecordId: string,
  ): WorkflowLifecycleEvent {
    const event = this.#validate(
      parseSqliteRecordJson(
        readTextColumn(row, "record_json"),
        "Workflow lifecycle event",
      ),
    );
    if (
      readTextColumn(row, "event_id") !== event.eventId ||
      readTextColumn(row, "record_id") !== event.recordId ||
      readTextColumn(row, "instance_id") !== event.instanceId ||
      readTextColumn(row, "occurred_at") !== event.occurredAt ||
      event.recordId !== expectedRecordId
    ) {
      throw new RepositoryValidationError(
        "Workflow lifecycle event columns do not match the stored record",
      );
    }
    return event;
  }
}

export function decodeWorkflowLifecycleRecordRow(
  row: Readonly<Record<string, unknown>>,
  expected: {
    readonly instanceId?: string;
    readonly recordId?: string;
    readonly stepId?: string;
  } = {},
): WorkflowLifecycleRecord {
  const record = validateWorkflowLifecycleRecord(
    parseSqliteRecordJson(
      readTextColumn(row, "record_json"),
      "Workflow lifecycle record",
    ),
  );
  if (
    readTextColumn(row, "record_id") !== record.recordId ||
    readTextColumn(row, "fingerprint") !== record.fingerprint ||
    readTextColumn(row, "kind") !== record.kind ||
    readTextColumn(row, "instance_id") !== record.instanceId ||
    readIntegerColumn(row, "instance_version") !== record.instanceVersion ||
    readTextColumn(row, "step_id") !== record.stepId ||
    readTextColumn(row, "recorded_at") !== record.recordedAt ||
    (expected.recordId !== undefined && record.recordId !== expected.recordId) ||
    (expected.instanceId !== undefined &&
      record.instanceId !== expected.instanceId) ||
    (expected.stepId !== undefined && record.stepId !== expected.stepId)
  ) {
    throw new RepositoryValidationError(
      "Workflow lifecycle columns do not match the stored record",
    );
  }
  return record;
}

function validateWorkflowLifecycleRecord(
  value: unknown,
): WorkflowLifecycleRecord {
  const result = new WorkflowLifecycleRecordValidator().validate(value);
  if (!result.ok) {
    throw new RepositoryValidationError(
      "Workflow lifecycle record failed validation",
      { issueCount: result.issues.length },
    );
  }
  return result.value;
}
