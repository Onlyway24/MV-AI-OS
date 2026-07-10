import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  createWorkflowPersistenceService,
  createWorkflowReadinessService,
  DeterministicWorkflowStateMachine,
  DeterministicWorkflowReadinessEngine,
  MAX_WORKFLOW_READINESS_IDENTIFIER_LENGTH,
  MAX_WORKFLOW_READINESS_REASONS,
  MAX_WORKFLOW_READINESS_RESULTS,
  MAX_WORKFLOW_READINESS_TIMESTAMP_LENGTH,
  MAX_WORKFLOW_READINESS_VERSION,
  RepositoryBackedWorkflowReadinessService,
  SqliteRepositoryTransactionRunner,
  WorkflowReadinessRequestValidator,
  WorkflowReadinessResultValidator,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowInstance,
  type WorkflowPersistenceService,
  type WorkflowReadinessEngine,
  type WorkflowReadinessRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Dependency Scheduler and Step Readiness Engine", () => {
  it("derives dependency, approval, and Guardian blockers from a durable snapshot", async () => {
    const runner = createRunner(":memory:");
    const definition = controlledDefinition();
    const instance = controlledInstance();
    await seed(runner, definition, instance);
    const service = createWorkflowReadinessService({ repositories: runner });

    const blocked = await service.evaluate(readinessRequest());
    expect(blocked.terminalFindings).toEqual([
      finding("research", "SUCCEEDED", "TERMINAL"),
    ]);
    expect(blocked.blockedFindings).toEqual([
      finding("review", "PENDING", "BLOCKED", [
        { code: "APPROVAL_REQUIRED" },
      ]),
      finding("delivery", "PENDING", "BLOCKED", [
        { code: "DEPENDENCY_INCOMPLETE", relatedStepId: "review" },
        { code: "GUARDIAN_REQUIRED" },
      ]),
    ]);
    expect(blocked.readyFindings).toEqual([]);

    const approved = await service.evaluate(
      readinessRequest({
        approvedStepIds: ["review"],
        guardianSatisfiedStepIds: ["delivery"],
      }),
    );
    expect(approved.readyFindings).toEqual([
      finding("review", "PENDING", "READY"),
    ]);
    expect(approved.blockedFindings).toEqual([
      finding("delivery", "PENDING", "BLOCKED", [
        { code: "DEPENDENCY_INCOMPLETE", relatedStepId: "review" },
      ]),
    ]);
    await runner.close();
  });

  it("allows a controlled dependent step only after dependencies and evidence are present", async () => {
    const runner = createRunner(":memory:");
    const definition = controlledDefinition();
    const instance = controlledInstance({
      steps: [
        step("research", "SUCCEEDED"),
        step("review", "SUCCEEDED"),
        step("delivery", "PENDING"),
      ],
    });
    await seed(runner, definition, instance);
    const service = createWorkflowReadinessService({ repositories: runner });

    const result = await service.evaluate(
      readinessRequest({ guardianSatisfiedStepIds: ["delivery"] }),
    );
    expect(result.readyFindings).toEqual([
      finding("delivery", "PENDING", "READY"),
    ]);
    expect(result.summary).toEqual({
      blockedCount: 0,
      blockedTruncated: false,
      pendingCount: 0,
      pendingTruncated: false,
      readyCount: 1,
      readyTruncated: false,
      terminalCount: 2,
      terminalTruncated: false,
    });
    await runner.close();
  });

  it("fails closed for explicit persisted blockers and never treats them as grants", async () => {
    const runner = createRunner(":memory:");
    const definition = controlledDefinition();
    const instance = controlledInstance({
      steps: [
        step("research", "SUCCEEDED"),
        step("review", "PENDING", [
          { code: "APPROVAL_REQUIRED", stepId: "review" },
        ]),
        step("delivery", "PENDING"),
      ],
    });
    await seed(runner, definition, instance);

    const result = await createWorkflowReadinessService({
      repositories: runner,
    }).evaluate(
      readinessRequest({
        approvedStepIds: ["review"],
        guardianSatisfiedStepIds: ["delivery"],
      }),
    );
    expect(result.blockedFindings).toContainEqual(
      finding("review", "PENDING", "BLOCKED", [
        { code: "APPROVAL_REQUIRED", relatedStepId: "review" },
      ]),
    );
    await runner.close();
  });

  it("reports awaiting results, paused workflows, and terminal workflows without candidates", async () => {
    const awaitingRunner = createRunner(":memory:");
    await seed(
      awaitingRunner,
      oneStepDefinition(),
      oneStepInstance({
        steps: [step("step-01", "AWAITING_RESULT")],
      }),
    );
    const awaiting = await createWorkflowReadinessService({
      repositories: awaitingRunner,
    }).evaluate(readinessRequest({ instanceId: "workflow-instance-001" }));
    expect(awaiting.pendingFindings).toEqual([
      finding("step-01", "AWAITING_RESULT", "PENDING", [
        { code: "STEP_AWAITING_RESULT" },
      ]),
    ]);
    expect(awaiting.readyFindings).toEqual([]);
    await awaitingRunner.close();

    const pausedRunner = createRunner(":memory:");
    await seed(
      pausedRunner,
      controlledDefinition(),
      controlledInstance({ status: "PAUSED" }),
    );
    const paused = await createWorkflowReadinessService({
      repositories: pausedRunner,
    }).evaluate(readinessRequest());
    expect(paused.readyFindings).toEqual([]);
    expect(paused.blockedFindings).toEqual([
      finding("review", "PENDING", "BLOCKED", [
        { code: "WORKFLOW_NOT_ACTIVE" },
        { code: "APPROVAL_REQUIRED" },
      ]),
      finding("delivery", "PENDING", "BLOCKED", [
        { code: "WORKFLOW_NOT_ACTIVE" },
        { code: "DEPENDENCY_INCOMPLETE", relatedStepId: "review" },
        { code: "GUARDIAN_REQUIRED" },
      ]),
    ]);
    await pausedRunner.close();

    const completedRunner = createRunner(":memory:");
    await seed(
      completedRunner,
      oneStepDefinition(),
      oneStepInstance({
        status: "COMPLETED",
        steps: [step("step-01", "SUCCEEDED")],
      }),
    );
    const completed = await createWorkflowReadinessService({
      repositories: completedRunner,
    }).evaluate(readinessRequest({ instanceId: "workflow-instance-001" }));
    expect(completed.readyFindings).toEqual([]);
    expect(completed.terminalFindings).toEqual([
      finding("step-01", "SUCCEEDED", "TERMINAL"),
    ]);
    await completedRunner.close();
  });

  it("detects dependency cycles deterministically and preserves definition order with bounded output", async () => {
    const cycleRunner = createRunner(":memory:");
    const cycleDefinition = workflowDefinition({
      definitionId: "workflow-cycle@1.0.0",
      steps: [
        definitionStep("first", ["second"]),
        definitionStep("second", ["first"]),
        definitionStep("dependent", ["first"]),
      ],
      workflowId: "workflow-cycle",
    });
    const cycleInstance = workflowInstance({
      definitionId: cycleDefinition.definitionId,
      instanceId: "workflow-cycle-instance",
      steps: [
        step("first", "PENDING"),
        step("second", "PENDING"),
        step("dependent", "PENDING"),
      ],
    });
    await seed(cycleRunner, cycleDefinition, cycleInstance);
    const cycle = await createWorkflowReadinessService({
      repositories: cycleRunner,
    }).evaluate(
      readinessRequest({ instanceId: cycleInstance.instanceId }),
    );
    expect(cycle.blockedFindings).toEqual([
      finding("first", "PENDING", "BLOCKED", [
        { code: "DEPENDENCY_CYCLE" },
      ]),
      finding("second", "PENDING", "BLOCKED", [
        { code: "DEPENDENCY_CYCLE" },
      ]),
      finding("dependent", "PENDING", "BLOCKED", [
        { code: "DEPENDENCY_INCOMPLETE", relatedStepId: "first" },
      ]),
    ]);
    await cycleRunner.close();

    const orderedRunner = createRunner(":memory:");
    const orderedDefinition = workflowDefinition({
      definitionId: "workflow-order@1.0.0",
      steps: [
        definitionStep("alpha", []),
        definitionStep("beta", []),
        definitionStep("gamma", []),
      ],
      workflowId: "workflow-order",
    });
    const orderedInstance = workflowInstance({
      definitionId: orderedDefinition.definitionId,
      instanceId: "workflow-order-instance",
      steps: [
        step("alpha", "PENDING"),
        step("beta", "PENDING"),
        step("gamma", "PENDING"),
      ],
    });
    await seed(orderedRunner, orderedDefinition, orderedInstance);
    const ordered = await createWorkflowReadinessService({
      repositories: orderedRunner,
    }).evaluate(
      readinessRequest({
        instanceId: orderedInstance.instanceId,
        maxResults: 2,
      }),
    );
    expect(ordered.readyFindings.map(({ stepId }) => stepId)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(ordered.summary.readyCount).toBe(3);
    expect(ordered.summary.readyTruncated).toBe(true);
    await orderedRunner.close();
  });

  it("rejects malformed, stale, unsafe, duplicate, and unrelated readiness evidence", async () => {
    const validator = new WorkflowReadinessRequestValidator();
    expect(
      validator.validate({
        ...readinessRequest(),
        approvedStepIds: ["review", "review"],
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({ ...readinessRequest(), maxResults: 0 }).ok,
    ).toBe(false);
    expect(
      validator.validate({
        ...readinessRequest(),
        expectedVersion: MAX_WORKFLOW_READINESS_VERSION + 1,
      }).ok,
    ).toBe(false);
    expect(
      validator.validate({ ...readinessRequest(), unexpected: true }).ok,
    ).toBe(false);
    const secret = "sk-private-readiness-secret";
    const validation = validator.validate({
      ...readinessRequest(),
      approvedStepIds: [secret],
    });
    expect(validation.ok).toBe(false);
    expect(JSON.stringify(validation)).not.toContain(secret);
    expect(
      validator.validate({
        ...readinessRequest(),
        guardianSatisfiedStepIds: ["provider-payload"],
      }).ok,
    ).toBe(false);

    const runner = createRunner(":memory:");
    await seed(runner, controlledDefinition(), controlledInstance());
    const service = createWorkflowReadinessService({ repositories: runner });
    await expect(
      service.evaluate(readinessRequest({ expectedVersion: 1 })),
    ).rejects.toMatchObject({ code: "repository_conflict", stage: "persistence" });
    await expect(
      service.evaluate(readinessRequest({ approvedStepIds: ["delivery"] })),
    ).rejects.toMatchObject({
      code: "repository_record_invalid",
      stage: "persistence",
    });
    await expect(
      service.evaluate(
        readinessRequest({ guardianSatisfiedStepIds: ["research"] }),
      ),
    ).rejects.toMatchObject({
      code: "repository_record_invalid",
      stage: "persistence",
    });
    await runner.close();
  });

  it("enforces bounded control input, finding reasons, and workflow graph evaluation", async () => {
    const validator = new WorkflowReadinessRequestValidator();
    expect(
      validator.validate({
        ...readinessRequest(),
        approvedStepIds: Array.from(
          { length: MAX_WORKFLOW_READINESS_RESULTS + 1 },
          (_, index) => `approval-${String(index)}`,
        ),
      }).ok,
    ).toBe(false);

    const runner = createRunner(":memory:");
    const definition = workflowDefinition({
      definitionId: "workflow-bounded@1.0.0",
      steps: [definitionStep("bounded", [], { approvalRequired: true })],
      workflowId: "workflow-bounded",
    });
    const instance = workflowInstance({
      definitionId: definition.definitionId,
      instanceId: "workflow-bounded-instance",
      steps: [
        step(
          "bounded",
          "PENDING",
          Array.from(
            { length: MAX_WORKFLOW_READINESS_REASONS },
            (_, index) => ({
              code: "APPROVAL_REQUIRED" as const,
              stepId: `blocker-${String(index)}`,
            }),
          ),
        ),
      ],
    });
    await seed(runner, definition, instance);
    const bounded = await createWorkflowReadinessService({
      repositories: runner,
    }).evaluate(
      readinessRequest({ instanceId: instance.instanceId, maxResults: 1 }),
    );
    expect(bounded.blockedFindings).toHaveLength(1);
    expect(bounded.blockedFindings[0]?.reasons).toHaveLength(
      MAX_WORKFLOW_READINESS_REASONS,
    );
    expect(bounded.blockedFindings[0]?.reasons.at(-1)).toEqual({
      code: "REASONS_TRUNCATED",
    });
    await runner.close();

    const oversizedDefinition = workflowDefinition({
      steps: Array.from({ length: 101 }, (_, index) =>
        definitionStep(`step-${String(index)}`, []),
      ),
    });
    const oversizedInstance = workflowInstance({
      steps: Array.from({ length: 101 }, (_, index) =>
        step(`step-${String(index)}`, "PENDING"),
      ),
    });
    expect(() =>
      new DeterministicWorkflowReadinessEngine().evaluate(
        oversizedDefinition,
        oversizedInstance,
        readinessRequest(),
      ),
    ).toThrow("exceeds supported bounds");
  });

  it("rejects an injected engine that attempts to grant readiness without controls", async () => {
    const runner = createRunner(":memory:");
    const definition = controlledDefinition();
    const instance = controlledInstance();
    await seed(runner, definition, instance);
    const unsafeEngine: WorkflowReadinessEngine = {
      evaluate: (workflowDefinition, workflowInstance) => ({
        blockedFindings: [
          {
            nonExecuting: true,
            persistedStatus: "PENDING",
            reasons: [
              {
                code: "DEPENDENCY_INCOMPLETE",
                relatedStepId: "review",
              },
              { code: "GUARDIAN_REQUIRED" },
            ],
            status: "BLOCKED",
            stepId: "delivery",
          },
        ],
        contractVersion: "1",
        definitionId: workflowDefinition.definitionId,
        evaluatedVersion: workflowInstance.version,
        instanceId: workflowInstance.instanceId,
        nonExecuting: true,
        pendingFindings: [],
        readyFindings: [
          {
            nonExecuting: true,
            persistedStatus: "PENDING",
            reasons: [],
            status: "READY",
            stepId: "review",
          },
        ],
        stateUpdatedAt: workflowInstance.updatedAt,
        summary: summary(1, 0, 1, 1),
        terminalFindings: [
          {
            nonExecuting: true,
            persistedStatus: "SUCCEEDED",
            reasons: [],
            status: "TERMINAL",
            stepId: "research",
          },
        ],
        workflowStatus: workflowInstance.status,
      }),
    };
    const service = new RepositoryBackedWorkflowReadinessService({
      engine: unsafeEngine,
      repositories: runner,
      requestValidator: new WorkflowReadinessRequestValidator(),
      resultValidator: new WorkflowReadinessResultValidator(),
    });
    await expect(service.evaluate(readinessRequest())).rejects.toMatchObject({
      code: "repository_record_invalid",
      stage: "persistence",
    });
    await runner.close();
  });

  it("rejects invalid public results and returns deeply immutable redaction-safe results", async () => {
    const resultValidator = new WorkflowReadinessResultValidator();
    const invalid = resultValidator.validate({
      blockedFindings: [],
      contractVersion: "1",
      definitionId: "workflow-definition@1.0.0",
      evaluatedVersion: 0,
      instanceId: "workflow-instance-001",
      nonExecuting: true,
      pendingFindings: [],
      readyFindings: [
        finding("step-01", "PENDING", "READY", [
          { code: "APPROVAL_REQUIRED" },
        ]),
      ],
      stateUpdatedAt: "2026-07-02T10:00:00.000Z",
      summary: summary(0, 0, 1, 0),
      terminalFindings: [],
      workflowStatus: "ACTIVE",
    });
    expect(invalid.ok).toBe(false);
    expect(
      resultValidator.validate({
        blockedFindings: [],
        contractVersion: "1",
        definitionId: "a".repeat(MAX_WORKFLOW_READINESS_IDENTIFIER_LENGTH + 1),
        evaluatedVersion: 0,
        instanceId: "workflow-instance-001",
        nonExecuting: true,
        pendingFindings: [],
        readyFindings: [],
        stateUpdatedAt: "2026-07-02T10:00:00.000Z",
        summary: summary(0, 0, 0, 0),
        terminalFindings: [],
        workflowStatus: "ACTIVE",
      }).ok,
    ).toBe(false);
    expect(
      resultValidator.validate({
        blockedFindings: [],
        contractVersion: "1",
        definitionId: "workflow-definition@1.0.0",
        evaluatedVersion: 0,
        instanceId: "workflow-instance-001",
        nonExecuting: true,
        pendingFindings: [],
        readyFindings: [],
        stateUpdatedAt: `2026-07-02T10:00:00.${"0".repeat(
          MAX_WORKFLOW_READINESS_TIMESTAMP_LENGTH,
        )}Z`,
        summary: summary(0, 0, 0, 0),
        terminalFindings: [],
        workflowStatus: "ACTIVE",
      }).ok,
    ).toBe(false);

    const runner = createRunner(":memory:");
    await seed(runner, controlledDefinition(), controlledInstance());
    const result = await createWorkflowReadinessService({
      repositories: runner,
    }).evaluate(readinessRequest());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.blockedFindings)).toBe(true);
    expect(Object.isFrozen(result.blockedFindings[0])).toBe(true);
    expect(Object.isFrozen(result.blockedFindings[0]?.reasons)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /secret|prompt|completion|provider payload|transcript|sk-/iu,
    );
    await runner.close();
  });

  it("remains read-only across repeated evaluation and survives a genuine restart", async () => {
    await withTemporaryDatabase(async (path) => {
      const definition = controlledDefinition();
      const instance = controlledInstance();
      const firstRunner = createRunner(path);
      await seed(firstRunner, definition, instance);
      const firstService = createWorkflowReadinessService({
        repositories: firstRunner,
      });
      const before = await snapshot(firstRunner, instance.instanceId);
      const first = await firstService.evaluate(readinessRequest());
      const second = await firstService.evaluate(readinessRequest());
      const after = await snapshot(firstRunner, instance.instanceId);
      expect(second).toEqual(first);
      expect(after).toEqual(before);
      await firstRunner.close();

      const secondRunner = createRunner(path);
      const afterRestart = await createWorkflowReadinessService({
        repositories: secondRunner,
      }).evaluate(readinessRequest());
      expect(afterRestart).toEqual(first);
      await secondRunner.close();
    });
  });

  it("fails closed when a valid persisted instance no longer matches its definition", async () => {
    await withTemporaryDatabase(async (path) => {
      const definition = controlledDefinition();
      const instance = controlledInstance();
      const runner = createRunner(path);
      await seed(runner, definition, instance);
      await runner.close();

      const corrupt = {
        ...instance,
        steps: [
          step("research", "SUCCEEDED"),
          step("unexpected", "PENDING"),
          step("delivery", "PENDING"),
        ],
      };
      const database = new DatabaseSync(path);
      database
        .prepare("UPDATE workflow_instances SET record_json = ? WHERE instance_id = ?")
        .run(JSON.stringify(corrupt), instance.instanceId);
      database.close();

      const reopened = createRunner(path);
      await expect(
        createWorkflowReadinessService({ repositories: reopened }).evaluate(
          readinessRequest(),
        ),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
        stage: "persistence",
      });
      await reopened.close();
    });
  });
});

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
}

async function seed(
  runner: SqliteRepositoryTransactionRunner,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
): Promise<void> {
  const service = createPersistenceService(runner);
  await service.createDefinition(definition);
  await service.createInstance(instance);
}

function createPersistenceService(
  repositories: SqliteRepositoryTransactionRunner,
): WorkflowPersistenceService {
  return createWorkflowPersistenceService({
    eventIds: new SequenceWorkflowEventIds(),
    repositories,
    stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()),
  });
}

function controlledDefinition(): WorkflowDefinition {
  return workflowDefinition({
    steps: [
      definitionStep("research", []),
      definitionStep("review", ["research"], { approvalRequired: true }),
      definitionStep("delivery", ["review"], { guardianRequired: true }),
    ],
  });
}

function controlledInstance(
  overrides: Partial<WorkflowInstance> = {},
): WorkflowInstance {
  return workflowInstance({
    steps: [
      step("research", "SUCCEEDED"),
      step("review", "PENDING"),
      step("delivery", "PENDING"),
    ],
    ...overrides,
  });
}

function oneStepDefinition(): WorkflowDefinition {
  return workflowDefinition({ steps: [definitionStep("step-01", [])] });
}

function oneStepInstance(
  overrides: Partial<WorkflowInstance> = {},
): WorkflowInstance {
  return workflowInstance({
    steps: [step("step-01", "PENDING")],
    ...overrides,
  });
}

function workflowDefinition(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    contractVersion: "1",
    definitionId: "workflow-definition@1.0.0",
    nonExecuting: true,
    steps: [definitionStep("step-01", [])],
    workflowId: "workflow-main",
    workflowVersion: "1.0.0",
    ...overrides,
  };
}

function definitionStep(
  stepId: string,
  dependencies: readonly string[],
  controls: {
    readonly approvalRequired?: boolean;
    readonly guardianRequired?: boolean;
  } = {},
) {
  return {
    approvalRequired: controls.approvalRequired ?? false,
    dependencies,
    guardianRequired: controls.guardianRequired ?? false,
    nonExecuting: true as const,
    stepId,
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
    steps: [step("step-01", "PENDING")],
    stopReason: "NONE",
    updatedAt: "2026-07-02T10:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

function step(
  stepId: string,
  status: WorkflowInstance["steps"][number]["status"],
  blockers: WorkflowInstance["steps"][number]["blockers"] = [],
) {
  return { blockers, status, stepId };
}

function readinessRequest(
  overrides: Partial<WorkflowReadinessRequest> = {},
): WorkflowReadinessRequest {
  return {
    approvedStepIds: [],
    contractVersion: "1",
    expectedVersion: 0,
    guardianSatisfiedStepIds: [],
    instanceId: "workflow-instance-001",
    maxResults: 10,
    nonExecuting: true,
    ...overrides,
  };
}

function finding(
  stepId: string,
  persistedStatus: WorkflowInstance["steps"][number]["status"],
  status: "BLOCKED" | "PENDING" | "READY" | "TERMINAL",
  reasons: readonly { readonly code: string; readonly relatedStepId?: string }[] = [],
) {
  return {
    nonExecuting: true as const,
    persistedStatus,
    reasons,
    status,
    stepId,
  };
}

function summary(
  blockedCount: number,
  pendingCount: number,
  readyCount: number,
  terminalCount: number,
) {
  return {
    blockedCount,
    blockedTruncated: false,
    pendingCount,
    pendingTruncated: false,
    readyCount,
    readyTruncated: false,
    terminalCount,
    terminalTruncated: false,
  };
}

async function snapshot(
  runner: SqliteRepositoryTransactionRunner,
  instanceId: string,
) {
  return runner.transaction(async ({ workflows }) => ({
    events: await workflows.events.listByInstanceId(instanceId, 100),
    instance: await workflows.instances.getById(instanceId),
    receipts: await workflows.receipts.listByInstanceId(instanceId),
  }));
}

class SequenceWorkflowEventIds implements WorkflowEventIdentifierGenerator {
  #sequence = 0;

  public nextWorkflowEventId(): string {
    this.#sequence += 1;
    return `workflow-readiness-event-${String(this.#sequence)}`;
  }
}

async function withTemporaryDatabase(
  test: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-workflow-readiness-"));
  try {
    await test(join(directory, "workflow-readiness.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
