import type { DatabaseSync } from "node:sqlite";

import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { WorkflowStepOutcomeReceipt } from "../../workflows/runtime/workflow-step-outcome.js";
import { WorkflowStepOutcomeReceiptValidator } from "../../workflows/runtime/workflow-step-outcome.js";
import type { WorkflowStepOutcomeRepository } from "../../workflows/runtime/workflow-persistence.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
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

const OUTCOME_COLUMNS =
  "outcome_id, invocation_id, fingerprint, instance_id, step_id, decision, record_json";

export class SqliteWorkflowStepOutcomeRepository
  implements WorkflowStepOutcomeRepository
{
  readonly #validator = new WorkflowStepOutcomeReceiptValidator();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly scope: SqliteTransactionScope,
  ) {}

  public getById(
    outcomeId: string,
  ): Promise<WorkflowStepOutcomeReceipt | undefined> {
    assertActiveTransaction(this.scope);
    return Promise.resolve(this.#read("outcome_id", outcomeId));
  }

  public getByInvocationId(
    invocationId: string,
  ): Promise<WorkflowStepOutcomeReceipt | undefined> {
    assertActiveTransaction(this.scope);
    return Promise.resolve(this.#read("invocation_id", invocationId));
  }

  public insert(receipt: WorkflowStepOutcomeReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    const json = stringifySqliteRecordJson(value, "Workflow Step outcome");
    try {
      this.database
        .prepare(
          "INSERT INTO workflow_step_outcomes (outcome_id, invocation_id, fingerprint, instance_id, step_id, decision, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          value.outcomeId,
          value.invocationId,
          value.fingerprint,
          value.instanceId,
          value.stepId,
          value.decision,
          json,
        );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new RepositoryConflictError(
          "Workflow Step outcome already exists",
        );
      }
      throw new SqliteRepositoryError(
        "Workflow Step outcome write failed",
        "workflow_step_outcome.write",
      );
    }
    return Promise.resolve();
  }

  #read(
    column: "outcome_id" | "invocation_id",
    value: string,
  ): WorkflowStepOutcomeReceipt | undefined {
    const row = this.database
      .prepare(
        `SELECT ${OUTCOME_COLUMNS} FROM workflow_step_outcomes WHERE ${column} = ?`,
      )
      .get(value);
    if (row === undefined) {
      return undefined;
    }
    const receipt = this.#validate(
      parseSqliteRecordJson(
        readTextColumn(row, "record_json"),
        "Workflow Step outcome",
      ),
    );
    if (
      readTextColumn(row, "outcome_id") !== receipt.outcomeId ||
      readTextColumn(row, "invocation_id") !== receipt.invocationId ||
      readTextColumn(row, "fingerprint") !== receipt.fingerprint ||
      readTextColumn(row, "instance_id") !== receipt.instanceId ||
      readTextColumn(row, "step_id") !== receipt.stepId ||
      readTextColumn(row, "decision") !== receipt.decision ||
      (column === "outcome_id"
        ? receipt.outcomeId !== value
        : receipt.invocationId !== value)
    ) {
      throw new RepositoryValidationError(
        "Workflow Step outcome columns do not match the stored record",
      );
    }
    return receipt;
  }

  #validate(value: unknown): WorkflowStepOutcomeReceipt {
    const result = this.#validator.validate(value);
    if (!result.ok) {
      throw new RepositoryValidationError(
        "Workflow Step outcome failed validation",
        { issueCount: result.issues.length },
      );
    }
    return result.value;
  }
}
