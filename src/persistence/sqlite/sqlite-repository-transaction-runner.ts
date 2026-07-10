import { DatabaseSync } from "node:sqlite";

import type {
  RepositoryTransaction,
  RepositoryTransactionRunner,
} from "../repository-transaction.js";
import type { SqliteConnectionConfig } from "./sqlite-connection-config.js";
import { openSqliteDatabase } from "./sqlite-database.js";
import {
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import { SqliteAuditRepository } from "./sqlite-audit-repository.js";
import { SqliteRecordCodec } from "./sqlite-record-codec.js";
import { SqliteRequestRepository } from "./sqlite-request-repository.js";
import { SqliteTaskRepository } from "./sqlite-task-repository.js";
import type { SqliteTransactionScope } from "./sqlite-transaction-scope.js";
import { SqliteWorkflowCommandReceiptRepository } from "./sqlite-workflow-command-receipt-repository.js";
import { SqliteWorkflowApprovalCheckpointRepository } from "./sqlite-workflow-approval-checkpoint-repository.js";
import { SqliteWorkflowControlCheckpointEventRepository } from "./sqlite-workflow-control-checkpoint-event-repository.js";
import { SqliteWorkflowDefinitionRepository } from "./sqlite-workflow-definition-repository.js";
import { SqliteWorkflowEventRepository } from "./sqlite-workflow-event-repository.js";
import { SqliteWorkflowGuardianCheckpointRepository } from "./sqlite-workflow-guardian-checkpoint-repository.js";
import { SqliteWorkflowInstanceRepository } from "./sqlite-workflow-instance-repository.js";

export class SqliteRepositoryTransactionRunner
  implements RepositoryTransactionRunner
{
  public readonly config: Readonly<SqliteConnectionConfig>;

  readonly #database: DatabaseSync;
  readonly #codec = new SqliteRecordCodec();
  #tail: Promise<void> = Promise.resolve();
  #acceptingTransactions = true;
  #closePromise: Promise<void> | undefined;

  public constructor(config: unknown) {
    const opened = openSqliteDatabase(config);
    this.config = opened.config;
    this.#database = opened.database;
  }

  public transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.#acceptingTransactions) {
      return Promise.reject(
        new SqliteRepositoryError(
          "The SQLite transaction runner is closed",
          "transaction.begin",
        ),
      );
    }

    const execution = this.#tail.then(async () => {
      withSqliteErrors("transaction.begin", () => {
        this.#database.exec("BEGIN IMMEDIATE");
      });

      const scope: SqliteTransactionScope = { active: true };
      const repositories: RepositoryTransaction = Object.freeze({
        audits: new SqliteAuditRepository(
          this.#database,
          scope,
          this.#codec,
        ),
        requests: new SqliteRequestRepository(
          this.#database,
          scope,
          this.#codec,
        ),
        tasks: new SqliteTaskRepository(
          this.#database,
          scope,
          this.#codec,
        ),
        workflows: Object.freeze({
          approvals: new SqliteWorkflowApprovalCheckpointRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          controlEvents: new SqliteWorkflowControlCheckpointEventRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          definitions: new SqliteWorkflowDefinitionRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          events: new SqliteWorkflowEventRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          guardians: new SqliteWorkflowGuardianCheckpointRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          instances: new SqliteWorkflowInstanceRepository(
            this.#database,
            scope,
            this.#codec,
          ),
          receipts: new SqliteWorkflowCommandReceiptRepository(
            this.#database,
            scope,
            this.#codec,
          ),
        }),
      });

      try {
        const result = await operation(repositories);
        withSqliteErrors("transaction.commit", () => {
          this.#database.exec("COMMIT");
        });
        return result;
      } catch (error) {
        try {
          this.#database.exec("ROLLBACK");
        } catch {
          throw new SqliteRepositoryError(
            "The SQLite transaction failed and could not be rolled back",
            "transaction.rollback",
          );
        }
        throw error;
      } finally {
        scope.active = false;
      }
    });

    this.#tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  public close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return this.#closePromise;
    }

    this.#acceptingTransactions = false;
    this.#closePromise = this.#tail.then(() => {
      withSqliteErrors("connection.close", () => {
        this.#database.close();
      });
    });
    this.#tail = this.#closePromise;
    return this.#closePromise;
  }
}
