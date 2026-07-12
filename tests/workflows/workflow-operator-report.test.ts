import { describe, expect, it } from "vitest";
import {
  WorkflowOperatorReportValidator,
  SqliteRepositoryTransactionRunner,
  createWorkflowOperatorReportService,
  type WorkflowDefinition,
  type WorkflowInstance,
  type RepositoryTransactionRunner,
} from "../../src/index.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";

describe("Operator Workflow Report", () => {
  it("returns one deterministic next action from authoritative approval and Guardian state", async () => {
    const runner = new InMemoryRepositoryTransactionRunner();
    await seed(runner);
    const service = createWorkflowOperatorReportService(runner);
    const first = await service.create(request());
    const second = await service.create(request());
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      mission: { evidenceAvailable: true, objective: "Prepare Metodo Veloce content direction." },
      overallStatus: "ACTIVE",
      progress: { completedSteps: 0, totalSteps: 1 },
      externalActions: { evidenceComplete: true, unauthorizedActionOccurred: false },
      nextAction: "Record Fabio approval for step content-direction at Workflow version 0.",
    });
    expect(first.blockedSteps[0]?.reasons).toEqual(["Fabio approval required", "Guardian operator_safety decision required"]);
    expect(first.risks).toEqual(["content-direction: Fabio approval required", "content-direction: Guardian operator_safety decision required"]);
    expect(Object.isFrozen(first)).toBe(true);

    await runner.transaction(async ({ workflows }) => {
      await workflows.approvals.insert({ authorityActorId: "fabio", contractVersion: "1", definitionId: "metodo@1.0.0", evidenceId: "approval-17", instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:01.000Z", scope: "STEP_CANDIDATE_PREPARATION", status: "APPROVED", stepId: "content-direction", workflowVersion: "1.0.0" });
      await workflows.controlEvents.append({ checkpointId: "approval-17", checkpointKind: "APPROVAL", contractVersion: "1", eventId: "approval-event-17", instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, occurredAt: "2026-01-01T00:00:01.000Z", status: "APPROVED", stepId: "content-direction", summaryCode: "workflow_control_checkpoint_recorded" });
      for (const domain of ["operator_safety", "quality"] as const) { const evidenceId = `guardian-${domain}-17`; await workflows.guardians.insert({ contractVersion: "1", definitionId: "metodo@1.0.0", domain, evidenceId, guardianId: `${domain}-guardian`, instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:02.000Z", status: "CLEAR", stepId: "content-direction", workflowVersion: "1.0.0" }); await workflows.controlEvents.append({ checkpointId: evidenceId, checkpointKind: "GUARDIAN", contractVersion: "1", eventId: `${evidenceId}-event`, instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, occurredAt: "2026-01-01T00:00:02.000Z", status: "CLEAR", stepId: "content-direction", summaryCode: "workflow_control_checkpoint_recorded" }); }
    });
    const cleared = await service.create(request());
    expect(cleared.nextAction).toBe("Select and invoke the controlled candidate for step content-direction at Workflow version 0.");
    expect(cleared.readySteps).toHaveLength(1);
  });

  it("reports bounded retry state and one exact recovery action", async () => {
    const runner = new InMemoryRepositoryTransactionRunner();
    await seed(runner, { status: "FAILED", steps: [{ blockers: [], status: "FAILED", stepId: "content-direction" }], stopReason: "FAILED_STEP" });
    await runner.transaction(({ workflows }) => workflows.lifecycleRecords.insert({ actorId: "runtime-local", attempt: 1, category: "TRANSIENT_RUNTIME", contractVersion: "1", definitionId: "metodo@1.0.0", externalEffects: false, fingerprint: "a".repeat(64), instanceId: "workflow-42", instanceVersion: 0, invocationId: "invocation-1", kind: "FAILURE", maxAttempts: 3, recordedAt: "2026-01-01T00:00:03.000Z", recordId: "failure-1", recoveryInstructions: ["Request explicit operator retry authorization."], retryable: true, stepId: "content-direction", workflowVersion: "1.0.0" }));
    const report = await createWorkflowOperatorReportService(runner).create(request());
    expect(report.retry).toMatchObject({ attemptsRemaining: 2, attemptsUsed: 1, authorization: "NOT_REQUESTED", retryable: true });
    expect(report.nextAction).toBe("Authorize retry attempt 2 of 3 for step content-direction.");
    expect(report.lastDurableEvent).toMatchObject({ eventId: "failure-1", summary: "FAILURE" });
  });

  it.each([
    ["PAUSED", "Resume the Workflow at version 0."],
    ["CANCELLED", "No action required because the Workflow is cancelled."],
    ["COMPLETED", "No action required because the Workflow completed successfully."],
  ] as const)("reports terminal control state %s without inventing progress", async (status, nextAction) => {
    const runner = new InMemoryRepositoryTransactionRunner();
    const stepStatus = status === "COMPLETED" ? "SUCCEEDED" : status === "CANCELLED" ? "CANCELLED" : "READY";
    await seed(runner, { status, steps: [{ blockers: [], status: stepStatus, stepId: "content-direction" }], stopReason: status === "CANCELLED" ? "CANCELLED_BY_OPERATOR" : "NONE" });
    const report = await createWorkflowOperatorReportService(runner).create(request());
    expect(report.nextAction).toBe(nextAction);
    expect(JSON.stringify(report)).not.toMatch(/percentage|%/iu);
    if (status !== "PAUSED") {
      expect(report.blockedSteps).toEqual([]);
      expect(report.pendingSteps).toEqual([]);
      expect(report.readySteps).toEqual([]);
      expect(report.risks).toEqual([]);
      expect(report.approvals).toEqual([{ status: "NOT_REQUIRED", stepId: "content-direction" }]);
      expect(report.guardians).toEqual([{ remediationRequired: false, status: "NOT_REQUIRED", stepId: "content-direction" }]);
    }
  });

  it("retains completed control evidence durably without presenting it as active remediation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-operator-report-completed-"));
    const path = join(directory, "runtime.sqlite");
    try {
      const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      await seed(first, { status: "COMPLETED", steps: [{ blockers: [], status: "SUCCEEDED", stepId: "content-direction" }] });
      await recordClearControls(first);
      const before = await createWorkflowOperatorReportService(first).create(request());
      expect(before).toMatchObject({
        approvals: [{ status: "NOT_REQUIRED" }],
        blockedSteps: [],
        completedSteps: [{ reasons: [], status: "SUCCEEDED", stepId: "content-direction" }],
        guardians: [{ remediationRequired: false, status: "NOT_REQUIRED" }],
        nextAction: "No action required because the Workflow completed successfully.",
        pendingSteps: [],
        readySteps: [],
        risks: [],
      });
      expect(Object.isFrozen(before)).toBe(true);
      await first.close();

      const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      expect(await createWorkflowOperatorReportService(reopened).create(request())).toEqual(before);
      const evidence = await reopened.transaction(async ({ workflows }) => ({
        approvals: await workflows.approvals.listBySnapshot("workflow-42", 0, "content-direction"),
        guardians: await workflows.guardians.listBySnapshot("workflow-42", 0, "content-direction"),
      }));
      expect(evidence).toMatchObject({ approvals: [{ status: "APPROVED" }], guardians: [{ status: "CLEAR" }, { status: "CLEAR" }] });
      await reopened.close();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not surface stale control remediation for a terminal failed step", async () => {
    const runner = new InMemoryRepositoryTransactionRunner();
    await seed(runner, { status: "FAILED", steps: [{ blockers: [], status: "FAILED", stepId: "content-direction" }], stopReason: "FAILED_STEP" });
    const report = await createWorkflowOperatorReportService(runner).create(request());
    expect(report).toMatchObject({
      approvals: [{ status: "NOT_REQUIRED" }],
      blockedSteps: [],
      failedSteps: [{ reasons: [], status: "FAILED", stepId: "content-direction" }],
      guardians: [{ remediationRequired: false, status: "NOT_REQUIRED" }],
      pendingSteps: [],
      readySteps: [],
      risks: ["content-direction: failed"],
    });
  });

  it("fails closed for stale snapshots and redaction-unsafe reports", async () => {
    const runner = new InMemoryRepositoryTransactionRunner(); await seed(runner);
    await expect(createWorkflowOperatorReportService(runner).create({ ...request(), expectedVersion: 9 })).rejects.toThrow(/stale/iu);
    const valid = await createWorkflowOperatorReportService(runner).create(request());
    expect(new WorkflowOperatorReportValidator().validate({ ...valid, nextAction: "use sk-private-secret" }).ok).toBe(false);
  });

  it("returns the identical authoritative report after a genuine SQLite restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-operator-report-"));
    const path = join(directory, "runtime.sqlite");
    try {
      const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      await seed(first);
      const before = await createWorkflowOperatorReportService(first).create(request());
      await first.close();
      const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      expect(await createWorkflowOperatorReportService(reopened).create(request())).toEqual(before);
      await reopened.close();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function request() { return { contractVersion: "1" as const, expectedVersion: 0, instanceId: "workflow-42", maxItems: 20 }; }
async function seed(runner: RepositoryTransactionRunner, overrides: Partial<WorkflowInstance> = {}) {
  const definition: WorkflowDefinition = { contractVersion: "1", definitionId: "metodo@1.0.0", missionObjective: "Prepare Metodo Veloce content direction.", nonExecuting: true, steps: [{ approvalRequired: true, dependencies: [], guardianRequired: true, nonExecuting: true, stepId: "content-direction" }], workflowId: "metodo", workflowVersion: "1.0.0" };
  const instance: WorkflowInstance = { contractVersion: "1", createdAt: "2026-01-01T00:00:00.000Z", definitionId: definition.definitionId, instanceId: "workflow-42", nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status: "READY", stepId: "content-direction" }], stopReason: "NONE", updatedAt: "2026-01-01T00:00:00.000Z", version: 0, ...overrides };
  await runner.transaction(async ({ workflows }) => { await workflows.definitions.insert(definition); await workflows.instances.insert(instance); });
}
async function recordClearControls(runner: RepositoryTransactionRunner) {
  await runner.transaction(async ({ workflows }) => {
    await workflows.approvals.insert({ authorityActorId: "fabio", contractVersion: "1", definitionId: "metodo@1.0.0", evidenceId: "approval-17", instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:01.000Z", scope: "STEP_CANDIDATE_PREPARATION", status: "APPROVED", stepId: "content-direction", workflowVersion: "1.0.0" });
    await workflows.controlEvents.append({ checkpointId: "approval-17", checkpointKind: "APPROVAL", contractVersion: "1", eventId: "approval-event-17", instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, occurredAt: "2026-01-01T00:00:01.000Z", status: "APPROVED", stepId: "content-direction", summaryCode: "workflow_control_checkpoint_recorded" });
    for (const domain of ["operator_safety", "quality"] as const) { const evidenceId = `guardian-${domain}-17`; await workflows.guardians.insert({ contractVersion: "1", definitionId: "metodo@1.0.0", domain, evidenceId, guardianId: `${domain}-guardian`, instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-01-01T00:00:02.000Z", status: "CLEAR", stepId: "content-direction", workflowVersion: "1.0.0" }); await workflows.controlEvents.append({ checkpointId: evidenceId, checkpointKind: "GUARDIAN", contractVersion: "1", eventId: `${evidenceId}-event`, instanceId: "workflow-42", instanceVersion: 0, nonExecuting: true, occurredAt: "2026-01-01T00:00:02.000Z", status: "CLEAR", stepId: "content-direction", summaryCode: "workflow_control_checkpoint_recorded" }); }
  });
}
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
