import { createHash } from "node:crypto";

import { ContentDirectionArtifactValidator, type ContentDirectionArtifact } from "../../agents/content/deterministic-content-director.js";
import type { AgentRuntimeResolver } from "../../agents/agent-runtime-resolution.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Clock } from "../../ports/clock.js";
import type { Validator } from "../../validation/validation.js";
import { AgentResultValidator } from "../../validation/agent-result-validator.js";
import { DeterministicWorkflowStateMachine } from "./deterministic-workflow-state-machine.js";
import { WorkflowEventDraftValidator } from "./workflow-persistence-validator.js";
import { freeze } from "./workflow-agent-invocation.js";
import {
  WorkflowStepOutcomeReceiptValidator,
  WorkflowStepOutcomeRequestValidator,
  WorkflowStepRejectionRequestValidator,
  createWorkflowStepOutcomeFingerprint,
  type WorkflowStepOutcomeDecision,
  type WorkflowStepOutcomeReceipt,
  type WorkflowStepOutcomeRequest,
  type WorkflowStepOutcomeResult,
  type WorkflowStepOutcomeService,
  type WorkflowStepRejectionRequest,
} from "./workflow-step-outcome.js";

export interface RepositoryBackedWorkflowStepOutcomeDependencies {
  readonly clock: Clock;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<WorkflowStepOutcomeRequest>;
  readonly resolver: AgentRuntimeResolver;
  readonly operatorActorId: string;
  readonly stateMachine: DeterministicWorkflowStateMachine;
}

export class RepositoryBackedWorkflowStepOutcomeService implements WorkflowStepOutcomeService {
  public constructor(private readonly dependencies: RepositoryBackedWorkflowStepOutcomeDependencies) {}

  public review(request: WorkflowStepOutcomeRequest): Promise<WorkflowStepOutcomeResult> {
    const valid = validate(request, this.dependencies.requestValidator, "Workflow Step outcome request");
    const trusted = validate(valid, new WorkflowStepOutcomeRequestValidator(), "Workflow Step outcome request");
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const invocation = await workflows.agentInvocations.getById(trusted.invocationId);
      if (invocation === undefined) return this.#persistDecision(workflows, trusted, "BLOCKED", "0".repeat(64), ["Durable invocation is missing"], { instanceId: "unresolved", stepId: "unresolved" }, false);
      const fingerprint = createWorkflowStepOutcomeFingerprint(trusted, invocation.fingerprint);
      const existing = await workflows.stepOutcomes.getByInvocationId(trusted.invocationId);
      if (existing !== undefined) {
        if (existing.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow Step outcome conflicts with prior review");
        return freeze({ contractVersion: "1", receipt: existing, replayed: true });
      }
      const identity = { instanceId: invocation.instanceId, stepId: invocation.stepId };
      if (invocation.status === "FAILED") return this.#persistDecision(workflows, trusted, "FAILED", invocation.fingerprint, ["Durable AgentRuntime invocation failed"], identity);
      if (invocation.status !== "COMPLETED" || invocation.result?.output === undefined) return this.#persistDecision(workflows, trusted, "BLOCKED", invocation.fingerprint, ["Invocation has no completed durable result"], identity, false);
      const instance = await workflows.instances.getById(invocation.instanceId);
      if (instance?.version !== trusted.expectedInstanceVersion || invocation.reservedInstanceVersion !== trusted.expectedInstanceVersion) return this.#persistDecision(workflows, trusted, "BLOCKED", invocation.fingerprint, ["Workflow instance version is stale"], identity, false);
      const step = instance.steps.find(({ stepId }) => stepId === invocation.stepId);
      if (step?.status !== "AWAITING_RESULT") return this.#persistDecision(workflows, trusted, "BLOCKED", invocation.fingerprint, ["Workflow Step is not awaiting this result"], identity, false);
      const resolved = this.dependencies.resolver.resolve({ requiredCapabilityIds: invocation.capabilityIds, specificationId: invocation.specificationId, specificationVersion: invocation.specificationVersion });
      if (resolved.status !== "resolved" || resolved.executor.executorId !== invocation.executorId || resolved.executor.executorVersion !== invocation.executorVersion || resolved.executor.runtimeAgentId !== invocation.runtimeAgentId || resolved.executor.runtimeAgentVersion !== invocation.runtimeAgentVersion) return this.#persistDecision(workflows, trusted, "BLOCKED", invocation.fingerprint, ["Exact invocation binding no longer resolves"], identity, false);
      const resultValidation = new AgentResultValidator().validate(invocation.result);
      if (!resultValidation.ok || resultValidation.value.status !== "succeeded" || resultValidation.value.invocationId !== invocation.invocationId || resultValidation.value.taskId !== invocation.instanceId || resultValidation.value.agent.agentId !== invocation.runtimeAgentId || resultValidation.value.agent.version !== invocation.runtimeAgentVersion) return this.#persistDecision(workflows, trusted, "INVALID", invocation.fingerprint, ["Durable AgentResult identity is invalid"], identity);
      if (invocation.inputContractId !== resolved.executor.inputContractId || invocation.outputContractId !== resolved.executor.outputContractId) return this.#persistDecision(workflows, trusted, "BLOCKED", invocation.fingerprint, ["Exact invocation contract identity no longer resolves"], identity, false);
      const artifactValidation = new ContentDirectionArtifactValidator().validate(resultValidation.value.output);
      if (!artifactValidation.ok) return this.#persistDecision(workflows, trusted, "INVALID", invocation.fingerprint, ["Structured Content Direction artifact is invalid"], identity);
      const decision = assess(artifactValidation.value);
      if (decision.decision !== "ACCEPTED_FOR_COMPLETION") return this.#persistDecision(workflows, trusted, decision.decision, invocation.fingerprint, decision.remediation, identity);

      const command = { commandId: trusted.outcomeId, expectedVersion: instance.version, kind: "COMPLETE_STEP" as const, nonExecuting: true as const, reasonCode: "workflow_step_outcome_accepted", stepId: invocation.stepId };
      const transition = this.dependencies.stateMachine.apply(instance, command);
      const commandReceipt = transition.instance.receipts.at(-1);
      if (commandReceipt === undefined) throw new RepositoryValidationError("Workflow completion did not produce a command receipt");
      const reviewedAt = now(this.dependencies.clock);
      const eventId = `${trusted.outcomeId}-accepted`;
      const event = validate({
        actorCategory: "runtime",
        commandId: trusted.outcomeId,
        commandKind: "COMPLETE_STEP",
        contractVersion: "1",
        definitionId: invocation.definitionId,
        eventId,
        instanceId: instance.instanceId,
        instanceVersion: transition.instance.version,
        nextStatus: transition.instance.status,
        nextStepStatus: "SUCCEEDED",
        nonExecuting: true,
        occurredAt: reviewedAt,
        previousStatus: instance.status,
        previousStepStatus: "AWAITING_RESULT",
        reasonCode: "workflow_step_outcome_accepted",
        stepId: invocation.stepId,
        summaryCode: "workflow_transition_applied",
        workflowId: invocation.workflowId,
        workflowVersion: invocation.workflowVersion,
      }, new WorkflowEventDraftValidator(), "Workflow Step completion event");
      const receipt = this.#receipt(trusted, invocation.fingerprint, "ACCEPTED_FOR_COMPLETION", [], reviewedAt, identity, { resultingInstanceVersion: transition.instance.version, workflowEventId: eventId });
      await workflows.instances.update(transition.instance, { version: instance.version });
      await workflows.receipts.insert(instance.instanceId, commandReceipt);
      await workflows.events.append(event);
      await workflows.stepOutcomes.insert(receipt);
      return freeze({ contractVersion: "1", receipt, replayed: false });
    });
  }

  public reject(request: WorkflowStepRejectionRequest): Promise<WorkflowStepOutcomeResult> {
    const trusted = validate(request, new WorkflowStepRejectionRequestValidator(), "Workflow Step rejection request");
    if (trusted.actorId !== this.dependencies.operatorActorId) throw new RepositoryConflictError("Workflow Step rejection requires the configured operator");
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const invocation = await workflows.agentInvocations.getById(trusted.invocationId);
      if (invocation === undefined) throw new RepositoryConflictError("Workflow Step rejection invocation is missing");
      const fingerprint = createHash("sha256").update(JSON.stringify({ invocationFingerprint: invocation.fingerprint, request: trusted }), "utf8").digest("hex");
      const existing = await workflows.stepOutcomes.getByInvocationId(trusted.invocationId);
      if (existing !== undefined) { if (existing.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow Step rejection conflicts with prior outcome"); return freeze({ contractVersion: "1", receipt: existing, replayed: true }); }
      if (invocation.status !== "COMPLETED") throw new RepositoryConflictError("Only a completed Agent result can be explicitly rejected");
      const instance = await workflows.instances.getById(invocation.instanceId);
      if (instance?.version !== trusted.expectedInstanceVersion || instance.steps.find(({ stepId }) => stepId === invocation.stepId)?.status !== "AWAITING_RESULT") throw new RepositoryConflictError("Workflow Step rejection snapshot is stale or invalid");
      const receipt = validate({ contractVersion: "1", decision: "REJECTED", externalEffects: false, fingerprint, instanceId: invocation.instanceId, invocationFingerprint: invocation.fingerprint, invocationId: invocation.invocationId, outcomeId: trusted.outcomeId, remediation: [`Operator rejected result: ${trusted.reasonCode}`], reviewedAt: now(this.dependencies.clock), reviewerActorId: trusted.actorId, stepId: invocation.stepId }, new WorkflowStepOutcomeReceiptValidator(), "Workflow Step rejection receipt");
      await workflows.stepOutcomes.insert(receipt);
      return freeze({ contractVersion: "1", receipt, replayed: false });
    });
  }

  async #persistDecision(workflows: Parameters<Parameters<RepositoryTransactionRunner["transaction"]>[0]>[0]["workflows"], request: WorkflowStepOutcomeRequest, decision: Exclude<WorkflowStepOutcomeDecision, "ACCEPTED_FOR_COMPLETION">, invocationFingerprint: string, remediation: readonly string[], identity: { readonly instanceId: string; readonly stepId: string }, persist = true): Promise<WorkflowStepOutcomeResult> {
    const fingerprint = createWorkflowStepOutcomeFingerprint(request, invocationFingerprint);
    const receipt = this.#receipt(request, invocationFingerprint, decision, remediation, now(this.dependencies.clock), identity);
    if (!persist) return freeze({ contractVersion: "1", receipt, replayed: false });
    const byId = await workflows.stepOutcomes.getById(request.outcomeId);
    if (byId !== undefined) {
      if (byId.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow Step outcome ID conflicts with prior review");
      return freeze({ contractVersion: "1", receipt: byId, replayed: true });
    }
    await workflows.stepOutcomes.insert(receipt);
    return freeze({ contractVersion: "1", receipt, replayed: false });
  }

  #receipt(request: WorkflowStepOutcomeRequest, invocationFingerprint: string, decision: WorkflowStepOutcomeDecision, remediation: readonly string[], reviewedAt: string, identity: { readonly instanceId: string; readonly stepId: string }, completion?: { readonly resultingInstanceVersion: number; readonly workflowEventId: string }): WorkflowStepOutcomeReceipt {
    return validate({ contractVersion: "1", decision, externalEffects: false, fingerprint: createWorkflowStepOutcomeFingerprint(request, invocationFingerprint), instanceId: identity.instanceId, invocationFingerprint, invocationId: request.invocationId, outcomeId: request.outcomeId, remediation, reviewedAt, stepId: identity.stepId, ...completion }, new WorkflowStepOutcomeReceiptValidator(), "Workflow Step outcome receipt");
  }
}

export function createWorkflowStepOutcomeService(dependencies: Omit<RepositoryBackedWorkflowStepOutcomeDependencies, "operatorActorId" | "requestValidator" | "stateMachine"> & { readonly operatorActorId?: string }): RepositoryBackedWorkflowStepOutcomeService { return new RepositoryBackedWorkflowStepOutcomeService({ ...dependencies, operatorActorId: dependencies.operatorActorId ?? "fabio", requestValidator: new WorkflowStepOutcomeRequestValidator(), stateMachine: new DeterministicWorkflowStateMachine(dependencies.clock) }); }

function assess(artifact: ContentDirectionArtifact): { readonly decision: "ACCEPTED_FOR_COMPLETION" | "NEEDS_REVISION" | "REJECTED"; readonly remediation: readonly string[] } {
  const remediation = [
    ...(artifact.evidenceReferences.length === 0 ? ["Add at least one authoritative evidence reference"] : []),
    ...(artifact.claimRiskFlags.length > 0 ? ["Resolve every claim-risk indicator"] : []),
    ...(artifact.messageHierarchy.length < 3 ? ["Provide a complete message hierarchy"] : []),
    ...(artifact.qualityReviewChecklist.length < 4 ? ["Provide the complete quality review checklist"] : []),
    ...(artifact.handoffSummary.length < 20 ? ["Provide a handoff-ready summary"] : []),
  ];
  return remediation.length === 0 ? { decision: "ACCEPTED_FOR_COMPLETION", remediation } : { decision: "NEEDS_REVISION", remediation };
}
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function now(clock: Clock): string { const value = clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryValidationError("Workflow Step outcome clock is invalid"); return value.toISOString(); }
