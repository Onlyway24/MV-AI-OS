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

  it.each([
    ["PERMANENT", 3, "DENIED_NON_RETRYABLE"],
    ["TRANSIENT_RUNTIME", 1, "DENIED_EXHAUSTED"],
  ] as const)("denies bounded retry for %s", async (category, maxAttempts, decision) => {
    const runner = createRunner(":memory:"); await seedFailedInvocation(runner);
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
      await first.close();
      const reopened = createRunner(path);
      expect(await service(reopened).recordFailure(failureRequest())).toEqual({ ...failure, replayed: true });
      expect(await service(reopened).authorizeRetry(retryRequest())).toEqual({ ...authorization, replayed: true });
      await reopened.close();
    });
  });
});

function service(runner: SqliteRepositoryTransactionRunner, maxAttempts = 3) { return createWorkflowLifecycleService({ clock: new FixedClock(), maxAttempts, operatorActorId: "fabio", repositories: runner }); }
function failureRequest(overrides: Partial<ReturnType<typeof failureRequestBase>> = {}) { return { ...failureRequestBase(), ...overrides }; }
function failureRequestBase() { return { actorId: "runtime-local", category: "TRANSIENT_RUNTIME" as WorkflowFailureCategory, commandId: "fail-command-1", contractVersion: "1" as const, expectedVersion: 2, failureId: "failure-1", instanceId: "instance-1", invocationId: "invocation-1", maxAttempts: 3, reasonCode: "deterministic_runtime_failure", stepId: "step-1" }; }
function retryRequest(overrides: Partial<ReturnType<typeof retryRequestBase>> = {}) { return { ...retryRequestBase(), ...overrides }; }
function retryRequestBase() { return { actorId: "fabio", authorizationId: "retry-auth-1", contractVersion: "1" as const, expectedVersion: 3, failureId: "failure-1", instanceId: "instance-1", stepId: "step-1" }; }

async function seedFailedInvocation(runner: SqliteRepositoryTransactionRunner) {
  const persistence = createWorkflowPersistenceService({ eventIds: new EventIds(), repositories: runner, stateMachine: new DeterministicWorkflowStateMachine(new FixedClock()) });
  await persistence.createDefinition(definition()); await persistence.createInstance(instance());
  await runner.transaction(async ({ workflows }) => {
    const initial = await workflows.instances.getById("instance-1");
    if (initial === undefined) throw new Error("missing seed instance");
    const readyReceipt = { commandId: "seed-ready", fingerprint: "a".repeat(64), resultingVersion: 1 };
    const ready = { ...initial, receipts: [readyReceipt], steps: [{ blockers: [], status: "READY" as const, stepId: "step-1" }], updatedAt: "2026-01-01T00:00:00.000Z", version: 1 };
    await workflows.instances.update(ready, { version: 0 }); await workflows.receipts.insert("instance-1", readyReceipt);
    const reserveReceipt = { commandId: "seed-reserve", fingerprint: "b".repeat(64), resultingVersion: 2 };
    const awaiting = { ...ready, receipts: [...ready.receipts, reserveReceipt], steps: [{ blockers: [], status: "AWAITING_RESULT" as const, stepId: "step-1" }], version: 2 };
    await workflows.instances.update(awaiting, { version: 1 }); await workflows.receipts.insert("instance-1", reserveReceipt);
    await workflows.agentInvocations.insert({ capabilityIds: ["content-strategy"], completedAt: "2026-01-01T00:00:00.000Z", contractVersion: "1", definitionId: "definition@1.0.0", executorId: "deterministic-content-director", executorVersion: "1.0.0", externalEffectsAllowed: false, failure: { code: "AGENT_EXECUTION_FAILED", message: "Agent execution failed safely" }, fingerprint: "c".repeat(64), inputContractId: "deterministic-content-direction-input@1", instanceId: "instance-1", invocationId: "invocation-1", outputContractId: "deterministic-content-direction-artifact@1", reservedAt: "2026-01-01T00:00:00.000Z", reservedInstanceVersion: 2, runtimeAgentId: "content-director", runtimeAgentVersion: "1.0.0", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0", status: "FAILED", stepId: "step-1", workflowId: "workflow", workflowVersion: "1.0.0" });
  });
}
function definition(): WorkflowDefinition { return { contractVersion: "1", definitionId: "definition@1.0.0", nonExecuting: true, steps: [{ approvalRequired: false, dependencies: [], guardianRequired: false, nonExecuting: true, stepId: "step-1" }], workflowId: "workflow", workflowVersion: "1.0.0" }; }
function instance(): WorkflowInstance { return { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: "definition@1.0.0", instanceId: "instance-1", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "PENDING", stepId: "step-1" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0 }; }
class EventIds implements WorkflowEventIdentifierGenerator { public nextWorkflowEventId() { return "unused-event"; } }
function createRunner(path: string) { return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); }
async function withDatabase(operation: (path: string) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-lifecycle-")); try { await operation(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
