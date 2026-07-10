import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentSpecificationValidator,
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
  WorkflowStepExecutionBoundaryRequestValidator,
  WorkflowStepExecutionBoundaryResultValidator,
  type PolicyDecision,
  type WorkflowApprovalEvidence,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowGuardianEvidence,
  type WorkflowInstance,
  type WorkflowStepExecutionBoundary,
  type WorkflowStepExecutionBoundaryRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Workflow Step Execution Boundary", () => {
  it("prepares one immutable non-executing candidate from a durable snapshot", async () => {
    const runner = createRunner(":memory:");
    await seed(runner, definition(), instance());
    const boundary = createBoundary(runner);

    const before = await snapshot(runner);
    const first = await boundary.prepare(request());
    const second = await boundary.prepare(request());
    const after = await snapshot(runner);

    expect(first).toEqual({
      blockers: [],
      candidate: {
        agentId: "research-agent",
        approvalEvidenceIds: [],
        capabilityIds: ["source-research"],
        capabilityTitles: ["Source research"],
        contractVersion: "1",
        definitionId: "workflow-boundary@1.0.0",
        guardianDomains: ["operator_safety", "quality", "security"],
        guardianEvidenceIds: [
          "guardian-operator-safety",
          "guardian-quality",
          "guardian-security",
        ],
        instanceId: "workflow-boundary-instance",
        instanceVersion: 0,
        nonExecuting: true,
        permissionIds: ["source-research-permission"],
        requiredPolicyPermissions: [
          "knowledge:search",
          "model:invoke:research-quality",
          "workflow:propose:research-agent",
        ],
        responsibilityAreaId: "research",
        responsibilityTitle: "Research",
        specificationId: "research-agent@1.0.0",
        specificationVersion: "1.0.0",
        stepId: "research",
        workflowId: "workflow-boundary",
        workflowVersion: "1.0.0",
      },
      contractVersion: "1",
      nonExecuting: true,
      status: "CANDIDATE_AVAILABLE",
    });
    expect(second).toEqual(first);
    expect(after).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.status === "CANDIDATE_AVAILABLE" && first.candidate)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /prompt|completion|secret|providerPayload|rawKnowledge|rawMemory|transcript|sk-/iu,
    );
    await runner.close();
  });

  it("does not skip the first non-terminal step and never substitutes an exact step", async () => {
    const runner = createRunner(":memory:");
    await seed(
      runner,
      definition({
        steps: [
          definitionStep("first", [], { approvalRequired: true }),
          definitionStep("second", []),
        ],
      }),
      instance({
        steps: [step("first", "PENDING"), step("second", "PENDING")],
      }),
    );
    const boundary = createBoundary(runner);

    const next = await boundary.prepare(
      request({ guardianEvidence: guardianEvidence("first") }),
    );
    expect(blockerCodes(next)).toContain("APPROVAL_REQUIRED");
    expect(blockerStepIds(next)).toContain("first");

    const exact = await boundary.prepare(
      request({
        guardianEvidence: guardianEvidence("second"),
        selection: { mode: "EXACT_STEP", stepId: "second" },
      }),
    );
    expect(exact.status).toBe("CANDIDATE_AVAILABLE");
    if (exact.status === "CANDIDATE_AVAILABLE") {
      expect(exact.candidate.stepId).toBe("second");
    }

    const missing = await boundary.prepare(
      request({ selection: { mode: "EXACT_STEP", stepId: "unknown" } }),
    );
    expect(blockerCodes(missing)).toEqual(["STEP_NOT_FOUND"]);
    await runner.close();
  });

  it("fails closed for dependencies, inactive workflows, stale versions, and terminal state", async () => {
    const dependencyRunner = createRunner(":memory:");
    await seed(
      dependencyRunner,
      definition({
        steps: [definitionStep("dependency", []), definitionStep("research", ["dependency"])],
      }),
      instance({
        steps: [step("dependency", "PENDING"), step("research", "PENDING")],
      }),
    );
    const dependency = await createBoundary(dependencyRunner).prepare(
      request({ selection: { mode: "EXACT_STEP", stepId: "research" } }),
    );
    expect(blockerCodes(dependency)).toContain("DEPENDENCY_INCOMPLETE");
    await dependencyRunner.close();

    const pausedRunner = createRunner(":memory:");
    await seed(pausedRunner, definition(), instance({ status: "PAUSED" }));
    const paused = await createBoundary(pausedRunner).prepare(request());
    expect(blockerCodes(paused)).toContain("WORKFLOW_NOT_ACTIVE");
    const stale = await createBoundary(pausedRunner).prepare(
      request({ expectedVersion: 1 }),
    );
    expect(blockerCodes(stale)).toEqual(["STALE_WORKFLOW_VERSION"]);
    const staleDefinition = await createBoundary(pausedRunner).prepare(
      request({ expectedDefinitionId: "workflow-other@1.0.0" }),
    );
    expect(blockerCodes(staleDefinition)).toEqual(["STALE_DEFINITION"]);
    const staleDefinitionVersion = await createBoundary(pausedRunner).prepare(
      request({ expectedWorkflowVersion: "2.0.0" }),
    );
    expect(blockerCodes(staleDefinitionVersion)).toEqual(["STALE_WORKFLOW_VERSION"]);
    await pausedRunner.close();

    const terminalRunner = createRunner(":memory:");
    await seed(
      terminalRunner,
      definition(),
      instance({ status: "COMPLETED", steps: [step("research", "SUCCEEDED")] }),
    );
    const terminal = await createBoundary(terminalRunner).prepare(request());
    expect(blockerCodes(terminal)).toEqual(["NO_ELIGIBLE_STEP"]);
    await terminalRunner.close();
  });

  it("requires exact Agent Company responsibility, capability, and permission declarations", async () => {
    const runner = createRunner(":memory:");
    await seed(runner, definition(), instance());
    const boundary = createBoundary(runner);

    const responsibility = await boundary.prepare(
      request({
        agentAssignment: {
          ...assignment(),
          responsibilityAreaId: "business-strategy",
        },
      }),
    );
    expect(blockerCodes(responsibility)).toContain("RESPONSIBILITY_MISMATCH");

    const capability = await boundary.prepare(
      request({
        agentAssignment: {
          ...assignment(),
          capabilityIds: ["offer-design"],
          permissionIds: ["offer-design-permission"],
        },
      }),
    );
    expect(blockerCodes(capability)).toContain("CAPABILITY_MISMATCH");

    const permission = await boundary.prepare(
      request({
        agentAssignment: {
          ...assignment(),
          permissionIds: ["competitor-research-permission"],
        },
      }),
    );
    expect(blockerCodes(permission)).toContain("PERMISSION_DECLARATION_MISMATCH");
    await runner.close();
  });

  it("requires an exact specification and an exact default-deny policy decision", async () => {
    const runner = createRunner(":memory:");
    await seed(runner, definition(), instance());
    const boundary = createBoundary(runner);

    const missingSpecification = await boundary.prepare(
      request({
        agentAssignment: {
          ...assignment(),
          specificationId: "research-agent@9.0.0",
          specificationVersion: "9.0.0",
        },
        policyDecision: policyDecision({
          agent: { agentId: "research-agent", version: "9.0.0" },
        }),
      }),
    );
    expect(blockerCodes(missingSpecification)).toContain("AGENT_SPECIFICATION_MISSING");

    const denied = await boundary.prepare(
      request({
        policyDecision: policyDecision({
          deniedPermissions: ["workflow:propose:research-agent"],
          effectivePermissions: [
            "knowledge:search",
            "model:invoke:research-quality",
          ],
        }),
      }),
    );
    expect(blockerCodes(denied)).toContain("POLICY_DENIED");

    const mismatch = await boundary.prepare(
      request({ policyDecision: policyDecision({ workspaceId: "other-workspace" }) }),
    );
    expect(blockerCodes(mismatch)).toContain("POLICY_MISMATCH");
    await runner.close();
  });

  it("binds approval and Guardian evidence to the exact snapshot and Fabio authority", async () => {
    const runner = createRunner(":memory:");
    await seed(
      runner,
      definition({ steps: [definitionStep("research", [], { approvalRequired: true, guardianRequired: true })] }),
      instance(),
    );
    const boundary = createBoundary(runner);

    const missing = await boundary.prepare(request({ guardianEvidence: [] }));
    expect(blockerCodes(missing)).toContain("APPROVAL_REQUIRED");
    expect(blockerCodes(missing)).toContain("GUARDIAN_REQUIRED");

    const wrongAuthority = await boundary.prepare(
      request({
        approvalEvidence: [approvalEvidence({ authorityActorId: "not-fabio" })],
      }),
    );
    expect(blockerCodes(wrongAuthority)).toContain("APPROVAL_INVALID");

    const expiredApproval = await boundary.prepare(
      request({
        approvalEvidence: [approvalEvidence({ status: "EXPIRED" })],
      }),
    );
    expect(blockerCodes(expiredApproval)).toContain("APPROVAL_INVALID");

    const blockedGuardian = await boundary.prepare(
      request({
        approvalEvidence: [approvalEvidence()],
        guardianEvidence: guardianEvidence("research", { domain: "security", status: "BLOCKED" }),
      }),
    );
    expect(blockerCodes(blockedGuardian)).toContain("GUARDIAN_BLOCKED");

    const expiredGuardian = await boundary.prepare(
      request({
        approvalEvidence: [approvalEvidence()],
        guardianEvidence: guardianEvidence("research", { domain: "quality", status: "EXPIRED" }),
      }),
    );
    expect(blockerCodes(expiredGuardian)).toContain("GUARDIAN_EVIDENCE_INVALID");

    const wrongSnapshot = await boundary.prepare(
      request({
        approvalEvidence: [approvalEvidence({ instanceVersion: 1 })],
      }),
    );
    expect(blockerCodes(wrongSnapshot)).toContain("APPROVAL_INVALID");

    const allowed = await boundary.prepare(
      request({ approvalEvidence: [approvalEvidence()] }),
    );
    expect(allowed.status).toBe("CANDIDATE_AVAILABLE");
    await runner.close();
  });

  it("rejects malformed and sensitive public values without reflecting them", () => {
    const requestValidator = new WorkflowStepExecutionBoundaryRequestValidator();
    expect(requestValidator.validate({ ...request(), nonExecuting: false }).ok).toBe(false);
    expect(requestValidator.validate({ ...request(), unexpected: true }).ok).toBe(false);
    expect(
      requestValidator.validate({
        ...request(),
        agentAssignment: { ...assignment(), capabilityIds: [] },
      }).ok,
    ).toBe(false);
    const secret = "sk-private-boundary-secret";
    const unsafe = requestValidator.validate({ ...request(), instanceId: secret });
    expect(unsafe.ok).toBe(false);
    expect(JSON.stringify(unsafe)).not.toContain(secret);
    expect(
      requestValidator.validate({
        ...request(),
        policyDecision: { ...policyDecision(), prompt: secret },
      }).ok,
    ).toBe(false);

    const resultValidator = new WorkflowStepExecutionBoundaryResultValidator();
    expect(
      resultValidator.validate({
        blockers: [],
        contractVersion: "1",
        instanceId: "workflow-boundary-instance",
        nonExecuting: true,
        status: "BLOCKED",
      }).ok,
    ).toBe(false);
  });

  it("returns the same candidate after a genuine SQLite restart", async () => {
    await withTemporaryDatabase(async (path) => {
      const firstRunner = createRunner(path);
      await seed(firstRunner, definition(), instance());
      const first = await createBoundary(firstRunner).prepare(request());
      await firstRunner.close();

      const secondRunner = createRunner(path);
      const second = await createBoundary(secondRunner).prepare(request());
      expect(second).toEqual(first);
      await secondRunner.close();
    });
  });
});

function createBoundary(
  repositories: SqliteRepositoryTransactionRunner,
): WorkflowStepExecutionBoundary {
  return createWorkflowStepExecutionBoundary({
    agentCompany: DEFAULT_AGENT_COMPANY_MAP,
    agentSpecifications: new ImmutableAgentSpecificationRegistry(
      [...INITIAL_CORE_AGENT_SPECIFICATIONS, ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS],
      new AgentSpecificationValidator(),
    ),
    capabilities: DEFAULT_AGENT_CAPABILITY_REGISTRY,
    operatorActorId: "fabio",
    permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX,
    repositories,
    responsibilities: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  });
}

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
}

async function seed(
  repositories: SqliteRepositoryTransactionRunner,
  workflowDefinition: WorkflowDefinition,
  workflowInstance: WorkflowInstance,
): Promise<void> {
  const service = createWorkflowPersistenceService({
    eventIds: new SequenceWorkflowEventIds(),
    repositories,
    stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()),
  });
  await service.createDefinition(workflowDefinition);
  await service.createInstance(workflowInstance);
}

class SequenceWorkflowEventIds implements WorkflowEventIdentifierGenerator {
  #sequence = 0;

  public nextWorkflowEventId(): string {
    this.#sequence += 1;
    return `workflow-event-${String(this.#sequence)}`;
  }
}

function definition(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    contractVersion: "1",
    definitionId: "workflow-boundary@1.0.0",
    nonExecuting: true,
    steps: [definitionStep("research", [])],
    workflowId: "workflow-boundary",
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

function instance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  return {
    contractVersion: "1",
    createdAt: "2026-07-02T10:00:00.000Z",
    definitionId: "workflow-boundary@1.0.0",
    instanceId: "workflow-boundary-instance",
    nonExecuting: true,
    receipts: [],
    status: "ACTIVE",
    steps: [step("research", "PENDING")],
    stopReason: "NONE",
    updatedAt: "2026-07-02T10:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

function step(
  stepId: string,
  status: WorkflowInstance["steps"][number]["status"],
): WorkflowInstance["steps"][number] {
  return { blockers: [], status, stepId };
}

function assignment(): WorkflowStepExecutionBoundaryRequest["agentAssignment"] {
  return {
    agentId: "research-agent",
    capabilityIds: ["source-research"],
    permissionIds: ["source-research-permission"],
    responsibilityAreaId: "research",
    specificationId: "research-agent@1.0.0",
    specificationVersion: "1.0.0",
  };
}

function request(
  overrides: Partial<WorkflowStepExecutionBoundaryRequest> = {},
): WorkflowStepExecutionBoundaryRequest {
  return {
    actorId: "actor-local",
    agentAssignment: assignment(),
    approvalEvidence: [],
    contractVersion: "1",
    expectedDefinitionId: "workflow-boundary@1.0.0",
    expectedVersion: 0,
    expectedWorkflowVersion: "1.0.0",
    guardianEvidence: guardianEvidence("research"),
    instanceId: "workflow-boundary-instance",
    maxBlockers: 16,
    nonExecuting: true,
    policyDecision: policyDecision(),
    selection: { mode: "NEXT_READY" },
    workspaceId: "workspace-local",
    ...overrides,
  };
}

function policyDecision(overrides: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    actorId: "actor-local",
    agent: { agentId: "research-agent", version: "1.0.0" },
    contractVersion: "1",
    decisionId: "policy-workflow-boundary",
    deniedPermissions: [],
    effectivePermissions: [
      "knowledge:search",
      "model:invoke:research-quality",
      "workflow:propose:research-agent",
    ],
    evaluatedAt: "2026-07-02T10:00:00.000Z",
    requestedPermissions: [
      "knowledge:search",
      "model:invoke:research-quality",
      "workflow:propose:research-agent",
    ],
    taskId: "workflow-boundary-instance",
    workspaceId: "workspace-local",
    ...overrides,
  };
}

function approvalEvidence(
  overrides: Partial<WorkflowApprovalEvidence> = {},
): WorkflowApprovalEvidence {
  return {
    authorityActorId: "fabio",
    definitionId: "workflow-boundary@1.0.0",
    evidenceId: "approval-fabio-research",
    instanceId: "workflow-boundary-instance",
    instanceVersion: 0,
    scope: "STEP_CANDIDATE_PREPARATION",
    status: "APPROVED",
    stepId: "research",
    workflowVersion: "1.0.0",
    ...overrides,
  };
}

function guardianEvidence(
  stepId: string,
  override: Partial<WorkflowGuardianEvidence> = {},
): readonly WorkflowGuardianEvidence[] {
  return (["operator_safety", "quality", "security"] as const).map(
    (domain): WorkflowGuardianEvidence => ({
      definitionId: "workflow-boundary@1.0.0",
      domain,
      evidenceId: `guardian-${domain.replace("_", "-")}`,
      instanceId: "workflow-boundary-instance",
      instanceVersion: 0,
      status: "CLEAR",
      stepId,
      workflowVersion: "1.0.0",
      ...(domain === override.domain ? override : {}),
    }),
  );
}

function blockerCodes(
  result: Awaited<ReturnType<WorkflowStepExecutionBoundary["prepare"]>>,
): readonly string[] {
  return result.status === "BLOCKED" ? result.blockers.map(({ code }) => code) : [];
}

function blockerStepIds(
  result: Awaited<ReturnType<WorkflowStepExecutionBoundary["prepare"]>>,
): readonly string[] {
  return result.status === "BLOCKED"
    ? result.blockers.flatMap(({ stepId }) => stepId === undefined ? [] : [stepId])
    : [];
}

async function snapshot(runner: SqliteRepositoryTransactionRunner) {
  return runner.transaction(async ({ workflows }) => ({
    events: await workflows.events.listByInstanceId("workflow-boundary-instance", 100),
    instance: await workflows.instances.getById("workflow-boundary-instance"),
    receipts: await workflows.receipts.listByInstanceId("workflow-boundary-instance"),
  }));
}

async function withTemporaryDatabase(
  operation: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-workflow-boundary-"));
  try {
    await operation(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
