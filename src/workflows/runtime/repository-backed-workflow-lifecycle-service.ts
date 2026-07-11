import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Clock } from "../../ports/clock.js";
import type { Validator } from "../../validation/validation.js";
import { DeterministicWorkflowStateMachine } from "./deterministic-workflow-state-machine.js";
import { WorkflowEventDraftValidator } from "./workflow-persistence-validator.js";
import {
  WorkflowFailureRequestValidator,
  WorkflowControlRequestValidator,
  WorkflowLifecycleEventValidator,
  WorkflowLifecycleRecordValidator,
  WorkflowRetryAuthorizationRequestValidator,
  WorkflowRetryExecutionRequestValidator,
  createWorkflowLifecycleFingerprint,
  freeze,
  isRetryableFailureCategory,
  type WorkflowFailureRequest,
  type WorkflowControlRequest,
  type WorkflowLifecycleEvent,
  type WorkflowLifecycleRecord,
  type WorkflowLifecycleResult,
  type WorkflowLifecycleService,
  type WorkflowRetryAuthorizationRequest,
  type WorkflowRetryExecutionRequest,
} from "./workflow-lifecycle.js";

export interface RepositoryBackedWorkflowLifecycleDependencies {
  readonly clock: Clock;
  readonly maxAttempts: number;
  readonly operatorActorId: string;
  readonly repositories: RepositoryTransactionRunner;
  readonly failureRequestValidator: Validator<WorkflowFailureRequest>;
  readonly controlRequestValidator: Validator<WorkflowControlRequest>;
  readonly retryRequestValidator: Validator<WorkflowRetryAuthorizationRequest>;
  readonly retryExecutionRequestValidator: Validator<WorkflowRetryExecutionRequest>;
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

  public controlWorkflow(request: WorkflowControlRequest): Promise<WorkflowLifecycleResult> {
    const valid = validate(validate(request, this.dependencies.controlRequestValidator, "Workflow control request"), new WorkflowControlRequestValidator(), "Workflow control request");
    if (valid.actorId !== this.dependencies.operatorActorId) throw new RepositoryConflictError("Workflow control requires the configured operator");
    const fingerprint = createWorkflowLifecycleFingerprint(valid);
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.lifecycleRecords.getById(valid.controlId);
      if (existing !== undefined) return replay(existing, fingerprint);
      const instance = await workflows.instances.getById(valid.instanceId);
      if (instance?.version !== valid.expectedVersion) throw new RepositoryConflictError("Workflow control request version is stale");
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) throw new RepositoryValidationError("Workflow definition is missing");
      const transition = this.dependencies.stateMachine.apply(instance, { commandId: valid.commandId, expectedVersion: valid.expectedVersion, kind: valid.action, nonExecuting: true, reasonCode: valid.reasonCode });
      const commandReceipt = transition.instance.receipts.at(-1);
      if (commandReceipt === undefined) throw new RepositoryValidationError("Workflow control transition produced no receipt");
      const recordedAt = now(this.dependencies.clock);
      const kind = valid.action === "CANCEL" ? "CANCELLATION" : valid.action;
      const record = lifecycleRecord({ actorId: valid.actorId, definitionId: definition.definitionId, fingerprint, instanceId: valid.instanceId, instanceVersion: transition.instance.version, kind, recordedAt, recordId: valid.controlId, recoveryInstructions: controlInstructions(valid.action), stepId: "workflow", workflowVersion: definition.workflowVersion });
      const workflowEvent = validate({ actorCategory: "operator", commandId: valid.commandId, commandKind: valid.action, contractVersion: "1", definitionId: definition.definitionId, eventId: `${valid.controlId}-transition`, instanceId: valid.instanceId, instanceVersion: transition.instance.version, nextStatus: transition.instance.status, nonExecuting: true, occurredAt: recordedAt, previousStatus: instance.status, reasonCode: valid.reasonCode, summaryCode: "workflow_transition_applied", workflowId: definition.workflowId, workflowVersion: definition.workflowVersion }, new WorkflowEventDraftValidator(), "Workflow control event");
      await workflows.lifecycleRecords.insert(record);
      await workflows.instances.control(transition.instance, { version: instance.version }, valid.controlId);
      await workflows.receipts.insert(instance.instanceId, commandReceipt);
      await workflows.events.append(workflowEvent);
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

  public executeRetry(request: WorkflowRetryExecutionRequest): Promise<WorkflowLifecycleResult> {
    const valid = validate(validate(request, this.dependencies.retryExecutionRequestValidator, "Workflow retry execution request"), new WorkflowRetryExecutionRequestValidator(), "Workflow retry execution request");
    if (valid.actorId !== this.dependencies.operatorActorId) throw new RepositoryConflictError("Workflow retry execution requires the configured operator");
    const fingerprint = createWorkflowLifecycleFingerprint(valid);
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.lifecycleRecords.getById(valid.executionId);
      if (existing !== undefined) return replay(existing, fingerprint);
      const instance = await workflows.instances.getById(valid.instanceId);
      const failedStep = instance?.steps.find(({ stepId }) => stepId === valid.stepId);
      if (instance?.version !== valid.expectedVersion || instance.status !== "FAILED" || failedStep?.status !== "FAILED") throw new RepositoryConflictError("Workflow retry execution snapshot is invalid");
      const records = await workflows.lifecycleRecords.listByStep(valid.instanceId, valid.stepId);
      const latestFailure = records.filter(({ kind }) => kind === "FAILURE").at(-1);
      const authorization = records.find(({ recordId }) => recordId === valid.authorizationId);
      const latestAuthorization = records.filter(({ kind, failureId }) => kind === "RETRY_AUTHORIZATION" && failureId === valid.failureId).at(-1);
      const consumed = records.some(({ kind, authorizationId }) => kind === "RETRY_EXECUTION" && authorizationId === valid.authorizationId);
      if (
        latestFailure?.recordId !== valid.failureId ||
        latestFailure.instanceVersion !== valid.expectedVersion ||
        authorization?.kind !== "RETRY_AUTHORIZATION" ||
        authorization.failureId !== valid.failureId ||
        authorization.retryDecision !== "AUTHORIZED" ||
        authorization.actorId !== this.dependencies.operatorActorId ||
        authorization.instanceVersion !== valid.expectedVersion ||
        latestAuthorization?.recordId !== valid.authorizationId ||
        consumed
      ) throw new RepositoryConflictError("Workflow retry execution authorization is invalid or already consumed");
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) throw new RepositoryValidationError("Workflow definition is missing");
      if (
        latestFailure.definitionId !== definition.definitionId ||
        latestFailure.workflowVersion !== definition.workflowVersion ||
        authorization.definitionId !== definition.definitionId ||
        authorization.workflowVersion !== definition.workflowVersion
      ) throw new RepositoryConflictError("Workflow retry execution version evidence is mismatched");
      const transition = this.dependencies.stateMachine.apply(instance, { commandId: valid.commandId, expectedVersion: valid.expectedVersion, kind: "RETRY_STEP", nonExecuting: true, reasonCode: "explicit_retry_execution", stepId: valid.stepId });
      const commandReceipt = transition.instance.receipts.at(-1);
      if (commandReceipt === undefined) throw new RepositoryValidationError("Workflow retry execution produced no receipt");
      const recordedAt = now(this.dependencies.clock);
      const record = lifecycleRecord({ actorId: valid.actorId, authorizationId: valid.authorizationId, definitionId: definition.definitionId, failureId: valid.failureId, fingerprint, instanceId: valid.instanceId, instanceVersion: transition.instance.version, kind: "RETRY_EXECUTION", recordedAt, recordId: valid.executionId, recoveryInstructions: retryExecutionInstructions(), stepId: valid.stepId, workflowVersion: definition.workflowVersion });
      const workflowEvent = validate({ actorCategory: "operator", commandId: valid.commandId, commandKind: "RETRY_STEP", contractVersion: "1", definitionId: definition.definitionId, eventId: `${valid.executionId}-transition`, instanceId: valid.instanceId, instanceVersion: transition.instance.version, nextStatus: "ACTIVE", nextStepStatus: "READY", nonExecuting: true, occurredAt: recordedAt, previousStatus: "FAILED", previousStepStatus: "FAILED", reasonCode: "workflow_retry_execution_authorized", stepId: valid.stepId, summaryCode: "workflow_transition_applied", workflowId: definition.workflowId, workflowVersion: definition.workflowVersion }, new WorkflowEventDraftValidator(), "Workflow retry execution event");
      await workflows.instances.retry(transition.instance, { version: instance.version }, valid.authorizationId);
      await workflows.receipts.insert(instance.instanceId, commandReceipt);
      await workflows.events.append(workflowEvent);
      await workflows.lifecycleRecords.insert(record);
      await workflows.lifecycleEvents.append(lifecycleEvent(record));
      return freeze({ contractVersion: "1", record, replayed: false });
    });
  }
}

export function createWorkflowLifecycleService(dependencies: Omit<RepositoryBackedWorkflowLifecycleDependencies, "controlRequestValidator" | "failureRequestValidator" | "retryRequestValidator" | "retryExecutionRequestValidator" | "stateMachine">): RepositoryBackedWorkflowLifecycleService { if (!Number.isSafeInteger(dependencies.maxAttempts) || dependencies.maxAttempts < 1 || dependencies.maxAttempts > 5) throw new RepositoryValidationError("Workflow retry limit is invalid"); return new RepositoryBackedWorkflowLifecycleService({ ...dependencies, controlRequestValidator: new WorkflowControlRequestValidator(), failureRequestValidator: new WorkflowFailureRequestValidator(), retryRequestValidator: new WorkflowRetryAuthorizationRequestValidator(), retryExecutionRequestValidator: new WorkflowRetryExecutionRequestValidator(), stateMachine: new DeterministicWorkflowStateMachine(dependencies.clock) }); }

function lifecycleRecord(value: Omit<WorkflowLifecycleRecord, "contractVersion" | "externalEffects">): WorkflowLifecycleRecord { return validate({ ...value, contractVersion: "1", externalEffects: false }, new WorkflowLifecycleRecordValidator(), "Workflow lifecycle record"); }
function lifecycleEvent(record: WorkflowLifecycleRecord): WorkflowLifecycleEvent { const summaryCode = record.kind === "FAILURE" ? "workflow_failure_recorded" : record.kind === "RETRY_AUTHORIZATION" ? "workflow_retry_authorization_recorded" : record.kind === "RETRY_EXECUTION" ? "workflow_retry_execution_recorded" : record.kind === "PAUSE" ? "workflow_pause_recorded" : record.kind === "RESUME" ? "workflow_resume_recorded" : "workflow_cancellation_recorded"; return validate({ contractVersion: "1", eventId: `${record.recordId}-event`, externalEffects: false, instanceId: record.instanceId, kind: record.kind, occurredAt: record.recordedAt, recordId: record.recordId, stepId: record.stepId, summaryCode }, new WorkflowLifecycleEventValidator(), "Workflow lifecycle event"); }
function replay(record: WorkflowLifecycleRecord, fingerprint: string): WorkflowLifecycleResult { if (record.fingerprint !== fingerprint) throw new RepositoryConflictError("Workflow lifecycle record ID conflicts with prior request"); return freeze({ contractVersion: "1", record, replayed: true }); }
function failureInstructions(category: WorkflowFailureRequest["category"], attempt: number, maxAttempts: number): readonly string[] { if (!isRetryableFailureCategory(category)) return Object.freeze(["Inspect the durable failure evidence.", "Correct the non-retryable condition before creating new work."]); if (attempt >= maxAttempts) return Object.freeze(["Retry attempts are exhausted.", "Inspect the durable audit trail and choose a manual recovery path."]); return Object.freeze(["Inspect the durable failure evidence.", "Request explicit operator retry authorization.", "Do not retry automatically."]); }
function retryInstructions(decision: "AUTHORIZED" | "DENIED_EXHAUSTED" | "DENIED_NON_RETRYABLE"): readonly string[] { return decision === "AUTHORIZED" ? Object.freeze(["Retry is authorized but has not executed.", "Re-evaluate policy, approvals, Guardians, specification, executor, and version before explicit retry execution."]) : decision === "DENIED_EXHAUSTED" ? Object.freeze(["Retry authorization is denied because the attempt limit is exhausted.", "Choose a manual recovery or cancellation path."]) : Object.freeze(["Retry authorization is denied because the failure category is non-retryable.", "Correct the underlying condition before creating new work."]); }
function retryExecutionInstructions(): readonly string[] { return Object.freeze(["Retry eligibility is restored for the exact failed step and workflow version.", "Re-evaluate readiness, policy, approval, Guardian, specification, executor, and version before any invocation.", "No invocation or external action occurred during retry execution."]); }
function controlInstructions(action: WorkflowControlRequest["action"]): readonly string[] { return action === "PAUSE" ? Object.freeze(["Workflow is paused; no new invocation is authorized.", "Resume requires an explicit operator command and fresh control evaluation."]) : action === "RESUME" ? Object.freeze(["Workflow is active but no work was invoked.", "Re-evaluate readiness, policy, approval, Guardian, specification, executor, and version before invocation."]) : Object.freeze(["Workflow is cancelled and no further step invocation is authorized.", "Completed and failure evidence is retained; no external compensation is claimed."]); }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function now(clock: Clock): string { const value = clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryValidationError("Workflow lifecycle clock is invalid"); return value.toISOString(); }
