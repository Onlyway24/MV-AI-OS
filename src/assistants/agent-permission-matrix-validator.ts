import {
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  AGENT_COMPANY_CAPABILITY_IDS,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  type AgentCompanyCapability,
  type AgentCompanyCapabilityApprovalRequirement,
  type AgentCompanyCapabilityFutureToolMapping,
  type AgentCompanyCapabilityFutureWorkflowMapping,
  type AgentCompanyCapabilityGuardianRequirement,
  type AgentCompanyCapabilityId,
  type AgentCompanyCapabilityRiskLevel,
  type AgentCompanyFutureToolCategory,
  type AgentCompanyFutureWorkflowStepType,
} from "./agent-capability-registry.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import { EXTENDED_BUSINESS_AGENT_SPECIFICATIONS } from "./extended-business-agent-specifications.js";
import { INITIAL_CORE_AGENT_SPECIFICATIONS } from "./core-agent-specifications.js";
import {
  AGENT_COMPANY_PERMISSION_RULE_IDS,
  AGENT_PERMISSION_MATRIX_CONTRACT_VERSION,
  type AgentCompanyForbiddenPermissionCategory,
  type AgentCompanyPermissionActionKind,
  type AgentCompanyPermissionAllowedAction,
  type AgentCompanyPermissionBoundary,
  type AgentCompanyPermissionForbiddenAction,
  type AgentCompanyPermissionMatrix,
  type AgentCompanyPermissionRule,
  type AgentCompanyPermissionRuleId,
  type AgentCompanyPermissionScope,
  type AgentCompanyPermissionSubject,
  type AgentCompanyRolePermissionBoundary,
} from "./agent-permission-matrix.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

const MATRIX_KEYS = new Set([
  "contractVersion",
  "defaultDeny",
  "matrixId",
  "nonExecuting",
  "permissionRules",
  "roleBoundaries",
]);

const RULE_KEYS = new Set([
  "allowedActions",
  "approvalRequired",
  "approvalRequirements",
  "boundary",
  "capabilityId",
  "forbiddenAsRuntimePermission",
  "futureTool",
  "futureWorkflow",
  "grantsRuntimeAccess",
  "guardianRequired",
  "guardianRequirements",
  "nonExecuting",
  "order",
  "permissionId",
  "riskLevel",
  "subject",
]);

const ROLE_BOUNDARY_KEYS = new Set([
  "allowedPermissionIds",
  "forbiddenActions",
  "nonExecutionNotice",
  "role",
]);

const SUBJECT_KEYS = new Set([
  "agentId",
  "specificationId",
  "version",
]);

const ALLOWED_ACTION_KEYS = new Set([
  "actionId",
  "actionKind",
  "description",
  "nonExecuting",
  "scope",
]);

const FORBIDDEN_ACTION_KEYS = new Set([
  "category",
  "description",
]);

const APPROVAL_REQUIREMENT_KEYS = new Set([
  "approvalId",
  "rationale",
  "requiredFor",
]);

const GUARDIAN_REQUIREMENT_KEYS = new Set([
  "domains",
  "rationale",
]);

const FUTURE_WORKFLOW_KEYS = new Set([
  "approvalSensitive",
  "compatible",
  "guardianSensitive",
  "nonExecuting",
  "stepType",
]);

const FUTURE_TOOL_KEYS = new Set([
  "approvalSensitive",
  "compatible",
  "guardianSensitive",
  "nonExecuting",
  "toolCategory",
]);

const ROLE_IDS = DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId);

const ACTION_KINDS: readonly AgentCompanyPermissionActionKind[] = [
  "analyze",
  "classify",
  "format",
  "organize",
  "prepare",
  "recommend",
  "review",
  "synthesize",
];

const PERMISSION_SCOPES: readonly AgentCompanyPermissionScope[] = [
  "approval_preparation",
  "future_tool_preparation",
  "future_workflow_preparation",
  "internal_analysis",
  "planning_only",
];

const PERMISSION_BOUNDARIES: readonly AgentCompanyPermissionBoundary[] = [
  "default_deny_non_executing_declaration",
];

const RISK_LEVELS: readonly AgentCompanyCapabilityRiskLevel[] = [
  "low",
  "medium",
  "high",
];

const FORBIDDEN_CATEGORIES: readonly AgentCompanyForbiddenPermissionCategory[] = [
  "autonomous_execution",
  "binding_legal_advice",
  "budget_mutation",
  "bypass_guardians",
  "bypass_policy",
  "customer_delivery_sending_without_approval",
  "direct_agent_invocation",
  "direct_model_provider_call",
  "direct_tool_execution",
  "external_communication_without_approval",
  "filesystem_mutation",
  "final_compliance_approval",
  "final_strategy_decision_without_fabio",
  "network_mutation",
  "payment_or_spend_execution",
  "publishing_without_approval",
  "raw_memory_or_private_data_exposure",
  "sales_outreach_without_approval",
  "secret_storage",
  "unsupported_claim",
];

const SAFETY_DOMAINS: readonly MainAssistantSafetyDomain[] = [
  "operator_safety",
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

const ESCALATION_TYPES: readonly MainAssistantEscalationType[] = [
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
];

const FUTURE_WORKFLOW_STEP_TYPES: readonly AgentCompanyFutureWorkflowStepType[] = [
  "analysis_step",
  "approval_preparation_step",
  "handoff_preparation_step",
  "implementation_planning_step",
  "knowledge_curation_step",
  "mission_planning_step",
  "review_step",
];

const FUTURE_TOOL_CATEGORIES: readonly AgentCompanyFutureToolCategory[] = [
  "approval_packet_preparation",
  "channel_formatting",
  "customer_delivery_preparation",
  "engineering_planning",
  "finance_analysis",
  "knowledge_readiness",
  "read_only_research",
  "sales_material_preparation",
];

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
  "customerContent",
  "legalSensitiveContent",
  "personalData",
  "prompt",
  "providerPayload",
  "rawCompletion",
  "rawCustomerContent",
  "rawGuardianPayload",
  "rawKnowledge",
  "rawLegalSensitiveContent",
  "rawMemory",
  "rawPersonalData",
  "rawPrompt",
  "rawProviderPayload",
  "rawTranscript",
  "secret",
  "secretRef",
  "secretReference",
  "secretValue",
  "transcript",
  "transportInternals",
]);

const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\braw\s+(?:prompt|completion|transcript|knowledge|memory|customer|legal|personal)\b/iu,
  /\bsecret(?:Ref|Reference|Value)?\b/u,
  /\bproviderPayload\b/u,
  /\btransportInternals\b/u,
  /\/Users\/[^\s]+/u,
];

const UNSAFE_ALLOWED_ACTION_PATTERNS: readonly RegExp[] = [
  /\b(?:can|may|will)\s+(?:execute|run|invoke|call|deploy|mutate|publish|send|contact|spend|pay)\b/iu,
  /\bgrant(?:s|ed)?\s+runtime\s+access\b/iu,
  /\bruntime\s+permission\b/iu,
  /\bdirect\s+(?:execution|tool|provider|workflow|agent|model)\b/iu,
  /\bexecute\s+(?:a\s+)?(?:payment|tool|workflow|provider|agent|model)\b/iu,
  /\bcall\s+(?:models?|providers?)\b/iu,
  /\bmutate\s+(?:files?|filesystem|network|production|systems?)\b/iu,
  /\bnetwork\s+mutation\b/iu,
  /\bfilesystem\s+mutation\b/iu,
  /\bautonomous\s+(?:execution|behavior|operation)\b/iu,
  /\bspend\s+money\b/iu,
  /\bchange\s+budgets?\b/iu,
  /\bexecute\s+payments?\b/iu,
  /\bbinding\s+legal\s+advice\b/iu,
  /\bfinal\s+(?:legal|compliance)\s+approval\b/iu,
];

const APPROVAL_SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\bpublishing\b/iu,
  /\bpublic\s+posting\b/iu,
  /\boutreach\b/iu,
  /\bexternal\s+communication\b/iu,
  /\bcustomer\s+delivery\s+sending\b/iu,
  /\bbudget\s+changes?\b/iu,
  /\bfinal\s+public\s+pricing\b/iu,
  /\blegal\/compliance-sensitive\s+external\s+output\b/iu,
  /\bbrand\s+identity\s+changes?\b/iu,
];

const SPECIFICATION_KEYS = new Set(
  [
    ...INITIAL_CORE_AGENT_SPECIFICATIONS,
    ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  ].map(({ agentId, version }) => `${agentId}@${version}`),
);

export class AgentCompanyPermissionMatrixValidator
  implements Validator<AgentCompanyPermissionMatrix>
{
  public validate(value: unknown): ValidationResult<AgentCompanyPermissionMatrix> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent permission matrix must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, MATRIX_KEYS, issues, "");
    rejectSensitiveContent(record, issues, "");

    const contractVersion = readRequiredString(record, "contractVersion", issues);
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_PERMISSION_MATRIX_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent permission matrix contractVersion must be 1",
        path: "contractVersion",
      });
    }
    readRequiredString(record, "matrixId", issues, "", { maxLength: 128 });
    const defaultDeny = readRequiredBoolean(record, "defaultDeny", issues);
    if (defaultDeny === false) {
      issues.push({
        code: "invalid_value",
        message: "agent permission matrix must preserve default-deny behavior",
        path: "defaultDeny",
      });
    }
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "agent permission matrix must be non-executing",
        path: "nonExecuting",
      });
    }

    const roleBoundaries = readRoleBoundaries(
      record.roleBoundaries,
      issues,
      "roleBoundaries",
    );
    const permissionRules = readPermissionRules(
      record.permissionRules,
      issues,
      "permissionRules",
    );

    if (roleBoundaries !== undefined) {
      validateRoleBoundaries(roleBoundaries, issues);
    }
    if (permissionRules !== undefined) {
      validatePermissionRules(permissionRules, issues);
    }
    if (roleBoundaries !== undefined && permissionRules !== undefined) {
      validateRoleRuleCoverage(roleBoundaries, permissionRules, issues);
    }

    if (
      issues.length > 0 ||
      contractVersion !== AGENT_PERMISSION_MATRIX_CONTRACT_VERSION ||
      defaultDeny !== true ||
      nonExecuting !== true ||
      roleBoundaries === undefined ||
      permissionRules === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess(value as AgentCompanyPermissionMatrix);
  }
}

export class AgentCompanyPermissionRuleValidator
  implements Validator<AgentCompanyPermissionRule>
{
  public validate(value: unknown): ValidationResult<AgentCompanyPermissionRule> {
    const issues: ValidationIssue[] = [];
    const rule = readPermissionRule(value, issues, "$");
    if (rule !== undefined) {
      validatePermissionRule(rule, 0, issues, { enforceGlobalOrder: false });
    }
    return issues.length > 0 || rule === undefined
      ? validationFailure(issues)
      : validationSuccess(value as AgentCompanyPermissionRule);
  }
}

function validateRoleBoundaries(
  boundaries: readonly AgentCompanyRolePermissionBoundary[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    boundaries.map(({ role }) => role.agentId),
    ROLE_IDS,
    "roleBoundaries",
    issues,
  );

  for (const [index, boundary] of boundaries.entries()) {
    validateRoleBoundary(boundary, index, issues);
  }
}

function validateRoleBoundary(
  boundary: AgentCompanyRolePermissionBoundary,
  index: number,
  issues: ValidationIssue[],
): void {
  validateSpecificationMapping(boundary.role, issues, `roleBoundaries[${String(index)}].role`);
  if (boundary.allowedPermissionIds.length === 0) {
    issues.push({
      code: "permission_missing",
      message: "every Agent Company role must have at least one allowed permission declaration",
      path: `roleBoundaries[${String(index)}].allowedPermissionIds`,
    });
  }
  if (boundary.forbiddenActions.length === 0) {
    issues.push({
      code: "forbidden_action_missing",
      message: "every Agent Company role must have at least one forbidden action",
      path: `roleBoundaries[${String(index)}].forbiddenActions`,
    });
  }
  requireExactOrder(
    boundary.allowedPermissionIds,
    permissionIdsForRole(boundary.role.agentId),
    `roleBoundaries[${String(index)}].allowedPermissionIds`,
    issues,
  );
  validateUnique(
    boundary.forbiddenActions.map(({ category }) => category),
    "category",
    `roleBoundaries[${String(index)}].forbiddenActions`,
    issues,
  );
}

function validatePermissionRules(
  rules: readonly AgentCompanyPermissionRule[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    rules.map(({ permissionId }) => permissionId),
    AGENT_COMPANY_PERMISSION_RULE_IDS,
    "permissionRules",
    issues,
  );
  requireExactOrder(
    rules.map(({ capabilityId }) => capabilityId),
    AGENT_COMPANY_CAPABILITY_IDS,
    "permissionRules",
    issues,
  );

  for (const [index, rule] of rules.entries()) {
    validatePermissionRule(rule, index, issues, { enforceGlobalOrder: true });
  }
}

function validatePermissionRule(
  rule: AgentCompanyPermissionRule,
  index: number,
  issues: ValidationIssue[],
  options: { readonly enforceGlobalOrder: boolean },
): void {
  const pathPrefix = options.enforceGlobalOrder
    ? `permissionRules[${String(index)}]`
    : "$";
  const capability = capabilityById(rule.capabilityId);

  if (options.enforceGlobalOrder && rule.order !== index + 1) {
    issues.push({
      code: "not_deterministic",
      message: "permission rules must use deterministic 1-based order",
      path: `${pathPrefix}.order`,
    });
  }

  if (rule.permissionId !== permissionIdForCapability(rule.capabilityId)) {
    issues.push({
      code: "permission_mapping_mismatch",
      message: "permissionId must match capabilityId",
      path: `${pathPrefix}.permissionId`,
    });
  }
  validateSpecificationMapping(rule.subject, issues, `${pathPrefix}.subject`);
  validateCapabilityOwner(rule, capability, pathPrefix, issues);
  validateActionSafety(rule, pathPrefix, issues);
  validateApprovalRules(rule, capability, pathPrefix, issues);
  validateGuardianRules(rule, capability, pathPrefix, issues);
}

function validateCapabilityOwner(
  rule: AgentCompanyPermissionRule,
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const owner = capability.primaryOwners[0];
  if (owner?.agentId !== rule.subject.agentId) {
    issues.push({
      code: "permission_mapping_mismatch",
      message: "permission subject must match capability primary owner",
      path: `${pathPrefix}.subject.agentId`,
    });
  }
  if (rule.riskLevel !== capability.riskLevel) {
    issues.push({
      code: "permission_mapping_mismatch",
      message: "permission risk level must match capability risk level",
      path: `${pathPrefix}.riskLevel`,
    });
  }
}

function validateActionSafety(
  rule: AgentCompanyPermissionRule,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  if (rule.allowedActions.length === 0) {
    issues.push({
      code: "permission_missing",
      message: "permission rule requires at least one allowed action",
      path: `${pathPrefix}.allowedActions`,
    });
  }

  for (const [index, action] of rule.allowedActions.entries()) {
    const actionPath = `${pathPrefix}.allowedActions[${String(index)}]`;
    if (UNSAFE_ALLOWED_ACTION_PATTERNS.some((pattern) => pattern.test(action.description))) {
      issues.push({
        code: "unsafe_permission",
        message: "allowed action must not imply runtime access or unsafe execution",
        path: actionPath,
      });
    }
    if (
      APPROVAL_SENSITIVE_TEXT_PATTERNS.some((pattern) =>
        pattern.test(action.description),
      ) &&
      !rule.approvalRequired
    ) {
      issues.push({
        code: "approval_requirement_missing",
        message: "approval-sensitive allowed actions require Fabio approval markers",
        path: `${pathPrefix}.approvalRequired`,
      });
    }
  }
}

function validateApprovalRules(
  rule: AgentCompanyPermissionRule,
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const approvalSensitive =
    capability.approvalRequired ||
    capability.futureTool.approvalSensitive ||
    capability.futureWorkflow.approvalSensitive ||
    rule.futureTool.approvalSensitive ||
    rule.futureWorkflow.approvalSensitive;

  if (approvalSensitive && !rule.approvalRequired) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive permission rules require Fabio approval markers",
      path: `${pathPrefix}.approvalRequired`,
    });
  }
  if (approvalSensitive && rule.approvalRequirements.length === 0) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive permission rules require at least one approval requirement",
      path: `${pathPrefix}.approvalRequirements`,
    });
  }
}

function validateGuardianRules(
  rule: AgentCompanyPermissionRule,
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const guardianSensitive =
    capability.guardianRequired ||
    capability.futureTool.guardianSensitive ||
    capability.futureWorkflow.guardianSensitive ||
    rule.futureTool.guardianSensitive ||
    rule.futureWorkflow.guardianSensitive ||
    rule.riskLevel === "high";

  if (guardianSensitive && !rule.guardianRequired) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive permission rules require guardian markers",
      path: `${pathPrefix}.guardianRequired`,
    });
  }
  if (guardianSensitive && rule.guardianRequirements.length === 0) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive permission rules require at least one guardian requirement",
      path: `${pathPrefix}.guardianRequirements`,
    });
  }
}

function validateRoleRuleCoverage(
  boundaries: readonly AgentCompanyRolePermissionBoundary[],
  rules: readonly AgentCompanyPermissionRule[],
  issues: ValidationIssue[],
): void {
  const ruleIds = new Set(rules.map(({ permissionId }) => permissionId));
  for (const [index, boundary] of boundaries.entries()) {
    for (const permissionId of boundary.allowedPermissionIds) {
      if (!ruleIds.has(permissionId)) {
        issues.push({
          code: "permission_missing",
          message: "role boundary references an unknown permission rule",
          path: `roleBoundaries[${String(index)}].allowedPermissionIds`,
        });
      }
    }
  }
}

function readRoleBoundaries(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyRolePermissionBoundary[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const boundaries: AgentCompanyRolePermissionBoundary[] = [];
  for (const [index, entry] of value.entries()) {
    const boundary = readRoleBoundary(entry, issues, `${path}[${String(index)}]`);
    if (boundary !== undefined) {
      boundaries.push(boundary);
    }
  }
  validateUnique(
    boundaries.map(({ role }) => role.agentId),
    "agentId",
    path,
    issues,
  );
  return boundaries;
}

function readRoleBoundary(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyRolePermissionBoundary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, ROLE_BOUNDARY_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const role = readSubject(record.role, issues, `${path}.role`);
  const allowedPermissionIds = readEnumArray<AgentCompanyPermissionRuleId>(
    record,
    "allowedPermissionIds",
    AGENT_COMPANY_PERMISSION_RULE_IDS,
    issues,
    path,
    false,
  );
  const forbiddenActions = readForbiddenActions(
    record.forbiddenActions,
    issues,
    `${path}.forbiddenActions`,
  );
  const nonExecutionNotice = readRequiredString(
    record,
    "nonExecutionNotice",
    issues,
    path,
    { maxLength: 600 },
  );
  if (
    allowedPermissionIds === undefined ||
    forbiddenActions === undefined ||
    nonExecutionNotice === undefined ||
    role === undefined
  ) {
    return undefined;
  }
  return {
    allowedPermissionIds,
    forbiddenActions,
    nonExecutionNotice,
    role,
  };
}

function readPermissionRules(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyPermissionRule[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const rules: AgentCompanyPermissionRule[] = [];
  for (const [index, entry] of value.entries()) {
    const rule = readPermissionRule(entry, issues, `${path}[${String(index)}]`);
    if (rule !== undefined) {
      rules.push(rule);
    }
  }
  validateUnique(
    rules.map(({ permissionId }) => permissionId),
    "permissionId",
    path,
    issues,
  );
  validateUnique(
    rules.map(({ capabilityId }) => capabilityId),
    "capabilityId",
    path,
    issues,
  );
  return rules;
}

function readPermissionRule(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyPermissionRule | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, RULE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const allowedActions = readAllowedActions(
    record.allowedActions,
    issues,
    `${path}.allowedActions`,
  );
  const approvalRequired = readRequiredBoolean(
    record,
    "approvalRequired",
    issues,
    path,
  );
  const approvalRequirements = readApprovalRequirements(
    record.approvalRequirements,
    issues,
    `${path}.approvalRequirements`,
  );
  const boundary = readEnum<AgentCompanyPermissionBoundary>(
    record,
    "boundary",
    PERMISSION_BOUNDARIES,
    issues,
    path,
  );
  const capabilityId = readEnum<AgentCompanyCapabilityId>(
    record,
    "capabilityId",
    AGENT_COMPANY_CAPABILITY_IDS,
    issues,
    path,
  );
  const forbiddenAsRuntimePermission = readRequiredBoolean(
    record,
    "forbiddenAsRuntimePermission",
    issues,
    path,
  );
  if (forbiddenAsRuntimePermission === false) {
    issues.push({
      code: "unsafe_permission",
      message: "permission rules must be forbidden as runtime permissions",
      path: `${path}.forbiddenAsRuntimePermission`,
    });
  }
  const futureTool = readFutureTool(
    record.futureTool,
    issues,
    `${path}.futureTool`,
  );
  const futureWorkflow = readFutureWorkflow(
    record.futureWorkflow,
    issues,
    `${path}.futureWorkflow`,
  );
  const grantsRuntimeAccess = readRequiredBoolean(
    record,
    "grantsRuntimeAccess",
    issues,
    path,
  );
  if (grantsRuntimeAccess === true) {
    issues.push({
      code: "unsafe_permission",
      message: "permission rules must not grant runtime access",
      path: `${path}.grantsRuntimeAccess`,
    });
  }
  const guardianRequired = readRequiredBoolean(
    record,
    "guardianRequired",
    issues,
    path,
  );
  const guardianRequirements = readGuardianRequirements(
    record.guardianRequirements,
    issues,
    `${path}.guardianRequirements`,
  );
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_permission",
      message: "permission rules must be non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const order = readRequiredInteger(record, "order", issues, path, 1);
  const permissionId = readEnum<AgentCompanyPermissionRuleId>(
    record,
    "permissionId",
    AGENT_COMPANY_PERMISSION_RULE_IDS,
    issues,
    path,
  );
  const riskLevel = readEnum<AgentCompanyCapabilityRiskLevel>(
    record,
    "riskLevel",
    RISK_LEVELS,
    issues,
    path,
  );
  const subject = readSubject(record.subject, issues, `${path}.subject`);

  if (
    allowedActions === undefined ||
    approvalRequired === undefined ||
    approvalRequirements === undefined ||
    boundary === undefined ||
    capabilityId === undefined ||
    forbiddenAsRuntimePermission !== true ||
    futureTool === undefined ||
    futureWorkflow === undefined ||
    grantsRuntimeAccess !== false ||
    guardianRequired === undefined ||
    guardianRequirements === undefined ||
    nonExecuting !== true ||
    order === undefined ||
    permissionId === undefined ||
    riskLevel === undefined ||
    subject === undefined
  ) {
    return undefined;
  }

  return {
    allowedActions,
    approvalRequired,
    approvalRequirements,
    boundary,
    capabilityId,
    forbiddenAsRuntimePermission,
    futureTool,
    futureWorkflow,
    grantsRuntimeAccess,
    guardianRequired,
    guardianRequirements,
    nonExecuting,
    order,
    permissionId,
    riskLevel,
    subject,
  };
}

function readSubject(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyPermissionSubject | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, SUBJECT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const agentId = readEnum<AgentCompanyRoleId>(
    record,
    "agentId",
    ROLE_IDS,
    issues,
    path,
  );
  const specificationId = readRequiredString(
    record,
    "specificationId",
    issues,
    path,
  );
  const version = readRequiredString(record, "version", issues, path);
  if (agentId !== undefined && specificationId !== undefined && version !== undefined) {
    validateSpecificationMapping(
      { agentId, specificationId, version },
      issues,
      path,
    );
  }
  if (
    agentId === undefined ||
    specificationId === undefined ||
    version === undefined
  ) {
    return undefined;
  }
  return {
    agentId,
    specificationId,
    version,
  };
}

function readAllowedActions(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyPermissionAllowedAction[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const actions: AgentCompanyPermissionAllowedAction[] = [];
  for (const [index, entry] of value.entries()) {
    const action = readAllowedAction(entry, issues, `${path}[${String(index)}]`);
    if (action !== undefined) {
      actions.push(action);
    }
  }
  validateUnique(actions.map(({ actionId }) => actionId), "actionId", path, issues);
  return actions;
}

function readAllowedAction(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyPermissionAllowedAction | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, ALLOWED_ACTION_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const actionId = readRequiredString(record, "actionId", issues, path, {
    maxLength: 160,
  });
  const actionKind = readEnum<AgentCompanyPermissionActionKind>(
    record,
    "actionKind",
    ACTION_KINDS,
    issues,
    path,
  );
  const description = readRequiredString(record, "description", issues, path, {
    maxLength: 600,
  });
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_permission",
      message: "allowed actions must be explicitly non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const scope = readEnum<AgentCompanyPermissionScope>(
    record,
    "scope",
    PERMISSION_SCOPES,
    issues,
    path,
  );
  if (
    actionId === undefined ||
    actionKind === undefined ||
    description === undefined ||
    nonExecuting !== true ||
    scope === undefined
  ) {
    return undefined;
  }
  return {
    actionId,
    actionKind,
    description,
    nonExecuting,
    scope,
  };
}

function readForbiddenActions(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyPermissionForbiddenAction[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const actions: AgentCompanyPermissionForbiddenAction[] = [];
  for (const [index, entry] of value.entries()) {
    const action = readForbiddenAction(entry, issues, `${path}[${String(index)}]`);
    if (action !== undefined) {
      actions.push(action);
    }
  }
  return actions;
}

function readForbiddenAction(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyPermissionForbiddenAction | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, FORBIDDEN_ACTION_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const category = readEnum<AgentCompanyForbiddenPermissionCategory>(
    record,
    "category",
    FORBIDDEN_CATEGORIES,
    issues,
    path,
  );
  const description = readRequiredString(record, "description", issues, path, {
    maxLength: 600,
  });
  if (category === undefined || description === undefined) {
    return undefined;
  }
  return {
    category,
    description,
  };
}

function readApprovalRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyCapabilityApprovalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const requirements: AgentCompanyCapabilityApprovalRequirement[] = [];
  for (const [index, entry] of value.entries()) {
    const requirement = readApprovalRequirement(
      entry,
      issues,
      `${path}[${String(index)}]`,
    );
    if (requirement !== undefined) {
      requirements.push(requirement);
    }
  }
  validateUnique(
    requirements.map(({ approvalId }) => approvalId),
    "approvalId",
    path,
    issues,
  );
  return requirements;
}

function readApprovalRequirement(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilityApprovalRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, APPROVAL_REQUIREMENT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const approvalId = readRequiredString(record, "approvalId", issues, path, {
    maxLength: 128,
  });
  const rationale = readRequiredString(record, "rationale", issues, path, {
    maxLength: 600,
  });
  const requiredFor = readEnumArray<MainAssistantEscalationType>(
    record,
    "requiredFor",
    ESCALATION_TYPES,
    issues,
    path,
    false,
  );
  if (
    approvalId === undefined ||
    rationale === undefined ||
    requiredFor === undefined
  ) {
    return undefined;
  }
  return {
    approvalId,
    rationale,
    requiredFor,
  };
}

function readGuardianRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyCapabilityGuardianRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const requirements: AgentCompanyCapabilityGuardianRequirement[] = [];
  for (const [index, entry] of value.entries()) {
    const requirement = readGuardianRequirement(
      entry,
      issues,
      `${path}[${String(index)}]`,
    );
    if (requirement !== undefined) {
      requirements.push(requirement);
    }
  }
  return requirements;
}

function readGuardianRequirement(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilityGuardianRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, GUARDIAN_REQUIREMENT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const domains = readEnumArray<MainAssistantSafetyDomain>(
    record,
    "domains",
    SAFETY_DOMAINS,
    issues,
    path,
    false,
  );
  const rationale = readRequiredString(record, "rationale", issues, path, {
    maxLength: 600,
  });
  if (domains !== undefined) {
    requireExactOrder(domains, sortSafetyDomains(domains), `${path}.domains`, issues);
  }
  if (domains === undefined || rationale === undefined) {
    return undefined;
  }
  return {
    domains,
    rationale,
  };
}

function readFutureWorkflow(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilityFutureWorkflowMapping | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, FUTURE_WORKFLOW_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const approvalSensitive = readRequiredBoolean(record, "approvalSensitive", issues, path);
  const compatible = readRequiredBoolean(record, "compatible", issues, path);
  const guardianSensitive = readRequiredBoolean(record, "guardianSensitive", issues, path);
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_permission",
      message: "future workflow mappings must be explicitly non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const stepType = readOptionalEnum<AgentCompanyFutureWorkflowStepType>(
    record,
    "stepType",
    FUTURE_WORKFLOW_STEP_TYPES,
    issues,
    path,
  );
  if (
    approvalSensitive === undefined ||
    compatible === undefined ||
    guardianSensitive === undefined ||
    nonExecuting !== true
  ) {
    return undefined;
  }
  if (compatible && stepType === undefined) {
    issues.push({
      code: "required",
      message: `${path}.stepType is required when future workflow is compatible`,
      path: `${path}.stepType`,
    });
    return undefined;
  }
  if (!compatible && stepType !== undefined) {
    issues.push({
      code: "invalid_value",
      message: `${path}.stepType must be omitted when future workflow is not compatible`,
      path: `${path}.stepType`,
    });
    return undefined;
  }
  const mapping = {
    approvalSensitive,
    compatible,
    guardianSensitive,
    nonExecuting,
  };
  return stepType === undefined ? mapping : { ...mapping, stepType };
}

function readFutureTool(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilityFutureToolMapping | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, FUTURE_TOOL_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const approvalSensitive = readRequiredBoolean(record, "approvalSensitive", issues, path);
  const compatible = readRequiredBoolean(record, "compatible", issues, path);
  const guardianSensitive = readRequiredBoolean(record, "guardianSensitive", issues, path);
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_permission",
      message: "future tool mappings must be explicitly non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const toolCategory = readOptionalEnum<AgentCompanyFutureToolCategory>(
    record,
    "toolCategory",
    FUTURE_TOOL_CATEGORIES,
    issues,
    path,
  );
  if (
    approvalSensitive === undefined ||
    compatible === undefined ||
    guardianSensitive === undefined ||
    nonExecuting !== true
  ) {
    return undefined;
  }
  if (compatible && toolCategory === undefined) {
    issues.push({
      code: "required",
      message: `${path}.toolCategory is required when future tool is compatible`,
      path: `${path}.toolCategory`,
    });
    return undefined;
  }
  if (!compatible && toolCategory !== undefined) {
    issues.push({
      code: "invalid_value",
      message: `${path}.toolCategory must be omitted when future tool is not compatible`,
      path: `${path}.toolCategory`,
    });
    return undefined;
  }
  const mapping = {
    approvalSensitive,
    compatible,
    guardianSensitive,
    nonExecuting,
  };
  return toolCategory === undefined ? mapping : { ...mapping, toolCategory };
}

function validateSpecificationMapping(
  reference: AgentCompanyPermissionSubject,
  issues: ValidationIssue[],
  path: string,
): void {
  const role = roleById(reference.agentId);
  if (reference.specificationId !== role.futureAgentSpecification.specificationId) {
    issues.push({
      code: "specification_mapping_mismatch",
      message: "specificationId must match Agent Company role mapping",
      path: `${path}.specificationId`,
    });
  }
  if (reference.version !== role.futureAgentSpecification.version) {
    issues.push({
      code: "specification_mapping_mismatch",
      message: "version must match Agent Company role mapping",
      path: `${path}.version`,
    });
  }
  if (!SPECIFICATION_KEYS.has(`${reference.agentId}@${reference.version}`)) {
    issues.push({
      code: "specification_missing",
      message: "permission matrix references an AgentSpecification that is not registered in source",
      path: `${path}.agentId`,
    });
  }
}

function readEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowedValues: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
): T | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  if (!allowedValues.includes(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${fieldPath(pathPrefix, key)} is not a supported value`,
      path: fieldPath(pathPrefix, key),
    });
    return undefined;
  }
  return value as T;
}

function readOptionalEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowedValues: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
): T | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readEnum(record, key, allowedValues, issues, pathPrefix);
}

function readEnumArray<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowedValues: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
  allowEmpty: boolean,
): readonly T[] | undefined {
  const value = record[key];
  const path = fieldPath(pathPrefix, key);
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  if (!allowEmpty && value.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one value`,
      path,
    });
    return undefined;
  }
  const entries: T[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || !allowedValues.includes(entry as T)) {
      issues.push({
        code: "invalid_value",
        message: `${path}[${String(index)}] is not a supported value`,
        path: `${path}[${String(index)}]`,
      });
      return undefined;
    }
    entries.push(entry as T);
  }
  validateUnique(entries, key, path, issues);
  return entries;
}

function capabilityById(
  capabilityId: AgentCompanyCapabilityId,
): AgentCompanyCapability {
  const capability = DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  if (capability === undefined) {
    throw new Error(`unknown capability: ${capabilityId}`);
  }
  return capability;
}

function roleById(agentId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`unknown Agent Company role: ${agentId}`);
  }
  return role;
}

function permissionIdsForRole(
  agentId: AgentCompanyRoleId,
): readonly AgentCompanyPermissionRuleId[] {
  return DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities
    .filter((capability) => capability.primaryOwners[0]?.agentId === agentId)
    .map(({ capabilityId }) => permissionIdForCapability(capabilityId));
}

function permissionIdForCapability(
  capabilityId: AgentCompanyCapabilityId,
): AgentCompanyPermissionRuleId {
  return `${capabilityId}-permission`;
}

function sortSafetyDomains(
  domains: readonly MainAssistantSafetyDomain[],
): readonly MainAssistantSafetyDomain[] {
  return [...domains].sort(
    (left, right) => SAFETY_DOMAINS.indexOf(left) - SAFETY_DOMAINS.indexOf(right),
  );
}

function validateUnique(
  values: readonly string[],
  keyName: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({
      code: "duplicate",
      message: `${path} contains duplicate ${keyName} values`,
      path,
    });
  }
}

function requireExactOrder<T extends string>(
  actual: readonly T[],
  expected: readonly T[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    issues.push({
      code: "not_deterministic",
      message: `${path} must use deterministic repository-defined ordering`,
      path,
    });
  }
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  knownKeys: ReadonlySet<string>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key)) {
      issues.push({
        code: "unknown_key",
        message: `${fieldPath(pathPrefix, key)} is not part of the agent permission matrix contract`,
        path: fieldPath(pathPrefix, key),
      });
    }
  }
}

function rejectSensitiveContent(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      rejectSensitiveContent(entry, issues, `${path}[${String(index)}]`);
    }
    return;
  }

  const record = asRecord(value);
  if (record === undefined) {
    if (
      typeof value === "string" &&
      SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value))
    ) {
      issues.push({
        code: "sensitive_content",
        message: "agent permission matrix must not contain raw sensitive content",
        path,
      });
    }
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    const entryPath = fieldPath(path, key);
    if (SENSITIVE_FIELD_NAMES.has(key)) {
      issues.push({
        code: "sensitive_content",
        message: "agent permission matrix must not contain sensitive raw fields",
        path: entryPath,
      });
    }
    rejectSensitiveContent(entry, issues, entryPath);
  }
}

function fieldPath(pathPrefix: string, key: string): string {
  return pathPrefix.length === 0 || pathPrefix === "$"
    ? `${pathPrefix}${pathPrefix === "$" ? "." : ""}${key}`
    : `${pathPrefix}.${key}`;
}

function addObjectIssue(
  issues: ValidationIssue[],
  path: string,
): void {
  issues.push({
    code: "invalid_type",
    message: `${path} must be an object`,
    path,
  });
}
