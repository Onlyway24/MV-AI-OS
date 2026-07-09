import {
  readRequiredBoolean,
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
import { MainAssistantDelegationDecisionValidator } from "./main-assistant-delegation-policy-validator.js";
import {
  MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
  type OperatorApprovalPrompt,
  type OperatorClarificationRequest,
  type OperatorCommand,
  type OperatorDecisionRequest,
  type OperatorDecisionResponse,
  type OperatorDelegationSummary,
  type OperatorIntent,
  type OperatorMissionPlanSummary,
  type OperatorNextAction,
  type OperatorNextActionPriority,
  type OperatorProtocolDecision,
  type OperatorProtocolRiskLevel,
  type OperatorRefusal,
  type OperatorSafetyCheckSummary,
} from "./main-assistant-operator-protocol.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import { OperatorDecisionValidator } from "./operator-decision-engine-validator.js";
import type { OperatorDecisionCostStatus } from "./operator-decision-engine.js";

const COMMAND_KEYS = new Set([
  "actorId",
  "assistantId",
  "commandId",
  "constraints",
  "contractVersion",
  "generatedAt",
  "intent",
  "objective",
  "requestedOutcome",
  "riskLevel",
  "workspaceId",
]);

const REQUEST_KEYS = new Set([
  "assistantId",
  "command",
  "contractVersion",
  "delegationDecision",
  "guardianConsultation",
  "operatorDecision",
  "protocolRequestId",
]);

const RESPONSE_KEYS = new Set([
  "approvalPrompts",
  "assistantId",
  "blockedReasons",
  "clarificationRequests",
  "contractVersion",
  "costBudgetPosture",
  "decision",
  "delegationSummary",
  "generatedAt",
  "missionPlanSummary",
  "missingInformation",
  "nextActions",
  "nonExecuting",
  "protocolRequestId",
  "refusal",
  "responseId",
  "riskLevel",
  "safetyChecksConsulted",
  "summary",
  "understoodObjective",
]);

const SAFETY_CHECK_KEYS = new Set(["consulted", "domain"]);
const APPROVAL_PROMPT_KEYS = new Set([
  "approvalId",
  "operation",
  "reason",
  "title",
]);
const CLARIFICATION_KEYS = new Set(["question", "questionId"]);
const REFUSAL_KEYS = new Set(["reason", "refusalId"]);
const NEXT_ACTION_KEYS = new Set([
  "actionId",
  "description",
  "priority",
]);
const DELEGATION_SUMMARY_KEYS = new Set([
  "agentId",
  "category",
  "decision",
  "nonExecuting",
]);
const MISSION_SUMMARY_KEYS = new Set([
  "candidateId",
  "nonExecuting",
  "objective",
  "requestedOutcome",
  "steps",
]);
const COST_POSTURE_KEYS = new Set(["status", "summary"]);

const INTENTS = new Set<OperatorIntent>([
  "coordinate",
  "decide",
  "plan",
  "review",
]);

const RISK_LEVELS = new Set<OperatorProtocolRiskLevel>([
  "normal",
  "risky",
  "sensitive",
]);

const DECISIONS = new Set<OperatorProtocolDecision>([
  "approval_required",
  "blocked",
  "clarification_required",
  "confirmation_required",
  "mission_plan_candidate",
  "proceed",
  "refused",
]);

const NEXT_ACTION_PRIORITIES = new Set<OperatorNextActionPriority>([
  "primary",
  "secondary",
]);

const SAFETY_DOMAINS = new Set<MainAssistantSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
]);

const DELEGATION_DECISIONS = new Set<OperatorDelegationSummary["decision"]>([
  "allowed",
  "blocked",
  "requires_approval",
  "requires_operator_confirmation",
]);

const COST_STATUSES = new Set<OperatorDecisionCostStatus>([
  "near_limit",
  "over_budget",
  "unknown",
  "within_budget",
]);

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
  "guardianPayload",
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
  /\bprompt\b/u,
  /\bcompletion\b/u,
  /\btransportInternals\b/u,
];

export class OperatorCommandValidator implements Validator<OperatorCommand> {
  public validate(value: unknown): ValidationResult<OperatorCommand> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator command must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, COMMAND_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const commandId = readIdentifier(record, "commandId", issues);
    const actorId = readIdentifier(record, "actorId", issues);
    const workspaceId = readIdentifier(record, "workspaceId", issues);
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
    const constraints = readSafeStringArray(
      record.constraints,
      "constraints",
      issues,
      true,
    );

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION ||
      assistantId === undefined ||
      commandId === undefined ||
      actorId === undefined ||
      workspaceId === undefined ||
      generatedAt === undefined ||
      intent === undefined ||
      riskLevel === undefined ||
      objective === undefined ||
      requestedOutcome === undefined ||
      constraints === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      assistantId,
      commandId,
      constraints,
      contractVersion,
      generatedAt,
      intent,
      objective,
      requestedOutcome,
      riskLevel,
      workspaceId,
    });
  }
}

export class OperatorDecisionRequestValidator
  implements Validator<OperatorDecisionRequest>
{
  readonly #commandValidator = new OperatorCommandValidator();
  readonly #delegationDecisionValidator =
    new MainAssistantDelegationDecisionValidator();
  readonly #guardianDecisionValidator =
    new GuardianConsultationDecisionValidator();
  readonly #operatorDecisionValidator = new OperatorDecisionValidator();

  public validate(value: unknown): ValidationResult<OperatorDecisionRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator decision request must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REQUEST_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const protocolRequestId = readIdentifier(
      record,
      "protocolRequestId",
      issues,
    );
    const command = readNested(
      record.command,
      "command",
      this.#commandValidator,
      issues,
    );
    const guardianConsultation = readNested(
      record.guardianConsultation,
      "guardianConsultation",
      this.#guardianDecisionValidator,
      issues,
    );
    const operatorDecision = readNested(
      record.operatorDecision,
      "operatorDecision",
      this.#operatorDecisionValidator,
      issues,
    );
    const delegationDecision =
      record.delegationDecision === undefined
        ? undefined
        : readNested(
            record.delegationDecision,
            "delegationDecision",
            this.#delegationDecisionValidator,
            issues,
          );

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION ||
      assistantId === undefined ||
      protocolRequestId === undefined ||
      command === undefined ||
      guardianConsultation === undefined ||
      operatorDecision === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assistantId,
      command,
      contractVersion,
      ...(delegationDecision === undefined ? {} : { delegationDecision }),
      guardianConsultation,
      operatorDecision,
      protocolRequestId,
    });
  }
}

export class OperatorDecisionResponseValidator
  implements Validator<OperatorDecisionResponse>
{
  public validate(value: unknown): ValidationResult<OperatorDecisionResponse> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "operator decision response must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, RESPONSE_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const protocolRequestId = readIdentifier(
      record,
      "protocolRequestId",
      issues,
    );
    const responseId = readIdentifier(record, "responseId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const understoodObjective = readSafeString(
      record,
      "understoodObjective",
      issues,
      "",
      2_000,
    );
    const summary = readSafeString(record, "summary", issues, "", 2_000);
    const decision = readEnumValue(
      record.decision,
      "decision",
      DECISIONS,
      issues,
    );
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      RISK_LEVELS,
      issues,
    );
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    const safetyChecksConsulted = readSafetyChecks(
      record.safetyChecksConsulted,
      issues,
    );
    const blockedReasons = readSafeStringArray(
      record.blockedReasons,
      "blockedReasons",
      issues,
      true,
    );
    const missingInformation = readSafeStringArray(
      record.missingInformation,
      "missingInformation",
      issues,
      true,
    );
    const approvalPrompts = readApprovalPrompts(
      record.approvalPrompts,
      issues,
    );
    const clarificationRequests = readClarifications(
      record.clarificationRequests,
      issues,
    );
    const nextActions = readNextActions(record.nextActions, issues);
    const refusal =
      record.refusal === undefined
        ? undefined
        : readRefusal(record.refusal, "refusal", issues);
    const delegationSummary =
      record.delegationSummary === undefined
        ? undefined
        : readDelegationSummary(record.delegationSummary, issues);
    const missionPlanSummary =
      record.missionPlanSummary === undefined
        ? undefined
        : readMissionPlanSummary(record.missionPlanSummary, issues);
    const costBudgetPosture =
      record.costBudgetPosture === undefined
        ? undefined
        : readCostPosture(record.costBudgetPosture, issues);

    if (nonExecuting === false) {
      issues.push({
        code: "invalid_value",
        message: "nonExecuting must be true",
        path: "nonExecuting",
      });
    }
    validateResponseConsistency(
      decision,
      approvalPrompts,
      clarificationRequests,
      blockedReasons,
      refusal,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION ||
      assistantId === undefined ||
      protocolRequestId === undefined ||
      responseId === undefined ||
      generatedAt === undefined ||
      understoodObjective === undefined ||
      summary === undefined ||
      decision === undefined ||
      riskLevel === undefined ||
      nonExecuting !== true ||
      safetyChecksConsulted === undefined ||
      blockedReasons === undefined ||
      missingInformation === undefined ||
      approvalPrompts === undefined ||
      clarificationRequests === undefined ||
      nextActions === undefined ||
      refusal === false ||
      delegationSummary === false ||
      missionPlanSummary === false ||
      costBudgetPosture === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      approvalPrompts,
      assistantId,
      blockedReasons,
      clarificationRequests,
      contractVersion,
      ...(costBudgetPosture === undefined ? {} : { costBudgetPosture }),
      decision,
      ...(delegationSummary === undefined ? {} : { delegationSummary }),
      generatedAt,
      ...(missionPlanSummary === undefined ? {} : { missionPlanSummary }),
      missingInformation,
      nextActions,
      nonExecuting,
      protocolRequestId,
      ...(refusal === undefined ? {} : { refusal }),
      responseId,
      riskLevel,
      safetyChecksConsulted,
      summary,
      understoodObjective,
    });
  }
}

function readSafetyChecks(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorSafetyCheckSummary[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "safetyChecksConsulted must be an array",
      path: "safetyChecksConsulted",
    });
    return undefined;
  }
  const checks: OperatorSafetyCheckSummary[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `safetyChecksConsulted[${String(index)}]`;
    const check = readSafetyCheck(entry, path, issues);
    if (check === undefined) {
      continue;
    }
    if (seen.has(check.domain)) {
      issues.push({
        code: "duplicate",
        message: `${path}.domain must be unique`,
        path: `${path}.domain`,
      });
      continue;
    }
    seen.add(check.domain);
    checks.push(check);
  }
  return issues.some(({ path }) => path.startsWith("safetyChecksConsulted"))
    ? undefined
    : Object.freeze(checks);
}

function readSafetyCheck(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorSafetyCheckSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, SAFETY_CHECK_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const domain = readEnumValue(
    record.domain,
    `${path}.domain`,
    SAFETY_DOMAINS,
    issues,
  );
  const consulted = readRequiredBoolean(record, "consulted", issues, path);
  if (domain === undefined || consulted === undefined) {
    return undefined;
  }
  return { consulted, domain };
}

function readApprovalPrompts(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorApprovalPrompt[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "approvalPrompts must be an array",
      path: "approvalPrompts",
    });
    return undefined;
  }
  const prompts: OperatorApprovalPrompt[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `approvalPrompts[${String(index)}]`;
    const prompt = readApprovalPrompt(entry, path, issues);
    if (prompt === undefined) {
      continue;
    }
    if (seen.has(prompt.approvalId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.approvalId must be unique`,
        path: `${path}.approvalId`,
      });
      continue;
    }
    seen.add(prompt.approvalId);
    prompts.push(prompt);
  }
  return issues.some(({ path }) => path.startsWith("approvalPrompts"))
    ? undefined
    : Object.freeze(prompts);
}

function readApprovalPrompt(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorApprovalPrompt | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, APPROVAL_PROMPT_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const approvalId = readIdentifier(record, "approvalId", issues, path);
  const title = readSafeString(record, "title", issues, path, 300);
  const reason = readSafeString(record, "reason", issues, path, 1_000);
  const operation =
    record.operation === undefined
      ? undefined
      : readSafeString(record, "operation", issues, path, 160);
  if (approvalId === undefined || title === undefined || reason === undefined) {
    return undefined;
  }
  return {
    approvalId,
    ...(operation === undefined ? {} : { operation }),
    reason,
    title,
  };
}

function readClarifications(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorClarificationRequest[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "clarificationRequests must be an array",
      path: "clarificationRequests",
    });
    return undefined;
  }
  const clarifications: OperatorClarificationRequest[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `clarificationRequests[${String(index)}]`;
    const clarification = readClarification(entry, path, issues);
    if (clarification === undefined) {
      continue;
    }
    if (seen.has(clarification.questionId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.questionId must be unique`,
        path: `${path}.questionId`,
      });
      continue;
    }
    seen.add(clarification.questionId);
    clarifications.push(clarification);
  }
  return issues.some(({ path }) => path.startsWith("clarificationRequests"))
    ? undefined
    : Object.freeze(clarifications);
}

function readClarification(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorClarificationRequest | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, CLARIFICATION_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const questionId = readIdentifier(record, "questionId", issues, path);
  const question = readSafeString(record, "question", issues, path, 1_000);
  if (questionId === undefined || question === undefined) {
    return undefined;
  }
  return { question, questionId };
}

function readRefusal(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorRefusal | false | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return false;
  }
  rejectUnknownKeys(record, REFUSAL_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const refusalId = readIdentifier(record, "refusalId", issues, path);
  const reason = readSafeString(record, "reason", issues, path, 1_000);
  if (refusalId === undefined || reason === undefined) {
    return false;
  }
  return { reason, refusalId };
}

function readNextActions(
  value: unknown,
  issues: ValidationIssue[],
): readonly OperatorNextAction[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "nextActions must be an array",
      path: "nextActions",
    });
    return undefined;
  }
  const actions: OperatorNextAction[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `nextActions[${String(index)}]`;
    const action = readNextAction(entry, path, issues);
    if (action === undefined) {
      continue;
    }
    if (seen.has(action.actionId)) {
      issues.push({
        code: "duplicate",
        message: `${path}.actionId must be unique`,
        path: `${path}.actionId`,
      });
      continue;
    }
    seen.add(action.actionId);
    actions.push(action);
  }
  return issues.some(({ path }) => path.startsWith("nextActions"))
    ? undefined
    : Object.freeze(actions);
}

function readNextAction(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): OperatorNextAction | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  rejectUnknownKeys(record, NEXT_ACTION_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const actionId = readIdentifier(record, "actionId", issues, path);
  const description = readSafeString(
    record,
    "description",
    issues,
    path,
    1_000,
  );
  const priority = readEnumValue(
    record.priority,
    `${path}.priority`,
    NEXT_ACTION_PRIORITIES,
    issues,
  );
  if (
    actionId === undefined ||
    description === undefined ||
    priority === undefined
  ) {
    return undefined;
  }
  return { actionId, description, priority };
}

function readDelegationSummary(
  value: unknown,
  issues: ValidationIssue[],
): OperatorDelegationSummary | false | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "delegationSummary must be an object",
      path: "delegationSummary",
    });
    return false;
  }
  rejectUnknownKeys(record, DELEGATION_SUMMARY_KEYS, issues, "delegationSummary");
  rejectSensitiveKeys(record, issues, "delegationSummary");
  const agentId = readIdentifier(record, "agentId", issues, "delegationSummary");
  const category = readSafeString(
    record,
    "category",
    issues,
    "delegationSummary",
    160,
  );
  const decision = readEnumValue(
    record.decision,
    "delegationSummary.decision",
    DELEGATION_DECISIONS,
    issues,
  );
  const nonExecuting = readRequiredBoolean(
    record,
    "nonExecuting",
    issues,
    "delegationSummary",
  );
  if (nonExecuting === false) {
    issues.push({
      code: "invalid_value",
      message: "delegationSummary.nonExecuting must be true",
      path: "delegationSummary.nonExecuting",
    });
  }
  if (
    agentId === undefined ||
    category === undefined ||
    decision === undefined ||
    nonExecuting !== true
  ) {
    return false;
  }
  return { agentId, category, decision, nonExecuting };
}

function readMissionPlanSummary(
  value: unknown,
  issues: ValidationIssue[],
): OperatorMissionPlanSummary | false | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "missionPlanSummary must be an object",
      path: "missionPlanSummary",
    });
    return false;
  }
  rejectUnknownKeys(record, MISSION_SUMMARY_KEYS, issues, "missionPlanSummary");
  rejectSensitiveKeys(record, issues, "missionPlanSummary");
  const candidateId = readIdentifier(
    record,
    "candidateId",
    issues,
    "missionPlanSummary",
  );
  const objective = readSafeString(
    record,
    "objective",
    issues,
    "missionPlanSummary",
    2_000,
  );
  const requestedOutcome = readSafeString(
    record,
    "requestedOutcome",
    issues,
    "missionPlanSummary",
    2_000,
  );
  const steps = readSafeStringArray(
    record.steps,
    "missionPlanSummary.steps",
    issues,
    false,
  );
  const nonExecuting = readRequiredBoolean(
    record,
    "nonExecuting",
    issues,
    "missionPlanSummary",
  );
  if (nonExecuting === false) {
    issues.push({
      code: "invalid_value",
      message: "missionPlanSummary.nonExecuting must be true",
      path: "missionPlanSummary.nonExecuting",
    });
  }
  if (
    candidateId === undefined ||
    objective === undefined ||
    requestedOutcome === undefined ||
    steps === undefined ||
    nonExecuting !== true
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

function readCostPosture(
  value: unknown,
  issues: ValidationIssue[],
): OperatorDecisionResponse["costBudgetPosture"] | false | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "costBudgetPosture must be an object",
      path: "costBudgetPosture",
    });
    return false;
  }
  rejectUnknownKeys(record, COST_POSTURE_KEYS, issues, "costBudgetPosture");
  rejectSensitiveKeys(record, issues, "costBudgetPosture");
  const status = readEnumValue(
    record.status,
    "costBudgetPosture.status",
    COST_STATUSES,
    issues,
  );
  const summary = readSafeString(
    record,
    "summary",
    issues,
    "costBudgetPosture",
    1_000,
  );
  if (status === undefined || summary === undefined) {
    return false;
  }
  return { status, summary };
}

function validateResponseConsistency(
  decision: OperatorProtocolDecision | undefined,
  approvalPrompts: readonly OperatorApprovalPrompt[] | undefined,
  clarificationRequests: readonly OperatorClarificationRequest[] | undefined,
  blockedReasons: readonly string[] | undefined,
  refusal: OperatorRefusal | false | undefined,
  issues: ValidationIssue[],
): void {
  if (
    decision === "approval_required" &&
    (approvalPrompts?.length ?? 0) === 0
  ) {
    issues.push({
      code: "required",
      message: "approval_required responses must include approvalPrompts",
      path: "approvalPrompts",
    });
  }
  if (
    decision === "clarification_required" &&
    (clarificationRequests?.length ?? 0) === 0
  ) {
    issues.push({
      code: "required",
      message:
        "clarification_required responses must include clarificationRequests",
      path: "clarificationRequests",
    });
  }
  if (decision === "blocked" && (blockedReasons?.length ?? 0) === 0) {
    issues.push({
      code: "required",
      message: "blocked responses must include blockedReasons",
      path: "blockedReasons",
    });
  }
  if (decision === "refused" && refusal === undefined) {
    issues.push({
      code: "required",
      message: "refused responses must include refusal",
      path: "refusal",
    });
  }
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message:
        `contractVersion must be ${MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION}`,
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
      message: `${path} must not contain raw internal payload markers`,
      path,
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
      message: `${path} must not contain raw internal payload markers`,
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
        message: `${entryPath} must not contain raw internal payload markers`,
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
        message: `${prependPath(pathPrefix, key)} is not allowed in operator protocol contracts`,
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
