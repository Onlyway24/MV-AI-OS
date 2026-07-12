import type { DatabaseSync } from "node:sqlite";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { LocalWorkflowCommandReceipt, LocalWorkflowCommandRepository, LocalWorkflowOwnership } from "../../runtime/local-workflow-command-repository.js";
import { LocalWorkflowCommandResponseValidator } from "../../runtime/local-workflow-command.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteLocalWorkflowCommandRepository implements LocalWorkflowCommandRepository {
  readonly #responseValidator = new LocalWorkflowCommandResponseValidator();
  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}
  public getById(commandId: string): Promise<LocalWorkflowCommandReceipt | undefined> {
    assertActiveTransaction(this.scope);
    assertId(commandId, "command ID");
    const row = this.database.prepare("SELECT fingerprint, operation, response_json FROM local_workflow_commands WHERE command_id = ?").get(commandId);
    if (row === undefined) return Promise.resolve(undefined);
    if (typeof row.fingerprint !== "string" || !fingerprint(row.fingerprint) || typeof row.operation !== "string" || typeof row.response_json !== "string") throw new RepositoryValidationError("Local Workflow command receipt is corrupted");
    const response = this.#decodeResponse(row.response_json);
    if (response.commandId !== commandId || response.operation !== row.operation) throw new RepositoryValidationError("Local Workflow command receipt columns do not match the stored response");
    return Promise.resolve(Object.freeze({ commandId, fingerprint: row.fingerprint, response }));
  }
  public insert(receipt: LocalWorkflowCommandReceipt): Promise<void> {
    assertActiveTransaction(this.scope);
    assertId(receipt.commandId, "command ID");
    if (!fingerprint(receipt.fingerprint)) throw new RepositoryValidationError("Local Workflow command receipt is invalid");
    const response = this.#validateResponse(receipt.response);
    if (response.commandId !== receipt.commandId) throw new RepositoryValidationError("Local Workflow command receipt response does not match the command ID");
    try { this.database.prepare("INSERT INTO local_workflow_commands (command_id, fingerprint, operation, response_json) VALUES (?, ?, ?, ?)").run(receipt.commandId, receipt.fingerprint, response.operation, JSON.stringify(response)); } catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Local Workflow command ID already exists"); throw new SqliteRepositoryError("Local Workflow command receipt write failed", "local_workflow_command.write"); }
    return Promise.resolve();
  }
  public getOwnership(instanceId: string): Promise<LocalWorkflowOwnership | undefined> {
    assertActiveTransaction(this.scope);
    assertId(instanceId, "instance ID");
    const row = this.database.prepare("SELECT workspace_id, actor_id FROM local_workflow_ownership WHERE instance_id = ?").get(instanceId);
    if (row === undefined) return Promise.resolve(undefined);
    if (!safeId(row.workspace_id) || !safeId(row.actor_id)) throw new RepositoryValidationError("Local Workflow ownership is corrupted");
    return Promise.resolve(Object.freeze({ actorId: row.actor_id, instanceId, workspaceId: row.workspace_id }));
  }
  public insertOwnership(ownership: LocalWorkflowOwnership): Promise<void> {
    assertActiveTransaction(this.scope);
    assertId(ownership.instanceId, "instance ID");
    assertId(ownership.workspaceId, "workspace ID");
    assertId(ownership.actorId, "actor ID");
    try { this.database.prepare("INSERT INTO local_workflow_ownership (instance_id, workspace_id, actor_id) VALUES (?, ?, ?)").run(ownership.instanceId, ownership.workspaceId, ownership.actorId); } catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Local Workflow ownership already exists"); throw new SqliteRepositoryError("Local Workflow ownership write failed", "local_workflow_ownership.write"); }
    return Promise.resolve();
  }
  #decodeResponse(serialized: string): LocalWorkflowCommandReceipt["response"] { try { return this.#validateResponse(JSON.parse(serialized)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError("Local Workflow command receipt is corrupted"); } }
  #validateResponse(value: unknown): LocalWorkflowCommandReceipt["response"] { const checked = this.#responseValidator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Local Workflow command response is invalid", { issueCount: checked.issues.length }); return checked.value; }
}

function assertId(value: unknown, label: string): asserts value is string { if (!safeId(value)) throw new RepositoryValidationError(`Local Workflow ${label} is invalid`); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
