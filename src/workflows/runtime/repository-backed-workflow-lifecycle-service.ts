import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Clock } from "../../ports/clock.js";
import type { Validator } from "../../validation/validation.js";
import { DeterministicWorkflowStateMachine } from "./deterministic-workflow-state-machine.js";
import { WorkflowEventDraftValidator } from "./workflow-persistence-validator.js";
import {
  WorkflowFailureRequestValidator,
  WorkflowLifecycleEventValidator,
  WorkflowLifecycleRecordValidator,
  WorkflowRetryAuthorizationRequestValidator,
  createWorkflowLifecycleFingerprint,
  freeze,
  isRetryableFailureCategory,
  type WorkflowFailureRequest,
  type WorkflowLifecycleEvent,
  type WorkflowLifecycleRecord,
  type WorkflowLifecycleResult,
  type WorkflowLifecycleService,
  type WorkflowRetryAuthorizationRequest,
} from "./workflow-lifecycle.js";

export interface RepositoryBackedWorkflowLifecycleDependencies {
  readonly clock: Clock;
  readonly maxAttempts: number;
  readonly operatorActorId: string;
  readonly repositories: RepositoryTransactionRunner;
  readonly failureRequestValidator: Validator<WorkflowFailureRequest>;
  readonly retryRequestValidator: Validator<WorkflowRetryAuthorizationRequest>;
  readonly stateMachine: DeterministicWorkflowStateMachine;
}

export class RepositoryBackedWorkflowLifecycleService implements WorkflowLifecycleService {
  public constructor(private readonly dependencies: RepositoryBackedWorkflowLifecycleDependencies) {}

  public recordFailure(request: WorkflowFailureRequest): Promise<WorkflowLifecycleResult> {
    const valid = validate(validate(request, this.dependencies.failureRequestValidator, "Workflow failure request"), new WorkflowFailureRequestValidator(), "Workflow failure request");
    const fingerprint = createWorkflowLifecycleFingerprint(valid);
    if (valid.maxAttempts !== this.dependencies.maxAttempts) throw new RepositoryConflictError("Workflow failure request does not match the configured retry limit");
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.lifecycleRecords.getById(valid.failureId);
      if (existing !== undefined) return replay(existing, fingerprint);
      const invocation = await workflows.agentInvocations.getById(valid.invocationId);
      if (invocation?.instanceId !== valid.instanceId || invocation.stepId !== valid.stepId) throw new RepositoryConflictError("Workflow failure source invocation is missing or mismatched");
      const outcome = await workflows.stepOutcomes.getByInvocationId(valid.invocationId);
      if (invocation.status !== "FAILED" && !["NEEDS_REVISION", "REJECTED", "FAILED", "INVALID"].includes(outcome?.decision ?? "")) throw new RepositoryConflictError("Workflow invocation does not contain failure evidence");
      const instance = await workflows.instances.getById(valid.instanceId);
      if (instance?.version !== valid.expectedVersion) throw new RepositoryConflictError("Workflow failure request version is stale");
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) throw new RepositoryValidationError("Workflow definition is missing");
      const prior = await workflows.lifecycleRecords.listByStep(valid.instanceId, valid.stepId);
      const attempt = prior.filter(({ kind }) => kind === "FAILURE").length + 1;
      if (attempt > valid.maxAttempts) throw new RepositoryConflictError("Workflow failure attempt exceeds the bounded policy");
      const transition = this.dependencies.stateMachine.apply(instance, { commandId: valid.commandId, expectedVersion: valid.expectedVersion, kind: "FAIL_STEP", nonExecuting: true, reasonCode: valid.reasonCode, stepId: valid.stepId });
      const commandReceipt = transition.instance.receipts.at(-1);
      if (commandReceipt === undefined) throw new RepositoryValidationError("Workflow failure transition produced no receipt");
      const recordedAt = now(this.dependencies.clock);
      const record = lifecycleRecord({ actorId: valid.actorId, attempt, category: valid.category, definitionId: definition.definitionId, fingerprint, instanceId: valid.instanceId, instanceVersion: transition.instance.version, invocationId: valid.invocationId, kind: "FAILURE", maxAttempts: valid.maxAttempts, recordedAt, recordId: valid.failureId, recoveryInstructions: failureInstructions(valid.category, attempt, valid.maxAttempts), retryable: isRetryableFailureCategory(valid.category), stepId: valid.stepId, workflowVersion: definition.workflowVersion });
      const workflowEvent = validate({ actorCategory: "runtime", commandId: valid.commandId, commandKind: "FAIL_STEP", contractVersion: "1", definitionId: definition.definitionId, eventId: `${valid.failureId}-transition`, instanceId: valid.instanceId, instanceVersion: transition.instance.version, nextStatus: "FAILED", nextStepStatus: "FAILED", nonExecuting: true, occurredAt: recordedAt, previousStatus: instance.status, previousStepStatus: "AWAITING_RESULT", reasonCode: valid.reasonCode, stepId: valid.stepId, summaryCode: "workflow_transition_applied", workflowId: definition.workflowId, workflowVersion: definition.workflowVersion }, new WorkflowEventDraftValidator(), "Workflow failure event");
      await workflows.instances.update(transition.instance, { version: instance.version });
      await workflows.receipts.insert(instance.instanceId, commandReceipt);
      await workflows.events.append(workflowEvent);
      await workflows.lifecycleRecords.insert(record);
      await workflows.lifecycleEvents.append(lifecycleEvent(record));
      return freeze({ contractVersion: "1", record, replayed: false });
    });
  }

  public authorizeRetry(request: WorkflowRetryAuthorizationRequest): Promise<WorkflowLifecycleResult> {
    const valid = validate(validate(request, this.dependencies.retryRequestValidator, "Workflow retry authorization request"), new WorkflowRetryAuthorizationRequestValidator(), "Workflow retry authorization request");
    if (valid.actorId !== this.dependencies.operatorActorId) throw new RepositoryConflictError("Workflow retry authorization requires the configured operator");
    const fingerprint = createWorkflowLifecycleFingerprint(valid);
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.lifecycleRecords.getById(valid.authorizationId);
      if (existing !== undefined) return replay(existing, fingerprint);
      const instance = await workflows.instances.getById(valid.instanceId);
      if (instance?.version !== valid.expectedVersion || instance.status !== "FAILED" || instance.steps.find(({ stepId }) => stepId === valid.stepId)?.status !== "FAILED") throw new RepositoryConflictError("Workflow retry authorization snapshot is invalid");
      const records = await workflows.lifecycleRecords.listByStep(valid.instanceId, valid.stepId);
      const failures = records.filter((record): record is WorkflowLifecycleRecord & Required<Pick<WorkflowLifecycleRecord, "attempt" | "category" | "maxAttempts" | "retryable">> => record.kind === "FAILURE" && record.attempt !== undefined && record.category !== undefined && record.maxAttempts !== undefined && record.retryable !== undefined);
      const failure = failures.at(-1);
      if (failure?.recordId !== valid.failureId) throw new RepositoryConflictError("Workflow retry authorization does not reference the latest failure");
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) throw new RepositoryValidationError("Workflow definition is missing");
      const retryDecision = !failure.retryable ? "DENIED_NON_RETRYABLE" : failure.attempt >= failure.maxAttempts ? "DENIED_EXHAUSTED" : "AUTHORIZED";
      const recordedAt = now(this.dependencies.clock);
      const record = lifecycleRecord({ actorId: valid.actorId, definitionId: definition.definitionId, failureId: failure.recordId, fingerprint, instanceId: valid.instanceId, instanceVersion: instance.version, kind: "RETRY_AUTHORIZATION", recordedAt, recordId: valid.authorizationId, recoveryInstructions: retryInstructions(retryDecision), retryDecision, stepId: valid.stepId, workflowVersion: definition.workflowVersion });
      await workflows.lifecycleRecords.insert(record);
      await workflows.lifecycleEvents.append(lifecycleEvent(record));
      return freeze({ contractVersion: "1", record, replayed: false });
    });
  }
}

export function createWorkflowLifecycleService(dependencies: Omit<RepositoryBackedWorkflowLifecycleDependencies, "failureRequestValidator" | "retryRequestValidator" | "stateMachine">): RepositoryBackedWorkflowLifecycleService { if (!Number.isSafeInteger(dependencies.maxAttempts) || dependencies.maxAttempts < 1 || dependencies.maxAttempts > 5) throw new RepositoryValidationError("Workflow retry limit is invalid"); return new RepositoryBackedWorkflowLifecycleService({ ...dependencies, failureRequestValidator: new WorkflowFailureRequestValidator(), retryRequestValidator: new WorkflowRetryAuthorizationRequestValidator(), stateMachine: new DeterministicWorkflowStateMachine(dependencies.clock) }); }

function lifecycleRecord(value: Omit<WorkflowLifecycleRecord, "contractVersion" | "externalEffects">): WorkflowLifecycleRecord { return validate({ ...value, contractVersion: "1", externalEffects: false }, new WorkflowLifecycleRecordValidator(), "Workflow lifecycle record"); }
function lifecycleEvent(record: WorkflowLifecycleRecord): WorkflowLifecycleEvent { return validate({ contractVersion: "1", eventId: `${record.recordId}-event`, externalEffects: false, instanceId: record.instanceId, kind: record.kind, occurredAt: record.recordedAt, recordId: record.recordId, stepId: record.stepId, summaryCode: record.kind === "FAILURE" ? "workflow_failure_recorded" : "workflow_retry_authorization_recorded" }, new WorkflowLifecycleEventValidator(), "Workflow lifecycle event"); }
function replay(record: WorkflowLifecycleRecord, fingerprint: string): WorkflowLifecycleResult { if (record.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow lifecycle record ID conflicts with prior request"); return freeze({ contractVersion: "1", record, replayed: true }); }
function failureInstructions(category: WorkflowFailureRequest["category"], attempt: number, maxAttempts: number): readonly string[] { if (!isRetryableFailureCategory(category)) return Object.freeze(["Inspect the durable failure evidence.", "Correct the non-retryable condition before creating new work."]); if (attempt >= maxAttempts) return Object.freeze(["Retry attempts are exhausted.", "Inspect the durable audit trail and choose a manual recovery path."]); return Object.freeze(["Inspect the durable failure evidence.", "Request explicit operator retry authorization.", "Do not retry automatically."]); }
function retryInstructions(decision: "AUTHORIZED" | "DENIED_EXHAUSTED" | "DENIED_NON_RETRYABLE"): readonly string[] { return decision === "AUTHORIZED" ? Object.freeze(["Retry is authorized but has not executed.", "Re-evaluate policy, approvals, Guardians, specification, executor, and version before explicit retry execution."]) : decision === "DENIED_EXHAUSTED" ? Object.freeze(["Retry authorization is denied because the attempt limit is exhausted.", "Choose a manual recovery or cancellation path."]) : Object.freeze(["Retry authorization is denied because the failure category is non-retryable.", "Correct the underlying condition before creating new work."]); }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function now(clock: Clock): string { const value = clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryValidationError("Workflow lifecycle clock is invalid"); return value.toISOString(); }
