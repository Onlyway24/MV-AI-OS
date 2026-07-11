import { FounderMissionBriefValidator } from "../missions/founder-mission-brief-validator.js";
import type { LocalMissionPlanningDryRun } from "../missions/local-mission-planning-dry-run.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
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
export const LOCAL_WORKFLOW_OPERATIONS = Object.freeze(["CREATE_MISSION", "PLAN_MISSION", "CREATE_WORKFLOW", "INSPECT_WORKFLOW", "GET_OPERATOR_REPORT", "EVALUATE_READINESS", "GET_NEXT_CANDIDATE", "RECORD_APPROVAL", "RECORD_GUARDIAN", "INVOKE_AGENT", "INSPECT_AGENT_RESULT", "ACCEPT_OUTCOME", "REJECT_OUTCOME", "FAIL_STEP", "INSPECT_RETRY_ELIGIBILITY", "AUTHORIZE_RETRY", "EXECUTE_RETRY", "PAUSE_WORKFLOW", "RESUME_WORKFLOW", "CANCEL_WORKFLOW", "EVALUATE_TIMEOUT", "INSPECT_AUDIT_EVENTS"] as const);
export type LocalWorkflowOperation = typeof LOCAL_WORKFLOW_OPERATIONS[number];
export interface LocalWorkflowCommand { readonly contractVersion: "1"; readonly commandId: string; readonly actorId: string; readonly workspaceId: string; readonly operation: LocalWorkflowOperation; readonly input: Readonly<Record<string, unknown>>; }
export interface LocalWorkflowCommandResponse { readonly contractVersion: "1"; readonly status: "ok"; readonly operation: LocalWorkflowOperation; readonly commandId: string; readonly result: unknown; readonly nextAction: string; readonly unauthorizedExternalEffectOccurred: false; }

export interface LocalWorkflowCommandDependencies {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly missionPlanning: LocalMissionPlanningDryRun;
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
    if (!record(value) || Object.keys(value).length !== 6 || value.contractVersion !== "1" || !safeId(value.commandId) || !safeId(value.actorId) || !safeId(value.workspaceId) || !LOCAL_WORKFLOW_OPERATIONS.includes(value.operation as LocalWorkflowOperation) || !record(value.input) || JSON.stringify(value).length > 262_144 || prohibited(JSON.stringify(value))) return validationFailure([{ code: "invalid_value", message: "Local Workflow command is invalid", path: "$" }]);
    return validationSuccess(freeze(structuredClone(value as unknown as LocalWorkflowCommand)));
  }
}

export class LocalWorkflowCommandBoundary {
  readonly #validator = new LocalWorkflowCommandValidator();
  readonly #missionValidator = new FounderMissionBriefValidator();
  readonly #definitionValidator = new WorkflowDefinitionValidator();
  readonly #instanceValidator = new WorkflowInstanceValidator();
  public constructor(private readonly dependencies: LocalWorkflowCommandDependencies) {}

  public async execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
    const valid = validate(command, this.#validator, "Local Workflow command");
    if (valid.actorId !== this.dependencies.actorId || valid.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Local Workflow command identity is unauthorized");
    if (typeof valid.input.commandId === "string" && valid.input.commandId !== valid.commandId) throw new RepositoryConflictError("Local Workflow command ID does not match the operation request");
    const result = await this.#dispatch(valid);
    const response = { commandId: valid.commandId, contractVersion: "1" as const, nextAction: action(valid.operation, valid.input, result), operation: valid.operation, result, status: "ok" as const, unauthorizedExternalEffectOccurred: false as const };
    if (JSON.stringify(response).length > 524_288 || prohibited(JSON.stringify(response))) throw new RepositoryValidationError("Local Workflow command response is unsafe or too large");
    return freeze(response);
  }

  async #dispatch(command: LocalWorkflowCommand): Promise<unknown> {
    const input = command.input;
    switch (command.operation) {
      case "CREATE_MISSION": return validate(input.brief, this.#missionValidator, "Founder Mission Brief");
      case "PLAN_MISSION": return this.dependencies.missionPlanning.run({ brief: validate(input.brief, this.#missionValidator, "Founder Mission Brief"), contractVersion: "1" });
      case "CREATE_WORKFLOW": return this.#createWorkflow(input.definition, input.instance);
      case "INSPECT_WORKFLOW": return this.dependencies.repositories.transaction(async ({ workflows }) => { const instance = await workflows.instances.getById(requiredId(input, "instanceId")); if (instance === undefined) throw new RepositoryConflictError("Inspected Workflow does not exist"); return instance; });
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
      case "INSPECT_AUDIT_EVENTS": return this.dependencies.repositories.transaction(({ audits }) => audits.listByCorrelationId(requiredId(input, "correlationId"))).then((events) => events.slice(0, requiredLimit(input)));
    }
  }

  async #createWorkflow(definitionInput: unknown, instanceInput: unknown): Promise<{ readonly created: boolean }> {
    const definition = validate(definitionInput, this.#definitionValidator, "Workflow definition");
    const instance = validate(instanceInput, this.#instanceValidator, "Workflow instance");
    if (instance.definitionId !== definition.definitionId || instance.version !== 0 || instance.receipts.length !== 0 || definition.steps.length !== instance.steps.length || definition.steps.some((step, index) => step.stepId !== instance.steps[index]?.stepId)) throw new RepositoryValidationError("Created Workflow identity is invalid");
    return this.dependencies.repositories.transaction(async ({ workflows }) => {
      const existingDefinition = await workflows.definitions.getById(definition.definitionId);
      const existingInstance = await workflows.instances.getById(instance.instanceId);
      if (existingDefinition !== undefined || existingInstance !== undefined) {
        if (JSON.stringify(existingDefinition) === JSON.stringify(definition) && JSON.stringify(existingInstance) === JSON.stringify(instance)) return freeze({ created: false });
        throw new RepositoryConflictError("Created Workflow conflicts with durable state");
      }
      await workflows.definitions.insert(definition);
      await workflows.instances.insert(instance);
      return freeze({ created: true });
    });
  }
}

function action(operation: LocalWorkflowOperation, input: Readonly<Record<string, unknown>>, result: unknown): string {
  if (operation === "GET_OPERATOR_REPORT" && record(result) && typeof result.nextAction === "string") return result.nextAction;
  if (operation === "CREATE_MISSION") return `Plan validated Mission Brief ${nestedId(input, "brief", "briefId") ?? "mission"}.`;
  if (operation === "PLAN_MISSION") return "Create a durable Workflow from the validated Mission Plan.";
  if (operation === "CREATE_WORKFLOW") return `Request the Operator Workflow Report for Workflow ${nestedId(input, "instance", "instanceId") ?? "unknown"}.`;
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
function number(value: unknown): string { return typeof value === "number" ? String(value) : "unknown"; }
function nestedId(input: Readonly<Record<string, unknown>>, parent: string, child: string): string | undefined { const value = input[parent]; return record(value) && typeof value[child] === "string" ? value[child] : undefined; }
function nestedNumber(input: Readonly<Record<string, unknown>>, parent: string, child: string): string { const value = input[parent]; return record(value) && typeof value[child] === "number" ? String(value[child]) : "unknown"; }
function requiredId(input: Readonly<Record<string, unknown>>, key: string): string { const value = input[key]; if (!safeId(value)) throw new RepositoryValidationError(`Local Workflow command ${key} is invalid`); return value; }
function requiredLimit(input: Readonly<Record<string, unknown>>): number { const value = input.limit; if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Local Workflow audit limit is invalid"); return value as number; }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: checked.issues.length }); return checked.value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function prohibited(value: string): boolean { return /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret|stack trace)/iu.test(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
