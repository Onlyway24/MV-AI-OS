import {
  AGENT_COMPANY_CAPABILITY_IDS,
} from "../../assistants/agent-capability-registry.js";
import {
  AGENT_COMPANY_PERMISSION_RULE_IDS,
} from "../../assistants/agent-permission-matrix.js";
import { DEFAULT_AGENT_COMPANY_MAP } from "../../assistants/agent-company-specification.js";
import { DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX } from "../../assistants/inter-agent-responsibility-matrix.js";
import type { MainAssistantSafetyDomain } from "../../assistants/main-assistant-specification.js";
import { isEffectivePermission } from "../../policy/effective-permissions.js";
import { PolicyDecisionValidator } from "../../validation/policy-decision-validator.js";
import {
  asRecord,
  isSemanticVersion,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import {
  WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION,
  freezeWorkflowStepExecutionBoundaryValue,
  type WorkflowStepExecutionBoundaryRequest,
  type WorkflowStepExecutionBoundaryResult,
} from "./workflow-step-execution-boundary.js";

export const MAX_WORKFLOW_STEP_EXECUTION_BLOCKERS = 32;
export const MAX_WORKFLOW_STEP_EXECUTION_EVIDENCE = 64;
export const MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIERS = 32;
export const MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIER_LENGTH = 128;
export const MAX_WORKFLOW_STEP_EXECUTION_VERSION = 1_000;

const ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_TEXT_PATTERN =
  /\b(?:secret|prompt|completion|provider[-_ ]?payload|raw[-_ ]?(?:knowledge|memory|transcript)|transcript|api[_-]?key)\b|(?:\/Users\/|\/home\/)|\bsk-[A-Za-z0-9_-]{8,}/iu;
const APPROVAL_STATUSES = new Set(["APPROVED", "EXPIRED", "REJECTED", "WITHDRAWN"]);
const GUARDIAN_STATUSES = new Set(["BLOCKED", "CLEAR", "EXPIRED", "WITHDRAWN"]);
const GUARDIAN_DOMAINS = new Set<MainAssistantSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
]);
const ROLE_IDS = new Set(DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId));
const RESPONSIBILITY_IDS = new Set(
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.map(({ areaId }) => areaId),
);
const CAPABILITY_IDS = new Set<string>(AGENT_COMPANY_CAPABILITY_IDS);
const PERMISSION_IDS = new Set<string>(AGENT_COMPANY_PERMISSION_RULE_IDS);
const BLOCKER_CODES = new Set([
  "AGENT_SPECIFICATION_MISMATCH",
  "AGENT_SPECIFICATION_MISSING",
  "APPROVAL_INVALID",
  "APPROVAL_REQUIRED",
  "CAPABILITY_MISMATCH",
  "DEPENDENCY_CYCLE",
  "DEPENDENCY_INCOMPLETE",
  "GUARDIAN_BLOCKED",
  "GUARDIAN_EVIDENCE_INVALID",
  "GUARDIAN_REQUIRED",
  "NO_ELIGIBLE_STEP",
  "PERMISSION_DECLARATION_MISMATCH",
  "POLICY_DENIED",
  "POLICY_MISMATCH",
  "RESPONSIBILITY_MISMATCH",
  "STALE_DEFINITION",
  "STALE_WORKFLOW_VERSION",
  "STEP_AWAITING_RESULT",
  "STEP_NOT_FOUND",
  "WORKFLOW_NOT_ACTIVE",
  "WORKFLOW_DEFINITION_MISSING",
  "WORKFLOW_INSTANCE_MISSING",
]);

export class WorkflowStepExecutionBoundaryRequestValidator
  implements Validator<WorkflowStepExecutionBoundaryRequest>
{
  readonly #policyValidator = new PolicyDecisionValidator();

  public validate(
    value: unknown,
  ): ValidationResult<WorkflowStepExecutionBoundaryRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "request must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    knownKeys(record, [
      "actorId",
      "agentAssignment",
      "approvalEvidence",
      "contractVersion",
      "expectedDefinitionId",
      "expectedVersion",
      "expectedWorkflowVersion",
      "guardianEvidence",
      "instanceId",
      "maxBlockers",
      "nonExecuting",
      "policyDecision",
      "selection",
      "workspaceId",
    ], issues);
    contractVersion(record.contractVersion, issues);
    safeId(record.actorId, "actorId", issues);
    safeId(record.workspaceId, "workspaceId", issues);
    safeId(record.instanceId, "instanceId", issues);
    safeId(record.expectedDefinitionId, "expectedDefinitionId", issues);
    semanticVersion(record.expectedWorkflowVersion, "expectedWorkflowVersion", issues);
    boundedInteger(record.expectedVersion, "expectedVersion", MAX_WORKFLOW_STEP_EXECUTION_VERSION, issues);
    boundedInteger(record.maxBlockers, "maxBlockers", MAX_WORKFLOW_STEP_EXECUTION_BLOCKERS, issues, 1);
    if (record.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "request must be non-executing", "nonExecuting"));
    }
    validateSelection(record.selection, issues);
    validateAssignment(record.agentAssignment, issues);
    validateEvidenceArray(record.approvalEvidence, "approvalEvidence", validateApprovalEvidence, issues);
    validateEvidenceArray(record.guardianEvidence, "guardianEvidence", validateGuardianEvidence, issues);
    const policy = this.#policyValidator.validate(record.policyDecision);
    validatePolicyEnvelope(record.policyDecision, issues);
    if (!policy.ok) {
      issues.push(...policy.issues.map((entry) => prefix(entry, "policyDecision")));
    }
    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowStepExecutionBoundaryValue(
            structuredClone(value as WorkflowStepExecutionBoundaryRequest),
          ),
        );
  }
}

export class WorkflowStepExecutionBoundaryResultValidator
  implements Validator<WorkflowStepExecutionBoundaryResult>
{
  public validate(
    value: unknown,
  ): ValidationResult<WorkflowStepExecutionBoundaryResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([issue("invalid_type", "result must be an object", "$")]);
    }
    const issues: ValidationIssue[] = [];
    contractVersion(record.contractVersion, issues);
    if (record.nonExecuting !== true) {
      issues.push(issue("unsafe_execution", "result must be non-executing", "nonExecuting"));
    }
    if (record.status === "CANDIDATE_AVAILABLE") {
      knownKeys(record, ["blockers", "candidate", "contractVersion", "nonExecuting", "status"], issues);
      if (!Array.isArray(record.blockers) || record.blockers.length !== 0) {
        issues.push(issue("invalid_value", "candidate result cannot contain blockers", "blockers"));
      }
      validateCandidate(record.candidate, issues);
    } else if (record.status === "BLOCKED") {
      knownKeys(record, ["blockers", "contractVersion", "evaluatedVersion", "instanceId", "nonExecuting", "status"], issues);
      safeId(record.instanceId, "instanceId", issues);
      if (record.evaluatedVersion !== undefined) {
        boundedInteger(record.evaluatedVersion, "evaluatedVersion", MAX_WORKFLOW_STEP_EXECUTION_VERSION, issues);
      }
      validateBlockers(record.blockers, issues);
    } else {
      issues.push(issue("invalid_value", "result status is invalid", "status"));
    }
    return issues.length > 0
      ? validationFailure(issues)
      : validationSuccess(
          freezeWorkflowStepExecutionBoundaryValue(
            structuredClone(value as WorkflowStepExecutionBoundaryResult),
          ),
        );
  }
}

function validateSelection(value: unknown, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "selection must be an object", "selection"));
    return;
  }
  if (record.mode === "NEXT_READY") {
    knownKeys(record, ["mode"], issues, "selection");
  } else if (record.mode === "EXACT_STEP") {
    knownKeys(record, ["mode", "stepId"], issues, "selection");
    safeId(record.stepId, "selection.stepId", issues);
  } else {
    issues.push(issue("invalid_value", "selection mode is invalid", "selection.mode"));
  }
}

function validateAssignment(value: unknown, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "agentAssignment must be an object", "agentAssignment"));
    return;
  }
  knownKeys(record, [
    "agentId",
    "capabilityIds",
    "permissionIds",
    "responsibilityAreaId",
    "specificationId",
    "specificationVersion",
  ], issues, "agentAssignment");
  enumString(record.agentId, ROLE_IDS, "agentAssignment.agentId", issues);
  enumString(record.responsibilityAreaId, RESPONSIBILITY_IDS, "agentAssignment.responsibilityAreaId", issues);
  safeId(record.specificationId, "agentAssignment.specificationId", issues);
  semanticVersion(record.specificationVersion, "agentAssignment.specificationVersion", issues);
  orderedEnumArray(record.capabilityIds, CAPABILITY_IDS, "agentAssignment.capabilityIds", issues);
  orderedEnumArray(record.permissionIds, PERMISSION_IDS, "agentAssignment.permissionIds", issues);
}

function validateApprovalEvidence(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "approval evidence must be an object", path));
    return;
  }
  knownKeys(record, ["authorityActorId", "definitionId", "evidenceId", "instanceId", "instanceVersion", "scope", "status", "stepId", "workflowVersion"], issues, path);
  for (const key of ["authorityActorId", "definitionId", "evidenceId", "instanceId", "stepId"] as const) {
    safeId(record[key], `${path}.${key}`, issues);
  }
  semanticVersion(record.workflowVersion, `${path}.workflowVersion`, issues);
  boundedInteger(record.instanceVersion, `${path}.instanceVersion`, MAX_WORKFLOW_STEP_EXECUTION_VERSION, issues);
  if (record.scope !== "STEP_CANDIDATE_PREPARATION") {
    issues.push(issue("invalid_value", "approval scope is invalid", `${path}.scope`));
  }
  enumString(record.status, APPROVAL_STATUSES, `${path}.status`, issues);
}

function validateGuardianEvidence(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "guardian evidence must be an object", path));
    return;
  }
  knownKeys(record, ["definitionId", "domain", "evidenceId", "instanceId", "instanceVersion", "status", "stepId", "workflowVersion"], issues, path);
  for (const key of ["definitionId", "evidenceId", "instanceId", "stepId"] as const) {
    safeId(record[key], `${path}.${key}`, issues);
  }
  semanticVersion(record.workflowVersion, `${path}.workflowVersion`, issues);
  boundedInteger(record.instanceVersion, `${path}.instanceVersion`, MAX_WORKFLOW_STEP_EXECUTION_VERSION, issues);
  enumString(record.domain, GUARDIAN_DOMAINS, `${path}.domain`, issues);
  enumString(record.status, GUARDIAN_STATUSES, `${path}.status`, issues);
}

function validateEvidenceArray(
  value: unknown,
  path: string,
  validator: (entry: unknown, path: string, issues: ValidationIssue[]) => void,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length > MAX_WORKFLOW_STEP_EXECUTION_EVIDENCE) {
    issues.push(issue("invalid_value", `${path} must be a bounded array`, path));
    return;
  }
  const evidenceIds = new Set<string>();
  for (const [index, entry] of value.entries()) {
    validator(entry, `${path}[${String(index)}]`, issues);
    const record = asRecord(entry);
    if (typeof record?.evidenceId === "string") {
      if (evidenceIds.has(record.evidenceId)) {
        issues.push(issue("duplicate_value", "evidenceId must be unique", `${path}[${String(index)}].evidenceId`));
      }
      evidenceIds.add(record.evidenceId);
    }
  }
}

function validateCandidate(value: unknown, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push(issue("invalid_type", "candidate must be an object", "candidate"));
    return;
  }
  knownKeys(record, ["agentId", "approvalEvidenceIds", "capabilityIds", "capabilityTitles", "contractVersion", "definitionId", "guardianDomains", "guardianEvidenceIds", "instanceId", "instanceVersion", "nonExecuting", "permissionIds", "requiredPolicyPermissions", "responsibilityAreaId", "responsibilityTitle", "specificationId", "specificationVersion", "stepId", "workflowId", "workflowVersion"], issues, "candidate");
  contractVersion(record.contractVersion, issues, "candidate.contractVersion");
  if (record.nonExecuting !== true) {
    issues.push(issue("unsafe_execution", "candidate must be non-executing", "candidate.nonExecuting"));
  }
  for (const key of ["definitionId", "instanceId", "specificationId", "stepId", "workflowId"] as const) {
    safeId(record[key], `candidate.${key}`, issues);
  }
  boundedInteger(record.instanceVersion, "candidate.instanceVersion", MAX_WORKFLOW_STEP_EXECUTION_VERSION, issues);
  semanticVersion(record.specificationVersion, "candidate.specificationVersion", issues);
  semanticVersion(record.workflowVersion, "candidate.workflowVersion", issues);
  enumString(record.agentId, ROLE_IDS, "candidate.agentId", issues);
  enumString(record.responsibilityAreaId, RESPONSIBILITY_IDS, "candidate.responsibilityAreaId", issues);
  safeText(record.responsibilityTitle, "candidate.responsibilityTitle", issues);
  orderedEnumArray(record.capabilityIds, CAPABILITY_IDS, "candidate.capabilityIds", issues);
  orderedEnumArray(record.permissionIds, PERMISSION_IDS, "candidate.permissionIds", issues);
  orderedSafeArray(record.capabilityTitles, "candidate.capabilityTitles", issues, false);
  orderedSafeArray(record.approvalEvidenceIds, "candidate.approvalEvidenceIds", issues);
  orderedSafeArray(record.guardianEvidenceIds, "candidate.guardianEvidenceIds", issues);
  orderedEnumArray(record.guardianDomains, GUARDIAN_DOMAINS, "candidate.guardianDomains", issues);
  orderedPermissionArray(record.requiredPolicyPermissions, issues);
  if (
    Array.isArray(record.capabilityIds) &&
    Array.isArray(record.capabilityTitles) &&
    record.capabilityIds.length !== record.capabilityTitles.length
  ) {
    issues.push(issue("invalid_value", "capability titles must match capability IDs", "candidate.capabilityTitles"));
  }
  if (
    Array.isArray(record.capabilityIds) &&
    Array.isArray(record.permissionIds) &&
    record.capabilityIds.length !== record.permissionIds.length
  ) {
    issues.push(issue("invalid_value", "permission IDs must match capability IDs", "candidate.permissionIds"));
  }
}

function validateBlockers(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_WORKFLOW_STEP_EXECUTION_BLOCKERS) {
    issues.push(issue("invalid_value", "blockers must be a non-empty bounded array", "blockers"));
    return;
  }
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `blockers[${String(index)}]`;
    const record = asRecord(entry);
    if (record === undefined) {
      issues.push(issue("invalid_type", "blocker must be an object", path));
      continue;
    }
    knownKeys(record, ["code", "domain", "relatedStepId", "stepId"], issues, path);
    enumString(record.code, BLOCKER_CODES, `${path}.code`, issues);
    if (record.domain !== undefined) {
      enumString(record.domain, GUARDIAN_DOMAINS, `${path}.domain`, issues);
    }
    for (const key of ["relatedStepId", "stepId"] as const) {
      if (record[key] !== undefined) {
        safeId(record[key], `${path}.${key}`, issues);
      }
    }
    const key = [record.code, record.domain, record.relatedStepId, record.stepId]
      .map((part) => typeof part === "string" ? part : "")
      .join(":");
    if (seen.has(key)) {
      issues.push(issue("duplicate_value", "blockers must be unique", path));
    }
    seen.add(key);
  }
}

function validatePolicyEnvelope(value: unknown, issues: ValidationIssue[]): void {
  const record = asRecord(value);
  if (record === undefined) {
    return;
  }
  knownKeys(record, [
    "actorId",
    "agent",
    "contractVersion",
    "decisionId",
    "deniedPermissions",
    "effectivePermissions",
    "evaluatedAt",
    "requestedPermissions",
    "taskId",
    "workspaceId",
  ], issues, "policyDecision");
  for (const key of ["actorId", "decisionId", "taskId", "workspaceId"] as const) {
    safeId(record[key], `policyDecision.${key}`, issues);
  }
  const agent = asRecord(record.agent);
  if (agent !== undefined) {
    knownKeys(agent, ["agentId", "version"], issues, "policyDecision.agent");
    safeId(agent.agentId, "policyDecision.agent.agentId", issues);
    semanticVersion(agent.version, "policyDecision.agent.version", issues);
  }
}

function orderedPermissionArray(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIERS) {
    issues.push(issue("invalid_value", "requiredPolicyPermissions must be a non-empty bounded array", "candidate.requiredPolicyPermissions"));
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || !isEffectivePermission(entry)) {
      issues.push(issue("invalid_value", "policy permission is invalid", `candidate.requiredPolicyPermissions[${String(index)}]`));
    }
  }
  assertStrictOrder(value, "candidate.requiredPolicyPermissions", issues);
}

function orderedEnumArray(value: unknown, allowed: ReadonlySet<string>, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIERS) {
    issues.push(issue("invalid_value", `${path} must be a non-empty bounded array`, path));
    return;
  }
  for (const [index, entry] of value.entries()) {
    enumString(entry, allowed, `${path}[${String(index)}]`, issues);
  }
  assertStrictOrder(value, path, issues);
}

function orderedSafeArray(value: unknown, path: string, issues: ValidationIssue[], identifiers = true): void {
  if (!Array.isArray(value) || value.length > MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIERS) {
    issues.push(issue("invalid_value", `${path} must be a bounded array`, path));
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (identifiers) {
      safeId(entry, `${path}[${String(index)}]`, issues);
    } else {
      safeText(entry, `${path}[${String(index)}]`, issues);
    }
  }
  assertStrictOrder(value, path, issues);
}

function assertStrictOrder(value: readonly unknown[], path: string, issues: ValidationIssue[]): void {
  if (value.some((entry, index) => index > 0 && typeof entry === "string" && typeof value[index - 1] === "string" && (value[index - 1] as string) >= entry)) {
    issues.push(issue("invalid_order", `${path} must be unique and sorted`, path));
  }
}

function knownKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[], issues: ValidationIssue[], path = "$"): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push(issue("unknown_field", "unsupported field", path === "$" ? key : `${path}.${key}`));
    }
  }
}

function contractVersion(value: unknown, issues: ValidationIssue[], path = "contractVersion"): void {
  if (value !== WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION) {
    issues.push(issue("unsupported_version", "contract version is unsupported", path));
  }
}

function safeId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length > MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIER_LENGTH || !ID_PATTERN.test(value) || SENSITIVE_TEXT_PATTERN.test(value)) {
    issues.push(issue("invalid_identifier", "identifier is invalid or unsafe", path));
  }
}

function safeText(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_WORKFLOW_STEP_EXECUTION_IDENTIFIER_LENGTH || SENSITIVE_TEXT_PATTERN.test(value)) {
    issues.push(issue("invalid_value", "text is invalid or unsafe", path));
  }
}

function semanticVersion(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !isSemanticVersion(value)) {
    issues.push(issue("invalid_format", "value must be a semantic version", path));
  }
}

function boundedInteger(value: unknown, path: string, maximum: number, issues: ValidationIssue[], minimum = 0): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    issues.push(issue("invalid_value", `${path} is outside supported bounds`, path));
  }
}

function enumString(value: unknown, allowed: ReadonlySet<string>, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    issues.push(issue("invalid_value", "value is unsupported", path));
  }
}

function prefix(entry: ValidationIssue, path: string): ValidationIssue {
  return { ...entry, path: entry.path === "$" ? path : `${path}.${entry.path}` };
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}
