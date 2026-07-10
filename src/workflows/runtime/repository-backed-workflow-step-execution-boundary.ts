import type { AgentSpecification } from "../../agents/specification/agent-specification.js";
import type { AgentSpecificationRegistry } from "../../agents/specification/agent-specification-registry.js";
import type {
  AgentCompanyCapability,
  AgentCompanyCapabilityRegistry,
} from "../../assistants/agent-capability-registry.js";
import type {
  AgentCompanyPermissionMatrix,
  AgentCompanyPermissionRule,
} from "../../assistants/agent-permission-matrix.js";
import type { AgentCompanyMap } from "../../assistants/agent-company-specification.js";
import type {
  ResponsibilityArea,
  ResponsibilityMatrix,
} from "../../assistants/inter-agent-responsibility-matrix.js";
import type { MainAssistantSafetyDomain } from "../../assistants/main-assistant-specification.js";
import { RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import {
  normalizedPermissions,
  type EffectivePermission,
} from "../../policy/effective-permissions.js";
import type { Validator } from "../../validation/validation.js";
import {
  DeterministicWorkflowReadinessEngine,
  isWorkflowReadinessEvaluationWithinBounds,
} from "./deterministic-workflow-readiness-engine.js";
import {
  assertWorkflowDefinitionMatchesInstance,
  assertWorkflowReceiptConsistency,
} from "./workflow-persistence-service.js";
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStepDefinition,
  WorkflowStepInstance,
} from "./workflow-runtime.js";
import type {
  WorkflowReadinessFinding,
  WorkflowReadinessRequest,
} from "./workflow-readiness.js";
import {
  WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION,
  freezeWorkflowStepExecutionBoundaryValue,
  type WorkflowApprovalEvidence,
  type WorkflowGuardianEvidence,
  type WorkflowStepAgentAssignment,
  type WorkflowStepExecutionBlocker,
  type WorkflowStepExecutionBoundary,
  type WorkflowStepExecutionBoundaryRequest,
  type WorkflowStepExecutionBoundaryResult,
} from "./workflow-step-execution-boundary.js";
import {
  WorkflowStepExecutionBoundaryRequestValidator,
  WorkflowStepExecutionBoundaryResultValidator,
} from "./workflow-step-execution-boundary-validator.js";

const TERMINAL_STEP_STATUSES = new Set(["CANCELLED", "FAILED", "SUCCEEDED"]);

export interface RepositoryBackedWorkflowStepExecutionBoundaryDependencies {
  readonly agentCompany: AgentCompanyMap;
  readonly agentSpecifications: AgentSpecificationRegistry;
  readonly capabilities: AgentCompanyCapabilityRegistry;
  readonly operatorActorId: string;
  readonly permissionMatrix: AgentCompanyPermissionMatrix;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<WorkflowStepExecutionBoundaryRequest>;
  readonly responsibilities: ResponsibilityMatrix;
  readonly resultValidator: Validator<WorkflowStepExecutionBoundaryResult>;
}

export class RepositoryBackedWorkflowStepExecutionBoundary
  implements WorkflowStepExecutionBoundary
{
  readonly #dependencies: RepositoryBackedWorkflowStepExecutionBoundaryDependencies;
  readonly #readinessEngine = new DeterministicWorkflowReadinessEngine();
  readonly #trustedRequestValidator = new WorkflowStepExecutionBoundaryRequestValidator();
  readonly #trustedResultValidator = new WorkflowStepExecutionBoundaryResultValidator();

  public constructor(
    dependencies: RepositoryBackedWorkflowStepExecutionBoundaryDependencies,
  ) {
    this.#dependencies = dependencies;
  }

  public async prepare(
    request: WorkflowStepExecutionBoundaryRequest,
  ): Promise<WorkflowStepExecutionBoundaryResult> {
    const validRequest = validate(
      validate(
        request,
        this.#dependencies.requestValidator,
        "Workflow step execution boundary request",
      ),
      this.#trustedRequestValidator,
      "Workflow step execution boundary request",
    );
    return this.#dependencies.repositories.transaction(async ({ workflows }) => {
      const instance = await workflows.instances.getById(validRequest.instanceId);
      if (instance === undefined) {
        return this.#result(blocked(validRequest, [
          { code: "WORKFLOW_INSTANCE_MISSING" },
        ]));
      }
      if (instance.version !== validRequest.expectedVersion) {
        return this.#result(blocked(validRequest, [
          { code: "STALE_WORKFLOW_VERSION" },
        ], instance.version));
      }
      const definition = await workflows.definitions.getById(instance.definitionId);
      if (definition === undefined) {
        return this.#result(blocked(validRequest, [
          { code: "WORKFLOW_DEFINITION_MISSING" },
        ], instance.version));
      }
      assertWorkflowDefinitionMatchesInstance(definition, instance);
      const receipts = await workflows.receipts.listByInstanceId(instance.instanceId);
      assertWorkflowReceiptConsistency(instance, receipts);
      if (!isWorkflowReadinessEvaluationWithinBounds(definition, instance)) {
        throw new RepositoryValidationError(
          "Workflow candidate evaluation exceeds supported bounds",
        );
      }
      if (definition.definitionId !== validRequest.expectedDefinitionId) {
        return this.#result(blocked(validRequest, [
          { code: "STALE_DEFINITION" },
        ], instance.version));
      }
      if (definition.workflowVersion !== validRequest.expectedWorkflowVersion) {
        return this.#result(blocked(validRequest, [
          { code: "STALE_WORKFLOW_VERSION" },
        ], instance.version));
      }

      const selected = selectStep(definition, instance, validRequest);
      if ("blocker" in selected) {
        return this.#result(blocked(validRequest, [selected.blocker], instance.version));
      }

      const declarations = resolveDeclarations(this.#dependencies, validRequest.agentAssignment);
      const blockers = [...declarations.blockers];
      const approval = evaluateApprovalEvidence(
        validRequest,
        definition,
        instance,
        selected.definition,
        declarations,
        this.#dependencies.operatorActorId,
      );
      blockers.push(...approval.blockers);
      const guardian = evaluateGuardianEvidence(
        validRequest,
        definition,
        instance,
        selected.definition,
        declarations.guardianDomains,
      );
      blockers.push(...guardian.blockers);
      blockers.push(...evaluatePolicy(validRequest, declarations));

      const readiness = this.#readinessEngine.evaluate(
        definition,
        instance,
        readinessRequest(
          validRequest,
          approval.satisfied ? selected.definition.stepId : undefined,
          guardian.satisfied ? selected.definition.stepId : undefined,
          definition.steps.length,
        ),
      );
      const finding = findFinding(readiness, selected.definition.stepId);
      if (finding === undefined) {
        throw new RepositoryValidationError(
          "Workflow readiness omitted the selected step",
        );
      }
      blockers.push(...readinessBlockers(finding));

      const uniqueBlockers = uniqueBoundedBlockers(blockers, validRequest.maxBlockers);
      if (
        uniqueBlockers.length > 0 ||
        declarations.specification === undefined ||
        declarations.area === undefined ||
        declarations.capabilities.length !== validRequest.agentAssignment.capabilityIds.length ||
        declarations.permissionRules.length !== validRequest.agentAssignment.permissionIds.length
      ) {
        return this.#result(
          blocked(
            validRequest,
            uniqueBlockers.length > 0
              ? uniqueBlockers
              : [{ code: "AGENT_SPECIFICATION_MISMATCH", stepId: selected.definition.stepId }],
            instance.version,
          ),
        );
      }

      return this.#result(freezeWorkflowStepExecutionBoundaryValue({
        blockers: [],
        candidate: {
          agentId: validRequest.agentAssignment.agentId,
          approvalEvidenceIds: sorted(approval.evidenceIds),
          capabilityIds: sorted(validRequest.agentAssignment.capabilityIds),
          capabilityTitles: sorted(
            declarations.capabilities.map(({ title }) => title),
          ),
          contractVersion: WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION,
          definitionId: definition.definitionId,
          guardianDomains: sorted(declarations.guardianDomains),
          guardianEvidenceIds: sorted(guardian.evidenceIds),
          instanceId: instance.instanceId,
          instanceVersion: instance.version,
          nonExecuting: true,
          permissionIds: sorted(validRequest.agentAssignment.permissionIds),
          requiredPolicyPermissions: declarations.requiredPolicyPermissions,
          responsibilityAreaId: declarations.area.areaId,
          responsibilityTitle: declarations.area.title,
          specificationId: validRequest.agentAssignment.specificationId,
          specificationVersion: declarations.specification.version,
          stepId: selected.definition.stepId,
          workflowId: definition.workflowId,
          workflowVersion: definition.workflowVersion,
        },
        contractVersion: WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION,
        nonExecuting: true,
        status: "CANDIDATE_AVAILABLE",
      }));
    });
  }

  #result(
    result: WorkflowStepExecutionBoundaryResult,
  ): WorkflowStepExecutionBoundaryResult {
    return validate(
      validate(
        result,
        this.#dependencies.resultValidator,
        "Workflow step execution boundary result",
      ),
      this.#trustedResultValidator,
      "Workflow step execution boundary result",
    );
  }
}

export function createWorkflowStepExecutionBoundary(
  dependencies: Omit<
    RepositoryBackedWorkflowStepExecutionBoundaryDependencies,
    "requestValidator" | "resultValidator"
  >,
): RepositoryBackedWorkflowStepExecutionBoundary {
  return new RepositoryBackedWorkflowStepExecutionBoundary({
    ...dependencies,
    requestValidator: new WorkflowStepExecutionBoundaryRequestValidator(),
    resultValidator: new WorkflowStepExecutionBoundaryResultValidator(),
  });
}

interface ResolvedDeclarations {
  readonly area?: ResponsibilityArea;
  readonly blockers: readonly WorkflowStepExecutionBlocker[];
  readonly capabilities: readonly AgentCompanyCapability[];
  readonly guardianDomains: readonly MainAssistantSafetyDomain[];
  readonly permissionRules: readonly AgentCompanyPermissionRule[];
  readonly requiredPolicyPermissions: readonly EffectivePermission[];
  readonly specification?: AgentSpecification;
  readonly approvalRequired: boolean;
}

function resolveDeclarations(
  dependencies: RepositoryBackedWorkflowStepExecutionBoundaryDependencies,
  assignment: WorkflowStepAgentAssignment,
): ResolvedDeclarations {
  const blockers: WorkflowStepExecutionBlocker[] = [];
  const role = dependencies.agentCompany.roles.find(
    ({ roleId }) => roleId === assignment.agentId,
  );
  const expectedSpecificationId = `${assignment.agentId}@${assignment.specificationVersion}`;
  const specification = dependencies.agentSpecifications.get(
    assignment.agentId,
    assignment.specificationVersion,
  );
  if (specification === undefined) {
    blockers.push({ code: "AGENT_SPECIFICATION_MISSING" });
  } else if (
    role === undefined ||
    assignment.specificationId !== expectedSpecificationId ||
    role.futureAgentSpecification.agentId !== assignment.agentId ||
    role.futureAgentSpecification.expectedStatus !== specification.status ||
    role.futureAgentSpecification.specificationId !== assignment.specificationId ||
    role.futureAgentSpecification.version !== assignment.specificationVersion ||
    specification.agentId !== assignment.agentId
  ) {
    blockers.push({ code: "AGENT_SPECIFICATION_MISMATCH" });
  }

  const area = dependencies.responsibilities.areas.find(
    ({ areaId }) => areaId === assignment.responsibilityAreaId,
  );
  if (!area?.primaryOwners.some((owner) => exactSubject(owner, assignment))) {
    blockers.push({ code: "RESPONSIBILITY_MISMATCH" });
  }

  const capabilities = assignment.capabilityIds.flatMap((capabilityId) => {
    const capability = dependencies.capabilities.capabilities.find(
      (candidate) => candidate.capabilityId === capabilityId,
    );
    if (
      capability === undefined ||
      !capability.futureWorkflow.compatible ||
      !capability.primaryOwners.some((owner) => exactSubject(owner, assignment))
    ) {
      blockers.push({ code: "CAPABILITY_MISMATCH" });
      return [];
    }
    return [capability];
  });
  const permissionRules = assignment.permissionIds.flatMap((permissionId) => {
    const rule = dependencies.permissionMatrix.permissionRules.find(
      (candidate) => candidate.permissionId === permissionId,
    );
    if (
      rule === undefined ||
      !assignment.capabilityIds.includes(rule.capabilityId) ||
      !exactSubject(rule.subject, assignment)
    ) {
      blockers.push({ code: "PERMISSION_DECLARATION_MISMATCH" });
      return [];
    }
    return [rule];
  });
  if (
    capabilities.some(
      ({ capabilityId }) =>
        !permissionRules.some((rule) => rule.capabilityId === capabilityId),
    )
  ) {
    blockers.push({ code: "PERMISSION_DECLARATION_MISMATCH" });
  }

  const requiredPolicyPermissions = normalizedPermissions([
    ...(specification?.capabilities
      .filter(({ required }) => required)
      .map(({ permission }) => permission) ?? []),
    `workflow:propose:${assignment.agentId}`,
  ]);
  const guardianDomains = sortedUnique([
    ...(role?.controlPlaneDependencies ?? []),
    ...capabilities.flatMap(({ guardianRequirements }) =>
      guardianRequirements.flatMap(({ domains }) => domains),
    ),
    ...permissionRules.flatMap(({ guardianRequirements }) =>
      guardianRequirements.flatMap(({ domains }) => domains),
    ),
  ]);
  return {
    approvalRequired:
      (role?.approvalRequirements.length ?? 0) > 0 ||
      area?.approvalRequired === true ||
      capabilities.some(({ approvalRequired }) => approvalRequired) ||
      permissionRules.some(({ approvalRequired }) => approvalRequired),
    ...(area === undefined ? {} : { area }),
    blockers,
    capabilities,
    guardianDomains,
    permissionRules,
    requiredPolicyPermissions,
    ...(specification === undefined ? {} : { specification }),
  };
}

function selectStep(
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  request: WorkflowStepExecutionBoundaryRequest,
):
  | { readonly definition: WorkflowStepDefinition; readonly instance: WorkflowStepInstance }
  | { readonly blocker: WorkflowStepExecutionBlocker } {
  const stepId = request.selection.mode === "EXACT_STEP"
    ? request.selection.stepId
    : instance.steps.find(({ status }) => !TERMINAL_STEP_STATUSES.has(status))?.stepId;
  if (stepId === undefined) {
    return { blocker: { code: "NO_ELIGIBLE_STEP" } };
  }
  const stepDefinition = definition.steps.find((step) => step.stepId === stepId);
  const stepInstance = instance.steps.find((step) => step.stepId === stepId);
  return stepDefinition === undefined || stepInstance === undefined
    ? { blocker: { code: "STEP_NOT_FOUND", stepId } }
    : { definition: stepDefinition, instance: stepInstance };
}

function evaluateApprovalEvidence(
  request: WorkflowStepExecutionBoundaryRequest,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  step: WorkflowStepDefinition,
  declarations: ResolvedDeclarations,
  operatorActorId: string,
): { readonly blockers: readonly WorkflowStepExecutionBlocker[]; readonly evidenceIds: readonly string[]; readonly satisfied: boolean } {
  const required = step.approvalRequired || declarations.approvalRequired;
  const relevant = request.approvalEvidence.filter(({ stepId }) => stepId === step.stepId);
  const allValid =
    request.approvalEvidence.length === relevant.length &&
    relevant.every((evidence) =>
      approvalMatches(evidence, definition, instance, step.stepId, operatorActorId),
    );
  if (!allValid || relevant.some(({ status }) => status !== "APPROVED")) {
    return {
      blockers: [{ code: "APPROVAL_INVALID", stepId: step.stepId }],
      evidenceIds: [],
      satisfied: false,
    };
  }
  if (required && relevant.length === 0) {
    return {
      blockers: [{ code: "APPROVAL_REQUIRED", stepId: step.stepId }],
      evidenceIds: [],
      satisfied: false,
    };
  }
  return {
    blockers: [],
    evidenceIds: relevant.map(({ evidenceId }) => evidenceId),
    satisfied: !step.approvalRequired || relevant.length > 0,
  };
}

function evaluateGuardianEvidence(
  request: WorkflowStepExecutionBoundaryRequest,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  step: WorkflowStepDefinition,
  domains: readonly MainAssistantSafetyDomain[],
): { readonly blockers: readonly WorkflowStepExecutionBlocker[]; readonly evidenceIds: readonly string[]; readonly satisfied: boolean } {
  const relevant = request.guardianEvidence.filter(({ stepId }) => stepId === step.stepId);
  const requiredDomains = step.guardianRequired || domains.length > 0
    ? domains.length > 0 ? domains : ["operator_safety" as const]
    : [];
  const bound = relevant.filter((evidence) =>
    guardianMatches(evidence, definition, instance, step.stepId),
  );
  const invalidBinding = request.guardianEvidence.length !== relevant.length || bound.length !== relevant.length;
  const duplicateDomains = new Set(bound.map(({ domain }) => domain)).size !== bound.length;
  const unsupportedDomain = bound.some(({ domain }) => !requiredDomains.includes(domain));
  if (invalidBinding || duplicateDomains || unsupportedDomain) {
    return {
      blockers: [{ code: "GUARDIAN_EVIDENCE_INVALID", stepId: step.stepId }],
      evidenceIds: [],
      satisfied: false,
    };
  }
  const blockers: WorkflowStepExecutionBlocker[] = [];
  for (const domain of requiredDomains) {
    const evidence = bound.find((candidate) => candidate.domain === domain);
    if (evidence === undefined) {
      blockers.push({ code: "GUARDIAN_REQUIRED", domain, stepId: step.stepId });
    } else if (evidence.status === "BLOCKED") {
      blockers.push({ code: "GUARDIAN_BLOCKED", domain, stepId: step.stepId });
    } else if (evidence.status !== "CLEAR") {
      blockers.push({ code: "GUARDIAN_EVIDENCE_INVALID", domain, stepId: step.stepId });
    }
  }
  return {
    blockers,
    evidenceIds: blockers.length === 0 ? bound.map(({ evidenceId }) => evidenceId) : [],
    satisfied: !step.guardianRequired || blockers.length === 0,
  };
}

function evaluatePolicy(
  request: WorkflowStepExecutionBoundaryRequest,
  declarations: ResolvedDeclarations,
): readonly WorkflowStepExecutionBlocker[] {
  const decision = request.policyDecision;
  if (
    decision.actorId !== request.actorId ||
    decision.workspaceId !== request.workspaceId ||
    decision.taskId !== request.instanceId ||
    decision.agent.agentId !== request.agentAssignment.agentId ||
    decision.agent.version !== request.agentAssignment.specificationVersion
  ) {
    return [{ code: "POLICY_MISMATCH" }];
  }
  const effective = new Set(decision.effectivePermissions);
  const requested = new Set(decision.requestedPermissions);
  return declarations.requiredPolicyPermissions.every(
    (permission) => requested.has(permission) && effective.has(permission),
  )
    ? []
    : [{ code: "POLICY_DENIED" }];
}

function approvalMatches(
  evidence: WorkflowApprovalEvidence,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  stepId: string,
  operatorActorId: string,
): boolean {
  return evidence.authorityActorId === operatorActorId &&
    evidence.definitionId === definition.definitionId &&
    evidence.instanceId === instance.instanceId &&
    evidence.instanceVersion === instance.version &&
    evidence.stepId === stepId &&
    evidence.workflowVersion === definition.workflowVersion;
}

function guardianMatches(
  evidence: WorkflowGuardianEvidence,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  stepId: string,
): boolean {
  return evidence.definitionId === definition.definitionId &&
    evidence.instanceId === instance.instanceId &&
    evidence.instanceVersion === instance.version &&
    evidence.stepId === stepId &&
    evidence.workflowVersion === definition.workflowVersion;
}

function readinessRequest(
  request: WorkflowStepExecutionBoundaryRequest,
  approvedStepId: string | undefined,
  guardianSatisfiedStepId: string | undefined,
  maxResults: number,
): WorkflowReadinessRequest {
  return {
    approvedStepIds: approvedStepId === undefined ? [] : [approvedStepId],
    contractVersion: "1",
    expectedVersion: request.expectedVersion,
    guardianSatisfiedStepIds:
      guardianSatisfiedStepId === undefined ? [] : [guardianSatisfiedStepId],
    instanceId: request.instanceId,
    maxResults,
    nonExecuting: true,
  };
}

function findFinding(
  result: ReturnType<DeterministicWorkflowReadinessEngine["evaluate"]>,
  stepId: string,
): WorkflowReadinessFinding | undefined {
  return [
    ...result.blockedFindings,
    ...result.pendingFindings,
    ...result.readyFindings,
    ...result.terminalFindings,
  ].find((finding) => finding.stepId === stepId);
}

function readinessBlockers(
  finding: WorkflowReadinessFinding,
): readonly WorkflowStepExecutionBlocker[] {
  if (finding.status === "READY") {
    return [];
  }
  if (finding.status === "PENDING") {
    return [{ code: "STEP_AWAITING_RESULT", stepId: finding.stepId }];
  }
  if (finding.status === "TERMINAL") {
    return [{ code: "NO_ELIGIBLE_STEP", stepId: finding.stepId }];
  }
  return finding.reasons.map((reason) => ({
    code: reason.code === "REASONS_TRUNCATED"
      ? "NO_ELIGIBLE_STEP"
      : reason.code,
    ...(reason.relatedStepId === undefined
      ? {}
      : { relatedStepId: reason.relatedStepId }),
    stepId: finding.stepId,
  }));
}

function exactSubject(
  subject: { readonly agentId: string; readonly specificationId: string; readonly version: string },
  assignment: WorkflowStepAgentAssignment,
): boolean {
  return subject.agentId === assignment.agentId &&
    subject.specificationId === assignment.specificationId &&
    subject.version === assignment.specificationVersion;
}

function blocked(
  request: WorkflowStepExecutionBoundaryRequest,
  blockers: readonly WorkflowStepExecutionBlocker[],
  evaluatedVersion?: number,
): WorkflowStepExecutionBoundaryResult {
  return freezeWorkflowStepExecutionBoundaryValue({
    blockers: uniqueBoundedBlockers(blockers, request.maxBlockers),
    contractVersion: WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION,
    ...(evaluatedVersion === undefined ? {} : { evaluatedVersion }),
    instanceId: request.instanceId,
    nonExecuting: true,
    status: "BLOCKED",
  });
}

function uniqueBoundedBlockers(
  blockers: readonly WorkflowStepExecutionBlocker[],
  maximum: number,
): readonly WorkflowStepExecutionBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.code}:${blocker.domain ?? ""}:${blocker.relatedStepId ?? ""}:${blocker.stepId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, maximum);
}

function sorted<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values].sort(compareText));
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return sorted([...new Set(values)]);
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function validate<T>(value: unknown, validator: Validator<T>, label: string): T {
  const validation = validator.validate(value);
  if (!validation.ok) {
    throw new RepositoryValidationError(`${label} failed validation`);
  }
  return validation.value;
}
