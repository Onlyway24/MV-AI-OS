import { createHash } from "node:crypto";

import { FounderMissionBriefValidator } from "../missions/founder-mission-brief-validator.js";
import type { LocalMissionPlanningDryRun } from "../missions/local-mission-planning-dry-run.js";
import type { MetodoVeloceContentProductionBrief, MetodoVeloceContentProductionPackage } from "../content-production/metodo-veloce-content-production.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import type { MetodoVeloceContentProductionRepository } from "../content-production/metodo-veloce-content-production-repository.js";
import { MetodoVeloceContentProductionArchiveRequestValidator, MetodoVeloceContentProductionBriefValidator, MetodoVeloceContentProductionMetricsRequestValidator, MetodoVeloceContentProductionReviewRequestValidator, MetodoVeloceContentProductionScheduleRequestValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service.js";
import { ProductionRuntimeEnqueueRequestValidator } from "../production-runtime/production-runtime-validator.js";
import type { Validator, ValidationResult } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import type { WorkflowControlCheckpointService } from "../workflows/runtime/workflow-control-checkpoint.js";
import type { ControlledWorkflowAgentInvoker } from "../workflows/runtime/workflow-agent-invocation.js";
import type { WorkflowLifecycleService } from "../workflows/runtime/workflow-lifecycle.js";
import type { WorkflowOperatorReportRequest, RepositoryBackedWorkflowOperatorReportService } from "../workflows/runtime/workflow-operator-report.js";
import type { WorkflowReadinessService } from "../workflows/runtime/workflow-readiness.js";
import type { WorkflowStepExecutionBoundary } from "../workflows/runtime/workflow-step-execution-boundary.js";
import type { WorkflowStepOutcomeService } from "../workflows/runtime/workflow-step-outcome.js";
import { WorkflowDefinitionValidator, WorkflowInstanceValidator } from "../workflows/runtime/workflow-runtime-validator.js";

export const LOCAL_WORKFLOW_COMMAND_CONTRACT_VERSION = "1" as const;
export const LOCAL_WORKFLOW_OPERATIONS = Object.freeze(["CREATE_MISSION", "PLAN_MISSION", "CREATE_WORKFLOW", "INSPECT_WORKFLOW", "PRODUCE_METODO_VELOCE_CONTENT", "INSPECT_METODO_VELOCE_CONTENT", "REVIEW_METODO_VELOCE_CONTENT", "SCHEDULE_METODO_VELOCE_CONTENT", "RECORD_METODO_VELOCE_CONTENT_METRICS", "ARCHIVE_METODO_VELOCE_CONTENT", "LIST_METODO_VELOCE_CONTENT_QUEUE", "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION", "RUN_PRODUCTION_RUNTIME_ONCE", "GET_PRODUCTION_RUNTIME_HEALTH", "GET_OPERATOR_REPORT", "EVALUATE_READINESS", "GET_NEXT_CANDIDATE", "RECORD_APPROVAL", "RECORD_GUARDIAN", "INVOKE_AGENT", "INSPECT_AGENT_RESULT", "ACCEPT_OUTCOME", "REJECT_OUTCOME", "FAIL_STEP", "INSPECT_RETRY_ELIGIBILITY", "AUTHORIZE_RETRY", "EXECUTE_RETRY", "PAUSE_WORKFLOW", "RESUME_WORKFLOW", "CANCEL_WORKFLOW", "EVALUATE_TIMEOUT", "INSPECT_AUDIT_EVENTS"] as const);
export type LocalWorkflowOperation = typeof LOCAL_WORKFLOW_OPERATIONS[number];
export interface LocalWorkflowCommand { readonly contractVersion: "1"; readonly commandId: string; readonly actorId: string; readonly workspaceId: string; readonly operation: LocalWorkflowOperation; readonly input: Readonly<Record<string, unknown>>; }
export interface LocalWorkflowCommandResponse { readonly contractVersion: "1"; readonly status: "ok"; readonly operation: LocalWorkflowOperation; readonly commandId: string; readonly result: unknown; readonly nextAction: string; readonly replayed: boolean; readonly unauthorizedExternalEffectOccurred: false; }

export interface LocalWorkflowCommandDependencies {
  readonly actorId: string;
  readonly clock: Clock;
  readonly workspaceId: string;
  readonly missionPlanning: LocalMissionPlanningDryRun;
  readonly contentProduction: { produce(candidate: MetodoVeloceContentProductionBrief): MetodoVeloceContentProductionPackage };
  readonly productionRuntime: ProductionRuntimeService;
  readonly readiness: WorkflowReadinessService;
  readonly candidates: WorkflowStepExecutionBoundary;
  readonly controls: WorkflowControlCheckpointService;
  readonly invoker: ControlledWorkflowAgentInvoker;
  readonly outcomes: WorkflowStepOutcomeService;
  readonly lifecycle: WorkflowLifecycleService;
  readonly report: RepositoryBackedWorkflowOperatorReportService;
  readonly repositories: RepositoryTransactionRunner;
}

export class LocalWorkflowCommandValidator implements Validator<LocalWorkflowCommand> {
  public validate(value: unknown): ValidationResult<LocalWorkflowCommand> {
    const serialized = json(value);
    if (!record(value) || Object.keys(value).length !== 6 || value.contractVersion !== "1" || !safeId(value.commandId) || !safeId(value.actorId) || !safeId(value.workspaceId) || !LOCAL_WORKFLOW_OPERATIONS.includes(value.operation as LocalWorkflowOperation) || !record(value.input) || serialized === undefined || serialized.length > 262_144 || prohibited(serialized)) return invalid("Local Workflow command is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as LocalWorkflowCommand)));
  }
}

export class LocalWorkflowCommandResponseValidator implements Validator<LocalWorkflowCommandResponse> {
  public validate(value: unknown): ValidationResult<LocalWorkflowCommandResponse> {
    const serialized = json(value);
    if (
      !record(value) ||
      !keys(value, ["commandId", "contractVersion", "nextAction", "operation", "replayed", "result", "status", "unauthorizedExternalEffectOccurred"]) ||
      value.contractVersion !== "1" ||
      !safeId(value.commandId) ||
      !LOCAL_WORKFLOW_OPERATIONS.includes(value.operation as LocalWorkflowOperation) ||
      value.status !== "ok" ||
      typeof value.nextAction !== "string" ||
      value.nextAction.length < 1 ||
      value.nextAction.length > 1_000 ||
      typeof value.replayed !== "boolean" ||
      value.unauthorizedExternalEffectOccurred !== false ||
      !jsonValue(value.result) ||
      serialized === undefined ||
      serialized.length > 524_288 ||
      prohibited(serialized)
    ) return invalid("Local Workflow command response is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as LocalWorkflowCommandResponse)));
  }
}

export class LocalWorkflowCommandBoundary {
  readonly #validator = new LocalWorkflowCommandValidator();
  readonly #missionValidator = new FounderMissionBriefValidator();
  readonly #contentBriefValidator = new MetodoVeloceContentProductionBriefValidator();
  readonly #contentReviewValidator = new MetodoVeloceContentProductionReviewRequestValidator();
  readonly #contentScheduleValidator = new MetodoVeloceContentProductionScheduleRequestValidator();
  readonly #contentMetricsValidator = new MetodoVeloceContentProductionMetricsRequestValidator();
  readonly #contentArchiveValidator = new MetodoVeloceContentProductionArchiveRequestValidator();
  readonly #productionRuntimeEnqueueValidator = new ProductionRuntimeEnqueueRequestValidator();
  readonly #definitionValidator = new WorkflowDefinitionValidator();
  readonly #instanceValidator = new WorkflowInstanceValidator();
  public constructor(private readonly dependencies: LocalWorkflowCommandDependencies) {}

  public async execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
    const valid = validate(command, this.#validator, "Local Workflow command");
    if (valid.actorId !== this.dependencies.actorId || valid.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Local Workflow command identity is unauthorized");
    if (typeof valid.input.commandId === "string" && valid.input.commandId !== valid.commandId) throw new RepositoryConflictError("Local Workflow command ID does not match the operation request");
    const fingerprint = createHash("sha256").update(JSON.stringify(valid), "utf8").digest("hex");
    const existing = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getById(valid.commandId));
    if (existing !== undefined) return replay(existing.fingerprint, fingerprint, existing.response);
    const resourceInstanceId = await this.#resourceInstanceId(valid);
    if (resourceInstanceId !== undefined) await this.#assertOwnership(resourceInstanceId);
    const result = await this.#dispatch(valid);
    const response = validate({ commandId: valid.commandId, contractVersion: "1" as const, nextAction: action(valid.operation, valid.input, result), operation: valid.operation, replayed: false, result, status: "ok" as const, unauthorizedExternalEffectOccurred: false as const }, new LocalWorkflowCommandResponseValidator(), "Local Workflow command response");
    const frozen = freeze(response);
    try { await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.insert({ commandId: valid.commandId, fingerprint, response: frozen })); }
    catch (error) { const raced = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getById(valid.commandId)); if (raced === undefined) throw error; return replay(raced.fingerprint, fingerprint, raced.response); }
    return frozen;
  }

  async #dispatch(command: LocalWorkflowCommand): Promise<unknown> {
    const input = command.input;
    switch (command.operation) {
      case "CREATE_MISSION": return validate(input.brief, this.#missionValidator, "Founder Mission Brief");
      case "PLAN_MISSION": return this.dependencies.missionPlanning.run({ brief: validate(input.brief, this.#missionValidator, "Founder Mission Brief"), contractVersion: "1" });
      case "CREATE_WORKFLOW": return this.#createWorkflow(input.definition, input.instance);
      case "INSPECT_WORKFLOW": return this.dependencies.repositories.transaction(async ({ workflows }) => { const instance = await workflows.instances.getById(requiredId(input, "instanceId")); if (instance === undefined) throw new RepositoryConflictError("Inspected Workflow does not exist"); return instance; });
      case "PRODUCE_METODO_VELOCE_CONTENT": return this.#produceContentProduction(input.brief);
      case "INSPECT_METODO_VELOCE_CONTENT": return this.#inspectContentProduction(requiredId(input, "productionId"));
      case "REVIEW_METODO_VELOCE_CONTENT": return this.#reviewContentProduction(input);
      case "SCHEDULE_METODO_VELOCE_CONTENT": return this.#scheduleContentProduction(input);
      case "RECORD_METODO_VELOCE_CONTENT_METRICS": return this.#recordContentProductionMetrics(input);
      case "ARCHIVE_METODO_VELOCE_CONTENT": return this.#archiveContentProduction(input);
      case "LIST_METODO_VELOCE_CONTENT_QUEUE": return this.#listContentProductionQueue(input);
      case "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION": return this.#enqueueContentProductionRuntime(input);
      case "RUN_PRODUCTION_RUNTIME_ONCE": return this.#runProductionRuntimeOnce(input);
      case "GET_PRODUCTION_RUNTIME_HEALTH": return this.#productionRuntimeHealth(input);
      case "GET_OPERATOR_REPORT": return this.dependencies.report.create(input as unknown as WorkflowOperatorReportRequest);
      case "EVALUATE_READINESS": return this.dependencies.readiness.evaluate(input as never);
      case "GET_NEXT_CANDIDATE": return this.dependencies.candidates.prepare(input as never);
      case "RECORD_APPROVAL": return this.dependencies.controls.recordApproval(input.checkpoint as never);
      case "RECORD_GUARDIAN": return this.dependencies.controls.recordGuardian(input.checkpoint as never);
      case "INVOKE_AGENT": return this.dependencies.invoker.invoke(input as never);
      case "INSPECT_AGENT_RESULT": return this.dependencies.repositories.transaction(async ({ workflows }) => { const invocation = await workflows.agentInvocations.getById(requiredId(input, "invocationId")); if (invocation === undefined) throw new RepositoryConflictError("Inspected Agent result does not exist"); return invocation; });
      case "ACCEPT_OUTCOME": return this.dependencies.outcomes.review(input as never);
      case "REJECT_OUTCOME": return this.dependencies.outcomes.reject(input as never);
      case "FAIL_STEP": return this.dependencies.lifecycle.recordFailure(input as never);
      case "INSPECT_RETRY_ELIGIBILITY": { const report = await this.dependencies.report.create(input as unknown as WorkflowOperatorReportRequest); return report.retry; }
      case "AUTHORIZE_RETRY": return this.dependencies.lifecycle.authorizeRetry(input as never);
      case "EXECUTE_RETRY": return this.dependencies.lifecycle.executeRetry(input as never);
      case "PAUSE_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "PAUSE" } as never);
      case "RESUME_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "RESUME" } as never);
      case "CANCEL_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "CANCEL" } as never);
      case "EVALUATE_TIMEOUT": return this.dependencies.lifecycle.evaluateTimeout(input as never);
      case "INSPECT_AUDIT_EVENTS": return this.dependencies.repositories.transaction(({ audits }) => audits.listByWorkspaceAndCorrelationId(this.dependencies.workspaceId, requiredId(input, "correlationId"), requiredLimit(input)));
    }
  }

  async #createWorkflow(definitionInput: unknown, instanceInput: unknown): Promise<{ readonly created: boolean }> {
    const definition = validate(definitionInput, this.#definitionValidator, "Workflow definition");
    const instance = validate(instanceInput, this.#instanceValidator, "Workflow instance");
    if (instance.definitionId !== definition.definitionId || instance.version !== 0 || instance.receipts.length !== 0 || definition.steps.length !== instance.steps.length || definition.steps.some((step, index) => step.stepId !== instance.steps[index]?.stepId)) throw new RepositoryValidationError("Created Workflow identity is invalid");
    return this.dependencies.repositories.transaction(async ({ workflows, workflowCommands }) => {
      const existingDefinition = await workflows.definitions.getById(definition.definitionId);
      const existingInstance = await workflows.instances.getById(instance.instanceId);
      if (existingDefinition !== undefined || existingInstance !== undefined) {
        const ownership = await workflowCommands.getOwnership(instance.instanceId);
        if (JSON.stringify(existingDefinition) === JSON.stringify(definition) && JSON.stringify(existingInstance) === JSON.stringify(instance) && ownership?.workspaceId === this.dependencies.workspaceId && ownership.actorId === this.dependencies.actorId) return freeze({ created: false });
        throw new RepositoryConflictError("Created Workflow conflicts with durable state");
      }
      await workflows.definitions.insert(definition);
      await workflows.instances.insert(instance);
      await workflowCommands.insertOwnership({ actorId: this.dependencies.actorId, instanceId: instance.instanceId, workspaceId: this.dependencies.workspaceId });
      return freeze({ created: true });
    });
  }

  async #produceContentProduction(input: unknown): Promise<MetodoVeloceContentProductionRecord> {
    const brief = validate(input, this.#contentBriefValidator, "Metodo Veloce content production brief");
    const contentPackage = this.dependencies.contentProduction.produce(brief);
    const record: MetodoVeloceContentProductionRecord = {
      actorId: this.dependencies.actorId,
      contractVersion: "1",
      createdAt: contentPackage.generatedAt,
      package: contentPackage,
      productionId: brief.productionId,
      status: contentPackage.status === "BLOCKED" ? "BLOCKED" : "PENDING_FABIO_APPROVAL",
      updatedAt: contentPackage.generatedAt,
      version: 0,
      workspaceId: this.dependencies.workspaceId,
    };
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      if (await contentProductions.getById(record.productionId) !== undefined) throw new RepositoryConflictError("Metodo Veloce content production already exists");
      await contentProductions.insert(record);
      return record;
    });
  }

  async #inspectContentProduction(productionId: string): Promise<MetodoVeloceContentProductionRecord> { return this.dependencies.repositories.transaction(({ contentProductions }) => this.#ownedContentProduction(contentProductions, productionId)); }
  async #reviewContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentReviewValidator, "Metodo Veloce content review request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "PENDING_FABIO_APPROVAL" || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for review");
      const reviewedAt = this.dependencies.clock.now().toISOString();
      const next: MetodoVeloceContentProductionRecord = request.decision === "APPROVED" ? { ...current, review: { decision: request.decision, note: request.note, reviewedAt, reviewedBy: this.dependencies.actorId }, status: "APPROVED_FOR_SCHEDULING", updatedAt: reviewedAt, version: current.version + 1 } : { ...current, archive: { archivedAt: reviewedAt, reason: "REJECTED_BY_FABIO" }, review: { decision: request.decision, note: request.note, reviewedAt, reviewedBy: this.dependencies.actorId }, status: "ARCHIVED", updatedAt: reviewedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #scheduleContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentScheduleValidator, "Metodo Veloce content schedule request");
    if (Date.parse(request.scheduledFor) <= this.dependencies.clock.now().getTime()) throw new RepositoryValidationError("Metodo Veloce content schedule must be in the future");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "APPROVED_FOR_SCHEDULING" || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for scheduling");
      const next = { ...current, schedule: { scheduledFor: request.scheduledFor }, status: "SCHEDULED" as const, updatedAt: this.dependencies.clock.now().toISOString(), version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #recordContentProductionMetrics(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentMetricsValidator, "Metodo Veloce content metrics request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "SCHEDULED" || current.metrics !== undefined || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for metrics");
      const reportedAt = this.dependencies.clock.now().toISOString();
      const next = { ...current, metrics: { conversions: request.conversions, costCents: request.costCents, leadCount: request.leadCount, reportedAt, reportedBy: this.dependencies.actorId, saves: request.saves, views: request.views }, updatedAt: reportedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #archiveContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentArchiveValidator, "Metodo Veloce content archive request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (!["PENDING_FABIO_APPROVAL", "APPROVED_FOR_SCHEDULING", "SCHEDULED"].includes(current.status) || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for archive");
      const archivedAt = this.dependencies.clock.now().toISOString();
      const next = { ...current, archive: { archivedAt, reason: request.reason }, status: "ARCHIVED" as const, updatedAt: archivedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #listContentProductionQueue(input: Readonly<Record<string, unknown>>): Promise<readonly MetodoVeloceContentProductionRecord[]> {
    if (Object.keys(input).length !== 1 || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 25) throw new RepositoryValidationError("Metodo Veloce content production queue request is invalid");
    return this.dependencies.repositories.transaction(({ contentProductions }) => contentProductions.listByWorkspaceId(this.dependencies.workspaceId, input.limit as number));
  }
  async #enqueueContentProductionRuntime(input: Readonly<Record<string, unknown>>) { return this.dependencies.productionRuntime.enqueue(validate(input, this.#productionRuntimeEnqueueValidator, "Production Runtime enqueue request")); }
  async #runProductionRuntimeOnce(input: Readonly<Record<string, unknown>>) {
    if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Production Runtime run request is invalid");
    return this.dependencies.productionRuntime.runOnce(async (job) => {
      const response = await this.execute({ actorId: this.dependencies.actorId, commandId: productionRuntimeCommandId(job.jobId), contractVersion: "1", input: { brief: job.brief }, operation: "PRODUCE_METODO_VELOCE_CONTENT", workspaceId: this.dependencies.workspaceId });
      if (!record(response.result) || !safeId(response.result.productionId)) throw new RepositoryValidationError("Production Runtime content result is invalid");
      return response.result.productionId;
    });
  }
  async #productionRuntimeHealth(input: Readonly<Record<string, unknown>>) { if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Production Runtime health request is invalid"); return this.dependencies.productionRuntime.health(); }
  async #ownedContentProduction(repository: MetodoVeloceContentProductionRepository, productionId: string): Promise<MetodoVeloceContentProductionRecord> {
    const record = await repository.getById(productionId);
    if (record === undefined) throw new RepositoryConflictError("Metodo Veloce content production does not exist");
    if (record.actorId !== this.dependencies.actorId || record.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Metodo Veloce content production ownership is unauthorized");
    return record;
  }

  async #resourceInstanceId(command: LocalWorkflowCommand): Promise<string | undefined> {
    const input = command.input;
    if (["CREATE_MISSION", "PLAN_MISSION", "CREATE_WORKFLOW", "PRODUCE_METODO_VELOCE_CONTENT", "INSPECT_METODO_VELOCE_CONTENT", "REVIEW_METODO_VELOCE_CONTENT", "SCHEDULE_METODO_VELOCE_CONTENT", "RECORD_METODO_VELOCE_CONTENT_METRICS", "ARCHIVE_METODO_VELOCE_CONTENT", "LIST_METODO_VELOCE_CONTENT_QUEUE", "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION", "RUN_PRODUCTION_RUNTIME_ONCE", "GET_PRODUCTION_RUNTIME_HEALTH", "INSPECT_AUDIT_EVENTS"].includes(command.operation)) return undefined;
    if (typeof input.instanceId === "string") return input.instanceId;
    if (record(input.checkpoint) && typeof input.checkpoint.instanceId === "string") return input.checkpoint.instanceId;
    if (record(input.boundaryRequest) && typeof input.boundaryRequest.instanceId === "string") return input.boundaryRequest.instanceId;
    if (typeof input.invocationId === "string") return this.dependencies.repositories.transaction(async ({ workflows }) => (await workflows.agentInvocations.getById(input.invocationId as string))?.instanceId);
    return undefined;
  }

  async #assertOwnership(instanceId: string): Promise<void> { const ownership = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getOwnership(instanceId)); if (ownership?.workspaceId !== this.dependencies.workspaceId || ownership.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Local Workflow resource ownership is unauthorized"); }
}

function action(operation: LocalWorkflowOperation, input: Readonly<Record<string, unknown>>, result: unknown): string {
  if (operation === "GET_OPERATOR_REPORT" && record(result) && typeof result.nextAction === "string") return result.nextAction;
  if (operation === "CREATE_MISSION") return `Plan validated Mission Brief ${nestedId(input, "brief", "briefId") ?? "mission"}.`;
  if (operation === "PLAN_MISSION") return "Create a durable Workflow from the validated Mission Plan.";
  if (operation === "CREATE_WORKFLOW") return `Request the Operator Workflow Report for Workflow ${nestedId(input, "instance", "instanceId") ?? "unknown"}.`;
  if (operation === "PRODUCE_METODO_VELOCE_CONTENT" || operation === "INSPECT_METODO_VELOCE_CONTENT") return `Request Fabio review for Metodo Veloce content package ${operation === "PRODUCE_METODO_VELOCE_CONTENT" ? nestedId(input, "brief", "productionId") ?? "unknown" : id(input.productionId)}.`;
  if (operation === "REVIEW_METODO_VELOCE_CONTENT") return record(result) && result.status === "APPROVED_FOR_SCHEDULING" ? `Schedule Metodo Veloce content package ${id(input.productionId)}.` : `Keep archived Metodo Veloce content package ${id(input.productionId)} out of the publication queue.`;
  if (operation === "SCHEDULE_METODO_VELOCE_CONTENT") return `Await Fabio's separate publication decision for scheduled Metodo Veloce content package ${id(input.productionId)}.`;
  if (operation === "RECORD_METODO_VELOCE_CONTENT_METRICS") return `Review declared metrics for Metodo Veloce content package ${id(input.productionId)}; this did not publish anything.`;
  if (operation === "ARCHIVE_METODO_VELOCE_CONTENT") return `Keep archived Metodo Veloce content package ${id(input.productionId)} out of the active queue.`;
  if (operation === "LIST_METODO_VELOCE_CONTENT_QUEUE") return "Review the durable Metodo Veloce content production queue and choose one explicit next action.";
  if (operation === "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION") return `Run the controlled Production Runtime worker for job ${id(input.jobId)} when its schedule is due.`;
  if (operation === "RUN_PRODUCTION_RUNTIME_ONCE") return record(result) && result.status === "IDLE" ? "No due preparation job exists; inspect Production Runtime health." : "Review the completed or retrying Production Runtime job; no external action was executed.";
  if (operation === "GET_PRODUCTION_RUNTIME_HEALTH") return record(result) && result.status === "ATTENTION_REQUIRED" ? "Inspect the Production Runtime dead-letter queue before scheduling additional work." : "Production Runtime is healthy; run one controlled worker tick when due work exists.";
  if (operation === "INSPECT_WORKFLOW") return `Request the Operator Workflow Report for Workflow ${id(input.instanceId)}.`;
  if (operation === "EVALUATE_READINESS") return `Request the next controlled candidate for Workflow ${id(input.instanceId)} at version ${number(input.expectedVersion)}.`;
  if (operation === "GET_NEXT_CANDIDATE") return record(result) && result.status === "CANDIDATE_AVAILABLE" ? `Invoke the controlled candidate for step ${nestedId(result, "candidate", "stepId") ?? "unknown"}.` : `Resolve the reported candidate blockers for Workflow ${id(input.instanceId)}.`;
  if (operation === "RECORD_APPROVAL" || operation === "RECORD_GUARDIAN") return `Evaluate readiness for Workflow ${nestedId(input, "checkpoint", "instanceId") ?? "unknown"} at version ${nestedNumber(input, "checkpoint", "instanceVersion")}.`;
  if (operation === "INVOKE_AGENT") return `Inspect Agent result ${record(result) && record(result.receipt) && typeof result.receipt.invocationId === "string" ? result.receipt.invocationId : id(input.invocationId)}.`;
  if (operation === "INSPECT_AGENT_RESULT") return `Explicitly accept or reject Agent result ${id(input.invocationId)}.`;
  if (operation === "ACCEPT_OUTCOME" || operation === "REJECT_OUTCOME") return `Request the Operator Workflow Report for Workflow ${record(result) && record(result.receipt) && typeof result.receipt.instanceId === "string" ? result.receipt.instanceId : "unknown"}.`;
  if (operation === "INSPECT_AUDIT_EVENTS") return `No state change occurred; audit inspection for ${id(input.correlationId)} is complete.`;
  const instanceId = typeof input.instanceId === "string" ? input.instanceId : record(result) && record(result.record) && typeof result.record.instanceId === "string" ? result.record.instanceId : "unknown";
  return `Request the Operator Workflow Report for Workflow ${instanceId}.`;
}
function id(value: unknown): string { return typeof value === "string" ? value : "unknown"; }
function productionRuntimeCommandId(jobId: string): string { return `runtime-produce-${createHash("sha256").update(jobId, "utf8").digest("hex").slice(0, 24)}`; }
function number(value: unknown): string { return typeof value === "number" ? String(value) : "unknown"; }
function nestedId(input: Readonly<Record<string, unknown>>, parent: string, child: string): string | undefined { const value = input[parent]; return record(value) && typeof value[child] === "string" ? value[child] : undefined; }
function nestedNumber(input: Readonly<Record<string, unknown>>, parent: string, child: string): string { const value = input[parent]; return record(value) && typeof value[child] === "number" ? String(value[child]) : "unknown"; }
function requiredId(input: Readonly<Record<string, unknown>>, key: string): string { const value = input[key]; if (!safeId(value)) throw new RepositoryValidationError(`Local Workflow command ${key} is invalid`); return value; }
function requiredLimit(input: Readonly<Record<string, unknown>>): number { const value = input.limit; if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Local Workflow audit limit is invalid"); return value as number; }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: checked.issues.length }); return checked.value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key)); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function prohibited(value: string): boolean { return /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret|stack trace)/iu.test(value); }
function json(value: unknown): string | undefined { try { return jsonValue(value) ? JSON.stringify(value) : undefined; } catch { return undefined; } }
function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => jsonValue(entry));
  if (!record(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  return Object.values(value).every((entry) => jsonValue(entry));
}
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function replay(storedFingerprint: string, expectedFingerprint: string, response: LocalWorkflowCommandResponse): LocalWorkflowCommandResponse { if (storedFingerprint !== expectedFingerprint) throw new RepositoryConflictError("Local Workflow command ID conflicts with a prior command"); return freeze({ ...response, replayed: true }); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
