import {
  MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
  MainAssistantOperatorProtocolValidationError,
  type MainAssistantOperatorProtocol,
  type OperatorApprovalPrompt,
  type OperatorClarificationRequest,
  type OperatorDecisionRequest,
  type OperatorDecisionResponse,
  type OperatorMissionPlanSummary,
  type OperatorNextAction,
  type OperatorRefusal,
  type OperatorSafetyCheckSummary,
} from "./main-assistant-operator-protocol.js";
import {
  OperatorDecisionRequestValidator,
  OperatorDecisionResponseValidator,
} from "./main-assistant-operator-protocol-validator.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { OperatorDecision } from "./operator-decision-engine.js";

const SAFETY_DOMAIN_ORDER: readonly MainAssistantSafetyDomain[] = [
  "operator_safety",
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

export class DeterministicMainAssistantOperatorProtocol
  implements MainAssistantOperatorProtocol
{
  readonly #requestValidator = new OperatorDecisionRequestValidator();
  readonly #responseValidator = new OperatorDecisionResponseValidator();

  public respond(request: OperatorDecisionRequest): OperatorDecisionResponse {
    const requestValidation = this.#requestValidator.validate(request);
    if (!requestValidation.ok) {
      throw new MainAssistantOperatorProtocolValidationError(
        "Operator protocol request is invalid",
        requestValidation.issues,
      );
    }

    const validRequest = requestValidation.value;
    const response = buildResponse(validRequest);
    const responseValidation = this.#responseValidator.validate(response);
    if (!responseValidation.ok) {
      throw new MainAssistantOperatorProtocolValidationError(
        "Operator protocol generated an invalid response",
        responseValidation.issues,
      );
    }
    return responseValidation.value;
  }
}

function buildResponse(
  request: OperatorDecisionRequest,
): OperatorDecisionResponse {
  const decision = request.operatorDecision;
  const approvalPrompts = approvalPromptsFor(decision);
  const clarificationRequests = clarificationRequestsFor(decision);
  const blockedReasons = Object.freeze([...decision.blockedReasons]);
  const missingInformation = Object.freeze([...decision.clarificationQuestions]);
  const nextActions = nextActionsFor(decision);
  const refusal = refusalFor(decision);
  const missionPlanSummary = missionPlanSummaryFor(decision);

  return {
    approvalPrompts,
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons,
    clarificationRequests,
    contractVersion: MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
    ...(decision.costPosture === undefined
      ? {}
      : { costBudgetPosture: decision.costPosture }),
    decision: decision.decision,
    ...(request.delegationDecision === undefined
      ? {}
      : {
          delegationSummary: {
            agentId: request.delegationDecision.targetAgentId,
            category: request.delegationDecision.targetCategory,
            decision: request.delegationDecision.decision,
            nonExecuting: true,
          },
        }),
    generatedAt: decision.generatedAt,
    ...(missionPlanSummary === undefined ? {} : { missionPlanSummary }),
    missingInformation,
    nextActions,
    nonExecuting: true,
    protocolRequestId: request.protocolRequestId,
    ...(refusal === undefined ? {} : { refusal }),
    responseId: `${request.protocolRequestId}:response`,
    riskLevel: decision.riskLevel,
    safetyChecksConsulted: safetyChecksFor(request),
    summary: summaryFor(decision),
    understoodObjective: request.command.objective,
  };
}

function approvalPromptsFor(
  decision: OperatorDecision,
): readonly OperatorApprovalPrompt[] {
  return Object.freeze(
    [...decision.requiredApprovals]
      .sort(
        (left, right) =>
          left.operation.localeCompare(right.operation) ||
          left.approvalId.localeCompare(right.approvalId),
      )
      .map((approval): OperatorApprovalPrompt => ({
        approvalId: approval.approvalId,
        operation: approval.operation,
        reason: approval.rationale,
        title: `Approval required for ${approval.operation}`,
      })),
  );
}

function clarificationRequestsFor(
  decision: OperatorDecision,
): readonly OperatorClarificationRequest[] {
  return Object.freeze(
    decision.clarificationQuestions.map((question, index) => ({
      question,
      questionId: `clarification-${String(index + 1).padStart(3, "0")}`,
    })),
  );
}

function nextActionsFor(decision: OperatorDecision): readonly OperatorNextAction[] {
  return Object.freeze(
    decision.recommendedNextActions.map((description, index) => ({
      actionId: `next-action-${String(index + 1).padStart(3, "0")}`,
      description,
      priority: index === 0 ? ("primary" as const) : ("secondary" as const),
    })),
  );
}

function refusalFor(decision: OperatorDecision): OperatorRefusal | undefined {
  if (decision.decision !== "refused") {
    return undefined;
  }
  return {
    reason: decision.explanation,
    refusalId: `${decision.decisionId}:refusal`,
  };
}

function missionPlanSummaryFor(
  decision: OperatorDecision,
): OperatorMissionPlanSummary | undefined {
  const candidate = decision.missionPlanCandidate;
  if (candidate === undefined) {
    return undefined;
  }
  return {
    candidateId: candidate.candidateId,
    nonExecuting: true,
    objective: candidate.objective,
    requestedOutcome: candidate.requestedOutcome,
    steps: Object.freeze(candidate.steps.map(({ title }) => title)),
  };
}

function safetyChecksFor(
  request: OperatorDecisionRequest,
): readonly OperatorSafetyCheckSummary[] {
  const checked = new Set([
    ...request.guardianConsultation.checkedSafetyDomains,
    ...(request.delegationDecision?.checkedGuardianDomains ?? []),
  ]);
  return Object.freeze(
    SAFETY_DOMAIN_ORDER.map((domain) => ({
      consulted: checked.has(domain),
      domain,
    })),
  );
}

function summaryFor(decision: OperatorDecision): string {
  if (decision.decision === "proceed") {
    return "Only Way Assistant may proceed inside the current controlled boundaries.";
  }
  if (decision.decision === "mission_plan_candidate") {
    return "Only Way Assistant prepared a non-executing mission-plan candidate for review.";
  }
  if (decision.decision === "approval_required") {
    return "Only Way Assistant needs Fabio approval before continuing.";
  }
  if (decision.decision === "clarification_required") {
    return "Only Way Assistant needs clarification before deciding the next safe action.";
  }
  if (decision.decision === "confirmation_required") {
    return "Only Way Assistant needs Fabio confirmation before continuing.";
  }
  if (decision.decision === "refused") {
    return "Only Way Assistant refused the requested path inside the current safety boundaries.";
  }
  return "Only Way Assistant blocked the requested path inside the current safety boundaries.";
}
