import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  AgentSpecificationValidator,
  createWorkflowControlCheckpointService,
  createWorkflowPersistenceService,
  createWorkflowStepExecutionBoundary,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  DEFAULT_AGENT_COMPANY_MAP,
  DEFAULT_AGENT_PERMISSION_MATRIX,
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  DeterministicWorkflowStateMachine,
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  ImmutableAgentSpecificationRegistry,
  INITIAL_CORE_AGENT_SPECIFICATIONS,
  SqliteRepositoryTransactionRunner,
  WorkflowApprovalCheckpointValidator,
  WorkflowGuardianCheckpointValidator,
  type PolicyDecision,
  type WorkflowApprovalCheckpoint,
  type WorkflowControlCheckpointEventIdentifierGenerator,
  type WorkflowControlCheckpointService,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowGuardianCheckpoint,
  type WorkflowInstance,
  type WorkflowStepExecutionBoundaryRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Durable Workflow Approval and Guardian Checkpoints", () => {
  it("persists exact approval and Guardian decisions with ordered atomic audit", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const service = checkpointService(runner);

    const approval = await service.recordApproval(approvalCheckpoint());
    const guardian = await service.recordGuardian(guardianCheckpoint());

    expect(approval.outcome).toBe("APPLIED");
    expect(guardian.outcome).toBe("APPLIED");
    expect(Object.isFrozen(approval)).toBe(true);
    await runner.transaction(async ({ workflows }) => {
      expect(await workflows.approvals.listBySnapshot(
        "workflow-checkpoint-instance",
        0,
        "research",
      )).toEqual([approvalCheckpoint()]);
      expect(await workflows.guardians.listBySnapshot(
        "workflow-checkpoint-instance",
        0,
        "research",
      )).toEqual([guardianCheckpoint()]);
      const events = await workflows.controlEvents.listByInstanceId(
        "workflow-checkpoint-instance",
        10,
      );
      expect(events.map(({ checkpointId, checkpointKind, sequence }) => ({
        checkpointId,
        checkpointKind,
        sequence,
      }))).toEqual([
        { checkpointId: "approval-research-001", checkpointKind: "APPROVAL", sequence: 1 },
        { checkpointId: "guardian-research-security-001", checkpointKind: "GUARDIAN", sequence: 2 },
      ]);
      expect(JSON.stringify(events)).not.toMatch(
        /prompt|completion|secret|providerPayload|rawKnowledge|rawMemory|transcript|sk-/iu,
      );
    });
    await runner.close();
  });

  it("replays exact checkpoint IDs and rejects conflicting reuse", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const service = checkpointService(runner);
    const checkpoint = approvalCheckpoint();

    expect((await service.recordApproval(checkpoint)).outcome).toBe("APPLIED");
    expect((await service.recordApproval(checkpoint)).outcome).toBe("REPLAYED");
    await expect(
      service.recordApproval({ ...checkpoint, status: "REJECTED" }),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    await runner.transaction(async ({ workflows }) => {
      expect(await workflows.controlEvents.listByInstanceId(
        checkpoint.instanceId,
        10,
      )).toHaveLength(1);
    });
    await runner.close();
  });

  it("fails closed for wrong authority, stale snapshots, invalid bindings, and malformed records", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const service = checkpointService(runner);

    await expect(
      service.recordApproval(approvalCheckpoint({ authorityActorId: "other-actor" })),
    ).rejects.toMatchObject({ code: "repository_record_invalid" });
    await expect(
      service.recordApproval(approvalCheckpoint({ instanceVersion: 1 })),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    await expect(
      service.recordGuardian(guardianCheckpoint({ stepId: "unknown-step" })),
    ).rejects.toMatchObject({ code: "repository_conflict" });
    await expect(
      service.recordGuardian(guardianCheckpoint({ workflowVersion: "2.0.0" })),
    ).rejects.toMatchObject({ code: "repository_conflict" });

    const approvalValidator = new WorkflowApprovalCheckpointValidator();
    expect(approvalValidator.validate({ ...approvalCheckpoint(), unexpected: true }).ok).toBe(false);
    expect(approvalValidator.validate({ ...approvalCheckpoint(), nonExecuting: false }).ok).toBe(false);
    const secret = "sk-private-checkpoint-secret";
    const unsafe = approvalValidator.validate({ ...approvalCheckpoint(), evidenceId: secret });
    expect(unsafe.ok).toBe(false);
    expect(JSON.stringify(unsafe)).not.toContain(secret);
    const guardianValidator = new WorkflowGuardianCheckpointValidator();
    expect(guardianValidator.validate({ ...guardianCheckpoint(), domain: "unknown" }).ok).toBe(false);
    await runner.close();
  });

  it("requires linear supersession and makes withdrawal or blocking decisions authoritative", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const service = checkpointService(runner);
    await recordClearControls(service);

    await expect(
      service.recordApproval(approvalCheckpoint({
        evidenceId: "approval-withdrawn-invalid",
        recordedAt: "2026-07-02T10:00:02.000Z",
        status: "WITHDRAWN",
      })),
    ).rejects.toMatchObject({ code: "repository_conflict" });

    await service.recordApproval(approvalCheckpoint({
      evidenceId: "approval-research-withdrawn",
      recordedAt: "2026-07-02T10:00:02.000Z",
      status: "WITHDRAWN",
      supersedesEvidenceId: "approval-research-001",
    }));
    await service.recordGuardian(guardianCheckpoint({
      evidenceId: "guardian-research-security-blocked",
      recordedAt: "2026-07-02T10:00:03.000Z",
      status: "BLOCKED",
      supersedesEvidenceId: "guardian-research-security-001",
    }));

    const result = await boundary(runner).prepare(boundaryRequest());
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") {
      expect(result.blockers.map(({ code }) => code)).toContain("APPROVAL_INVALID");
      expect(result.blockers.map(({ code }) => code)).toContain("GUARDIAN_BLOCKED");
    }
    await runner.close();
  });

  it("uses durable checkpoints in the candidate boundary without transient evidence", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const before = await boundary(runner).prepare(boundaryRequest());
    expect(before.status).toBe("BLOCKED");
    if (before.status === "BLOCKED") {
      expect(before.blockers.map(({ code }) => code)).toContain("APPROVAL_REQUIRED");
      expect(before.blockers.map(({ code }) => code)).toContain("GUARDIAN_REQUIRED");
    }
    await recordClearControls(checkpointService(runner));

    const result = await boundary(runner).prepare(boundaryRequest());
    expect(result.status).toBe("CANDIDATE_AVAILABLE");
    if (result.status === "CANDIDATE_AVAILABLE") {
      expect(result.candidate.approvalEvidenceIds).toEqual([
        "approval-research-001",
      ]);
      expect(result.candidate.guardianEvidenceIds).toEqual([
        "guardian-research-operator-safety-001",
        "guardian-research-quality-001",
        "guardian-research-security-001",
      ]);
    }
    await runner.close();
  });

  it("rolls back a checkpoint when its audit event cannot be written", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const service = createWorkflowControlCheckpointService({
      eventIds: new ConstantCheckpointEventIds(),
      operatorActorId: "fabio",
      repositories: runner,
    });
    await service.recordApproval(approvalCheckpoint());
    await expect(service.recordGuardian(guardianCheckpoint())).rejects.toMatchObject({
      code: "repository_conflict",
    });
    await runner.transaction(async ({ workflows }) => {
      expect(await workflows.guardians.getById(
        "guardian-research-security-001",
      )).toBeUndefined();
      expect(await workflows.controlEvents.listByInstanceId(
        "workflow-checkpoint-instance",
        10,
      )).toHaveLength(1);
    });
    await runner.close();
  });

  it("survives restart and rejects corrupt stored records", async () => {
    await withTemporaryDatabase(async (path) => {
      const firstRunner = createRunner(path);
      await seed(firstRunner);
      await recordClearControls(checkpointService(firstRunner));
      await firstRunner.close();

      const secondRunner = createRunner(path);
      const result = await boundary(secondRunner).prepare(boundaryRequest());
      expect(result.status).toBe("CANDIDATE_AVAILABLE");
      await secondRunner.close();

      const database = new DatabaseSync(path);
      database.prepare(
        "UPDATE workflow_approval_checkpoints SET record_json = ? WHERE evidence_id = ?",
      ).run(JSON.stringify({ unsafe: true }), "approval-research-001");
      database.close();

      const corruptRunner = createRunner(path);
      await expect(
        corruptRunner.transaction(({ workflows }) =>
          workflows.approvals.getById("approval-research-001"),
        ),
      ).rejects.toMatchObject({ code: "repository_record_invalid" });
      await corruptRunner.close();
    });
  });

  it("migrates schema version 4 without losing durable workflow state", async () => {
    await withTemporaryDatabase(async (path) => {
      const firstRunner = createRunner(path);
      await seed(firstRunner);
      await firstRunner.close();

      const database = new DatabaseSync(path);
      database.exec(`
        DROP TABLE workflow_lifecycle_events;
        DROP TABLE workflow_lifecycle_records;
        DROP TABLE workflow_step_outcomes;
        DROP TABLE workflow_agent_invocation_events;
        DROP TABLE workflow_agent_invocations;
        DROP TABLE workflow_control_checkpoint_events;
        DROP TABLE workflow_guardian_checkpoints;
        DROP TABLE workflow_approval_checkpoints;
        DELETE FROM schema_migrations WHERE version = 11;
        DELETE FROM schema_migrations WHERE version = 10;
        DELETE FROM schema_migrations WHERE version = 9;
        DELETE FROM schema_migrations WHERE version = 8;
        DELETE FROM schema_migrations WHERE version = 7;
        DELETE FROM schema_migrations WHERE version = 6;
        DELETE FROM schema_migrations WHERE version = 5;
        PRAGMA user_version = 4;
      `);
      database.close();

      const migrated = createRunner(path);
      await migrated.transaction(async ({ workflows }) => {
        expect(await workflows.instances.getById(
          "workflow-checkpoint-instance",
        )).toEqual(instance());
      });
      await checkpointService(migrated).recordApproval(approvalCheckpoint());
      await migrated.close();
    });
  });
});

function checkpointService(
  repositories: SqliteRepositoryTransactionRunner,
): WorkflowControlCheckpointService {
  return createWorkflowControlCheckpointService({
    eventIds: new SequenceCheckpointEventIds(),
    operatorActorId: "fabio",
    repositories,
  });
}

function boundary(repositories: SqliteRepositoryTransactionRunner) {
  return createWorkflowStepExecutionBoundary({
    agentCompany: DEFAULT_AGENT_COMPANY_MAP,
    agentSpecifications: new ImmutableAgentSpecificationRegistry(
      [...INITIAL_CORE_AGENT_SPECIFICATIONS, ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS],
      new AgentSpecificationValidator(),
    ),
    capabilities: DEFAULT_AGENT_CAPABILITY_REGISTRY,
    controlEvidenceMode: "DURABLE_ONLY",
    operatorActorId: "fabio",
    permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX,
    repositories,
    responsibilities: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  });
}

async function recordClearControls(service: WorkflowControlCheckpointService): Promise<void> {
  await service.recordApproval(approvalCheckpoint());
  for (const domain of ["operator_safety", "quality", "security"] as const) {
    await service.recordGuardian(guardianCheckpoint({
      domain,
      evidenceId: `guardian-research-${domain.replace("_", "-")}-001`,
      guardianId: `guardian-${domain.replace("_", "-")}`,
    }));
  }
}

class SequenceCheckpointEventIds
  implements WorkflowControlCheckpointEventIdentifierGenerator
{
  #sequence = 0;

  public nextWorkflowControlCheckpointEventId(): string {
    this.#sequence += 1;
    return `workflow-control-event-${String(this.#sequence)}`;
  }
}

class ConstantCheckpointEventIds
  implements WorkflowControlCheckpointEventIdentifierGenerator
{
  public nextWorkflowControlCheckpointEventId(): string {
    return "workflow-control-event-constant";
  }
}

class SequenceWorkflowEventIds implements WorkflowEventIdentifierGenerator {
  #sequence = 0;

  public nextWorkflowEventId(): string {
    this.#sequence += 1;
    return `workflow-event-${String(this.#sequence)}`;
  }
}

async function seed(runner: SqliteRepositoryTransactionRunner): Promise<void> {
  const service = createWorkflowPersistenceService({
    eventIds: new SequenceWorkflowEventIds(),
    repositories: runner,
    stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()),
  });
  await service.createDefinition(definition());
  await service.createInstance(instance());
}

function definition(): WorkflowDefinition {
  return {
    contractVersion: "1",
    definitionId: "workflow-checkpoint@1.0.0",
    nonExecuting: true,
    steps: [{
      approvalRequired: true,
      dependencies: [],
      guardianRequired: true,
      nonExecuting: true,
      stepId: "research",
    }],
    workflowId: "workflow-checkpoint",
    workflowVersion: "1.0.0",
  };
}

function instance(): WorkflowInstance {
  return {
    contractVersion: "1",
    createdAt: "2026-07-02T10:00:00.000Z",
    definitionId: "workflow-checkpoint@1.0.0",
    instanceId: "workflow-checkpoint-instance",
    nonExecuting: true,
    receipts: [],
    status: "ACTIVE",
    steps: [{ blockers: [], status: "PENDING", stepId: "research" }],
    stopReason: "NONE",
    updatedAt: "2026-07-02T10:00:00.000Z",
    version: 0,
  };
}

function approvalCheckpoint(
  overrides: Partial<WorkflowApprovalCheckpoint> = {},
): WorkflowApprovalCheckpoint {
  return {
    authorityActorId: "fabio",
    contractVersion: "1",
    definitionId: "workflow-checkpoint@1.0.0",
    evidenceId: "approval-research-001",
    instanceId: "workflow-checkpoint-instance",
    instanceVersion: 0,
    nonExecuting: true,
    recordedAt: "2026-07-02T10:00:01.000Z",
    scope: "STEP_CANDIDATE_PREPARATION",
    status: "APPROVED",
    stepId: "research",
    workflowVersion: "1.0.0",
    ...overrides,
  };
}

function guardianCheckpoint(
  overrides: Partial<WorkflowGuardianCheckpoint> = {},
): WorkflowGuardianCheckpoint {
  return {
    contractVersion: "1",
    definitionId: "workflow-checkpoint@1.0.0",
    domain: "security",
    evidenceId: "guardian-research-security-001",
    guardianId: "guardian-security",
    instanceId: "workflow-checkpoint-instance",
    instanceVersion: 0,
    nonExecuting: true,
    recordedAt: "2026-07-02T10:00:01.000Z",
    status: "CLEAR",
    stepId: "research",
    workflowVersion: "1.0.0",
    ...overrides,
  };
}

function boundaryRequest(): WorkflowStepExecutionBoundaryRequest {
  const permissions = [
    "knowledge:search",
    "model:invoke:research-quality",
    "workflow:propose:research-agent",
  ] as const;
  const policyDecision: PolicyDecision = {
    actorId: "actor-local",
    agent: { agentId: "research-agent", version: "1.0.0" },
    contractVersion: "1",
    decisionId: "policy-workflow-checkpoint",
    deniedPermissions: [],
    effectivePermissions: permissions,
    evaluatedAt: "2026-07-02T10:00:00.000Z",
    requestedPermissions: permissions,
    taskId: "workflow-checkpoint-instance",
    workspaceId: "workspace-local",
  };
  return {
    actorId: "actor-local",
    agentAssignment: {
      agentId: "research-agent",
      capabilityIds: ["source-research"],
      permissionIds: ["source-research-permission"],
      responsibilityAreaId: "research",
      specificationId: "research-agent@1.0.0",
      specificationVersion: "1.0.0",
    },
    approvalEvidence: [],
    contractVersion: "1",
    expectedDefinitionId: "workflow-checkpoint@1.0.0",
    expectedVersion: 0,
    expectedWorkflowVersion: "1.0.0",
    guardianEvidence: [],
    instanceId: "workflow-checkpoint-instance",
    maxBlockers: 16,
    nonExecuting: true,
    policyDecision,
    selection: { mode: "NEXT_READY" },
    workspaceId: "workspace-local",
  };
}

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
}

async function withTemporaryDatabase(
  operation: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-workflow-control-"));
  try {
    await operation(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
