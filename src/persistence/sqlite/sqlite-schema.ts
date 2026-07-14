import type { DatabaseSync } from "node:sqlite";

import {
  SqliteSchemaError,
} from "./sqlite-error.js";

export const SQLITE_SCHEMA_VERSION = 18;

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
const VERSION_FOUR_TABLES = Object.freeze([
  ...VERSION_THREE_TABLES,
  "workflow_command_receipts",
  "workflow_definitions",
  "workflow_events",
  "workflow_instances",
]);
const VERSION_FIVE_TABLES = Object.freeze([
  ...VERSION_FOUR_TABLES,
  "workflow_approval_checkpoints",
  "workflow_control_checkpoint_events",
  "workflow_guardian_checkpoints",
]);
const VERSION_SIX_TABLES = Object.freeze([
  ...VERSION_FIVE_TABLES,
  "workflow_agent_invocation_events",
  "workflow_agent_invocations",
]);
const VERSION_SEVEN_TABLES = Object.freeze([
  ...VERSION_SIX_TABLES,
  "workflow_step_outcomes",
]);
const VERSION_EIGHT_TABLES = Object.freeze([
  ...VERSION_SEVEN_TABLES,
  "workflow_lifecycle_events",
  "workflow_lifecycle_records",
]);
const VERSION_NINE_TABLES = VERSION_EIGHT_TABLES;
const VERSION_TEN_TABLES = VERSION_NINE_TABLES;
const VERSION_ELEVEN_TABLES = VERSION_TEN_TABLES;
const VERSION_TWELVE_TABLES = Object.freeze([...VERSION_ELEVEN_TABLES, "local_workflow_commands", "local_workflow_ownership"]);
const VERSION_THIRTEEN_TABLES = Object.freeze([...VERSION_TWELVE_TABLES, "telegram_callback_tokens", "telegram_inbound_receipts", "telegram_operator_sessions", "telegram_outbound_deliveries", "telegram_pending_confirmations", "telegram_polling_state"]);
const VERSION_FOURTEEN_TABLES = Object.freeze([...VERSION_THIRTEEN_TABLES, "telegram_operator_drafts"]);
const VERSION_FIFTEEN_TABLES = Object.freeze([...VERSION_FOURTEEN_TABLES, "telegram_mission_draft_operations"]);
const VERSION_SIXTEEN_TABLES = VERSION_FIFTEEN_TABLES;
const VERSION_SEVENTEEN_TABLES = Object.freeze([...VERSION_SIXTEEN_TABLES, "metodo_veloce_content_productions"]);
const VERSION_EIGHTEEN_TABLES = Object.freeze([...VERSION_SEVENTEEN_TABLES, "production_runtime_jobs"]);

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
  const workflowVersion = readPragmaInteger(database, "user_version");
  if (workflowVersion === 3) {
    verifyDatabaseIdentity(database, 3);
    verifyExpectedTables(database, VERSION_THREE_TABLES);
    verifyMigration(database, 1, "initial_task_lifecycle");
    verifyMigration(database, 2, "durable_memory");
    verifyMigration(database, 3, "durable_knowledge");
    applyWorkflowMigration(database);
  }
  const checkpointVersion = readPragmaInteger(database, "user_version");
  if (checkpointVersion === 4) {
    verifyDatabaseIdentity(database, 4);
    verifyExpectedTables(database, VERSION_FOUR_TABLES);
    verifyMigration(database, 1, "initial_task_lifecycle");
    verifyMigration(database, 2, "durable_memory");
    verifyMigration(database, 3, "durable_knowledge");
    verifyMigration(database, 4, "durable_workflows");
    applyWorkflowControlCheckpointMigration(database);
  }
  const invocationVersion = readPragmaInteger(database, "user_version");
  if (invocationVersion === 5) {
    verifyDatabaseIdentity(database, 5);
    verifyExpectedTables(database, VERSION_FIVE_TABLES);
    verifyMigration(database, 5, "durable_workflow_control_checkpoints");
    applyWorkflowAgentInvocationMigration(database);
  }
  const outcomeVersion = readPragmaInteger(database, "user_version");
  if (outcomeVersion === 6) {
    verifyDatabaseIdentity(database, 6);
    verifyExpectedTables(database, VERSION_SIX_TABLES);
    verifyMigration(database, 6, "durable_workflow_agent_invocations");
    applyWorkflowStepOutcomeMigration(database);
  }
  const lifecycleVersion = readPragmaInteger(database, "user_version");
  if (lifecycleVersion === 7) {
    verifyDatabaseIdentity(database, 7);
    verifyExpectedTables(database, VERSION_SEVEN_TABLES);
    verifyMigration(database, 7, "durable_workflow_step_outcomes");
    applyWorkflowLifecycleMigration(database);
  }
  const retryExecutionVersion = readPragmaInteger(database, "user_version");
  if (retryExecutionVersion === 8) {
    verifyDatabaseIdentity(database, 8);
    verifyExpectedTables(database, VERSION_EIGHT_TABLES);
    verifyMigration(database, 8, "durable_workflow_lifecycle");
    applyWorkflowRetryExecutionMigration(database);
  }
  const workflowControlVersion = readPragmaInteger(database, "user_version");
  if (workflowControlVersion === 9) {
    verifyDatabaseIdentity(database, 9);
    verifyExpectedTables(database, VERSION_NINE_TABLES);
    verifyMigration(database, 9, "explicit_workflow_retry_execution");
    applyWorkflowControlMigration(database);
  }
  const timeoutVersion = readPragmaInteger(database, "user_version");
  if (timeoutVersion === 10) {
    verifyDatabaseIdentity(database, 10);
    verifyExpectedTables(database, VERSION_TEN_TABLES);
    verifyMigration(database, 10, "explicit_workflow_lifecycle_control");
    applyWorkflowTimeoutMigration(database);
  }
  const productizationVersion = readPragmaInteger(database, "user_version");
  if (productizationVersion === 11) {
    verifyDatabaseIdentity(database, 11);
    verifyExpectedTables(database, VERSION_ELEVEN_TABLES);
    verifyMigration(database, 11, "explicit_workflow_timeout_evaluation");
    applyCoreV1ProductizationMigration(database);
  }
  const telegramVersion = readPragmaInteger(database, "user_version");
  if (telegramVersion === 12) {
    verifyDatabaseIdentity(database, 12);
    verifyExpectedTables(database, VERSION_TWELVE_TABLES);
    verifyMigration(database, 12, "core_v1_local_productization");
    applyTelegramOperatorMigration(database);
  }
  const telegramSessionVersion = readPragmaInteger(database, "user_version");
  if (telegramSessionVersion === 13) {
    verifyDatabaseIdentity(database, 13);
    verifyExpectedTables(database, VERSION_THIRTEEN_TABLES);
    verifyMigration(database, 13, "controlled_telegram_operator_console");
    applyTelegramSessionMigration(database);
  }
  const missionDraftVersion = readPragmaInteger(database, "user_version");
  if (missionDraftVersion === 14) {
    verifyDatabaseIdentity(database, 14);
    verifyExpectedTables(database, VERSION_FOURTEEN_TABLES);
    verifyMigration(database, 14, "durable_telegram_operator_sessions");
    applyTelegramMissionDraftMigration(database);
  }
  const missionCoordinationVersion = readPragmaInteger(database, "user_version");
  if (missionCoordinationVersion === 15) {
    verifyDatabaseIdentity(database, 15);
    verifyExpectedTables(database, VERSION_FIFTEEN_TABLES);
    verifyMigration(database, 15, "durable_telegram_mission_drafts");
    applyTelegramMissionCoordinationMigration(database);
  }
  const contentProductionVersion = readPragmaInteger(database, "user_version");
  if (contentProductionVersion === 16) {
    verifyDatabaseIdentity(database, 16);
    verifyExpectedTables(database, VERSION_SIXTEEN_TABLES);
    verifyMigration(database, 16, "atomic_telegram_mission_sessions");
    applyMetodoVeloceContentProductionMigration(database);
  }
  const productionRuntimeVersion = readPragmaInteger(database, "user_version");
  if (productionRuntimeVersion === 17) {
    verifyDatabaseIdentity(database, 17);
    verifyExpectedTables(database, VERSION_SEVENTEEN_TABLES);
    verifyMigration(database, 17, "durable_metodo_veloce_content_productions");
    applyProductionRuntimeMigration(database);
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
  verifyExpectedTables(database, VERSION_EIGHTEEN_TABLES);
  verifyMigration(database, 1, "initial_task_lifecycle");
  verifyMigration(database, 2, "durable_memory");
  verifyMigration(database, 3, "durable_knowledge");
  verifyMigration(database, 4, "durable_workflows");
  verifyMigration(database, 5, "durable_workflow_control_checkpoints");
  verifyMigration(database, 6, "durable_workflow_agent_invocations");
  verifyMigration(database, 7, "durable_workflow_step_outcomes");
  verifyMigration(database, 8, "durable_workflow_lifecycle");
  verifyMigration(database, 9, "explicit_workflow_retry_execution");
  verifyMigration(database, 10, "explicit_workflow_lifecycle_control");
  verifyMigration(database, 11, "explicit_workflow_timeout_evaluation");
  verifyMigration(database, 12, "core_v1_local_productization");
  verifyMigration(database, 13, "controlled_telegram_operator_console");
  verifyMigration(database, 14, "durable_telegram_operator_sessions");
  verifyMigration(database, 15, "durable_telegram_mission_drafts");
  verifyMigration(database, 16, "atomic_telegram_mission_sessions");
  verifyMigration(database, 17, "durable_metodo_veloce_content_productions");
  verifyMigration(database, 18, "durable_production_runtime_jobs");
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

function applyWorkflowMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_definitions (
        definition_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        workflow_version TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workflow_id, workflow_version)
      ) STRICT;

      CREATE TABLE workflow_instances (
        instance_id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL REFERENCES workflow_definitions (definition_id),
        status TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX workflow_instances_definition
        ON workflow_instances (definition_id);

      CREATE TABLE workflow_command_receipts (
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        command_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        resulting_version INTEGER NOT NULL CHECK (resulting_version >= 1),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        PRIMARY KEY (instance_id, command_id),
        UNIQUE (instance_id, resulting_version)
      ) STRICT;

      CREATE TABLE workflow_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        command_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (instance_id, command_id)
      ) STRICT;

      CREATE INDEX workflow_events_instance_sequence
        ON workflow_events (instance_id, sequence);

      INSERT INTO schema_migrations (version, name)
      VALUES (4, 'durable_workflows');

      PRAGMA user_version = 4;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite workflow schema migration failed",
    );
  }
}

function applyWorkflowControlCheckpointMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_approval_checkpoints (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id TEXT NOT NULL UNIQUE,
        definition_id TEXT NOT NULL REFERENCES workflow_definitions (definition_id),
        workflow_version TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        authority_actor_id TEXT NOT NULL,
        status TEXT NOT NULL,
        supersedes_evidence_id TEXT,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX workflow_approval_checkpoint_snapshot
        ON workflow_approval_checkpoints
          (instance_id, instance_version, step_id, sequence);

      CREATE TABLE workflow_guardian_checkpoints (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id TEXT NOT NULL UNIQUE,
        definition_id TEXT NOT NULL REFERENCES workflow_definitions (definition_id),
        workflow_version TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        guardian_id TEXT NOT NULL,
        status TEXT NOT NULL,
        supersedes_evidence_id TEXT,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE INDEX workflow_guardian_checkpoint_snapshot
        ON workflow_guardian_checkpoints
          (instance_id, instance_version, step_id, domain, sequence);

      CREATE TABLE workflow_control_checkpoint_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        checkpoint_id TEXT NOT NULL,
        checkpoint_kind TEXT NOT NULL CHECK (checkpoint_kind IN ('APPROVAL', 'GUARDIAN')),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (checkpoint_kind, checkpoint_id)
      ) STRICT;

      CREATE INDEX workflow_control_checkpoint_events_instance
        ON workflow_control_checkpoint_events (instance_id, sequence);

      INSERT INTO schema_migrations (version, name)
      VALUES (5, 'durable_workflow_control_checkpoints');

      PRAGMA user_version = 5;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError(
      "sqlite_schema_invalid",
      "SQLite workflow control checkpoint migration failed",
    );
  }
}

function applyWorkflowAgentInvocationMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_agent_invocations (
        invocation_id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        step_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMPLETED', 'FAILED')),
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX workflow_agent_invocations_instance_step
        ON workflow_agent_invocations (instance_id, step_id, invocation_id);
      CREATE TABLE workflow_agent_invocation_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        invocation_id TEXT NOT NULL REFERENCES workflow_agent_invocations (invocation_id),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        status TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (invocation_id, status)
      ) STRICT;
      CREATE INDEX workflow_agent_invocation_events_invocation
        ON workflow_agent_invocation_events (invocation_id, sequence);
      INSERT INTO schema_migrations (version, name)
      VALUES (6, 'durable_workflow_agent_invocations');
      PRAGMA user_version = 6;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite workflow agent invocation migration failed");
  }
}

function applyWorkflowStepOutcomeMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_step_outcomes (
        outcome_id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL UNIQUE REFERENCES workflow_agent_invocations (invocation_id),
        fingerprint TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        step_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX workflow_step_outcomes_instance_step
        ON workflow_step_outcomes (instance_id, step_id, outcome_id);
      INSERT INTO schema_migrations (version, name)
      VALUES (7, 'durable_workflow_step_outcomes');
      PRAGMA user_version = 7;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Workflow Step outcome migration failed");
  }
}

function applyWorkflowLifecycleMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_lifecycle_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('FAILURE', 'RETRY_AUTHORIZATION')),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX workflow_lifecycle_records_step
        ON workflow_lifecycle_records (instance_id, step_id, sequence);
      CREATE TABLE workflow_lifecycle_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL UNIQUE REFERENCES workflow_lifecycle_records (record_id),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX workflow_lifecycle_events_instance
        ON workflow_lifecycle_events (instance_id, sequence);
      INSERT INTO schema_migrations (version, name)
      VALUES (8, 'durable_workflow_lifecycle');
      PRAGMA user_version = 8;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Workflow lifecycle migration failed");
  }
}

function applyWorkflowRetryExecutionMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_lifecycle_records_v9 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('FAILURE', 'RETRY_AUTHORIZATION', 'RETRY_EXECUTION')),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE TABLE workflow_lifecycle_events_v9 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL UNIQUE REFERENCES workflow_lifecycle_records_v9 (record_id),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      INSERT INTO workflow_lifecycle_records_v9 SELECT * FROM workflow_lifecycle_records;
      INSERT INTO workflow_lifecycle_events_v9 SELECT * FROM workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_records_v9 RENAME TO workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_events_v9 RENAME TO workflow_lifecycle_events;
      CREATE INDEX workflow_lifecycle_records_step ON workflow_lifecycle_records (instance_id, step_id, sequence);
      CREATE INDEX workflow_lifecycle_events_instance ON workflow_lifecycle_events (instance_id, sequence);
      INSERT INTO schema_migrations (version, name) VALUES (9, 'explicit_workflow_retry_execution');
      PRAGMA user_version = 9;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Workflow retry execution migration failed");
  }
}

function applyWorkflowControlMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_lifecycle_records_v10 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('FAILURE', 'RETRY_AUTHORIZATION', 'RETRY_EXECUTION', 'PAUSE', 'RESUME', 'CANCELLATION')),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE TABLE workflow_lifecycle_events_v10 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL UNIQUE REFERENCES workflow_lifecycle_records_v10 (record_id),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      INSERT INTO workflow_lifecycle_records_v10 SELECT * FROM workflow_lifecycle_records;
      INSERT INTO workflow_lifecycle_events_v10 SELECT * FROM workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_records_v10 RENAME TO workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_events_v10 RENAME TO workflow_lifecycle_events;
      CREATE INDEX workflow_lifecycle_records_step ON workflow_lifecycle_records (instance_id, step_id, sequence);
      CREATE INDEX workflow_lifecycle_events_instance ON workflow_lifecycle_events (instance_id, sequence);
      INSERT INTO schema_migrations (version, name) VALUES (10, 'explicit_workflow_lifecycle_control');
      PRAGMA user_version = 10;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Workflow lifecycle control migration failed");
  }
}

function applyWorkflowTimeoutMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE workflow_lifecycle_records_v11 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('FAILURE', 'RETRY_AUTHORIZATION', 'RETRY_EXECUTION', 'PAUSE', 'RESUME', 'CANCELLATION', 'TIMEOUT_EVALUATION')),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        instance_version INTEGER NOT NULL CHECK (instance_version >= 0),
        step_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE TABLE workflow_lifecycle_events_v11 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        record_id TEXT NOT NULL UNIQUE REFERENCES workflow_lifecycle_records_v11 (record_id),
        instance_id TEXT NOT NULL REFERENCES workflow_instances (instance_id),
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      INSERT INTO workflow_lifecycle_records_v11 SELECT * FROM workflow_lifecycle_records;
      INSERT INTO workflow_lifecycle_events_v11 SELECT * FROM workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_events;
      DROP TABLE workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_records_v11 RENAME TO workflow_lifecycle_records;
      ALTER TABLE workflow_lifecycle_events_v11 RENAME TO workflow_lifecycle_events;
      CREATE INDEX workflow_lifecycle_records_step ON workflow_lifecycle_records (instance_id, step_id, sequence);
      CREATE INDEX workflow_lifecycle_events_instance ON workflow_lifecycle_events (instance_id, sequence);
      INSERT INTO schema_migrations (version, name) VALUES (11, 'explicit_workflow_timeout_evaluation');
      PRAGMA user_version = 11;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Workflow timeout migration failed");
  }
}

function applyCoreV1ProductizationMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE local_workflow_commands (
        command_id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        operation TEXT NOT NULL,
        response_json TEXT NOT NULL CHECK (json_valid(response_json))
      ) STRICT;
      CREATE TABLE local_workflow_ownership (
        instance_id TEXT PRIMARY KEY REFERENCES workflow_instances (instance_id),
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL
      ) STRICT;
      CREATE INDEX audit_events_workspace_correlation
        ON audit_events (correlation_id, json_extract(record_json, '$.workspaceId'), sequence);
      INSERT INTO schema_migrations (version, name) VALUES (12, 'core_v1_local_productization');
      PRAGMA user_version = 12;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Core V1 productization migration failed");
  }
}

function applyTelegramOperatorMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE telegram_inbound_receipts (
        update_id TEXT PRIMARY KEY,
        action_fingerprint TEXT NOT NULL,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        processing_state TEXT NOT NULL CHECK (processing_state IN ('RECEIVED', 'COMPLETED', 'REJECTED')),
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        command_id TEXT
      ) STRICT;
      CREATE INDEX telegram_inbound_receipts_expiry ON telegram_inbound_receipts (expires_at, update_id);
      CREATE TABLE telegram_callback_tokens (
        token_hash TEXT PRIMARY KEY,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        workflow_id TEXT,
        workflow_version TEXT
      ) STRICT;
      CREATE INDEX telegram_callback_tokens_expiry ON telegram_callback_tokens (expires_at, token_hash);
      CREATE TABLE telegram_operator_sessions (
        session_id TEXT PRIMARY KEY,
        identity_binding TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('IDLE', 'MISSION_DRAFT', 'PENDING_CONFIRMATION')),
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE telegram_pending_confirmations (
        confirmation_id TEXT PRIMARY KEY,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        action_fingerprint TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE telegram_polling_state (
        state_id INTEGER PRIMARY KEY CHECK (state_id = 1),
        offset TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE telegram_outbound_deliveries (
        delivery_id TEXT PRIMARY KEY,
        update_id TEXT,
        state TEXT NOT NULL CHECK (state IN ('DELIVERED', 'UNCERTAIN')),
        occurred_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, name) VALUES (13, 'controlled_telegram_operator_console');
      PRAGMA user_version = 13;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Telegram operator migration failed");
  }
}

function applyTelegramSessionMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      ALTER TABLE telegram_operator_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
      ALTER TABLE telegram_operator_sessions ADD COLUMN navigation_state TEXT NOT NULL DEFAULT 'IDLE';
      ALTER TABLE telegram_operator_sessions ADD COLUMN selected_action TEXT;
      ALTER TABLE telegram_operator_sessions ADD COLUMN workflow_instance_id TEXT;
      ALTER TABLE telegram_operator_sessions ADD COLUMN expected_workflow_version INTEGER;
      ALTER TABLE telegram_operator_sessions ADD COLUMN record_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(record_json));
      CREATE TABLE telegram_operator_sessions_v14 (
        session_id TEXT PRIMARY KEY,
        identity_binding TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('IDLE', 'COLLECTING_INPUT', 'REVIEWING_DRAFT', 'WAITING_CONFIRMATION', 'WORKFLOW_SELECTED', 'WAITING_WORKFLOW_CONFIRMATION', 'RESULT_REVIEW', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        navigation_state TEXT NOT NULL,
        selected_action TEXT,
        workflow_instance_id TEXT,
        expected_workflow_version INTEGER,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      INSERT INTO telegram_operator_sessions_v14 SELECT session_id, identity_binding, CASE state WHEN 'MISSION_DRAFT' THEN 'COLLECTING_INPUT' WHEN 'PENDING_CONFIRMATION' THEN 'WAITING_CONFIRMATION' ELSE state END, expires_at, updated_at, version, navigation_state, selected_action, workflow_instance_id, expected_workflow_version, record_json FROM telegram_operator_sessions;
      DROP TABLE telegram_operator_sessions;
      ALTER TABLE telegram_operator_sessions_v14 RENAME TO telegram_operator_sessions;
      ALTER TABLE telegram_callback_tokens ADD COLUMN session_id TEXT;
      ALTER TABLE telegram_callback_tokens ADD COLUMN expected_workflow_version INTEGER;
      ALTER TABLE telegram_callback_tokens ADD COLUMN consumed_at TEXT;
      ALTER TABLE telegram_pending_confirmations ADD COLUMN session_id TEXT;
      ALTER TABLE telegram_pending_confirmations ADD COLUMN expected_workflow_version INTEGER;
      ALTER TABLE telegram_pending_confirmations ADD COLUMN consumed_at TEXT;
      CREATE TABLE telegram_operator_drafts (
        session_id TEXT PRIMARY KEY REFERENCES telegram_operator_sessions (session_id),
        expires_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX telegram_operator_drafts_expiry ON telegram_operator_drafts (expires_at, session_id);
      INSERT INTO schema_migrations (version, name) VALUES (14, 'durable_telegram_operator_sessions');
      PRAGMA user_version = 14;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Telegram session migration failed");
  }
}

function applyTelegramMissionDraftMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE telegram_mission_draft_operations (
        operation_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        resulting_version INTEGER NOT NULL CHECK (resulting_version >= 0),
        applied_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX telegram_mission_draft_operations_draft_version
        ON telegram_mission_draft_operations (draft_id, resulting_version, operation_id);
      INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (15, 'durable_telegram_mission_drafts');
      PRAGMA user_version = 15;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Telegram Mission draft migration failed");
  }
}

function applyTelegramMissionCoordinationMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      ALTER TABLE telegram_callback_tokens ADD COLUMN mission_action TEXT;
      ALTER TABLE telegram_callback_tokens ADD COLUMN draft_id TEXT;
      ALTER TABLE telegram_callback_tokens ADD COLUMN expected_session_version INTEGER;
      ALTER TABLE telegram_callback_tokens ADD COLUMN expected_draft_version INTEGER;
      ALTER TABLE telegram_callback_tokens ADD COLUMN context_fingerprint TEXT;
      ALTER TABLE telegram_callback_tokens ADD COLUMN operation_json TEXT CHECK (operation_json IS NULL OR json_valid(operation_json));
      CREATE INDEX telegram_callback_tokens_mission_snapshot
        ON telegram_callback_tokens (session_id, draft_id, expected_session_version, expected_draft_version);
      INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (16, 'atomic_telegram_mission_sessions');
      PRAGMA user_version = 16;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Telegram Mission coordination migration failed");
  }
}

function applyMetodoVeloceContentProductionMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE metodo_veloce_content_productions (
        production_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('APPROVED_FOR_SCHEDULING', 'ARCHIVED', 'BLOCKED', 'PENDING_FABIO_APPROVAL', 'SCHEDULED')),
        version INTEGER NOT NULL CHECK (version >= 0),
        scheduled_for TEXT,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX metodo_veloce_content_productions_queue
        ON metodo_veloce_content_productions (workspace_id, status, scheduled_for, updated_at, production_id);
      INSERT INTO schema_migrations (version, name) VALUES (17, 'durable_metodo_veloce_content_productions');
      PRAGMA user_version = 17;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Metodo Veloce content production migration failed");
  }
}

function applyProductionRuntimeMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE production_runtime_jobs (
        job_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'DEAD_LETTER', 'QUEUED', 'RETRY_SCHEDULED', 'RUNNING')),
        version INTEGER NOT NULL CHECK (version >= 0),
        run_after TEXT NOT NULL,
        lease_expires_at TEXT,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX production_runtime_jobs_next
        ON production_runtime_jobs (workspace_id, status, run_after, job_id);
      CREATE INDEX production_runtime_jobs_lease
        ON production_runtime_jobs (workspace_id, status, lease_expires_at, job_id);
      INSERT INTO schema_migrations (version, name) VALUES (18, 'durable_production_runtime_jobs');
      PRAGMA user_version = 18;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Production Runtime migration failed");
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
