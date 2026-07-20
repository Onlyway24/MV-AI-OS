import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  MemoryExecutionContextBuilder,
  MemoryQueryValidator,
  MemoryRecordValidator,
  MemoryScopeValidator,
  RepositoryBackedMemoryService,
  RequestExecutionContextBuilder,
  SQLITE_SCHEMA_VERSION,
  SqliteMemoryRepository,
  SqliteRepositoryTransactionRunner,
  createTask,
} from "../../src/index.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";
import {
  createMemoryQuery,
  createMemoryScope,
  createSemanticMemory,
} from "./fixtures.js";
import { runMemoryRepositoryConformance } from "./repository-conformance.js";

runMemoryRepositoryConformance(
  "SQLite",
  () => createRepository(":memory:"),
);

describe("SQLite memory persistence", () => {
  it("preserves permitted memory and deletion state across restarts", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const firstRepository = createRepository(databasePath);
      const firstService = createService(firstRepository);
      const scope = createMemoryScope(["memory:read:semantic"]);
      const durable = createSemanticMemory("semantic-durable", {
        content: { fact: "Durable memory survives restart." },
      });
      const deleted = createSemanticMemory("semantic-deleted");
      const expired = createSemanticMemory("semantic-expired", {
        expiresAt: "2026-07-02T09:00:00.000Z",
      });

      await firstService.write({ record: durable, scope });
      await firstService.write({ record: deleted, scope });
      await firstService.write({ record: expired, scope });
      await firstService.delete({
        deletedAt: "2026-07-02T09:30:00.000Z",
        memoryId: deleted.memoryId,
        scope,
      });
      await firstRepository.close();

      const secondRepository = createRepository(databasePath);
      const secondService = createService(secondRepository);
      const result = await secondService.retrieve(
        createMemoryQuery(["semantic"], scope),
      );

      expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
        durable.memoryId,
      ]);
      await expect(
        secondRepository.getById(deleted.memoryId),
      ).resolves.toMatchObject({
        deletedAt: "2026-07-02T09:30:00.000Z",
      });

      const context = await new MemoryExecutionContextBuilder(
        new RequestExecutionContextBuilder(),
      ).build({
        agent: { agentId: "content", version: "1.0.0" },
        contextId: "context-after-restart",
        createdAt: "2026-07-02T10:00:00.000Z",
        effectivePermissions: ["memory:read:semantic"],
        memory: secondService,
        request: createRequest(),
        taskId: "task-after-restart",
      });
      expect(
        context.supplementalContext.map(({ referenceId }) => referenceId),
      ).toEqual([durable.memoryId]);
      await secondRepository.close();
    });
  });

  it("rejects corrupted stored memory when it is read", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const repository = createRepository(databasePath);
      const record = createSemanticMemory("semantic-corrupt");
      await repository.insert(record);
      await repository.close();

      const database = new DatabaseSync(databasePath);
      database
        .prepare(
          "UPDATE memory_records SET record_json = ? WHERE memory_id = ?",
        )
        .run('{"memoryId":"semantic-corrupt"}', record.memoryId);
      database.close();

      const reopened = createRepository(databasePath);
      await expect(
        reopened.getById(record.memoryId),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
        stage: "persistence",
      });
      await reopened.close();
    });
  });

  it("migrates schema version 1 without losing lifecycle data", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const lifecycle = new SqliteRepositoryTransactionRunner({
        path: databasePath,
        timeoutMs: 1_000,
      });
      const task = createTask(
        createRequest(),
        "task-before-memory-migration",
        "2026-07-02T10:00:00.000Z",
      );
      await lifecycle.transaction(({ tasks }) => tasks.insert(task));
      await lifecycle.close();

      const legacyDatabase = new DatabaseSync(databasePath);
      legacyDatabase.exec(`
        DROP TABLE reference_vault_audit_events;
        DROP TABLE reference_vault_command_receipts;
        DROP TABLE reference_vault_records;
        DROP TABLE reference_vault_blobs;
        DROP TABLE workflow_lifecycle_events;
        DROP TABLE workflow_lifecycle_records;
        DROP TABLE workflow_step_outcomes;
        DROP TABLE workflow_agent_invocation_events;
        DROP TABLE workflow_agent_invocations;
        DROP TABLE workflow_control_checkpoint_events;
        DROP TABLE workflow_guardian_checkpoints;
        DROP TABLE workflow_approval_checkpoints;
        DROP TABLE workflow_events;
        DROP TABLE workflow_command_receipts;
        DROP TABLE workflow_instances;
        DROP TABLE workflow_definitions;
        DROP TABLE knowledge_records;
        DROP TABLE memory_records;
        DROP TABLE local_workflow_commands;
        DROP TABLE local_workflow_ownership;
        DROP TABLE telegram_outbound_deliveries;
        DROP TABLE telegram_polling_state;
        DROP TABLE telegram_pending_confirmations;
        DROP TABLE telegram_operator_sessions;
        DROP TABLE telegram_callback_tokens;
        DROP TABLE telegram_inbound_receipts;
        DROP TABLE telegram_operator_drafts;
        DROP TABLE telegram_mission_draft_operations;
        DROP TABLE metodo_veloce_content_productions;
        DROP TABLE production_runtime_jobs;
        DROP TABLE evidence_packs;
        DROP TABLE feedback_metric_snapshots;
        DROP TABLE publication_kill_switches;
        DROP TABLE publication_plans;
        DROP TABLE evidence_records;
        DROP TABLE source_registry_entries;
        DROP TABLE business_mission_dossiers;
        DROP TABLE control_action_receipts;
        DROP TABLE control_action_proposals;
        DROP TABLE daily_operating_briefs;
        DROP TABLE founder_workdays;
        DROP TABLE operations_incidents;
        DROP TABLE production_controls;
        DROP TABLE operations_job_successors;
        DROP TABLE operations_runtime_usage_rollups;
        DROP TABLE operations_job_attempts;
        DROP TABLE operations_jobs;
        DROP TABLE operations_events;
        DROP TABLE operations_process_leases;
        DROP TABLE operations_runtime_controls;
        DROP TABLE operations_schedules;
        DROP TABLE social_intelligence_live_records;
        DROP TABLE research_acquisition_snapshots;
        DROP TABLE authorized_research_missions;
        DROP TABLE agent_company_workdays;
        DROP INDEX audit_events_workspace_correlation;
        DELETE FROM schema_migrations WHERE version IN (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31);
        PRAGMA user_version = 1;
      `);
      legacyDatabase.close();

      const memory = createRepository(databasePath);
      await memory.insert(createSemanticMemory("semantic-after-migration"));
      await memory.close();

      const verificationDatabase = new DatabaseSync(databasePath);
      const version = verificationDatabase
        .prepare("PRAGMA user_version")
        .get()?.user_version;
      const migration = verificationDatabase
        .prepare(
          "SELECT name FROM schema_migrations WHERE version = 2",
        )
        .get()?.name;
      verificationDatabase.close();
      expect(version).toBe(SQLITE_SCHEMA_VERSION);
      expect(migration).toBe("durable_memory");

      const reopenedLifecycle =
        new SqliteRepositoryTransactionRunner({
          path: databasePath,
          timeoutMs: 1_000,
        });
      await expect(
        reopenedLifecycle.transaction(({ tasks }) =>
          tasks.getById(task.taskId),
        ),
      ).resolves.toEqual(task);
      await reopenedLifecycle.close();
    });
  });
});

function createRepository(path: string): SqliteMemoryRepository {
  return new SqliteMemoryRepository({
    path,
    timeoutMs: 1_000,
  });
}

function createService(
  repository: SqliteMemoryRepository,
): RepositoryBackedMemoryService {
  return new RepositoryBackedMemoryService({
    clock: new FixedClock("2026-07-02T10:00:00.000Z"),
    queryValidator: new MemoryQueryValidator(),
    recordValidator: new MemoryRecordValidator(),
    repository,
    scopeValidator: new MemoryScopeValidator(),
  });
}

async function withTemporaryDatabase(
  test: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-memory-"));
  try {
    await test(join(directory, "memory.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
