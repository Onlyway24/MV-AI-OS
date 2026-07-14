import {
  OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
  type OperatorDecision,
  type OperatorDecisionCertainty,
  type OperatorDecisionContext,
  type OperatorDecisionEngine,
  type OperatorDecisionKind,
  type OperatorDecisionReason,
  type OperatorDecisionReasonCode,
  type OperatorDecisionReasonSeverity,
  OperatorDecisionValidationError,
  type OperatorMissionPlanCandidate,
} from "./operator-decision-engine.js";
import {
  OperatorDecisionContextValidator,
  OperatorDecisionValidator,
} from "./operator-decision-engine-validator.js";
import type { GuardianConsultationApprovalRequirement } from "./guardian-consultation.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantEscalationType,
} from "./main-assistant-specification.js";

export class DeterministicOperatorDecisionEngine
  implements OperatorDecisionEngine
{
  readonly #contextValidator = new OperatorDecisionContextValidator();
  readonly #decisionValidator = new OperatorDecisionValidator();

  public decide(context: OperatorDecisionContext): OperatorDecision {
    const contextValidation = this.#contextValidator.validate(context);
    if (!contextValidation.ok) {
      throw new OperatorDecisionValidationError(
        "Operator decision context is invalid",
        contextValidation.issues,
      );
    }

    const validContext = contextValidation.value;
    const decision = buildDecision(validContext);
    const decisionValidation = this.#decisionValidator.validate(decision);
    if (!decisionValidation.ok) {
      throw new OperatorDecisionValidationError(
        "Operator decision engine generated an invalid decision",
        decisionValidation.issues,
      );
    }
    return decisionValidation.value;
  }
}

function buildDecision(context: OperatorDecisionContext): OperatorDecision {
  if (context.guardianConsultation.decision === "blocked") {
    return createDecision(context, {
      blockedReasons: context.guardianConsultation.blockers,
      certainty: "high",
      decision: "blocked",
      explanation:
        "Onlyway Assistant stopped because Guardian Consultation blocked the requested operation.",
      reasons: [
        reason(
          "guardian_blocked",
          "Guardian Consultation returned a blocking decision.",
          "block",
        ),
      ],
      recommendedNextActions:
        context.guardianConsultation.recommendedNextActions,
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (context.costPosture?.status === "over_budget") {
    return createDecision(context, {
      blockedReasons: [context.costPosture.summary],
      certainty: "high",
      decision: "blocked",
      explanation:
        "Onlyway Assistant stopped because the supplied cost posture is over budget.",
      reasons: [
        reason(
          "cost_budget_blocked",
          "Supplied cost posture is over budget.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Reduce scope, update the budget explicitly, or choose a cheaper bounded path before continuing.",
      ],
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (isUnderSpecified(context)) {
    return createDecision(context, {
      blockedReasons: [],
      certainty: "low",
      clarificationQuestions: [
        "What concrete business outcome should Onlyway Assistant optimize for?",
        "What final output should Fabio receive from this request?",
      ],
      decision: "clarification_required",
      explanation:
        "Onlyway Assistant needs a clearer objective and requested outcome before making an operator decision.",
      reasons: [
        reason(
          "under_specified_request",
          "The operator request is under-specified.",
          "confirm",
        ),
      ],
      recommendedNextActions: [
        "Clarify objective, requested outcome, constraints, and success criteria.",
      ],
      requiredApprovals: [],
    });
  }

  if (context.guardianConsultation.decision === "requires_operator_confirmation") {
    return createDecision(context, {
      blockedReasons: [],
      certainty: "medium",
      decision: "confirmation_required",
      explanation:
        "Onlyway Assistant needs Fabio confirmation before continuing because Guardian Consultation requires it.",
      reasons: [
        reason(
          "guardian_confirmation_required",
          "Guardian Consultation requires operator confirmation.",
          "confirm",
        ),
      ],
      recommendedNextActions:
        context.guardianConsultation.recommendedNextActions,
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (context.guardianConsultation.decision === "requires_approval") {
    return createDecision(context, {
      blockedReasons: [],
      certainty: "medium",
      decision: "approval_required",
      explanation:
        "Onlyway Assistant needs explicit Fabio approval before the requested escalation can proceed.",
      reasons: [
        reason(
          "approval_required",
          "Guardian Consultation identified required approvals.",
          "confirm",
        ),
      ],
      recommendedNextActions: [
        "Ask Fabio for explicit approval before proceeding with the requested escalation.",
      ],
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (context.costPosture?.status === "near_limit") {
    return createDecision(context, {
      blockedReasons: [],
      certainty: "medium",
      decision: "confirmation_required",
      explanation:
        "Onlyway Assistant needs Fabio confirmation because the supplied cost posture is near its limit.",
      reasons: [
        reason(
          "cost_budget_warning",
          "Supplied cost posture is near its configured limit.",
          "confirm",
        ),
      ],
      recommendedNextActions: [
        "Confirm whether to continue within the current cost posture or reduce scope.",
      ],
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (context.delegationSignal?.delegationAllowed === false) {
    return createDecision(context, {
      blockedReasons: [context.delegationSignal.rationale],
      certainty: "medium",
      decision: "refused",
      explanation:
        "Onlyway Assistant refused to propose delegation because the supplied delegation signal does not allow it.",
      reasons: [
        reason(
          "delegation_not_allowed",
          "Supplied delegation signal does not allow delegation.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Keep the request within the current operator boundary or provide an approved delegation policy later.",
      ],
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  if (context.intent === "plan") {
    return createDecision(context, {
      blockedReasons: [],
      certainty: "high",
      decision: "mission_plan_candidate",
      explanation:
        "Onlyway Assistant can create a non-executing mission-plan candidate for this bounded request.",
      missionPlanCandidate: createMissionPlanCandidate(context),
      reasons: [
        reason(
          "mission_plan_candidate_ready",
          "The request is sufficiently specified and safe for a dry-run mission-plan candidate.",
          "allow",
        ),
      ],
      recommendedNextActions: [
        "Review the non-executing mission-plan candidate before any future delegation or workflow runtime exists.",
      ],
      requiredApprovals: context.guardianConsultation.requiredApprovals,
    });
  }

  return createDecision(context, {
    blockedReasons: [],
    certainty:
      context.guardianConsultation.decision === "continue_with_warning"
        ? "medium"
        : "high",
    decision: "proceed",
    explanation:
      context.guardianConsultation.decision === "continue_with_warning"
        ? "Onlyway Assistant may proceed with visible guardian warnings inside controlled boundaries."
        : "Onlyway Assistant may proceed inside the current controlled boundaries.",
    reasons: [
      context.guardianConsultation.decision === "continue_with_warning"
        ? reason(
            "guardian_warning",
            "Guardian Consultation allows continuation with warning.",
            "warn",
          )
        : reason(
            "ready_to_proceed",
            "The request is sufficiently specified and safety gates allow continuation.",
            "allow",
          ),
    ],
    recommendedNextActions: [
      context.guardianConsultation.decision === "continue_with_warning"
        ? "Proceed only with warnings visible to Fabio and without expanding autonomy."
        : "Proceed with the bounded operator decision path.",
    ],
    requiredApprovals: context.guardianConsultation.requiredApprovals,
  });
}

interface DecisionOverrides {
  readonly blockedReasons: readonly string[];
  readonly certainty: OperatorDecisionCertainty;
  readonly clarificationQuestions?: readonly string[];
  readonly decision: OperatorDecisionKind;
  readonly explanation: string;
  readonly missionPlanCandidate?: OperatorMissionPlanCandidate;
  readonly reasons: readonly OperatorDecisionReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
}

function createDecision(
  context: OperatorDecisionContext,
  overrides: DecisionOverrides,
): OperatorDecision {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: Object.freeze([...overrides.blockedReasons]),
    certainty: overrides.certainty,
    clarificationQuestions: Object.freeze([
      ...(overrides.clarificationQuestions ?? []),
    ]),
    contractVersion: OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
    ...(context.costPosture === undefined ? {} : { costPosture: context.costPosture }),
    decision: overrides.decision,
    decisionId: context.decisionId,
    explanation: overrides.explanation,
    generatedAt: context.generatedAt,
    guardianDecision: context.guardianConsultation.decision,
    ...(overrides.missionPlanCandidate === undefined
      ? {}
      : { missionPlanCandidate: overrides.missionPlanCandidate }),
    reasons: Object.freeze([...overrides.reasons]),
    recommendedNextActions: Object.freeze([
      ...overrides.recommendedNextActions,
    ]),
    requiredApprovals: Object.freeze([...overrides.requiredApprovals]),
    requestedOperations: sortEscalationTypes(context.requestedOperations),
    riskLevel: context.riskLevel,
  };
}

function createMissionPlanCandidate(
  context: OperatorDecisionContext,
): OperatorMissionPlanCandidate {
  return {
    candidateId: `${context.decisionId}:mission-plan-candidate`,
    nonExecuting: true,
    objective: context.objective,
    requestedOutcome: context.requestedOutcome,
    steps: [
      {
        description:
          "Preserve the objective, requested outcome, constraints, safety state, and approval requirements before any future execution layer is involved.",
        requiresApproval: false,
        stepId: "mission-step-1",
        title: "Confirm mission boundary",
      },
      {
        description:
          "Keep future work inside MV AI OS policy, guardian consultation, delegation, workflow, and tool boundaries as those capabilities become available.",
        requiresApproval: context.guardianConsultation.requiredApprovals.length > 0,
        stepId: "mission-step-2",
        title: "Prepare governed execution path",
      },
    ],
  };
}

function isUnderSpecified(context: OperatorDecisionContext): boolean {
  return (
    countWords(context.objective) < 3 ||
    countWords(context.requestedOutcome) < 2
  );
}

function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter((entry) => entry.length > 0).length;
}

function reason(
  code: OperatorDecisionReasonCode,
  message: string,
  severity: OperatorDecisionReasonSeverity,
): OperatorDecisionReason {
  return {
    code,
    message,
    severity,
  };
}

function sortEscalationTypes(
  operations: readonly MainAssistantEscalationType[],
): readonly MainAssistantEscalationType[] {
  const order: readonly MainAssistantEscalationType[] = [
    "cloud_or_vps_readiness",
    "external_side_effect",
    "increase_autonomy",
    "memory_write",
    "model_expansion",
    "publish_or_send",
    "tool_execution",
    "workflow_execution",
  ];
  return Object.freeze(
    [...operations].sort(
      (left, right) => order.indexOf(left) - order.indexOf(right),
    ),
  );
}
