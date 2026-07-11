import type { DatabaseSync } from "node:sqlite";

import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { WorkflowAgentInvocationEvent, WorkflowAgentInvocationReceipt } from "../../workflows/runtime/workflow-agent-invocation.js";
import { WorkflowAgentInvocationEventValidator, WorkflowAgentInvocationReceiptValidator } from "../../workflows/runtime/workflow-agent-invocation.js";
import type { WorkflowAgentInvocationEventRepository, WorkflowAgentInvocationRepository } from "../../workflows/runtime/workflow-persistence.js";
import { isSqliteConstraintError, SqliteRepositoryError, withSqliteErrors } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteWorkflowAgentInvocationRepository implements WorkflowAgentInvocationRepository {
  readonly #validator = new WorkflowAgentInvocationReceiptValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}
  public getById(invocationId: string): Promise<WorkflowAgentInvocationReceipt | undefined> {
    assertActiveTransaction(this.scope);
    return Promise.resolve(withSqliteErrors("workflow_agent_invocation.get", () => {
      const row = this.database.prepare("SELECT record_json FROM workflow_agent_invocations WHERE invocation_id = ?").get(invocationId);
      return row === undefined ? undefined : this.#decode(row.record_json);
    }));
  }
  public listByInstanceId(instanceId: string, limit: number): Promise<readonly WorkflowAgentInvocationReceipt[]> {
    assertActiveTransaction(this.scope);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Workflow invocation list limit is invalid");
    const rows = this.database.prepare("SELECT record_json FROM workflow_agent_invocations WHERE instance_id = ? ORDER BY rowid DESC LIMIT ?").all(instanceId, limit);
    return Promise.resolve(Object.freeze(rows.map((row) => this.#decode(row.record_json))));
  }
  public insert(receipt: WorkflowAgentInvocationReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    try {
      this.database.prepare("INSERT INTO workflow_agent_invocations (invocation_id, fingerprint, instance_id, step_id, status, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(value.invocationId, value.fingerprint, value.instanceId, value.stepId, value.status, JSON.stringify(value));
    } catch (error) { this.#constraint(error, "Workflow agent invocation already exists"); }
    return Promise.resolve();
  }
  public update(receipt: WorkflowAgentInvocationReceipt, expectedStatus: "RESERVED"): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(receipt);
    const result = this.database.prepare("UPDATE workflow_agent_invocations SET status = ?, record_json = ? WHERE invocation_id = ? AND fingerprint = ? AND status = ?").run(value.status, JSON.stringify(value), value.invocationId, value.fingerprint, expectedStatus);
    if (result.changes !== 1) throw new RepositoryConflictError("Workflow agent invocation outcome conflicts with durable state", { invocationId: value.invocationId });
    return Promise.resolve();
  }
  #validate(value: unknown): WorkflowAgentInvocationReceipt { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Workflow agent invocation record is invalid", { issueCount: result.issues.length }); return result.value; }
  #decode(value: unknown): WorkflowAgentInvocationReceipt { if (typeof value !== "string") throw new RepositoryValidationError("Workflow agent invocation record is corrupted"); try { return this.#validate(JSON.parse(value)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Workflow agent invocation record is corrupted"); } }
  #constraint(error: unknown, message: string): never { if (isSqliteConstraintError(error)) throw new RepositoryConflictError(message); throw new SqliteRepositoryError(message, "workflow_agent_invocation.write"); }
}

export class SqliteWorkflowAgentInvocationEventRepository implements WorkflowAgentInvocationEventRepository {
  readonly #validator = new WorkflowAgentInvocationEventValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}
  public append(event: WorkflowAgentInvocationEvent): Promise<void> {
    assertActiveTransaction(this.scope);
    const value = this.#validate(event);
    try { this.database.prepare("INSERT INTO workflow_agent_invocation_events (event_id, invocation_id, instance_id, status, occurred_at, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(value.eventId, value.invocationId, value.instanceId, value.status, value.occurredAt, JSON.stringify(value)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Workflow agent invocation event already exists"); throw new SqliteRepositoryError("Workflow agent invocation event write failed", "workflow_agent_invocation_event.write"); }
    return Promise.resolve();
  }
  public listByInvocationId(invocationId: string): Promise<readonly WorkflowAgentInvocationEvent[]> {
    assertActiveTransaction(this.scope);
    const rows = this.database.prepare("SELECT record_json FROM workflow_agent_invocation_events WHERE invocation_id = ? ORDER BY sequence ASC").all(invocationId);
    return Promise.resolve(Object.freeze(rows.map((row) => { if (typeof row.record_json !== "string") throw new RepositoryValidationError("Workflow agent invocation event is corrupted"); try { return this.#validate(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Workflow agent invocation event is corrupted"); } })));
  }
  #validate(value: unknown): WorkflowAgentInvocationEvent { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Workflow agent invocation event is invalid", { issueCount: result.issues.length }); return result.value; }
}
