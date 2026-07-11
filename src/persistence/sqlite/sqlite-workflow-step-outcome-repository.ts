import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { WorkflowStepOutcomeReceipt } from "../../workflows/runtime/workflow-step-outcome.js";
import { WorkflowStepOutcomeReceiptValidator } from "../../workflows/runtime/workflow-step-outcome.js";
import type { WorkflowStepOutcomeRepository } from "../../workflows/runtime/workflow-persistence.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteWorkflowStepOutcomeRepository implements WorkflowStepOutcomeRepository {
  readonly #validator = new WorkflowStepOutcomeReceiptValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}
  public getById(outcomeId: string): Promise<WorkflowStepOutcomeReceipt | undefined> { assertActiveTransaction(this.scope); return Promise.resolve(this.#read("outcome_id", outcomeId)); }
  public getByInvocationId(invocationId: string): Promise<WorkflowStepOutcomeReceipt | undefined> { assertActiveTransaction(this.scope); return Promise.resolve(this.#read("invocation_id", invocationId)); }
  public insert(receipt: WorkflowStepOutcomeReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    try { this.database.prepare("INSERT INTO workflow_step_outcomes (outcome_id, invocation_id, fingerprint, instance_id, step_id, decision, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(value.outcomeId, value.invocationId, value.fingerprint, value.instanceId, value.stepId, value.decision, JSON.stringify(value)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Workflow Step outcome already exists"); throw new SqliteRepositoryError("Workflow Step outcome write failed", "workflow_step_outcome.write"); }
    return Promise.resolve();
  }
  #read(column: "outcome_id" | "invocation_id", value: string): WorkflowStepOutcomeReceipt | undefined { const row = this.database.prepare(`SELECT record_json FROM workflow_step_outcomes WHERE ${column} = ?`).get(value); if (row === undefined) return undefined; if (typeof row.record_json !== "string") throw new RepositoryValidationError("Workflow Step outcome is corrupted"); try { return this.#validate(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Workflow Step outcome is corrupted"); } }
  #validate(value: unknown): WorkflowStepOutcomeReceipt { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Workflow Step outcome failed validation", { issueCount: result.issues.length }); return result.value; }
}
