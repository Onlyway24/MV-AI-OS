import { AgentSpecificationValidator } from "../agents/specification/agent-specification-validator.js";
import { isAgentSpecificationIdentifier } from "../agents/specification/agent-specification-validation.js";
import {
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
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
  MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION,
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_INSTRUCTIONS_REF,
  type MainAssistantDelegationPolicy,
  type MainAssistantDelegationTarget,
  type MainAssistantDelegationTargetRole,
  type MainAssistantEscalationType,
  type MainAssistantForbiddenCapability,
  type MainAssistantForbiddenDelegationMode,
  type MainAssistantHumanApprovalRequirement,
  type MainAssistantOutputRule,
  type MainAssistantSafetyDomain,
  type MainAssistantSafetyPreflightRequirement,
  type MainAssistantSpecification,
} from "./main-assistant-specification.js";

const SPECIFICATION_KEYS = new Set([
  "agentSpecification",
  "assistantId",
  "contractVersion",
  "delegationPolicy",
  "displayName",
  "forbiddenCapabilities",
  "humanApprovalRequirements",
  "mission",
  "nonResponsibilities",
  "operatorOutputRules",
  "operatorRole",
  "responsibilities",
  "safetyPreflightRequirements",
]);

const SAFETY_PREFLIGHT_KEYS = new Set([
  "domain",
  "rationale",
  "requiredBefore",
  "requirementId",
]);

const APPROVAL_REQUIREMENT_KEYS = new Set([
  "approvalId",
  "rationale",
  "requiredFor",
]);

const DELEGATION_POLICY_KEYS = new Set([
  "allowedTargets",
  "forbiddenModes",
  "maxDelegationDepth",
  "noCircularDelegation",
  "requiresCoreBrainMediation",
  "requiresOperatorSafetyCheck",
  "requiresPolicyEvaluation",
]);

const DELEGATION_TARGET_KEYS = new Set([
  "agentId",
  "description",
  "requiredApproval",
  "requiredPreflightDomains",
  "role",
]);

const SAFETY_DOMAINS = new Set<MainAssistantSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
]);

const ESCALATION_TYPES = new Set<MainAssistantEscalationType>([
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
]);

const FORBIDDEN_CAPABILITIES = new Set<MainAssistantForbiddenCapability>([
  "autonomous_background_execution",
  "autonomous_destructive_action",
  "bypass_core_brain",
  "bypass_guardians",
  "bypass_policy",
  "direct_browser_control",
  "direct_database_mutation",
  "direct_email_calendar_social_posting",
  "direct_filesystem_mutation",
  "direct_n8n_execution",
  "direct_provider_call",
  "direct_secret_reading",
  "direct_tool_execution",
  "publishing_without_approval",
  "spending_without_budget_limits",
]);

const DELEGATION_ROLES = new Set<MainAssistantDelegationTargetRole>([
  "business",
  "content_direction",
  "implementation",
  "publishing",
  "research",
]);

const FORBIDDEN_DELEGATION_MODES =
  new Set<MainAssistantForbiddenDelegationMode>([
    "agent_to_agent_direct_call",
    "autonomous_escalation",
    "unapproved_publishing",
    "unapproved_tool_execution",
  ]);

const OUTPUT_RULES = new Set<MainAssistantOutputRule>([
  "avoid_raw_internal_payloads",
  "state_approval_needed",
  "state_blockers",
  "state_checked_safety",
  "state_next_action",
]);

const REQUIRED_SAFETY_DOMAINS: readonly MainAssistantSafetyDomain[] = [
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
];

const REQUIRED_APPROVAL_ESCALATIONS: readonly MainAssistantEscalationType[] = [
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
];

const REQUIRED_OUTPUT_RULES: readonly MainAssistantOutputRule[] = [
  "avoid_raw_internal_payloads",
  "state_approval_needed",
  "state_blockers",
  "state_checked_safety",
  "state_next_action",
];

export class MainAssistantSpecificationValidator
  implements Validator<MainAssistantSpecification>
{
  readonly #agentSpecificationValidator = new AgentSpecificationValidator();

  public validate(
    value: unknown,
  ): ValidationResult<MainAssistantSpecification> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant specification must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, SPECIFICATION_KEYS, issues, "");
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const assistantId = readRequiredString(record, "assistantId", issues);
    const displayName = readRequiredString(record, "displayName", issues);
    const mission = readRequiredString(record, "mission", issues);
    const operatorRole = readRequiredString(record, "operatorRole", issues);
    const responsibilities = readRequiredStringArray(
      record,
      "responsibilities",
      issues,
      "",
      false,
    );
    const nonResponsibilities = readRequiredStringArray(
      record,
      "nonResponsibilities",
      issues,
      "",
      false,
    );
    const forbiddenCapabilities = readEnumArray(
      record.forbiddenCapabilities,
      "forbiddenCapabilities",
      FORBIDDEN_CAPABILITIES,
      issues,
    );
    const safetyPreflightRequirements = readSafetyPreflightRequirements(
      record.safetyPreflightRequirements,
      issues,
    );
    const humanApprovalRequirements = readHumanApprovalRequirements(
      record.humanApprovalRequirements,
      issues,
    );
    const delegationPolicy = readDelegationPolicy(
      record.delegationPolicy,
      issues,
    );
    const operatorOutputRules = readEnumArray(
      record.operatorOutputRules,
      "operatorOutputRules",
      OUTPUT_RULES,
      issues,
    );
    const agentSpecificationValidation =
      this.#agentSpecificationValidator.validate(record.agentSpecification);
    if (!agentSpecificationValidation.ok) {
      issues.push(
        ...prefixIssues(
          agentSpecificationValidation.issues,
          "agentSpecification",
        ),
      );
    }

    validateIdentity(assistantId, issues);
    validateContractVersion(contractVersion, issues);

    if (
      agentSpecificationValidation.ok &&
      assistantId !== undefined &&
      displayName !== undefined &&
      delegationPolicy !== undefined
    ) {
      validateAgentSpecificationBoundary(
        assistantId,
        displayName,
        agentSpecificationValidation.value,
        delegationPolicy,
        issues,
      );
    }

    if (forbiddenCapabilities !== undefined) {
      validateRequiredCoverage(
        forbiddenCapabilities,
        [...FORBIDDEN_CAPABILITIES],
        "forbiddenCapabilities",
        "forbidden_capability_missing",
        issues,
      );
    }
    if (safetyPreflightRequirements !== undefined) {
      validateSafetyPreflightCoverage(
        safetyPreflightRequirements,
        issues,
      );
    }
    if (humanApprovalRequirements !== undefined) {
      validateApprovalCoverage(humanApprovalRequirements, issues);
    }
    if (delegationPolicy !== undefined) {
      validateDelegationPolicy(delegationPolicy, assistantId, issues);
    }
    if (operatorOutputRules !== undefined) {
      validateRequiredCoverage(
        operatorOutputRules,
        REQUIRED_OUTPUT_RULES,
        "operatorOutputRules",
        "output_rule_missing",
        issues,
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION ||
      assistantId === undefined ||
      displayName === undefined ||
      mission === undefined ||
      operatorRole === undefined ||
      responsibilities === undefined ||
      nonResponsibilities === undefined ||
      forbiddenCapabilities === undefined ||
      safetyPreflightRequirements === undefined ||
      humanApprovalRequirements === undefined ||
      delegationPolicy === undefined ||
      operatorOutputRules === undefined ||
      !agentSpecificationValidation.ok
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agentSpecification: agentSpecificationValidation.value,
      assistantId,
      contractVersion,
      delegationPolicy,
      displayName,
      forbiddenCapabilities,
      humanApprovalRequirements,
      mission,
      nonResponsibilities,
      operatorOutputRules,
      operatorRole,
      responsibilities,
      safetyPreflightRequirements,
    });
  }
}

function readSafetyPreflightRequirements(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantSafetyPreflightRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "safetyPreflightRequirements must be an array",
      path: "safetyPreflightRequirements",
    });
    return undefined;
  }

  const requirements: MainAssistantSafetyPreflightRequirement[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `safetyPreflightRequirements[${String(index)}]`;
    const requirement = readSafetyPreflightRequirement(entry, path, issues);
    if (requirement === undefined) {
      continue;
    }
    if (seen.has(requirement.requirementId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.requirementId must be unique`,
        path: `${path}.requirementId`,
      });
      continue;
    }
    seen.add(requirement.requirementId);
    requirements.push(requirement);
  }
  return issues.some(({ path }) =>
    path.startsWith("safetyPreflightRequirements"),
  )
    ? undefined
    : Object.freeze(requirements);
}

function readSafetyPreflightRequirement(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantSafetyPreflightRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, SAFETY_PREFLIGHT_KEYS, issues, path);
  const requirementId = readRequiredString(
    record,
    "requirementId",
    issues,
    path,
  );
  const domain = readEnumValue(
    record.domain,
    `${path}.domain`,
    SAFETY_DOMAINS,
    issues,
  );
  const requiredBefore = readEnumArray(
    record.requiredBefore,
    `${path}.requiredBefore`,
    ESCALATION_TYPES,
    issues,
  );
  const rationale = readRequiredString(record, "rationale", issues, path);

  if (
    requirementId === undefined ||
    domain === undefined ||
    requiredBefore === undefined ||
    rationale === undefined
  ) {
    return undefined;
  }

  return {
    domain,
    rationale,
    requiredBefore,
    requirementId,
  };
}

function readHumanApprovalRequirements(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantHumanApprovalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "humanApprovalRequirements must be an array",
      path: "humanApprovalRequirements",
    });
    return undefined;
  }

  const approvals: MainAssistantHumanApprovalRequirement[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `humanApprovalRequirements[${String(index)}]`;
    const approval = readHumanApprovalRequirement(entry, path, issues);
    if (approval === undefined) {
      continue;
    }
    if (seen.has(approval.approvalId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.approvalId must be unique`,
        path: `${path}.approvalId`,
      });
      continue;
    }
    seen.add(approval.approvalId);
    approvals.push(approval);
  }
  return issues.some(({ path }) =>
    path.startsWith("humanApprovalRequirements"),
  )
    ? undefined
    : Object.freeze(approvals);
}

function readHumanApprovalRequirement(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantHumanApprovalRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, APPROVAL_REQUIREMENT_KEYS, issues, path);
  const approvalId = readRequiredString(record, "approvalId", issues, path);
  const requiredFor = readEnumArray(
    record.requiredFor,
    `${path}.requiredFor`,
    ESCALATION_TYPES,
    issues,
  );
  const rationale = readRequiredString(record, "rationale", issues, path);

  if (
    approvalId === undefined ||
    requiredFor === undefined ||
    rationale === undefined
  ) {
    return undefined;
  }

  return {
    approvalId,
    rationale,
    requiredFor,
  };
}

function readDelegationPolicy(
  value: unknown,
  issues: ValidationIssue[],
): MainAssistantDelegationPolicy | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "delegationPolicy must be an object",
      path: "delegationPolicy",
    });
    return undefined;
  }

  rejectUnknownKeys(record, DELEGATION_POLICY_KEYS, issues, "delegationPolicy");
  const allowedTargets = readDelegationTargets(
    record.allowedTargets,
    issues,
  );
  const forbiddenModes = readEnumArray(
    record.forbiddenModes,
    "delegationPolicy.forbiddenModes",
    FORBIDDEN_DELEGATION_MODES,
    issues,
  );
  const maxDelegationDepth = readRequiredInteger(
    record,
    "maxDelegationDepth",
    issues,
    "delegationPolicy",
  );
  const noCircularDelegation = readRequiredBoolean(
    record,
    "noCircularDelegation",
    issues,
    "delegationPolicy",
  );
  const requiresCoreBrainMediation = readRequiredBoolean(
    record,
    "requiresCoreBrainMediation",
    issues,
    "delegationPolicy",
  );
  const requiresOperatorSafetyCheck = readRequiredBoolean(
    record,
    "requiresOperatorSafetyCheck",
    issues,
    "delegationPolicy",
  );
  const requiresPolicyEvaluation = readRequiredBoolean(
    record,
    "requiresPolicyEvaluation",
    issues,
    "delegationPolicy",
  );

  if (
    allowedTargets === undefined ||
    forbiddenModes === undefined ||
    maxDelegationDepth === undefined ||
    noCircularDelegation === undefined ||
    requiresCoreBrainMediation === undefined ||
    requiresOperatorSafetyCheck === undefined ||
    requiresPolicyEvaluation === undefined
  ) {
    return undefined;
  }

  return {
    allowedTargets,
    forbiddenModes,
    maxDelegationDepth,
    noCircularDelegation,
    requiresCoreBrainMediation,
    requiresOperatorSafetyCheck,
    requiresPolicyEvaluation,
  };
}

function readDelegationTargets(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantDelegationTarget[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "delegationPolicy.allowedTargets must be an array",
      path: "delegationPolicy.allowedTargets",
    });
    return undefined;
  }

  const targets: MainAssistantDelegationTarget[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `delegationPolicy.allowedTargets[${String(index)}]`;
    const target = readDelegationTarget(entry, path, issues);
    if (target === undefined) {
      continue;
    }
    if (seen.has(target.agentId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.agentId must be unique`,
        path: `${path}.agentId`,
      });
      continue;
    }
    seen.add(target.agentId);
    targets.push(target);
  }
  return issues.some(({ path }) =>
    path.startsWith("delegationPolicy.allowedTargets"),
  )
    ? undefined
    : Object.freeze(targets);
}

function readDelegationTarget(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantDelegationTarget | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, DELEGATION_TARGET_KEYS, issues, path);
  const agentId = readRequiredString(record, "agentId", issues, path);
  const description = readRequiredString(record, "description", issues, path);
  const requiredApproval = readRequiredBoolean(
    record,
    "requiredApproval",
    issues,
    path,
  );
  const requiredPreflightDomains = readEnumArray(
    record.requiredPreflightDomains,
    `${path}.requiredPreflightDomains`,
    SAFETY_DOMAINS,
    issues,
  );
  const role = readEnumValue(
    record.role,
    `${path}.role`,
    DELEGATION_ROLES,
    issues,
  );

  if (
    agentId !== undefined &&
    !isAgentSpecificationIdentifier(agentId)
  ) {
    issues.push({
      code: "invalid_format",
      message: `${path}.agentId must be a lowercase identifier`,
      path: `${path}.agentId`,
    });
  }

  if (
    agentId === undefined ||
    description === undefined ||
    requiredApproval === undefined ||
    requiredPreflightDomains === undefined ||
    role === undefined
  ) {
    return undefined;
  }

  return {
    agentId,
    description,
    requiredApproval,
    requiredPreflightDomains,
    role,
  };
}

function readEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  issues: ValidationIssue[],
): readonly T[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one value`,
      path,
    });
    return undefined;
  }

  const entries: T[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const normalized = readEnumValue(entry, entryPath, allowed, issues);
    if (normalized === undefined) {
      continue;
    }
    if (seen.has(normalized)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(normalized);
    entries.push(normalized);
  }

  return issues.some((issue) => issue.path.startsWith(path))
    ? undefined
    : Object.freeze(entries);
}

function readEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  issues: ValidationIssue[],
): T | undefined {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${path} is not supported`,
      path,
    });
    return undefined;
  }
  return value as T;
}

function validateAgentSpecificationBoundary(
  assistantId: string,
  displayName: string,
  agentSpecification: MainAssistantSpecification["agentSpecification"],
  delegationPolicy: MainAssistantDelegationPolicy,
  issues: ValidationIssue[],
): void {
  if (agentSpecification.agentId !== assistantId) {
    issues.push({
      code: "identity_mismatch",
      message: "agentSpecification.agentId must match assistantId",
      path: "agentSpecification.agentId",
    });
  }
  if (agentSpecification.name !== displayName) {
    issues.push({
      code: "identity_mismatch",
      message: "agentSpecification.name must match displayName",
      path: "agentSpecification.name",
    });
  }
  if (agentSpecification.instructionsRef !== ONLY_WAY_ASSISTANT_INSTRUCTIONS_REF) {
    issues.push({
      code: "invalid_value",
      message: "agentSpecification.instructionsRef must reference Only Way instructions",
      path: "agentSpecification.instructionsRef",
    });
  }
  if (agentSpecification.limits.maxToolCalls !== 0) {
    issues.push({
      code: "forbidden_capability",
      message: "Only Way Assistant must not have direct tool-call capacity",
      path: "agentSpecification.limits.maxToolCalls",
    });
  }
  for (const [index, capability] of agentSpecification.capabilities.entries()) {
    if (
      capability.capabilityType === "tool.execute" ||
      capability.capabilityType === "tool.read"
    ) {
      issues.push({
        code: "forbidden_capability",
        message: "Only Way Assistant must not declare direct tool capabilities",
        path: `agentSpecification.capabilities[${String(index)}].capabilityType`,
      });
    }
    if (
      capability.capabilityType === "model.invoke" &&
      /openai|anthropic|gemini|provider/u.test(capability.permission)
    ) {
      issues.push({
        code: "provider_specific_capability",
        message: "Only Way Assistant model permissions must remain provider-neutral",
        path: `agentSpecification.capabilities[${String(index)}].permission`,
      });
    }
  }

  const delegationTargets = new Set(
    delegationPolicy.allowedTargets.map(({ agentId }) => agentId),
  );
  for (const [index, target] of agentSpecification.handoffTargets.entries()) {
    if (!delegationTargets.has(target)) {
      issues.push({
        code: "handoff_not_declared",
        message:
          "agentSpecification.handoffTargets must be represented in delegationPolicy.allowedTargets",
        path: `agentSpecification.handoffTargets[${String(index)}]`,
      });
    }
  }
}

function validateIdentity(
  assistantId: string | undefined,
  issues: ValidationIssue[],
): void {
  if (assistantId !== undefined && assistantId !== ONLY_WAY_ASSISTANT_ID) {
    issues.push({
      code: "invalid_value",
      message: `assistantId must be ${ONLY_WAY_ASSISTANT_ID}`,
      path: "assistantId",
    });
  }
}

function validateContractVersion(
  contractVersion: string | undefined,
  issues: ValidationIssue[],
): void {
  if (
    contractVersion !== undefined &&
    contractVersion !== MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message:
        `contractVersion must be ${MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION}`,
      path: "contractVersion",
    });
  }
}

function validateSafetyPreflightCoverage(
  requirements: readonly MainAssistantSafetyPreflightRequirement[],
  issues: ValidationIssue[],
): void {
  validateRequiredCoverage(
    requirements.map(({ domain }) => domain),
    REQUIRED_SAFETY_DOMAINS,
    "safetyPreflightRequirements",
    "safety_preflight_missing",
    issues,
  );
  for (const escalation of ESCALATION_TYPES) {
    if (
      !requirements.some(({ requiredBefore }) =>
        requiredBefore.includes(escalation),
      )
    ) {
      issues.push({
        code: "escalation_uncovered",
        message: `${escalation} must have a safety preflight requirement`,
        path: "safetyPreflightRequirements",
      });
    }
  }
}

function validateApprovalCoverage(
  approvals: readonly MainAssistantHumanApprovalRequirement[],
  issues: ValidationIssue[],
): void {
  const covered = approvals.flatMap(({ requiredFor }) => requiredFor);
  validateRequiredCoverage(
    covered,
    REQUIRED_APPROVAL_ESCALATIONS,
    "humanApprovalRequirements",
    "approval_requirement_missing",
    issues,
  );
}

function validateDelegationPolicy(
  policy: MainAssistantDelegationPolicy,
  assistantId: string | undefined,
  issues: ValidationIssue[],
): void {
  if (policy.maxDelegationDepth !== 1) {
    issues.push({
      code: "invalid_value",
      message: "maxDelegationDepth must be exactly 1 for the foundation",
      path: "delegationPolicy.maxDelegationDepth",
    });
  }
  if (!policy.noCircularDelegation) {
    issues.push({
      code: "required_true",
      message: "delegation must forbid circular delegation",
      path: "delegationPolicy.noCircularDelegation",
    });
  }
  if (!policy.requiresCoreBrainMediation) {
    issues.push({
      code: "required_true",
      message: "delegation must require Core Brain mediation",
      path: "delegationPolicy.requiresCoreBrainMediation",
    });
  }
  if (!policy.requiresOperatorSafetyCheck) {
    issues.push({
      code: "required_true",
      message: "delegation must require Operator Safety review",
      path: "delegationPolicy.requiresOperatorSafetyCheck",
    });
  }
  if (!policy.requiresPolicyEvaluation) {
    issues.push({
      code: "required_true",
      message: "delegation must require policy evaluation",
      path: "delegationPolicy.requiresPolicyEvaluation",
    });
  }
  validateRequiredCoverage(
    policy.forbiddenModes,
    [...FORBIDDEN_DELEGATION_MODES],
    "delegationPolicy.forbiddenModes",
    "forbidden_delegation_missing",
    issues,
  );
  for (const [index, target] of policy.allowedTargets.entries()) {
    if (target.agentId === assistantId) {
      issues.push({
        code: "invalid_value",
        message: "Only Way Assistant cannot delegate to itself",
        path: `delegationPolicy.allowedTargets[${String(index)}].agentId`,
      });
    }
    if (!target.requiredPreflightDomains.includes("operator_safety")) {
      issues.push({
        code: "safety_preflight_missing",
        message: "delegation targets must require operator_safety preflight",
        path:
          `delegationPolicy.allowedTargets[${String(index)}].requiredPreflightDomains`,
      });
    }
  }
}

function validateRequiredCoverage<T extends string>(
  actual: readonly T[],
  required: readonly T[],
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  const actualSet = new Set(actual);
  for (const requirement of required) {
    if (!actualSet.has(requirement)) {
      issues.push({
        code,
        message: `${path} must include ${requirement}`,
        path,
      });
    }
  }
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${path(pathPrefix, key)} is not supported`,
        path: path(pathPrefix, key),
      });
    }
  }
}

function prefixIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map(({ code, message, path }) => ({
    code,
    message,
    path: path === "$" ? prefix : `${prefix}.${path}`,
  }));
}

function path(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}
