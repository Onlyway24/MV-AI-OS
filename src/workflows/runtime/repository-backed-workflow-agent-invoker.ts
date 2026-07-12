import type { AgentRuntime } from "../../agents/agent-runtime.js";
import type { AgentRuntimeResolver } from "../../agents/agent-runtime-resolution.js";
import type { AgentSpecificationRegistry } from "../../agents/specification/agent-specification-registry.js";
import { ContentDirectionArtifactValidator } from "../../agents/content/deterministic-content-director.js";
import type { AgentInvocation, AgentResult } from "../../contracts/agent-execution.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Clock } from "../../ports/clock.js";
import type { Validator } from "../../validation/validation.js";
import { createWorkflowCommandFingerprint } from "./workflow-command-fingerprint.js";
import type { WorkflowInstance } from "./workflow-runtime.js";
import type { WorkflowStepExecutionBoundary } from "./workflow-step-execution-boundary.js";
import {
  ControlledWorkflowAgentInvocationRequestValidator,
  WorkflowAgentInvocationReceiptValidator,
  createWorkflowAgentInvocationFingerprint,
  freeze,
  type ControlledWorkflowAgentInvocationRequest,
  type ControlledWorkflowAgentInvocationResult,
  type ControlledWorkflowAgentInvoker,
  type WorkflowAgentInvocationEvent,
  type WorkflowAgentInvocationReceipt,
} from "./workflow-agent-invocation.js";

export interface RepositoryBackedWorkflowAgentInvokerDependencies {
  readonly agentRuntime: AgentRuntime;
  readonly agentSpecifications: AgentSpecificationRegistry;
  readonly boundary: WorkflowStepExecutionBoundary;
  readonly clock: Clock;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<ControlledWorkflowAgentInvocationRequest>;
  readonly resolver: AgentRuntimeResolver;
  readonly resultValidator: Validator<AgentResult>;
}

export class RepositoryBackedWorkflowAgentInvoker implements ControlledWorkflowAgentInvoker {
  public constructor(private readonly dependencies: RepositoryBackedWorkflowAgentInvokerDependencies) {}

  public async invoke(request: ControlledWorkflowAgentInvocationRequest): Promise<ControlledWorkflowAgentInvocationResult> {
    const valid = validate(request, this.dependencies.requestValidator, "Workflow agent invocation request");
    const trusted = validate(valid, new ControlledWorkflowAgentInvocationRequestValidator(), "Workflow agent invocation request");
    const fingerprint = createWorkflowAgentInvocationFingerprint(trusted);
    const existing = await this.dependencies.repositories.transaction(({ workflows }) => workflows.agentInvocations.getById(trusted.invocationId));
    if (existing !== undefined) return this.#resume(existing, fingerprint);

    const prepared = await this.dependencies.boundary.prepare(trusted.boundaryRequest);
    if (prepared.status !== "CANDIDATE_AVAILABLE") return blocked("CANDIDATE_BLOCKED", "Authoritative workflow candidate is blocked");
    const candidate = prepared.candidate;
    const resolved = this.dependencies.resolver.resolve({
      requiredCapabilityIds: candidate.capabilityIds,
      specificationId: candidate.specificationId,
      specificationVersion: candidate.specificationVersion,
    });
    if (resolved.status !== "resolved") return blocked("EXECUTOR_UNRESOLVED", resolved.blocker.reason);
    const descriptor = resolved.executor;
    const specification = this.dependencies.agentSpecifications.get(candidate.agentId, candidate.specificationVersion);
    if (specification === undefined) return blocked("EXECUTOR_UNRESOLVED", "Exact Agent Specification is missing");

    const receipt = await this.dependencies.repositories.transaction(async ({ workflows }) => {
      const duplicate = await workflows.agentInvocations.getById(trusted.invocationId);
      if (duplicate !== undefined) {
        if (duplicate.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow agent invocation ID conflicts with another request");
        return duplicate;
      }
      const instance = await workflows.instances.getById(candidate.instanceId);
      if (instance?.version !== candidate.instanceVersion) throw new RepositoryConflictError("Workflow candidate became stale before invocation reservation");
      await assertControlsUnchanged(workflows, candidate);
      const timestamp = now(this.dependencies.clock);
      const reservedVersion = instance.steps.find(({ stepId }) => stepId === candidate.stepId)?.status === "PENDING" ? instance.version + 2 : instance.version + 1;
      const reserved: WorkflowAgentInvocationReceipt = validate({
        capabilityIds: candidate.capabilityIds,
        contractVersion: "1",
        definitionId: candidate.definitionId,
        executorId: descriptor.executorId,
        executorVersion: descriptor.executorVersion,
        externalEffectsAllowed: false,
        fingerprint,
        inputContractId: descriptor.inputContractId,
        instanceId: candidate.instanceId,
        invocationId: trusted.invocationId,
        outputContractId: descriptor.outputContractId,
        reservedAt: timestamp,
        reservedInstanceVersion: reservedVersion,
        runtimeAgentId: descriptor.runtimeAgentId,
        runtimeAgentVersion: descriptor.runtimeAgentVersion,
        specificationId: candidate.specificationId,
        specificationVersion: candidate.specificationVersion,
        status: "RESERVED",
        stepId: candidate.stepId,
        workflowId: candidate.workflowId,
        workflowVersion: candidate.workflowVersion,
      }, new WorkflowAgentInvocationReceiptValidator(), "Workflow agent invocation receipt");
      await reserveInstance(workflows, instance, reserved, timestamp);
      await workflows.agentInvocations.insert(reserved);
      await workflows.agentInvocationEvents.append(this.#event(reserved, "RESERVED", timestamp));
      return reserved;
    });
    if (receipt.status !== "RESERVED") return terminal(receipt, true);
    return this.#execute(receipt, specification.limits);
  }

  async #resume(receipt: WorkflowAgentInvocationReceipt, fingerprint: string): Promise<ControlledWorkflowAgentInvocationResult> {
    if (receipt.fingerprint !== fingerprint) return blocked("INVOCATION_CONFLICT", "Invocation ID has a conflicting fingerprint");
    if (receipt.status !== "RESERVED") return terminal(receipt, true);
    const resumable = await this.dependencies.repositories.transaction(async ({ workflows }) => {
      const instance = await workflows.instances.getById(receipt.instanceId);
      return instance?.status === "ACTIVE" && instance.version === receipt.reservedInstanceVersion && instance.steps.find(({ stepId }) => stepId === receipt.stepId)?.status === "AWAITING_RESULT";
    });
    if (!resumable) return blocked("INVOCATION_STATE_INVALID", "Reserved invocation cannot resume while its Workflow is stopped");
    const resolved = this.dependencies.resolver.resolve({ requiredCapabilityIds: receipt.capabilityIds, specificationId: receipt.specificationId, specificationVersion: receipt.specificationVersion });
    const specification = this.dependencies.agentSpecifications.get(receipt.runtimeAgentId, receipt.specificationVersion);
    if (resolved.status !== "resolved" || specification === undefined || resolved.executor.executorId !== receipt.executorId || resolved.executor.executorVersion !== receipt.executorVersion) return blocked("INVOCATION_STATE_INVALID", "Reserved invocation binding no longer resolves exactly");
    return this.#execute(receipt, specification.limits);
  }

  async #execute(receipt: WorkflowAgentInvocationReceipt, limits: { readonly maxResultBytes: number; readonly maxToolCalls: number; readonly timeoutMs: number; readonly maxTokens?: number; readonly maxCostUsd?: number }): Promise<ControlledWorkflowAgentInvocationResult> {
    const invocation: AgentInvocation = {
      agent: { agentId: receipt.runtimeAgentId, version: receipt.runtimeAgentVersion },
      attempt: 1,
      context: {},
      contractVersion: "1",
      correlationId: receipt.fingerprint,
      input: {
        audience: "Workflow stakeholders",
        brandPreferences: [],
        constraints: ["Preparation only", "No external effects", "Use only supplied evidence"],
        deliverableType: "workflow-content-direction",
        evidenceReferences: [receipt.definitionId],
        objective: `Prepare content direction for workflow ${receipt.workflowId} step ${receipt.stepId}`,
      },
      invocationId: receipt.invocationId,
      limits: { ...(limits.maxCostUsd === undefined ? {} : { maxCostUsd: limits.maxCostUsd }), maxResultBytes: limits.maxResultBytes, ...(limits.maxTokens === undefined ? {} : { maxTokens: limits.maxTokens }), maxToolCalls: 0, modelProfile: "deterministic-local", timeoutMs: limits.timeoutMs },
      objective: `Prepare bounded content direction for step ${receipt.stepId}`,
      outputContract: contractReference(receipt.outputContractId),
      permissions: [],
      taskId: receipt.instanceId,
    };
    let result: AgentResult | undefined;
    let failure: WorkflowAgentInvocationReceipt["failure"];
    try {
      const candidate = await this.dependencies.agentRuntime.execute(invocation);
      const validated = this.dependencies.resultValidator.validate(candidate);
      const artifactValid = validated.ok && new ContentDirectionArtifactValidator().validate(validated.value.output).ok;
      if (!validated.ok || !artifactValid || validated.value.status !== "succeeded" || validated.value.invocationId !== receipt.invocationId || validated.value.taskId !== receipt.instanceId || validated.value.agent.agentId !== receipt.runtimeAgentId || validated.value.agent.version !== receipt.runtimeAgentVersion || JSON.stringify(validated.value).length > limits.maxResultBytes || (validated.value.output as { externalEffects?: unknown } | undefined)?.externalEffects !== false) {
        failure = { code: "AGENT_RESULT_INVALID", message: "Agent result failed bounded invocation validation" };
      } else result = validated.value;
    } catch { failure = { code: "AGENT_EXECUTION_FAILED", message: "Agent execution failed safely" }; }
    const timestamp = now(this.dependencies.clock);
    const outcome = validate({ ...receipt, completedAt: timestamp, ...(result === undefined ? { failure, status: "FAILED" } : { result, status: "COMPLETED" }) }, new WorkflowAgentInvocationReceiptValidator(), "Workflow agent invocation outcome");
    await this.dependencies.repositories.transaction(async ({ workflows }) => {
      const current = await workflows.agentInvocations.getById(receipt.invocationId);
      if (current?.fingerprint !== receipt.fingerprint) throw new RepositoryConflictError("Workflow agent invocation reservation is missing");
      if (current.status !== "RESERVED") return;
      await workflows.agentInvocations.update(outcome, "RESERVED");
      await workflows.agentInvocationEvents.append(this.#event(outcome, outcome.status, timestamp));
    });
    const stored = await this.dependencies.repositories.transaction(({ workflows }) => workflows.agentInvocations.getById(receipt.invocationId));
    if (stored === undefined || stored.status === "RESERVED") throw new RepositoryValidationError("Workflow agent invocation outcome was not persisted");
    return terminal(stored, false);
  }

  #event(receipt: WorkflowAgentInvocationReceipt, status: WorkflowAgentInvocationReceipt["status"], timestamp: string): WorkflowAgentInvocationEvent {
    return freeze({ contractVersion: "1", eventId: `${receipt.invocationId}-${status.toLowerCase()}`, externalEffects: false, instanceId: receipt.instanceId, invocationId: receipt.invocationId, occurredAt: timestamp, status, stepId: receipt.stepId, summaryCode: status === "RESERVED" ? "workflow_agent_invocation_reserved" : status === "COMPLETED" ? "workflow_agent_invocation_completed" : "workflow_agent_invocation_failed" });
  }
}

export function createWorkflowAgentInvoker(dependencies: Omit<RepositoryBackedWorkflowAgentInvokerDependencies, "requestValidator">): RepositoryBackedWorkflowAgentInvoker { return new RepositoryBackedWorkflowAgentInvoker({ ...dependencies, requestValidator: new ControlledWorkflowAgentInvocationRequestValidator() }); }

async function reserveInstance(workflows: Parameters<Parameters<RepositoryTransactionRunner["transaction"]>[0]>[0]["workflows"], instance: WorkflowInstance, receipt: WorkflowAgentInvocationReceipt, timestamp: string): Promise<void> {
  let current = instance;
  const index = current.steps.findIndex(({ stepId }) => stepId === receipt.stepId);
  const step = current.steps[index];
  if (step === undefined || (step.status !== "PENDING" && step.status !== "READY")) throw new RepositoryConflictError("Workflow step is not reservable");
  if (step.status === "PENDING") {
    const commandId = `${receipt.invocationId}-ready`;
    const fingerprint = createWorkflowCommandFingerprint({ commandId, expectedVersion: current.version, kind: "ACTIVATE", nonExecuting: true, reasonCode: "workflow_agent_invocation_readiness" });
    const readinessReceipt = { commandId, fingerprint, resultingVersion: current.version + 1 };
    current = freeze({ ...current, receipts: [...current.receipts, readinessReceipt], steps: current.steps.map((entry, position) => position === index ? { ...entry, status: "READY" as const } : entry), updatedAt: timestamp, version: current.version + 1 });
    await workflows.instances.update(current, { version: instance.version });
    await workflows.receipts.insert(current.instanceId, readinessReceipt);
  }
  const previousVersion = current.version;
  const reservationReceipt = { commandId: receipt.invocationId, fingerprint: receipt.fingerprint, resultingVersion: previousVersion + 1 };
  const final = freeze({ ...current, receipts: [...current.receipts, reservationReceipt], steps: current.steps.map((entry, position) => position === index ? { ...entry, status: "AWAITING_RESULT" as const } : entry), updatedAt: timestamp, version: previousVersion + 1 });
  await workflows.instances.update(final, { version: previousVersion });
  await workflows.receipts.insert(final.instanceId, reservationReceipt);
}

async function assertControlsUnchanged(workflows: Parameters<Parameters<RepositoryTransactionRunner["transaction"]>[0]>[0]["workflows"], candidate: { readonly approvalEvidenceIds: readonly string[]; readonly guardianEvidenceIds: readonly string[]; readonly instanceId: string; readonly instanceVersion: number; readonly stepId: string }): Promise<void> {
  const approvals = await workflows.approvals.listBySnapshot(candidate.instanceId, candidate.instanceVersion, candidate.stepId);
  const guardians = await workflows.guardians.listBySnapshot(candidate.instanceId, candidate.instanceVersion, candidate.stepId);
  let latestApproval: typeof approvals[number] | undefined;
  for (const entry of approvals) if (await workflows.controlEvents.getByCheckpoint("APPROVAL", entry.evidenceId) !== undefined) latestApproval = entry;
  const approvalIds = latestApproval?.status === "APPROVED" ? [latestApproval.evidenceId] : [];
  if (!sameIds(candidate.approvalEvidenceIds, approvalIds)) throw new RepositoryConflictError("Workflow approval changed before invocation reservation");
  const latest = new Map<string, typeof guardians[number]>();
  for (const entry of guardians) if (await workflows.controlEvents.getByCheckpoint("GUARDIAN", entry.evidenceId) !== undefined) latest.set(entry.domain, entry);
  const guardianIds = [...latest.values()].filter(({ status }) => status === "CLEAR").map(({ evidenceId }) => evidenceId);
  if (!sameIds(candidate.guardianEvidenceIds, guardianIds)) throw new RepositoryConflictError("Workflow Guardian evidence changed before invocation reservation");
}
function sameIds(left: readonly string[], right: readonly string[]): boolean { return [...left].sort().join("\n") === [...right].sort().join("\n"); }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function now(clock: Clock): string { const value = clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryValidationError("Workflow invocation clock is invalid"); return value.toISOString(); }
function blocked(code: "CANDIDATE_BLOCKED" | "EXECUTOR_UNRESOLVED" | "INVOCATION_CONFLICT" | "INVOCATION_STATE_INVALID", reason: string): ControlledWorkflowAgentInvocationResult { return freeze({ blocker: { code, reason }, contractVersion: "1", status: "BLOCKED" }); }
function terminal(receipt: WorkflowAgentInvocationReceipt, replayed: boolean): ControlledWorkflowAgentInvocationResult { if (receipt.status === "RESERVED") return blocked("INVOCATION_STATE_INVALID", "Invocation has no durable outcome"); return freeze({ contractVersion: "1", receipt, replayed, status: receipt.status }); }
function contractReference(identity: string | undefined): { readonly contractId: string; readonly contractVersion: string } { if (identity === undefined) throw new RepositoryValidationError("Workflow invocation output contract identity is missing"); const separator = identity.lastIndexOf("@"); if (separator < 1 || separator === identity.length - 1) throw new RepositoryValidationError("Workflow invocation output contract identity is invalid"); return Object.freeze({ contractId: identity.slice(0, separator), contractVersion: identity.slice(separator + 1) }); }
