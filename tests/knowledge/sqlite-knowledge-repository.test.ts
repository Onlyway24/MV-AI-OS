import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  AgentSpecificationValidator,
  CONTENT_AGENT_SPECIFICATION,
  KnowledgeExecutionContextBuilder,
  KnowledgeQueryValidator,
  KnowledgeRecordValidator,
  KnowledgeSearchResultValidator,
  RepositoryBackedKnowledgeService,
  RequestExecutionContextBuilder,
  SQLITE_SCHEMA_VERSION,
  SqliteKnowledgeRepository,
  SqliteMemoryRepository,
  SqliteRepositoryTransactionRunner,
  createTask,
  type AuditEvent,
} from "../../src/index.js";
import { InMemoryAgentSpecificationRegistry } from "../support/in-memory-agent-specification-registry.js";
import {
  FixedClock,
  createEmptyMemoryService,
  createRequest,
} from "../support/fixtures.js";
import { createSemanticMemory } from "../memory/fixtures.js";
import {
  createKnowledgeQuery,
  createKnowledgeRecord,
} from "./fixtures.js";
import { runKnowledgeRepositoryConformance } from "./repository-conformance.js";

runKnowledgeRepositoryConformance(
  "SQLite",
  () => createRepository(":memory:"),
);

describe("SQLite knowledge persistence", () => {
  it("preserves permitted knowledge across restart and enriches context", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const request = createRequest();
      const durable = createKnowledgeRecord("knowledge-durable", {
        content: { fact: "Durable knowledge survives restart." },
        searchableText: request.instruction,
      });
      const expired = createKnowledgeRecord("knowledge-expired", {
        expiresAt: "2026-07-02T09:00:00.000Z",
        searchableText: request.instruction,
      });
      const deleted = createKnowledgeRecord("knowledge-deleted", {
        deletedAt: "2026-07-02T09:00:00.000Z",
        searchableText: request.instruction,
      });

      const firstRepository = createRepository(databasePath);
      await firstRepository.insert(durable);
      await firstRepository.insert(expired);
      await firstRepository.insert(deleted);
      await firstRepository.close();

      const secondRepository = createRepository(databasePath);
      const service = createService(secondRepository);
      const result = await service.search(createKnowledgeQuery());
      expect(result.records.map(({ knowledgeId }) => knowledgeId)).toEqual([
        durable.knowledgeId,
      ]);

      const clock = new FixedClock("2026-07-02T10:00:00.000Z");
      const specifications = new InMemoryAgentSpecificationRegistry(
        [CONTENT_AGENT_SPECIFICATION],
        new AgentSpecificationValidator(),
      );
      const context = await new KnowledgeExecutionContextBuilder(
        new RequestExecutionContextBuilder(),
        service,
        specifications,
      ).build({
        agent: {
          agentId: CONTENT_AGENT_SPECIFICATION.agentId,
          version: CONTENT_AGENT_SPECIFICATION.version,
        },
        contextId: "context-after-knowledge-restart",
        createdAt: "2026-07-02T10:00:00.000Z",
        effectivePermissions: ["knowledge:search"],
        memory: createEmptyMemoryService(clock),
        request,
        taskId: "task-after-knowledge-restart",
      });
      expect(
        context.supplementalContext.map(({ referenceId }) => referenceId),
      ).toEqual([durable.knowledgeId]);
      await secondRepository.close();
    });
  });

  it("rejects corrupted stored knowledge when it is read", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const repository = createRepository(databasePath);
      const record = createKnowledgeRecord("knowledge-corrupt");
      await repository.insert(record);
      await repository.close();

      const database = new DatabaseSync(databasePath);
      database
        .prepare(
          "UPDATE knowledge_records SET record_json = ? WHERE knowledge_id = ?",
        )
        .run('{"knowledgeId":"knowledge-corrupt"}', record.knowledgeId);
      database.close();

      const reopened = createRepository(databasePath);
      await expect(
        reopened.getById(record.knowledgeId),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
        stage: "persistence",
      });
      await reopened.close();
    });
  });

  it("migrates schema version 2 without losing lifecycle, audit, or memory data", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const task = createTask(
        createRequest(),
        "task-before-knowledge-migration",
        "2026-07-02T10:00:00.000Z",
      );
      const audit = createAuditEvent(task.taskId);
      const lifecycle = new SqliteRepositoryTransactionRunner({
        path: databasePath,
        timeoutMs: 1_000,
      });
      await lifecycle.transaction(async ({ audits, tasks }) => {
        await tasks.insert(task);
        await audits.append(audit);
      });
      await lifecycle.close();

      const memoryRecord = createSemanticMemory(
        "memory-before-knowledge-migration",
      );
      const memory = new SqliteMemoryRepository({
        path: databasePath,
        timeoutMs: 1_000,
      });
      await memory.insert(memoryRecord);
      await memory.close();

      const legacyDatabase = new DatabaseSync(databasePath);
      legacyDatabase.exec(`
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
        DROP INDEX audit_events_workspace_correlation;
        DELETE FROM schema_migrations WHERE version IN (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18);
        PRAGMA user_version = 2;
      `);
      legacyDatabase.close();

      const knowledge = createRepository(databasePath);
      const knowledgeRecord = createKnowledgeRecord(
        "knowledge-after-migration",
      );
      await knowledge.insert(knowledgeRecord);
      await knowledge.close();

      const verificationDatabase = new DatabaseSync(databasePath);
      const version = verificationDatabase
        .prepare("PRAGMA user_version")
        .get()?.user_version;
      const migration = verificationDatabase
        .prepare(
          "SELECT name FROM schema_migrations WHERE version = 3",
        )
        .get()?.name;
      verificationDatabase.close();
      expect(version).toBe(SQLITE_SCHEMA_VERSION);
      expect(migration).toBe("durable_knowledge");

      const reopenedLifecycle =
        new SqliteRepositoryTransactionRunner({
          path: databasePath,
          timeoutMs: 1_000,
        });
      const lifecycleState = await reopenedLifecycle.transaction(
        async ({ audits, tasks }) => ({
          audits: await audits.listByCorrelationId(audit.correlationId),
          task: await tasks.getById(task.taskId),
        }),
      );
      expect(lifecycleState).toEqual({ audits: [audit], task });
      await reopenedLifecycle.close();

      const reopenedMemory = new SqliteMemoryRepository({
        path: databasePath,
        timeoutMs: 1_000,
      });
      await expect(
        reopenedMemory.getById(memoryRecord.memoryId),
      ).resolves.toEqual(memoryRecord);
      await reopenedMemory.close();
    });
  });
});

function createRepository(path: string): SqliteKnowledgeRepository {
  return new SqliteKnowledgeRepository({
    path,
    timeoutMs: 1_000,
  });
}

function createService(
  repository: SqliteKnowledgeRepository,
): RepositoryBackedKnowledgeService {
  return new RepositoryBackedKnowledgeService({
    clock: new FixedClock("2026-07-02T10:00:00.000Z"),
    queryValidator: new KnowledgeQueryValidator(),
    recordValidator: new KnowledgeRecordValidator(),
    repository,
    resultValidator: new KnowledgeSearchResultValidator(),
  });
}

function createAuditEvent(taskId: string): AuditEvent {
  return {
    action: "task.validate",
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-before-knowledge-migration",
    eventId: "audit-before-knowledge-migration",
    eventType: "task.validated",
    metadata: {},
    occurredAt: "2026-07-02T10:00:00.000Z",
    outcome: "success",
    schemaVersion: "1",
    taskId,
    workspaceId: "workspace-local",
  };
}

async function withTemporaryDatabase(
  test: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-knowledge-"));
  try {
    await test(join(directory, "knowledge.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
