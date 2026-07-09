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
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyBusinessValue,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import {
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
} from "./extended-business-agent-specifications.js";
import { INITIAL_CORE_AGENT_SPECIFICATIONS } from "./core-agent-specifications.js";
import {
  INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION,
  type ApprovalRole,
  type ConsultedRole,
  type ForbiddenRole,
  type PrimaryOwner,
  type ResponsibilityApprovalKind,
  type ResponsibilityArea,
  type ResponsibilityAreaId,
  type ResponsibilityConflict,
  type ResponsibilityConflictSeverity,
  type ResponsibilityDecisionPoint,
  type ResponsibilityMatrix,
  type ResponsibilityMatrixRole,
  type ResponsibilityRoleReference,
  type SupportingRole,
} from "./inter-agent-responsibility-matrix.js";

const MATRIX_KEYS = new Set([
  "areas",
  "contractVersion",
  "matrixId",
  "nonExecuting",
  "roles",
]);

const MATRIX_ROLE_KEYS = new Set([
  "agentId",
  "displayName",
  "specificationId",
  "version",
]);

const AREA_KEYS = new Set([
  "approvalRequired",
  "approvalRoles",
  "areaId",
  "businessValues",
  "conflicts",
  "consultedRoles",
  "description",
  "externalAction",
  "forbiddenRoles",
  "order",
  "primaryOwners",
  "supportingRoles",
  "title",
]);

const ROLE_REFERENCE_KEYS = new Set([
  "agentId",
  "rationale",
  "specificationId",
  "version",
]);

const PRIMARY_OWNER_KEYS = new Set([
  ...ROLE_REFERENCE_KEYS,
  "ownership",
]);

const SUPPORTING_ROLE_KEYS = new Set([
  ...ROLE_REFERENCE_KEYS,
  "supportType",
]);

const CONSULTED_ROLE_KEYS = new Set([
  ...ROLE_REFERENCE_KEYS,
  "requiredBefore",
]);

const APPROVAL_ROLE_KEYS = new Set([
  ...ROLE_REFERENCE_KEYS,
  "approvalKind",
  "requiredBefore",
]);

const FORBIDDEN_ROLE_KEYS = new Set([
  ...ROLE_REFERENCE_KEYS,
  "forbiddenReason",
]);

const CONFLICT_KEYS = new Set([
  "conflictId",
  "description",
  "involvedAgentIds",
  "resolution",
  "severity",
]);

const ROLE_IDS = DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId);

const AREA_IDS: readonly ResponsibilityAreaId[] = [
  "research",
  "market-analysis",
  "business-strategy",
  "offer-design",
  "pricing-support",
  "content-direction",
  "content-review",
  "implementation-planning",
  "knowledge-curation",
  "publishing-preparation",
  "sales-planning",
  "finance-cost-analysis",
  "legal-risk-review",
  "customer-delivery-preparation",
];

const BUSINESS_VALUES: readonly AgentCompanyBusinessValue[] = [
  "help_fabio_make_money",
  "improve_quality",
  "reduce_operational_work",
  "reduce_risk",
  "save_fabio_time",
];

const DECISION_POINTS: readonly ResponsibilityDecisionPoint[] = [
  "planning",
  "review",
  "final-output",
  "operator-approval",
  "external-action",
];

const APPROVAL_KINDS: readonly ResponsibilityApprovalKind[] = [
  "operator-approval-required",
  "specialist-review-required",
];

const CONFLICT_SEVERITIES: readonly ResponsibilityConflictSeverity[] = [
  "blocking",
  "warning",
];

const SUPPORT_TYPES: readonly SupportingRole["supportType"][] = [
  "analysis",
  "drafting",
  "evidence",
  "planning",
];

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

const SPECIFICATION_KEYS = new Set(
  [
    ...INITIAL_CORE_AGENT_SPECIFICATIONS,
    ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  ].map(({ agentId, version }) => `${agentId}@${version}`),
);

export class ResponsibilityMatrixValidator
  implements Validator<ResponsibilityMatrix>
{
  public validate(value: unknown): ValidationResult<ResponsibilityMatrix> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "responsibility matrix must be an object",
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
      contractVersion !== INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "responsibility matrix contractVersion must be 1",
        path: "contractVersion",
      });
    }
    readRequiredString(record, "matrixId", issues, "", { maxLength: 128 });
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "responsibility matrix must be non-executing",
        path: "nonExecuting",
      });
    }

    const roles = readMatrixRoles(record.roles, issues, "roles");
    const areas = readAreas(record.areas, issues, "areas");
    if (roles !== undefined) {
      validateMatrixRoles(roles, issues);
    }
    if (areas !== undefined) {
      validateAreas(areas, issues);
    }

    if (
      issues.length > 0 ||
      contractVersion !== INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION ||
      nonExecuting !== true ||
      roles === undefined ||
      areas === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess(value as ResponsibilityMatrix);
  }
}

export class ResponsibilityAreaValidator
  implements Validator<ResponsibilityArea>
{
  public validate(value: unknown): ValidationResult<ResponsibilityArea> {
    const issues: ValidationIssue[] = [];
    const area = readArea(value, issues, "$");
    if (area !== undefined) {
      validateArea(area, 0, issues, { enforceGlobalOrder: false });
    }
    return issues.length > 0 || area === undefined
      ? validationFailure(issues)
      : validationSuccess(value as ResponsibilityArea);
  }
}

export class ResponsibilityConflictValidator
  implements Validator<ResponsibilityConflict>
{
  public validate(value: unknown): ValidationResult<ResponsibilityConflict> {
    const issues: ValidationIssue[] = [];
    const conflict = readConflict(value, issues, "$");
    return issues.length > 0 || conflict === undefined
      ? validationFailure(issues)
      : validationSuccess(value as ResponsibilityConflict);
  }
}

function validateMatrixRoles(
  roles: readonly ResponsibilityMatrixRole[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    roles.map(({ agentId }) => agentId),
    ROLE_IDS,
    "roles",
    issues,
    "not_deterministic",
  );

  for (const [index, role] of roles.entries()) {
    const expected = roleById(role.agentId);
    if (role.displayName !== expected.displayName) {
      issues.push({
        code: "role_mapping_mismatch",
        message: "matrix role displayName must match Agent Company role",
        path: `roles[${String(index)}].displayName`,
      });
    }
    validateSpecificationMapping(role, issues, `roles[${String(index)}]`);
  }
}

function validateAreas(
  areas: readonly ResponsibilityArea[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    areas.map(({ areaId }) => areaId),
    AREA_IDS,
    "areas",
    issues,
    "not_deterministic",
  );
  for (const [index, area] of areas.entries()) {
    validateArea(area, index, issues, { enforceGlobalOrder: true });
  }
}

function validateArea(
  area: ResponsibilityArea,
  index: number,
  issues: ValidationIssue[],
  options: { readonly enforceGlobalOrder: boolean },
): void {
  if (options.enforceGlobalOrder && area.order !== index + 1) {
    issues.push({
      code: "not_deterministic",
      message: "responsibility areas must use deterministic 1-based order",
      path: `areas[${String(index)}].order`,
    });
  }

  if (area.primaryOwners.length === 0) {
    issues.push({
      code: "owner_missing",
      message: "responsibility area requires exactly one primary owner",
      path: areaPath(index, "primaryOwners", options),
    });
  }
  if (area.primaryOwners.length > 1) {
    issues.push({
      code: "duplicate_primary_owner",
      message: "responsibility area must not have multiple primary owners",
      path: areaPath(index, "primaryOwners", options),
    });
  }

  validateRoleOrder(
    area.primaryOwners,
    areaPath(index, "primaryOwners", options),
    issues,
  );
  validateRoleOrder(
    area.supportingRoles,
    areaPath(index, "supportingRoles", options),
    issues,
  );
  validateRoleOrder(
    area.consultedRoles,
    areaPath(index, "consultedRoles", options),
    issues,
  );
  validateRoleOrder(
    area.approvalRoles,
    areaPath(index, "approvalRoles", options),
    issues,
  );
  validateRoleOrder(
    area.forbiddenRoles,
    areaPath(index, "forbiddenRoles", options),
    issues,
  );

  const primaryOwner = area.primaryOwners[0];
  const forbiddenIds = new Set(area.forbiddenRoles.map(({ agentId }) => agentId));
  if (primaryOwner !== undefined && forbiddenIds.has(primaryOwner.agentId)) {
    issues.push({
      code: "forbidden_ownership",
      message: "primary owner must not also be forbidden",
      path: areaPath(index, "forbiddenRoles", options),
    });
  }

  const assignments = [
    ["supportingRoles", area.supportingRoles],
    ["consultedRoles", area.consultedRoles],
    ["approvalRoles", area.approvalRoles],
  ] as const;
  if (primaryOwner !== undefined) {
    for (const [path, roles] of assignments) {
      if (roles.some(({ agentId }) => agentId === primaryOwner.agentId)) {
        issues.push({
          code: "unclear_ownership",
          message:
            "primary owner must not also be supporting, consulted, or approval role",
          path: areaPath(index, path, options),
        });
      }
    }
  }

  if (area.externalAction && !area.approvalRequired) {
    issues.push({
      code: "approval_requirement_missing",
      message: "external-action responsibility areas require approval",
      path: areaPath(index, "approvalRequired", options),
    });
  }
  if ((area.approvalRequired || area.externalAction) && area.approvalRoles.length === 0) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-required areas require at least one approval role",
      path: areaPath(index, "approvalRoles", options),
    });
  }
}

function readMatrixRoles(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ResponsibilityMatrixRole[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const roles: ResponsibilityMatrixRole[] = [];
  for (const [index, entry] of value.entries()) {
    const role = readMatrixRole(entry, issues, `${path}[${String(index)}]`);
    if (role !== undefined) {
      roles.push(role);
    }
  }
  return roles;
}

function readMatrixRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ResponsibilityMatrixRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, MATRIX_ROLE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const agentId = readAgentCompanyRoleId(record, "agentId", issues, path);
  const displayName = readRequiredString(record, "displayName", issues, path);
  const specificationId = readRequiredString(
    record,
    "specificationId",
    issues,
    path,
  );
  const version = readRequiredString(record, "version", issues, path);
  if (
    agentId === undefined ||
    displayName === undefined ||
    specificationId === undefined ||
    version === undefined
  ) {
    return undefined;
  }
  return {
    agentId,
    displayName,
    specificationId,
    version,
  };
}

function readAreas(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ResponsibilityArea[] | undefined {
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
      message: `${path} must contain at least one responsibility area`,
      path,
    });
    return undefined;
  }

  const areas: ResponsibilityArea[] = [];
  for (const [index, entry] of value.entries()) {
    const area = readArea(entry, issues, `${path}[${String(index)}]`);
    if (area !== undefined) {
      areas.push(area);
    }
  }
  validateUnique(
    areas.map(({ areaId }) => areaId),
    "areaId",
    path,
    issues,
  );
  return areas;
}

function readArea(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ResponsibilityArea | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, AREA_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const areaId = readEnum<ResponsibilityAreaId>(
    record,
    "areaId",
    AREA_IDS,
    issues,
    path,
  );
  const order = readRequiredInteger(record, "order", issues, path, 1);
  const title = readRequiredString(record, "title", issues, path);
  const description = readRequiredString(record, "description", issues, path);
  const approvalRequired = readRequiredBoolean(
    record,
    "approvalRequired",
    issues,
    path,
  );
  const externalAction = readRequiredBoolean(
    record,
    "externalAction",
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
  const consultedRoles = readConsultedRoles(
    record.consultedRoles,
    issues,
    `${path}.consultedRoles`,
  );
  const approvalRoles = readApprovalRoles(
    record.approvalRoles,
    issues,
    `${path}.approvalRoles`,
  );
  const forbiddenRoles = readForbiddenRoles(
    record.forbiddenRoles,
    issues,
    `${path}.forbiddenRoles`,
  );
  const conflicts = readConflicts(record.conflicts, issues, `${path}.conflicts`);

  if (
    areaId === undefined ||
    order === undefined ||
    title === undefined ||
    description === undefined ||
    approvalRequired === undefined ||
    externalAction === undefined ||
    businessValues === undefined ||
    primaryOwners === undefined ||
    supportingRoles === undefined ||
    consultedRoles === undefined ||
    approvalRoles === undefined ||
    forbiddenRoles === undefined ||
    conflicts === undefined
  ) {
    return undefined;
  }

  return {
    approvalRequired,
    approvalRoles,
    areaId,
    businessValues,
    conflicts,
    consultedRoles,
    description,
    externalAction,
    forbiddenRoles,
    order,
    primaryOwners,
    supportingRoles,
    title,
  };
}

function readPrimaryOwners(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly PrimaryOwner[] | undefined {
  return readRoleArray(value, issues, path, readPrimaryOwner);
}

function readPrimaryOwner(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): PrimaryOwner | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, PRIMARY_OWNER_KEYS, issues, path);
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
): readonly SupportingRole[] | undefined {
  return readRoleArray(value, issues, path, readSupportingRole);
}

function readSupportingRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): SupportingRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, SUPPORTING_ROLE_KEYS, issues, path);
  const reference = readRoleReference(record, issues, path);
  const supportType = readEnum<SupportingRole["supportType"]>(
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

function readConsultedRoles(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ConsultedRole[] | undefined {
  return readRoleArray(value, issues, path, readConsultedRole);
}

function readConsultedRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ConsultedRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, CONSULTED_ROLE_KEYS, issues, path);
  const reference = readRoleReference(record, issues, path);
  const requiredBefore = readEnumArray<ResponsibilityDecisionPoint>(
    record,
    "requiredBefore",
    DECISION_POINTS,
    issues,
    path,
    false,
  );
  return reference === undefined || requiredBefore === undefined
    ? undefined
    : { ...reference, requiredBefore };
}

function readApprovalRoles(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ApprovalRole[] | undefined {
  return readRoleArray(value, issues, path, readApprovalRole);
}

function readApprovalRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ApprovalRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, APPROVAL_ROLE_KEYS, issues, path);
  const reference = readRoleReference(record, issues, path);
  const approvalKind = readEnum<ResponsibilityApprovalKind>(
    record,
    "approvalKind",
    APPROVAL_KINDS,
    issues,
    path,
  );
  const requiredBefore = readEnumArray<ResponsibilityDecisionPoint>(
    record,
    "requiredBefore",
    DECISION_POINTS,
    issues,
    path,
    false,
  );
  return reference === undefined ||
    approvalKind === undefined ||
    requiredBefore === undefined
    ? undefined
    : { ...reference, approvalKind, requiredBefore };
}

function readForbiddenRoles(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ForbiddenRole[] | undefined {
  return readRoleArray(value, issues, path, readForbiddenRole);
}

function readForbiddenRole(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ForbiddenRole | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, FORBIDDEN_ROLE_KEYS, issues, path);
  const reference = readRoleReference(record, issues, path);
  const forbiddenReason = readRequiredString(
    record,
    "forbiddenReason",
    issues,
    path,
  );
  return reference === undefined || forbiddenReason === undefined
    ? undefined
    : { ...reference, forbiddenReason };
}

function readRoleArray<T extends ResponsibilityRoleReference>(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  reader: (
    value: unknown,
    issues: ValidationIssue[],
    path: string,
  ) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const roles: T[] = [];
  for (const [index, entry] of value.entries()) {
    const role = reader(entry, issues, `${path}[${String(index)}]`);
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

function readRoleReference(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
  path: string,
): ResponsibilityRoleReference | undefined {
  rejectSensitiveContent(record, issues, path);
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

function readConflicts(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly ResponsibilityConflict[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const conflicts: ResponsibilityConflict[] = [];
  for (const [index, entry] of value.entries()) {
    const conflict = readConflict(entry, issues, `${path}[${String(index)}]`);
    if (conflict !== undefined) {
      conflicts.push(conflict);
    }
  }
  validateUnique(
    conflicts.map(({ conflictId }) => conflictId),
    "conflictId",
    path,
    issues,
  );
  return conflicts;
}

function readConflict(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): ResponsibilityConflict | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, CONFLICT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const conflictId = readRequiredString(record, "conflictId", issues, path);
  const description = readRequiredString(record, "description", issues, path);
  const involvedAgentIds = readEnumArray<AgentCompanyRoleId>(
    record,
    "involvedAgentIds",
    ROLE_IDS,
    issues,
    path,
    false,
  );
  const resolution = readRequiredString(record, "resolution", issues, path);
  const severity = readEnum<ResponsibilityConflictSeverity>(
    record,
    "severity",
    CONFLICT_SEVERITIES,
    issues,
    path,
  );
  if (involvedAgentIds !== undefined && involvedAgentIds.length < 2) {
    issues.push({
      code: "invalid_value",
      message: "responsibility conflicts require at least two involved agents",
      path: `${path}.involvedAgentIds`,
    });
  }
  if (involvedAgentIds !== undefined) {
    requireExactOrder(
      involvedAgentIds,
      sortRoleIds(involvedAgentIds),
      `${path}.involvedAgentIds`,
      issues,
      "not_deterministic",
    );
  }
  if (
    conflictId === undefined ||
    description === undefined ||
    involvedAgentIds === undefined ||
    involvedAgentIds.length < 2 ||
    resolution === undefined ||
    severity === undefined
  ) {
    return undefined;
  }
  return {
    conflictId,
    description,
    involvedAgentIds,
    resolution,
    severity,
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
      message: "responsibility matrix references an AgentSpecification that is not registered in source",
      path: `${path}.agentId`,
    });
  }
}

function validateRoleOrder(
  roles: readonly ResponsibilityRoleReference[],
  path: string,
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    roles.map(({ agentId }) => agentId),
    sortRoleIds(roles.map(({ agentId }) => agentId)),
    path,
    issues,
    "not_deterministic",
  );
}

function sortRoleIds(
  roleIds: readonly AgentCompanyRoleId[],
): readonly AgentCompanyRoleId[] {
  return [...roleIds].sort(
    (left, right) => ROLE_IDS.indexOf(left) - ROLE_IDS.indexOf(right),
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

function roleById(agentId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`Agent Company role missing: ${agentId}`);
  }
  return role;
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
      message: `${path} must be deterministic`,
      path,
    });
  }
}

function validateUnique(
  values: readonly string[],
  label: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicate ${label} values`,
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
        message: `${entryPath} is not allowed in responsibility matrix records`,
        path: entryPath,
      });
    }
    rejectSensitiveContent(entry, issues, entryPath);
  }
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

function areaPath(
  index: number,
  path: string,
  options: { readonly enforceGlobalOrder: boolean },
): string {
  return options.enforceGlobalOrder ? `areas[${String(index)}].${path}` : path;
}

function fieldPath(prefix: string, key: string): string {
  return prefix.length === 0 || prefix === "$" ? `${prefix === "$" ? "$." : ""}${key}` : `${prefix}.${key}`;
}
