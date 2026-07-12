import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { ValidationResult, Validator } from "../../validation/validation.js";
import { validationFailure, validationSuccess } from "../../validation/validation.js";
import type { WorkflowGuardianCheckpoint } from "./workflow-control-checkpoint.js";
import type { WorkflowLifecycleRecord } from "./workflow-lifecycle.js";
import type { WorkflowStepDefinition, WorkflowStepInstance } from "./workflow-runtime.js";

export const WORKFLOW_OPERATOR_REPORT_CONTRACT_VERSION = "1" as const;
const EVIDENCE_LIMIT = 100;
const REQUIRED_GUARDIAN_DOMAINS = Object.freeze(["operator_safety", "quality"] as const);

export interface WorkflowOperatorReportRequest { readonly contractVersion: "1"; readonly expectedVersion: number; readonly instanceId: string; readonly maxItems: number; }
export interface WorkflowOperatorStepReport { readonly stepId: string; readonly status: WorkflowStepInstance["status"]; readonly reasons: readonly string[]; }
export interface WorkflowOperatorReport {
  readonly contractVersion: "1";
  readonly definitionId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly mission: { readonly objective: string; readonly evidenceAvailable: boolean };
  readonly overallStatus: "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED" | "PAUSED";
  readonly progress: { readonly completedSteps: number; readonly totalSteps: number; readonly criticalPath: string };
  readonly completedSteps: readonly WorkflowOperatorStepReport[];
  readonly readySteps: readonly WorkflowOperatorStepReport[];
  readonly blockedSteps: readonly WorkflowOperatorStepReport[];
  readonly pendingSteps: readonly WorkflowOperatorStepReport[];
  readonly failedSteps: readonly WorkflowOperatorStepReport[];
  readonly approvals: readonly { readonly stepId: string; readonly status: "APPROVED" | "REQUIRED" | "NOT_REQUIRED"; readonly evidenceId?: string }[];
  readonly guardians: readonly { readonly stepId: string; readonly status: "BLOCKED" | "CLEAR" | "REQUIRED" | "NOT_REQUIRED"; readonly evidenceId?: string; readonly domain?: string; readonly remediationRequired: boolean }[];
  readonly risks: readonly string[];
  readonly retry: { readonly stepId?: string; readonly failureId?: string; readonly retryable: boolean; readonly attemptsUsed: number; readonly attemptsRemaining: number; readonly authorization: "AUTHORIZED" | "DENIED" | "NOT_REQUESTED" | "NOT_APPLICABLE"; readonly executionPending: boolean };
  readonly timeoutEvaluationRequired: boolean;
  readonly lastDurableEvent?: { readonly eventId: string; readonly occurredAt: string; readonly summary: string };
  readonly costSummary: { readonly available: false; readonly reason: string };
  readonly effortSummary: { readonly available: false; readonly reason: string };
  readonly externalActions: { readonly unauthorizedActionOccurred: false; readonly evidenceComplete: boolean; readonly statement: string };
  readonly nextAction: string;
  readonly truncated: boolean;
  readonly nonExecuting: true;
}

export class WorkflowOperatorReportRequestValidator implements Validator<WorkflowOperatorReportRequest> {
  public validate(value: unknown): ValidationResult<WorkflowOperatorReportRequest> {
    if (!record(value) || Object.keys(value).length !== 4 || value.contractVersion !== "1" || !safeId(value.instanceId) || !version(value.expectedVersion) || !Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1 || (value.maxItems as number) > 100) return invalid("Workflow operator report request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowOperatorReportRequest)));
  }
}

export class WorkflowOperatorReportValidator implements Validator<WorkflowOperatorReport> {
  public validate(value: unknown): ValidationResult<WorkflowOperatorReport> {
    if (!record(value) || value.contractVersion !== "1" || value.nonExecuting !== true || !safeId(value.definitionId) || !safeId(value.workflowId) || !safeId(value.workflowVersion) || !safeId(value.instanceId) || !version(value.instanceVersion) || !["ACTIVE", "CANCELLED", "COMPLETED", "FAILED", "PAUSED"].includes(value.overallStatus as string) || typeof value.nextAction !== "string" || value.nextAction.length < 1 || value.nextAction.length > 500 || !record(value.mission) || typeof value.mission.objective !== "string" || typeof value.mission.evidenceAvailable !== "boolean" || !record(value.progress) || !Array.isArray(value.completedSteps) || !Array.isArray(value.readySteps) || !Array.isArray(value.blockedSteps) || !Array.isArray(value.pendingSteps) || !Array.isArray(value.failedSteps) || !Array.isArray(value.approvals) || !Array.isArray(value.guardians) || !Array.isArray(value.risks) || !record(value.retry) || !record(value.externalActions) || value.externalActions.unauthorizedActionOccurred !== false || typeof value.externalActions.evidenceComplete !== "boolean" || value.truncated !== Boolean(value.truncated)) return invalid("Workflow operator report is invalid");
    const json = JSON.stringify(value);
    if (json.length > 131_072 || /(?:sk-[a-z0-9]|rawPrompt|rawCompletion|providerPayload|secret|stack trace)/iu.test(json)) return invalid("Workflow operator report contains prohibited material");
    return validationSuccess(freeze(structuredClone(value as unknown as WorkflowOperatorReport)));
  }
}

export class RepositoryBackedWorkflowOperatorReportService {
  readonly #requestValidator = new WorkflowOperatorReportRequestValidator();
  readonly #reportValidator = new WorkflowOperatorReportValidator();
  public constructor(private readonly repositories: RepositoryTransactionRunner) {}

  public create(request: WorkflowOperatorReportRequest): Promise<WorkflowOperatorReport> {
    const valid = validate(request, this.#requestValidator, "Workflow operator report request");
    return this.repositories.transaction(async ({ workflows }) => {
      const instance = await workflows.instances.getById(valid.instanceId);
      if (instance?.version !== valid.expectedVersion) throw new RepositoryConflictError("Workflow operator report snapshot is stale or missing");
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) throw new RepositoryValidationError("Workflow operator report definition is missing");
      const workflowEvents = await workflows.events.listByInstanceId(instance.instanceId, EVIDENCE_LIMIT);
      const invocations = await workflows.agentInvocations.listByInstanceId(instance.instanceId, EVIDENCE_LIMIT);
      const stepEvidence = await Promise.all(definition.steps.map(async (step) => {
        const approvals = await workflows.approvals.listBySnapshot(instance.instanceId, instance.version, step.stepId);
        const guardians = await workflows.guardians.listBySnapshot(instance.instanceId, instance.version, step.stepId);
        const durableApprovals = []; for (const checkpoint of approvals) if (await workflows.controlEvents.getByCheckpoint("APPROVAL", checkpoint.evidenceId) !== undefined) durableApprovals.push(checkpoint);
        const durableGuardians: WorkflowGuardianCheckpoint[] = []; for (const checkpoint of guardians) if (await workflows.controlEvents.getByCheckpoint("GUARDIAN", checkpoint.evidenceId) !== undefined) durableGuardians.push(checkpoint);
        return { approvals: durableApprovals, guardians: durableGuardians, lifecycle: await workflows.lifecycleRecords.listByStep(instance.instanceId, step.stepId, EVIDENCE_LIMIT), step, state: instance.steps.find(({ stepId }) => stepId === step.stepId) };
      }));
      if (stepEvidence.some(({ state }) => state === undefined)) throw new RepositoryValidationError("Workflow operator report Step state is inconsistent");
      const controls = stepEvidence.map((entry) => controlState(entry.step, entry.approvals.at(-1), entry.guardians, entry.state?.status));
      const stepReports = stepEvidence.map((entry, index) => {
        const control = controls[index];
        if (entry.state === undefined || control === undefined) throw new RepositoryValidationError("Workflow operator report Step state is inconsistent");
        return stepReport(entry.state, entry.step, control);
      });
      const completedSteps = stepReports.filter(({ status }) => status === "SUCCEEDED");
      const failedSteps = stepReports.filter(({ status }) => status === "FAILED");
      const readySteps = stepReports.filter(({ status, reasons }) => status === "READY" && reasons.length === 0);
      const blockedSteps = stepReports.filter(({ reasons, status }) => reasons.length > 0 && status !== "FAILED" && status !== "CANCELLED");
      const pendingSteps = stepReports.filter(({ status, reasons }) => status === "PENDING" && reasons.length === 0);
      const lifecycle = stepEvidence.flatMap((entry) => entry.lifecycle);
      const retry = retryState(lifecycle, failedSteps[0]?.stepId);
      const rawRisks = [...blockedSteps.flatMap(({ stepId, reasons }) => reasons.map((reason) => `${stepId}: ${reason}`)), ...failedSteps.map(({ stepId }) => `${stepId}: failed`)];
      const risks = bounded(rawRisks, valid.maxItems);
      const lastDurableEvent = latestEvent(workflowEvents.map((event) => ({ eventId: event.eventId, occurredAt: event.occurredAt, summary: event.commandKind })), lifecycle.map((entry) => ({ eventId: entry.recordId, occurredAt: entry.recordedAt, summary: entry.kind })), invocations.map((entry) => ({ eventId: entry.invocationId, occurredAt: entry.completedAt ?? entry.reservedAt, summary: `INVOCATION_${entry.status}` })));
      const evidenceComplete = workflowEvents.length < EVIDENCE_LIMIT && invocations.length < EVIDENCE_LIMIT && stepEvidence.every(({ lifecycle: records }) => records.length < EVIDENCE_LIMIT);
      const actionableInvocations = invocations.filter((invocation) => instance.steps.find(({ stepId }) => stepId === invocation.stepId)?.status === "AWAITING_RESULT");
      const report: WorkflowOperatorReport = {
        approvals: controls.map(({ approval }, index) => ({ ...approval, stepId: definition.steps[index]?.stepId ?? "unknown" })),
        blockedSteps: bounded(blockedSteps, valid.maxItems),
        completedSteps: bounded(completedSteps, valid.maxItems),
        contractVersion: "1",
        costSummary: { available: false, reason: "No durable Workflow cost evidence is available." },
        definitionId: definition.definitionId,
        effortSummary: { available: false, reason: "No durable Workflow effort estimate is available." },
        externalActions: { evidenceComplete, statement: "Durable Workflow evidence records no unauthorized external action.", unauthorizedActionOccurred: false },
        failedSteps: bounded(failedSteps, valid.maxItems),
        guardians: controls.map(({ guardian }, index) => ({ ...guardian, stepId: definition.steps[index]?.stepId ?? "unknown" })),
        instanceId: instance.instanceId,
        instanceVersion: instance.version,
        ...(lastDurableEvent === undefined ? {} : { lastDurableEvent }),
        mission: { evidenceAvailable: definition.missionObjective !== undefined, objective: definition.missionObjective ?? `Mission objective unavailable for ${definition.workflowId}.` },
        nextAction: nextAction(instance.status, instance.version, controls, stepReports, readySteps, failedSteps, retry, actionableInvocations),
        nonExecuting: true,
        overallStatus: instance.status,
        pendingSteps: bounded(pendingSteps, valid.maxItems),
        progress: { completedSteps: completedSteps.length, criticalPath: criticalPath(definition.steps, completedSteps), totalSteps: definition.steps.length },
        readySteps: bounded(readySteps, valid.maxItems),
        retry,
        risks,
        timeoutEvaluationRequired: actionableInvocations.some(({ status }) => status === "RESERVED"),
        truncated: !evidenceComplete || [completedSteps, readySteps, blockedSteps, pendingSteps, failedSteps, rawRisks].some((items) => items.length > valid.maxItems),
        workflowId: definition.workflowId,
        workflowVersion: definition.workflowVersion,
      };
      return validate(report, this.#reportValidator, "Workflow operator report");
    });
  }
}

export function createWorkflowOperatorReportService(repositories: RepositoryTransactionRunner): RepositoryBackedWorkflowOperatorReportService { return new RepositoryBackedWorkflowOperatorReportService(repositories); }

interface ControlState { readonly stepId: string; readonly approval: { readonly status: "APPROVED" | "REQUIRED" | "NOT_REQUIRED"; readonly evidenceId?: string }; readonly guardian: { readonly status: "BLOCKED" | "CLEAR" | "REQUIRED" | "NOT_REQUIRED"; readonly evidenceId?: string; readonly domain?: string; readonly remediationRequired: boolean } }
function controlState(step: WorkflowStepDefinition, approval: { readonly evidenceId: string; readonly status: string } | undefined, guardians: readonly WorkflowGuardianCheckpoint[], stepStatus?: WorkflowStepInstance["status"]): ControlState { const terminal = stepStatus === "SUCCEEDED" || stepStatus === "CANCELLED"; const latestByDomain = new Map<string, WorkflowGuardianCheckpoint>(); for (const guardian of guardians) latestByDomain.set(guardian.domain, guardian); const required = REQUIRED_GUARDIAN_DOMAINS.map((domain) => latestByDomain.get(domain)); const blocked = required.find((entry) => entry?.status === "BLOCKED"); const missingDomain = REQUIRED_GUARDIAN_DOMAINS.find((domain) => latestByDomain.get(domain)?.status !== "CLEAR"); const guardianState: ControlState["guardian"] = terminal ? { remediationRequired: false, status: "NOT_REQUIRED" } : blocked !== undefined ? { domain: blocked.domain, evidenceId: blocked.evidenceId, remediationRequired: true, status: "BLOCKED" } : missingDomain === undefined ? { domain: "quality", evidenceId: requiredGuardianEvidenceId(latestByDomain, "quality"), remediationRequired: false, status: "CLEAR" } : { domain: missingDomain, ...(latestByDomain.get(missingDomain) === undefined ? {} : { evidenceId: requiredGuardianEvidenceId(latestByDomain, missingDomain) }), remediationRequired: true, status: "REQUIRED" }; return { stepId: step.stepId, approval: terminal || !step.approvalRequired ? { status: "NOT_REQUIRED" } : approval?.status === "APPROVED" ? { evidenceId: approval.evidenceId, status: "APPROVED" } : { ...(approval === undefined ? {} : { evidenceId: approval.evidenceId }), status: "REQUIRED" }, guardian: guardianState }; }
function requiredGuardianEvidenceId(values: ReadonlyMap<string, WorkflowGuardianCheckpoint>, domain: string): string { const evidenceId = values.get(domain)?.evidenceId; if (evidenceId === undefined) throw new RepositoryValidationError("Workflow operator report Guardian evidence is inconsistent"); return evidenceId; }
function stepReport(state: WorkflowStepInstance, definition: WorkflowStepDefinition, control: ControlState): WorkflowOperatorStepReport { const reasons: string[] = []; if (definition.approvalRequired && control.approval.status !== "APPROVED") reasons.push("Fabio approval required"); if (control.guardian.status !== "CLEAR" && control.guardian.status !== "NOT_REQUIRED") reasons.push(control.guardian.status === "BLOCKED" ? `Guardian ${control.guardian.domain ?? "review"} requires remediation` : `Guardian ${control.guardian.domain ?? "review"} decision required`); if (state.blockers.some(({ code }) => code === "DEPENDENCY_INCOMPLETE")) reasons.push("Dependency incomplete"); if (state.status === "AWAITING_RESULT") reasons.push("Agent result is awaiting explicit review or timeout evaluation"); return freeze({ reasons: Object.freeze(reasons), status: state.status, stepId: state.stepId }); }
function retryState(records: readonly WorkflowLifecycleRecord[], failedStepId?: string): WorkflowOperatorReport["retry"] { const failures = records.filter((entry) => entry.kind === "FAILURE"); const failure = failures.at(-1); if (failure === undefined) return { attemptsRemaining: 0, attemptsUsed: 0, authorization: "NOT_APPLICABLE", executionPending: false, retryable: false }; const authorization = records.filter((entry) => entry.kind === "RETRY_AUTHORIZATION" && entry.failureId === failure.recordId).at(-1); const execution = records.some((entry) => entry.kind === "RETRY_EXECUTION" && entry.failureId === failure.recordId); const retryable = failure.retryable === true && (failure.attempt ?? 0) < (failure.maxAttempts ?? 0); return { attemptsRemaining: Math.max(0, (failure.maxAttempts ?? 0) - (failure.attempt ?? 0)), attemptsUsed: failure.attempt ?? 0, authorization: authorization === undefined ? "NOT_REQUESTED" : authorization.retryDecision === "AUTHORIZED" ? "AUTHORIZED" : "DENIED", executionPending: authorization?.retryDecision === "AUTHORIZED" && !execution, failureId: failure.recordId, retryable, stepId: failedStepId ?? failure.stepId }; }
function nextAction(status: WorkflowOperatorReport["overallStatus"], version: number, controls: readonly ControlState[], reports: readonly WorkflowOperatorStepReport[], ready: readonly WorkflowOperatorStepReport[], failed: readonly WorkflowOperatorStepReport[], retry: WorkflowOperatorReport["retry"], invocations: readonly { readonly invocationId: string; readonly status: string }[]): string { if (status === "COMPLETED") return "No action required because the Workflow completed successfully."; if (status === "CANCELLED") return "No action required because the Workflow is cancelled."; if (status === "PAUSED") return `Resume the Workflow at version ${String(version)}.`; if (status === "FAILED") { if (!retry.retryable) return `Inspect failure ${retry.failureId ?? "unknown"} for step ${failed[0]?.stepId ?? "unknown"}; retry is unavailable.`; if (retry.authorization === "NOT_REQUESTED") return `Authorize retry attempt ${String(retry.attemptsUsed + 1)} of ${String(retry.attemptsUsed + retry.attemptsRemaining)} for step ${retry.stepId ?? "unknown"}.`; if (retry.executionPending) return `Execute authorized retry for failure ${retry.failureId ?? "unknown"} on step ${retry.stepId ?? "unknown"}.`; if (retry.authorization === "DENIED") return `Correct failure ${retry.failureId ?? "unknown"} for step ${retry.stepId ?? "unknown"}; retry authorization is denied.`; return `Inspect retry evidence for step ${retry.stepId ?? "unknown"}.`; } const reserved = invocations.find(({ status: invocationStatus }) => invocationStatus === "RESERVED"); if (reserved !== undefined) return `Evaluate timeout or recover reserved invocation ${reserved.invocationId}.`; const completed = invocations.find(({ status: invocationStatus }) => invocationStatus === "COMPLETED"); if (completed !== undefined) return `Inspect and explicitly accept or reject Agent result ${completed.invocationId}.`; const eligible = new Set(reports.filter(({ reasons, status: stepStatus }) => stepStatus !== "SUCCEEDED" && stepStatus !== "CANCELLED" && !reasons.includes("Dependency incomplete")).map(({ stepId }) => stepId)); const approval = controls.find((entry) => eligible.has(entry.stepId) && entry.approval.status === "REQUIRED"); if (approval !== undefined) return `Record Fabio approval for step ${approval.stepId} at Workflow version ${String(version)}.`; const guardian = controls.find((entry) => eligible.has(entry.stepId) && (entry.guardian.status === "BLOCKED" || entry.guardian.status === "REQUIRED")); if (guardian !== undefined) return guardian.guardian.status === "BLOCKED" ? `Review and remediate the ${guardian.guardian.domain ?? "Guardian"} finding for step ${guardian.stepId}.` : `Record the required ${guardian.guardian.domain ?? "Guardian"} Guardian decision for step ${guardian.stepId} at Workflow version ${String(version)}.`; if (ready[0] !== undefined) return `Select and invoke the controlled candidate for step ${ready[0].stepId} at Workflow version ${String(version)}.`; return `Evaluate Workflow readiness at version ${String(version)}.`; }
function criticalPath(steps: readonly WorkflowStepDefinition[], completed: readonly WorkflowOperatorStepReport[]): string { const done = new Set(completed.map(({ stepId }) => stepId)); const remaining = steps.filter(({ stepId }) => !done.has(stepId)).map(({ stepId }) => stepId); return remaining.length === 0 ? "complete" : `remaining steps in declared order: ${remaining.join(" -> ")}`; }
function latestEvent(...groups: readonly (readonly { readonly eventId: string; readonly occurredAt: string; readonly summary: string }[])[]): { readonly eventId: string; readonly occurredAt: string; readonly summary: string } | undefined { return groups.flat().sort((a, b) => a.occurredAt === b.occurredAt ? a.eventId.localeCompare(b.eventId) : a.occurredAt.localeCompare(b.occurredAt)).at(-1); }
function bounded<T>(items: readonly T[], limit: number): readonly T[] { return Object.freeze(items.slice(0, limit)); }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
