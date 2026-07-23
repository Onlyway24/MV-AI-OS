import type { DatabaseSync } from "node:sqlite";

import {
  SqliteSchemaError,
} from "./sqlite-error.js";

export const SQLITE_SCHEMA_VERSION = 32;

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
const VERSION_NINETEEN_TABLES = Object.freeze([...VERSION_EIGHTEEN_TABLES, "evidence_records", "feedback_metric_snapshots", "publication_kill_switches", "publication_plans", "source_registry_entries"]);
const VERSION_TWENTY_TABLES = Object.freeze([...VERSION_NINETEEN_TABLES, "evidence_packs"]);
const VERSION_TWENTY_ONE_TABLES = Object.freeze([...VERSION_TWENTY_TABLES, "business_mission_dossiers"]);
const VERSION_TWENTY_TWO_TABLES = Object.freeze([...VERSION_TWENTY_ONE_TABLES, "agent_company_workdays"]);
const VERSION_TWENTY_THREE_TABLES = Object.freeze([...VERSION_TWENTY_TWO_TABLES, "authorized_research_missions", "research_acquisition_snapshots"]);
const VERSION_TWENTY_FOUR_TABLES = Object.freeze([...VERSION_TWENTY_THREE_TABLES, "social_intelligence_live_records"]);
const VERSION_TWENTY_FIVE_TABLES = VERSION_TWENTY_FOUR_TABLES;
const VERSION_TWENTY_SIX_TABLES = Object.freeze([
  ...VERSION_TWENTY_FIVE_TABLES,
  "operations_events",
  "operations_job_attempts",
  "operations_jobs",
  "operations_process_leases",
  "operations_runtime_controls",
  "operations_schedules",
]);
const VERSION_TWENTY_SEVEN_TABLES = Object.freeze([
  ...VERSION_TWENTY_SIX_TABLES,
  "control_action_proposals",
  "control_action_receipts",
  "daily_operating_briefs",
  "founder_workdays",
  "operations_incidents",
  "production_controls",
]);
const VERSION_TWENTY_EIGHT_TABLES = Object.freeze([
  ...VERSION_TWENTY_SEVEN_TABLES,
  "operations_job_successors",
  "operations_runtime_usage_rollups",
]);
const VERSION_TWENTY_NINE_TABLES = VERSION_TWENTY_EIGHT_TABLES;
const VERSION_THIRTY_TABLES = VERSION_TWENTY_NINE_TABLES;
const VERSION_THIRTY_ONE_TABLES = Object.freeze([
  ...VERSION_THIRTY_TABLES,
  "reference_vault_audit_events",
  "reference_vault_blobs",
  "reference_vault_command_receipts",
  "reference_vault_records",
]);
const VERSION_THIRTY_TWO_TABLES = Object.freeze([
  ...VERSION_THIRTY_ONE_TABLES,
  "venture_audit_events",
  "venture_command_receipts",
  "venture_events",
  "venture_records",
  "venture_runtime_controls",
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
  const operationalPlaneVersion = readPragmaInteger(database, "user_version");
  if (operationalPlaneVersion === 18) {
    verifyDatabaseIdentity(database, 18);
    verifyExpectedTables(database, VERSION_EIGHTEEN_TABLES);
    verifyMigration(database, 18, "durable_production_runtime_jobs");
    applyOperationalPlaneMigration(database);
  }
  const evidencePackVersion = readPragmaInteger(database, "user_version");
  if (evidencePackVersion === 19) {
    verifyDatabaseIdentity(database, 19);
    verifyExpectedTables(database, VERSION_NINETEEN_TABLES);
    verifyMigration(database, 19, "controlled_evidence_publication_feedback_planes");
    applyEvidencePackMigration(database);
  }
  const businessMissionVersion = readPragmaInteger(database, "user_version");
  if (businessMissionVersion === 20) {
    verifyDatabaseIdentity(database, 20);
    verifyExpectedTables(database, VERSION_TWENTY_TABLES);
    verifyMigration(database, 20, "durable_evidence_packs");
    applyBusinessMissionMigration(database);
  }
  const agentCompanyVersion = readPragmaInteger(database, "user_version");
  if (agentCompanyVersion === 21) {
    verifyDatabaseIdentity(database, 21);
    verifyExpectedTables(database, VERSION_TWENTY_ONE_TABLES);
    verifyMigration(database, 21, "durable_business_mission_dossiers");
    applyAgentCompanyMigration(database);
  }
  const authorizedResearchVersion = readPragmaInteger(database, "user_version");
  if (authorizedResearchVersion === 22) {
    verifyDatabaseIdentity(database, 22);
    verifyExpectedTables(database, VERSION_TWENTY_TWO_TABLES);
    verifyMigration(database, 22, "operational_agent_company_workdays");
    applyAuthorizedResearchMigration(database);
  }
  const socialIntelligenceLiveVersion = readPragmaInteger(database, "user_version");
  if (socialIntelligenceLiveVersion === 23) {
    verifyDatabaseIdentity(database, 23);
    verifyExpectedTables(database, VERSION_TWENTY_THREE_TABLES);
    verifyMigration(database, 23, "authorized_research_acquisition");
    applySocialIntelligenceLiveMigration(database);
  }
  const competitorPackVersion = readPragmaInteger(database, "user_version");
  if (competitorPackVersion === 24) {
    verifyDatabaseIdentity(database, 24);
    verifyExpectedTables(database, VERSION_TWENTY_FOUR_TABLES);
    verifyMigration(database, 24, "social_intelligence_live_activation");
    applyCompetitorIntelligencePackMigration(database);
  }
  const supervisedOperationsVersion = readPragmaInteger(database, "user_version");
  if (supervisedOperationsVersion === 25) {
    verifyDatabaseIdentity(database, 25);
    verifyExpectedTables(database, VERSION_TWENTY_FIVE_TABLES);
    verifyMigration(database, 25, "durable_competitor_intelligence_packs");
    applySupervisedOperationsRuntimeMigration(database);
  }
  const founderControlPlaneVersion = readPragmaInteger(database, "user_version");
  if (founderControlPlaneVersion === 26) {
    verifyDatabaseIdentity(database, 26);
    verifyExpectedTables(database, VERSION_TWENTY_SIX_TABLES);
    verifyMigration(database, 26, "supervised_h24_operations_runtime");
    applyFounderControlPlaneMigration(database);
  }
  const operationsHardeningVersion = readPragmaInteger(database, "user_version");
  if (operationsHardeningVersion === 27) {
    verifyDatabaseIdentity(database, 27);
    verifyExpectedTables(database, VERSION_TWENTY_SEVEN_TABLES);
    verifyMigration(database, 27, "durable_founder_operations_control_plane");
    applyOperationsRuntimeHardeningMigration(database);
  }
  const dailyBriefHistoryVersion = readPragmaInteger(database, "user_version");
  if (dailyBriefHistoryVersion === 28) {
    verifyDatabaseIdentity(database, 28);
    verifyExpectedTables(database, VERSION_TWENTY_EIGHT_TABLES);
    verifyMigration(database, 28, "operations_runtime_p1_hardening");
    applyDailyOperatingBriefHistoryMigration(database);
  }
  const telegramDeliveryReconciliationVersion = readPragmaInteger(database, "user_version");
  if (telegramDeliveryReconciliationVersion === 29) {
    verifyDatabaseIdentity(database, 29);
    verifyExpectedTables(database, VERSION_TWENTY_NINE_TABLES);
    verifyMigration(database, 29, "daily_operating_brief_snapshot_history");
    applyTelegramDeliveryReconciliationMigration(database);
  }
  const referenceVaultVersion = readPragmaInteger(database, "user_version");
  if (referenceVaultVersion === 30) {
    verifyDatabaseIdentity(database, 30);
    verifyExpectedTables(database, VERSION_THIRTY_TABLES);
    verifyMigration(database, 30, "telegram_delivery_reconciliation");
    applyReferenceVaultMigration(database);
  }
  const ventureHoldingVersion = readPragmaInteger(database, "user_version");
  if (ventureHoldingVersion === 31) {
    verifyDatabaseIdentity(database, 31);
    verifyExpectedTables(database, VERSION_THIRTY_ONE_TABLES);
    verifyMigration(database, 31, "creative_business_intelligence_reference_vault");
    applyVentureHoldingMigration(database);
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
  verifyExpectedTables(database, VERSION_THIRTY_TWO_TABLES);
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
  verifyMigration(database, 19, "controlled_evidence_publication_feedback_planes");
  verifyMigration(database, 20, "durable_evidence_packs");
  verifyMigration(database, 21, "durable_business_mission_dossiers");
  verifyMigration(database, 22, "operational_agent_company_workdays");
  verifyMigration(database, 23, "authorized_research_acquisition");
  verifyMigration(database, 24, "social_intelligence_live_activation");
  verifyMigration(database, 25, "durable_competitor_intelligence_packs");
  verifyMigration(database, 26, "supervised_h24_operations_runtime");
  verifyMigration(database, 27, "durable_founder_operations_control_plane");
  verifyMigration(database, 28, "operations_runtime_p1_hardening");
  verifyMigration(database, 29, "daily_operating_brief_snapshot_history");
  verifyMigration(database, 30, "telegram_delivery_reconciliation");
  verifyMigration(database, 31, "creative_business_intelligence_reference_vault");
  verifyMigration(database, 32, "onlyway_venture_holding_v1");
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

function applyOperationalPlaneMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE source_registry_entries (
        source_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'FORBIDDEN')), category TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX source_registry_entries_workspace_status ON source_registry_entries (workspace_id, status, source_id);
      CREATE TABLE evidence_records (
        evidence_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, source_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('CONTESTED', 'INSUFFICIENT', 'STALE', 'VERIFIED')),
        freshness_expires_at TEXT NOT NULL, record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX evidence_records_workspace_freshness ON evidence_records (workspace_id, status, freshness_expires_at, evidence_id);
      CREATE TABLE publication_plans (
        publication_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, production_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'CANCELLED', 'DRY_RUN', 'FAILED', 'SUCCEEDED', 'UNCERTAIN')),
        version INTEGER NOT NULL CHECK (version >= 0), scheduled_for TEXT NOT NULL, updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)), UNIQUE (workspace_id, idempotency_key)
      ) STRICT;
      CREATE INDEX publication_plans_workspace_status ON publication_plans (workspace_id, status, scheduled_for, publication_id);
      CREATE TABLE publication_kill_switches (
        workspace_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        version INTEGER NOT NULL CHECK (version >= 1), updated_at TEXT NOT NULL, record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE TABLE feedback_metric_snapshots (
        snapshot_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, publication_id TEXT NOT NULL,
        production_id TEXT NOT NULL, platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')), captured_at TEXT NOT NULL,
        correction_of_snapshot_id TEXT, record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX feedback_metric_snapshots_publication ON feedback_metric_snapshots (publication_id, captured_at, snapshot_id);
      INSERT INTO schema_migrations (version, name) VALUES (19, 'controlled_evidence_publication_feedback_planes');
      PRAGMA user_version = 19;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite operational plane migration failed");
  }
}

function applyEvidencePackMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE evidence_packs (
        pack_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        min_freshness_expires_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX evidence_packs_workspace_freshness
        ON evidence_packs (workspace_id, min_freshness_expires_at, pack_id);
      INSERT INTO schema_migrations (version, name) VALUES (20, 'durable_evidence_packs');
      PRAGMA user_version = 20;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Evidence Pack migration failed");
  }
}

function applyBusinessMissionMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE business_mission_dossiers (
        mission_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('APPROVED', 'BLOCKED', 'PENDING_FABIO_APPROVAL', 'REJECTED', 'REVISION_REQUESTED')),
        version INTEGER NOT NULL CHECK (version >= 0),
        selected_opportunity_id TEXT,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX business_mission_dossiers_workspace_status
        ON business_mission_dossiers (workspace_id, status, updated_at DESC, mission_id);
      INSERT INTO schema_migrations (version, name) VALUES (21, 'durable_business_mission_dossiers');
      PRAGMA user_version = 21;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Business Mission migration failed");
  }
}

function applyAgentCompanyMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE agent_company_workdays (
        workday_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('AWAITING_FABIO', 'BLOCKED', 'RUNNING')),
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX agent_company_workdays_workspace_status
        ON agent_company_workdays (workspace_id, status, updated_at DESC, workday_id);
      INSERT INTO schema_migrations (version, name) VALUES (22, 'operational_agent_company_workdays');
      PRAGMA user_version = 22;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Agent Company migration failed");
  }
}

function applyAuthorizedResearchMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE authorized_research_missions (
        mission_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('BLOCKED', 'READY', 'RUNNING')),
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX authorized_research_missions_workspace_status
        ON authorized_research_missions (workspace_id, status, updated_at DESC, mission_id);
      CREATE TABLE research_acquisition_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        evidence_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (mission_id, evidence_id)
      ) STRICT;
      CREATE INDEX research_acquisition_snapshots_mission
        ON research_acquisition_snapshots (mission_id, acquired_at, snapshot_id);
      INSERT INTO schema_migrations (version, name) VALUES (23, 'authorized_research_acquisition');
      PRAGMA user_version = 23;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Authorized Research migration failed");
  }
}

function applySocialIntelligenceLiveMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE social_intelligence_live_records (
        record_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ACCOUNT', 'ANALYTICS', 'AUDIO_RIGHTS', 'COMPETITOR', 'COMPETITOR_OBSERVATION', 'EXPERIMENT', 'TREND')),
        imported_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX social_intelligence_live_workspace_kind_time
        ON social_intelligence_live_records (workspace_id, kind, imported_at DESC, record_id);
      INSERT INTO schema_migrations (version, name) VALUES (24, 'social_intelligence_live_activation');
      PRAGMA user_version = 24;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Social Intelligence Live migration failed");
  }
}

function applyCompetitorIntelligencePackMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      ALTER TABLE social_intelligence_live_records RENAME TO social_intelligence_live_records_v24;
      CREATE TABLE social_intelligence_live_records (
        record_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ACCOUNT', 'ANALYTICS', 'AUDIO_RIGHTS', 'COMPETITOR', 'COMPETITOR_OBSERVATION', 'COMPETITOR_PACK', 'EXPERIMENT', 'TREND')),
        imported_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      INSERT INTO social_intelligence_live_records (record_id, workspace_id, actor_id, kind, imported_at, fingerprint, record_json)
        SELECT record_id, workspace_id, actor_id, kind, imported_at, fingerprint, record_json FROM social_intelligence_live_records_v24;
      DROP TABLE social_intelligence_live_records_v24;
      CREATE INDEX social_intelligence_live_workspace_kind_time
        ON social_intelligence_live_records (workspace_id, kind, imported_at DESC, record_id);
      INSERT INTO schema_migrations (version, name) VALUES (25, 'durable_competitor_intelligence_packs');
      PRAGMA user_version = 25;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Competitor Intelligence Pack migration failed");
  }
}

function applySupervisedOperationsRuntimeMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE operations_schedules (
        schedule_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DISABLED', 'ENABLED')),
        next_run_at TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX operations_schedules_due
        ON operations_schedules (workspace_id, status, next_run_at, schedule_id);

      CREATE TABLE operations_jobs (
        job_id TEXT PRIMARY KEY,
        operation_identity TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('CANCELLED', 'COMPLETED', 'DEAD_LETTER', 'FAILED', 'QUEUED', 'RETRY_SCHEDULED', 'RUNNING')),
        priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100),
        run_after TEXT NOT NULL,
        lease_expires_at TEXT,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, operation_identity)
      ) STRICT;
      CREATE INDEX operations_jobs_next
        ON operations_jobs (workspace_id, status, priority DESC, run_after, job_id);
      CREATE INDEX operations_jobs_lease
        ON operations_jobs (workspace_id, status, lease_expires_at, job_id);
      CREATE INDEX operations_jobs_retention
        ON operations_jobs (workspace_id, status, updated_at, job_id);

      CREATE TABLE operations_job_attempts (
        attempt_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES operations_jobs(job_id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 1),
        finished_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (job_id, attempt)
      ) STRICT;
      CREATE INDEX operations_job_attempts_job
        ON operations_job_attempts (job_id, attempt);

      CREATE TABLE operations_runtime_controls (
        workspace_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL CHECK (version >= 1),
        kill_switch TEXT NOT NULL CHECK (kill_switch IN ('ACTIVE', 'RELEASED')),
        maintenance_mode TEXT NOT NULL CHECK (maintenance_mode IN ('DISABLED', 'ENABLED')),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;

      CREATE TABLE operations_process_leases (
        workspace_id TEXT NOT NULL,
        lease_key TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SCHEDULER', 'WORKER')),
        instance_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        fencing_token INTEGER NOT NULL CHECK (fencing_token >= 1),
        version INTEGER NOT NULL CHECK (version >= 0),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        PRIMARY KEY (workspace_id, lease_key)
      ) WITHOUT ROWID, STRICT;
      CREATE INDEX operations_process_leases_health
        ON operations_process_leases (workspace_id, role, expires_at, lease_key);

      CREATE TABLE operations_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_version INTEGER NOT NULL CHECK (entity_version >= 0),
        occurred_at TEXT NOT NULL,
        safe_summary_code TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX operations_events_cursor
        ON operations_events (workspace_id, sequence);
      CREATE INDEX operations_events_entity
        ON operations_events (workspace_id, aggregate_type, entity_id, sequence);

      INSERT INTO schema_migrations (version, name) VALUES (26, 'supervised_h24_operations_runtime');
      PRAGMA user_version = 26;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite supervised Operations Runtime migration failed");
  }
}

function applyFounderControlPlaneMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE production_controls (
        production_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'CANCELLED', 'PAUSED', 'REVISION_REQUIRED')),
        source_production_version INTEGER NOT NULL CHECK (source_production_version >= 0),
        source_package_fingerprint TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX production_controls_workspace_state
        ON production_controls (workspace_id, state, updated_at DESC, production_id);

      CREATE TABLE operations_incidents (
        incident_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACKNOWLEDGED', 'OPEN')),
        severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'LOW', 'MEDIUM')),
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX operations_incidents_workspace_status
        ON operations_incidents (workspace_id, status, severity, updated_at DESC, incident_id);

      CREATE TABLE control_action_proposals (
        proposal_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('REQUEST_PRODUCTION_REVISION', 'PAUSE_PRODUCTION', 'RESUME_PRODUCTION', 'CANCEL_PRODUCTION', 'RETRY_FAILED_JOB', 'REQUEUE_DEAD_LETTER_JOB', 'ACKNOWLEDGE_INCIDENT')),
        state TEXT NOT NULL CHECK (state IN ('CONSUMED', 'EXPIRED', 'PENDING')),
        expires_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;
      CREATE INDEX control_action_proposals_pending
        ON control_action_proposals (workspace_id, state, expires_at, proposal_id);

      CREATE TABLE control_action_receipts (
        receipt_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL UNIQUE REFERENCES control_action_proposals(proposal_id),
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;
      CREATE INDEX control_action_receipts_workspace_time
        ON control_action_receipts (workspace_id, recorded_at DESC, receipt_id);

      CREATE TABLE founder_workdays (
        workday_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('AWAITING_FABIO', 'BLOCKED', 'RUNNING')),
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json))
      ) STRICT;
      CREATE INDEX founder_workdays_workspace_status
        ON founder_workdays (workspace_id, status, updated_at DESC, workday_id);

      CREATE TABLE daily_operating_briefs (
        brief_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        business_date TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, business_date)
      ) STRICT;
      CREATE INDEX daily_operating_briefs_workspace_date
        ON daily_operating_briefs (workspace_id, business_date DESC, brief_id);

      INSERT INTO schema_migrations (version, name) VALUES (27, 'durable_founder_operations_control_plane');
      PRAGMA user_version = 27;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Founder Operations control-plane migration failed");
  }
}

function applyOperationsRuntimeHardeningMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TEMP TABLE operations_job_attempts_v27 AS
        SELECT attempt_id, job_id, workspace_id, attempt, finished_at, record_json
        FROM operations_job_attempts;
      DROP TABLE operations_job_attempts;

      ALTER TABLE operations_jobs RENAME TO operations_jobs_v27;
      CREATE TABLE operations_jobs (
        job_id TEXT PRIMARY KEY,
        operation_identity TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('BLOCKED', 'CANCELLED', 'COMPLETED', 'DEAD_LETTER', 'FAILED', 'QUEUED', 'RETRY_SCHEDULED', 'RUNNING')),
        priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100),
        run_after TEXT NOT NULL,
        lease_expires_at TEXT,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, operation_identity)
      ) STRICT;
      INSERT INTO operations_jobs (job_id, operation_identity, workspace_id, status, priority, run_after, lease_expires_at, version, updated_at, record_json)
        SELECT job_id, operation_identity, workspace_id, status, priority, run_after, lease_expires_at, version, updated_at, record_json
        FROM operations_jobs_v27;
      DROP TABLE operations_jobs_v27;
      CREATE INDEX operations_jobs_next
        ON operations_jobs (workspace_id, status, priority DESC, run_after, job_id);
      CREATE INDEX operations_jobs_lease
        ON operations_jobs (workspace_id, status, lease_expires_at, job_id);
      CREATE INDEX operations_jobs_retention
        ON operations_jobs (workspace_id, status, updated_at, job_id);

      CREATE TABLE operations_job_attempts (
        attempt_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES operations_jobs(job_id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 1),
        finished_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (job_id, attempt)
      ) STRICT;
      INSERT INTO operations_job_attempts (attempt_id, job_id, workspace_id, attempt, finished_at, record_json)
        SELECT attempt_id, job_id, workspace_id, attempt, finished_at, record_json
        FROM operations_job_attempts_v27;
      DROP TABLE operations_job_attempts_v27;
      CREATE INDEX operations_job_attempts_job
        ON operations_job_attempts (job_id, attempt);

      CREATE TABLE operations_runtime_usage_rollups (
        workspace_id TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL CHECK (attempts >= 0),
        cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
        provider_calls INTEGER NOT NULL CHECK (provider_calls >= 0),
        tool_calls INTEGER NOT NULL CHECK (tool_calls >= 0),
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE operations_job_successors (
        workspace_id TEXT NOT NULL,
        predecessor_job_id TEXT NOT NULL,
        successor_job_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, predecessor_job_id)
      ) WITHOUT ROWID, STRICT;
      CREATE INDEX operations_job_successors_successor
        ON operations_job_successors (workspace_id, successor_job_id);
      INSERT INTO operations_job_successors (workspace_id, predecessor_job_id, successor_job_id, created_at)
        SELECT workspace_id, json_extract(record_json, '$.predecessorJobId'), job_id, json_extract(record_json, '$.createdAt')
        FROM operations_jobs
        WHERE json_type(record_json, '$.predecessorJobId') = 'text';

      INSERT INTO schema_migrations (version, name) VALUES (28, 'operations_runtime_p1_hardening');
      PRAGMA user_version = 28;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Operations Runtime P1 hardening migration failed");
  }
}

function applyDailyOperatingBriefHistoryMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      ALTER TABLE daily_operating_briefs RENAME TO daily_operating_briefs_v28;
      CREATE TABLE daily_operating_briefs (
        brief_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        business_date TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        generated_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, business_date, version)
      ) STRICT;
      INSERT INTO daily_operating_briefs (brief_id, workspace_id, actor_id, business_date, version, generated_at, fingerprint, record_json)
        SELECT brief_id, workspace_id, actor_id, business_date, COALESCE(json_extract(record_json, '$.version'), 0), generated_at, fingerprint, record_json
        FROM daily_operating_briefs_v28;
      DROP TABLE daily_operating_briefs_v28;
      CREATE INDEX daily_operating_briefs_workspace_date
        ON daily_operating_briefs (workspace_id, business_date DESC, version DESC, brief_id);

      INSERT INTO schema_migrations (version, name) VALUES (29, 'daily_operating_brief_snapshot_history');
      PRAGMA user_version = 29;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Daily Operating Brief history migration failed");
  }
}

function applyTelegramDeliveryReconciliationMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      ALTER TABLE telegram_inbound_receipts RENAME TO telegram_inbound_receipts_v29;
      CREATE TABLE telegram_inbound_receipts (
        update_id TEXT PRIMARY KEY,
        action_fingerprint TEXT NOT NULL,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        processing_state TEXT NOT NULL CHECK (processing_state IN ('RECEIVED', 'DELIVERY_UNCERTAIN', 'COMPLETED', 'REJECTED')),
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        command_id TEXT
      ) STRICT;
      INSERT INTO telegram_inbound_receipts (update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id)
        SELECT receipt.update_id, receipt.action_fingerprint, receipt.identity_binding, receipt.action_kind,
          CASE
            WHEN receipt.processing_state = 'RECEIVED' AND EXISTS (
              SELECT 1 FROM telegram_outbound_deliveries AS delivery WHERE delivery.update_id = receipt.update_id
            ) THEN 'DELIVERY_UNCERTAIN'
            ELSE receipt.processing_state
          END,
          receipt.received_at, receipt.expires_at, receipt.command_id
        FROM telegram_inbound_receipts_v29 AS receipt;
      DROP TABLE telegram_inbound_receipts_v29;
      CREATE INDEX telegram_inbound_receipts_expiry ON telegram_inbound_receipts (expires_at, update_id);
      CREATE INDEX telegram_outbound_deliveries_update ON telegram_outbound_deliveries (update_id, delivery_id);

      INSERT INTO schema_migrations (version, name) VALUES (30, 'telegram_delivery_reconciliation');
      PRAGMA user_version = 30;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Telegram delivery reconciliation migration failed");
  }
}

function applyReferenceVaultMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE reference_vault_blobs (
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        byte_length INTEGER NOT NULL CHECK (byte_length >= 1 AND byte_length <= 52428800),
        mime_type TEXT NOT NULL,
        stored_at TEXT NOT NULL,
        content BLOB NOT NULL CHECK (length(content) = byte_length),
        PRIMARY KEY (workspace_id, actor_id, sha256)
      ) WITHOUT ROWID, STRICT;

      CREATE TABLE reference_vault_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        record_type TEXT NOT NULL CHECK (record_type IN ('AUDIENCE_SIGNAL', 'BUSINESS_CONTEXT', 'CREATIVE_DECISION', 'CREATIVE_FINGERPRINT', 'CUSTOMER_LANGUAGE_REFERENCE', 'NEGATIVE_REFERENCE', 'OFFER_REFERENCE', 'OUTCOME_LINK', 'REFERENCE_ASSET', 'REFERENCE_BLOB_TOMBSTONE', 'REFERENCE_COLLECTION', 'REFERENCE_COMMAND_RESULT', 'REFERENCE_IMPORT_RECEIPT', 'REFERENCE_REVIEW')),
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        content_sha256 TEXT CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK ((record_type = 'REFERENCE_ASSET' AND content_sha256 IS NOT NULL) OR (record_type <> 'REFERENCE_ASSET' AND content_sha256 IS NULL)),
        UNIQUE (workspace_id, actor_id, record_type, entity_id, version)
      ) STRICT;
      CREATE INDEX reference_vault_records_identity_type_sequence
        ON reference_vault_records (workspace_id, actor_id, record_type, sequence DESC);
      CREATE UNIQUE INDEX reference_vault_asset_content_dedup
        ON reference_vault_records (workspace_id, actor_id, content_sha256)
        WHERE record_type = 'REFERENCE_ASSET' AND version = 0;
      CREATE TRIGGER reference_vault_asset_requires_blob
        BEFORE INSERT ON reference_vault_records
        WHEN NEW.record_type = 'REFERENCE_ASSET'
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM reference_vault_blobs
          WHERE workspace_id = NEW.workspace_id AND actor_id = NEW.actor_id AND sha256 = NEW.content_sha256
        ) THEN RAISE(ABORT, 'reference vault asset blob is missing') END;
      END;

      CREATE TRIGGER reference_vault_blob_delete_requires_tombstone
        BEFORE DELETE ON reference_vault_blobs
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM reference_vault_records
          WHERE workspace_id = OLD.workspace_id
            AND actor_id = OLD.actor_id
            AND record_type = 'REFERENCE_BLOB_TOMBSTONE'
            AND json_extract(record_json, '$.contentSha256') = OLD.sha256
            AND json_extract(record_json, '$.byteContentStatus') = 'PURGED'
            AND json_extract(record_json, '$.metadataStatus') = 'IMMUTABLE_RETAINED'
        ) THEN RAISE(ABORT, 'reference vault blob tombstone is missing') END;
      END;

      CREATE TABLE reference_vault_command_receipts (
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
        recorded_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        PRIMARY KEY (workspace_id, actor_id, idempotency_key),
        UNIQUE (workspace_id, actor_id, command_id)
      ) WITHOUT ROWID, STRICT;

      CREATE TABLE reference_vault_audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, actor_id, event_id),
        UNIQUE (workspace_id, actor_id, command_id)
      ) STRICT;
      CREATE INDEX reference_vault_audit_identity_sequence
        ON reference_vault_audit_events (workspace_id, actor_id, sequence DESC);

      INSERT INTO schema_migrations (version, name)
      VALUES (31, 'creative_business_intelligence_reference_vault');
      PRAGMA user_version = 31;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Reference Vault migration failed");
  }
}

function applyVentureHoldingMigration(database: DatabaseSync): void {
  database.exec("BEGIN EXCLUSIVE");
  try {
    database.exec(`
      CREATE TABLE venture_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        record_type TEXT NOT NULL CHECK (record_type IN ('FOUNDER_VENTURE_POLICY', 'VENTURE_PORTFOLIO', 'VENTURE_OPPORTUNITY', 'VENTURE_SCORECARD', 'VENTURE_THESIS', 'VENTURE', 'VENTURE_STAGE_TRANSITION', 'VENTURE_ECONOMICS', 'CAPITAL_ALLOCATION_PROPOSAL', 'VENTURE_EXPERIMENT', 'VENTURE_ARTIFACT', 'VENTURE_DECISION', 'VENTURE_OPERATING_REPORT', 'FOUNDER_PORTFOLIO_BRIEF', 'VENTURE_RECEIPT')),
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        tombstoned INTEGER NOT NULL CHECK (tombstoned IN (0, 1)),
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, actor_id, record_type, entity_id, version)
      ) STRICT;
      CREATE INDEX venture_records_identity_type_sequence
        ON venture_records (workspace_id, actor_id, record_type, sequence DESC);
      CREATE INDEX venture_records_identity_entity_history
        ON venture_records (workspace_id, actor_id, record_type, entity_id, version DESC);

      CREATE TABLE venture_command_receipts (
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        idempotency_key_fingerprint TEXT NOT NULL CHECK (length(idempotency_key_fingerprint) = 64 AND idempotency_key_fingerprint NOT GLOB '*[^0-9a-f]*'),
        command_id TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'),
        response_fingerprint TEXT NOT NULL CHECK (length(response_fingerprint) = 64 AND response_fingerprint NOT GLOB '*[^0-9a-f]*'),
        recorded_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        PRIMARY KEY (workspace_id, actor_id, idempotency_key_fingerprint),
        UNIQUE (workspace_id, actor_id, command_id)
      ) WITHOUT ROWID, STRICT;

      CREATE TABLE venture_audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, actor_id, event_id),
        UNIQUE (workspace_id, actor_id, command_id)
      ) STRICT;
      CREATE INDEX venture_audit_identity_sequence
        ON venture_audit_events (workspace_id, actor_id, sequence DESC);

      CREATE TABLE venture_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_version INTEGER NOT NULL CHECK (entity_version >= 0),
        occurred_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, actor_id, event_id)
      ) STRICT;
      CREATE INDEX venture_events_identity_sequence
        ON venture_events (workspace_id, actor_id, sequence ASC);

      CREATE TABLE venture_runtime_controls (
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        PRIMARY KEY (workspace_id, actor_id)
      ) WITHOUT ROWID, STRICT;

      INSERT INTO schema_migrations (version, name)
      VALUES (32, 'onlyway_venture_holding_v1');
      PRAGMA user_version = 32;
    `);
    database.exec("COMMIT");
  } catch {
    rollbackQuietly(database);
    throw new SqliteSchemaError("sqlite_schema_invalid", "SQLite Venture Holding migration failed");
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
