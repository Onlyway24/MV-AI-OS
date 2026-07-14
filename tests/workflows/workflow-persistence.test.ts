import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  createSqliteBackup,
  createTask,
  createWorkflowPersistenceService,
  DeterministicWorkflowStateMachine,
  restoreSqliteBackup,
  SqliteRepositoryTransactionRunner,
  SqliteKnowledgeRepository,
  SqliteMemoryRepository,
  STORED_REQUEST_SCHEMA_VERSION,
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
  type WorkflowCommand,
  type AuditEvent,
  type WorkflowCommandApplication,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowEventDraft,
  type WorkflowInstance,
  type WorkflowPersistenceService,
} from "../../src/index.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";
import { createKnowledgeRecord } from "../knowledge/fixtures.js";
import { createSemanticMemory } from "../memory/fixtures.js";

describe("Workflow Persistence and Atomic Audit", () => {
  it("rejects undefined or self dependencies and impossible persisted terminal state", () => {
    const definition = workflowDefinition({
      steps: [
        {
          approvalRequired: false,
          dependencies: ["step-missing"],
          guardianRequired: false,
          nonExecuting: true,
          stepId: "step-01",
        },
      ],
    });
    expect(new WorkflowDefinitionValidator().validate(definition).ok).toBe(false);
    expect(
      new WorkflowDefinitionValidator().validate({
        ...definition,
        steps: [{ ...definition.steps[0], dependencies: ["step-01"] }],
      }).ok,
    ).toBe(false);
    expect(
      new WorkflowInstanceValidator().validate({
        ...workflowInstance(),
        status: "COMPLETED",
      }).ok,
    ).toBe(false);
  });

  it("persists immutable definitions, instances, receipts, step state, and ordered events", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    const definition = workflowDefinition();
    const instance = workflowInstance();

    await service.createDefinition(definition);
    await service.createInstance(instance);
    const transition = await service.applyCommand(
      commandApplication("COMPLETE_STEP", {
        commandId: "complete-step-001",
        stepId: "step-01",
      }),
    );

    expect(transition).toMatchObject({
      outcome: "APPLIED",
      instance: {
        status: "COMPLETED",
        steps: [{ status: "SUCCEEDED", stepId: "step-01" }],
        version: 1,
      },
    });
    const stored = await runner.transaction(async ({ workflows }) => ({
      definition: await workflows.definitions.getById(definition.definitionId),
      events: await workflows.events.listByInstanceId(instance.instanceId, 10),
      instance: await workflows.instances.getById(instance.instanceId),
      receipts: await workflows.receipts.listByInstanceId(instance.instanceId),
    }));
    expect(stored.definition).toEqual(definition);
    expect(stored.instance).toEqual(transition.instance);
    expect(stored.receipts).toEqual(transition.instance.receipts);
    expect(stored.events).toMatchObject([
      {
        actorCategory: "operator",
        commandId: "complete-step-001",
        commandKind: "COMPLETE_STEP",
        instanceVersion: 1,
        nextStatus: "COMPLETED",
        previousStatus: "ACTIVE",
        sequence: 1,
        summaryCode: "workflow_transition_applied",
      },
    ]);
    expect(Object.isFrozen(stored.instance)).toBe(true);
    expect(Object.isFrozen(stored.events)).toBe(true);
    await runner.close();
  });

  it("rejects immutable definition replacement and stale instance updates", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    const definition = workflowDefinition();
    await service.createDefinition(definition);
    await expect(service.createDefinition(definition)).rejects.toMatchObject({
      code: "repository_conflict",
      stage: "persistence",
    });

    const instance = workflowInstance();
    await service.createInstance(instance);
    await expect(
      runner.transaction(({ workflows }) =>
        workflows.instances.update(
          {
            ...instance,
            receipts: [receipt("command-stale", 1)],
            updatedAt: "2026-07-02T10:00:02.000Z",
            version: 1,
          },
          { version: 1 },
        ),
      ),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    await runner.close();
  });

  it("rejects invalid workflow and step transitions at the repository boundary", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    const definition = workflowDefinition();
    const instance = workflowInstance();
    await service.createDefinition(definition);
    await service.createInstance(instance);

    await expect(
      runner.transaction(({ workflows }) =>
        workflows.instances.update(
          {
            ...instance,
            receipts: [receipt("invalid-step-command", 1)],
            steps: [
              {
                blockers: [],
                status: "PENDING",
                stepId: "step-01",
              },
            ],
            updatedAt: "2026-07-02T10:00:02.000Z",
            version: 1,
          },
          { version: 0 },
        ),
      ),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    await runner.close();
  });

  it("replays duplicate commands after a genuine process restart without another event", async () => {
    await withTemporaryDatabase(async (path) => {
      const definition = workflowDefinition();
      const instance = workflowInstance();
      const firstRunner = createRunner(path);
      const firstService = createService(firstRunner, "first-event");
      await firstService.createDefinition(definition);
      await firstService.createInstance(instance);
      const first = await firstService.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "restart-command-001",
          stepId: "step-01",
        }),
      );
      await firstRunner.close();

      const secondRunner = createRunner(path);
      const secondService = createService(secondRunner, "second-event");
      const replay = await secondService.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "restart-command-001",
          stepId: "step-01",
        }),
      );
      const persisted = await secondRunner.transaction(async ({ workflows }) => ({
        events: await workflows.events.listByInstanceId(instance.instanceId, 10),
        instance: await workflows.instances.getById(instance.instanceId),
        receipts: await workflows.receipts.listByInstanceId(instance.instanceId),
      }));

      expect(replay).toEqual({
        instance: first.instance,
        nonExecuting: true,
        outcome: "REPLAYED",
      });
      expect(persisted.instance?.version).toBe(1);
      expect(persisted.receipts).toHaveLength(1);
      expect(persisted.events).toHaveLength(1);
      await secondRunner.close();
    });
  });

  it("orders workflow events deterministically by durable sequence", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "ordered-event");
    await service.createDefinition(workflowDefinition({ steps: [
      { approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "step-01" },
      { approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "step-02" },
    ] }));
    await service.createInstance(workflowInstance({ steps: [
      { blockers: [], status: "AWAITING_RESULT", stepId: "step-01" },
      { blockers: [], status: "AWAITING_RESULT", stepId: "step-02" },
    ] }));
    await service.applyCommand(
      commandApplication("COMPLETE_STEP", { commandId: "ordered-complete", stepId: "step-01" }),
    );
    await service.applyCommand(
      commandApplication("FAIL_STEP", {
        commandId: "ordered-fail",
        expectedVersion: 1,
        stepId: "step-02",
      }),
    );

    const events = await runner.transaction(({ workflows }) =>
      workflows.events.listByInstanceId("workflow-instance-001", 10),
    );
    expect(events.map(({ commandId, sequence }) => ({ commandId, sequence }))).toEqual([
      { commandId: "ordered-complete", sequence: 1 },
      { commandId: "ordered-fail", sequence: 2 },
    ]);
    await runner.close();
  });

  it("rejects direct duplicate and redaction-unsafe workflow events", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    const definition = workflowDefinition();
    const instance = workflowInstance();
    await service.createDefinition(definition);
    await service.createInstance(instance);
    await service.applyCommand(
      commandApplication("COMPLETE_STEP", {
        commandId: "event-boundary-command",
        stepId: "step-01",
      }),
    );
    const draft = workflowEventDraft({
      commandId: "event-boundary-command",
      definition,
      instance,
    });

    await expect(
      runner.transaction(({ workflows }) =>
        workflows.events.append({ ...draft, eventId: "event-duplicate" }),
      ),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    const failure = await runner
      .transaction(({ workflows }) =>
        workflows.events.append({
          ...draft,
          eventId: "sk-private-key-material",
        }),
      )
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "repository_record_invalid" });
    expect(JSON.stringify(failure)).not.toContain("sk-private-key-material");
    await runner.close();
  });

  it("rejects reused command IDs with a different payload and stale concurrent commands", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    await service.createDefinition(workflowDefinition());
    await service.createInstance(workflowInstance());
    await service.applyCommand(
      commandApplication("COMPLETE_STEP", { commandId: "shared-command", stepId: "step-01" }),
    );
    await expect(
      service.applyCommand(
        commandApplication("FAIL_STEP", {
          commandId: "shared-command",
          expectedVersion: 1,
          stepId: "step-01",
        }),
      ),
    ).rejects.toMatchObject({ code: "repository_conflict" });

    const secondDefinition = workflowDefinition({
      definitionId: "workflow-definition-other@1.0.0",
      workflowId: "workflow-other",
    });
    const secondInstance = workflowInstance({
      definitionId: secondDefinition.definitionId,
      instanceId: "workflow-instance-other",
    });
    await service.createDefinition(secondDefinition);
    await service.createInstance(secondInstance);
    const results = await Promise.allSettled([
      service.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "concurrent-complete",
          instanceId: secondInstance.instanceId,
          stepId: "step-01",
        }),
      ),
      service.applyCommand(
        commandApplication("FAIL_STEP", {
          commandId: "concurrent-fail",
          instanceId: secondInstance.instanceId,
          stepId: "step-01",
        }),
      ),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const persisted = await runner.transaction(({ workflows }) =>
      workflows.instances.getById(secondInstance.instanceId),
    );
    expect(persisted?.version).toBe(1);
    await runner.close();
  });

  it("allows only one writer from an expected version across independent SQLite runners", async () => {
    await withTemporaryDatabase(async (path) => {
      const definition = workflowDefinition();
      const instance = workflowInstance();
      const setupRunner = createRunner(path);
      const setupService = createService(setupRunner, "setup-event");
      await setupService.createDefinition(definition);
      await setupService.createInstance(instance);
      await setupRunner.close();

      const firstRunner = createRunner(path);
      const secondRunner = createRunner(path);
      const results = await Promise.allSettled([
        createService(firstRunner, "first-event").applyCommand(
          commandApplication("COMPLETE_STEP", { commandId: "first-writer", stepId: "step-01" }),
        ),
        createService(secondRunner, "second-event").applyCommand(
          commandApplication("FAIL_STEP", { commandId: "second-writer", stepId: "step-01" }),
        ),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);

      await firstRunner.close();
      await secondRunner.close();
      const verifier = createRunner(path);
      const stored = await verifier.transaction(({ workflows }) =>
        workflows.instances.getById(instance.instanceId),
      );
      expect(stored?.version).toBe(1);
      await verifier.close();
    });
  });

  it("rolls back state and receipts when event persistence fails", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "fixed-event", true);
    const firstDefinition = workflowDefinition();
    const firstInstance = workflowInstance();
    const secondDefinition = workflowDefinition({
      definitionId: "workflow-definition-rollback@1.0.0",
      workflowId: "workflow-rollback",
    });
    const secondInstance = workflowInstance({
      definitionId: secondDefinition.definitionId,
      instanceId: "workflow-instance-rollback",
    });
    await service.createDefinition(firstDefinition);
    await service.createInstance(firstInstance);
    await service.createDefinition(secondDefinition);
    await service.createInstance(secondInstance);
    await service.applyCommand(
      commandApplication("COMPLETE_STEP", {
        commandId: "first-event-command",
        stepId: "step-01",
      }),
    );

    await expect(
      service.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "rollback-event-command",
          instanceId: secondInstance.instanceId,
          stepId: "step-01",
        }),
      ),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    const state = await runner.transaction(async ({ workflows }) => ({
      events: await workflows.events.listByInstanceId(secondInstance.instanceId, 10),
      instance: await workflows.instances.getById(secondInstance.instanceId),
      receipts: await workflows.receipts.listByInstanceId(secondInstance.instanceId),
    }));
    expect(state.instance).toEqual(secondInstance);
    expect(state.receipts).toEqual([]);
    expect(state.events).toEqual([]);
    await runner.close();
  });

  it("rolls back a versioned instance update when receipt persistence fails", async () => {
    const runner = createRunner(":memory:");
    const service = createService(runner, "workflow-event");
    const definition = workflowDefinition();
    const instance = workflowInstance();
    await service.createDefinition(definition);
    await service.createInstance(instance);
    const stateMachine = new DeterministicWorkflowStateMachine(new FixedClock());
    const transition = stateMachine.apply(instance, {
      commandId: "receipt-rollback-command",
      expectedVersion: 0,
      kind: "COMPLETE_STEP",
      nonExecuting: true,
      reasonCode: "operator-request",
      stepId: "step-01",
    });
    const transitionReceipt = transition.instance.receipts.at(-1);
    if (transitionReceipt === undefined) {
      throw new Error("workflow fixture did not produce a receipt");
    }

    await expect(
      runner.transaction(async ({ workflows }) => {
        await workflows.instances.update(transition.instance, { version: 0 });
        await workflows.receipts.insert(instance.instanceId, transitionReceipt);
        await workflows.receipts.insert(instance.instanceId, transitionReceipt);
      }),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    const state = await runner.transaction(async ({ workflows }) => ({
      events: await workflows.events.listByInstanceId(instance.instanceId, 10),
      instance: await workflows.instances.getById(instance.instanceId),
      receipts: await workflows.receipts.listByInstanceId(instance.instanceId),
    }));
    expect(state).toEqual({ events: [], instance, receipts: [] });
    await runner.close();
  });

  it("fails closed for missing definitions, malformed records, and unsafe command text", async () => {
    await withTemporaryDatabase(async (path) => {
      const definition = workflowDefinition();
      const instance = workflowInstance();
      const runner = createRunner(path);
      const service = createService(runner, "workflow-event");
      await service.createDefinition(definition);
      await service.createInstance(instance);
      await runner.close();

      const database = new DatabaseSync(path);
      database.exec("PRAGMA foreign_keys = OFF");
      database
        .prepare("DELETE FROM workflow_definitions WHERE definition_id = ?")
        .run(definition.definitionId);
      database.close();

      const reopened = createRunner(path);
      const reopenedService = createService(reopened, "workflow-event");
      await expect(
        reopenedService.applyCommand(commandApplication("PAUSE")),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
        stage: "persistence",
      });
      await reopened.close();

      const validRunner = createRunner(":memory:");
      const validService = createService(validRunner, "workflow-event");
      const unsafe = commandApplication("PAUSE", {
        commandId: "unsafe-command",
        reasonCode: "sk-private-model-secret",
      });
      const failure = await validService
        .applyCommand(unsafe)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: "repository_record_invalid" });
      expect(JSON.stringify(failure)).not.toContain("sk-private-model-secret");
      await validRunner.close();
    });
  });

  it("validates corrupted definition, instance, receipt, and event JSON on read", async () => {
    await withTemporaryDatabase(async (path) => {
      const runner = createRunner(path);
      const service = createService(runner, "workflow-event");
      const definition = workflowDefinition();
      const instance = workflowInstance();
      await service.createDefinition(definition);
      await service.createInstance(instance);
      await service.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "corrupt-command",
          stepId: "step-01",
        }),
      );
      await runner.close();

      const database = new DatabaseSync(path);
      database
        .prepare("UPDATE workflow_definitions SET record_json = ?")
        .run('{"definitionId":"workflow-definition@1.0.0"}');
      database
        .prepare("UPDATE workflow_instances SET record_json = ?")
        .run('{"instanceId":"workflow-instance-001"}');
      database
        .prepare("UPDATE workflow_command_receipts SET record_json = ?")
        .run('{"commandId":"corrupt-command"}');
      database
        .prepare("UPDATE workflow_events SET record_json = ?")
        .run('{"summaryCode":"provider payload"}');
      database.close();

      const reopened = createRunner(path);
      await expect(
        reopened.transaction(({ workflows }) =>
          workflows.definitions.getById(definition.definitionId),
        ),
      ).rejects.toMatchObject({ code: "repository_record_invalid" });
      await expect(
        reopened.transaction(({ workflows }) =>
          workflows.instances.getById(instance.instanceId),
        ),
      ).rejects.toMatchObject({ code: "repository_record_invalid" });
      await expect(
        reopened.transaction(({ workflows }) =>
          workflows.receipts.listByInstanceId(instance.instanceId),
        ),
      ).rejects.toMatchObject({ code: "repository_record_invalid" });
      await expect(
        reopened.transaction(({ workflows }) =>
          workflows.events.listByInstanceId(instance.instanceId, 10),
        ),
      ).rejects.toMatchObject({ code: "repository_record_invalid" });
      await reopened.close();
    });
  });

  it("preserves workflow state, receipts, and events through backup and restore", async () => {
    await withTemporaryDatabase(async (path, directory) => {
      const backupPath = join(directory, "workflow.backup.sqlite");
      const restoredPath = join(directory, "workflow.restored.sqlite");
      const runner = createRunner(path);
      const service = createService(runner, "workflow-event");
      const definition = workflowDefinition();
      const instance = workflowInstance();
      await service.createDefinition(definition);
      await service.createInstance(instance);
      const result = await service.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "backup-command",
          stepId: "step-01",
        }),
      );
      await runner.close();
      await createSqliteBackup({
        contractVersion: "1",
        destinationPath: backupPath,
        overwriteDestination: false,
        sourcePath: path,
        timeoutMs: 1_000,
      });
      await restoreSqliteBackup({
        backupPath,
        contractVersion: "1",
        destinationPath: restoredPath,
        overwriteDestination: false,
        timeoutMs: 1_000,
      });

      const restoredRunner = createRunner(restoredPath);
      const restoredService = createService(restoredRunner, "restored-event");
      const replay = await restoredService.applyCommand(
        commandApplication("COMPLETE_STEP", {
          commandId: "backup-command",
          stepId: "step-01",
        }),
      );
      const restored = await restoredRunner.transaction(async ({ workflows }) => ({
        definition: await workflows.definitions.getById(definition.definitionId),
        events: await workflows.events.listByInstanceId(instance.instanceId, 10),
        instance: await workflows.instances.getById(instance.instanceId),
        receipts: await workflows.receipts.listByInstanceId(instance.instanceId),
      }));
      expect(restored.definition).toEqual(definition);
      expect(restored.instance).toEqual(result.instance);
      expect(restored.receipts).toEqual(result.instance.receipts);
      expect(restored.events).toHaveLength(1);
      expect(replay.outcome).toBe("REPLAYED");
      await restoredRunner.close();
    });
  });

  it("migrates schema version 3 without losing task, request, audit, memory, or knowledge records", async () => {
    await withTemporaryDatabase(async (path) => {
      const request = createRequest();
      const task = createTask(
        request,
        "task-before-workflow-migration",
        "2026-07-02T10:00:00.000Z",
      );
      const storedRequest = {
        createdAt: task.createdAt,
        requestFingerprint:
          "c320ee51f3a595322c9bcbe308d69eb3af293ffb9c4e8e0dd4f19126616cc404",
        requestId: request.requestId,
        schemaVersion: STORED_REQUEST_SCHEMA_VERSION,
        taskId: task.taskId,
        updatedAt: task.updatedAt,
      } as const;
      const audit = auditEvent(task.taskId);
      const lifecycle = createRunner(path);
      await lifecycle.transaction(async ({ audits, requests, tasks }) => {
        await requests.insert(storedRequest);
        await tasks.insert(task);
        await audits.append(audit);
      });
      await lifecycle.close();

      const memory = new SqliteMemoryRepository({ path, timeoutMs: 1_000 });
      const memoryRecord = createSemanticMemory("memory-before-workflow-migration");
      await memory.insert(memoryRecord);
      await memory.close();
      const knowledge = new SqliteKnowledgeRepository({ path, timeoutMs: 1_000 });
      const knowledgeRecord = createKnowledgeRecord(
        "knowledge-before-workflow-migration",
      );
      await knowledge.insert(knowledgeRecord);
      await knowledge.close();

      const legacy = new DatabaseSync(path);
      legacy.exec(`
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
        DROP INDEX audit_events_workspace_correlation;
        DELETE FROM schema_migrations WHERE version = 14;
        DELETE FROM schema_migrations WHERE version = 13;
        DELETE FROM schema_migrations WHERE version = 12;
        DELETE FROM schema_migrations WHERE version = 11;
        DELETE FROM schema_migrations WHERE version = 10;
        DELETE FROM schema_migrations WHERE version = 9;
        DELETE FROM schema_migrations WHERE version = 8;
        DELETE FROM schema_migrations WHERE version = 7;
        DELETE FROM schema_migrations WHERE version = 6;
        DELETE FROM schema_migrations WHERE version = 5;
        DELETE FROM schema_migrations WHERE version = 4;
        DELETE FROM schema_migrations WHERE version IN (15, 16, 17, 18, 19, 20);
        PRAGMA user_version = 3;
      `);
      legacy.close();

      const migrated = createRunner(path);
      const lifecycleState = await migrated.transaction(
        async ({ audits, requests, tasks }) => ({
          audit: await audits.listByCorrelationId(audit.correlationId),
          request: await requests.getById(request.requestId),
          task: await tasks.getById(task.taskId),
        }),
      );
      expect(lifecycleState).toEqual({
        audit: [audit],
        request: storedRequest,
        task,
      });
      await migrated.close();

      const reopenedMemory = new SqliteMemoryRepository({
        path,
        timeoutMs: 1_000,
      });
      await expect(reopenedMemory.getById(memoryRecord.memoryId)).resolves.toEqual(
        memoryRecord,
      );
      await reopenedMemory.close();
      const reopenedKnowledge = new SqliteKnowledgeRepository({
        path,
        timeoutMs: 1_000,
      });
      await expect(
        reopenedKnowledge.getById(knowledgeRecord.knowledgeId),
      ).resolves.toEqual(knowledgeRecord);
      await reopenedKnowledge.close();

      const verification = new DatabaseSync(path);
      expect(verification.prepare("PRAGMA user_version").get()?.user_version).toBe(20);
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 5")
          .get()?.name,
      ).toBe("durable_workflow_control_checkpoints");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 6")
          .get()?.name,
      ).toBe("durable_workflow_agent_invocations");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 7")
          .get()?.name,
      ).toBe("durable_workflow_step_outcomes");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 8")
          .get()?.name,
      ).toBe("durable_workflow_lifecycle");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 9")
          .get()?.name,
      ).toBe("explicit_workflow_retry_execution");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 10")
          .get()?.name,
      ).toBe("explicit_workflow_lifecycle_control");
      expect(
        verification
          .prepare("SELECT name FROM schema_migrations WHERE version = 11")
          .get()?.name,
      ).toBe("explicit_workflow_timeout_evaluation");
      expect(verification.prepare("SELECT name FROM schema_migrations WHERE version = 12").get()?.name).toBe("core_v1_local_productization");
      verification.close();
    });
  });
});

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
}

function createService(
  repositories: SqliteRepositoryTransactionRunner,
  prefix: string,
  fixedEventId = false,
): WorkflowPersistenceService {
  const eventIds: WorkflowEventIdentifierGenerator = fixedEventId
    ? new FixedWorkflowEventIds(`${prefix}-001`)
    : new SequenceWorkflowEventIds(prefix);
  return createWorkflowPersistenceService({
    eventIds,
    repositories,
    stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()),
  });
}

function workflowDefinition(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    contractVersion: "1",
    definitionId: "workflow-definition@1.0.0",
    nonExecuting: true,
    steps: [
      {
        approvalRequired: false,
        dependencies: [],
        guardianRequired: false,
        nonExecuting: true,
        stepId: "step-01",
      },
    ],
    workflowId: "workflow-main",
    workflowVersion: "1.0.0",
    ...overrides,
  };
}

function workflowInstance(
  overrides: Partial<WorkflowInstance> = {},
): WorkflowInstance {
  return {
    contractVersion: "1",
    createdAt: "2026-07-02T10:00:00.000Z",
    definitionId: "workflow-definition@1.0.0",
    instanceId: "workflow-instance-001",
    nonExecuting: true,
    receipts: [],
    status: "ACTIVE",
    steps: [
      {
        blockers: [],
        status: "AWAITING_RESULT",
        stepId: "step-01",
      },
    ],
    stopReason: "NONE",
    updatedAt: "2026-07-02T10:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

function commandApplication(
  kind: WorkflowCommand["kind"],
  overrides: Omit<Partial<WorkflowCommand>, "nonExecuting"> & {
    readonly instanceId?: string;
  } = {},
): WorkflowCommandApplication {
  const { instanceId = "workflow-instance-001", ...commandOverrides } = overrides;
  return {
    actorCategory: "operator" as const,
    command: {
      commandId: `command-${kind.toLowerCase()}`,
      expectedVersion: 0,
      kind,
      nonExecuting: true,
      reasonCode: "operator-request",
      ...commandOverrides,
    },
    instanceId,
  };
}

function receipt(commandId: string, resultingVersion: number) {
  return {
    commandId,
    fingerprint:
      "a5ce6c707ca4063896354847129ad9a1954df1f00fae5f7076ba0738c649d785",
    resultingVersion,
  };
}

function workflowEventDraft(input: {
  readonly commandId: string;
  readonly definition: WorkflowDefinition;
  readonly instance: WorkflowInstance;
}): WorkflowEventDraft {
  return {
    actorCategory: "operator",
    commandId: input.commandId,
    commandKind: "COMPLETE_STEP",
    contractVersion: "1",
    definitionId: input.definition.definitionId,
    eventId: "event-direct",
    instanceId: input.instance.instanceId,
    instanceVersion: 1,
    nextStatus: "COMPLETED",
    nextStepStatus: "SUCCEEDED",
    nonExecuting: true,
    occurredAt: "2026-07-02T10:00:01.000Z",
    previousStatus: "ACTIVE",
    previousStepStatus: "AWAITING_RESULT",
    reasonCode: "operator-request",
    stepId: "step-01",
    summaryCode: "workflow_transition_applied",
    workflowId: input.definition.workflowId,
    workflowVersion: input.definition.workflowVersion,
  };
}

function auditEvent(taskId: string): AuditEvent {
  return {
    action: "workflow.migration",
    actorId: "actor-local",
    contractVersion: "1",
    correlationId: "correlation-before-workflow-migration",
    eventId: "audit-before-workflow-migration",
    eventType: "workflow.migration",
    metadata: {},
    occurredAt: "2026-07-02T10:00:00.000Z",
    outcome: "success",
    schemaVersion: "1",
    taskId,
    workspaceId: "workspace-local",
  };
}

class SequenceWorkflowEventIds implements WorkflowEventIdentifierGenerator {
  #sequence = 0;
  readonly #prefix: string;

  public constructor(prefix: string) {
    this.#prefix = prefix;
  }

  public nextWorkflowEventId(): string {
    this.#sequence += 1;
    return `${this.#prefix}-${String(this.#sequence)}`;
  }
}

class FixedWorkflowEventIds implements WorkflowEventIdentifierGenerator {
  readonly #value: string;

  public constructor(value: string) {
    this.#value = value;
  }

  public nextWorkflowEventId(): string {
    return this.#value;
  }
}

async function withTemporaryDatabase(
  test: (path: string, directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-workflow-"));
  try {
    await test(join(directory, "workflow.sqlite"), directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
