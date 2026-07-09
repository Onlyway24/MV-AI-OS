import {
  readRequiredBoolean,
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
  type AgentCompanyCapabilityApprovalRequirement,
  type AgentCompanyCapabilityGuardianRequirement,
  type AgentCompanyCapabilityId,
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
  type AgentCompanyPermissionRuleId,
} from "./agent-permission-matrix.js";
import {
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  type ResponsibilityAreaId,
} from "./inter-agent-responsibility-matrix.js";
import {
  AGENT_HANDOFF_CONTRACT_VERSION,
  AGENT_HANDOFF_IDS,
  AGENT_HANDOFF_TYPES,
  type AgentHandoffBusinessContext,
  type AgentHandoffContractSet,
  type AgentHandoffEvidenceQuality,
  type AgentHandoffEvidenceSummary,
  type AgentHandoffExpectedOutput,
  type AgentHandoffExpectedOutputKind,
  type AgentHandoffFutureToolRelevance,
  type AgentHandoffFutureWorkflowRelevance,
  type AgentHandoffId,
  type AgentHandoffMarketInsightSummary,
  type AgentHandoffOpportunitySummary,
  type AgentHandoffPayloadSummary,
  type AgentHandoffReason,
  type AgentHandoffRequest,
  type AgentHandoffResult,
  type AgentHandoffResultReasonCode,
  type AgentHandoffRiskLevel,
  type AgentHandoffRoleReference,
  type AgentHandoffStatus,
  type AgentHandoffType,
  type AgentHandoffUncertaintyLevel,
} from "./agent-handoff-contracts.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

const SET_KEYS = new Set([
  "contractVersion",
  "handoffs",
  "nonExecuting",
  "setId",
]);

const REQUEST_KEYS = new Set([
  "approvalRequired",
  "approvalRequirements",
  "blockedContentRules",
  "contractVersion",
  "expectedOutput",
  "futureTool",
  "futureWorkflow",
  "guardianRequired",
  "guardianRequirements",
  "handoffId",
  "handoffType",
  "nonExecuting",
  "payloadSummary",
  "reason",
  "relatedCapabilityIds",
  "relatedPermissionRuleIds",
  "relatedResponsibilityAreaIds",
  "riskLevel",
  "source",
  "target",
]);

const ROLE_REFERENCE_KEYS = new Set([
  "agentId",
  "specificationId",
  "version",
]);

const PAYLOAD_KEYS = new Set([
  "businessContext",
  "evidenceSummary",
  "marketInsightSummary",
  "opportunitySummary",
  "summary",
]);

const BUSINESS_CONTEXT_KEYS = new Set([
  "assumptions",
  "objectiveSummary",
  "operationalConstraints",
  "recommendedNextStep",
  "riskNotes",
  "targetCustomerProfile",
  "valueProposition",
]);

const MARKET_INSIGHT_KEYS = new Set([
  "commonObjections",
  "competitorSummary",
  "customerBehaviorSignals",
  "localTrendSummary",
  "marketWeaknessSummary",
  "pricingSensitivity",
  "restaurantOwnerNeeds",
  "restaurantPainPoints",
  "unmetDemandSummary",
]);

const OPPORTUNITY_KEYS = new Set([
  "opportunityGaps",
  "positioningAngles",
  "recommendedNextBusinessQuestion",
]);

const EVIDENCE_KEYS = new Set([
  "evidenceNotes",
  "evidenceQuality",
  "uncertaintyLevel",
  "uncertaintyNotes",
]);

const EXPECTED_OUTPUT_KEYS = new Set([
  "description",
  "outputKind",
  "requiredSections",
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

const RESULT_KEYS = new Set([
  "contractVersion",
  "handoffId",
  "nonExecuting",
  "reasonCode",
  "safeMessage",
  "status",
]);

const ROLE_IDS = DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId);
const RESPONSIBILITY_AREA_IDS = DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.map(
  ({ areaId }) => areaId,
);

const REASONS: readonly AgentHandoffReason[] = [
  "approval_preparation",
  "business_strategy_support",
  "customer_delivery_review",
  "evidence_transfer",
  "knowledge_context_support",
  "market_opportunity_support",
  "offer_design_support",
  "pricing_review",
  "publishing_preparation",
  "quality_review",
  "risk_review",
  "sales_preparation",
  "technical_knowledge_support",
];

const RISK_LEVELS: readonly AgentHandoffRiskLevel[] = [
  "low",
  "medium",
  "high",
];

const EVIDENCE_QUALITIES: readonly AgentHandoffEvidenceQuality[] = [
  "high",
  "low",
  "medium",
  "unknown",
];

const UNCERTAINTY_LEVELS: readonly AgentHandoffUncertaintyLevel[] = [
  "high",
  "low",
  "medium",
  "unknown",
];

const OUTPUT_KINDS: readonly AgentHandoffExpectedOutputKind[] = [
  "approval_package",
  "business_strategy_brief",
  "content_direction_brief",
  "customer_delivery_review",
  "knowledge_context_brief",
  "market_opportunity_brief",
  "offer_design_brief",
  "pricing_review_brief",
  "publishing_preparation_brief",
  "quality_review_brief",
  "risk_review_brief",
  "sales_preparation_brief",
];

const STATUSES: readonly AgentHandoffStatus[] = [
  "accepted",
  "blocked",
  "forbidden_handoff",
  "insufficient_evidence",
  "invalid_source",
  "invalid_target",
  "missing_capability",
  "missing_permission",
  "missing_responsibility_mapping",
  "non_execution_confirmed",
  "rejected",
  "requires_fabio_approval",
  "requires_guardian_review",
  "unclear_expected_output",
  "unsafe_external_implication",
  "unsafe_payload",
];

const RESULT_REASONS: readonly AgentHandoffResultReasonCode[] = [
  "accepted_non_executing",
  "approval_required",
  "blocked_by_policy",
  "forbidden_pair",
  "guardian_required",
  "insufficient_evidence",
  "invalid_contract",
  "missing_alignment",
  "unsafe_content",
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

const APPROVAL_SENSITIVE_TYPES = new Set<AgentHandoffType>([
  "business_to_pricing_review",
  "business_to_sales_preparation",
  "content_to_publishing_preparation",
  "content_to_legal_risk_review",
  "finance_to_pricing_review",
  "legal_risk_to_sales_review",
  "legal_risk_to_customer_delivery_review",
  "customer_delivery_to_quality_review",
  "publisher_to_fabio_approval_package",
  "sales_to_fabio_approval_package",
  "customer_delivery_to_fabio_approval_package",
]);

const GUARDIAN_SENSITIVE_TYPES = new Set<AgentHandoffType>([
  ...AGENT_HANDOFF_TYPES,
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
  /\braw\s+(?:prompt|completion|transcript|knowledge|memory|customer|legal|personal|data)\b/iu,
  /\bsecret(?:Ref|Reference|Value)?\b/u,
  /\bproviderPayload\b/u,
  /\btransportInternals\b/u,
  /\/Users\/[^\s]+/u,
];

const UNSAFE_TEXT_PATTERNS: readonly RegExp[] = [
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

const SPECIFICATION_KEYS = new Set(
  [
    ...INITIAL_CORE_AGENT_SPECIFICATIONS,
    ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  ].map(({ agentId, version }) => `${agentId}@${version}`),
);

export class AgentHandoffContractSetValidator
  implements Validator<AgentHandoffContractSet>
{
  public validate(value: unknown): ValidationResult<AgentHandoffContractSet> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent handoff contract set must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, SET_KEYS, issues, "");
    rejectSensitiveContent(record, issues, "");

    const contractVersion = readRequiredString(record, "contractVersion", issues);
    if (
      contractVersion !== undefined &&
      contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: "agent handoff contractVersion must be 1",
        path: "contractVersion",
      });
    }
    readRequiredString(record, "setId", issues, "", { maxLength: 128 });
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "agent handoff contract set must be non-executing",
        path: "nonExecuting",
      });
    }

    const handoffs = readHandoffs(record.handoffs, issues, "handoffs");
    if (handoffs !== undefined) {
      validateHandoffSet(handoffs, issues);
    }

    if (
      issues.length > 0 ||
      contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION ||
      nonExecuting !== true ||
      handoffs === undefined
    ) {
      return validationFailure(issues);
    }
    return validationSuccess(value as AgentHandoffContractSet);
  }
}

export class AgentHandoffRequestValidator
  implements Validator<AgentHandoffRequest>
{
  public validate(value: unknown): ValidationResult<AgentHandoffRequest> {
    const issues: ValidationIssue[] = [];
    const request = readHandoffRequest(value, issues, "$");
    if (request !== undefined) {
      validateHandoffRequest(request, 0, issues, { enforceGlobalOrder: false });
    }
    return issues.length > 0 || request === undefined
      ? validationFailure(issues)
      : validationSuccess(value as AgentHandoffRequest);
  }
}

export class AgentHandoffResultValidator
  implements Validator<AgentHandoffResult>
{
  public validate(value: unknown): ValidationResult<AgentHandoffResult> {
    const issues: ValidationIssue[] = [];
    const result = readHandoffResult(value, issues, "$");
    return issues.length > 0 || result === undefined
      ? validationFailure(issues)
      : validationSuccess(value as AgentHandoffResult);
  }
}

function validateHandoffSet(
  handoffs: readonly AgentHandoffRequest[],
  issues: ValidationIssue[],
): void {
  requireExactOrder(
    handoffs.map(({ handoffId }) => handoffId),
    AGENT_HANDOFF_IDS,
    "handoffs",
    issues,
  );
  requireExactOrder(
    handoffs.map(({ handoffType }) => handoffType),
    AGENT_HANDOFF_TYPES,
    "handoffs",
    issues,
  );
  for (const [index, request] of handoffs.entries()) {
    validateHandoffRequest(request, index, issues, { enforceGlobalOrder: true });
  }
}

function validateHandoffRequest(
  request: AgentHandoffRequest,
  index: number,
  issues: ValidationIssue[],
  options: { readonly enforceGlobalOrder: boolean },
): void {
  const pathPrefix = options.enforceGlobalOrder
    ? `handoffs[${String(index)}]`
    : "$";
  if (request.handoffId !== `${request.handoffType}-handoff`) {
    issues.push({
      code: "handoff_mapping_mismatch",
      message: "handoffId must match handoffType",
      path: `${pathPrefix}.handoffId`,
    });
  }
  validateSpecificationMapping(request.source, issues, `${pathPrefix}.source`);
  validateSpecificationMapping(request.target, issues, `${pathPrefix}.target`);
  if (request.source.agentId === request.target.agentId) {
    issues.push({
      code: "forbidden_handoff",
      message: "handoff source and target must be different Agent Company roles",
      path: pathPrefix,
    });
  }
  validateAlignment(request, pathPrefix, issues);
  validateExpectedOutput(request, pathPrefix, issues);
  validateApprovalRules(request, pathPrefix, issues);
  validateGuardianRules(request, pathPrefix, issues);
  rejectUnsafeWording(request, pathPrefix, issues);
}

function validateAlignment(
  request: AgentHandoffRequest,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  if (request.relatedCapabilityIds.length === 0) {
    issues.push({
      code: "missing_capability",
      message: "handoff requires at least one related capability",
      path: `${pathPrefix}.relatedCapabilityIds`,
    });
  }
  if (request.relatedPermissionRuleIds.length === 0) {
    issues.push({
      code: "missing_permission",
      message: "handoff requires at least one related permission rule",
      path: `${pathPrefix}.relatedPermissionRuleIds`,
    });
  }
  if (request.relatedResponsibilityAreaIds.length === 0) {
    issues.push({
      code: "missing_responsibility_mapping",
      message: "handoff requires at least one related responsibility area",
      path: `${pathPrefix}.relatedResponsibilityAreaIds`,
    });
  }

  const capabilityIdsFromPermissions = request.relatedPermissionRuleIds.map(
    permissionCapabilityId,
  );
  for (const capabilityId of capabilityIdsFromPermissions) {
    if (!request.relatedCapabilityIds.includes(capabilityId)) {
      issues.push({
        code: "missing_capability",
        message: "related permission rules must map to related capability IDs",
        path: `${pathPrefix}.relatedPermissionRuleIds`,
      });
    }
  }

  const relatedParticipants = participantsForAreas(request.relatedResponsibilityAreaIds);
  if (
    !relatedParticipants.has(request.source.agentId) ||
    !relatedParticipants.has(request.target.agentId)
  ) {
    issues.push({
      code: "missing_responsibility_mapping",
      message:
        "related responsibility areas must cover both source and target roles",
      path: `${pathPrefix}.relatedResponsibilityAreaIds`,
    });
  }
}

function validateExpectedOutput(
  request: AgentHandoffRequest,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  if (request.expectedOutput.requiredSections.length === 0) {
    issues.push({
      code: "unclear_expected_output",
      message: "handoff expected output must declare required sections",
      path: `${pathPrefix}.expectedOutput.requiredSections`,
    });
  }
}

function validateApprovalRules(
  request: AgentHandoffRequest,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const approvalSensitive =
    request.approvalRequired ||
    request.futureTool.approvalSensitive ||
    request.futureWorkflow.approvalSensitive ||
    APPROVAL_SENSITIVE_TYPES.has(request.handoffType);
  if (approvalSensitive && !request.approvalRequired) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive handoffs require Fabio approval markers",
      path: `${pathPrefix}.approvalRequired`,
    });
  }
  if (approvalSensitive && request.approvalRequirements.length === 0) {
    issues.push({
      code: "approval_requirement_missing",
      message: "approval-sensitive handoffs require at least one approval requirement",
      path: `${pathPrefix}.approvalRequirements`,
    });
  }
}

function validateGuardianRules(
  request: AgentHandoffRequest,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const guardianSensitive =
    request.guardianRequired ||
    request.futureTool.guardianSensitive ||
    request.futureWorkflow.guardianSensitive ||
    request.riskLevel === "high" ||
    GUARDIAN_SENSITIVE_TYPES.has(request.handoffType);
  if (guardianSensitive && !request.guardianRequired) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive handoffs require guardian markers",
      path: `${pathPrefix}.guardianRequired`,
    });
  }
  if (guardianSensitive && request.guardianRequirements.length === 0) {
    issues.push({
      code: "guardian_requirement_missing",
      message: "guardian-sensitive handoffs require at least one guardian requirement",
      path: `${pathPrefix}.guardianRequirements`,
    });
  }
}

function rejectUnsafeWording(
  request: AgentHandoffRequest,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  const text = [
    request.payloadSummary.summary,
    request.payloadSummary.businessContext.objectiveSummary,
    request.payloadSummary.businessContext.recommendedNextStep,
    request.expectedOutput.description,
    ...request.expectedOutput.requiredSections,
  ].join("\n");
  if (UNSAFE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "unsafe_handoff",
      message: "handoff text must not imply execution, autonomy, runtime access, or unsafe side effects",
      path: pathPrefix,
    });
  }
}

function readHandoffs(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly AgentHandoffRequest[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  const handoffs: AgentHandoffRequest[] = [];
  for (const [index, entry] of value.entries()) {
    const handoff = readHandoffRequest(entry, issues, `${path}[${String(index)}]`);
    if (handoff !== undefined) {
      handoffs.push(handoff);
    }
  }
  validateUnique(handoffs.map(({ handoffId }) => handoffId), "handoffId", path, issues);
  return handoffs;
}

function readHandoffRequest(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffRequest | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, REQUEST_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);

  const approvalRequired = readRequiredBoolean(record, "approvalRequired", issues, path);
  const approvalRequirements = readApprovalRequirements(
    record.approvalRequirements,
    issues,
    `${path}.approvalRequirements`,
  );
  const blockedContentRules = readStringArray(
    record,
    "blockedContentRules",
    issues,
    path,
    false,
  );
  const contractVersion = readRequiredString(record, "contractVersion", issues, path);
  if (
    contractVersion !== undefined &&
    contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: "handoff request contractVersion must be 1",
      path: `${path}.contractVersion`,
    });
  }
  const expectedOutput = readExpectedOutput(
    record.expectedOutput,
    issues,
    `${path}.expectedOutput`,
  );
  const futureTool = readFutureTool(record.futureTool, issues, `${path}.futureTool`);
  const futureWorkflow = readFutureWorkflow(
    record.futureWorkflow,
    issues,
    `${path}.futureWorkflow`,
  );
  const guardianRequired = readRequiredBoolean(record, "guardianRequired", issues, path);
  const guardianRequirements = readGuardianRequirements(
    record.guardianRequirements,
    issues,
    `${path}.guardianRequirements`,
  );
  const handoffId = readEnum<AgentHandoffId>(
    record,
    "handoffId",
    AGENT_HANDOFF_IDS,
    issues,
    path,
  );
  const handoffType = readEnum<AgentHandoffType>(
    record,
    "handoffType",
    AGENT_HANDOFF_TYPES,
    issues,
    path,
  );
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_handoff",
      message: "handoff request must be non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const payloadSummary = readPayloadSummary(
    record.payloadSummary,
    issues,
    `${path}.payloadSummary`,
  );
  const reason = readEnum<AgentHandoffReason>(
    record,
    "reason",
    REASONS,
    issues,
    path,
  );
  const relatedCapabilityIds = readEnumArray<AgentCompanyCapabilityId>(
    record,
    "relatedCapabilityIds",
    AGENT_COMPANY_CAPABILITY_IDS,
    issues,
    path,
    false,
  );
  const relatedPermissionRuleIds = readEnumArray<AgentCompanyPermissionRuleId>(
    record,
    "relatedPermissionRuleIds",
    AGENT_COMPANY_PERMISSION_RULE_IDS,
    issues,
    path,
    false,
  );
  const relatedResponsibilityAreaIds = readEnumArray<ResponsibilityAreaId>(
    record,
    "relatedResponsibilityAreaIds",
    RESPONSIBILITY_AREA_IDS,
    issues,
    path,
    false,
  );
  const riskLevel = readEnum<AgentHandoffRiskLevel>(
    record,
    "riskLevel",
    RISK_LEVELS,
    issues,
    path,
  );
  const source = readRoleReference(record.source, issues, `${path}.source`);
  const target = readRoleReference(record.target, issues, `${path}.target`);

  if (
    approvalRequired === undefined ||
    approvalRequirements === undefined ||
    blockedContentRules === undefined ||
    contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION ||
    expectedOutput === undefined ||
    futureTool === undefined ||
    futureWorkflow === undefined ||
    guardianRequired === undefined ||
    guardianRequirements === undefined ||
    handoffId === undefined ||
    handoffType === undefined ||
    nonExecuting !== true ||
    payloadSummary === undefined ||
    reason === undefined ||
    relatedCapabilityIds === undefined ||
    relatedPermissionRuleIds === undefined ||
    relatedResponsibilityAreaIds === undefined ||
    riskLevel === undefined ||
    source === undefined ||
    target === undefined
  ) {
    return undefined;
  }

  return {
    approvalRequired,
    approvalRequirements,
    blockedContentRules,
    contractVersion,
    expectedOutput,
    futureTool,
    futureWorkflow,
    guardianRequired,
    guardianRequirements,
    handoffId,
    handoffType,
    nonExecuting,
    payloadSummary,
    reason,
    relatedCapabilityIds,
    relatedPermissionRuleIds,
    relatedResponsibilityAreaIds,
    riskLevel,
    source,
    target,
  };
}

function readRoleReference(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffRoleReference | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, ROLE_REFERENCE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const agentId = readEnum<AgentCompanyRoleId>(record, "agentId", ROLE_IDS, issues, path);
  const specificationId = readRequiredString(record, "specificationId", issues, path);
  const version = readRequiredString(record, "version", issues, path);
  if (agentId !== undefined && specificationId !== undefined && version !== undefined) {
    validateSpecificationMapping({ agentId, specificationId, version }, issues, path);
  }
  if (agentId === undefined || specificationId === undefined || version === undefined) {
    return undefined;
  }
  return {
    agentId,
    specificationId,
    version,
  };
}

function readPayloadSummary(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffPayloadSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, PAYLOAD_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const summary = readRequiredString(record, "summary", issues, path, { maxLength: 1_200 });
  const businessContext = readBusinessContext(
    record.businessContext,
    issues,
    `${path}.businessContext`,
  );
  const evidenceSummary = readEvidenceSummary(
    record.evidenceSummary,
    issues,
    `${path}.evidenceSummary`,
  );
  const marketInsightSummary = readOptionalMarketInsightSummary(
    record.marketInsightSummary,
    issues,
    `${path}.marketInsightSummary`,
  );
  const opportunitySummary = readOptionalOpportunitySummary(
    record.opportunitySummary,
    issues,
    `${path}.opportunitySummary`,
  );
  if (
    businessContext === undefined ||
    evidenceSummary === undefined ||
    summary === undefined
  ) {
    return undefined;
  }
  return {
    businessContext,
    evidenceSummary,
    ...(marketInsightSummary === undefined ? {} : { marketInsightSummary }),
    ...(opportunitySummary === undefined ? {} : { opportunitySummary }),
    summary,
  };
}

function readBusinessContext(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffBusinessContext | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, BUSINESS_CONTEXT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const assumptions = readStringArray(record, "assumptions", issues, path, false);
  const objectiveSummary = readRequiredString(record, "objectiveSummary", issues, path);
  const operationalConstraints = readStringArray(
    record,
    "operationalConstraints",
    issues,
    path,
    false,
  );
  const recommendedNextStep = readRequiredString(
    record,
    "recommendedNextStep",
    issues,
    path,
  );
  const riskNotes = readStringArray(record, "riskNotes", issues, path, false);
  const targetCustomerProfile = readOptionalString(
    record,
    "targetCustomerProfile",
    issues,
    path,
  );
  const valueProposition = readOptionalString(record, "valueProposition", issues, path);
  if (
    assumptions === undefined ||
    objectiveSummary === undefined ||
    operationalConstraints === undefined ||
    recommendedNextStep === undefined ||
    riskNotes === undefined
  ) {
    return undefined;
  }
  return {
    assumptions,
    objectiveSummary,
    operationalConstraints,
    recommendedNextStep,
    riskNotes,
    ...(targetCustomerProfile === undefined ? {} : { targetCustomerProfile }),
    ...(valueProposition === undefined ? {} : { valueProposition }),
  };
}

function readOptionalMarketInsightSummary(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffMarketInsightSummary | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, MARKET_INSIGHT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const commonObjections = readStringArray(record, "commonObjections", issues, path, false);
  const competitorSummary = readRequiredString(record, "competitorSummary", issues, path);
  const customerBehaviorSignals = readStringArray(
    record,
    "customerBehaviorSignals",
    issues,
    path,
    false,
  );
  const localTrendSummary = readRequiredString(record, "localTrendSummary", issues, path);
  const marketWeaknessSummary = readRequiredString(
    record,
    "marketWeaknessSummary",
    issues,
    path,
  );
  const pricingSensitivity = readRequiredString(record, "pricingSensitivity", issues, path);
  const restaurantOwnerNeeds = readStringArray(
    record,
    "restaurantOwnerNeeds",
    issues,
    path,
    false,
  );
  const restaurantPainPoints = readStringArray(
    record,
    "restaurantPainPoints",
    issues,
    path,
    false,
  );
  const unmetDemandSummary = readRequiredString(record, "unmetDemandSummary", issues, path);
  if (
    commonObjections === undefined ||
    competitorSummary === undefined ||
    customerBehaviorSignals === undefined ||
    localTrendSummary === undefined ||
    marketWeaknessSummary === undefined ||
    pricingSensitivity === undefined ||
    restaurantOwnerNeeds === undefined ||
    restaurantPainPoints === undefined ||
    unmetDemandSummary === undefined
  ) {
    return undefined;
  }
  return {
    commonObjections,
    competitorSummary,
    customerBehaviorSignals,
    localTrendSummary,
    marketWeaknessSummary,
    pricingSensitivity,
    restaurantOwnerNeeds,
    restaurantPainPoints,
    unmetDemandSummary,
  };
}

function readOptionalOpportunitySummary(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffOpportunitySummary | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, OPPORTUNITY_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const opportunityGaps = readStringArray(record, "opportunityGaps", issues, path, false);
  const positioningAngles = readStringArray(record, "positioningAngles", issues, path, false);
  const recommendedNextBusinessQuestion = readRequiredString(
    record,
    "recommendedNextBusinessQuestion",
    issues,
    path,
  );
  if (
    opportunityGaps === undefined ||
    positioningAngles === undefined ||
    recommendedNextBusinessQuestion === undefined
  ) {
    return undefined;
  }
  return {
    opportunityGaps,
    positioningAngles,
    recommendedNextBusinessQuestion,
  };
}

function readEvidenceSummary(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffEvidenceSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, EVIDENCE_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const evidenceNotes = readStringArray(record, "evidenceNotes", issues, path, false);
  const evidenceQuality = readEnum<AgentHandoffEvidenceQuality>(
    record,
    "evidenceQuality",
    EVIDENCE_QUALITIES,
    issues,
    path,
  );
  const uncertaintyLevel = readEnum<AgentHandoffUncertaintyLevel>(
    record,
    "uncertaintyLevel",
    UNCERTAINTY_LEVELS,
    issues,
    path,
  );
  const uncertaintyNotes = readStringArray(record, "uncertaintyNotes", issues, path, false);
  if (
    evidenceNotes === undefined ||
    evidenceQuality === undefined ||
    uncertaintyLevel === undefined ||
    uncertaintyNotes === undefined
  ) {
    return undefined;
  }
  return {
    evidenceNotes,
    evidenceQuality,
    uncertaintyLevel,
    uncertaintyNotes,
  };
}

function readExpectedOutput(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffExpectedOutput | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, EXPECTED_OUTPUT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const description = readRequiredString(record, "description", issues, path);
  const outputKind = readEnum<AgentHandoffExpectedOutputKind>(
    record,
    "outputKind",
    OUTPUT_KINDS,
    issues,
    path,
  );
  const requiredSections = readStringArray(record, "requiredSections", issues, path, false);
  if (description === undefined || outputKind === undefined || requiredSections === undefined) {
    return undefined;
  }
  return {
    description,
    outputKind,
    requiredSections,
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
  validateUnique(requirements.map(({ approvalId }) => approvalId), "approvalId", path, issues);
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
  const approvalId = readRequiredString(record, "approvalId", issues, path);
  const rationale = readRequiredString(record, "rationale", issues, path);
  const requiredFor = readEnumArray<MainAssistantEscalationType>(
    record,
    "requiredFor",
    ESCALATION_TYPES,
    issues,
    path,
    false,
  );
  if (approvalId === undefined || rationale === undefined || requiredFor === undefined) {
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
  const rationale = readRequiredString(record, "rationale", issues, path);
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
): AgentHandoffFutureWorkflowRelevance | undefined {
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
      code: "unsafe_handoff",
      message: "future workflow relevance must be non-executing",
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
): AgentHandoffFutureToolRelevance | undefined {
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
      code: "unsafe_handoff",
      message: "future tool relevance must be non-executing",
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

function readHandoffResult(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): AgentHandoffResult | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    addObjectIssue(issues, path);
    return undefined;
  }
  rejectUnknownKeys(record, RESULT_KEYS, issues, path);
  rejectSensitiveContent(record, issues, path);
  const contractVersion = readRequiredString(record, "contractVersion", issues, path);
  if (
    contractVersion !== undefined &&
    contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: "handoff result contractVersion must be 1",
      path: `${path}.contractVersion`,
    });
  }
  const handoffId = readEnum<AgentHandoffId>(
    record,
    "handoffId",
    AGENT_HANDOFF_IDS,
    issues,
    path,
  );
  const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues, path);
  if (nonExecuting === false) {
    issues.push({
      code: "unsafe_handoff",
      message: "handoff result must be non-executing",
      path: `${path}.nonExecuting`,
    });
  }
  const reasonCode = readEnum<AgentHandoffResultReasonCode>(
    record,
    "reasonCode",
    RESULT_REASONS,
    issues,
    path,
  );
  const safeMessage = readRequiredString(record, "safeMessage", issues, path);
  const status = readEnum<AgentHandoffStatus>(record, "status", STATUSES, issues, path);
  if (
    contractVersion !== AGENT_HANDOFF_CONTRACT_VERSION ||
    handoffId === undefined ||
    nonExecuting !== true ||
    reasonCode === undefined ||
    safeMessage === undefined ||
    status === undefined
  ) {
    return undefined;
  }
  return {
    contractVersion,
    handoffId,
    nonExecuting,
    reasonCode,
    safeMessage,
    status,
  };
}

function validateSpecificationMapping(
  reference: AgentHandoffRoleReference,
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
      message: "handoff references an AgentSpecification that is not registered in source",
      path: `${path}.agentId`,
    });
  }
}

function participantsForAreas(
  areaIds: readonly ResponsibilityAreaId[],
): ReadonlySet<AgentCompanyRoleId> {
  const participants = new Set<AgentCompanyRoleId>();
  for (const areaId of areaIds) {
    const area = DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.find(
      (candidate) => candidate.areaId === areaId,
    );
    if (area === undefined) {
      continue;
    }
    for (const role of [
      ...area.primaryOwners,
      ...area.supportingRoles,
      ...area.consultedRoles,
      ...area.approvalRoles,
      ...area.forbiddenRoles,
    ]) {
      participants.add(role.agentId);
    }
  }
  return participants;
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

function permissionCapabilityId(
  permissionId: AgentCompanyPermissionRuleId,
): AgentCompanyCapabilityId {
  return permissionId.slice(
    0,
    -"permission".length - 1,
  ) as AgentCompanyCapabilityId;
}

function sortSafetyDomains(
  domains: readonly MainAssistantSafetyDomain[],
): readonly MainAssistantSafetyDomain[] {
  return [...domains].sort(
    (left, right) => SAFETY_DOMAINS.indexOf(left) - SAFETY_DOMAINS.indexOf(right),
  );
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix: string,
): string | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredString(record, key, issues, pathPrefix);
}

function readStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix: string,
  allowEmpty: boolean,
): readonly string[] | undefined {
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
  const entries: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({
        code: "invalid_type",
        message: `${path}[${String(index)}] must be a non-empty string`,
        path: `${path}[${String(index)}]`,
      });
      return undefined;
    }
    entries.push(entry);
  }
  validateUnique(entries, key, path, issues);
  return entries;
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
        message: `${fieldPath(pathPrefix, key)} is not part of the agent handoff contract`,
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
        message: "agent handoff contracts must not contain raw sensitive content",
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
        message: "agent handoff contracts must not contain sensitive raw fields",
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
