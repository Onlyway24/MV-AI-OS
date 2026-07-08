import { describe, expect, it } from "vitest";

import {
  DEFAULT_GUARDIAN_CONSULTATION_POLICY,
  DeterministicGuardianConsultationEvaluator,
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  GuardianConsultationDecisionValidator,
  GuardianConsultationPolicyValidator,
  GuardianConsultationRequestValidator,
  GuardianConsultationValidationError,
  ONLY_WAY_ASSISTANT_ID,
  type GuardianConsultationDecision,
  type GuardianConsultationRequest,
  type OperatorSafetyDomain,
  type OperatorSafetyGuardianSummary,
  type OperatorSafetyReport,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-09T09:00:00.000Z";
const EXPECTED_GUARDIANS: readonly OperatorSafetyDomain[] = [
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

describe("Guardian Consultation Boundary", () => {
  it("accepts valid consultation requests, policies, and decisions", () => {
    const request = createRequest();
    const decision = createDecision();

    expect(new GuardianConsultationRequestValidator().validate(request)).toEqual(
      {
        ok: true,
        value: request,
      },
    );
    expect(
      new GuardianConsultationPolicyValidator().validate(
        DEFAULT_GUARDIAN_CONSULTATION_POLICY,
      ).ok,
    ).toBe(true);
    expect(new GuardianConsultationDecisionValidator().validate(decision)).toEqual(
      {
        ok: true,
        value: decision,
      },
    );
  });

  it("rejects invalid consultation requests", () => {
    const result = new GuardianConsultationRequestValidator().validate({
      ...createRequest(),
      assistantId: "other-assistant",
      contractVersion: "2",
      prompt: "raw prompt must not cross this boundary",
      requestedOperations: ["tool_execution", "tool_execution"],
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
          code: "unknown_key",
          path: "prompt",
        }),
        expect.objectContaining({
          code: "duplicate",
          path: "requestedOperations[1]",
        }),
      ]),
    );
  });

  it("allows bounded continuation when Operator Safety is healthy", () => {
    const evaluator = new DeterministicGuardianConsultationEvaluator();
    const request = createRequest();

    const decision = evaluator.evaluate(request);

    expect(decision).toMatchObject({
      acknowledgementRequired: false,
      approvalRequired: false,
      blockers: [],
      checkedSafetyDomains: [
        "operator_safety",
        "cost",
        "security",
        "backup",
        "incident",
        "quality",
      ],
      decision: "may_continue",
      missingRequiredSafetyDomains: [],
      operatorSafetyStatus: "healthy",
      safetyToAutonomy: "safe_to_continue",
      warnings: [],
    });
    expect(evaluator.evaluate(request)).toEqual(decision);
  });

  it("continues with warning for attention-required bounded work", () => {
    const decision = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        operatorSafetyReport: createAttentionReport(),
      }),
    );

    expect(decision).toMatchObject({
      acknowledgementRequired: false,
      approvalRequired: false,
      decision: "continue_with_warning",
      operatorSafetyStatus: "attention_required",
      safetyToAutonomy: "continue_with_attention",
    });
    expect(decision.warnings).toEqual([
      "Operator Safety requires attention; do not expand autonomy silently.",
    ]);
  });

  it("requires acknowledgement for attention-required risky escalation", () => {
    const decision = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        operatorSafetyReport: createAttentionReport(),
        requestedOperations: ["increase_autonomy"],
        riskLevel: "risky",
      }),
    );

    expect(decision).toMatchObject({
      acknowledgementRequired: true,
      approvalRequired: true,
      decision: "requires_operator_confirmation",
      operatorSafetyStatus: "attention_required",
    });
    expect(decision.requiredApprovals).toEqual([
      {
        approvalId: "approve-autonomy-increase",
        operation: "increase_autonomy",
        rationale:
          "Fabio must approve movement toward more autonomy after Operator Safety review.",
      },
    ]);
  });

  it("blocks escalation when Operator Safety is critical", () => {
    const decision = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        operatorSafetyReport: createCriticalReport(),
        requestedOperations: ["workflow_execution"],
        riskLevel: "risky",
      }),
    );

    expect(decision).toMatchObject({
      acknowledgementRequired: false,
      approvalRequired: true,
      decision: "blocked",
      operatorSafetyStatus: "critical",
      safetyToAutonomy: "do_not_increase_autonomy",
    });
    expect(decision.blockers).toEqual([
      "Operator Safety is critical and blocks escalation.",
      "Critical safety domain: security.",
    ]);
  });

  it("requires operator confirmation for unknown bounded safety state", () => {
    const decision = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        operatorSafetyReport: createUnknownReport(),
      }),
    );

    expect(decision).toMatchObject({
      acknowledgementRequired: true,
      approvalRequired: false,
      blockers: [],
      decision: "requires_operator_confirmation",
      operatorSafetyStatus: "unknown",
      safetyToAutonomy: "unknown",
    });
  });

  it("blocks risky escalation when safety state is missing or incomplete", () => {
    const missing = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequestWithoutReport({
        requestedOperations: ["tool_execution"],
        riskLevel: "risky",
      }),
    );
    const incomplete = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        operatorSafetyReport: createUnknownReport(),
        requestedOperations: ["publish_or_send"],
        riskLevel: "sensitive",
      }),
    );

    expect(missing).toMatchObject({
      decision: "blocked",
      operatorSafetyStatus: "missing",
      safetyToAutonomy: "missing",
    });
    expect(incomplete).toMatchObject({
      decision: "blocked",
      operatorSafetyStatus: "unknown",
    });
    expect(incomplete.blockers).toEqual(
      expect.arrayContaining([
        "Operator Safety is unknown or incomplete and blocks risky escalation.",
        "Missing required safety domain: quality.",
      ]),
    );
  });

  it("maps required approvals deterministically", () => {
    const decision = new DeterministicGuardianConsultationEvaluator().evaluate(
      createRequest({
        requestedOperations: ["workflow_execution", "tool_execution"],
        riskLevel: "normal",
      }),
    );

    expect(decision).toMatchObject({
      acknowledgementRequired: false,
      approvalRequired: true,
      decision: "requires_approval",
    });
    expect(decision.requiredApprovals.map(({ approvalId, operation }) => ({
      approvalId,
      operation,
    }))).toEqual([
      {
        approvalId: "approve-external-side-effects",
        operation: "tool_execution",
      },
      {
        approvalId: "approve-external-side-effects",
        operation: "workflow_execution",
      },
    ]);
  });

  it("fails closed on invalid policy", () => {
    const [firstApproval] =
      DEFAULT_GUARDIAN_CONSULTATION_POLICY.requiredApprovals;
    if (firstApproval === undefined) {
      throw new Error("default guardian consultation policy has no approvals");
    }

    expect(
      () =>
        new DeterministicGuardianConsultationEvaluator({
          ...DEFAULT_GUARDIAN_CONSULTATION_POLICY,
          requiredApprovals: [
            ...DEFAULT_GUARDIAN_CONSULTATION_POLICY.requiredApprovals,
            firstApproval,
          ],
        }),
    ).toThrow(GuardianConsultationValidationError);
  });

  it("keeps consultation output redaction-safe", () => {
    const result = new GuardianConsultationDecisionValidator().validate({
      ...createDecision(),
      recommendedNextActions: ["Inspect providerPayload before continuing."],
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
  });
});

function createRequest(
  overrides: Partial<GuardianConsultationRequest> = {},
): GuardianConsultationRequest {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    consultationId: "guardian-consultation-1",
    contractVersion: GUARDIAN_CONSULTATION_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    operatorSafetyReport: createHealthyReport(),
    requestedOperations: [],
    riskLevel: "normal",
    ...overrides,
  };
}

function createRequestWithoutReport(
  overrides: Partial<Omit<GuardianConsultationRequest, "operatorSafetyReport">> = {},
): GuardianConsultationRequest {
  const request = {
    ...createRequest(),
    ...overrides,
  };
  delete (request as { operatorSafetyReport?: unknown }).operatorSafetyReport;
  return request;
}

function createDecision(
  overrides: Partial<GuardianConsultationDecision> = {},
): GuardianConsultationDecision {
  return {
    acknowledgementRequired: false,
    approvalRequired: false,
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
        message: "Operator Safety is healthy.",
        severity: "allow",
      },
    ],
    recommendedNextActions: ["Continue inside controlled boundaries."],
    requiredApprovals: [],
    safetyToAutonomy: "safe_to_continue",
    warnings: [],
    ...overrides,
  };
}

function createHealthyReport(): OperatorSafetyReport {
  return createReport({
    guardianSummaries: EXPECTED_GUARDIANS.map((domain) =>
      createGuardianSummary(domain),
    ),
    recommendedActions: [
      {
        actionId: "operator-safety:001:continue-current-operation",
        recommendation:
          "Continue operating within controlled boundaries.",
        severity: "info",
        title: "Continue controlled operation",
      },
    ],
    summary: {
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians: EXPECTED_GUARDIANS,
        missingGuardians: [],
      },
      criticalDomains: [],
      healthyDomains: EXPECTED_GUARDIANS,
      highestSeverity: "info",
      safetyToAutonomy: "safe_to_continue",
      status: "healthy",
      totalCriticalFindings: 0,
      totalFindings: 0,
      totalWarningFindings: 0,
      unknownDomains: [],
      warningDomains: [],
    },
  });
}

function createAttentionReport(): OperatorSafetyReport {
  return createReport({
    guardianSummaries: EXPECTED_GUARDIANS.map((domain) =>
      domain === "cost"
        ? createGuardianSummary(domain, {
            highestSeverity: "warning",
            status: "attention_required",
            totalFindings: 1,
            warningFindings: 1,
          })
        : createGuardianSummary(domain),
    ),
    recommendedActions: [
      {
        actionId: "operator-safety:001:review-cost-warnings",
        domain: "cost",
        recommendation:
          "Review cost warnings before expanding model usage.",
        severity: "warning",
        title: "Review cost warnings",
      },
    ],
    summary: {
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians: EXPECTED_GUARDIANS,
        missingGuardians: [],
      },
      criticalDomains: [],
      healthyDomains: ["security", "backup", "incident", "quality"],
      highestSeverity: "warning",
      primaryAttentionDomain: "cost",
      safetyToAutonomy: "continue_with_attention",
      status: "attention_required",
      totalCriticalFindings: 0,
      totalFindings: 1,
      totalWarningFindings: 1,
      unknownDomains: [],
      warningDomains: ["cost"],
    },
  });
}

function createCriticalReport(): OperatorSafetyReport {
  return createReport({
    guardianSummaries: EXPECTED_GUARDIANS.map((domain) =>
      domain === "security"
        ? createGuardianSummary(domain, {
            criticalFindings: 1,
            highestSeverity: "critical",
            status: "critical",
            totalFindings: 1,
          })
        : createGuardianSummary(domain),
    ),
    recommendedActions: [
      {
        actionId: "operator-safety:001:review-critical-security",
        domain: "security",
        recommendation:
          "Resolve critical Security Guardian findings before increasing autonomy.",
        severity: "critical",
        title: "Review critical security",
      },
    ],
    summary: {
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians: EXPECTED_GUARDIANS,
        missingGuardians: [],
      },
      criticalDomains: ["security"],
      healthyDomains: ["cost", "backup", "incident", "quality"],
      highestSeverity: "critical",
      primaryAttentionDomain: "security",
      safetyToAutonomy: "do_not_increase_autonomy",
      status: "critical",
      totalCriticalFindings: 1,
      totalFindings: 1,
      totalWarningFindings: 0,
      unknownDomains: [],
      warningDomains: [],
    },
  });
}

function createUnknownReport(): OperatorSafetyReport {
  const includedGuardians = EXPECTED_GUARDIANS.filter(
    (domain) => domain !== "quality",
  );
  return createReport({
    guardianSummaries: [
      ...includedGuardians.map((domain) => createGuardianSummary(domain)),
      createGuardianSummary("quality", {
        included: false,
        status: "unknown",
      }),
    ],
    recommendedActions: [
      {
        actionId: "operator-safety:001:provide-quality-report",
        domain: "quality",
        recommendation:
          "Provide a Quality Guardian report before publishing or workflow expansion.",
        severity: "warning",
        title: "Provide Quality Guardian report",
      },
    ],
    summary: {
      coverage: {
        expectedGuardians: EXPECTED_GUARDIANS,
        includedGuardians,
        missingGuardians: ["quality"],
      },
      criticalDomains: [],
      healthyDomains: includedGuardians,
      highestSeverity: "info",
      safetyToAutonomy: "unknown",
      status: "unknown",
      totalCriticalFindings: 0,
      totalFindings: 0,
      totalWarningFindings: 0,
      unknownDomains: ["quality"],
      warningDomains: [],
    },
  });
}

function createReport(
  overrides: Omit<OperatorSafetyReport, "contractVersion" | "generatedAt">,
): OperatorSafetyReport {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function createGuardianSummary(
  domain: OperatorSafetyDomain,
  overrides: Partial<OperatorSafetyGuardianSummary> = {},
): OperatorSafetyGuardianSummary {
  return {
    affectedAreas: [],
    criticalFindings: 0,
    domain,
    highestSeverity: "info",
    included: true,
    status: "healthy",
    totalFindings: 0,
    warningFindings: 0,
    ...overrides,
  };
}
