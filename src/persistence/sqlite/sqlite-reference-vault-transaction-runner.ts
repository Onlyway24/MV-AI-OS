import type { DatabaseSync } from "node:sqlite";

import type { ReferenceVaultRepository, ReferenceVaultTransactionRunner } from "../../reference-vault/reference-vault-repository.js";
import type { SqliteConnectionConfig } from "./sqlite-connection-config.js";
import { openSqliteDatabase } from "./sqlite-database.js";
import { SqliteRepositoryError, withSqliteErrors } from "./sqlite-error.js";
import { SqliteReferenceVaultRepository } from "./sqlite-reference-vault-repository.js";
import type { SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteReferenceVaultTransactionRunner implements ReferenceVaultTransactionRunner {
  public readonly config: Readonly<SqliteConnectionConfig>;
  readonly #database: DatabaseSync;
  #tail: Promise<void> = Promise.resolve();
  #acceptingTransactions = true;
  #closePromise: Promise<void> | undefined;

  public constructor(config: unknown) {
    const opened = openSqliteDatabase(config);
    this.config = opened.config;
    this.#database = opened.database;
  }

  public transaction<T>(operation: (repository: ReferenceVaultRepository) => Promise<T>): Promise<T> {
    if (!this.#acceptingTransactions) return Promise.reject(new SqliteRepositoryError("The Reference Vault SQLite runner is closed", "reference_vault.transaction.begin"));
    const execution = this.#tail.then(async () => {
      withSqliteErrors("reference_vault.transaction.begin", () => { this.#database.exec("BEGIN IMMEDIATE"); });
      const scope: SqliteTransactionScope = { active: true };
      const repository = new SqliteReferenceVaultRepository(this.#database, scope);
      try {
        const result = await operation(repository);
        withSqliteErrors("reference_vault.transaction.commit", () => { this.#database.exec("COMMIT"); });
        return result;
      } catch (error) {
        try { this.#database.exec("ROLLBACK"); }
        catch { throw new SqliteRepositoryError("Reference Vault transaction could not be rolled back", "reference_vault.transaction.rollback"); }
        throw error;
      } finally {
        scope.active = false;
      }
    });
    this.#tail = execution.then(() => undefined, () => undefined);
    return execution;
  }

  public close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#acceptingTransactions = false;
    this.#closePromise = this.#tail.then(() => { withSqliteErrors("reference_vault.connection.close", () => { this.#database.close(); }); });
    this.#tail = this.#closePromise;
    return this.#closePromise;
  }
}
