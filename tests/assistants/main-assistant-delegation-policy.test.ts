import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY,
  DeterministicMainAssistantDelegationPolicyEvaluator,
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
  MainAssistantDelegationDecisionValidator,
  MainAssistantDelegationEvaluationRequestValidator,
  MainAssistantDelegationPolicyProfileValidator,
  MainAssistantDelegationPolicyValidationError,
  ONLY_WAY_ASSISTANT_ID,
  type GuardianConsultationDecision,
  type MainAssistantDelegationDecision,
  type MainAssistantDelegationEvaluationRequest,
  type MainAssistantDelegationPolicyProfile,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-09T12:00:00.000Z";

describe("Main Assistant Delegation Policy Foundation", () => {
  it("accepts valid delegation policy, request, and decision contracts", () => {
    const policy = DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY;
    const request = createRequest();
    const decision = createDecision();

    expect(new MainAssistantDelegationPolicyProfileValidator().validate(policy)).toEqual(
      {
        ok: true,
        value: policy,
      },
    );
    expect(
      new MainAssistantDelegationEvaluationRequestValidator().validate(request),
    ).toEqual({
      ok: true,
      value: request,
    });
    expect(new MainAssistantDelegationDecisionValidator().validate(decision)).toEqual(
      {
        ok: true,
        value: decision,
      },
    );
  });

  it("rejects invalid delegation policy contracts", () => {
    const result = new MainAssistantDelegationPolicyProfileValidator().validate({
      ...createPolicy(),
      contractVersion: "2",
      nonExecuting: false,
      providerPayload: { raw: "payload" },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_version",
          path: "contractVersion",
        }),
        expect.objectContaining({
          code: "invalid_value",
          path: "nonExecuting",
        }),
        expect.objectContaining({
          code: "unknown_key",
          path: "providerPayload",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "providerPayload",
        }),
      ]),
    );
  });

  it("allows declared low-risk delegation with complete guardian coverage", () => {
    const evaluator = new DeterministicMainAssistantDelegationPolicyEvaluator();
    const request = createRequest();

    const decision = evaluator.evaluate(request);

    expect(decision).toMatchObject({
      blockedReasons: [],
      checkedGuardianDomains: [
        "operator_safety",
        "cost",
        "security",
        "backup",
        "incident",
        "quality",
      ],
      decision: "allowed",
      missingApprovalIds: [],
      missingGuardianDomains: [],
      nonExecuting: true,
      targetAgentId: "research-agent",
      targetCategory: "research",
    });
    expect(evaluator.evaluate(request)).toEqual(decision);
  });

  it("blocks forbidden delegation categories", () => {
    const decision = new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
      createRequest({
        requestedCategory: "tool_agent",
        targetAgentId: "tool-agent",
      }),
    );

    expect(decision).toMatchObject({
      decision: "blocked",
      reasons: [
        expect.objectContaining({
          code: "target_not_allowed",
          severity: "block",
        }),
      ],
    });
  });

  it("requires explicit approval for publisher delegation", () => {
    const decision = new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
      createRequest({
        requestedCategory: "publishing",
        requestedOperations: ["publish_or_send"],
        targetAgentId: "publisher-agent",
      }),
    );

    expect(decision).toMatchObject({
      decision: "requires_approval",
      missingApprovalIds: ["approve-external-side-effects"],
      requiredApprovalIds: ["approve-external-side-effects"],
      targetAgentId: "publisher-agent",
    });
  });

  it("allows publisher delegation only after explicit approval marker", () => {
    const decision = new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
      createRequest({
        approvalGrantIds: ["approve-external-side-effects"],
        requestedCategory: "publishing",
        requestedOperations: ["publish_or_send"],
        targetAgentId: "publisher-agent",
      }),
    );

    expect(decision).toMatchObject({
      decision: "allowed",
      missingApprovalIds: [],
      requiredApprovalIds: ["approve-external-side-effects"],
    });
  });

  it("blocks when Guardian Consultation is missing", () => {
    const request = createRequest();
    delete (request as { guardianConsultation?: unknown }).guardianConsultation;

    const decision = new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
      request,
    );

    expect(decision).toMatchObject({
      blockedReasons: [
        "Guardian Consultation is required before delegation can be allowed.",
      ],
      decision: "blocked",
      reasons: [
        expect.objectContaining({
          code: "missing_guardian_consultation",
        }),
      ],
    });
  });

  it("blocks when required guardian domains are missing", () => {
    const decision = new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
      createRequest({
        guardianConsultation: createGuardianDecision({
          checkedSafetyDomains: ["operator_safety"],
        }),
        requestedCategory: "business",
        targetAgentId: "business-agent",
      }),
    );

    expect(decision).toMatchObject({
      blockedReasons: ["Missing required Guardian domain: cost."],
      decision: "blocked",
      missingGuardianDomains: ["cost"],
      reasons: [
        expect.objectContaining({
          code: "missing_guardian_domain",
        }),
      ],
    });
  });

  it("enforces budget, security, backup, and quality requirements during validation", () => {
    const policy = createPolicy({
      allowedTargets: DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY.allowedTargets.map(
        (target) => {
          if (target.agentId === "business-agent") {
            return {
              ...target,
              requiredGuardianDomains: target.requiredGuardianDomains.filter(
                (domain) => domain !== "cost",
              ),
            };
          }
          if (target.agentId === "developer-agent") {
            return {
              ...target,
              requiredGuardianDomains: target.requiredGuardianDomains.filter(
                (domain) => domain !== "security" && domain !== "backup",
              ),
            };
          }
          if (target.agentId === "publisher-agent") {
            return {
              ...target,
              requiredGuardianDomains: target.requiredGuardianDomains.filter(
                (domain) => domain !== "quality",
              ),
            };
          }
          return target;
        },
      ),
    });

    const result = new MainAssistantDelegationPolicyProfileValidator().validate(policy);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "budget_requirement_missing",
        }),
        expect.objectContaining({
          code: "security_requirement_missing",
        }),
        expect.objectContaining({
          code: "backup_requirement_missing",
        }),
        expect.objectContaining({
          code: "quality_requirement_missing",
        }),
      ]),
    );
  });

  it("blocks circular delegation and delegation beyond max depth", () => {
    const evaluator = new DeterministicMainAssistantDelegationPolicyEvaluator();

    const circular = evaluator.evaluate(
      createRequest({
        delegationPath: ["only-way-assistant", "research-agent"],
      }),
    );
    const tooDeep = evaluator.evaluate(
      createRequest({
        currentDelegationDepth: 1,
      }),
    );

    expect(circular).toMatchObject({
      decision: "blocked",
      reasons: [
        expect.objectContaining({
          code: "circular_delegation",
        }),
      ],
    });
    expect(tooDeep).toMatchObject({
      decision: "blocked",
      reasons: [
        expect.objectContaining({
          code: "max_depth_exceeded",
        }),
      ],
    });
  });

  it("requires confirmation when Guardian Consultation returns warning or confirmation", () => {
    const evaluator = new DeterministicMainAssistantDelegationPolicyEvaluator();
    const warning = evaluator.evaluate(
      createRequest({
        guardianConsultation: createGuardianDecision({
          decision: "continue_with_warning",
          warnings: [
            "Operator Safety requires attention; do not expand autonomy silently.",
          ],
        }),
      }),
    );
    const confirmation = evaluator.evaluate(
      createRequest({
        guardianConsultation: createGuardianDecision({
          acknowledgementRequired: true,
          decision: "requires_operator_confirmation",
          operatorSafetyStatus: "unknown",
          safetyToAutonomy: "unknown",
        }),
      }),
    );

    expect(warning).toMatchObject({
      decision: "requires_operator_confirmation",
      reasons: [
        expect.objectContaining({
          code: "guardian_warning",
        }),
      ],
    });
    expect(confirmation).toMatchObject({
      decision: "requires_operator_confirmation",
      reasons: [
        expect.objectContaining({
          code: "guardian_confirmation_required",
        }),
      ],
    });
  });

  it("keeps delegation output redaction-safe", () => {
    const result = new MainAssistantDelegationDecisionValidator().validate({
      ...createDecision(),
      recommendedNextActions: ["Inspect providerPayload before delegation."],
      secretRef: "env:OPENAI_API_KEY",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
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
          path: "recommendedNextActions[0]",
        }),
      ]),
    );
    expect(() =>
      new DeterministicMainAssistantDelegationPolicyEvaluator().evaluate(
        createRequest({
          approvalGrantIds: ["secretRef:OPENAI_API_KEY"],
        }),
      ),
    ).toThrow(MainAssistantDelegationPolicyValidationError);
  });
});

function createRequest(
  overrides: Partial<MainAssistantDelegationEvaluationRequest> = {},
): MainAssistantDelegationEvaluationRequest {
  return {
    approvalGrantIds: [],
    assistantId: ONLY_WAY_ASSISTANT_ID,
    contractVersion: MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
    currentDelegationDepth: 0,
    delegationPath: ["only-way-assistant"],
    generatedAt: GENERATED_AT,
    guardianConsultation: createGuardianDecision(),
    policy: DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY,
    requestId: "delegation-request-1",
    requestedCategory: "research",
    requestedOperations: [],
    riskLevel: "normal",
    targetAgentId: "research-agent",
    ...overrides,
  };
}

function createGuardianDecision(
  overrides: Partial<GuardianConsultationDecision> = {},
): GuardianConsultationDecision {
  return {
    acknowledgementRequired: false,
    approvalRequired: false,
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockers: [],
    checkedSafetyDomains: [
      "operator_safety",
      "cost",
      "security",
      "backup",
      "incident",
      "quality",
    ],
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
  overrides: Partial<MainAssistantDelegationDecision> = {},
): MainAssistantDelegationDecision {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: [],
    checkedGuardianDomains: [
      "operator_safety",
      "cost",
      "security",
      "backup",
      "incident",
      "quality",
    ],
    contractVersion: MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
    currentDelegationDepth: 0,
    decision: "allowed",
    delegationPath: ["only-way-assistant"],
    generatedAt: GENERATED_AT,
    missingApprovalIds: [],
    missingGuardianDomains: [],
    nonExecuting: true,
    reasons: [
      {
        code: "delegation_allowed",
        message:
          "Delegation policy allows a non-executing future specialist handoff.",
        severity: "allow",
      },
    ],
    recommendedNextActions: [
      "Present this as a candidate non-executing delegation; do not invoke the specialist yet.",
    ],
    requestId: "delegation-request-1",
    requiredApprovalIds: [],
    targetAgentId: "research-agent",
    targetCategory: "research",
    ...overrides,
  };
}

function createPolicy(
  overrides: Partial<MainAssistantDelegationPolicyProfile> = {},
): MainAssistantDelegationPolicyProfile {
  return {
    ...structuredClone(DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY),
    ...overrides,
  };
}
