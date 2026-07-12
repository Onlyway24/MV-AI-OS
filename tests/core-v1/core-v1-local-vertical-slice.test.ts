import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOUNDER_MISSION_BRIEF,
  SqliteRepositoryTransactionRunner,
  createLocalRuntime,
  type FounderMissionBrief,
  type LocalRuntime,
  type LocalRuntimeConfig,
  type LocalWorkflowCommand,
  type WorkflowDefinition,
  type WorkflowInstance,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("MV-AI-OS Core V1 local vertical slice", () => {
  it("runs Metodo Veloce Mission-to-Workflow completion and recovers it through a new runtime", async () => {
    await withDatabase(async (path) => {
      const runtime = await createRuntime(path);
      const brief = mission("metodo-veloce-content", "content_strategy", "Prepare premium dark-luxury Metodo Veloce content direction with black, yellow, and white guidance; treat the fixed MV logo only as an external asset reference.");
      expect(await run(runtime, "CREATE_MISSION", { brief })).toMatchObject({ status: "ok", unauthorizedExternalEffectOccurred: false });
      const planning = await run(runtime, "PLAN_MISSION", { brief });
      expect(planning).toMatchObject({ result: { nonExecuting: true, planning: { status: "PLAN_READY" } }, status: "ok" });

      const definition = workflowDefinition("metodo-content@1.0.0", "metodo-content", brief.objective.statement, true, true);
      const instance = workflowInstance("metodo-instance", definition.definitionId);
      expect(await run(runtime, "CREATE_WORKFLOW", { definition, instance })).toMatchObject({ result: { created: true } });
      expect(await report(runtime, instance.instanceId, 0)).toMatchObject({ nextAction: "Record Fabio approval for step content-direction at Workflow version 0." });

      const approval = { authorityActorId: "actor-local", contractVersion: "1", definitionId: definition.definitionId, evidenceId: "approval-metodo-1", instanceId: instance.instanceId, instanceVersion: 0, nonExecuting: true, recordedAt: "2026-07-02T10:00:01.000Z", scope: "STEP_CANDIDATE_PREPARATION", status: "APPROVED", stepId: "content-direction", workflowVersion: "1.0.0" } as const;
      await run(runtime, "RECORD_APPROVAL", { checkpoint: approval });
      for (const domain of ["operator_safety", "quality"] as const) await run(runtime, "RECORD_GUARDIAN", { checkpoint: { contractVersion: "1", definitionId: definition.definitionId, domain, evidenceId: `guardian-${domain}-metodo`, guardianId: `${domain}-guardian`, instanceId: instance.instanceId, instanceVersion: 0, nonExecuting: true, recordedAt: "2026-07-02T10:00:01.000Z", status: "CLEAR", stepId: "content-direction", workflowVersion: "1.0.0" } });

      const readiness = await run(runtime, "EVALUATE_READINESS", { approvedStepIds: ["content-direction"], contractVersion: "1", expectedVersion: 0, guardianSatisfiedStepIds: ["content-direction"], instanceId: instance.instanceId, maxResults: 10, nonExecuting: true });
      expect(readiness).toMatchObject({ result: { readyFindings: [{ stepId: "content-direction", status: "READY" }] } });
      const boundaryRequest = candidateRequest(instance.instanceId, definition.definitionId, 0);
      expect(await run(runtime, "GET_NEXT_CANDIDATE", boundaryRequest)).toMatchObject({ result: { status: "CANDIDATE_AVAILABLE", candidate: { stepId: "content-direction" } } });
      expect(await run(runtime, "INVOKE_AGENT", { boundaryRequest, contractVersion: "1", invocationId: "invocation-metodo-1" })).toMatchObject({ result: { status: "COMPLETED", receipt: { externalEffectsAllowed: false } } });
      expect(await run(runtime, "INSPECT_AGENT_RESULT", { invocationId: "invocation-metodo-1" })).toMatchObject({ result: { status: "COMPLETED", result: { output: { preparationOnly: true, externalEffects: false } } } });
      expect(await run(runtime, "ACCEPT_OUTCOME", { contractVersion: "1", expectedInstanceVersion: 2, invocationId: "invocation-metodo-1", outcomeId: "outcome-metodo-1" })).toMatchObject({ result: { receipt: { decision: "ACCEPTED_FOR_COMPLETION", resultingInstanceVersion: 3 } } });
      const completed = await report(runtime, instance.instanceId, 3);
      expect(completed).toMatchObject({ nextAction: "No action required because the Workflow completed successfully.", result: { approvals: [{ status: "NOT_REQUIRED" }], guardians: [{ status: "NOT_REQUIRED" }], overallStatus: "COMPLETED", progress: { completedSteps: 1, totalSteps: 1 }, externalActions: { unauthorizedActionOccurred: false } } });
      await runtime.close();

      const reopened = await createRuntime(path);
      expect(await report(reopened, instance.instanceId, 3)).toEqual({ ...completed, replayed: true });
      const verifier = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const evidence = await verifier.transaction(async ({ workflows }) => ({ approvals: await workflows.approvals.listBySnapshot(instance.instanceId, 0, "content-direction"), events: await workflows.events.listByInstanceId(instance.instanceId, 20), guardians: await workflows.guardians.listBySnapshot(instance.instanceId, 0, "content-direction"), instance: await workflows.instances.getById(instance.instanceId), invocation: await workflows.agentInvocations.getById("invocation-metodo-1"), outcome: await workflows.stepOutcomes.getById("outcome-metodo-1"), receipts: await workflows.receipts.listByInstanceId(instance.instanceId) }));
      expect(evidence).toMatchObject({ approvals: [{ status: "APPROVED" }], guardians: [{ status: "CLEAR" }, { status: "CLEAR" }], instance: { status: "COMPLETED", version: 3 }, invocation: { status: "COMPLETED" }, outcome: { decision: "ACCEPTED_FOR_COMPLETION" } });
      expect(evidence.receipts.length).toBeGreaterThanOrEqual(3);
      expect(evidence.events).toHaveLength(1);
      await verifier.close();
      await reopened.close();
    });
  });

  it("operates pause/resume, bounded retry, cancellation, and safe planning scenarios", async () => {
    await withDatabase(async (path) => {
      const runtime = await createRuntime(path);
      for (const [id, type, statement] of [["restaurant-offer", "product_or_offer_design", "Prepare a bounded local restaurant offer."], ["mv-ai-os-engineering", "software_development", "Prepare a Core V1 engineering plan without deployment."]] as const) expect(await run(runtime, "PLAN_MISSION", { brief: mission(id, type, statement) })).toMatchObject({ result: { planning: { status: "PLAN_READY" }, nonExecuting: true } });

      const pauseDefinition = workflowDefinition("pause@1.0.0", "pause", "Exercise explicit pause and resume.");
      await run(runtime, "CREATE_WORKFLOW", { definition: pauseDefinition, instance: workflowInstance("pause-instance", pauseDefinition.definitionId, "READY") });
      await run(runtime, "PAUSE_WORKFLOW", lifecycleControl("pause-control", "pause-command", "pause-instance", 0), "pause-command");
      expect(await report(runtime, "pause-instance", 1)).toMatchObject({ result: { overallStatus: "PAUSED" } });
      await run(runtime, "RESUME_WORKFLOW", lifecycleControl("resume-control", "resume-command", "pause-instance", 1), "resume-command");
      expect(await report(runtime, "pause-instance", 2)).toMatchObject({ result: { overallStatus: "ACTIVE" } });

      const cancelDefinition = workflowDefinition("cancel@1.0.0", "cancel", "Exercise explicit cancellation.");
      await run(runtime, "CREATE_WORKFLOW", { definition: cancelDefinition, instance: workflowInstance("cancel-instance", cancelDefinition.definitionId, "READY") });
      await run(runtime, "CANCEL_WORKFLOW", lifecycleControl("cancel-control", "cancel-command", "cancel-instance", 0), "cancel-command");
      expect(await report(runtime, "cancel-instance", 1)).toMatchObject({ result: { overallStatus: "CANCELLED" } });

      const retryDefinition = workflowDefinition("retry@1.0.0", "retry", "Exercise explicit bounded retry.");
      await run(runtime, "CREATE_WORKFLOW", { definition: retryDefinition, instance: workflowInstance("retry-instance", retryDefinition.definitionId) });
      for (const domain of ["operator_safety", "quality"] as const) await run(runtime, "RECORD_GUARDIAN", { checkpoint: { contractVersion: "1", definitionId: retryDefinition.definitionId, domain, evidenceId: `guardian-${domain}-retry`, guardianId: `${domain}-guardian`, instanceId: "retry-instance", instanceVersion: 0, nonExecuting: true, recordedAt: "2026-07-02T10:00:01.000Z", status: "CLEAR", stepId: "content-direction", workflowVersion: "1.0.0" } });
      const retryBoundary = candidateRequest("retry-instance", retryDefinition.definitionId, 0);
      expect(await run(runtime, "INVOKE_AGENT", { boundaryRequest: retryBoundary, contractVersion: "1", invocationId: "invocation-retry-1" })).toMatchObject({ result: { status: "COMPLETED" } });
      await run(runtime, "REJECT_OUTCOME", { actorId: "actor-local", contractVersion: "1", expectedInstanceVersion: 2, invocationId: "invocation-retry-1", outcomeId: "outcome-retry-rejected", reasonCode: "operator_rejected_result" });
      await run(runtime, "FAIL_STEP", { actorId: "runtime-local", category: "VALIDATION", commandId: "fail-retry-command", contractVersion: "1", expectedVersion: 2, failureId: "failure-retry-1", instanceId: "retry-instance", invocationId: "invocation-retry-1", maxAttempts: 3, reasonCode: "rejected_result", stepId: "content-direction" }, "fail-retry-command");
      expect(await report(runtime, "retry-instance", 3)).toMatchObject({ result: { retry: { attemptsRemaining: 2, retryable: true } } });
      await run(runtime, "AUTHORIZE_RETRY", { actorId: "actor-local", authorizationId: "retry-auth-1", contractVersion: "1", expectedVersion: 3, failureId: "failure-retry-1", instanceId: "retry-instance", stepId: "content-direction" });
      await run(runtime, "EXECUTE_RETRY", { actorId: "actor-local", authorizationId: "retry-auth-1", commandId: "execute-retry-command", contractVersion: "1", executionId: "retry-execution-1", expectedVersion: 3, failureId: "failure-retry-1", instanceId: "retry-instance", stepId: "content-direction" }, "execute-retry-command");

      await run(runtime, "RECORD_GUARDIAN", {
        checkpoint: {
          contractVersion: "1",
          definitionId: retryDefinition.definitionId,
          domain: "operator_safety",
          evidenceId: "guardian-operator-safety-retry-v4",
          guardianId: "operator_safety-guardian",
          instanceId: "retry-instance",
          instanceVersion: 4,
          nonExecuting: true,
          recordedAt: "2026-07-02T10:00:02.000Z",
          status: "CLEAR",
          stepId: "content-direction",
          workflowVersion: "1.0.0",
        },
      });

      await run(runtime, "RECORD_GUARDIAN", {
        checkpoint: {
          contractVersion: "1",
          definitionId: retryDefinition.definitionId,
          domain: "quality",
          evidenceId: "guardian-quality-retry-v4",
          guardianId: "quality-guardian",
          instanceId: "retry-instance",
          instanceVersion: 4,
          nonExecuting: true,
          recordedAt: "2026-07-02T10:00:03.000Z",
          status: "CLEAR",
          stepId: "content-direction",
          workflowVersion: "1.0.0",
        },
      });

      expect(await report(runtime, "retry-instance", 4)).toMatchObject({ result: { overallStatus: "ACTIVE", readySteps: [{ stepId: "content-direction" }] } });

      const timeoutDefinition = workflowDefinition("timeout@1.0.0", "timeout", "Exercise explicit timeout evaluation.");
      await run(runtime, "CREATE_WORKFLOW", { definition: timeoutDefinition, instance: workflowInstance("timeout-instance", timeoutDefinition.definitionId) });
      const seeder = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      await seeder.transaction(async ({ workflows }) => {
        const initial = await workflows.instances.getById("timeout-instance"); if (initial === undefined) throw new Error("missing timeout instance");
        const readyReceipt = { commandId: "timeout-ready", fingerprint: "a".repeat(64), resultingVersion: 1 };
        const ready = { ...initial, receipts: [readyReceipt], steps: [{ blockers: [], status: "READY" as const, stepId: "content-direction" }], version: 1 };
        await workflows.instances.update(ready, { version: 0 }); await workflows.receipts.insert("timeout-instance", readyReceipt);
        const reserveReceipt = { commandId: "timeout-reserve", fingerprint: "b".repeat(64), resultingVersion: 2 };
        const awaiting = { ...ready, receipts: [...ready.receipts, reserveReceipt], steps: [{ blockers: [], status: "AWAITING_RESULT" as const, stepId: "content-direction" }], version: 2 };
        await workflows.instances.update(awaiting, { version: 1 }); await workflows.receipts.insert("timeout-instance", reserveReceipt);
        await workflows.agentInvocations.insert({ capabilityIds: ["content-strategy"], contractVersion: "1", definitionId: timeoutDefinition.definitionId, executorId: "deterministic-content-director", executorVersion: "1.0.0", externalEffectsAllowed: false, fingerprint: "c".repeat(64), inputContractId: "deterministic-content-direction-input@1", instanceId: "timeout-instance", invocationId: "invocation-timeout-1", outputContractId: "deterministic-content-direction-artifact@1", reservedAt: "2026-07-02T09:59:01.000Z", reservedInstanceVersion: 2, runtimeAgentId: "content-director", runtimeAgentVersion: "1.0.0", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0", status: "RESERVED", stepId: "content-direction", workflowId: timeoutDefinition.workflowId, workflowVersion: "1.0.0" });
      });
      await seeder.close();
      expect(await run(runtime, "EVALUATE_TIMEOUT", { actorId: "actor-local", commandId: "timeout-evaluate-command", contractVersion: "1", evaluationId: "timeout-evaluation-1", expectedVersion: 2, instanceId: "timeout-instance", invocationId: "invocation-timeout-1", stepId: "content-direction", timeoutMs: 60_000 }, "timeout-evaluate-command")).toMatchObject({ result: { record: { category: "TIMEOUT", kind: "FAILURE" } } });
      expect(await report(runtime, "timeout-instance", 3)).toMatchObject({ result: { overallStatus: "FAILED", timeoutEvaluationRequired: false } });
      await runtime.close();
      const reopened = await createRuntime(path);
      expect(await report(reopened, "pause-instance", 2)).toMatchObject({ result: { overallStatus: "ACTIVE" } });
      expect(await report(reopened, "cancel-instance", 1)).toMatchObject({ result: { overallStatus: "CANCELLED" } });
      expect(await report(reopened, "retry-instance", 4)).toMatchObject({ result: { overallStatus: "ACTIVE", retry: { attemptsUsed: 1, authorization: "AUTHORIZED", executionPending: false } } });
      expect(await report(reopened, "timeout-instance", 3)).toMatchObject({ result: { overallStatus: "FAILED", retry: { failureId: "timeout-evaluation-1", retryable: true } } });
      await reopened.close();
    });
  });
});

async function run(runtime: LocalRuntime, operation: LocalWorkflowCommand["operation"], input: Readonly<Record<string, unknown>>, commandId = `core-${operation.toLowerCase()}-${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`) { if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow commands unavailable"); return runtime.executeWorkflowCommand({ actorId: "actor-local", commandId, contractVersion: "1", input, operation, workspaceId: "workspace-local" }); }
function report(runtime: LocalRuntime, instanceId: string, expectedVersion: number) { return run(runtime, "GET_OPERATOR_REPORT", { contractVersion: "1", expectedVersion, instanceId, maxItems: 50 }); }
function lifecycleControl(controlId: string, commandId: string, instanceId: string, expectedVersion: number) { return { actorId: "actor-local", commandId, contractVersion: "1", controlId, expectedVersion, instanceId, reasonCode: "operator_control" }; }
function workflowDefinition(definitionId: string, workflowId: string, missionObjective: string, approvalRequired = false, guardianRequired = false): WorkflowDefinition { return { contractVersion: "1", definitionId, missionObjective, nonExecuting: true, steps: [{ approvalRequired, dependencies: [], guardianRequired, nonExecuting: true, stepId: "content-direction" }], workflowId, workflowVersion: "1.0.0" }; }
function workflowInstance(instanceId: string, definitionId: string, status: "PENDING" | "READY" = "PENDING"): WorkflowInstance { return { contractVersion: "1", createdAt: "2026-07-02T10:00:00.000Z", definitionId, instanceId, nonExecuting: true, receipts: [], status: "ACTIVE", steps: [{ blockers: [], status, stepId: "content-direction" }], stopReason: "NONE", updatedAt: "2026-07-02T10:00:00.000Z", version: 0 }; }
function candidateRequest(instanceId: string, definitionId: string, expectedVersion: number) { return { actorId: "actor-local", agentAssignment: { agentId: "content-director", capabilityIds: ["content-strategy"], permissionIds: ["content-strategy-permission"], responsibilityAreaId: "content-direction", specificationId: "content-director@1.0.0", specificationVersion: "1.0.0" }, approvalEvidence: [], contractVersion: "1", expectedDefinitionId: definitionId, expectedVersion, expectedWorkflowVersion: "1.0.0", guardianEvidence: [], instanceId, maxBlockers: 16, nonExecuting: true, policyDecision: { actorId: "actor-local", agent: { agentId: "content-director", version: "1.0.0" }, contractVersion: "1", decisionId: `policy-${instanceId}`, deniedPermissions: [], effectivePermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], evaluatedAt: "2026-07-02T10:00:01.000Z", requestedPermissions: ["knowledge:search", "model:invoke:content-direction-quality", "workflow:propose:content-director"], taskId: instanceId, workspaceId: "workspace-local" }, selection: { mode: "EXACT_STEP", stepId: "content-direction" }, workspaceId: "workspace-local" }; }
function mission(briefId: string, missionType: FounderMissionBrief["missionType"], statement: string): FounderMissionBrief { const brief = structuredClone(DEFAULT_FOUNDER_MISSION_BRIEF); return { ...brief, briefId, missionType, objective: { ...brief.objective, desiredOutcome: statement, purpose: statement, statement } }; }
function config(path: string): LocalRuntimeConfig { return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }; }
function createRuntime(path: string) { return createLocalRuntime(config(path), { clock: new FixedClock("2026-07-02T10:00:01.000Z") }); }
async function withDatabase(test: (path: string) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-core-v1-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
