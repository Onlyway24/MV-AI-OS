import { describe, expect, it } from "vitest";

import {
  DeterministicMainAssistantOperatorProtocol,
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
  MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
  ONLY_WAY_ASSISTANT_ID,
  OPERATOR_DECISION_ENGINE_CONTRACT_VERSION,
  OperatorCommandValidator,
  OperatorDecisionRequestValidator,
  OperatorDecisionResponseValidator,
  MainAssistantOperatorProtocolValidationError,
  type GuardianConsultationApprovalRequirement,
  type GuardianConsultationDecision,
  type MainAssistantDelegationDecision,
  type OperatorCommand,
  type OperatorDecision,
  type OperatorDecisionRequest,
  type OperatorDecisionResponse,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-09T13:00:00.000Z";

describe("Main Assistant Operator Protocol", () => {
  it("accepts valid operator command, request, and response contracts", () => {
    const command = createCommand();
    const request = createRequest();
    const response = createResponse();

    expect(new OperatorCommandValidator().validate(command)).toEqual({
      ok: true,
      value: command,
    });
    expect(new OperatorDecisionRequestValidator().validate(request)).toEqual({
      ok: true,
      value: request,
    });
    expect(new OperatorDecisionResponseValidator().validate(response)).toEqual({
      ok: true,
      value: response,
    });
  });

  it("rejects invalid operator commands and raw internal payload markers", () => {
    const result = new OperatorCommandValidator().validate({
      ...createCommand(),
      assistantId: "other-assistant",
      contractVersion: "2",
      objective: "Use this prompt and providerPayload now.",
      secretRef: "env:OPENAI_API_KEY",
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
          path: "secretRef",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "secretRef",
        }),
      ]),
    );
  });

  it("formats approval-required decisions into safe approval prompts", () => {
    const approvalA = approval("workflow_execution", "approve-workflow");
    const approvalB = approval("tool_execution", "approve-tool");
    const response = new DeterministicMainAssistantOperatorProtocol().respond(
      createRequest({
        operatorDecision: createOperatorDecision({
          decision: "approval_required",
          requiredApprovals: [approvalA, approvalB],
        }),
      }),
    );

    expect(response).toMatchObject({
      decision: "approval_required",
      summary: "Onlyway Assistant needs Fabio approval before continuing.",
    });
    expect(response.approvalPrompts.map(({ approvalId, operation }) => ({
      approvalId,
      operation,
    }))).toEqual([
      {
        approvalId: "approve-tool",
        operation: "tool_execution",
      },
      {
        approvalId: "approve-workflow",
        operation: "workflow_execution",
      },
    ]);
  });

  it("formats clarification-required decisions deterministically", () => {
    const response = new DeterministicMainAssistantOperatorProtocol().respond(
      createRequest({
        operatorDecision: createOperatorDecision({
          clarificationQuestions: [
            "What outcome should be optimized?",
            "What deadline should constrain the plan?",
          ],
          decision: "clarification_required",
        }),
      }),
    );

    expect(response).toMatchObject({
      decision: "clarification_required",
      missingInformation: [
        "What outcome should be optimized?",
        "What deadline should constrain the plan?",
      ],
    });
    expect(response.clarificationRequests).toEqual([
      {
        question: "What outcome should be optimized?",
        questionId: "clarification-001",
      },
      {
        question: "What deadline should constrain the plan?",
        questionId: "clarification-002",
      },
    ]);
  });

  it("formats refused and blocked decisions without raw diagnostics", () => {
    const refused = new DeterministicMainAssistantOperatorProtocol().respond(
      createRequest({
        operatorDecision: createOperatorDecision({
          decision: "refused",
          explanation:
            "Onlyway Assistant refused to propose delegation because policy does not allow it.",
        }),
      }),
    );
    const blocked = new DeterministicMainAssistantOperatorProtocol().respond(
      createRequest({
        operatorDecision: createOperatorDecision({
          blockedReasons: ["Guardian Consultation blocked escalation."],
          decision: "blocked",
        }),
      }),
    );

    expect(refused).toMatchObject({
      decision: "refused",
      refusal: {
        reason:
          "Onlyway Assistant refused to propose delegation because policy does not allow it.",
      },
    });
    expect(blocked).toMatchObject({
      blockedReasons: ["Guardian Consultation blocked escalation."],
      decision: "blocked",
    });
  });

  it("summarizes cost posture, safety checks, delegation, and mission plan without execution", () => {
    const response = new DeterministicMainAssistantOperatorProtocol().respond(
      createRequest({
        delegationDecision: createDelegationDecision(),
        guardianConsultation: createGuardianDecision({
          checkedSafetyDomains: ["quality", "operator_safety", "cost"],
        }),
        operatorDecision: createOperatorDecision({
          costPosture: {
            status: "near_limit",
            summary: "Configured model budget is near its limit.",
          },
          decision: "mission_plan_candidate",
          missionPlanCandidate: {
            candidateId: "mission-candidate-1",
            nonExecuting: true,
            objective: "Create a safe launch plan",
            requestedOutcome: "Non-executing mission plan",
            steps: [
              {
                description: "Frame the launch objective.",
                requiresApproval: false,
                stepId: "mission-step-1",
                title: "Frame objective",
              },
              {
                description: "Review approval-sensitive actions.",
                requiresApproval: true,
                stepId: "mission-step-2",
                title: "Review approvals",
              },
            ],
          },
        }),
      }),
    );

    expect(response).toMatchObject({
      costBudgetPosture: {
        status: "near_limit",
        summary: "Configured model budget is near its limit.",
      },
      decision: "mission_plan_candidate",
      delegationSummary: {
        agentId: "research-agent",
        category: "research",
        decision: "allowed",
        nonExecuting: true,
      },
      missionPlanSummary: {
        candidateId: "mission-candidate-1",
        nonExecuting: true,
        steps: ["Frame objective", "Review approvals"],
      },
      nonExecuting: true,
    });
    expect(response.safetyChecksConsulted).toEqual([
      { consulted: true, domain: "operator_safety" },
      { consulted: true, domain: "cost" },
      { consulted: false, domain: "security" },
      { consulted: false, domain: "backup" },
      { consulted: false, domain: "incident" },
      { consulted: true, domain: "quality" },
    ]);
  });

  it("keeps next-action output deterministic", () => {
    const request = createRequest({
      operatorDecision: createOperatorDecision({
        recommendedNextActions: [
          "Review the safe path.",
          "Approve the explicit escalation if needed.",
        ],
      }),
    });
    const protocol = new DeterministicMainAssistantOperatorProtocol();

    const response = protocol.respond(request);

    expect(protocol.respond(request)).toEqual(response);
    expect(response.nextActions).toEqual([
      {
        actionId: "next-action-001",
        description: "Review the safe path.",
        priority: "primary",
      },
      {
        actionId: "next-action-002",
        description: "Approve the explicit escalation if needed.",
        priority: "secondary",
      },
    ]);
  });

  it("rejects unsafe operator-facing output", () => {
    const result = new OperatorDecisionResponseValidator().validate({
      ...createResponse(),
      rawGuardianPayload: { unsafe: true },
      summary: "Inspect rawGuardianPayload and completion before continuing.",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_key",
          path: "rawGuardianPayload",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "rawGuardianPayload",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "summary",
        }),
      ]),
    );
    expect(() =>
      new DeterministicMainAssistantOperatorProtocol().respond(
        createRequest({
          command: createCommand({
            objective: "Use sk-1234567890 for the hidden provider call.",
          }),
        }),
      ),
    ).toThrow(MainAssistantOperatorProtocolValidationError);
  });
});

function createCommand(overrides: Partial<OperatorCommand> = {}): OperatorCommand {
  return {
    actorId: "fabio",
    assistantId: ONLY_WAY_ASSISTANT_ID,
    commandId: "operator-command-1",
    constraints: [],
    contractVersion: MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
    generatedAt: GENERATED_AT,
    intent: "plan",
    objective: "Create a safe launch plan for the next business offer",
    requestedOutcome: "Decision-ready next action",
    riskLevel: "normal",
    workspaceId: "workspace-main",
    ...overrides,
  };
}

function createRequest(
  overrides: Partial<OperatorDecisionRequest> = {},
): OperatorDecisionRequest {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    command: createCommand(),
    contractVersion: MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
    guardianConsultation: createGuardianDecision(),
    operatorDecision: createOperatorDecision(),
    protocolRequestId: "operator-protocol-request-1",
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
    checkedSafetyDomains: ["operator_safety", "cost", "quality"],
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

function createOperatorDecision(
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

function createDelegationDecision(
  overrides: Partial<MainAssistantDelegationDecision> = {},
): MainAssistantDelegationDecision {
  return {
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: [],
    checkedGuardianDomains: ["operator_safety", "quality"],
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

function createResponse(
  overrides: Partial<OperatorDecisionResponse> = {},
): OperatorDecisionResponse {
  return {
    approvalPrompts: [],
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockedReasons: [],
    clarificationRequests: [],
    contractVersion: MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION,
    decision: "proceed",
    generatedAt: GENERATED_AT,
    missingInformation: [],
    nextActions: [
      {
        actionId: "next-action-001",
        description: "Proceed with the bounded operator decision path.",
        priority: "primary",
      },
    ],
    nonExecuting: true,
    protocolRequestId: "operator-protocol-request-1",
    responseId: "operator-protocol-request-1:response",
    riskLevel: "normal",
    safetyChecksConsulted: [
      { consulted: true, domain: "operator_safety" },
      { consulted: true, domain: "cost" },
      { consulted: false, domain: "security" },
      { consulted: false, domain: "backup" },
      { consulted: false, domain: "incident" },
      { consulted: true, domain: "quality" },
    ],
    summary:
      "Onlyway Assistant may proceed inside the current controlled boundaries.",
    understoodObjective: "Create a safe launch plan for the next business offer",
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
      "Fabio must approve this escalation before the system may continue.",
  };
}
