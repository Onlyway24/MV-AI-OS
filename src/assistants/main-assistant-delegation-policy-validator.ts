import { isAgentSpecificationIdentifier } from "../agents/specification/agent-specification-validation.js";
import {
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import { GuardianConsultationDecisionValidator } from "./guardian-consultation-validator.js";
import {
  MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
  type MainAssistantDelegationBusinessValue,
  type MainAssistantDelegationCategory,
  type MainAssistantDelegationConstraint,
  type MainAssistantDelegationConstraintEnforcement,
  type MainAssistantDelegationConstraintKind,
  type MainAssistantDelegationDecision,
  type MainAssistantDelegationDecisionKind,
  type MainAssistantDelegationDecisionReason,
  type MainAssistantDelegationEvaluationRequest,
  type MainAssistantDelegationPolicyProfile,
  type MainAssistantDelegationPolicyTarget,
  type MainAssistantDelegationReasonCode,
  type MainAssistantDelegationReasonSeverity,
  type MainAssistantDelegationRiskLevel,
} from "./main-assistant-delegation-policy.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantDelegationTargetRole,
  type MainAssistantEscalationType,
  type MainAssistantForbiddenDelegationMode,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { MainAssistantInvocationRiskLevel } from "./main-assistant-runtime.js";

const POLICY_KEYS = new Set([
  "allowedTargets",
  "assistantId",
  "constraints",
  "contractVersion",
  "forbiddenCategories",
  "forbiddenModes",
  "maxDelegationDepth",
  "noCircularDelegation",
  "nonExecuting",
  "policyId",
  "requiresCoreBrainMediation",
  "requiresGuardianConsultation",
  "requiresOperatorSafetyReport",
  "requiresPolicyEvaluation",
]);

const TARGET_KEYS = new Set([
  "agentId",
  "businessValues",
  "category",
  "description",
  "operatorFacingPurpose",
  "requiredApprovalIds",
  "requiredGuardianDomains",
  "requiredOperations",
  "riskLevel",
  "role",
]);

const CONSTRAINT_KEYS = new Set([
  "category",
  "constraintId",
  "description",
  "enforcement",
  "kind",
]);

const REQUEST_KEYS = new Set([
  "approvalGrantIds",
  "assistantId",
  "contractVersion",
  "currentDelegationDepth",
  "delegationPath",
  "generatedAt",
  "guardianConsultation",
  "policy",
  "requestId",
  "requestedCategory",
  "requestedOperations",
  "riskLevel",
  "targetAgentId",
]);

const DECISION_KEYS = new Set([
  "assistantId",
  "blockedReasons",
  "checkedGuardianDomains",
  "contractVersion",
  "currentDelegationDepth",
  "decision",
  "delegationPath",
  "generatedAt",
  "missingApprovalIds",
  "missingGuardianDomains",
  "nonExecuting",
  "reasons",
  "recommendedNextActions",
  "requestId",
  "requiredApprovalIds",
  "targetAgentId",
  "targetCategory",
]);

const REASON_KEYS = new Set(["code", "message", "severity"]);

const CATEGORIES = new Set<MainAssistantDelegationCategory>([
  "business",
  "content_direction",
  "external_communication",
  "implementation",
  "publishing",
  "research",
  "sales_outreach",
  "tool_agent",
]);

const ROLES = new Set<MainAssistantDelegationTargetRole>([
  "business",
  "content_direction",
  "implementation",
  "publishing",
  "research",
]);

const BUSINESS_VALUES = new Set<MainAssistantDelegationBusinessValue>([
  "help_fabio_make_money",
  "improve_output_quality",
  "reduce_babysitting",
  "reduce_operational_risk",
  "save_fabio_time",
]);

const TARGET_RISK_LEVELS = new Set<MainAssistantDelegationRiskLevel>([
  "critical",
  "high",
  "low",
  "medium",
]);

const INVOCATION_RISK_LEVELS = new Set<MainAssistantInvocationRiskLevel>([
  "normal",
  "risky",
  "sensitive",
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

const FORBIDDEN_MODES = new Set<MainAssistantForbiddenDelegationMode>([
  "agent_to_agent_direct_call",
  "autonomous_escalation",
  "unapproved_publishing",
  "unapproved_tool_execution",
]);

const CONSTRAINT_KINDS = new Set<MainAssistantDelegationConstraintKind>([
  "approval_required",
  "backup_required",
  "budget_required",
  "core_brain_mediation_required",
  "external_communication_requires_approval",
  "forbidden_category",
  "guardian_consultation_required",
  "max_delegation_depth",
  "no_autonomous_escalation",
  "no_circular_delegation",
  "operator_safety_report_required",
  "policy_evaluation_required",
  "publisher_requires_approval",
  "quality_review_required",
  "sales_outreach_requires_approval",
  "security_required",
  "tool_agent_requires_future_approval",
]);

const CONSTRAINT_ENFORCEMENTS =
  new Set<MainAssistantDelegationConstraintEnforcement>([
    "block",
    "require_approval",
    "require_confirmation",
  ]);

const DECISIONS = new Set<MainAssistantDelegationDecisionKind>([
  "allowed",
  "blocked",
  "requires_approval",
  "requires_operator_confirmation",
]);

const REASON_CODES = new Set<MainAssistantDelegationReasonCode>([
  "approval_required",
  "category_forbidden",
  "category_mismatch",
  "circular_delegation",
  "delegation_allowed",
  "guardian_blocked",
  "guardian_confirmation_required",
  "guardian_warning",
  "max_depth_exceeded",
  "missing_guardian_consultation",
  "missing_guardian_domain",
  "missing_operator_safety_report",
  "target_not_allowed",
]);

const REASON_SEVERITIES = new Set<MainAssistantDelegationReasonSeverity>([
  "allow",
  "block",
  "confirm",
  "warn",
]);

const REQUIRED_FORBIDDEN_CATEGORIES: readonly MainAssistantDelegationCategory[] = [
  "external_communication",
  "sales_outreach",
  "tool_agent",
];

const REQUIRED_FORBIDDEN_MODES: readonly MainAssistantForbiddenDelegationMode[] = [
  "agent_to_agent_direct_call",
  "autonomous_escalation",
  "unapproved_publishing",
  "unapproved_tool_execution",
];

const REQUIRED_CONSTRAINT_KINDS: readonly MainAssistantDelegationConstraintKind[] = [
  "approval_required",
  "backup_required",
  "budget_required",
  "core_brain_mediation_required",
  "external_communication_requires_approval",
  "forbidden_category",
  "guardian_consultation_required",
  "max_delegation_depth",
  "no_autonomous_escalation",
  "no_circular_delegation",
  "operator_safety_report_required",
  "policy_evaluation_required",
  "publisher_requires_approval",
  "quality_review_required",
  "sales_outreach_requires_approval",
  "security_required",
  "tool_agent_requires_future_approval",
];

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
  "prompt",
  "providerPayload",
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
  /\braw(?:Knowledge|Memory|Transcript)\b/u,
  /\btransportInternals\b/u,
];

export class MainAssistantDelegationPolicyProfileValidator
  implements Validator<MainAssistantDelegationPolicyProfile>
{
  public validate(
    value: unknown,
  ): ValidationResult<MainAssistantDelegationPolicyProfile> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant delegation policy must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, POLICY_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const policyId = readIdentifier(record, "policyId", issues);
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    const requiresCoreBrainMediation = readRequiredBoolean(
      record,
      "requiresCoreBrainMediation",
      issues,
    );
    const requiresGuardianConsultation = readRequiredBoolean(
      record,
      "requiresGuardianConsultation",
      issues,
    );
    const requiresOperatorSafetyReport = readRequiredBoolean(
      record,
      "requiresOperatorSafetyReport",
      issues,
    );
    const requiresPolicyEvaluation = readRequiredBoolean(
      record,
      "requiresPolicyEvaluation",
      issues,
    );
    const noCircularDelegation = readRequiredBoolean(
      record,
      "noCircularDelegation",
      issues,
    );
    const maxDelegationDepth = readRequiredInteger(
      record,
      "maxDelegationDepth",
      issues,
      "",
      1,
    );
    const allowedTargets = readTargets(record.allowedTargets, issues);
    const constraints = readConstraints(record.constraints, issues);
    const forbiddenCategories = readEnumArray(
      record.forbiddenCategories,
      "forbiddenCategories",
      CATEGORIES,
      issues,
      false,
    );
    const forbiddenModes = readEnumArray(
      record.forbiddenModes,
      "forbiddenModes",
      FORBIDDEN_MODES,
      issues,
      false,
    );

    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "nonExecuting must be true",
        path: "nonExecuting",
      });
    }
    requireTrue(
      requiresCoreBrainMediation,
      "requiresCoreBrainMediation",
      issues,
    );
    requireTrue(
      requiresGuardianConsultation,
      "requiresGuardianConsultation",
      issues,
    );
    requireTrue(
      requiresOperatorSafetyReport,
      "requiresOperatorSafetyReport",
      issues,
    );
    requireTrue(requiresPolicyEvaluation, "requiresPolicyEvaluation", issues);
    requireTrue(noCircularDelegation, "noCircularDelegation", issues);

    if (forbiddenCategories !== undefined) {
      validateRequiredCoverage(
        forbiddenCategories,
        REQUIRED_FORBIDDEN_CATEGORIES,
        "forbiddenCategories",
        "forbidden_category_missing",
        issues,
      );
    }
    if (forbiddenModes !== undefined) {
      validateRequiredCoverage(
        forbiddenModes,
        REQUIRED_FORBIDDEN_MODES,
        "forbiddenModes",
        "forbidden_mode_missing",
        issues,
      );
    }
    if (constraints !== undefined) {
      validateRequiredCoverage(
        constraints.map(({ kind }) => kind),
        REQUIRED_CONSTRAINT_KINDS,
        "constraints",
        "constraint_missing",
        issues,
      );
    }
    if (
      allowedTargets !== undefined &&
      forbiddenCategories !== undefined
    ) {
      validateTargets(allowedTargets, forbiddenCategories, issues);
    }

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION ||
      assistantId === undefined ||
      policyId === undefined ||
      nonExecuting !== true ||
      requiresCoreBrainMediation !== true ||
      requiresGuardianConsultation !== true ||
      requiresOperatorSafetyReport !== true ||
      requiresPolicyEvaluation !== true ||
      noCircularDelegation !== true ||
      maxDelegationDepth === undefined ||
      allowedTargets === undefined ||
      constraints === undefined ||
      forbiddenCategories === undefined ||
      forbiddenModes === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      allowedTargets,
      assistantId,
      constraints,
      contractVersion,
      forbiddenCategories,
      forbiddenModes,
      maxDelegationDepth,
      noCircularDelegation,
      nonExecuting,
      policyId,
      requiresCoreBrainMediation,
      requiresGuardianConsultation,
      requiresOperatorSafetyReport,
      requiresPolicyEvaluation,
    });
  }
}

export class MainAssistantDelegationEvaluationRequestValidator
  implements Validator<MainAssistantDelegationEvaluationRequest>
{
  readonly #guardianDecisionValidator =
    new GuardianConsultationDecisionValidator();
  readonly #policyValidator =
    new MainAssistantDelegationPolicyProfileValidator();

  public validate(
    value: unknown,
  ): ValidationResult<MainAssistantDelegationEvaluationRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant delegation request must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REQUEST_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const requestId = readIdentifier(record, "requestId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const targetAgentId = readIdentifier(record, "targetAgentId", issues);
    const requestedCategory = readEnumValue(
      record.requestedCategory,
      "requestedCategory",
      CATEGORIES,
      issues,
    );
    const requestedOperations = readEnumArray(
      record.requestedOperations,
      "requestedOperations",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      INVOCATION_RISK_LEVELS,
      issues,
    );
    const currentDelegationDepth = readRequiredInteger(
      record,
      "currentDelegationDepth",
      issues,
    );
    const delegationPath = readIdentifierArray(
      record.delegationPath,
      "delegationPath",
      issues,
      true,
    );
    const approvalGrantIds = readIdentifierArray(
      record.approvalGrantIds,
      "approvalGrantIds",
      issues,
      true,
    );
    const policy = readNested(
      record.policy,
      "policy",
      this.#policyValidator,
      issues,
    );
    const guardianConsultation =
      record.guardianConsultation === undefined
        ? undefined
        : readNested(
            record.guardianConsultation,
            "guardianConsultation",
            this.#guardianDecisionValidator,
            issues,
          );

    if (
      targetAgentId !== undefined &&
      !isAgentSpecificationIdentifier(targetAgentId)
    ) {
      issues.push({
        code: "invalid_format",
        message: "targetAgentId must be a lowercase identifier",
        path: "targetAgentId",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION ||
      assistantId === undefined ||
      requestId === undefined ||
      generatedAt === undefined ||
      targetAgentId === undefined ||
      requestedCategory === undefined ||
      requestedOperations === undefined ||
      riskLevel === undefined ||
      currentDelegationDepth === undefined ||
      delegationPath === undefined ||
      approvalGrantIds === undefined ||
      policy === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      approvalGrantIds,
      assistantId,
      contractVersion,
      currentDelegationDepth,
      delegationPath,
      generatedAt,
      ...(guardianConsultation === undefined ? {} : { guardianConsultation }),
      policy,
      requestId,
      requestedCategory,
      requestedOperations,
      riskLevel,
      targetAgentId,
    });
  }
}

export class MainAssistantDelegationDecisionValidator
  implements Validator<MainAssistantDelegationDecision>
{
  public validate(
    value: unknown,
  ): ValidationResult<MainAssistantDelegationDecision> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant delegation decision must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, DECISION_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const requestId = readIdentifier(record, "requestId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const targetAgentId = readIdentifier(record, "targetAgentId", issues);
    const targetCategory = readEnumValue(
      record.targetCategory,
      "targetCategory",
      CATEGORIES,
      issues,
    );
    const currentDelegationDepth = readRequiredInteger(
      record,
      "currentDelegationDepth",
      issues,
    );
    const decision = readEnumValue(
      record.decision,
      "decision",
      DECISIONS,
      issues,
    );
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    const delegationPath = readIdentifierArray(
      record.delegationPath,
      "delegationPath",
      issues,
      true,
    );
    const checkedGuardianDomains = readEnumArray(
      record.checkedGuardianDomains,
      "checkedGuardianDomains",
      SAFETY_DOMAINS,
      issues,
      true,
    );
    const missingGuardianDomains = readEnumArray(
      record.missingGuardianDomains,
      "missingGuardianDomains",
      SAFETY_DOMAINS,
      issues,
      true,
    );
    const requiredApprovalIds = readIdentifierArray(
      record.requiredApprovalIds,
      "requiredApprovalIds",
      issues,
      true,
    );
    const missingApprovalIds = readIdentifierArray(
      record.missingApprovalIds,
      "missingApprovalIds",
      issues,
      true,
    );
    const blockedReasons = readSafeStringArray(
      record.blockedReasons,
      "blockedReasons",
      issues,
      true,
    );
    const recommendedNextActions = readSafeStringArray(
      record.recommendedNextActions,
      "recommendedNextActions",
      issues,
      true,
    );
    const reasons = readReasons(record.reasons, issues);

    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "nonExecuting must be true",
        path: "nonExecuting",
      });
    }
    validateDecisionConsistency(
      decision,
      blockedReasons,
      missingApprovalIds,
      missingGuardianDomains,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION ||
      assistantId === undefined ||
      requestId === undefined ||
      generatedAt === undefined ||
      targetAgentId === undefined ||
      targetCategory === undefined ||
      currentDelegationDepth === undefined ||
      decision === undefined ||
      nonExecuting !== true ||
      delegationPath === undefined ||
      checkedGuardianDomains === undefined ||
      missingGuardianDomains === undefined ||
      requiredApprovalIds === undefined ||
      missingApprovalIds === undefined ||
      blockedReasons === undefined ||
      recommendedNextActions === undefined ||
      reasons === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assistantId,
      blockedReasons,
      checkedGuardianDomains,
      contractVersion,
      currentDelegationDepth,
      decision,
      delegationPath,
      generatedAt,
      missingApprovalIds,
      missingGuardianDomains,
      nonExecuting,
      reasons,
      recommendedNextActions,
      requestId,
      requiredApprovalIds,
      targetAgentId,
      targetCategory,
    });
  }
}

function readTargets(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantDelegationPolicyTarget[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "allowedTargets must be an array",
      path: "allowedTargets",
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: "allowedTargets must contain at least one target",
      path: "allowedTargets",
    });
    return undefined;
  }

  const targets: MainAssistantDelegationPolicyTarget[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `allowedTargets[${String(index)}]`;
    const target = readTarget(entry, path, issues);
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

  return issues.some(({ path }) => path.startsWith("allowedTargets"))
    ? undefined
    : Object.freeze(targets);
}

function readTarget(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantDelegationPolicyTarget | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, TARGET_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const agentId = readIdentifier(record, "agentId", issues, path);
  const category = readEnumValue(
    record.category,
    `${path}.category`,
    CATEGORIES,
    issues,
  );
  const role = readEnumValue(record.role, `${path}.role`, ROLES, issues);
  const description = readSafeString(
    record,
    "description",
    issues,
    path,
    1_000,
  );
  const operatorFacingPurpose = readSafeString(
    record,
    "operatorFacingPurpose",
    issues,
    path,
    1_000,
  );
  const businessValues = readEnumArray(
    record.businessValues,
    `${path}.businessValues`,
    BUSINESS_VALUES,
    issues,
    false,
  );
  const requiredApprovalIds = readIdentifierArray(
    record.requiredApprovalIds,
    `${path}.requiredApprovalIds`,
    issues,
    true,
  );
  const requiredGuardianDomains = readEnumArray(
    record.requiredGuardianDomains,
    `${path}.requiredGuardianDomains`,
    SAFETY_DOMAINS,
    issues,
    false,
  );
  const requiredOperations = readEnumArray(
    record.requiredOperations,
    `${path}.requiredOperations`,
    ESCALATION_TYPES,
    issues,
    true,
  );
  const riskLevel = readEnumValue(
    record.riskLevel,
    `${path}.riskLevel`,
    TARGET_RISK_LEVELS,
    issues,
  );

  if (agentId !== undefined && !isAgentSpecificationIdentifier(agentId)) {
    issues.push({
      code: "invalid_format",
      message: `${path}.agentId must be a lowercase identifier`,
      path: `${path}.agentId`,
    });
  }

  if (
    agentId === undefined ||
    category === undefined ||
    role === undefined ||
    description === undefined ||
    operatorFacingPurpose === undefined ||
    businessValues === undefined ||
    requiredApprovalIds === undefined ||
    requiredGuardianDomains === undefined ||
    requiredOperations === undefined ||
    riskLevel === undefined
  ) {
    return undefined;
  }

  return {
    agentId,
    businessValues,
    category,
    description,
    operatorFacingPurpose,
    requiredApprovalIds,
    requiredGuardianDomains,
    requiredOperations,
    riskLevel,
    role,
  };
}

function readConstraints(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantDelegationConstraint[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "constraints must be an array",
      path: "constraints",
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: "constraints must contain at least one constraint",
      path: "constraints",
    });
    return undefined;
  }

  const constraints: MainAssistantDelegationConstraint[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `constraints[${String(index)}]`;
    const constraint = readConstraint(entry, path, issues);
    if (constraint === undefined) {
      continue;
    }
    if (seen.has(constraint.constraintId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.constraintId must be unique`,
        path: `${path}.constraintId`,
      });
      continue;
    }
    seen.add(constraint.constraintId);
    constraints.push(constraint);
  }

  return issues.some(({ path }) => path.startsWith("constraints"))
    ? undefined
    : Object.freeze(constraints);
}

function readConstraint(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantDelegationConstraint | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, CONSTRAINT_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const constraintId = readIdentifier(record, "constraintId", issues, path);
  const kind = readEnumValue(
    record.kind,
    `${path}.kind`,
    CONSTRAINT_KINDS,
    issues,
  );
  const enforcement = readEnumValue(
    record.enforcement,
    `${path}.enforcement`,
    CONSTRAINT_ENFORCEMENTS,
    issues,
  );
  const description = readSafeString(
    record,
    "description",
    issues,
    path,
    1_000,
  );
  const category =
    record.category === undefined
      ? undefined
      : readEnumValue(record.category, `${path}.category`, CATEGORIES, issues);

  if (
    constraintId === undefined ||
    kind === undefined ||
    enforcement === undefined ||
    description === undefined
  ) {
    return undefined;
  }

  return {
    ...(category === undefined ? {} : { category }),
    constraintId,
    description,
    enforcement,
    kind,
  };
}

function readReasons(
  value: unknown,
  issues: ValidationIssue[],
): readonly MainAssistantDelegationDecisionReason[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "reasons must be an array",
      path: "reasons",
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: "reasons must contain at least one reason",
      path: "reasons",
    });
    return undefined;
  }

  const reasons: MainAssistantDelegationDecisionReason[] = [];
  for (const [index, entry] of value.entries()) {
    const reason = readReason(entry, `reasons[${String(index)}]`, issues);
    if (reason !== undefined) {
      reasons.push(reason);
    }
  }
  return issues.some(({ path }) => path.startsWith("reasons"))
    ? undefined
    : Object.freeze(reasons);
}

function readReason(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MainAssistantDelegationDecisionReason | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, REASON_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const code = readEnumValue(record.code, `${path}.code`, REASON_CODES, issues);
  const severity = readEnumValue(
    record.severity,
    `${path}.severity`,
    REASON_SEVERITIES,
    issues,
  );
  const message = readSafeString(record, "message", issues, path, 1_000);

  if (code === undefined || severity === undefined || message === undefined) {
    return undefined;
  }

  return {
    code,
    message,
    severity,
  };
}

function validateTargets(
  targets: readonly MainAssistantDelegationPolicyTarget[],
  forbiddenCategories: readonly MainAssistantDelegationCategory[],
  issues: ValidationIssue[],
): void {
  for (const [index, target] of targets.entries()) {
    const path = `allowedTargets[${String(index)}]`;
    if (forbiddenCategories.includes(target.category)) {
      issues.push({
        code: "forbidden_category",
        message: `${path}.category must not be listed as an allowed target category`,
        path: `${path}.category`,
      });
    }
    if (target.category !== target.role) {
      issues.push({
        code: "category_mismatch",
        message: `${path}.category must match target role`,
        path: `${path}.category`,
      });
    }
    if (!target.requiredGuardianDomains.includes("operator_safety")) {
      issues.push({
        code: "operator_safety_requirement_missing",
        message: `${path}.requiredGuardianDomains must include operator_safety`,
        path: `${path}.requiredGuardianDomains`,
      });
    }
    if (
      target.category === "business" &&
      !target.requiredGuardianDomains.includes("cost")
    ) {
      issues.push({
        code: "budget_requirement_missing",
        message: `${path}.requiredGuardianDomains must include cost`,
        path: `${path}.requiredGuardianDomains`,
      });
    }
    if (
      target.category === "implementation" &&
      !target.requiredGuardianDomains.includes("security")
    ) {
      issues.push({
        code: "security_requirement_missing",
        message: `${path}.requiredGuardianDomains must include security`,
        path: `${path}.requiredGuardianDomains`,
      });
    }
    if (
      target.category === "implementation" &&
      !target.requiredGuardianDomains.includes("backup")
    ) {
      issues.push({
        code: "backup_requirement_missing",
        message: `${path}.requiredGuardianDomains must include backup`,
        path: `${path}.requiredGuardianDomains`,
      });
    }
    if (
      target.category === "publishing" &&
      !target.requiredGuardianDomains.includes("quality")
    ) {
      issues.push({
        code: "quality_requirement_missing",
        message: `${path}.requiredGuardianDomains must include quality`,
        path: `${path}.requiredGuardianDomains`,
      });
    }
    if (
      target.category === "publishing" &&
      target.requiredApprovalIds.length === 0
    ) {
      issues.push({
        code: "approval_requirement_missing",
        message: `${path}.requiredApprovalIds must include a publishing approval`,
        path: `${path}.requiredApprovalIds`,
      });
    }
    if (
      (target.riskLevel === "high" || target.riskLevel === "critical") &&
      target.requiredApprovalIds.length === 0
    ) {
      issues.push({
        code: "approval_requirement_missing",
        message: `${path}.requiredApprovalIds must include approval for high-risk targets`,
        path: `${path}.requiredApprovalIds`,
      });
    }
  }
}

function validateDecisionConsistency(
  decision: MainAssistantDelegationDecisionKind | undefined,
  blockedReasons: readonly string[] | undefined,
  missingApprovalIds: readonly string[] | undefined,
  missingGuardianDomains: readonly MainAssistantSafetyDomain[] | undefined,
  issues: ValidationIssue[],
): void {
  if (
    decision === "allowed" &&
    ((blockedReasons?.length ?? 0) > 0 ||
      (missingApprovalIds?.length ?? 0) > 0 ||
      (missingGuardianDomains?.length ?? 0) > 0)
  ) {
    issues.push({
      code: "inconsistent_value",
      message:
        "allowed decisions must not include blockers, missing approvals, or missing guardian domains",
      path: "decision",
    });
  }
  if (decision === "blocked" && (blockedReasons?.length ?? 0) === 0) {
    issues.push({
      code: "required",
      message: "blocked decisions must include blockedReasons",
      path: "blockedReasons",
    });
  }
  if (
    decision === "requires_approval" &&
    (missingApprovalIds?.length ?? 0) === 0
  ) {
    issues.push({
      code: "required",
      message: "requires_approval decisions must include missingApprovalIds",
      path: "missingApprovalIds",
    });
  }
  if (
    decision === "requires_operator_confirmation" &&
    (blockedReasons?.length ?? 0) > 0
  ) {
    issues.push({
      code: "inconsistent_value",
      message: "confirmation decisions must not include blocking reasons",
      path: "blockedReasons",
    });
  }
}

function requireTrue(
  value: boolean | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === false) {
    issues.push({
      code: "invalid_value",
      message: `${path} must be true`,
      path,
    });
  }
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message:
        `contractVersion must be ${MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION}`,
      path: "contractVersion",
    });
    return undefined;
  }
  return contractVersion;
}

function readAssistantId(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof ONLY_WAY_ASSISTANT_ID | undefined {
  const assistantId = readRequiredString(record, "assistantId", issues);
  if (assistantId !== undefined && assistantId !== ONLY_WAY_ASSISTANT_ID) {
    issues.push({
      code: "invalid_value",
      message: `assistantId must be ${ONLY_WAY_ASSISTANT_ID}`,
      path: "assistantId",
    });
    return undefined;
  }
  return assistantId;
}

function readTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = readRequiredString(record, key, issues);
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${key} must be an RFC3339 UTC timestamp`,
      path: key,
    });
    return undefined;
  }
  return value;
}

function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): string | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix, {
    maxLength: 160,
  });
  const path = pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`;
  if (value !== undefined && /\s/u.test(value)) {
    issues.push({
      code: "invalid_value",
      message: `${path} must not contain whitespace`,
      path,
    });
    return undefined;
  }
  if (value !== undefined && !isRedactionSafeText(value)) {
    issues.push({
      code: "unsafe_content",
      message: `${path} must not contain raw secrets or internal payload markers`,
      path,
    });
    return undefined;
  }
  return value;
}

function readIdentifierArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowEmpty: boolean,
): readonly string[] | undefined {
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

  const identifiers: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({
        code: "invalid_type",
        message: `${entryPath} must be a non-empty string`,
        path: entryPath,
      });
      continue;
    }
    if (entry.length > 160 || /\s/u.test(entry)) {
      issues.push({
        code: "invalid_value",
        message: `${entryPath} must be a compact identifier`,
        path: entryPath,
      });
      continue;
    }
    if (!isRedactionSafeText(entry)) {
      issues.push({
        code: "unsafe_content",
        message: `${entryPath} must not contain raw secrets or internal payload markers`,
        path: entryPath,
      });
      continue;
    }
    if (seen.has(entry)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(entry);
    identifiers.push(entry);
  }
  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
    ? undefined
    : Object.freeze(identifiers);
}

function readSafeString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix: string,
  maxLength: number,
): string | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix, {
    maxLength,
  });
  const path = pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`;
  if (value !== undefined && !isRedactionSafeText(value)) {
    issues.push({
      code: "unsafe_content",
      message: `${path} must not contain raw secrets or internal payload markers`,
      path,
    });
    return undefined;
  }
  return value;
}

function readSafeStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  allowEmpty: boolean,
): readonly string[] | undefined {
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

  const strings: string[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({
        code: "invalid_type",
        message: `${entryPath} must be a non-empty string`,
        path: entryPath,
      });
      continue;
    }
    if (entry.length > 1_000) {
      issues.push({
        code: "too_long",
        message: `${entryPath} must not exceed 1000 characters`,
        path: entryPath,
      });
      continue;
    }
    if (!isRedactionSafeText(entry)) {
      issues.push({
        code: "unsafe_content",
        message: `${entryPath} must not contain raw secrets or internal payload markers`,
        path: entryPath,
      });
      continue;
    }
    strings.push(entry);
  }
  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
    ? undefined
    : Object.freeze(strings);
}

function readEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  issues: ValidationIssue[],
  allowEmpty: boolean,
): readonly T[] | undefined {
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
  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
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
      code: value === undefined ? "required" : "invalid_value",
      message: `${path} must be one of ${[...allowed].join(", ")}`,
      path,
    });
    return undefined;
  }
  return value as T;
}

function readNested<T>(
  value: unknown,
  path: string,
  validator: Validator<T>,
  issues: ValidationIssue[],
): T | undefined {
  const result = validator.validate(value);
  if (result.ok) {
    return result.value;
  }
  for (const issue of result.issues) {
    issues.push({
      ...issue,
      path: prependPath(path, issue.path),
    });
  }
  return undefined;
}

function validateRequiredCoverage<T extends string>(
  actual: readonly T[],
  required: readonly T[],
  path: string,
  code: string,
  issues: ValidationIssue[],
): void {
  for (const requiredValue of required) {
    if (!actual.includes(requiredValue)) {
      issues.push({
        code,
        message: `${path} must include ${requiredValue}`,
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
        code: "unknown_key",
        message: `${prependPath(pathPrefix, key)} is not supported`,
        path: prependPath(pathPrefix, key),
      });
    }
  }
}

function rejectSensitiveKeys(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (SENSITIVE_FIELD_NAMES.has(key)) {
      issues.push({
        code: "unsafe_content",
        message: `${prependPath(pathPrefix, key)} is not allowed in delegation policy contracts`,
        path: prependPath(pathPrefix, key),
      });
    }
  }
}

function isRedactionSafeText(value: string): boolean {
  return !SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function prependPath(prefix: string, path: string): string {
  if (prefix.length === 0) {
    return path;
  }
  if (path === "$") {
    return prefix;
  }
  return `${prefix}.${path}`;
}
