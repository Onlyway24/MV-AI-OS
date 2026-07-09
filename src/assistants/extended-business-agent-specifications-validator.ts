import { AgentSpecificationValidator } from "../agents/specification/agent-specification-validator.js";
import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import {
  readRequiredBoolean,
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
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyApprovalRequirement,
  type AgentCompanyBusinessValue,
  type AgentCompanyForbiddenCapability,
  type AgentCompanyKnowledgeRequirement,
  type AgentCompanyMemoryRequirement,
  type AgentCompanyRole,
  type AgentCompanyRoleCategory,
} from "./agent-company-specification.js";
import type { MainAssistantSafetyDomain } from "./main-assistant-specification.js";
import {
  EXTENDED_BUSINESS_AGENT_SPECIFICATION_VERSION,
  type ExtendedBusinessAgentId,
  type ExtendedBusinessAgentSpecificationProfile,
  type ExtendedBusinessFutureToolDeclaration,
  type ExtendedBusinessFutureToolMode,
  type ExtendedBusinessFutureToolSideEffect,
} from "./extended-business-agent-specifications.js";

const PROFILE_KEYS = new Set([
  "agentId",
  "agentSpecification",
  "approvalRequirements",
  "businessPurpose",
  "businessValues",
  "escalationRules",
  "expectedOutputQualityBar",
  "failureModes",
  "forbiddenCapabilities",
  "futureToolDeclarations",
  "guardianConsultationRequirements",
  "knowledgeRequirements",
  "memoryRequirements",
  "nonExecuting",
  "nonResponsibilities",
  "qualityChecks",
  "requiredPermissions",
  "responsibilities",
]);

const FUTURE_TOOL_KEYS = new Set([
  "approvalRequired",
  "mode",
  "nonExecuting",
  "purpose",
  "sideEffect",
  "toolId",
]);

const EXTENDED_BUSINESS_AGENT_IDS: readonly ExtendedBusinessAgentId[] = [
  "publisher-agent",
  "sales-agent",
  "finance-cost-analyst",
  "legal-risk-reviewer",
  "customer-delivery-agent",
];

const BUSINESS_VALUES: readonly AgentCompanyBusinessValue[] = [
  "help_fabio_make_money",
  "improve_quality",
  "reduce_operational_work",
  "reduce_risk",
  "save_fabio_time",
];

const FUTURE_TOOL_MODES: readonly ExtendedBusinessFutureToolMode[] = [
  "future_read_only",
  "future_workflow_proposal",
];

const FUTURE_TOOL_SIDE_EFFECTS: readonly ExtendedBusinessFutureToolSideEffect[] =
  ["external_communication", "none"];

const REQUIRED_EXTERNAL_APPROVAL_CATEGORIES = new Set<AgentCompanyRoleCategory>([
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
  /\braw(?:GuardianPayload|Knowledge|Memory|ProviderPayload|Transcript)\b/u,
  /\btransportInternals\b/u,
  /\/Users\/[^\s]+/u,
];

const SPECIAL_SAFETY_PHRASES: Record<ExtendedBusinessAgentId, readonly string[]> =
  {
    "customer-delivery-agent": [
      "send deliverables externally",
      "explicit Fabio approval",
    ],
    "finance-cost-analyst": [
      "spend money",
      "change budgets",
      "execute payments",
    ],
    "legal-risk-reviewer": [
      "binding legal advice",
      "final compliance approval",
    ],
    "publisher-agent": [
      "publish",
      "explicit Fabio approval",
    ],
    "sales-agent": [
      "send outreach",
      "contact anyone",
      "explicit Fabio approval",
    ],
  };

export class ExtendedBusinessAgentSpecificationProfileValidator
  implements Validator<ExtendedBusinessAgentSpecificationProfile>
{
  readonly #agentSpecificationValidator = new AgentSpecificationValidator();

  public validate(
    value: unknown,
  ): ValidationResult<ExtendedBusinessAgentSpecificationProfile> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "extended business agent specification profile must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, PROFILE_KEYS, issues, "");
    rejectSensitiveContent(record, issues, "");

    const agentId = readEnum<ExtendedBusinessAgentId>(
      record,
      "agentId",
      EXTENDED_BUSINESS_AGENT_IDS,
      issues,
      "",
    );
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "extended business agent specification profile must be non-executing",
        path: "nonExecuting",
      });
    }

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

    readRequiredString(record, "businessPurpose", issues, "", {
      maxLength: 500,
    });
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
    const requiredPermissions = readRequiredStringArray(
      record,
      "requiredPermissions",
      issues,
      "",
      false,
    );
    const businessValues = readEnumArray<AgentCompanyBusinessValue>(
      record,
      "businessValues",
      BUSINESS_VALUES,
      issues,
      "",
      false,
    );
    const forbiddenCapabilities =
      readEnumArray<AgentCompanyForbiddenCapability>(
        record,
        "forbiddenCapabilities",
        DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities,
        issues,
        "",
        false,
      );
    const guardianConsultationRequirements =
      readEnumArray<MainAssistantSafetyDomain>(
        record,
        "guardianConsultationRequirements",
        ["operator_safety", "cost", "security", "backup", "incident", "quality"],
        issues,
        "",
        false,
      );
    const approvalRequirements = readApprovalRequirements(
      record.approvalRequirements,
      issues,
      "approvalRequirements",
    );
    const memoryRequirements = readMemoryRequirements(
      record.memoryRequirements,
      issues,
      "memoryRequirements",
    );
    const knowledgeRequirements = readKnowledgeRequirements(
      record.knowledgeRequirements,
      issues,
      "knowledgeRequirements",
    );
    const futureToolDeclarations = readFutureToolDeclarations(
      record.futureToolDeclarations,
      issues,
      "futureToolDeclarations",
    );
    readRequiredStringArray(
      record,
      "failureModes",
      issues,
      "",
      false,
    );
    readRequiredStringArray(
      record,
      "qualityChecks",
      issues,
      "",
      false,
    );
    readRequiredStringArray(
      record,
      "escalationRules",
      issues,
      "",
      false,
    );
    readRequiredStringArray(
      record,
      "expectedOutputQualityBar",
      issues,
      "",
      false,
    );

    if (agentId !== undefined && agentSpecificationValidation.ok) {
      validateProfileInvariants(
        {
          agentId,
          agentSpecification: agentSpecificationValidation.value,
          approvalRequirements,
          businessValues,
          forbiddenCapabilities,
          futureToolDeclarations,
          guardianConsultationRequirements,
          knowledgeRequirements,
          memoryRequirements,
          nonResponsibilities,
          requiredPermissions,
          responsibilities,
          value: record,
        },
        issues,
      );
    }

    if (
      issues.length > 0 ||
      agentId === undefined ||
      nonExecuting !== true ||
      !agentSpecificationValidation.ok ||
      responsibilities === undefined ||
      nonResponsibilities === undefined ||
      requiredPermissions === undefined ||
      businessValues === undefined ||
      forbiddenCapabilities === undefined ||
      guardianConsultationRequirements === undefined ||
      approvalRequirements === undefined ||
      memoryRequirements === undefined ||
      knowledgeRequirements === undefined ||
      futureToolDeclarations === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess(value as ExtendedBusinessAgentSpecificationProfile);
  }
}

function validateProfileInvariants(
  input: {
    readonly agentId: ExtendedBusinessAgentId;
    readonly agentSpecification: AgentSpecification;
    readonly approvalRequirements: readonly AgentCompanyApprovalRequirement[] | undefined;
    readonly businessValues: readonly AgentCompanyBusinessValue[] | undefined;
    readonly forbiddenCapabilities: readonly AgentCompanyForbiddenCapability[] | undefined;
    readonly futureToolDeclarations:
      | readonly ExtendedBusinessFutureToolDeclaration[]
      | undefined;
    readonly guardianConsultationRequirements:
      | readonly MainAssistantSafetyDomain[]
      | undefined;
    readonly knowledgeRequirements:
      | readonly AgentCompanyKnowledgeRequirement[]
      | undefined;
    readonly memoryRequirements: readonly AgentCompanyMemoryRequirement[] | undefined;
    readonly nonResponsibilities: readonly string[] | undefined;
    readonly requiredPermissions: readonly string[] | undefined;
    readonly responsibilities: readonly string[] | undefined;
    readonly value: Readonly<Record<string, unknown>>;
  },
  issues: ValidationIssue[],
): void {
  const role = roleById(input.agentId);
  const specification = input.agentSpecification;

  if (specification.agentId !== input.agentId) {
    issues.push({
      code: "role_mapping_mismatch",
      message: "agentSpecification.agentId must match profile agentId",
      path: "agentSpecification.agentId",
    });
  }
  if (specification.name !== role.displayName) {
    issues.push({
      code: "role_mapping_mismatch",
      message: "agentSpecification.name must match Agent Company role",
      path: "agentSpecification.name",
    });
  }
  if (specification.mission !== role.operatorFacingPurpose) {
    issues.push({
      code: "role_mapping_mismatch",
      message: "agentSpecification.mission must match Agent Company role purpose",
      path: "agentSpecification.mission",
    });
  }
  if (specification.version !== EXTENDED_BUSINESS_AGENT_SPECIFICATION_VERSION) {
    issues.push({
      code: "invalid_version",
      message: "agentSpecification.version must match extended business specification version",
      path: "agentSpecification.version",
    });
  }
  if (specification.implementationRef !== `specification:${input.agentId}@1.0.0`) {
    issues.push({
      code: "role_mapping_mismatch",
      message: "agentSpecification.implementationRef must be deterministic",
      path: "agentSpecification.implementationRef",
    });
  }
  if (input.value.businessPurpose !== role.operatorFacingPurpose) {
    issues.push({
      code: "role_mapping_mismatch",
      message: "businessPurpose must match Agent Company role purpose",
      path: "businessPurpose",
    });
  }

  requireExactOrder(
    input.responsibilities,
    role.boundaries.responsibilities,
    "responsibilities",
    issues,
    "role_mapping_mismatch",
  );
  requireExactOrder(
    input.businessValues,
    role.businessValues,
    "businessValues",
    issues,
    "business_value_missing",
  );
  requireExactOrder(
    input.forbiddenCapabilities,
    role.forbiddenCapabilities,
    "forbiddenCapabilities",
    issues,
    "forbidden_capability_mismatch",
  );
  requireExactOrder(
    input.guardianConsultationRequirements,
    role.controlPlaneDependencies,
    "guardianConsultationRequirements",
    issues,
    "guardian_requirement_missing",
  );
  requireJsonEquivalent(
    input.approvalRequirements,
    role.approvalRequirements,
    "approvalRequirements",
    issues,
  );
  requireJsonEquivalent(
    input.memoryRequirements,
    role.memoryRequirements,
    "memoryRequirements",
    issues,
  );
  requireJsonEquivalent(
    input.knowledgeRequirements,
    role.knowledgeRequirements,
    "knowledgeRequirements",
    issues,
  );
  requireExactOrder(
    input.requiredPermissions,
    specification.capabilities.map(({ permission }) => permission),
    "requiredPermissions",
    issues,
    "permission_mismatch",
  );

  if (
    specification.capabilities.some(
      ({ capabilityType }) =>
        capabilityType === "tool.execute" || capabilityType === "tool.read",
    )
  ) {
    issues.push({
      code: "direct_tool_capability_forbidden",
      message: "business AgentSpecifications must not declare direct tool capabilities",
      path: "agentSpecification.capabilities",
    });
  }
  if (specification.limits.maxToolCalls !== 0) {
    issues.push({
      code: "direct_tool_capability_forbidden",
      message: "business AgentSpecifications must not allow tool calls",
      path: "agentSpecification.limits.maxToolCalls",
    });
  }

  validateSpecialSafetyPhrases(input.agentId, input.nonResponsibilities, issues);
  validateApprovalSensitiveBoundaries(role, specification, input, issues);
}

function validateApprovalSensitiveBoundaries(
  role: AgentCompanyRole,
  specification: AgentSpecification,
  input: {
    readonly approvalRequirements: readonly AgentCompanyApprovalRequirement[] | undefined;
    readonly futureToolDeclarations:
      | readonly ExtendedBusinessFutureToolDeclaration[]
      | undefined;
  },
  issues: ValidationIssue[],
): void {
  const requiresExternalApproval = REQUIRED_EXTERNAL_APPROVAL_CATEGORIES.has(
    role.category,
  );

  for (const [index, declaration] of
    input.futureToolDeclarations?.entries() ?? []) {
    if (
      declaration.sideEffect === "external_communication" &&
      !declaration.approvalRequired
    ) {
      issues.push({
        code: "approval_requirement_missing",
        message:
          "future external communication declarations require explicit approval markers",
        path: `futureToolDeclarations[${String(index)}].approvalRequired`,
      });
    }
  }

  if (!requiresExternalApproval) {
    return;
  }

  if (!hasExternalApproval(input.approvalRequirements ?? [])) {
    issues.push({
      code: "approval_requirement_missing",
      message:
        "external-facing business agents require approve-external-side-effects approval",
      path: "approvalRequirements",
    });
  }
  if (!hasWorkflowApprovalPolicy(specification)) {
    issues.push({
      code: "approval_requirement_missing",
      message:
        "external-facing business AgentSpecifications require approval policy for workflow proposals",
      path: "agentSpecification.policyRequirements",
    });
  }
}

function validateSpecialSafetyPhrases(
  agentId: ExtendedBusinessAgentId,
  nonResponsibilities: readonly string[] | undefined,
  issues: ValidationIssue[],
): void {
  const normalized = (nonResponsibilities ?? []).join(" ").toLocaleLowerCase();
  for (const phrase of SPECIAL_SAFETY_PHRASES[agentId]) {
    if (!normalized.includes(phrase.toLocaleLowerCase())) {
      issues.push({
        code: "safety_boundary_missing",
        message: `required safety boundary missing: ${phrase}`,
        path: "nonResponsibilities",
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

function hasWorkflowApprovalPolicy(
  specification: AgentSpecification,
): boolean {
  const workflowPermission = specification.capabilities.find(
    ({ capabilityType }) => capabilityType === "workflow.propose",
  )?.permission;
  if (workflowPermission === undefined) {
    return false;
  }

  return specification.policyRequirements.some(
    ({ permissions, requirementType }) =>
      requirementType === "approval" &&
      permissions.includes(workflowPermission),
  );
}

function readFutureToolDeclarations(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ExtendedBusinessFutureToolDeclaration[] | undefined {
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
      message: `${path} must contain at least one declaration`,
      path,
    });
    return undefined;
  }

  const declarations: ExtendedBusinessFutureToolDeclaration[] = [];
  for (const [index, entry] of value.entries()) {
    const declaration = readFutureToolDeclaration(
      entry,
      issues,
      `${path}[${String(index)}]`,
    );
    if (declaration !== undefined) {
      declarations.push(declaration);
    }
  }
  return declarations;
}

function readFutureToolDeclaration(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ExtendedBusinessFutureToolDeclaration | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, FUTURE_TOOL_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const toolId = readRequiredString(record, "toolId", issues, path);
  const purpose = readRequiredString(record, "purpose", issues, path, {
    maxLength: 500,
  });
  const mode = readEnum<ExtendedBusinessFutureToolMode>(
    record,
    "mode",
    FUTURE_TOOL_MODES,
    issues,
    path,
  );
  const sideEffect = readEnum<ExtendedBusinessFutureToolSideEffect>(
    record,
    "sideEffect",
    FUTURE_TOOL_SIDE_EFFECTS,
    issues,
    path,
  );
  const nonExecuting = readRequiredBoolean(
    record,
    "nonExecuting",
    issues,
    path,
  );
  const approvalRequired = readRequiredBoolean(
    record,
    "approvalRequired",
    issues,
    path,
  );
  if (nonExecuting === false) {
    issues.push({
      code: "invalid_value",
      message: "future tool declaration must be non-executing",
      path: `${path}.nonExecuting`,
    });
  }

  if (
    toolId === undefined ||
    purpose === undefined ||
    mode === undefined ||
    sideEffect === undefined ||
    nonExecuting !== true ||
    approvalRequired === undefined
  ) {
    return undefined;
  }

  return {
    approvalRequired,
    mode,
    nonExecuting,
    purpose,
    sideEffect,
    toolId,
  };
}

function readApprovalRequirements(
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

  return value as readonly AgentCompanyApprovalRequirement[];
}

function readMemoryRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyMemoryRequirement[] | undefined {
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
      message: `${path} must contain at least one memory requirement`,
      path,
    });
    return undefined;
  }
  return value as readonly AgentCompanyMemoryRequirement[];
}

function readKnowledgeRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentCompanyKnowledgeRequirement[] | undefined {
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
      message: `${path} must contain at least one knowledge requirement`,
      path,
    });
    return undefined;
  }
  return value as readonly AgentCompanyKnowledgeRequirement[];
}

function roleById(agentId: ExtendedBusinessAgentId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`Agent Company role missing: ${agentId}`);
  }
  return role;
}

function readEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
  pathPrefix: string,
): T | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix);
  if (value !== undefined && !allowed.includes(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${fieldPath(pathPrefix, key)} is not supported`,
      path: fieldPath(pathPrefix, key),
    });
    return undefined;
  }
  return value as T | undefined;
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
  for (const [index, value] of values.entries()) {
    if (!allowed.includes(value as T)) {
      issues.push({
        code: "invalid_value",
        message: `${path} contains an unsupported value`,
        path: `${path}[${String(index)}]`,
      });
    }
  }

  return values as readonly T[];
}

function requireExactOrder<T>(
  actual: readonly T[] | undefined,
  expected: readonly T[],
  path: string,
  issues: ValidationIssue[],
  code: string,
): void {
  if (actual === undefined) {
    return;
  }
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    issues.push({
      code,
      message: `${path} must match the Agent Company role map exactly`,
      path,
    });
  }
}

function requireJsonEquivalent(
  actual: unknown,
  expected: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push({
      code: "role_mapping_mismatch",
      message: `${path} must match the Agent Company role map exactly`,
      path,
    });
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
        message: `${path || "$"} contains sensitive or raw internal content`,
        path: path || "$",
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
        message: `${entryPath} is not allowed in business agent profiles`,
        path: entryPath,
      });
    }
    rejectSensitiveContent(entry, issues, entryPath);
  }
}

function prefixIssues(
  issues: readonly ValidationIssue[],
  prefix: string,
): readonly ValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path === "$" ? prefix : `${prefix}.${issue.path}`,
  }));
}

function fieldPath(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}
