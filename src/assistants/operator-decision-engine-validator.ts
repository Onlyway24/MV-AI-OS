import { MainAssistantSpecificationValidator } from "./main-assistant-specification-validator.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantEscalationType,
} from "./main-assistant-specification.js";
import { GuardianConsultationDecisionValidator } from "./guardian-consultation-validator.js";
import type { GuardianConsultationApprovalRequirement } from "./guardian-consultation.js";
import {
  OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
  type OperatorDecision,
  type OperatorDecisionCertainty,
  type OperatorDecisionContext,
  type OperatorDecisionCostPosture,
  type OperatorDecisionCostStatus,
  type OperatorDecisionDelegationSignal,
  type OperatorDecisionKind,
  type OperatorDecisionReason,
  type OperatorDecisionReasonCode,
  type OperatorDecisionReasonSeverity,
  type OperatorMissionPlanCandidate,
  type OperatorMissionPlanCandidateStep,
} from "./operator-decision-engine.js";
import type {
  MainAssistantInvocationIntent,
  MainAssistantInvocationRiskLevel,
} from "./main-assistant-runtime.js";
import {
  readRequiredBoolean,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const CONTEXT_KEYS = new Set([
  "assistantId",
  "assistantSpecification",
  "contractVersion",
  "costPosture",
  "decisionId",
  "delegationSignal",
  "generatedAt",
  "guardianConsultation",
  "intent",
  "objective",
  "requestedOperations",
  "requestedOutcome",
  "riskLevel",
]);

const COST_POSTURE_KEYS = new Set(["status", "summary"]);

const DELEGATION_SIGNAL_KEYS = new Set([
  "candidateAgentIds",
  "delegationAllowed",
  "rationale",
]);

const DECISION_KEYS = new Set([
  "assistantId",
  "blockedReasons",
  "certainty",
  "clarificationQuestions",
  "contractVersion",
  "costPosture",
  "decision",
  "decisionId",
  "explanation",
  "generatedAt",
  "guardianDecision",
  "missionPlanCandidate",
  "reasons",
  "recommendedNextActions",
  "requiredApprovals",
  "requestedOperations",
  "riskLevel",
]);

const REASON_KEYS = new Set(["code", "message", "severity"]);

const MISSION_CANDIDATE_KEYS = new Set([
  "candidateId",
  "nonExecuting",
  "objective",
  "requestedOutcome",
  "steps",
]);

const MISSION_STEP_KEYS = new Set([
  "description",
  "requiresApproval",
  "stepId",
  "title",
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

const INTENTS = new Set<MainAssistantInvocationIntent>([
  "coordinate",
  "decide",
  "plan",
  "review",
]);

const RISK_LEVELS = new Set<MainAssistantInvocationRiskLevel>([
  "normal",
  "risky",
  "sensitive",
]);

const COST_STATUSES = new Set<OperatorDecisionCostStatus>([
  "near_limit",
  "over_budget",
  "unknown",
  "within_budget",
]);

const DECISIONS = new Set<OperatorDecisionKind>([
  "approval_required",
  "blocked",
  "clarification_required",
  "confirmation_required",
  "mission_plan_candidate",
  "proceed",
  "refused",
]);

const CERTAINTIES = new Set<OperatorDecisionCertainty>([
  "high",
  "low",
  "medium",
]);

const REASON_CODES = new Set<OperatorDecisionReasonCode>([
  "approval_required",
  "cost_budget_blocked",
  "cost_budget_warning",
  "delegation_not_allowed",
  "guardian_blocked",
  "guardian_confirmation_required",
  "guardian_warning",
  "mission_plan_candidate_ready",
  "ready_to_proceed",
  "under_specified_request",
]);

const REASON_SEVERITIES = new Set<OperatorDecisionReasonSeverity>([
  "allow",
  "block",
  "confirm",
  "info",
  "warn",
]);

const GUARDIAN_DECISIONS = new Set<OperatorDecision["guardianDecision"]>([
  "blocked",
  "continue_with_warning",
  "may_continue",
  "requires_approval",
  "requires_operator_confirmation",
]);

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
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
];

export class OperatorDecisionContextValidator
  implements Validator<OperatorDecisionContext>
{
  readonly #assistantSpecificationValidator =
    new MainAssistantSpecificationValidator();
  readonly #guardianDecisionValidator =
    new GuardianConsultationDecisionValidator();

  public validate(value: unknown): ValidationResult<OperatorDecisionContext> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator decision context must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, CONTEXT_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const assistantId = readAssistantId(record, issues);
    const contractVersion = readContractVersion(record, issues);
    const decisionId = readIdentifier(record, "decisionId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const intent = readEnumValue(record.intent, "intent", INTENTS, issues);
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      RISK_LEVELS,
      issues,
    );
    const objective = readSafeString(record, "objective", issues, "", 2_000);
    const requestedOutcome = readSafeString(
      record,
      "requestedOutcome",
      issues,
      "",
      2_000,
    );
    const requestedOperations = readEnumArray(
      record.requestedOperations,
      "requestedOperations",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const assistantSpecification = readNested(
      record.assistantSpecification,
      "assistantSpecification",
      this.#assistantSpecificationValidator,
      issues,
    );
    const guardianConsultation = readNested(
      record.guardianConsultation,
      "guardianConsultation",
      this.#guardianDecisionValidator,
      issues,
    );
    const costPosture = readCostPosture(
      record.costPosture,
      "costPosture",
      issues,
    );
    const delegationSignal = readDelegationSignal(
      record.delegationSignal,
      issues,
    );

    if (
      issues.length > 0 ||
      assistantId === undefined ||
      contractVersion !== OPERATOR_DECISION_ENGINE_CONTRACT_VERSION ||
      decisionId === undefined ||
      generatedAt === undefined ||
      intent === undefined ||
      riskLevel === undefined ||
      objective === undefined ||
      requestedOutcome === undefined ||
      requestedOperations === undefined ||
      assistantSpecification === undefined ||
      guardianConsultation === undefined ||
      costPosture === false ||
      delegationSignal === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assistantId,
      assistantSpecification,
      contractVersion,
      ...(costPosture === undefined ? {} : { costPosture }),
      decisionId,
      ...(delegationSignal === undefined ? {} : { delegationSignal }),
      generatedAt,
      guardianConsultation,
      intent,
      objective,
      requestedOperations,
      requestedOutcome,
      riskLevel,
    });
  }
}

export class OperatorDecisionValidator
  implements Validator<OperatorDecision>
{
  public validate(value: unknown): ValidationResult<OperatorDecision> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator decision must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, DECISION_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const assistantId = readAssistantId(record, issues);
    const contractVersion = readContractVersion(record, issues);
    const decisionId = readIdentifier(record, "decisionId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const decision = readEnumValue(
      record.decision,
      "decision",
      DECISIONS,
      issues,
    );
    const certainty = readEnumValue(
      record.certainty,
      "certainty",
      CERTAINTIES,
      issues,
    );
    const guardianDecision = readEnumValue(
      record.guardianDecision,
      "guardianDecision",
      GUARDIAN_DECISIONS,
      issues,
    );
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      RISK_LEVELS,
      issues,
    );
    const explanation = readSafeString(
      record,
      "explanation",
      issues,
      "",
      1_500,
    );
    const requestedOperations = readEnumArray(
      record.requestedOperations,
      "requestedOperations",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const requiredApprovals = readApprovalRequirements(
      record.requiredApprovals,
      issues,
      "requiredApprovals",
    );
    const reasons = readReasons(record.reasons, issues);
    const blockedReasons = readSafeStringArray(record, "blockedReasons", issues);
    const clarificationQuestions = readSafeStringArray(
      record,
      "clarificationQuestions",
      issues,
    );
    const recommendedNextActions = readSafeStringArray(
      record,
      "recommendedNextActions",
      issues,
    );
    const costPosture = readCostPosture(
      record.costPosture,
      "costPosture",
      issues,
    );
    const missionPlanCandidate = readMissionPlanCandidate(
      record.missionPlanCandidate,
      issues,
    );

    if (
      decision !== undefined &&
      decision !== "mission_plan_candidate" &&
      missionPlanCandidate !== undefined &&
      missionPlanCandidate !== false
    ) {
      issues.push({
        code: "inconsistent_value",
        message:
          "missionPlanCandidate is allowed only for mission_plan_candidate decisions",
        path: "missionPlanCandidate",
      });
    }
    if (
      decision === "mission_plan_candidate" &&
      missionPlanCandidate === undefined
    ) {
      issues.push({
        code: "required",
        message:
          "missionPlanCandidate is required for mission_plan_candidate decisions",
        path: "missionPlanCandidate",
      });
    }

    if (
      issues.length > 0 ||
      assistantId === undefined ||
      contractVersion !== OPERATOR_DECISION_ENGINE_CONTRACT_VERSION ||
      decisionId === undefined ||
      generatedAt === undefined ||
      decision === undefined ||
      certainty === undefined ||
      guardianDecision === undefined ||
      riskLevel === undefined ||
      explanation === undefined ||
      requestedOperations === undefined ||
      requiredApprovals === undefined ||
      reasons === undefined ||
      blockedReasons === undefined ||
      clarificationQuestions === undefined ||
      recommendedNextActions === undefined ||
      costPosture === false ||
      missionPlanCandidate === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assistantId,
      blockedReasons,
      certainty,
      clarificationQuestions,
      contractVersion,
      ...(costPosture === undefined ? {} : { costPosture }),
      decision,
      decisionId,
      explanation,
      generatedAt,
      guardianDecision,
      ...(missionPlanCandidate === undefined ? {} : { missionPlanCandidate }),
      reasons,
      recommendedNextActions,
      requiredApprovals,
      requestedOperations,
      riskLevel,
    });
  }
}

function readCostPosture(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorDecisionCostPosture | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return false;
  }

  rejectUnknownKeys(record, COST_POSTURE_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const status = readEnumValue(
    record.status,
    `${path}.status`,
    COST_STATUSES,
    issues,
  );
  const summary = readSafeString(record, "summary", issues, path, 1_000);
  if (status === undefined || summary === undefined) {
    return false;
  }
  return {
    status,
    summary,
  };
}

function readDelegationSignal(
  value: unknown,
  issues: ValidationIssue[],
): OperatorDecisionDelegationSignal | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "delegationSignal must be an object",
      path: "delegationSignal",
    });
    return false;
  }

  rejectUnknownKeys(record, DELEGATION_SIGNAL_KEYS, issues, "delegationSignal");
  rejectSensitiveKeys(record, issues, "delegationSignal");
  const candidateAgentIds = readRequiredStringArray(
    record,
    "candidateAgentIds",
    issues,
    "delegationSignal",
    true,
  );
  const delegationAllowed = readRequiredBoolean(
    record,
    "delegationAllowed",
    issues,
    "delegationSignal",
  );
  const rationale = readSafeString(
    record,
    "rationale",
    issues,
    "delegationSignal",
    1_000,
  );

  if (
    candidateAgentIds === undefined ||
    delegationAllowed === undefined ||
    rationale === undefined
  ) {
    return false;
  }

  return {
    candidateAgentIds,
    delegationAllowed,
    rationale,
  };
}

function readMissionPlanCandidate(
  value: unknown,
  issues: ValidationIssue[],
): OperatorMissionPlanCandidate | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "missionPlanCandidate must be an object",
      path: "missionPlanCandidate",
    });
    return false;
  }

  rejectUnknownKeys(record, MISSION_CANDIDATE_KEYS, issues, "missionPlanCandidate");
  rejectSensitiveKeys(record, issues, "missionPlanCandidate");
  const candidateId = readIdentifier(
    record,
    "candidateId",
    issues,
    "missionPlanCandidate",
  );
  const objective = readSafeString(
    record,
    "objective",
    issues,
    "missionPlanCandidate",
    2_000,
  );
  const requestedOutcome = readSafeString(
    record,
    "requestedOutcome",
    issues,
    "missionPlanCandidate",
    2_000,
  );
  const nonExecuting = readRequiredBoolean(
    record,
    "nonExecuting",
    issues,
    "missionPlanCandidate",
  );
  if (nonExecuting === false) {
    issues.push({
      code: "invalid_value",
      message: "missionPlanCandidate.nonExecuting must be true",
      path: "missionPlanCandidate.nonExecuting",
    });
  }
  const steps = readMissionPlanCandidateSteps(record.steps, issues);

  if (
    candidateId === undefined ||
    objective === undefined ||
    requestedOutcome === undefined ||
    nonExecuting !== true ||
    steps === undefined
  ) {
    return false;
  }

  return {
    candidateId,
    nonExecuting,
    objective,
    requestedOutcome,
    steps,
  };
}

function readMissionPlanCandidateSteps(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorMissionPlanCandidateStep[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "missionPlanCandidate.steps must be an array",
      path: "missionPlanCandidate.steps",
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: "missionPlanCandidate.steps must contain at least one step",
      path: "missionPlanCandidate.steps",
    });
    return undefined;
  }

  const steps: OperatorMissionPlanCandidateStep[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `missionPlanCandidate.steps[${String(index)}]`;
    const step = readMissionPlanCandidateStep(entry, path, issues);
    if (step === undefined) {
      continue;
    }
    if (seen.has(step.stepId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.stepId must be unique`,
        path: `${path}.stepId`,
      });
      continue;
    }
    seen.add(step.stepId);
    steps.push(step);
  }

  return issues.some(({ path }) =>
    path.startsWith("missionPlanCandidate.steps"),
  )
    ? undefined
    : Object.freeze(steps);
}

function readMissionPlanCandidateStep(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorMissionPlanCandidateStep | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, MISSION_STEP_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const stepId = readIdentifier(record, "stepId", issues, path);
  const title = readSafeString(record, "title", issues, path, 300);
  const description = readSafeString(
    record,
    "description",
    issues,
    path,
    1_000,
  );
  const requiresApproval = readRequiredBoolean(
    record,
    "requiresApproval",
    issues,
    path,
  );

  if (
    stepId === undefined ||
    title === undefined ||
    description === undefined ||
    requiresApproval === undefined
  ) {
    return undefined;
  }

  return {
    description,
    requiresApproval,
    stepId,
    title,
  };
}

function readReasons(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorDecisionReason[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "reasons must be an array",
      path: "reasons",
    });
    return undefined;
  }

  const reasons: OperatorDecisionReason[] = [];
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
): OperatorDecisionReason | undefined {
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
  const code = readEnumValue(
    record.code,
    `${path}.code`,
    REASON_CODES,
    issues,
  );
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

function readApprovalRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly GuardianConsultationApprovalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const requirements: GuardianConsultationApprovalRequirement[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const requirement = readApprovalRequirement(entry, entryPath, issues);
    if (requirement === undefined) {
      continue;
    }
    const key = `${requirement.operation}:${requirement.approvalId}`;
    if (seen.has(key)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique by operation and approvalId`,
        path: entryPath,
      });
      continue;
    }
    seen.add(key);
    requirements.push(requirement);
  }

  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
    ? undefined
    : Object.freeze(requirements);
}

function readApprovalRequirement(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): GuardianConsultationApprovalRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const approvalKeys = new Set(["approvalId", "operation", "rationale"]);
  rejectUnknownKeys(record, approvalKeys, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const approvalId = readIdentifier(record, "approvalId", issues, path);
  const operation = readEnumValue(
    record.operation,
    `${path}.operation`,
    ESCALATION_TYPES,
    issues,
  );
  const rationale = readSafeString(record, "rationale", issues, path, 1_000);
  if (
    approvalId === undefined ||
    operation === undefined ||
    rationale === undefined
  ) {
    return undefined;
  }
  return {
    approvalId,
    operation,
    rationale,
  };
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof OPERATOR_DECISION_ENGINE_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== OPERATOR_DECISION_ENGINE_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${OPERATOR_DECISION_ENGINE_CONTRACT_VERSION}`,
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
  return value;
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
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): readonly string[] | undefined {
  const values = readRequiredStringArray(record, key, issues, "", true);
  if (values === undefined) {
    return undefined;
  }
  const safeValues: string[] = [];
  for (const [index, value] of values.entries()) {
    if (value.length > 1_000) {
      issues.push({
        code: "too_long",
        message: `${key}[${String(index)}] must not exceed 1000 characters`,
        path: `${key}[${String(index)}]`,
      });
      continue;
    }
    if (!isRedactionSafeText(value)) {
      issues.push({
        code: "unsafe_content",
        message: `${key}[${String(index)}] must not contain raw secrets or internal payload markers`,
        path: `${key}[${String(index)}]`,
      });
      continue;
    }
    safeValues.push(value);
  }
  return issues.some(({ path }) => path.startsWith(key))
    ? undefined
    : Object.freeze(safeValues);
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
  const seen = new Set<T>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const enumValue = readEnumValue(entry, entryPath, allowed, issues);
    if (enumValue === undefined) {
      continue;
    }
    if (seen.has(enumValue)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(enumValue);
    entries.push(enumValue);
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
        message: `${prependPath(pathPrefix, key)} is not allowed in operator decision contracts`,
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
