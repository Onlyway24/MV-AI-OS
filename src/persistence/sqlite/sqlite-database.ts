import { DatabaseSync } from "node:sqlite";

import {
  SqliteConnectionConfigValidator,
  type SqliteConnectionConfig,
} from "./sqlite-connection-config.js";
import {
  SqliteConfigurationError,
  SqliteRepositoryError,
} from "./sqlite-error.js";
import { initializeSqliteSchema } from "./sqlite-schema.js";

export interface OpenedSqliteDatabase {
  readonly config: Readonly<SqliteConnectionConfig>;
  readonly database: DatabaseSync;
}

export function openSqliteDatabase(config: unknown): OpenedSqliteDatabase {
  const validation = new SqliteConnectionConfigValidator().validate(config);
  if (!validation.ok) {
    throw new SqliteConfigurationError(validation.issues);
  }
  const validatedConfig = Object.freeze({ ...validation.value });

  let database: DatabaseSync;
  try {
    database = new DatabaseSync(validatedConfig.path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readBigInts: false,
      returnArrays: false,
      timeout: validatedConfig.timeoutMs,
    });
  } catch {
    throw new SqliteRepositoryError(
      "Unable to open the configured SQLite database",
      "connection.open",
    );
  }

  try {
    database.exec("PRAGMA synchronous = FULL");
    initializeSqliteSchema(database);
  } catch (error) {
    database.close();
    throw error;
  }

  return Object.freeze({
    config: validatedConfig,
    database,
  });
}
