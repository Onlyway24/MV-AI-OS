import { SqliteRepositoryError } from "./sqlite-error.js";

export interface SqliteTransactionScope {
  active: boolean;
}

export function assertActiveTransaction(
  scope: SqliteTransactionScope,
): void {
  if (!scope.active) {
    throw new SqliteRepositoryError(
      "SQLite repository access requires an active transaction",
      "transaction_scope",
    );
  }
}
