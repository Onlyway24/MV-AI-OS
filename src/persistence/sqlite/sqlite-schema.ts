import type { DatabaseSync } from "node:sqlite";

import {
  SqliteSchemaError,
} from "./sqlite-error.js";

export const SQLITE_SCHEMA_VERSION = 3;

export const SQLITE_APPLICATION_ID = 0x4d564149;
const VERSION_ONE_TABLES = Object.freeze([
  "audit_events",
  "requests",
  "schema_migrations",
  "tasks",
]);
const VERSION_TWO_TABLES = Object.freeze([
  ...VERSION_ONE_TABLES,
  "memory_records",
]);
const VERSION_THREE_TABLES = Object.freeze([
  ...VERSION_TWO_TABLES,
  "knowledge_records",
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
  const currentVersion = readPragmaInteger(database, "user_version");
  if (currentVersion === 1) {
    verifyDatabaseIdentity(database, 1);
    verifyExpectedTables(database, VERSION_ONE_TABLES);
    verifyMigration(database, 1, "initial_task_lifecycle");
    applyMemoryMigration(database);
  }
  const knowledgeVersion = readPragmaInteger(database, "user_version");
  if (knowledgeVersion === 2) {
    verifyDatabaseIdentity(database, 2);
    verifyExpectedTables(database, VERSION_TWO_TABLES);
    verifyMigration(database, 1, "initial_task_lifecycle");
    verifyMigration(database, 2, "durable_memory");
    applyKnowledgeMigration(database);
  }

  verifyCurrentSqliteSchema(database);
}

export function verifyCurrentSqliteSchema(database: DatabaseSync): void {
  const version = readPragmaInteger(database, "user_version");
  const applicationId = readPragmaInteger(database, "application_id");
  if (
    version !== SQLITE_SCHEMA_VERSION ||
    applicationId !== SQLITE_APPLICATION_ID
  ) {
    throw new SqliteSchemaError(
      "sqlite_schema_unsupported",
      "SQLite database identity or schema version is unsupported",
      {
        actualApplicationId: applicationId,
        actualVersion: version,
        expectedApplicationId: SQLITE_APPLICATION_ID,
        expectedVersion: SQLITE_SCHEMA_VERSION,
      },
    );
  }
  verifyExpectedTables(database, VERSION_THREE_TABLES);
  verifyMigration(database, 1, "initial_task_lifecycle");
  verifyMigration(database, 2, "durable_memory");
  verifyMigration(database, 3, "durable_knowledge");
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
      PRAGMA user_version = 1;
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

function applyMemoryMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE memory_records (
        memory_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        category TEXT NOT NULL,
        visibility TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT,
        deleted_at TEXT,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX memory_records_workspace_category_created
        ON memory_records (workspace_id, category, created_at DESC, memory_id);

      CREATE INDEX memory_records_owner
        ON memory_records (workspace_id, owner_id);

      INSERT INTO schema_migrations (version, name)
      VALUES (2, 'durable_memory');

      PRAGMA user_version = 2;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite memory schema migration failed",
    );
  }
}

function applyKnowledgeMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE knowledge_records (
        knowledge_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        visibility TEXT NOT NULL,
        source_type TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        expires_at TEXT,
        deleted_at TEXT,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX knowledge_records_workspace_verified
        ON knowledge_records (workspace_id, verified_at DESC, knowledge_id);

      CREATE INDEX knowledge_records_owner
        ON knowledge_records (workspace_id, owner_id);

      CREATE INDEX knowledge_records_source_type
        ON knowledge_records (workspace_id, source_type);

      INSERT INTO schema_migrations (version, name)
      VALUES (3, 'durable_knowledge');

      PRAGMA user_version = 3;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite knowledge schema migration failed",
    );
  }
}

function verifyExpectedTables(
  database: DatabaseSync,
  expectedTables: readonly string[],
): void {
  const actual = listUserTables(database).sort(compareText);
  const expected = [...expectedTables].sort(compareText);
  if (
    actual.length !== expected.length ||
    !actual.every((table, index) => table === expected[index])
  ) {
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite schema tables do not match the expected version",
      {
        actualTables: actual,
        expectedTables: expected,
      },
    );
  }
}

function verifyMigration(
  database: DatabaseSync,
  version: number,
  expectedName: string,
): void {
  const migration = database
    .prepare(
      "SELECT name FROM schema_migrations WHERE version = ?",
    )
    .get(version);
  if (migration?.name !== expectedName) {
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite migration history is incomplete",
      { version },
    );
  }
}

function verifyDatabaseIdentity(
  database: DatabaseSync,
  version: number,
): void {
  const applicationId = readPragmaInteger(database, "application_id");
  if (applicationId !== SQLITE_APPLICATION_ID) {
    throw new SqliteSchemaError(
      "sqlite_schema_unsupported",
      "SQLite database identity is unsupported",
      {
        actualApplicationId: applicationId,
        expectedApplicationId: SQLITE_APPLICATION_ID,
        version,
      },
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
