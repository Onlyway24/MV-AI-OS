import { DatabaseSync } from "node:sqlite";
import { closeSync, constants, fchmodSync, fstatSync, openSync, rmSync } from "node:fs";

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
  const privateFile = validatedConfig.path === ":memory:" ? undefined : preparePrivateDatabaseFile(validatedConfig.path);
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
    if (privateFile?.created === true) rmSync(validatedConfig.path, { force: true });
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

function preparePrivateDatabaseFile(path: string): Readonly<{ readonly created: boolean }> {
  let descriptor: number | undefined;
  let created = false;
  try {
    try {
      descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
      created = true;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      descriptor = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
    }
    const details = fstatSync(descriptor);
    if (!details.isFile() || (typeof process.getuid === "function" && details.uid !== process.getuid())) throw new Error("SQLite database ownership is invalid");
    fchmodSync(descriptor, 0o600);
    return Object.freeze({ created });
  } catch {
    if (created) rmSync(path, { force: true });
    throw new SqliteRepositoryError("Unable to secure the configured SQLite database", "connection.permissions");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
