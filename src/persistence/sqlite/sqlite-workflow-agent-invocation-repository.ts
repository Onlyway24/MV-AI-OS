import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type {
  WorkflowAgentInvocationEvent,
  WorkflowAgentInvocationReceipt,
} from "../../workflows/runtime/workflow-agent-invocation.js";
import {
  WorkflowAgentInvocationEventValidator,
  WorkflowAgentInvocationReceiptValidator,
} from "../../workflows/runtime/workflow-agent-invocation.js";
import type {
  WorkflowAgentInvocationEventRepository,
  WorkflowAgentInvocationRepository,
} from "../../workflows/runtime/workflow-persistence.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import {
  parseSqliteRecordJson,
  readTextColumn,
  stringifySqliteRecordJson,
} from "./sqlite-record-codec.js";
import {
  assertActiveTransaction,
  type SqliteTransactionScope,
} from "./sqlite-transaction-scope.js";

const INVOCATION_COLUMNS =
  "invocation_id, fingerprint, instance_id, step_id, status, record_json";
const INVOCATION_EVENT_COLUMNS =
  "event_id, invocation_id, instance_id, status, occurred_at, record_json";

export class SqliteWorkflowAgentInvocationRepository
  implements WorkflowAgentInvocationRepository
{
  readonly #validator = new WorkflowAgentInvocationReceiptValidator();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public getById(
    invocationId: string,
  ): Promise<WorkflowAgentInvocationReceipt | undefined> {
    assertActiveTransaction(this.scope);
    return Promise.resolve(
      withSqliteErrors("workflow_agent_invocation.get", () => {
        const row = this.database
          .prepare(
            `SELECT ${INVOCATION_COLUMNS} FROM workflow_agent_invocations WHERE invocation_id = ?`,
          )
          .get(invocationId);
        return row === undefined
          ? undefined
          : this.#decodeRow(row, { invocationId });
      }),
    );
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowAgentInvocationReceipt[]> {
    assertActiveTransaction(this.scope);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError(
        "Workflow invocation list limit is invalid",
      );
    }
    const rows = this.database
      .prepare(
        `SELECT ${INVOCATION_COLUMNS} FROM workflow_agent_invocations WHERE instance_id = ? ORDER BY rowid DESC LIMIT ?`,
      )
      .all(instanceId, limit);
    return Promise.resolve(
      Object.freeze(
        rows.map((row) => this.#decodeRow(row, { instanceId })),
      ),
    );
  }

  public insert(receipt: WorkflowAgentInvocationReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    const json = stringifySqliteRecordJson(
      value,
      "Workflow agent invocation record",
    );
    try {
      this.database
        .prepare(
          "INSERT INTO workflow_agent_invocations (invocation_id, fingerprint, instance_id, step_id, status, record_json) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          value.invocationId,
          value.fingerprint,
          value.instanceId,
          value.stepId,
          value.status,
          json,
        );
    } catch (error) {
      this.#constraint(error, "Workflow agent invocation already exists");
    }
    return Promise.resolve();
  }

  public update(
    receipt: WorkflowAgentInvocationReceipt,
    expectedStatus: "RESERVED",
  ): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    const json = stringifySqliteRecordJson(
      value,
      "Workflow agent invocation record",
    );
    const result = this.database
      .prepare(
        "UPDATE workflow_agent_invocations SET status = ?, record_json = ? WHERE invocation_id = ? AND fingerprint = ? AND status = ?",
      )
      .run(
        value.status,
        json,
        value.invocationId,
        value.fingerprint,
        expectedStatus,
      );
    if (result.changes !== 1) {
      throw new RepositoryConflictError(
        "Workflow agent invocation outcome conflicts with durable state",
        { invocationId: value.invocationId },
      );
    }
    return Promise.resolve();
  }

  #validate(value: unknown): WorkflowAgentInvocationReceipt {
    const result = this.#validator.validate(value);
    if (!result.ok) {
      throw new RepositoryValidationError(
        "Workflow agent invocation record is invalid",
        { issueCount: result.issues.length },
      );
    }
    return result.value;
  }

  #decodeRow(
    row: Readonly<Record<string, unknown>>,
    expected: { readonly instanceId?: string; readonly invocationId?: string },
  ): WorkflowAgentInvocationReceipt {
    const receipt = this.#validate(
      parseSqliteRecordJson(
        readTextColumn(row, "record_json"),
        "Workflow agent invocation record",
      ),
    );
    if (
      readTextColumn(row, "invocation_id") !== receipt.invocationId ||
      readTextColumn(row, "fingerprint") !== receipt.fingerprint ||
      readTextColumn(row, "instance_id") !== receipt.instanceId ||
      readTextColumn(row, "step_id") !== receipt.stepId ||
      readTextColumn(row, "status") !== receipt.status ||
      (expected.invocationId !== undefined &&
        receipt.invocationId !== expected.invocationId) ||
      (expected.instanceId !== undefined &&
        receipt.instanceId !== expected.instanceId)
    ) {
      throw new RepositoryValidationError(
        "Workflow agent invocation columns do not match the stored record",
      );
    }
    return receipt;
  }

  #constraint(error: unknown, message: string): never {
    if (isSqliteConstraintError(error)) {
      throw new RepositoryConflictError(message);
    }
    throw new SqliteRepositoryError(
      message,
      "workflow_agent_invocation.write",
    );
  }
}

export class SqliteWorkflowAgentInvocationEventRepository
  implements WorkflowAgentInvocationEventRepository
{
  readonly #validator = new WorkflowAgentInvocationEventValidator();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public append(event: WorkflowAgentInvocationEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(event);
    const json = stringifySqliteRecordJson(
      value,
      "Workflow agent invocation event",
    );
    try {
      this.database
        .prepare(
          "INSERT INTO workflow_agent_invocation_events (event_id, invocation_id, instance_id, status, occurred_at, record_json) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          value.eventId,
          value.invocationId,
          value.instanceId,
          value.status,
          value.occurredAt,
          json,
        );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new RepositoryConflictError(
          "Workflow agent invocation event already exists",
        );
      }
      throw new SqliteRepositoryError(
        "Workflow agent invocation event write failed",
        "workflow_agent_invocation_event.write",
      );
    }
    return Promise.resolve();
  }

  public listByInvocationId(
    invocationId: string,
  ): Promise<readonly WorkflowAgentInvocationEvent[]> {
    assertActiveTransaction(this.scope);
    const rows = this.database
      .prepare(
        `SELECT ${INVOCATION_EVENT_COLUMNS} FROM workflow_agent_invocation_events WHERE invocation_id = ? ORDER BY sequence ASC`,
      )
      .all(invocationId);
    return Promise.resolve(
      Object.freeze(
        rows.map((row) => this.#decodeRow(row, invocationId)),
      ),
    );
  }

  #validate(value: unknown): WorkflowAgentInvocationEvent {
    const result = this.#validator.validate(value);
    if (!result.ok) {
      throw new RepositoryValidationError(
        "Workflow agent invocation event is invalid",
        { issueCount: result.issues.length },
      );
    }
    return result.value;
  }

  #decodeRow(
    row: Readonly<Record<string, unknown>>,
    expectedInvocationId: string,
  ): WorkflowAgentInvocationEvent {
    const event = this.#validate(
      parseSqliteRecordJson(
        readTextColumn(row, "record_json"),
        "Workflow agent invocation event",
      ),
    );
    if (
      readTextColumn(row, "event_id") !== event.eventId ||
      readTextColumn(row, "invocation_id") !== event.invocationId ||
      readTextColumn(row, "instance_id") !== event.instanceId ||
      readTextColumn(row, "status") !== event.status ||
      readTextColumn(row, "occurred_at") !== event.occurredAt ||
      event.invocationId !== expectedInvocationId
    ) {
      throw new RepositoryValidationError(
        "Workflow agent invocation event columns do not match the stored record",
      );
    }
    return event;
  }
}
