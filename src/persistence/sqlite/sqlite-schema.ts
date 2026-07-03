import type { DatabaseSync } from "node:sqlite";

import {
  SqliteSchemaError,
} from "./sqlite-error.js";

export const SQLITE_SCHEMA_VERSION = 1;

const SQLITE_APPLICATION_ID = 0x4d564149;
const EXPECTED_TABLES = Object.freeze([
  "audit_events",
  "requests",
  "schema_migrations",
  "tasks",
]);

export function initializeSqliteSchema(database: DatabaseSync): void {
  const version = readPragmaInteger(database, "user_version");
  const applicationId = readPragmaInteger(database, "application_id");

  if (version > SQLITE_SCHEMA_VERSION) {
    throw new SqliteSchemaError(
      "sqlite_schema_unsupported",
      "SQLite schema version is newer than this runtime supports",
      {
        actualVersion: version,
        supportedVersion: SQLITE_SCHEMA_VERSION,
      },
    );
  }
  if (version === 0) {
    if (applicationId !== 0 || listUserTables(database).length > 0) {
      throw new SqliteSchemaError(
        "sqlite_schema_unsupported",
        "Unversioned non-empty SQLite databases are not supported",
      );
    }
    applyInitialMigration(database);
  }

  const finalVersion = readPragmaInteger(database, "user_version");
  const finalApplicationId = readPragmaInteger(
    database,
    "application_id",
  );
  if (
    finalVersion !== SQLITE_SCHEMA_VERSION ||
    finalApplicationId !== SQLITE_APPLICATION_ID
  ) {
    throw new SqliteSchemaError(
      "sqlite_schema_unsupported",
      "SQLite database identity or schema version is unsupported",
      {
        actualApplicationId: finalApplicationId,
        actualVersion: finalVersion,
        expectedApplicationId: SQLITE_APPLICATION_ID,
        expectedVersion: SQLITE_SCHEMA_VERSION,
      },
    );
  }
  verifyExpectedTables(database);
}

function applyInitialMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      ) STRICT;

      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE TABLE requests (
        request_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        request_fingerprint TEXT NOT NULL,
        has_response INTEGER NOT NULL CHECK (has_response IN (0, 1)),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE TABLE audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        correlation_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX audit_events_correlation_sequence
        ON audit_events (correlation_id, sequence);

      INSERT INTO schema_migrations (version, name)
      VALUES (1, 'initial_task_lifecycle');

      PRAGMA application_id = ${String(SQLITE_APPLICATION_ID)};
      PRAGMA user_version = ${String(SQLITE_SCHEMA_VERSION)};
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite schema initialization failed",
      undefined,
    );
  }
}

function verifyExpectedTables(database: DatabaseSync): void {
  const actual = listUserTables(database).sort(compareText);
  if (
    actual.length !== EXPECTED_TABLES.length ||
    !actual.every((table, index) => table === EXPECTED_TABLES[index])
  ) {
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite schema tables do not match the expected version",
      {
        actualTables: actual,
        expectedTables: EXPECTED_TABLES,
      },
    );
  }
  const migration = database
    .prepare(
      "SELECT name FROM schema_migrations WHERE version = ?",
    )
    .get(SQLITE_SCHEMA_VERSION);
  if (migration?.name !== "initial_task_lifecycle") {
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite migration history is incomplete",
    );
  }
}

function readPragmaInteger(
  database: DatabaseSync,
  pragma: "application_id" | "user_version",
): number {
  const row = database.prepare(`PRAGMA ${pragma}`).get();
  const value = row?.[pragma];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      `SQLite PRAGMA ${pragma} returned an invalid value`,
    );
  }
  return value;
}

function listUserTables(database: DatabaseSync): string[] {
  const rows = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const tables: string[] = [];
  for (const row of rows) {
    if (typeof row.name !== "string") {
      throw new SqliteSchemaError(
        "sqlite_schema_invalid",
        "SQLite schema contains an invalid table name",
      );
    }
    tables.push(row.name);
  }
  return tables;
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    return;
  }
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
