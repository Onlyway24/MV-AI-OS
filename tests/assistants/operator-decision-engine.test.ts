import { describe, expect, it } from "vitest";

import {
  DeterministicOperatorDecisionEngine,
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_SPECIFICATION,
  OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
  OperatorDecisionContextValidator,
  OperatorDecisionValidationError,
  OperatorDecisionValidator,
  type GuardianConsultationApprovalRequirement,
  type GuardianConsultationDecision,
  type OperatorDecision,
  type OperatorDecisionContext,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-09T10:00:00.000Z";

describe("Operator Decision Engine Foundation", () => {
  it("accepts valid decision contexts and decisions", () => {
    const context = createContext();
    const decision = createDecision();

    expect(new OperatorDecisionContextValidator().validate(context)).toEqual({
      ok: true,
      value: context,
    });
    expect(new OperatorDecisionValidator().validate(decision)).toEqual({
      ok: true,
      value: decision,
    });
  });

  it("rejects invalid decision contexts", () => {
    const result = new OperatorDecisionContextValidator().validate({
      ...createContext(),
      assistantId: "other-assistant",
      contractVersion: "2",
      objective: "Coordinate sk-1234567890 safely",
      prompt: "raw prompt must not cross this boundary",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: "assistantId",
        }),
        expect.objectContaining({
          code: "unsupported_version",
          path: "contractVersion",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "objective",
        }),
        expect.objectContaining({
          code: "unknown_key",
          path: "prompt",
        }),
      ]),
    );
  });

  it("proceeds for safe sufficiently specified requests", () => {
    const engine = new DeterministicOperatorDecisionEngine();
    const context = createContext();

    const decision = engine.decide(context);

    expect(decision).toMatchObject({
      blockedReasons: [],
      certainty: "high",
      clarificationQuestions: [],
      decision: "proceed",
      explanation:
        "Onlyway Assistant may proceed inside the current controlled boundaries.",
      guardianDecision: "may_continue",
      requiredApprovals: [],
    });
    expect(engine.decide(context)).toEqual(decision);
  });

  it("asks clarification for under-specified requests", () => {
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        objective: "Launch",
        requestedOutcome: "Plan",
      }),
    );

    expect(decision).toMatchObject({
      certainty: "low",
      decision: "clarification_required",
    });
    expect(decision.clarificationQuestions).toEqual([
      "What concrete business outcome should Onlyway Assistant optimize for?",
      "What final output should Fabio receive from this request?",
    ]);
  });

  it("requires approval when Guardian Consultation requires approvals", () => {
    const requiredApprovals = [
      approval("tool_execution", "approve-external-side-effects"),
    ];
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        guardianConsultation: createGuardianDecision({
          decision: "requires_approval",
          requiredApprovals,
        }),
        requestedOperations: ["tool_execution"],
        riskLevel: "risky",
      }),
    );

    expect(decision).toMatchObject({
      certainty: "medium",
      decision: "approval_required",
      requiredApprovals,
    });
  });

  it("requires confirmation when Guardian Consultation requires operator confirmation", () => {
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        guardianConsultation: createGuardianDecision({
          acknowledgementRequired: true,
          decision: "requires_operator_confirmation",
          operatorSafetyStatus: "unknown",
          safetyToAutonomy: "unknown",
        }),
      }),
    );

    expect(decision).toMatchObject({
      certainty: "medium",
      decision: "confirmation_required",
      guardianDecision: "requires_operator_confirmation",
    });
  });

  it("blocks when Guardian Consultation blocks escalation", () => {
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        guardianConsultation: createGuardianDecision({
          blockers: ["Operator Safety is critical and blocks escalation."],
          decision: "blocked",
          operatorSafetyStatus: "critical",
          safetyToAutonomy: "do_not_increase_autonomy",
        }),
        requestedOperations: ["workflow_execution"],
        riskLevel: "risky",
      }),
    );

    expect(decision).toMatchObject({
      blockedReasons: ["Operator Safety is critical and blocks escalation."],
      certainty: "high",
      decision: "blocked",
      guardianDecision: "blocked",
    });
  });

  it("blocks over-budget cost posture and confirms near-limit posture", () => {
    const overBudget = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        costPosture: {
          status: "over_budget",
          summary: "Estimated model operation is over the configured budget.",
        },
      }),
    );
    const nearLimit = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        costPosture: {
          status: "near_limit",
          summary: "Estimated model operation is near the configured budget.",
        },
      }),
    );

    expect(overBudget).toMatchObject({
      blockedReasons: [
        "Estimated model operation is over the configured budget.",
      ],
      decision: "blocked",
    });
    expect(nearLimit).toMatchObject({
      decision: "confirmation_required",
    });
  });

  it("creates a non-executing mission-plan candidate only when safe", () => {
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        intent: "plan",
        objective: "Create a safe launch plan for a new offer",
        requestedOutcome: "Non-executing mission plan candidate",
      }),
    );

    expect(decision).toMatchObject({
      decision: "mission_plan_candidate",
      missionPlanCandidate: {
        nonExecuting: true,
        objective: "Create a safe launch plan for a new offer",
        requestedOutcome: "Non-executing mission plan candidate",
      },
    });
    expect(decision.missionPlanCandidate?.steps.map(({ stepId }) => stepId)).toEqual(
      ["mission-step-1", "mission-step-2"],
    );
  });

  it("refuses delegation when supplied delegation signal disallows it", () => {
    const decision = new DeterministicOperatorDecisionEngine().decide(
      createContext({
        delegationSignal: {
          candidateAgentIds: ["research-agent"],
          delegationAllowed: false,
          rationale:
            "Delegation policy foundation is not available for this request yet.",
        },
        intent: "plan",
      }),
    );

    expect(decision).toMatchObject({
      blockedReasons: [
        "Delegation policy foundation is not available for this request yet.",
      ],
      decision: "refused",
    });
  });

  it("keeps decision output redaction-safe", () => {
    const invalidDecision = new OperatorDecisionValidator().validate({
      ...createDecision(),
      explanation: "Inspect providerPayload before proceeding.",
      secretRef: "env:OPENAI_API_KEY",
    });

    expect(invalidDecision.ok).toBe(false);
    expect(invalidDecision.ok ? [] : invalidDecision.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_key",
          path: "secretRef",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "secretRef",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "explanation",
        }),
      ]),
    );
    expect(() =>
      new DeterministicOperatorDecisionEngine().decide(
        createContext({
          objective: "Coordinate sk-1234567890",
        }),
      ),
    ).toThrow(OperatorDecisionValidationError);
  });
});

function createContext(
  overrides: Partial<OperatorDecisionContext> = {},
): OperatorDecisionContext {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    assistantSpecification: ONLY_WAY_ASSISTANT_SPECIFICATION,
    contractVersion: OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
    decisionId: "operator-decision-1",
    generatedAt: GENERATED_AT,
    guardianConsultation: createGuardianDecision(),
    intent: "coordinate",
    objective: "Coordinate the next safe business milestone",
    requestedOperations: [],
    requestedOutcome: "Decision-ready operator next action",
    riskLevel: "normal",
    ...overrides,
  };
}

function createGuardianDecision(
  overrides: Partial<GuardianConsultationDecision> = {},
): GuardianConsultationDecision {
  return {
    acknowledgementRequired: false,
    approvalRequired:
      overrides.requiredApprovals !== undefined &&
      overrides.requiredApprovals.length > 0,
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockers: [],
    checkedSafetyDomains: ["operator_safety"],
    consultationId: "guardian-consultation-1",
    contractVersion: GUARDIAN_CONSULTATION_CONTRACT_VERSION,
    decision: "may_continue",
    generatedAt: GENERATED_AT,
    missingRequiredSafetyDomains: [],
    operatorSafetyStatus: "healthy",
    reasons: [
      {
        code: "healthy_operator_safety",
        message: "Operator Safety is healthy for this bounded request.",
        severity: "allow",
      },
    ],
    recommendedNextActions: [
      "Continue inside the current controlled MV AI OS boundaries.",
    ],
    requiredApprovals: [],
    safetyToAutonomy: "safe_to_continue",
    warnings: [],
    ...overrides,
  };
}

function createDecision(
  overrides: Partial<OperatorDecision> = {},
): OperatorDecision {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: [],
    certainty: "high",
    clarificationQuestions: [],
    contractVersion: OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
    decision: "proceed",
    decisionId: "operator-decision-1",
    explanation:
      "Onlyway Assistant may proceed inside the current controlled boundaries.",
    generatedAt: GENERATED_AT,
    guardianDecision: "may_continue",
    reasons: [
      {
        code: "ready_to_proceed",
        message:
          "The request is sufficiently specified and safety gates allow continuation.",
        severity: "allow",
      },
    ],
    recommendedNextActions: ["Proceed with the bounded operator decision path."],
    requiredApprovals: [],
    requestedOperations: [],
    riskLevel: "normal",
    ...overrides,
  };
}

function approval(
  operation: GuardianConsultationApprovalRequirement["operation"],
  approvalId: string,
): GuardianConsultationApprovalRequirement {
  return {
    approvalId,
    operation,
    rationale:
      "Fabio must approve external side effects before messages, publishing, tools, or workflows can act.",
  };
}
