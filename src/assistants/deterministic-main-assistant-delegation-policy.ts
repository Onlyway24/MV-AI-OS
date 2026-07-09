import {
  MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
  MainAssistantDelegationPolicyValidationError,
  type MainAssistantDelegationDecision,
  type MainAssistantDelegationDecisionKind,
  type MainAssistantDelegationDecisionReason,
  type MainAssistantDelegationEvaluationRequest,
  type MainAssistantDelegationPolicyEvaluator,
  type MainAssistantDelegationPolicyTarget,
} from "./main-assistant-delegation-policy.js";
import {
  MainAssistantDelegationDecisionValidator,
  MainAssistantDelegationEvaluationRequestValidator,
} from "./main-assistant-delegation-policy-validator.js";
import { sortSafetyDomains } from "./guardian-consultation.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

export class DeterministicMainAssistantDelegationPolicyEvaluator
  implements MainAssistantDelegationPolicyEvaluator
{
  readonly #requestValidator =
    new MainAssistantDelegationEvaluationRequestValidator();
  readonly #decisionValidator = new MainAssistantDelegationDecisionValidator();

  public evaluate(
    request: MainAssistantDelegationEvaluationRequest,
  ): MainAssistantDelegationDecision {
    const requestValidation = this.#requestValidator.validate(request);
    if (!requestValidation.ok) {
      throw new MainAssistantDelegationPolicyValidationError(
        "Main Assistant delegation request is invalid",
        requestValidation.issues,
      );
    }

    const validRequest = requestValidation.value;
    const decision = buildDecision(validRequest);
    const decisionValidation = this.#decisionValidator.validate(decision);
    if (!decisionValidation.ok) {
      throw new MainAssistantDelegationPolicyValidationError(
        "Main Assistant delegation policy generated an invalid decision",
        decisionValidation.issues,
      );
    }
    return decisionValidation.value;
  }
}

function buildDecision(
  request: MainAssistantDelegationEvaluationRequest,
): MainAssistantDelegationDecision {
  const target = findTarget(request);
  if (target === undefined) {
    return createDecision(request, {
      blockedReasons: [
        "Requested target is not declared as an allowed future specialist.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "target_not_allowed",
          "Requested target is not declared by the delegation policy.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Keep the request inside Only Way Assistant or add a validated future AgentSpecification before delegation.",
      ],
    });
  }

  if (request.policy.forbiddenCategories.includes(request.requestedCategory)) {
    return createDecision(request, {
      blockedReasons: [
        "Requested delegation category is forbidden before future approval and execution boundaries exist.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "category_forbidden",
          "Requested category is listed as forbidden by the delegation policy.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Use a non-executing plan or request explicit future approval after the missing execution boundary exists.",
      ],
    });
  }

  if (target.category !== request.requestedCategory) {
    return createDecision(request, {
      blockedReasons: [
        "Requested delegation category does not match the declared target category.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "category_mismatch",
          "Target category must match the requested delegation category.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Select the target category declared by the validated delegation policy.",
      ],
    });
  }

  if (
    request.policy.noCircularDelegation &&
    request.delegationPath.includes(request.targetAgentId)
  ) {
    return createDecision(request, {
      blockedReasons: [
        "Requested delegation would create a circular delegation path.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "circular_delegation",
          "Delegation path already contains the requested target.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Return control to Only Way Assistant instead of re-entering an existing target.",
      ],
    });
  }

  if (request.currentDelegationDepth >= request.policy.maxDelegationDepth) {
    return createDecision(request, {
      blockedReasons: [
        "Requested delegation exceeds the configured maximum delegation depth.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "max_depth_exceeded",
          "Delegation depth is already at the configured maximum.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Complete or review the current bounded handoff before proposing another specialist.",
      ],
    });
  }

  if (
    request.policy.requiresGuardianConsultation &&
    request.guardianConsultation === undefined
  ) {
    return createDecision(request, {
      blockedReasons: [
        "Guardian Consultation is required before delegation can be allowed.",
      ],
      decision: "blocked",
      reasons: [
        reason(
          "missing_guardian_consultation",
          "Delegation policy requires Guardian Consultation.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Provide a current Guardian Consultation decision before delegation.",
      ],
    });
  }

  const guardian = request.guardianConsultation;
  if (guardian?.decision === "blocked") {
    return createDecision(request, {
      blockedReasons: guardian.blockers,
      checkedGuardianDomains: guardian.checkedSafetyDomains,
      decision: "blocked",
      reasons: [
        reason(
          "guardian_blocked",
          "Guardian Consultation blocked the requested escalation.",
          "block",
        ),
      ],
      recommendedNextActions: guardian.recommendedNextActions,
    });
  }

  if (
    request.policy.requiresOperatorSafetyReport &&
    (guardian?.operatorSafetyStatus === undefined ||
      guardian.operatorSafetyStatus === "missing" ||
      guardian.safetyToAutonomy === "missing")
  ) {
    return createDecision(request, {
      blockedReasons: [
        "Operator Safety Report is required before delegation can be allowed.",
      ],
      checkedGuardianDomains: guardian?.checkedSafetyDomains ?? [],
      decision: "blocked",
      reasons: [
        reason(
          "missing_operator_safety_report",
          "Delegation policy requires a supplied Operator Safety Report.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Supply Operator Safety Report coverage before any future specialist handoff.",
      ],
    });
  }

  const missingGuardianDomains = missingDomains(target, guardian);
  if (missingGuardianDomains.length > 0) {
    return createDecision(request, {
      blockedReasons: missingGuardianDomains.map(
        (domain) => `Missing required Guardian domain: ${domain}.`,
      ),
      checkedGuardianDomains: guardian?.checkedSafetyDomains ?? [],
      decision: "blocked",
      missingGuardianDomains,
      reasons: [
        reason(
          "missing_guardian_domain",
          "Delegation target requires Guardian domains that were not checked.",
          "block",
        ),
      ],
      recommendedNextActions: [
        "Run or supply the missing safety-domain review before delegation.",
      ],
    });
  }

  const requiredApprovalIds = requiredApprovals(request, target);
  const missingApprovalIds = requiredApprovalIds.filter(
    (approvalId) => !request.approvalGrantIds.includes(approvalId),
  );
  if (missingApprovalIds.length > 0) {
    return createDecision(request, {
      checkedGuardianDomains: guardian?.checkedSafetyDomains ?? [],
      decision: "requires_approval",
      missingApprovalIds,
      reasons: [
        reason(
          "approval_required",
          "Delegation target requires explicit approval before it can be proposed.",
          "confirm",
        ),
      ],
      recommendedNextActions: [
        "Ask Fabio for explicit approval before proposing this future specialist handoff.",
      ],
      requiredApprovalIds,
    });
  }

  if (
    guardian?.decision === "requires_operator_confirmation"
  ) {
    return createDecision(request, {
      checkedGuardianDomains: guardian.checkedSafetyDomains,
      decision: "requires_operator_confirmation",
      reasons: [
        reason(
          "guardian_confirmation_required",
          "Guardian Consultation requires operator confirmation before delegation.",
          "confirm",
        ),
      ],
      recommendedNextActions: guardian.recommendedNextActions,
      requiredApprovalIds,
    });
  }

  if (guardian?.decision === "continue_with_warning") {
    return createDecision(request, {
      checkedGuardianDomains: guardian.checkedSafetyDomains,
      decision: "requires_operator_confirmation",
      reasons: [
        reason(
          "guardian_warning",
          "Guardian Consultation allows continuation only with warning.",
          "warn",
        ),
      ],
      recommendedNextActions: [
        "Confirm that Fabio accepts the guardian warning before proposing the handoff.",
      ],
      requiredApprovalIds,
    });
  }

  return createDecision(request, {
    checkedGuardianDomains: guardian?.checkedSafetyDomains ?? [],
    decision: "allowed",
    reasons: [
      reason(
        "delegation_allowed",
        "Delegation policy allows a non-executing future specialist handoff.",
        "allow",
      ),
    ],
    recommendedNextActions: [
      "Present this as a candidate non-executing delegation; do not invoke the specialist yet.",
    ],
    requiredApprovalIds,
  });
}

interface DecisionOverrides {
  readonly blockedReasons?: readonly string[];
  readonly checkedGuardianDomains?: readonly MainAssistantSafetyDomain[];
  readonly decision: MainAssistantDelegationDecisionKind;
  readonly missingApprovalIds?: readonly string[];
  readonly missingGuardianDomains?: readonly MainAssistantSafetyDomain[];
  readonly reasons: readonly MainAssistantDelegationDecisionReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requiredApprovalIds?: readonly string[];
}

function createDecision(
  request: MainAssistantDelegationEvaluationRequest,
  overrides: DecisionOverrides,
): MainAssistantDelegationDecision {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: overrides.blockedReasons ?? [],
    checkedGuardianDomains: sortSafetyDomains(overrides.checkedGuardianDomains ?? []),
    contractVersion: MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
    currentDelegationDepth: request.currentDelegationDepth,
    decision: overrides.decision,
    delegationPath: Object.freeze([...request.delegationPath]),
    generatedAt: request.generatedAt,
    missingApprovalIds: Object.freeze(
      [...(overrides.missingApprovalIds ?? [])].sort(),
    ),
    missingGuardianDomains: sortSafetyDomains(
      overrides.missingGuardianDomains ?? [],
    ),
    nonExecuting: true,
    reasons: Object.freeze([...overrides.reasons]),
    recommendedNextActions: Object.freeze([
      ...overrides.recommendedNextActions,
    ]),
    requestId: request.requestId,
    requiredApprovalIds: Object.freeze(
      [...(overrides.requiredApprovalIds ?? [])].sort(),
    ),
    targetAgentId: request.targetAgentId,
    targetCategory: request.requestedCategory,
  };
}

function findTarget(
  request: MainAssistantDelegationEvaluationRequest,
): MainAssistantDelegationPolicyTarget | undefined {
  return request.policy.allowedTargets.find(
    ({ agentId }) => agentId === request.targetAgentId,
  );
}

function missingDomains(
  target: MainAssistantDelegationPolicyTarget,
  guardian: MainAssistantDelegationEvaluationRequest["guardianConsultation"],
): readonly MainAssistantSafetyDomain[] {
  if (guardian === undefined) {
    return target.requiredGuardianDomains;
  }
  const checked = new Set(guardian.checkedSafetyDomains);
  return sortSafetyDomains(
    target.requiredGuardianDomains.filter((domain) => !checked.has(domain)),
  );
}

function requiredApprovals(
  request: MainAssistantDelegationEvaluationRequest,
  target: MainAssistantDelegationPolicyTarget,
): readonly string[] {
  const approvalIds = new Set(target.requiredApprovalIds);
  for (const approval of request.guardianConsultation?.requiredApprovals ?? []) {
    if (
      request.requestedOperations.includes(approval.operation) ||
      target.requiredOperations.includes(approval.operation)
    ) {
      approvalIds.add(approval.approvalId);
    }
  }
  if (target.category === "publishing") {
    approvalIds.add("approve-external-side-effects");
  }
  return Object.freeze([...approvalIds].sort());
}

function reason(
  code: MainAssistantDelegationDecisionReason["code"],
  message: string,
  severity: MainAssistantDelegationDecisionReason["severity"],
): MainAssistantDelegationDecisionReason {
  return {
    code,
    message,
    severity,
  };
}
