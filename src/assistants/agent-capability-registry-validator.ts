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
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyBusinessValue,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import { INITIAL_CORE_AGENT_SPECIFICATIONS } from "./core-agent-specifications.js";
import { EXTENDED_BUSINESS_AGENT_SPECIFICATIONS } from "./extended-business-agent-specifications.js";
import {
  AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION,
  AGENT_COMPANY_CAPABILITY_IDS,
  type AgentCompanyCapability,
  type AgentCompanyCapabilityApprovalRequirement,
  type AgentCompanyCapabilityCategory,
  type AgentCompanyCapabilityFutureToolMapping,
  type AgentCompanyCapabilityFutureWorkflowMapping,
  type AgentCompanyCapabilityGuardianRequirement,
  type AgentCompanyCapabilityId,
  type AgentCompanyCapabilityOwner,
  type AgentCompanyCapabilityRegistry,
  type AgentCompanyCapabilityRiskLevel,
  type AgentCompanyCapabilitySupportRole,
  type AgentCompanyCapabilitySupportType,
  type AgentCompanyFutureToolCategory,
  type AgentCompanyFutureWorkflowStepType,
} from "./agent-capability-registry.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

const REGISTRY_KEYS = new Set([
  "capabilities",
  "contractVersion",
  "nonExecuting",
  "registryId",
]);

const CAPABILITY_KEYS = new Set([
  "approvalRequired",
  "approvalRequirements",
  "businessValues",
  "capabilityId",
  "category",
  "description",
  "executionMode",
  "forbiddenAsDirectPermission",
  "futureTool",
  "futureWorkflow",
  "guardianRequired",
  "guardianRequirements",
  "order",
  "primaryOwners",
  "riskLevel",
  "supportingRoles",
  "title",
]);

const PRIMARY_OWNER_KEYS = new Set([
  "agentId",
  "ownership",
  "rationale",
  "specificationId",
  "version",
]);

const SUPPORTING_ROLE_KEYS = new Set([
  "agentId",
  "rationale",
  "specificationId",
  "supportType",
  "version",
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

const BUSINESS_VALUES: readonly AgentCompanyBusinessValue[] = [
  "help_fabio_make_money",
  "improve_quality",
  "reduce_operational_work",
  "reduce_risk",
  "save_fabio_time",
];

const CAPABILITY_CATEGORIES: readonly AgentCompanyCapabilityCategory[] = [
  "approval_preparation",
  "business_strategy",
  "content_review",
  "content_strategy",
  "customer_delivery_preparation",
  "engineering_planning",
  "finance_analysis",
  "knowledge_curation",
  "legal_risk_review",
  "market_intelligence",
  "mission_planning_support",
  "offer_design",
  "pricing_support",
  "publishing_preparation",
  "quality_review",
  "research",
  "sales_planning",
];

const RISK_LEVELS: readonly AgentCompanyCapabilityRiskLevel[] = [
  "low",
  "medium",
  "high",
];

const SUPPORT_TYPES: readonly AgentCompanyCapabilitySupportType[] = [
  "analysis",
  "drafting",
  "evidence",
  "planning",
  "review",
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

const APPROVAL_SENSITIVE_CATEGORIES = new Set<AgentCompanyCapabilityCategory>([
  "approval_preparation",
  "pricing_support",
  "publishing_preparation",
]);

const EXTERNAL_COMMUNICATION_CATEGORIES =
  new Set<AgentCompanyCapabilityCategory>([
    "approval_preparation",
    "customer_delivery_preparation",
    "publishing_preparation",
    "sales_planning",
  ]);

const GUARDIAN_SENSITIVE_CATEGORIES =
  new Set<AgentCompanyCapabilityCategory>([
    "content_review",
    "customer_delivery_preparation",
    "engineering_planning",
    "finance_analysis",
    "knowledge_curation",
    "legal_risk_review",
    "pricing_support",
    "publishing_preparation",
    "quality_review",
    "sales_planning",
  ]);

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
  /\braw\s+(?:prompt|completion|transcript|customer|legal|personal)\b/iu,
  /\bsecret(?:Ref|Reference|Value)?\b/u,
  /\bproviderPayload\b/u,
  /\btransportInternals\b/u,
  /\/Users\/[^\s]+/u,
];

const DIRECT_EXECUTION_PATTERNS: readonly RegExp[] = [
  /\b(?:can|may|will)\s+(?:execute|run|invoke)\b/iu,
  /\bdirect\s+(?:execution|tool|provider|workflow|agent)\b/iu,
  /\bexecute\s+(?:a\s+)?(?:payment|tool|workflow|provider|agent)\b/iu,
  /\bsend\s+(?:outreach|email|message|proposal|deliverable)\b/iu,
  /\bpublish\s+without\s+approval\b/iu,
];

const FINANCIAL_MUTATION_PATTERNS: readonly RegExp[] = [
  /\bexecute\s+payments?\b/iu,
  /\bauthori[sz]e\s+payments?\b/iu,
  /\bspend\s+money\b/iu,
  /\bchange\s+budgets?\b/iu,
  /\bbudget\s+mutation\b/iu,
];

const LEGAL_FINAL_PATTERNS: readonly RegExp[] = [
  /\bbinding\s+legal\s+advice\b/iu,
  /\bfinal\s+compliance\s+approval\b/iu,
  /\bfinal\s+legal\s+approval\b/iu,
];

const SPECIFICATION_KEYS = new Set(
  [
    ...INITIAL_CORE_AGENT_SPECIFICATIONS,
    ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  ].map(({ agentId, version }) => `${agentId}@${version}`),
);

export class AgentCompanyCapabilityRegistryValidator
  implements Validator<AgentCompanyCapabilityRegistry>
{
  public validate(
    value: unknown,
  ): ValidationResult<AgentCompanyCapabilityRegistry> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent capability registry must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REGISTRY_KEYS, issues, "");
    rejectSensitiveContent(record, issues, "");

    const contractVersion = readRequiredString(record, "contractVersion", issues);
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent capability registry contractVersion must be 1",
        path: "contractVersion",
      });
    }
    readRequiredString(record, "registryId", issues, "", { maxLength: 128 });
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "agent capability registry must be non-executing",
        path: "nonExecuting",
      });
    }

    const capabilities = readCapabilities(
      record.capabilities,
      issues,
      "capabilities",
    );
    if (capabilities !== undefined) {
      validateCapabilities(capabilities, issues);
    }

    if (
      issues.length > 0 ||
      contractVersion !== AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION ||
      nonExecuting !== true ||
      capabilities === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess(value as AgentCompanyCapabilityRegistry);
  }
}

export class AgentCompanyCapabilityValidator
  implements Validator<AgentCompanyCapability>
{
  public validate(value: unknown): ValidationResult<AgentCompanyCapability> {
    const issues: ValidationIssue[] = [];
    const capability = readCapability(value, issues, "$");
    if (capability !== undefined) {
      validateCapability(capability, 0, issues, { enforceGlobalOrder: false });
    }
    return issues.length > 0 || capability === undefined
      ? validationFailure(issues)
      : validationSuccess(value as AgentCompanyCapability);
  }
}

function validateCapabilities(
  capabilities: readonly AgentCompanyCapability[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    capabilities.map(({ capabilityId }) => capabilityId),
    AGENT_COMPANY_CAPABILITY_IDS,
    "capabilities",
    issues,
  );

  for (const [index, capability] of capabilities.entries()) {
    validateCapability(capability, index, issues, { enforceGlobalOrder: true });
  }

  const ownedRoleIds = new Set(
    capabilities.flatMap(({ primaryOwners }) =>
      primaryOwners.map(({ agentId }) => agentId),
    ),
  );
  for (const roleId of ROLE_IDS) {
    if (!ownedRoleIds.has(roleId)) {
      issues.push({
        code: "owner_missing",
        message: "every Agent Company role must own at least one capability",
        path: "capabilities",
      });
    }
  }
}

function validateCapability(
  capability: AgentCompanyCapability,
  index: number,
  issues: ValidationIssue[],
  options: { readonly enforceGlobalOrder: boolean },
): void {
  const pathPrefix = capabilityPath(index, "", options);
  if (options.enforceGlobalOrder && capability.order !== index + 1) {
    issues.push({
      code: "not_deterministic",
      message: "capabilities must use deterministic 1-based order",
      path: `${pathPrefix}.order`,
    });
  }

  if (capability.primaryOwners.length === 0) {
    issues.push({
      code: "owner_missing",
      message: "capability requires exactly one primary owner",
      path: `${pathPrefix}.primaryOwners`,
    });
  }
  if (capability.primaryOwners.length > 1) {
    issues.push({
      code: "duplicate_primary_owner",
      message: "capability must not have multiple primary owners",
      path: `${pathPrefix}.primaryOwners`,
    });
  }

  validateRoleOrder(capability.primaryOwners, `${pathPrefix}.primaryOwners`, issues);
  validateRoleOrder(
    capability.supportingRoles,
    `${pathPrefix}.supportingRoles`,
    issues,
  );

  const primaryOwner = capability.primaryOwners[0];
  if (
    primaryOwner !== undefined &&
    capability.supportingRoles.some(({ agentId }) => agentId === primaryOwner.agentId)
  ) {
    issues.push({
      code: "unclear_ownership",
      message: "primary owner must not also be a supporting role",
      path: `${pathPrefix}.supportingRoles`,
    });
  }

  validateCapabilityText(capability, pathPrefix, issues);
  validateApprovalRules(capability, pathPrefix, issues);
  validateGuardianRules(capability, pathPrefix, issues);
}

function validateCapabilityText(
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const text = `${capability.title}\n${capability.description}`;
  if (DIRECT_EXECUTION_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "unsafe_capability",
      message: "capability text must not imply direct execution",
      path: pathPrefix,
    });
  }

  if (FINANCIAL_MUTATION_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "unsafe_capability",
      message: "finance capabilities must not imply payment, spending, or budget mutation",
      path: pathPrefix,
    });
  }

  if (LEGAL_FINAL_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "unsafe_capability",
      message: "legal/risk capabilities must not imply binding legal advice or final compliance approval",
      path: pathPrefix,
    });
  }
}

function validateApprovalRules(
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const approvalSensitive =
    capability.approvalRequired ||
    capability.futureTool.approvalSensitive ||
    capability.futureWorkflow.approvalSensitive ||
    APPROVAL_SENSITIVE_CATEGORIES.has(capability.category) ||
    externalApprovalRequired(capability);

  if (approvalSensitive && !capability.approvalRequired) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive capabilities require Fabio approval markers",
      path: `${pathPrefix}.approvalRequired`,
    });
  }
  if (approvalSensitive && capability.approvalRequirements.length === 0) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive capabilities require at least one approval requirement",
      path: `${pathPrefix}.approvalRequirements`,
    });
  }
}

function externalApprovalRequired(
  capability: AgentCompanyCapability,
): boolean {
  if (!EXTERNAL_COMMUNICATION_CATEGORIES.has(capability.category)) {
    return false;
  }

  return (
    capability.capabilityId.includes("handoff") ||
    capability.capabilityId.includes("outreach") ||
    capability.capabilityId.includes("publishing") ||
    capability.capabilityId.includes("delivery") ||
    capability.capabilityId.includes("client") ||
    capability.capabilityId.includes("channel")
  );
}

function validateGuardianRules(
  capability: AgentCompanyCapability,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const guardianSensitive =
    capability.guardianRequired ||
    capability.futureTool.guardianSensitive ||
    capability.futureWorkflow.guardianSensitive ||
    GUARDIAN_SENSITIVE_CATEGORIES.has(capability.category) ||
    capability.riskLevel === "high";

  if (guardianSensitive && !capability.guardianRequired) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive capabilities require guardian markers",
      path: `${pathPrefix}.guardianRequired`,
    });
  }
  if (guardianSensitive && capability.guardianRequirements.length === 0) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive capabilities require at least one guardian requirement",
      path: `${pathPrefix}.guardianRequirements`,
    });
  }
}

function readCapabilities(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyCapability[] | undefined {
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
      message: `${path} must contain at least one capability`,
      path,
    });
    return undefined;
  }

  const capabilities: AgentCompanyCapability[] = [];
  for (const [index, entry] of value.entries()) {
    const capability = readCapability(entry, issues, `${path}[${String(index)}]`);
    if (capability !== undefined) {
      capabilities.push(capability);
    }
  }
  validateUnique(
    capabilities.map(({ capabilityId }) => capabilityId),
    "capabilityId",
    path,
    issues,
  );
  return capabilities;
}

function readCapability(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapability | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }

  rejectUnknownKeys(record, CAPABILITY_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const capabilityId = readEnum<AgentCompanyCapabilityId>(
    record,
    "capabilityId",
    AGENT_COMPANY_CAPABILITY_IDS,
    issues,
    path,
  );
  const order = readRequiredInteger(record, "order", issues, path, 1);
  const title = readRequiredString(record, "title", issues, path, {
    maxLength: 160,
  });
  const description = readRequiredString(record, "description", issues, path, {
    maxLength: 800,
  });
  const category = readEnum<AgentCompanyCapabilityCategory>(
    record,
    "category",
    CAPABILITY_CATEGORIES,
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
  const businessValues = readEnumArray<AgentCompanyBusinessValue>(
    record,
    "businessValues",
    BUSINESS_VALUES,
    issues,
    path,
    false,
  );
  const primaryOwners = readPrimaryOwners(
    record.primaryOwners,
    issues,
    `${path}.primaryOwners`,
  );
  const supportingRoles = readSupportingRoles(
    record.supportingRoles,
    issues,
    `${path}.supportingRoles`,
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
  const executionMode = readRequiredString(record, "executionMode", issues, path);
  if (
    executionMode !== undefined &&
    executionMode !== "non_executing_declaration"
  ) {
    issues.push({
      code: "unsafe_capability",
      message: "capability must use non-executing declaration mode",
      path: `${path}.executionMode`,
    });
  }
  const forbiddenAsDirectPermission = readRequiredBoolean(
    record,
    "forbiddenAsDirectPermission",
    issues,
    path,
  );
  if (forbiddenAsDirectPermission === false) {
    issues.push({
      code: "unsafe_capability",
      message: "capability must be forbidden as a direct execution permission",
      path: `${path}.forbiddenAsDirectPermission`,
    });
  }
  const futureWorkflow = readFutureWorkflow(
    record.futureWorkflow,
    issues,
    `${path}.futureWorkflow`,
  );
  const futureTool = readFutureTool(
    record.futureTool,
    issues,
    `${path}.futureTool`,
  );

  if (
    approvalRequired === undefined ||
    approvalRequirements === undefined ||
    businessValues === undefined ||
    capabilityId === undefined ||
    category === undefined ||
    description === undefined ||
    executionMode === undefined ||
    forbiddenAsDirectPermission !== true ||
    futureTool === undefined ||
    futureWorkflow === undefined ||
    guardianRequired === undefined ||
    guardianRequirements === undefined ||
    order === undefined ||
    primaryOwners === undefined ||
    riskLevel === undefined ||
    supportingRoles === undefined ||
    title === undefined
  ) {
    return undefined;
  }

  return {
    approvalRequired,
    approvalRequirements,
    businessValues,
    capabilityId,
    category,
    description,
    executionMode:
      executionMode as AgentCompanyCapability["executionMode"],
    forbiddenAsDirectPermission,
    futureTool,
    futureWorkflow,
    guardianRequired,
    guardianRequirements,
    order,
    primaryOwners,
    riskLevel,
    supportingRoles,
    title,
  };
}

function readPrimaryOwners(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyCapabilityOwner[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const owners: AgentCompanyCapabilityOwner[] = [];
  for (const [index, entry] of value.entries()) {
    const owner = readPrimaryOwner(entry, issues, `${path}[${String(index)}]`);
    if (owner !== undefined) {
      owners.push(owner);
    }
  }
  validateUnique(
    owners.map(({ agentId }) => agentId),
    "agentId",
    path,
    issues,
  );
  return owners;
}

function readPrimaryOwner(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilityOwner | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }

  rejectUnknownKeys(record, PRIMARY_OWNER_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const reference = readRoleReference(record, issues, path);
  const ownership = readRequiredString(record, "ownership", issues, path);
  if (ownership !== undefined && ownership !== "accountable") {
    issues.push({
      code: "invalid_value",
      message: `${path}.ownership must be accountable`,
      path: `${path}.ownership`,
    });
  }
  return reference === undefined || ownership !== "accountable"
    ? undefined
    : { ...reference, ownership };
}

function readSupportingRoles(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyCapabilitySupportRole[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const roles: AgentCompanyCapabilitySupportRole[] = [];
  for (const [index, entry] of value.entries()) {
    const role = readSupportingRole(entry, issues, `${path}[${String(index)}]`);
    if (role !== undefined) {
      roles.push(role);
    }
  }
  validateUnique(
    roles.map(({ agentId }) => agentId),
    "agentId",
    path,
    issues,
  );
  return roles;
}

function readSupportingRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyCapabilitySupportRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }

  rejectUnknownKeys(record, SUPPORTING_ROLE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const reference = readRoleReference(record, issues, path);
  const supportType = readEnum<AgentCompanyCapabilitySupportType>(
    record,
    "supportType",
    SUPPORT_TYPES,
    issues,
    path,
  );
  return reference === undefined || supportType === undefined
    ? undefined
    : { ...reference, supportType };
}

function readRoleReference(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
  path: string,
): Omit<AgentCompanyCapabilityOwner, "ownership"> | undefined {
  const agentId = readAgentCompanyRoleId(record, "agentId", issues, path);
  const specificationId = readRequiredString(
    record,
    "specificationId",
    issues,
    path,
  );
  const version = readRequiredString(record, "version", issues, path);
  const rationale = readRequiredString(record, "rationale", issues, path, {
    maxLength: 600,
  });
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
    version === undefined ||
    rationale === undefined
  ) {
    return undefined;
  }
  return {
    agentId,
    rationale,
    specificationId,
    version,
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
  const requiredFor = readEnumArray<MainAssistantEscalationType>(
    record,
    "requiredFor",
    ESCALATION_TYPES,
    issues,
    path,
    false,
  );
  const rationale = readRequiredString(record, "rationale", issues, path, {
    maxLength: 600,
  });
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
  if (domains === undefined || rationale === undefined) {
    return undefined;
  }
  requireExactOrder(domains, sortSafetyDomains(domains), `${path}.domains`, issues);
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
  const approvalSensitive = readRequiredBoolean(
    record,
    "approvalSensitive",
    issues,
    path,
  );
  const compatible = readRequiredBoolean(record, "compatible", issues, path);
  const guardianSensitive = readRequiredBoolean(
    record,
    "guardianSensitive",
    issues,
    path,
  );
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_capability",
      message: `${path}.nonExecuting must be true for future workflow mappings`,
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
  return stepType === undefined
    ? mapping
    : {
        ...mapping,
        stepType,
      };
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
  const approvalSensitive = readRequiredBoolean(
    record,
    "approvalSensitive",
    issues,
    path,
  );
  const compatible = readRequiredBoolean(record, "compatible", issues, path);
  const guardianSensitive = readRequiredBoolean(
    record,
    "guardianSensitive",
    issues,
    path,
  );
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_capability",
      message: `${path}.nonExecuting must be true for future tool mappings`,
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
  return toolCategory === undefined
    ? mapping
    : {
        ...mapping,
        toolCategory,
      };
}

function validateSpecificationMapping(
  reference: {
    readonly agentId: AgentCompanyRoleId;
    readonly specificationId: string;
    readonly version: string;
  },
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
      message: "capability references an AgentSpecification that is not registered in source",
      path: `${path}.agentId`,
    });
  }
}

function validateRoleOrder(
  roles: readonly {
    readonly agentId: AgentCompanyRoleId;
  }[],
  path: string,
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    roles.map(({ agentId }) => agentId),
    sortRoleIds(roles.map(({ agentId }) => agentId)),
    path,
    issues,
  );
}

function readAgentCompanyRoleId(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix: string,
): AgentCompanyRoleId | undefined {
  return readEnum<AgentCompanyRoleId>(
    record,
    key,
    ROLE_IDS,
    issues,
    pathPrefix,
  );
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

  const values: T[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || !allowedValues.includes(entry as T)) {
      issues.push({
        code: "invalid_value",
        message: `${path}[${String(index)}] is not a supported value`,
        path: `${path}[${String(index)}]`,
      });
      return undefined;
    }
    values.push(entry as T);
  }

  validateUnique(values, key, path, issues);
  return values;
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

function roleById(agentId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`unknown Agent Company role: ${agentId}`);
  }
  return role;
}

function sortRoleIds(
  roleIds: readonly AgentCompanyRoleId[],
): readonly AgentCompanyRoleId[] {
  return [...roleIds].sort(
    (left, right) => ROLE_IDS.indexOf(left) - ROLE_IDS.indexOf(right),
  );
}

function sortSafetyDomains(
  domains: readonly MainAssistantSafetyDomain[],
): readonly MainAssistantSafetyDomain[] {
  return [...domains].sort(
    (left, right) => SAFETY_DOMAINS.indexOf(left) - SAFETY_DOMAINS.indexOf(right),
  );
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
        message: `${fieldPath(pathPrefix, key)} is not part of the agent capability registry contract`,
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
        message: "agent capability registry must not contain raw sensitive content",
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
        message: "agent capability registry must not contain sensitive raw fields",
        path: entryPath,
      });
    }
    rejectSensitiveContent(entry, issues, entryPath);
  }
}

function capabilityPath(
  index: number,
  suffix: string,
  options: { readonly enforceGlobalOrder: boolean },
): string {
  const root = options.enforceGlobalOrder
    ? `capabilities[${String(index)}]`
    : "$";
  return suffix.length === 0 ? root : `${root}.${suffix}`;
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
