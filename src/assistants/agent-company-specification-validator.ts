import {
  readRequiredBoolean,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import {
  asRecord,
  isSemanticVersion,
} from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION,
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyApprovalRequirement,
  type AgentCompanyBusinessValue,
  type AgentCompanyDepartment,
  type AgentCompanyForbiddenCapability,
  type AgentCompanyKnowledgeRequirement,
  type AgentCompanyMap,
  type AgentCompanyMemoryRequirement,
  type AgentCompanyRole,
  type AgentCompanyRoleBoundary,
  type AgentCompanyRoleCategory,
  type AgentCompanyRoleId,
  type AgentCompanyRolePriority,
  type AgentCompanySpecificationMapping,
} from "./agent-company-specification.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

const MAP_KEYS = new Set([
  "assistantId",
  "contractVersion",
  "departments",
  "globalForbiddenCapabilities",
  "mapId",
  "nonExecuting",
  "roles",
]);

const ROLE_KEYS = new Set([
  "approvalRequirements",
  "boundaries",
  "businessValues",
  "category",
  "controlPlaneDependencies",
  "department",
  "displayName",
  "forbiddenCapabilities",
  "futureAgentSpecification",
  "knowledgeRequirements",
  "memoryRequirements",
  "operatorFacingPurpose",
  "priority",
  "roleId",
]);

const BOUNDARY_KEYS = new Set(["nonResponsibilities", "responsibilities"]);
const APPROVAL_KEYS = new Set(["approvalId", "rationale", "requiredFor"]);
const MAPPING_KEYS = new Set([
  "agentId",
  "expectedStatus",
  "specificationId",
  "version",
]);
const KNOWLEDGE_KEYS = new Set(["purpose", "scopes"]);
const MEMORY_KEYS = new Set(["categories", "purpose"]);

const DEPARTMENTS: readonly AgentCompanyDepartment[] = [
  "knowledge_and_research",
  "business_growth",
  "content_and_delivery",
  "technical_operations",
  "control_and_risk",
];

const ROLE_IDS: readonly AgentCompanyRoleId[] = [
  "research-agent",
  "business-agent",
  "content-director",
  "developer-agent",
  "publisher-agent",
  "knowledge-curator",
  "sales-agent",
  "finance-cost-analyst",
  "legal-risk-reviewer",
  "customer-delivery-agent",
];

const ROLE_CATEGORIES = new Set<AgentCompanyRoleCategory>([
  "business",
  "content",
  "customer_delivery",
  "finance",
  "knowledge",
  "legal_risk",
  "publishing",
  "research",
  "sales",
  "technical",
]);

const ROLE_PRIORITIES = new Set<AgentCompanyRolePriority>(["core", "supporting"]);

const BUSINESS_VALUES = new Set<AgentCompanyBusinessValue>([
  "help_fabio_make_money",
  "improve_quality",
  "reduce_operational_work",
  "reduce_risk",
  "save_fabio_time",
]);

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

const FORBIDDEN_CAPABILITIES = new Set<AgentCompanyForbiddenCapability>(
  DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities,
);

const REQUIRED_APPROVAL_CATEGORIES = new Set<AgentCompanyRoleCategory>([
  "customer_delivery",
  "publishing",
  "sales",
]);

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
  "prompt",
  "providerPayload",
  "rawGuardianPayload",
  "rawKnowledge",
  "rawMemory",
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
  /\bsecret(?:Ref|Reference|Value)?\b/u,
  /\bproviderPayload\b/u,
  /\braw(?:GuardianPayload|Knowledge|Memory|Transcript)\b/u,
  /\btransportInternals\b/u,
  /\/Users\/[^\s]+/u,
];

export class AgentCompanyMapValidator implements Validator<AgentCompanyMap> {
  public validate(value: unknown): ValidationResult<AgentCompanyMap> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent company map must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, MAP_KEYS, issues, "");
    rejectSensitiveContent(record, issues, "");

    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent company map contractVersion must be 1",
        path: "contractVersion",
      });
    }

    const assistantId = readRequiredString(record, "assistantId", issues);
    if (assistantId !== undefined && assistantId !== "only-way-assistant") {
      issues.push({
        code: "invalid_value",
        message: "assistantId must be only-way-assistant",
        path: "assistantId",
      });
    }

    readRequiredString(record, "mapId", issues, "", { maxLength: 128 });
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "agent company map must be non-executing",
        path: "nonExecuting",
      });
    }

    const departments = readEnumArray<AgentCompanyDepartment>(
      record,
      "departments",
      DEPARTMENTS,
      issues,
      "",
      false,
    );
    if (departments !== undefined) {
      requireExactOrder(departments, DEPARTMENTS, issues, "departments");
    }

    const globalForbiddenCapabilities =
      readEnumArray<AgentCompanyForbiddenCapability>(
        record,
        "globalForbiddenCapabilities",
        [...FORBIDDEN_CAPABILITIES],
        issues,
        "",
        false,
      );
    if (globalForbiddenCapabilities !== undefined) {
      requireExactOrder(
        globalForbiddenCapabilities,
        DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities,
        issues,
        "globalForbiddenCapabilities",
      );
    }

    const roles = readRoleArray(record, issues);
    if (roles !== undefined) {
      validateRoleCollection(roles, issues);
    }

    if (issues.length > 0) {
      return validationFailure(issues);
    }

    return validationSuccess(value as AgentCompanyMap);
  }
}

export class AgentCompanyRoleValidator implements Validator<AgentCompanyRole> {
  public validate(value: unknown): ValidationResult<AgentCompanyRole> {
    const issues: ValidationIssue[] = [];
    const role = readRole(value, issues, "$");

    if (issues.length > 0 || role === undefined) {
      return validationFailure(issues);
    }

    return validationSuccess(value as AgentCompanyRole);
  }
}

function validateRoleCollection(
  roles: readonly AgentCompanyRole[],
  issues: ValidationIssue[],
): void {
  const roleIds = roles.map((role) => role.roleId);
  requireExactOrder(roleIds, ROLE_IDS, issues, "roles");

  for (const role of roles) {
    validateRoleInvariants(role, issues, `roles[${String(roleIds.indexOf(role.roleId))}]`);
  }
}

function validateRoleInvariants(
  role: AgentCompanyRole,
  issues: ValidationIssue[],
  path: string,
): void {
  if (role.futureAgentSpecification.agentId !== role.roleId) {
    issues.push({
      code: "invalid_specification_mapping",
      message: "future AgentSpecification agentId must match roleId",
      path: `${path}.futureAgentSpecification.agentId`,
    });
  }

  if (role.futureAgentSpecification.specificationId !== `${role.roleId}@1.0.0`) {
    issues.push({
      code: "invalid_specification_mapping",
      message: "future AgentSpecification specificationId must be deterministic",
      path: `${path}.futureAgentSpecification.specificationId`,
    });
  }

  if (role.futureAgentSpecification.expectedStatus !== "experimental") {
    issues.push({
      code: "invalid_specification_mapping",
      message: "future AgentSpecification expectedStatus must be experimental",
      path: `${path}.futureAgentSpecification.expectedStatus`,
    });
  }

  requireExactOrder(
    role.controlPlaneDependencies,
    sortByOrder(role.controlPlaneDependencies, SAFETY_DOMAINS),
    issues,
    `${path}.controlPlaneDependencies`,
  );
  requireExactOrder(
    role.forbiddenCapabilities,
    DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities,
    issues,
    `${path}.forbiddenCapabilities`,
  );

  if (!role.controlPlaneDependencies.includes("operator_safety")) {
    issues.push({
      code: "control_plane_dependency_missing",
      message: "operator_safety dependency is required for every role",
      path: `${path}.controlPlaneDependencies`,
    });
  }

  requireCategoryDependencies(role, issues, path);

  if (
    REQUIRED_APPROVAL_CATEGORIES.has(role.category) &&
    !hasExternalApproval(role.approvalRequirements)
  ) {
    issues.push({
      code: "approval_requirement_missing",
      message:
        "external-facing roles require approve-external-side-effects approval",
      path: `${path}.approvalRequirements`,
    });
  }

  for (const [index, approval] of role.approvalRequirements.entries()) {
    requireExactOrder(
      approval.requiredFor,
      sortByOrder(approval.requiredFor, ESCALATION_TYPES),
      issues,
      `${path}.approvalRequirements[${String(index)}].requiredFor`,
    );
  }
}

function requireCategoryDependencies(
  role: AgentCompanyRole,
  issues: ValidationIssue[],
  path: string,
): void {
  const required: MainAssistantSafetyDomain[] = [];
  if (role.category === "business" || role.category === "finance") {
    required.push("cost");
  }
  if (
    role.category === "customer_delivery" ||
    role.category === "technical"
  ) {
    required.push("backup", "security");
  }
  if (
    role.category === "customer_delivery" ||
    role.category === "knowledge" ||
    role.category === "legal_risk" ||
    role.category === "publishing" ||
    role.category === "research" ||
    role.category === "sales" ||
    role.category === "technical"
  ) {
    required.push("security");
  }
  required.push("quality");

  for (const dependency of [...new Set(required)]) {
    if (!role.controlPlaneDependencies.includes(dependency)) {
      issues.push({
        code: "control_plane_dependency_missing",
        message: `required control-plane dependency missing: ${dependency}`,
        path: `${path}.controlPlaneDependencies`,
      });
    }
  }
}

function hasExternalApproval(
  approvals: readonly AgentCompanyApprovalRequirement[],
): boolean {
  return approvals.some(
    (approval) =>
      approval.approvalId === "approve-external-side-effects" &&
      approval.requiredFor.includes("external_side_effect") &&
      approval.requiredFor.includes("publish_or_send"),
  );
}

function readRoleArray(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): readonly AgentCompanyRole[] | undefined {
  const value = record.roles;
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "roles must be an array",
      path: "roles",
    });
    return undefined;
  }

  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: "roles must contain at least one role",
      path: "roles",
    });
    return undefined;
  }

  const roles: AgentCompanyRole[] = [];
  for (const [index, entry] of value.entries()) {
    const role = readRole(entry, issues, `roles[${String(index)}]`);
    if (role !== undefined) {
      roles.push(role);
    }
  }
  return roles;
}

function readRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, ROLE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const roleId = readEnum<AgentCompanyRoleId>(
    record,
    "roleId",
    ROLE_IDS,
    issues,
    path,
  );
  readRequiredString(record, "displayName", issues, path, { maxLength: 120 });
  const department = readEnum<AgentCompanyDepartment>(
    record,
    "department",
    DEPARTMENTS,
    issues,
    path,
  );
  const category = readEnum<AgentCompanyRoleCategory>(
    record,
    "category",
    [...ROLE_CATEGORIES],
    issues,
    path,
  );
  const priority = readEnum<AgentCompanyRolePriority>(
    record,
    "priority",
    [...ROLE_PRIORITIES],
    issues,
    path,
  );
  readRequiredString(record, "operatorFacingPurpose", issues, path, {
    maxLength: 500,
  });

  const businessValues = readEnumArray<AgentCompanyBusinessValue>(
    record,
    "businessValues",
    [...BUSINESS_VALUES],
    issues,
    path,
    false,
  );
  const controlPlaneDependencies = readEnumArray<MainAssistantSafetyDomain>(
    record,
    "controlPlaneDependencies",
    SAFETY_DOMAINS,
    issues,
    path,
    false,
  );
  const forbiddenCapabilities = readEnumArray<AgentCompanyForbiddenCapability>(
    record,
    "forbiddenCapabilities",
    [...FORBIDDEN_CAPABILITIES],
    issues,
    path,
    false,
  );
  const boundaries = readBoundaries(record.boundaries, issues, `${path}.boundaries`);
  const approvals = readApprovals(
    record.approvalRequirements,
    issues,
    `${path}.approvalRequirements`,
  );
  const mapping = readMapping(
    record.futureAgentSpecification,
    issues,
    `${path}.futureAgentSpecification`,
  );
  const knowledgeRequirements = readKnowledgeRequirements(
    record.knowledgeRequirements,
    issues,
    `${path}.knowledgeRequirements`,
  );
  const memoryRequirements = readMemoryRequirements(
    record.memoryRequirements,
    issues,
    `${path}.memoryRequirements`,
  );

  if (
    roleId === undefined ||
    department === undefined ||
    category === undefined ||
    priority === undefined ||
    businessValues === undefined ||
    controlPlaneDependencies === undefined ||
    forbiddenCapabilities === undefined ||
    boundaries === undefined ||
    approvals === undefined ||
    mapping === undefined ||
    knowledgeRequirements === undefined ||
    memoryRequirements === undefined
  ) {
    return undefined;
  }

  return {
    approvalRequirements: approvals,
    boundaries,
    businessValues,
    category,
    controlPlaneDependencies,
    department,
    displayName: record.displayName as string,
    forbiddenCapabilities,
    futureAgentSpecification: mapping,
    knowledgeRequirements,
    memoryRequirements,
    operatorFacingPurpose: record.operatorFacingPurpose as string,
    priority,
    roleId,
  };
}

function readBoundaries(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyRoleBoundary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, BOUNDARY_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const responsibilities = readRequiredStringArray(
    record,
    "responsibilities",
    issues,
    path,
    false,
  );
  const nonResponsibilities = readRequiredStringArray(
    record,
    "nonResponsibilities",
    issues,
    path,
    false,
  );
  if (responsibilities === undefined || nonResponsibilities === undefined) {
    return undefined;
  }

  if (nonResponsibilities.length < 3) {
    issues.push({
      code: "role_boundary_violation",
      message: "role must declare non-responsibility boundaries",
      path: `${path}.nonResponsibilities`,
    });
  }

  return { nonResponsibilities, responsibilities };
}

function readApprovals(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyApprovalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const approvals: AgentCompanyApprovalRequirement[] = [];
  const approvalIds: string[] = [];
  for (const [index, entry] of value.entries()) {
    const approval = readApproval(entry, issues, `${path}[${String(index)}]`);
    if (approval !== undefined) {
      approvals.push(approval);
      approvalIds.push(approval.approvalId);
    }
  }

  if (new Set(approvalIds).size !== approvalIds.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicate approval IDs`,
      path,
    });
  }

  requireExactOrder(
    approvalIds,
    [...approvalIds].sort((left, right) => left.localeCompare(right)),
    issues,
    path,
  );

  return approvals;
}

function readApproval(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanyApprovalRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, APPROVAL_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const approvalId = readRequiredString(record, "approvalId", issues, path, {
    maxLength: 120,
  });
  const rationale = readRequiredString(record, "rationale", issues, path, {
    maxLength: 500,
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

  return { approvalId, rationale, requiredFor };
}

function readMapping(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentCompanySpecificationMapping | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, MAPPING_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const agentId = readRequiredString(record, "agentId", issues, path, {
    maxLength: 120,
  });
  const specificationId = readRequiredString(
    record,
    "specificationId",
    issues,
    path,
    { maxLength: 160 },
  );
  const version = readRequiredString(record, "version", issues, path, {
    maxLength: 40,
  });
  const expectedStatus = readRequiredString(
    record,
    "expectedStatus",
    issues,
    path,
  );
  if (version !== undefined && !isSemanticVersion(version)) {
    issues.push({
      code: "invalid_version",
      message: `${path}.version must be a semantic version`,
      path: `${path}.version`,
    });
  }
  if (
    expectedStatus !== undefined &&
    !["active", "disabled", "experimental"].includes(expectedStatus)
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.expectedStatus must be a valid AgentStatus`,
      path: `${path}.expectedStatus`,
    });
  }

  if (
    agentId === undefined ||
    specificationId === undefined ||
    version === undefined ||
    expectedStatus === undefined
  ) {
    return undefined;
  }

  return {
    agentId,
    expectedStatus: expectedStatus as AgentCompanySpecificationMapping["expectedStatus"],
    specificationId,
    version,
  };
}

function readKnowledgeRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyKnowledgeRequirement[] | undefined {
  return readRequirementArray(
    value,
    issues,
    path,
    KNOWLEDGE_KEYS,
    "scopes",
  ) as readonly AgentCompanyKnowledgeRequirement[] | undefined;
}

function readMemoryRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyMemoryRequirement[] | undefined {
  return readRequirementArray(
    value,
    issues,
    path,
    MEMORY_KEYS,
    "categories",
  ) as readonly AgentCompanyMemoryRequirement[] | undefined;
}

function readRequirementArray(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  allowedKeys: ReadonlySet<string>,
  arrayKey: "categories" | "scopes",
):
  | readonly {
      readonly [key: string]: readonly string[] | string;
      readonly purpose: string;
    }[]
  | undefined {
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
      message: `${path} must contain at least one requirement`,
      path,
    });
    return undefined;
  }

  const requirements: {
    readonly [key: string]: readonly string[] | string;
    readonly purpose: string;
  }[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const record = asRecord(entry);
    if (record === undefined) {
      issues.push({
        code: "invalid_type",
        message: `${entryPath} must be an object`,
        path: entryPath,
      });
      continue;
    }
    rejectUnknownKeys(record, allowedKeys, issues, entryPath);
    rejectSensitiveContent(record, issues, entryPath);
    const purpose = readRequiredString(record, "purpose", issues, entryPath, {
      maxLength: 400,
    });
    const values = readRequiredStringArray(
      record,
      arrayKey,
      issues,
      entryPath,
      false,
    );
    if (purpose !== undefined && values !== undefined) {
      requirements.push({
        [arrayKey]: values,
        purpose,
      });
    }
  }
  return requirements;
}

function readEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
): T | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${fieldPath(pathPrefix, key)} must be an allowed value`,
      path: fieldPath(pathPrefix, key),
    });
    return undefined;
  }
  return value as T;
}

function readEnumArray<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
  allowEmpty: boolean,
): readonly T[] | undefined {
  const values = readRequiredStringArray(
    record,
    key,
    issues,
    pathPrefix,
    allowEmpty,
  );
  if (values === undefined) {
    return undefined;
  }
  const path = fieldPath(pathPrefix, key);
  for (const value of values) {
    if (!allowed.includes(value as T)) {
      issues.push({
        code: "invalid_value",
        message: `${path} contains unsupported value: ${value}`,
        path,
      });
    }
  }
  return values as readonly T[];
}

function requireExactOrder<T extends string>(
  values: readonly T[],
  expected: readonly T[],
  issues: ValidationIssue[],
  path: string,
): void {
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index])
  ) {
    issues.push({
      code: "not_deterministic",
      message: `${path} must use deterministic ordering`,
      path,
    });
  }
}

function sortByOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): readonly T[] {
  return [...values].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return leftIndex - rightIndex;
  });
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
        code: "unknown_key",
        message: `${fieldPath(pathPrefix, key)} is not supported`,
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
  if (typeof value === "string") {
    if (SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
      issues.push({
        code: "unsafe_content",
        message: `${path} contains unsupported sensitive content`,
        path,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      rejectSensitiveContent(entry, issues, `${path}[${String(index)}]`);
    }
    return;
  }

  const record = asRecord(value);
  if (record === undefined) {
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    const entryPath = fieldPath(path, key);
    if (SENSITIVE_FIELD_NAMES.has(key)) {
      issues.push({
        code: "unsafe_content",
        message: `${entryPath} is not allowed in agent company contracts`,
        path: entryPath,
      });
    }
    rejectSensitiveContent(entry, issues, entryPath);
  }
}

function fieldPath(prefix: string, key: string): string {
  if (prefix.length === 0) {
    return key;
  }
  if (prefix === "$") {
    return `$.${key}`;
  }
  return `${prefix}.${key}`;
}
