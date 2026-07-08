import type { OperatorSafetyReport } from "../guardians/operator-safety-report.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { MainAssistantInvocationRiskLevel } from "./main-assistant-runtime.js";
import {
  DEFAULT_GUARDIAN_CONSULTATION_POLICY,
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  type GuardianConsultationApprovalRequirement,
  type GuardianConsultationDecision,
  type GuardianConsultationDecisionKind,
  type GuardianConsultationEvaluator,
  type GuardianConsultationPolicy,
  type GuardianConsultationReason,
  type GuardianConsultationReasonCode,
  type GuardianConsultationReasonSeverity,
  type GuardianConsultationRequest,
  GuardianConsultationValidationError,
  sortSafetyDomains,
} from "./guardian-consultation.js";
import {
  GuardianConsultationDecisionValidator,
  GuardianConsultationPolicyValidator,
  GuardianConsultationRequestValidator,
} from "./guardian-consultation-validator.js";

export class DeterministicGuardianConsultationEvaluator
  implements GuardianConsultationEvaluator
{
  readonly #decisionValidator = new GuardianConsultationDecisionValidator();
  readonly #policy: GuardianConsultationPolicy;
  readonly #requestValidator = new GuardianConsultationRequestValidator();

  public constructor(
    policy: GuardianConsultationPolicy = DEFAULT_GUARDIAN_CONSULTATION_POLICY,
  ) {
    const policyValidation =
      new GuardianConsultationPolicyValidator().validate(policy);
    if (!policyValidation.ok) {
      throw new GuardianConsultationValidationError(
        "Guardian consultation policy is invalid",
        policyValidation.issues,
      );
    }
    this.#policy = policyValidation.value;
  }

  public evaluate(
    request: GuardianConsultationRequest,
  ): GuardianConsultationDecision {
    const requestValidation = this.#requestValidator.validate(request);
    if (!requestValidation.ok) {
      throw new GuardianConsultationValidationError(
        "Guardian consultation request is invalid",
        requestValidation.issues,
      );
    }

    const validRequest = requestValidation.value;
    const riskyRequest = isRiskyRequest(validRequest.riskLevel, validRequest.requestedOperations);
    const checkedSafetyDomains = checkedDomains(validRequest.operatorSafetyReport);
    const missingRequiredSafetyDomains = requiredSafetyDomains(
      validRequest.requestedOperations,
      this.#policy,
      riskyRequest,
    ).filter((domain) => !checkedSafetyDomains.includes(domain));
    const requiredApprovals = requiredApprovalsForOperations(
      validRequest.requestedOperations,
      this.#policy,
    );
    const decision = buildDecision({
      checkedSafetyDomains,
      missingRequiredSafetyDomains,
      request: validRequest,
      requiredApprovals,
      riskyRequest,
      policy: this.#policy,
    });

    const decisionValidation = this.#decisionValidator.validate(decision);
    if (!decisionValidation.ok) {
      throw new GuardianConsultationValidationError(
        "Guardian consultation generated an invalid decision",
        decisionValidation.issues,
      );
    }
    return decisionValidation.value;
  }
}

interface BuildDecisionInput {
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly policy: GuardianConsultationPolicy;
  readonly request: GuardianConsultationRequest;
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
  readonly riskyRequest: boolean;
}

function buildDecision(input: BuildDecisionInput): GuardianConsultationDecision {
  const {
    checkedSafetyDomains,
    missingRequiredSafetyDomains,
    policy,
    request,
    requiredApprovals,
    riskyRequest,
  } = input;
  const report = request.operatorSafetyReport;

  if (report === undefined) {
    return decisionForMissingReport(
      request,
      checkedSafetyDomains,
      missingRequiredSafetyDomains,
      requiredApprovals,
      riskyRequest,
      policy,
    );
  }

  if (
    report.summary.safetyToAutonomy === "do_not_increase_autonomy" ||
    report.summary.status === "critical"
  ) {
    return decisionForCriticalReport(
      request,
      checkedSafetyDomains,
      missingRequiredSafetyDomains,
      requiredApprovals,
      riskyRequest,
      policy,
      report,
    );
  }

  if (
    report.summary.safetyToAutonomy === "unknown" ||
    report.summary.status === "unknown" ||
    missingRequiredSafetyDomains.length > 0
  ) {
    return decisionForUnknownReport(
      request,
      checkedSafetyDomains,
      missingRequiredSafetyDomains,
      requiredApprovals,
      riskyRequest,
      policy,
      report,
    );
  }

  if (report.summary.status === "attention_required") {
    return decisionForAttentionReport(
      request,
      checkedSafetyDomains,
      missingRequiredSafetyDomains,
      requiredApprovals,
      riskyRequest,
      policy,
      report,
    );
  }

  if (requiredApprovals.length > 0) {
    return createDecision(request, {
      acknowledgementRequired: false,
      blockers: [],
      checkedSafetyDomains,
      decision: "requires_approval",
      missingRequiredSafetyDomains,
      operatorSafetyStatus: report.summary.status,
      reasons: [
        reason(
          "approval_required",
          "Requested escalation requires explicit Fabio approval before it can proceed.",
          "confirm",
        ),
      ],
      recommendedNextActions: [
        "Collect explicit operator approval before any escalation or side effect.",
      ],
      requiredApprovals,
      safetyToAutonomy: report.summary.safetyToAutonomy,
      warnings: [],
    });
  }

  return createDecision(request, {
    acknowledgementRequired: false,
    blockers: [],
    checkedSafetyDomains,
    decision: "may_continue",
    missingRequiredSafetyDomains,
    operatorSafetyStatus: report.summary.status,
    reasons: [
      reason(
        "healthy_operator_safety",
        "Operator Safety is healthy for this bounded request.",
        "allow",
      ),
    ],
    recommendedNextActions: [
      "Continue inside the current controlled MV AI OS boundaries.",
    ],
    requiredApprovals,
    safetyToAutonomy: report.summary.safetyToAutonomy,
    warnings: [],
  });
}

function decisionForMissingReport(
  request: GuardianConsultationRequest,
  checkedSafetyDomains: readonly MainAssistantSafetyDomain[],
  missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[],
  requiredApprovals: readonly GuardianConsultationApprovalRequirement[],
  riskyRequest: boolean,
  policy: GuardianConsultationPolicy,
): GuardianConsultationDecision {
  const blocked = riskyRequest && policy.blockRiskyWhenSafetyMissing;
  return createDecision(request, {
    acknowledgementRequired: !blocked,
    blockers: blocked
      ? [
          "Operator Safety Report is required before risky escalation can continue.",
        ]
      : [],
    checkedSafetyDomains,
    decision: blocked ? "blocked" : "requires_operator_confirmation",
    missingRequiredSafetyDomains,
    operatorSafetyStatus: "missing",
    reasons: [
      reason(
        "missing_operator_safety_report",
        "Operator Safety Report was not supplied for consultation.",
        blocked ? "block" : "confirm",
      ),
    ],
    recommendedNextActions: [
      "Supply a current Operator Safety Report before expanding autonomy, delegation, tools, workflows, publishing, cloud, or external side effects.",
    ],
    requiredApprovals,
    safetyToAutonomy: "missing",
    warnings: blocked
      ? []
      : [
          "Safety state is missing; continue only as bounded planning with explicit operator confirmation.",
        ],
  });
}

function decisionForCriticalReport(
  request: GuardianConsultationRequest,
  checkedSafetyDomains: readonly MainAssistantSafetyDomain[],
  missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[],
  requiredApprovals: readonly GuardianConsultationApprovalRequirement[],
  riskyRequest: boolean,
  policy: GuardianConsultationPolicy,
  report: OperatorSafetyReport,
): GuardianConsultationDecision {
  const blocked = riskyRequest && policy.blockCriticalEscalation;
  return createDecision(request, {
    acknowledgementRequired: !blocked,
    blockers: blocked
      ? [
          "Operator Safety is critical and blocks escalation.",
          ...report.summary.criticalDomains.map(
            (domain) => `Critical safety domain: ${domain}.`,
          ),
        ]
      : [],
    checkedSafetyDomains,
    decision: blocked ? "blocked" : "continue_with_warning",
    missingRequiredSafetyDomains,
    operatorSafetyStatus: report.summary.status,
    reasons: [
      reason(
        "critical_operator_safety",
        "Operator Safety contains critical findings.",
        blocked ? "block" : "warn",
      ),
      reason(
        "unsafe_autonomy_decision",
        "Safety-to-autonomy decision does not allow increased autonomy.",
        blocked ? "block" : "warn",
      ),
    ],
    recommendedNextActions: [
      "Resolve critical Operator Safety findings before escalation.",
    ],
    requiredApprovals,
    safetyToAutonomy: report.summary.safetyToAutonomy,
    warnings: blocked
      ? []
      : [
          "Critical safety findings are present; continue only with bounded non-escalating work.",
        ],
  });
}

function decisionForUnknownReport(
  request: GuardianConsultationRequest,
  checkedSafetyDomains: readonly MainAssistantSafetyDomain[],
  missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[],
  requiredApprovals: readonly GuardianConsultationApprovalRequirement[],
  riskyRequest: boolean,
  policy: GuardianConsultationPolicy,
  report: OperatorSafetyReport,
): GuardianConsultationDecision {
  const blocked = riskyRequest && policy.blockRiskyWhenSafetyUnknown;
  return createDecision(request, {
    acknowledgementRequired: !blocked,
    blockers: blocked
      ? [
          "Operator Safety is unknown or incomplete and blocks risky escalation.",
          ...missingRequiredSafetyDomains.map(
            (domain) => `Missing required safety domain: ${domain}.`,
          ),
        ]
      : [],
    checkedSafetyDomains,
    decision: blocked ? "blocked" : "requires_operator_confirmation",
    missingRequiredSafetyDomains,
    operatorSafetyStatus: report.summary.status,
    reasons: [
      reason(
        "operator_safety_unknown",
        "Operator Safety status is unknown or incomplete.",
        blocked ? "block" : "confirm",
      ),
      ...missingRequiredSafetyDomains.map((domain) =>
        reason(
          "missing_required_safety_domain",
          `Required safety domain is missing: ${domain}.`,
          blocked ? "block" : "confirm",
        ),
      ),
    ],
    recommendedNextActions: [
      "Provide current guardian coverage or explicitly keep the request to bounded planning only.",
    ],
    requiredApprovals,
    safetyToAutonomy: report.summary.safetyToAutonomy,
    warnings: blocked
      ? []
      : [
          "Safety coverage is incomplete; operator confirmation is required before continuing.",
        ],
  });
}

function decisionForAttentionReport(
  request: GuardianConsultationRequest,
  checkedSafetyDomains: readonly MainAssistantSafetyDomain[],
  missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[],
  requiredApprovals: readonly GuardianConsultationApprovalRequirement[],
  riskyRequest: boolean,
  policy: GuardianConsultationPolicy,
  report: OperatorSafetyReport,
): GuardianConsultationDecision {
  const acknowledgementRequired =
    riskyRequest && policy.attentionRequiresAcknowledgementForRiskyOperations;
  const decision: GuardianConsultationDecisionKind =
    acknowledgementRequired
      ? "requires_operator_confirmation"
      : requiredApprovals.length > 0
        ? "requires_approval"
        : "continue_with_warning";
  return createDecision(request, {
    acknowledgementRequired,
    blockers: [],
    checkedSafetyDomains,
    decision,
    missingRequiredSafetyDomains,
    operatorSafetyStatus: report.summary.status,
    reasons: [
      reason(
        "attention_required",
        "Operator Safety requires attention before expanding autonomy.",
        acknowledgementRequired ? "confirm" : "warn",
      ),
      ...approvalReasons(requiredApprovals),
    ],
    recommendedNextActions: [
      acknowledgementRequired
        ? "Acknowledge current safety warnings before continuing."
        : "Continue with visible safety warnings and stay inside controlled boundaries.",
    ],
    requiredApprovals,
    safetyToAutonomy: report.summary.safetyToAutonomy,
    warnings: [
      "Operator Safety requires attention; do not expand autonomy silently.",
    ],
  });
}

interface DecisionOverrides {
  readonly acknowledgementRequired: boolean;
  readonly blockers: readonly string[];
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly decision: GuardianConsultationDecisionKind;
  readonly missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly operatorSafetyStatus: GuardianConsultationDecision["operatorSafetyStatus"];
  readonly reasons: readonly GuardianConsultationReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
  readonly safetyToAutonomy: GuardianConsultationDecision["safetyToAutonomy"];
  readonly warnings: readonly string[];
}

function createDecision(
  request: GuardianConsultationRequest,
  overrides: DecisionOverrides,
): GuardianConsultationDecision {
  return {
    acknowledgementRequired: overrides.acknowledgementRequired,
    approvalRequired: overrides.requiredApprovals.length > 0,
    assistantId: request.assistantId,
    blockers: Object.freeze([...overrides.blockers]),
    checkedSafetyDomains: sortSafetyDomains(overrides.checkedSafetyDomains),
    consultationId: request.consultationId,
    contractVersion: GUARDIAN_CONSULTATION_CONTRACT_VERSION,
    decision: overrides.decision,
    generatedAt: request.generatedAt,
    missingRequiredSafetyDomains: sortSafetyDomains(
      overrides.missingRequiredSafetyDomains,
    ),
    operatorSafetyStatus: overrides.operatorSafetyStatus,
    reasons: Object.freeze([...overrides.reasons]),
    recommendedNextActions: Object.freeze([...overrides.recommendedNextActions]),
    requiredApprovals: Object.freeze([...overrides.requiredApprovals]),
    safetyToAutonomy: overrides.safetyToAutonomy,
    warnings: Object.freeze([...overrides.warnings]),
  };
}

function isRiskyRequest(
  riskLevel: MainAssistantInvocationRiskLevel,
  requestedOperations: readonly MainAssistantEscalationType[],
): boolean {
  return riskLevel !== "normal" || requestedOperations.length > 0;
}

function checkedDomains(
  report: OperatorSafetyReport | undefined,
): readonly MainAssistantSafetyDomain[] {
  if (report === undefined) {
    return [];
  }
  return sortSafetyDomains([
    "operator_safety",
    ...report.summary.coverage.includedGuardians.map(
      (domain) => domain as MainAssistantSafetyDomain,
    ),
  ]);
}

function requiredSafetyDomains(
  requestedOperations: readonly MainAssistantEscalationType[],
  policy: GuardianConsultationPolicy,
  riskyRequest: boolean,
): readonly MainAssistantSafetyDomain[] {
  const domains = new Set<MainAssistantSafetyDomain>();
  if (riskyRequest) {
    domains.add("operator_safety");
  }
  for (const requirement of policy.safetyRequirements) {
    if (requestedOperations.includes(requirement.operation)) {
      for (const domain of requirement.requiredDomains) {
        domains.add(domain);
      }
    }
  }
  return sortSafetyDomains([...domains]);
}

function requiredApprovalsForOperations(
  requestedOperations: readonly MainAssistantEscalationType[],
  policy: GuardianConsultationPolicy,
): readonly GuardianConsultationApprovalRequirement[] {
  const requested = new Set(requestedOperations);
  return Object.freeze(
    policy.requiredApprovals.filter(({ operation }) =>
      requested.has(operation),
    ),
  );
}

function approvalReasons(
  approvals: readonly GuardianConsultationApprovalRequirement[],
): readonly GuardianConsultationReason[] {
  return approvals.map(({ operation }) =>
    reason(
      "approval_required",
      `Requested operation requires explicit approval: ${operation}.`,
      "confirm",
    ),
  );
}

function reason(
  code: GuardianConsultationReasonCode,
  message: string,
  severity: GuardianConsultationReasonSeverity,
): GuardianConsultationReason {
  return {
    code,
    message,
    severity,
  };
}
