import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  SqliteRepositoryTransactionRunner,
  createWorkflowLifecycleService,
  createWorkflowPersistenceService,
  DeterministicWorkflowStateMachine,
  type WorkflowDefinition,
  type WorkflowEventIdentifierGenerator,
  type WorkflowFailureCategory,
  type WorkflowInstance,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Workflow failure and retry eligibility", () => {
  it("records an explicit non-expired timeout evaluation without changing state", async () => {
    const runner = createRunner(":memory:"); await seedReservedInvocation(runner);
    const lifecycle = service(runner, 3, new FixedClock("2026-01-01T00:00:30.000Z"));
    const first = await lifecycle.evaluateTimeout(timeoutRequest());
    expect(first).toMatchObject({ replayed: false, record: { instanceVersion: 2, invocationId: "invocation-1", kind: "TIMEOUT_EVALUATION" } });
    expect(await lifecycle.evaluateTimeout(timeoutRequest())).toEqual({ ...first, replayed: true });
    const stored = await runner.transaction(async ({ workflows }) => ({ instance: await workflows.instances.getById("instance-1"), events: await workflows.events.listByInstanceId("instance-1", 10) }));
    expect(stored.instance).toMatchObject({ status: "ACTIVE", version: 2, steps: [{ status: "AWAITING_RESULT" }] });
    expect(stored.events).toEqual([]);
    await runner.close();
  });

  it("atomically classifies timeout at the deadline as a bounded retryable failure", async () => {
    const runner = createRunner(":memory:"); await seedReservedInvocation(runner);
    const lifecycle = service(runner, 3, new FixedClock("2026-01-01T00:01:00.000Z"));
    const expired = await lifecycle.evaluateTimeout(timeoutRequest());
    expect(expired).toMatchObject({ record: { attempt: 1, category: "TIMEOUT", instanceVersion: 3, kind: "FAILURE", maxAttempts: 3, retryable: true } });
    expect(await lifecycle.authorizeRetry({ ...retryRequest(), failureId: "timeout-evaluation-1" })).toMatchObject({ record: { retryDecision: "AUTHORIZED" } });
    const stored = await runner.transaction(({ workflows }) => workflows.instances.getById("instance-1"));
    expect(stored).toMatchObject({ status: "FAILED", version: 3, steps: [{ status: "FAILED" }] });
    await runner.close();
  });

  it("fails closed for unauthorized, unconfigured, stale, and mismatched timeout evaluation", async () => {
    const runner = createRunner(":memory:"); await seedReservedInvocation(runner);
    const lifecycle = service(runner, 3, new FixedClock("2026-01-01T00:01:00.000Z"));
    expect(() => lifecycle.evaluateTimeout(timeoutRequest({ actorId: "not-fabio" }))).toThrow(/operator/iu);
    expect(() => lifecycle.evaluateTimeout(timeoutRequest({ timeoutMs: 30_000 }))).toThrow(/configured timeout/iu);
    await expect(lifecycle.evaluateTimeout(timeoutRequest({ expectedVersion: 9 }))).rejects.toThrow(/snapshot/iu);
    await expect(lifecycle.evaluateTimeout(timeoutRequest({ invocationId: "missing" }))).rejects.toThrow(/activity/iu);
    await runner.close();
  });

  it("replays an expired timeout after restart without a second failure transition", async () => {
    await withDatabase(async (path) => {
      const first = createRunner(path); await seedReservedInvocation(first);
      const clock = new FixedClock("2026-01-01T00:01:00.000Z");
      const expired = await service(first, 3, clock).evaluateTimeout(timeoutRequest());
      await first.close();
      const reopened = createRunner(path);
      expect(await service(reopened, 3, clock).evaluateTimeout(timeoutRequest())).toEqual({ ...expired, replayed: true });
      const stored = await reopened.transaction(async ({ workflows }) => ({ instance: await workflows.instances.getById("instance-1"), records: await workflows.lifecycleRecords.listByStep("instance-1", "step-1") }));
      expect(stored.instance?.version).toBe(3);
      expect(stored.records.filter(({ kind }) => kind === "FAILURE")).toHaveLength(1);
      await reopened.close();
    });
  });
  it("pauses, resumes, and cancels only through explicit durable operator controls", async () => {
    const runner = createRunner(":memory:"); await seedWorkflow(runner);
    const pause = await service(runner).controlWorkflow(controlRequest("PAUSE", { commandId: "pause-command", controlId: "pause-1" }));
    expect(await service(runner).controlWorkflow(controlRequest("PAUSE", { commandId: "pause-command", controlId: "pause-1" }))).toEqual({ ...pause, replayed: true });
    const resume = await service(runner).controlWorkflow(controlRequest("RESUME", { commandId: "resume-command", controlId: "resume-1", expectedVersion: 1 }));
    const cancellation = await service(runner).controlWorkflow(controlRequest("CANCEL", { commandId: "cancel-command", controlId: "cancel-1", expectedVersion: 2 }));
    expect([pause.record.kind, resume.record.kind, cancellation.record.kind]).toEqual(["PAUSE", "RESUME", "CANCELLATION"]);
    const stored = await runner.transaction(async ({ workflows }) => ({
      events: await workflows.events.listByInstanceId("instance-1", 10),
      instance: await workflows.instances.getById("instance-1"),
      records: await workflows.lifecycleRecords.listByStep("instance-1", "workflow"),
    }));
    expect(stored.instance).toMatchObject({ status: "CANCELLED", stopReason: "CANCELLED_BY_OPERATOR", version: 3, steps: [{ status: "CANCELLED" }] });
    expect(stored.events.map(({ commandKind }) => commandKind)).toEqual(["PAUSE", "RESUME", "CANCEL"]);
    expect(stored.records).toHaveLength(3);
    expect(resume.record.recoveryInstructions).toContain("Re-evaluate readiness, policy, approval, Guardian, specification, executor, and version before invocation.");
    expect(cancellation.record.recoveryInstructions).toContain("Completed and failure evidence is retained; no external compensation is claimed.");
    await runner.close();
  });

  it("fails closed for unauthorized, stale, invalid-state, and bypassed lifecycle controls", async () => {
    const runner = createRunner(":memory:"); await seedWorkflow(runner);
    expect(() => service(runner).controlWorkflow(controlRequest("PAUSE", { actorId: "not-fabio" }))).toThrow(/operator/iu);
    await expect(service(runner).controlWorkflow(controlRequest("PAUSE", { expectedVersion: 9 }))).rejects.toThrow(/stale/iu);
    const persistence = createWorkflowPersistenceService({ eventIds: new EventIds(), repositories: runner, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
    await expect(persistence.applyCommand({ actorCategory: "operator", command: { commandId: "bypass-pause", expectedVersion: 0, kind: "PAUSE", nonExecuting: true, reasonCode: "bypass" }, instanceId: "instance-1" })).rejects.toThrow(/operator evidence/iu);
    await service(runner).controlWorkflow(controlRequest("PAUSE"));
    await expect(service(runner).controlWorkflow(controlRequest("PAUSE", { commandId: "pause-again", controlId: "pause-again", expectedVersion: 1 }))).rejects.toThrow(/invalid workflow transition/iu);
    await runner.close();
  });

  it("replays lifecycle control after restart and retains completed step evidence on cancellation", async () => {
    await withDatabase(async (path) => {
      const first = createRunner(path);
      const persistence = createWorkflowPersistenceService({ eventIds: new EventIds(), repositories: first, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
      const twoStepDefinition: WorkflowDefinition = { ...definition(), steps: [
        { approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "step-1" },
        { approvalRequired: false, dependencies: ["step-1"], guardianRequired: false, nonExecuting: true, stepId: "step-2" },
      ] };
      const twoStepInstance: WorkflowInstance = { ...instance(), steps: [
        { blockers: [], status: "SUCCEEDED", stepId: "step-1" },
        { blockers: [], status: "READY", stepId: "step-2" },
      ] };
      await persistence.createDefinition(twoStepDefinition); await persistence.createInstance(twoStepInstance);
      const pause = await service(first).controlWorkflow(controlRequest("PAUSE"));
      await first.close();
      const reopened = createRunner(path);
      expect(await service(reopened).controlWorkflow(controlRequest("PAUSE"))).toEqual({ ...pause, replayed: true });
      await service(reopened).controlWorkflow(controlRequest("RESUME", { expectedVersion: 1 }));
      await service(reopened).controlWorkflow(controlRequest("CANCEL", { expectedVersion: 2 }));
      const cancelled = await reopened.transaction(({ workflows }) => workflows.instances.getById("instance-1"));
      expect(cancelled?.steps).toEqual([
        { blockers: [], status: "SUCCEEDED", stepId: "step-1" },
        { blockers: [], status: "CANCELLED", stepId: "step-2" },
      ]);
      await reopened.close();
    });
  });
  it("atomically records bounded retryable failure evidence and fails the step", async () => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
    const result = await service(runner).recordFailure(failureRequest());
    expect(result).toMatchObject({ replayed: false, record: { attempt: 1, category: "TRANSIENT_RUNTIME", instanceVersion: 3, kind: "FAILURE", maxAttempts: 3, retryable: true } });
    expect(result.record.recoveryInstructions).toContain("Do not retry automatically.");
    const stored = await runner.transaction(async ({ workflows }) => ({ events: await workflows.lifecycleEvents.listByRecordId("failure-1"), instance: await workflows.instances.getById("instance-1"), records: await workflows.lifecycleRecords.listByStep("instance-1", "step-1"), workflowEvents: await workflows.events.listByInstanceId("instance-1", 10) }));
    expect(stored.instance).toMatchObject({ status: "FAILED", stopReason: "FAILED_STEP", version: 3, steps: [{ status: "FAILED" }] });
    expect(stored.records).toEqual([result.record]);
    expect(stored.events).toHaveLength(1);
    expect(stored.workflowEvents).toHaveLength(1);
    await runner.close();
  });

  it("authorizes eligible retry without executing or changing workflow state", async () => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
    await service(runner).recordFailure(failureRequest());
    const first = await service(runner).authorizeRetry(retryRequest());
    const replay = await service(runner).authorizeRetry(retryRequest());
    expect(first).toMatchObject({ replayed: false, record: { kind: "RETRY_AUTHORIZATION", retryDecision: "AUTHORIZED" } });
    expect(first.record.recoveryInstructions[0]).toBe("Retry is authorized but has not executed.");
    expect(replay).toEqual({ ...first, replayed: true });
    const instance = await runner.transaction(({ workflows }) => workflows.instances.getById("instance-1"));
    expect(instance).toMatchObject({ status: "FAILED", version: 3, steps: [{ status: "FAILED" }] });
    await runner.close();
  });

  it("explicitly consumes authorization and durably restores only retry eligibility", async () => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
    await service(runner).recordFailure(failureRequest());
    await service(runner).authorizeRetry(retryRequest());
    const first = await service(runner).executeRetry(executionRequest());
    const replay = await service(runner).executeRetry(executionRequest());
    expect(first).toMatchObject({ replayed: false, record: { authorizationId: "retry-auth-1", failureId: "failure-1", instanceVersion: 4, kind: "RETRY_EXECUTION" } });
    expect(first.record.recoveryInstructions).toContain("No invocation or external action occurred during retry execution.");
    expect(replay).toEqual({ ...first, replayed: true });
    const stored = await runner.transaction(async ({ workflows }) => ({
      instance: await workflows.instances.getById("instance-1"),
      invocations: await workflows.agentInvocationEvents.listByInvocationId("invocation-1"),
      lifecycleEvents: await workflows.lifecycleEvents.listByRecordId("retry-execution-1"),
      records: await workflows.lifecycleRecords.listByStep("instance-1", "step-1"),
      workflowEvents: await workflows.events.listByInstanceId("instance-1", 10),
    }));
    expect(stored.instance).toMatchObject({ status: "ACTIVE", stopReason: "NONE", version: 4, steps: [{ status: "READY" }] });
    expect(stored.instance?.receipts.at(-1)).toMatchObject({ commandId: "retry-command-1", resultingVersion: 4 });
    expect(stored.records.map(({ kind }) => kind)).toEqual(["FAILURE", "RETRY_AUTHORIZATION", "RETRY_EXECUTION"]);
    expect(stored.lifecycleEvents).toHaveLength(1);
    expect(stored.workflowEvents.at(-1)).toMatchObject({ actorCategory: "operator", commandKind: "RETRY_STEP", nextStatus: "ACTIVE", nextStepStatus: "READY", nonExecuting: true });
    expect(stored.invocations).toEqual([]);
    await runner.close();
  });

  it("fails closed for invalid, denied, stale, mismatched, or consumed retry execution", async () => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
    await service(runner).recordFailure(failureRequest());
    await service(runner).authorizeRetry(retryRequest());
    await expect(runner.transaction(async ({ workflows }) => {
      const failed = await workflows.instances.getById("instance-1");
      if (failed === undefined) throw new Error("missing failed workflow");
      const bypass = new DeterministicWorkflowStateMachine(new FixedClock()).apply(failed, { commandId: "bypass-retry", expectedVersion: 3, kind: "RETRY_STEP", nonExecuting: true, reasonCode: "bypass", stepId: "step-1" });
      await workflows.instances.update(bypass.instance, { version: 3 });
    })).rejects.toThrow(/explicit retry authorization/iu);
    expect(() => service(runner).executeRetry(executionRequest({ actorId: "not-fabio" }))).toThrow(/operator/iu);
    await expect(service(runner).executeRetry(executionRequest({ expectedVersion: 99 }))).rejects.toThrow(/snapshot/iu);
    await expect(service(runner).executeRetry(executionRequest({ failureId: "wrong-failure" }))).rejects.toThrow(/authorization/iu);
    await expect(service(runner).executeRetry(executionRequest({ authorizationId: "missing" }))).rejects.toThrow(/authorization/iu);
    await service(runner).executeRetry(executionRequest());
    await expect(service(runner).executeRetry(executionRequest({ executionId: "retry-execution-2", commandId: "retry-command-2", expectedVersion: 4 }))).rejects.toThrow(/snapshot|consumed/iu);
    await runner.close();

    const denied = createRunner(":memory:"); await seedFailedInvocation(denied);
    await service(denied, 1).recordFailure(failureRequest({ maxAttempts: 1 }));
    await service(denied, 1).authorizeRetry(retryRequest());
    await expect(service(denied, 1).executeRetry(executionRequest())).rejects.toThrow(/authorization/iu);
    await denied.close();
  });

  it.each([
    ["VALIDATION", 1, "DENIED_EXHAUSTED"],
    ["TRANSIENT_RUNTIME", 1, "DENIED_EXHAUSTED"],
  ] as const)("denies bounded retry for %s", async (category, maxAttempts, decision) => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner, category === "VALIDATION" ? "AGENT_RESULT_INVALID" : "AGENT_EXECUTION_FAILED");
    await service(runner, maxAttempts).recordFailure(failureRequest({ category, maxAttempts }));
    expect(await service(runner, maxAttempts).authorizeRetry(retryRequest())).toMatchObject({ record: { retryDecision: decision } });
    await runner.close();
  });

  it("fails closed for stale version, wrong operator, conflicting ID, and mismatched source", async () => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
    await expect(service(runner).recordFailure(failureRequest({ expectedVersion: 99 }))).rejects.toThrow(/stale/iu);
    expect(() => service(runner).recordFailure(failureRequest({ maxAttempts: 5 }))).toThrow(/retry limit/iu);
    await expect(service(runner).recordFailure(failureRequest({ invocationId: "missing" }))).rejects.toThrow(/source/iu);
    await service(runner).recordFailure(failureRequest());
    await expect(service(runner).recordFailure(failureRequest({ category: "PERMANENT" }))).rejects.toThrow(/conflicts/iu);
    expect(() => service(runner).authorizeRetry(retryRequest({ actorId: "not-fabio" }))).toThrow(/operator/iu);
    await runner.close();
  });

  it("replays failure and authorization after restart with immutable audit evidence", async () => {
    await withDatabase(async (path) => {
      const first = createRunner(path); await seedFailedInvocation(first);
      const failure = await service(first).recordFailure(failureRequest());
      const authorization = await service(first).authorizeRetry(retryRequest());
      const execution = await service(first).executeRetry(executionRequest());
      await first.close();
      const reopened = createRunner(path);
      expect(await service(reopened).recordFailure(failureRequest())).toEqual({ ...failure, replayed: true });
      expect(await service(reopened).authorizeRetry(retryRequest())).toEqual({ ...authorization, replayed: true });
      expect(await service(reopened).executeRetry(executionRequest())).toEqual({ ...execution, replayed: true });
      await reopened.close();
    });
  });
});

function service(runner: SqliteRepositoryTransactionRunner, maxAttempts = 3, clock = new FixedClock(), timeoutMs = 60_000) { return createWorkflowLifecycleService({ clock, maxAttempts, operatorActorId: "fabio", repositories: runner, timeoutMs }); }
function failureRequest(overrides: Partial<ReturnType<typeof failureRequestBase>> = {}) { return { ...failureRequestBase(), ...overrides }; }
function failureRequestBase() { return { actorId: "runtime-local", category: "TRANSIENT_RUNTIME" as WorkflowFailureCategory, commandId: "fail-command-1", contractVersion: "1" as const, expectedVersion: 2, failureId: "failure-1", instanceId: "instance-1", invocationId: "invocation-1", maxAttempts: 3, reasonCode: "deterministic_runtime_failure", stepId: "step-1" }; }
function retryRequest(overrides: Partial<ReturnType<typeof retryRequestBase>> = {}) { return { ...retryRequestBase(), ...overrides }; }
function retryRequestBase() { return { actorId: "fabio", authorizationId: "retry-auth-1", contractVersion: "1" as const, expectedVersion: 3, failureId: "failure-1", instanceId: "instance-1", stepId: "step-1" }; }
function executionRequest(overrides: Partial<ReturnType<typeof executionRequestBase>> = {}) { return { ...executionRequestBase(), ...overrides }; }
function executionRequestBase() { return { actorId: "fabio", authorizationId: "retry-auth-1", commandId: "retry-command-1", contractVersion: "1" as const, executionId: "retry-execution-1", expectedVersion: 3, failureId: "failure-1", instanceId: "instance-1", stepId: "step-1" }; }
function controlRequest(action: "CANCEL" | "PAUSE" | "RESUME", overrides: Partial<{ actorId: string; commandId: string; controlId: string; expectedVersion: number; reasonCode: string }> = {}) { return { action, actorId: "fabio", commandId: `${action.toLowerCase()}-command`, contractVersion: "1" as const, controlId: `${action.toLowerCase()}-1`, expectedVersion: 0, instanceId: "instance-1", reasonCode: "operator_lifecycle_control", ...overrides }; }
function timeoutRequest(overrides: Partial<ReturnType<typeof timeoutRequestBase>> = {}) { return { ...timeoutRequestBase(), ...overrides }; }
function timeoutRequestBase() { return { actorId: "fabio", commandId: "timeout-command-1", contractVersion: "1" as const, evaluationId: "timeout-evaluation-1", expectedVersion: 2, instanceId: "instance-1", invocationId: "invocation-1", stepId: "step-1", timeoutMs: 60_000 }; }

async function seedWorkflow(runner: SqliteRepositoryTransactionRunner) {
  const persistence = createWorkflowPersistenceService({ eventIds: new EventIds(), repositories: runner, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
  await persistence.createDefinition(definition()); await persistence.createInstance(instance());
}

async function seedFailedInvocation(runner: SqliteRepositoryTransactionRunner, failureCode: "AGENT_EXECUTION_FAILED" | "AGENT_RESULT_INVALID" = "AGENT_EXECUTION_FAILED") {
  await seedWorkflow(runner);
  await runner.transaction(async ({ workflows }) => {
    const initial = await workflows.instances.getById("instance-1");
    if (initial === undefined) throw new Error("missing seed instance");
    const readyReceipt = { commandId: "seed-ready", fingerprint: "a".repeat(64), resultingVersion: 1 };
    const ready = { ...initial, receipts: [readyReceipt], steps: [{ blockers: [], status: "READY" as const, stepId: "step-1" }], updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
    await workflows.instances.update(ready, { version: 0 }); await workflows.receipts.insert("instance-1", readyReceipt);
    const reserveReceipt = { commandId: "seed-reserve", fingerprint: "b".repeat(64), resultingVersion: 2 };
    const awaiting = { ...ready, receipts: [...ready.receipts, reserveReceipt], steps: [{ blockers: [], status: "AWAITING_RESULT" as const, stepId: "step-1" }], version: 2 };
    await workflows.instances.update(awaiting, { version: 1 }); await workflows.receipts.insert("instance-1", reserveReceipt);
    await workflows.agentInvocations.insert({ capabilityIds: ["content-strategy"], completedAt: "2026-01-01T00:00:00.000Z", contractVersion: "1", definitionId: "definition@1.0.0", executorId: "deterministic-content-director", executorVersion: "1.0.0", externalEffectsAllowed: false, failure: { code: failureCode, message: "Agent execution failed safely" }, fingerprint: "c".repeat(64), inputContractId: "deterministic-content-direction-input@1", instanceId: "instance-1", invocationId: "invocation-1", outputContractId: "deterministic-content-direction-artifact@1", reservedAt: "2026-01-01T00:00:00.000Z", reservedInstanceVersion: 2, runtimeAgentId: "content-director", runtimeAgentVersion: "1.0.0", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0", status: "FAILED", stepId: "step-1", workflowId: "workflow", workflowVersion: "1.0.0" });
  });
}
async function seedReservedInvocation(runner: SqliteRepositoryTransactionRunner) {
  await seedWorkflow(runner);
  await runner.transaction(async ({ workflows }) => {
    const initial = await workflows.instances.getById("instance-1");
    if (initial === undefined) throw new Error("missing seed instance");
    const readyReceipt = { commandId: "seed-ready", fingerprint: "a".repeat(64), resultingVersion: 1 };
    const ready = { ...initial, receipts: [readyReceipt], steps: [{ blockers: [], status: "READY" as const, stepId: "step-1" }], updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
    await workflows.instances.update(ready, { version: 0 }); await workflows.receipts.insert("instance-1", readyReceipt);
    const reserveReceipt = { commandId: "seed-reserve", fingerprint: "b".repeat(64), resultingVersion: 2 };
    const awaiting = { ...ready, receipts: [...ready.receipts, reserveReceipt], steps: [{ blockers: [], status: "AWAITING_RESULT" as const, stepId: "step-1" }], version: 2 };
    await workflows.instances.update(awaiting, { version: 1 }); await workflows.receipts.insert("instance-1", reserveReceipt);
    await workflows.agentInvocations.insert({ capabilityIds: ["content-strategy"], contractVersion: "1", definitionId: "definition@1.0.0", executorId: "deterministic-content-director", executorVersion: "1.0.0", externalEffectsAllowed: false, fingerprint: "c".repeat(64), inputContractId: "deterministic-content-direction-input@1", instanceId: "instance-1", invocationId: "invocation-1", outputContractId: "deterministic-content-direction-artifact@1", reservedAt: "2026-01-01T00:00:00.000Z", reservedInstanceVersion: 2, runtimeAgentId: "content-director", runtimeAgentVersion: "1.0.0", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0", status: "RESERVED", stepId: "step-1", workflowId: "workflow", workflowVersion: "1.0.0" });
  });
}
function definition(): WorkflowDefinition { return { contractVersion: "1", definitionId: "definition@1.0.0", nonExecuting: true, steps: [{ approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "step-1" }], workflowId: "workflow", workflowVersion: "1.0.0" }; }
function instance(): WorkflowInstance { return { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: "definition@1.0.0", instanceId: "instance-1", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "PENDING", stepId: "step-1" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0 }; }
class EventIds implements WorkflowEventIdentifierGenerator { public nextWorkflowEventId() { return "unused-event"; } }
function createRunner(path: string) { return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); }
async function withDatabase(operation: (path: string) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-lifecycle-")); try { await operation(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
