import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  AgentInvocationValidator,
  AgentResultValidator,
  AgentSpecificationValidator,
  CONTENT_DIRECTOR_SPECIFICATION,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  DEFAULT_AGENT_COMPANY_MAP,
  DEFAULT_AGENT_PERMISSION_MATRIX,
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  DETERMINISTIC_CONTENT_DIRECTOR_BINDING,
  DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR,
  DefaultDenyAgentRuntimeResolver,
  DeterministicContentDirectorExecutor,
  DeterministicWorkflowStateMachine,
  ImmutableAgentRuntimeCatalog,
  ImmutableAgentSpecificationRegistry,
  InProcessAgentRuntime,
  SqliteRepositoryTransactionRunner,
  createWorkflowAgentInvoker,
  createWorkflowLifecycleService,
  createWorkflowPersistenceService,
  createWorkflowStepExecutionBoundary,
  type AgentInvocation,
  type AgentRuntime,
  type ControlledWorkflowAgentInvocationRequest,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowInstance,
  type WorkflowStepExecutionBoundaryRequest,
  type RepositoryTransaction,
  type RepositoryTransactionRunner,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Controlled Workflow Agent Invocation", () => {
  it("reserves, invokes once, stores bounded outcome and audit, and does not complete the step", async () => {
    const runner = createRunner(":memory:");
    await seed(runner);
    const recording = new RecordingRuntime(runtime());
    const invoker = createInvoker(runner, recording);

    const result = await invoker.invoke(request());
    expect(result).toMatchObject({ replayed: false, status: "COMPLETED", receipt: { executorId: "deterministic-content-director", status: "COMPLETED" } });
    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0]?.input).toEqual({
      audience: "Workflow stakeholders", brandPreferences: [], constraints: ["Preparation only", "No external effects", "Use only supplied evidence"], deliverableType: "workflow-content-direction", evidenceReferences: ["content-workflow@1.0.0"], objective: "Prepare content direction for workflow content-workflow step direction",
    });
    const stored = await runner.transaction(async ({ workflows }) => ({
      events: await workflows.agentInvocationEvents.listByInvocationId("workflow-invocation-1"),
      instance: await workflows.instances.getById("content-instance"),
      receipt: await workflows.agentInvocations.getById("workflow-invocation-1"),
    }));
    expect(stored.receipt?.result?.output).toMatchObject({ externalEffects: false, preparationOnly: true });
    expect(stored.events.map(({ status }) => status)).toEqual(["RESERVED", "COMPLETED"]);
    expect(stored.instance).toMatchObject({ status: "ACTIVE", steps: [{ status: "AWAITING_RESULT" }], version: 2 });
    await runner.close();
  });

  it("replays completed outcome without reinvocation after restart", async () => {
    await withDatabase(async (path) => {
      const first = createRunner(path); await seed(first);
      const recording = new RecordingRuntime(runtime());
      await createInvoker(first, recording).invoke(request());
      await first.close();
      const reopened = createRunner(path);
      const replayRuntime = new RecordingRuntime(runtime());
      const replay = await createInvoker(reopened, replayRuntime).invoke(request());
      expect(replay).toMatchObject({ replayed: true, status: "COMPLETED" });
      expect(replayRuntime.invocations).toHaveLength(0);
      await reopened.close();
    });
  });

  it("fails closed before runtime for stale candidate, unresolved executor, and changed Guardian evidence", async () => {
    const staleRunner = createRunner(":memory:"); await seed(staleRunner);
    const staleRuntime = new RecordingRuntime(runtime());
    expect(await createInvoker(staleRunner, staleRuntime).invoke(request({ boundaryRequest: { ...boundaryRequest(), expectedVersion: 2 } }))).toMatchObject({ status: "BLOCKED", blocker: { code: "CANDIDATE_BLOCKED" } });
    expect(staleRuntime.invocations).toHaveLength(0);
    await staleRunner.close();

    const missingRunner = createRunner(":memory:"); await seed(missingRunner);
    const missingRuntime = new RecordingRuntime(runtime());
    const invoker = createInvoker(missingRunner, missingRuntime, false);
    expect(await invoker.invoke(request())).toMatchObject({ status: "BLOCKED", blocker: { code: "EXECUTOR_UNRESOLVED" } });
    expect(missingRuntime.invocations).toHaveLength(0);
    await missingRunner.close();
  });

  it("maps thrown and malformed executor outcomes to bounded durable failures", async () => {
    for (const agentRuntime of [new ThrowingRuntime(), new MalformedRuntime()] as const) {
      const runner = createRunner(":memory:"); await seed(runner);
      const result = await createInvoker(runner, agentRuntime).invoke(request());
      expect(result).toMatchObject({ replayed: false, status: "FAILED", receipt: { externalEffectsAllowed: false, status: "FAILED" } });
      expect(JSON.stringify(result)).not.toMatch(/stack|prompt|completion|provider|secret/iu);
      await runner.close();
    }
  });

  it("rejects conflicting fingerprints and never accepts a duplicate outcome", async () => {
    const runner = createRunner(":memory:"); await seed(runner);
    const recording = new RecordingRuntime(runtime());
    const invoker = createInvoker(runner, recording);
    await invoker.invoke(request());
    const conflict = await invoker.invoke(request({ boundaryRequest: { ...boundaryRequest(), workspaceId: "workspace-other" } }));
    expect(conflict).toMatchObject({ status: "BLOCKED", blocker: { code: "INVOCATION_CONFLICT" } });
    expect(recording.invocations).toHaveLength(1);
    await runner.close();
  });

  it("recovers an interrupted reservation only by deterministic replay and rolls back failed reservation", async () => {
    const runner = createRunner(":memory:"); await seed(runner);
    const firstRuntime = new RecordingRuntime(runtime());
    await expect(createInvoker(new FailOnTransactionRunner(runner, 4), firstRuntime).invoke(request())).rejects.toThrow("injected transaction failure");
    expect(firstRuntime.invocations).toHaveLength(1);
    const reserved = await runner.transaction(({ workflows }) => workflows.agentInvocations.getById("workflow-invocation-1"));
    expect(reserved?.status).toBe("RESERVED");
    const replayRuntime = new RecordingRuntime(runtime());
    expect(await createInvoker(runner, replayRuntime).invoke(request())).toMatchObject({ status: "COMPLETED" });
    expect(replayRuntime.invocations).toHaveLength(1);
    await runner.close();

    const rollbackRunner = createRunner(":memory:"); await seed(rollbackRunner);
    await expect(createInvoker(new FailOnTransactionRunner(rollbackRunner, 3), new RecordingRuntime(runtime())).invoke(request())).rejects.toThrow("injected transaction failure");
    const rollback = await rollbackRunner.transaction(async ({ workflows }) => ({ instance: await workflows.instances.getById("content-instance"), receipt: await workflows.agentInvocations.getById("workflow-invocation-1") }));
    expect(rollback.instance?.version).toBe(0);
    expect(rollback.receipt).toBeUndefined();
    await rollbackRunner.close();
  });

  it("does not resume an interrupted reservation after pause or resume changed its exact version", async () => {
    const runner = createRunner(":memory:"); await seed(runner);
    await expect(createInvoker(new FailOnTransactionRunner(runner, 4), new RecordingRuntime(runtime())).invoke(request())).rejects.toThrow("injected transaction failure");
    const lifecycle = createWorkflowLifecycleService({ clock: new FixedClock(), maxAttempts: 3, operatorActorId: "fabio", repositories: runner });
    await lifecycle.controlWorkflow({ action: "PAUSE", actorId: "fabio", commandId: "pause-reserved", contractVersion: "1", controlId: "pause-reserved-1", expectedVersion: 2, instanceId: "content-instance", reasonCode: "operator_pause" });
    const pausedRuntime = new RecordingRuntime(runtime());
    expect(await createInvoker(runner, pausedRuntime).invoke(request())).toMatchObject({ status: "BLOCKED", blocker: { code: "INVOCATION_STATE_INVALID" } });
    await lifecycle.controlWorkflow({ action: "RESUME", actorId: "fabio", commandId: "resume-reserved", contractVersion: "1", controlId: "resume-reserved-1", expectedVersion: 3, instanceId: "content-instance", reasonCode: "operator_resume" });
    expect(await createInvoker(runner, pausedRuntime).invoke(request())).toMatchObject({ status: "BLOCKED", blocker: { code: "INVOCATION_STATE_INVALID" } });
    expect(pausedRuntime.invocations).toEqual([]);
    await runner.close();
  });
});

function createInvoker(runner: RepositoryTransactionRunner, agentRuntime: AgentRuntime, includeBinding = true) {
  const specifications = new ImmutableAgentSpecificationRegistry([CONTENT_DIRECTOR_SPECIFICATION], new AgentSpecificationValidator());
  const executor = new DeterministicContentDirectorExecutor();
  const catalog = new ImmutableAgentRuntimeCatalog([{ descriptor: DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR, executor }], includeBinding ? [DETERMINISTIC_CONTENT_DIRECTOR_BINDING] : [], specifications);
  const boundary = createWorkflowStepExecutionBoundary({ agentCompany: DEFAULT_AGENT_COMPANY_MAP, agentSpecifications: specifications, capabilities: DEFAULT_AGENT_CAPABILITY_REGISTRY, controlEvidenceMode: "DURABLE_ONLY", operatorActorId: "fabio", permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX, repositories: runner, responsibilities: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX });
  return createWorkflowAgentInvoker({ agentRuntime, agentSpecifications: specifications, boundary, clock: new FixedClock(), repositories: runner, resolver: new DefaultDenyAgentRuntimeResolver(catalog, specifications), resultValidator: new AgentResultValidator() });
}

function runtime(): AgentRuntime { return new InProcessAgentRuntime([new DeterministicContentDirectorExecutor()], new AgentInvocationValidator(), new AgentResultValidator(), new FixedClock()); }
class RecordingRuntime implements AgentRuntime { public readonly invocations: AgentInvocation[] = []; public constructor(private readonly delegate: AgentRuntime) {} public execute(value: AgentInvocation) { this.invocations.push(value); return this.delegate.execute(value); } }
class ThrowingRuntime implements AgentRuntime { public execute(): Promise<never> { return Promise.reject(new Error("sensitive internal failure")); } }
class MalformedRuntime implements AgentRuntime { public execute(): Promise<never> { return Promise.resolve({ status: "succeeded", output: { externalEffects: true } } as never); } }
class FailOnTransactionRunner implements RepositoryTransactionRunner {
  #count = 0;
  public constructor(private readonly delegate: RepositoryTransactionRunner, private readonly failAt: number) {}
  public transaction<T>(operation: (repositories: RepositoryTransaction) => Promise<T>): Promise<T> { this.#count += 1; if (this.#count === this.failAt) return Promise.reject(new Error("injected transaction failure")); return this.delegate.transaction(operation); }
}
class WorkflowEventIds implements WorkflowEventIdentifierGenerator { #value = 0; public nextWorkflowEventId() { this.#value += 1; return `workflow-event-${String(this.#value)}`; } }

async function seed(runner: SqliteRepositoryTransactionRunner): Promise<void> {
  const service = createWorkflowPersistenceService({ eventIds: new WorkflowEventIds(), repositories: runner, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
  await service.createDefinition(definition()); await service.createInstance(instance());
  await runner.transaction(async ({ workflows }) => {
    for (const domain of ["operator_safety", "quality"] as const) await workflows.guardians.insert({ contractVersion: "1", definitionId: "content-workflow@1.0.0", domain, evidenceId: `guardian-${domain}`, guardianId: `${domain}-guardian`, instanceId: "content-instance", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:00.000Z", status: "CLEAR", stepId: "direction", workflowVersion: "1.0.0" });
  });
}
function definition(): WorkflowDefinition { return { contractVersion: "1", definitionId: "content-workflow@1.0.0", nonExecuting: true, steps: [{ approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "direction" }], workflowId: "content-workflow", workflowVersion: "1.0.0" }; }
function instance(): WorkflowInstance { return { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: "content-workflow@1.0.0", instanceId: "content-instance", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "PENDING", stepId: "direction" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0 }; }
function boundaryRequest(): WorkflowStepExecutionBoundaryRequest { return { actorId: "actor-local", agentAssignment: { agentId: "content-director", capabilityIds: ["content-strategy"], permissionIds: ["content-strategy-permission"], responsibilityAreaId: "content-direction", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0" }, approvalEvidence: [], contractVersion: "1", expectedDefinitionId: "content-workflow@1.0.0", expectedVersion: 0, expectedWorkflowVersion: "1.0.0", guardianEvidence: [], instanceId: "content-instance", maxBlockers: 16, nonExecuting: true, policyDecision: { actorId: "actor-local", agent: { agentId: "content-director", version: "1.0.0" }, contractVersion: "1", decisionId: "policy-content-direction", deniedPermissions: [], effectivePermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], evaluatedAt: "2026-01-01T00:00:00.000Z", requestedPermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], taskId: "content-instance", workspaceId: "workspace-local" }, selection: { mode: "EXACT_STEP", stepId: "direction" }, workspaceId: "workspace-local" }; }
function request(overrides: Partial<ControlledWorkflowAgentInvocationRequest> = {}): ControlledWorkflowAgentInvocationRequest { return { boundaryRequest: boundaryRequest(), contractVersion: "1", invocationId: "workflow-invocation-1", ...overrides }; }
function createRunner(path: string) { return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); }
async function withDatabase(operation: (path: string) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-invocation-")); try { await operation(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
