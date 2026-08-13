import { describe, expect, it } from "vitest";

import {
  DeterministicMainAssistantRuntime,
  MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
  MainAssistantInvocationValidator,
  MainAssistantResultValidator,
  MainAssistantRuntimeValidationError,
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantInvocation,
  type MainAssistantResult,
  type OperatorSafetyDomain,
  type OperatorSafetyGuardianSummary,
  type OperatorSafetyReport,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-09T08:00:00.000Z";
const EXPECTED_GUARDIANS: readonly OperatorSafetyDomain[] = [
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

describe("Main Assistant / Orchestrator Runtime Boundary", () => {
  it("accepts valid invocations", () => {
    const invocation = createInvocation();

    expect(new MainAssistantInvocationValidator().validate(invocation)).toEqual(
      {
        ok: true,
        value: invocation,
      },
    );
  });

  it("rejects invalid invocations", () => {
    const result = new MainAssistantInvocationValidator().validate({
      ...createInvocation(),
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

  it("accepts valid results", () => {
    const result = createResult();

    expect(new MainAssistantResultValidator().validate(result)).toEqual({
      ok: true,
      value: result,
    });
  });

  it("rejects invalid results", () => {
    const result = new MainAssistantResultValidator().validate({
      ...createResult(),
      approvalRequired: false,
      approvalsRequired: ["tool_execution"],
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
          code: "inconsistent_value",
          path: "approvalRequired",
        }),
      ]),
    );
  });

  it("produces deterministic accepted output for safe requests", () => {
    const runtime = new DeterministicMainAssistantRuntime();
    const invocation = createInvocation();

    const result = runtime.invoke(invocation);

    expect(result).toEqual({
      actorId: invocation.actorId,
      approvalRequired: false,
      approvalsRequired: [],
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
      contractVersion: MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
      correlationId: invocation.correlationId,
      generatedAt: invocation.requestedAt,
      intent: invocation.intent,
      invocationId: invocation.invocationId,
      operatorSafetyStatus: "healthy",
      operatorSummary:
        "Onlyway Assistant accepted the bounded operator request within the current safe runtime boundary.",
      recommendedDelegations: [],
      recommendedNextActions: [
        "Proceed with a deterministic operator-facing response through existing MV AI OS boundaries.",
      ],
      safetyDecision: "safe_to_continue",
      status: "accepted",
      workspaceId: invocation.workspaceId,
    });
    expect(runtime.invoke(invocation)).toEqual(result);
  });

  it("returns attention-required output when a safe planning request has no safety report", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocationWithoutSafety(),
    );

    expect(result).toMatchObject({
      approvalRequired: false,
      checkedSafetyDomains: [],
      operatorSafetyStatus: "missing",
      safetyDecision: "missing_operator_safety_report",
      status: "attention_required",
    });
  });

  it("refuses risky requests when safety preflight is missing", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocationWithoutSafety({
        requestedOperations: ["tool_execution"],
        riskLevel: "risky",
      }),
    );

    expect(result).toMatchObject({
      approvalRequired: false,
      approvalsRequired: [],
      blockers: [
        "Operator Safety Report is required before risky or escalation-oriented requests.",
      ],
      operatorSafetyStatus: "missing",
      safetyDecision: "missing_operator_safety_report",
      status: "refused",
    });
  });

  it("blocks escalation when Operator Safety is critical", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocation({
        requestedOperations: ["workflow_execution"],
        riskLevel: "risky",
        safetyPreflight: {
          operatorSafetyReport: createCriticalReport(),
        },
      }),
    );

    expect(result).toMatchObject({
      approvalRequired: false,
      approvalsRequired: [],
      blockers: [
        "Operator Safety is critical and blocks escalation.",
        "Critical safety domain: security.",
      ],
      operatorSafetyStatus: "critical",
      safetyDecision: "do_not_increase_autonomy",
      status: "blocked",
    });
  });

  it("refuses risky escalation when required safety coverage is unknown", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocation({
        requestedOperations: ["publish_or_send"],
        riskLevel: "sensitive",
        safetyPreflight: {
          operatorSafetyReport: createUnknownReport(),
        },
      }),
    );

    expect(result).toMatchObject({
      approvalRequired: false,
      approvalsRequired: [],
      operatorSafetyStatus: "unknown",
      safetyDecision: "unsafe_request_refused",
      status: "refused",
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "Required safety coverage is unknown or incomplete.",
        "Missing required safety domain: quality.",
      ]),
    );
  });

  it("requires approval markers without executing side-effecting operations", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocation({
        requestedOperations: ["tool_execution", "workflow_execution"],
        riskLevel: "risky",
      }),
    );

    expect(result).toMatchObject({
      approvalRequired: true,
      approvalsRequired: ["tool_execution", "workflow_execution"],
      blockers: [],
      recommendedDelegations: [],
      status: "attention_required",
    });
    expect(JSON.stringify(result)).not.toContain("executed");
    expect(JSON.stringify(result)).not.toContain("provider");
    expect(JSON.stringify(result)).not.toContain("network");
  });

  it("refuses under-specified requests deterministically", () => {
    const result = new DeterministicMainAssistantRuntime().invoke(
      createInvocation({
        objective: "Launch",
        requestedOutcome: "Plan",
      }),
    );

    expect(result).toMatchObject({
      approvalRequired: false,
      blockers: [
        "The request is under-specified for a safe operator-facing decision.",
      ],
      safetyDecision: "unsafe_request_refused",
      status: "refused",
    });
  });

  it("fails closed on unsafe raw fields or secret-like text", () => {
    const runtime = new DeterministicMainAssistantRuntime();

    expect(() =>
      runtime.invoke({
        ...createInvocation(),
        objective: "Coordinate project work around sk-1234567890",
      }),
    ).toThrow(MainAssistantRuntimeValidationError);

    const invalidResult = new MainAssistantResultValidator().validate({
      ...createResult(),
      operatorSummary: "secretValue must never appear here",
    });
    expect(invalidResult).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "unsafe_content",
          path: "operatorSummary",
        }),
      ],
      ok: false,
    });
  });
});

function createInvocation(
  overrides: Partial<MainAssistantInvocation> = {},
): MainAssistantInvocation {
  const invocation: MainAssistantInvocation = {
    actorId: "actor-fabio",
    assistantId: ONLY_WAY_ASSISTANT_ID,
    contractVersion: MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
    correlationId: "correlation-main-assistant",
    intent: "coordinate",
    invocationId: "main-assistant-invocation-1",
    objective: "Coordinate the next safe project milestone",
    requestedAt: GENERATED_AT,
    requestedOperations: [],
    requestedOutcome: "Decision-ready operator next action",
    riskLevel: "normal",
    safetyPreflight: {
      operatorSafetyReport: createHealthyReport(),
    },
    workspaceId: "workspace-local",
  };

  return {
    ...invocation,
    ...overrides,
  };
}

function createInvocationWithoutSafety(
  overrides: Partial<Omit<MainAssistantInvocation, "safetyPreflight">> = {},
): MainAssistantInvocation {
  const invocation = {
    ...createInvocation(),
    ...overrides,
  };
  delete (invocation as { safetyPreflight?: unknown }).safetyPreflight;
  return invocation;
}

function createResult(
  overrides: Partial<MainAssistantResult> = {},
): MainAssistantResult {
  const result: MainAssistantResult = {
    actorId: "actor-fabio",
    approvalRequired: false,
    approvalsRequired: [],
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockers: [],
    checkedSafetyDomains: ["operator_safety"],
    contractVersion: MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
    correlationId: "correlation-main-assistant",
    generatedAt: GENERATED_AT,
    intent: "coordinate",
    invocationId: "main-assistant-invocation-1",
    operatorSafetyStatus: "healthy",
    operatorSummary: "Onlyway Assistant accepted the bounded request.",
    recommendedDelegations: [],
    recommendedNextActions: ["Continue inside controlled boundaries."],
    safetyDecision: "safe_to_continue",
    status: "accepted",
    workspaceId: "workspace-local",
  };

  return {
    ...result,
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

function createCriticalReport(): OperatorSafetyReport {
  return createReport({
    guardianSummaries: EXPECTED_GUARDIANS.map((domain) =>
      domain === "security"
        ? createGuardianSummary(domain, {
            criticalFindings: 1,
            highestSeverity: "critical",
            status: "critical",
            topFinding: {
              affectedAreas: ["secret-boundary"],
              category: "unsafe_secret_material",
              domain,
              findingId: "security:001:unsafe-secret-material",
              severity: "critical",
              title: "Unsafe secret material signal",
            },
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
