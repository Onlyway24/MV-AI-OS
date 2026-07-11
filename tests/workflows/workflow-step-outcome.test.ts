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
  createWorkflowPersistenceService,
  createWorkflowStepExecutionBoundary,
  createWorkflowStepOutcomeService,
  type AgentInvocation,
  type AgentResult,
  type AgentRuntime,
  type ControlledWorkflowAgentInvocationRequest,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowInstance,
  type WorkflowStepExecutionBoundaryRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Workflow Step Outcome Validation and Completion", () => {
  it("accepts exact structured output atomically and does not start the next step", async () => {
    const runner = createRunner(":memory:"); await seed(runner);
    const context = runtimeContext(runner, deterministicRuntime());
    expect((await context.invoker.invoke(invocationRequest())).status).toBe("COMPLETED");
    const result = await context.outcomes.review(outcomeRequest());
    expect(result).toMatchObject({ replayed: false, receipt: { decision: "ACCEPTED_FOR_COMPLETION", resultingInstanceVersion: 3 } });
    const stored = await runner.transaction(async ({ workflows }) => ({ events: await workflows.events.listByInstanceId("content-instance", 10), instance: await workflows.instances.getById("content-instance"), outcome: await workflows.stepOutcomes.getById("outcome-1") }));
    expect(stored.instance).toMatchObject({ status: "ACTIVE", version: 3, steps: [{ stepId: "direction", status: "SUCCEEDED" }, { stepId: "publish-preparation", status: "PENDING" }] });
    expect(stored.events).toHaveLength(1);
    expect(stored.outcome).toEqual(result.receipt);
    await runner.close();
  });

  it("replays accepted completion after restart without a second version increment", async () => {
    await withDatabase(async (path) => {
      const first = createRunner(path); await seed(first);
      const firstContext = runtimeContext(first, deterministicRuntime());
      await firstContext.invoker.invoke(invocationRequest());
      const accepted = await firstContext.outcomes.review(outcomeRequest());
      await first.close();
      const reopened = createRunner(path);
      const replay = await runtimeContext(reopened, new NeverRuntime()).outcomes.review(outcomeRequest());
      expect(replay).toEqual({ ...accepted, replayed: true });
      const instance = await reopened.transaction(({ workflows }) => workflows.instances.getById("content-instance"));
      expect(instance?.version).toBe(3);
      await reopened.close();
    });
  });

  it("returns needs revision for missing evidence and leaves the step awaiting result", async () => {
    const runner = createRunner(":memory:"); await seed(runner);
    const context = runtimeContext(runner, new EvidenceFreeRuntime());
    expect((await context.invoker.invoke(invocationRequest())).status).toBe("COMPLETED");
    const result = await context.outcomes.review(outcomeRequest());
    expect(result).toMatchObject({ receipt: { decision: "NEEDS_REVISION", remediation: ["Add at least one authoritative evidence reference", "Resolve every claim-risk indicator"] } });
    const instance = await runner.transaction(({ workflows }) => workflows.instances.getById("content-instance"));
    expect(instance?.version).toBe(2);
    expect(instance?.steps[0]).toMatchObject({ status: "AWAITING_RESULT" });
    await runner.close();
  });

  it("fails closed for failed invocation, stale version, and missing exact binding", async () => {
    const failedRunner = createRunner(":memory:"); await seed(failedRunner);
    const failedContext = runtimeContext(failedRunner, new ThrowingRuntime());
    await failedContext.invoker.invoke(invocationRequest());
    expect(await failedContext.outcomes.review(outcomeRequest())).toMatchObject({ receipt: { decision: "FAILED" } });
    await failedRunner.close();

    const staleRunner = createRunner(":memory:"); await seed(staleRunner);
    const staleContext = runtimeContext(staleRunner, deterministicRuntime()); await staleContext.invoker.invoke(invocationRequest());
    expect(await staleContext.outcomes.review({ ...outcomeRequest(), expectedInstanceVersion: 99 })).toMatchObject({ receipt: { decision: "BLOCKED" } });
    expect(await staleContext.outcomes.review(outcomeRequest())).toMatchObject({ receipt: { decision: "ACCEPTED_FOR_COMPLETION" } });
    await staleRunner.close();

    const bindingRunner = createRunner(":memory:"); await seed(bindingRunner);
    const bound = runtimeContext(bindingRunner, deterministicRuntime()); await bound.invoker.invoke(invocationRequest());
    const withoutBinding = runtimeContext(bindingRunner, new NeverRuntime(), false);
    expect(await withoutBinding.outcomes.review(outcomeRequest())).toMatchObject({ receipt: { decision: "BLOCKED", remediation: ["Exact invocation binding no longer resolves"] } });
    await bindingRunner.close();
  });
});

function runtimeContext(runner: SqliteRepositoryTransactionRunner, agentRuntime: AgentRuntime, includeBinding = true) {
  const specifications = new ImmutableAgentSpecificationRegistry([CONTENT_DIRECTOR_SPECIFICATION], new AgentSpecificationValidator());
  const executor = new DeterministicContentDirectorExecutor();
  const catalog = new ImmutableAgentRuntimeCatalog([{ descriptor: DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR, executor }], includeBinding ? [DETERMINISTIC_CONTENT_DIRECTOR_BINDING] : [], specifications);
  const resolver = new DefaultDenyAgentRuntimeResolver(catalog, specifications);
  const boundary = createWorkflowStepExecutionBoundary({ agentCompany: DEFAULT_AGENT_COMPANY_MAP, agentSpecifications: specifications, capabilities: DEFAULT_AGENT_CAPABILITY_REGISTRY, controlEvidenceMode: "DURABLE_ONLY", operatorActorId: "fabio", permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX, repositories: runner, responsibilities: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX });
  return { invoker: createWorkflowAgentInvoker({ agentRuntime, agentSpecifications: specifications, boundary, clock: new FixedClock(), repositories: runner, resolver, resultValidator: new AgentResultValidator() }), outcomes: createWorkflowStepOutcomeService({ clock: new FixedClock(), repositories: runner, resolver }) };
}

function deterministicRuntime(): AgentRuntime { return new InProcessAgentRuntime([new DeterministicContentDirectorExecutor()], new AgentInvocationValidator(), new AgentResultValidator(), new FixedClock()); }
class NeverRuntime implements AgentRuntime { public execute(): Promise<never> { throw new Error("must not execute"); } }
class ThrowingRuntime implements AgentRuntime { public execute(): Promise<never> { return Promise.reject(new Error("internal")); } }
class EvidenceFreeRuntime implements AgentRuntime { public execute(invocation: AgentInvocation): Promise<AgentResult> { return Promise.resolve({ agent: invocation.agent, completedAt: "2026-01-01T00:00:00.000Z", contractVersion: "1", evidence: [], invocationId: invocation.invocationId, memoryProposals: [], output: { approvalSensitiveElements: [], claimRiskFlags: ["Claims require supplied evidence before external use"], contentPillars: ["Direction"], evidenceReferences: [], externalEffects: false, handoffSummary: "Prepare this direction after evidence is supplied.", messageHierarchy: ["Objective", "Audience", "Format"], normalizedObjective: "Direction", preparationOnly: true, qualityReviewChecklist: ["Objective is explicit", "Audience fit is visible", "Claims map to supplied evidence", "Approval-sensitive elements are flagged"], recommendedStructure: ["Opening", "Message", "Evidence"], targetAudience: "Stakeholders" }, status: "succeeded", taskId: invocation.taskId }); } }
class WorkflowEventIds implements WorkflowEventIdentifierGenerator { #value = 0; public nextWorkflowEventId() { this.#value += 1; return `seed-event-${String(this.#value)}`; } }

async function seed(runner: SqliteRepositoryTransactionRunner) {
  const persistence = createWorkflowPersistenceService({ eventIds: new WorkflowEventIds(), repositories: runner, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
  await persistence.createDefinition(definition()); await persistence.createInstance(instance());
  await runner.transaction(async ({ workflows }) => { for (const domain of ["operator_safety", "quality"] as const) await workflows.guardians.insert({ contractVersion: "1", definitionId: "content-workflow@1.0.0", domain, evidenceId: `guardian-${domain}`, guardianId: `${domain}-guardian`, instanceId: "content-instance", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:00.000Z", status: "CLEAR", stepId: "direction", workflowVersion: "1.0.0" }); });
}
function definition(): WorkflowDefinition { return { contractVersion: "1", definitionId: "content-workflow@1.0.0", nonExecuting: true, steps: [{ approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "direction" }, { approvalRequired: false, dependencies: ["direction"], guardianRequired: false, nonExecuting: true, stepId: "publish-preparation" }], workflowId: "content-workflow", workflowVersion: "1.0.0" }; }
function instance(): WorkflowInstance { return { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: "content-workflow@1.0.0", instanceId: "content-instance", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "PENDING", stepId: "direction" }, { blockers: [], status: "PENDING", stepId: "publish-preparation" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0 }; }
function boundaryRequest(): WorkflowStepExecutionBoundaryRequest { return { actorId: "actor-local", agentAssignment: { agentId: "content-director", capabilityIds: ["content-strategy"], permissionIds: ["content-strategy-permission"], responsibilityAreaId: "content-direction", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0" }, approvalEvidence: [], contractVersion: "1", expectedDefinitionId: "content-workflow@1.0.0", expectedVersion: 0, expectedWorkflowVersion: "1.0.0", guardianEvidence: [], instanceId: "content-instance", maxBlockers: 16, nonExecuting: true, policyDecision: { actorId: "actor-local", agent: { agentId: "content-director", version: "1.0.0" }, contractVersion: "1", decisionId: "policy-content", deniedPermissions: [], effectivePermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], evaluatedAt: "2026-01-01T00:00:00.000Z", requestedPermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], taskId: "content-instance", workspaceId: "workspace-local" }, selection: { mode: "EXACT_STEP", stepId: "direction" }, workspaceId: "workspace-local" }; }
function invocationRequest(): ControlledWorkflowAgentInvocationRequest { return { boundaryRequest: boundaryRequest(), contractVersion: "1", invocationId: "invocation-1" }; }
function outcomeRequest() { return { contractVersion: "1" as const, expectedInstanceVersion: 2, invocationId: "invocation-1", outcomeId: "outcome-1" }; }
function createRunner(path: string) { return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); }
async function withDatabase(operation: (path: string) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-outcome-")); try { await operation(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
