import { DatabaseSync } from "node:sqlite";

import type {
  RepositoryTransaction,
  RepositoryTransactionRunner,
} from "../repository-transaction.js";
import {
  SqliteConnectionConfigValidator,
  type SqliteConnectionConfig,
} from "./sqlite-connection-config.js";
import {
  SqliteConfigurationError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import { SqliteAuditRepository } from "./sqlite-audit-repository.js";
import { SqliteRecordCodec } from "./sqlite-record-codec.js";
import { SqliteRequestRepository } from "./sqlite-request-repository.js";
import { initializeSqliteSchema } from "./sqlite-schema.js";
import { SqliteTaskRepository } from "./sqlite-task-repository.js";
import type { SqliteTransactionScope } from "./sqlite-transaction-scope.js";

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
    const validation = new SqliteConnectionConfigValidator().validate(config);
    if (!validation.ok) {
      throw new SqliteConfigurationError(validation.issues);
    }
    this.config = Object.freeze({ ...validation.value });

    try {
      this.#database = new DatabaseSync(this.config.path, {
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        readBigInts: false,
        returnArrays: false,
        timeout: this.config.timeoutMs,
      });
    } catch {
      throw new SqliteRepositoryError(
        "Unable to open the configured SQLite database",
        "connection.open",
      );
    }

    try {
      this.#database.exec("PRAGMA synchronous = FULL");
      initializeSqliteSchema(this.#database);
    } catch (error) {
      this.#database.close();
      throw error;
    }
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
