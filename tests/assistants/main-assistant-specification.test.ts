import { describe, expect, it } from "vitest";

import {
  AgentSpecificationValidator,
  MainAssistantSpecificationValidator,
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_SPECIFICATION,
  type AgentCapability,
  type AgentLimit,
  type AgentPolicyRequirement,
  type AgentSpecification,
  type MainAssistantSpecification,
} from "../../src/index.js";

describe("Main Assistant / Orchestrator Specification Foundation", () => {
  it("accepts the valid Onlyway Assistant specification", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      ONLY_WAY_ASSISTANT_SPECIFICATION,
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      value: {
        assistantId: ONLY_WAY_ASSISTANT_ID,
        displayName: "Onlyway Assistant",
      },
    });
    expect(
      new AgentSpecificationValidator().validate(
        ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification,
      ).ok,
    ).toBe(true);
  });

  it("rejects specifications missing required guardian preflights", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        safetyPreflightRequirements:
          ONLY_WAY_ASSISTANT_SPECIFICATION.safetyPreflightRequirements.filter(
            ({ domain }) => domain !== "operator_safety",
          ),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "safety_preflight_missing",
          path: "safetyPreflightRequirements",
        }),
      ],
      ok: false,
    });
  });

  it("rejects forbidden direct tool capabilities", () => {
    const toolPermission = "tool:execute:browser" as const;
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          capabilities: [
            ...ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.capabilities,
            createToolExecutionCapability(toolPermission),
          ],
          limits: createAgentLimits({ maxToolCalls: 1 }),
          policyRequirements: [
            ...ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification
              .policyRequirements,
            createPolicyRequirement({
              permissions: [toolPermission],
              requirementId: "audit-browser-tool",
              requirementType: "audit",
            }),
            createPolicyRequirement({
              permissions: [toolPermission],
              requirementId: "approve-browser-tool",
              requirementType: "approval",
            }),
          ],
        }),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "forbidden_capability",
          path: "agentSpecification.limits.maxToolCalls",
        }),
        expect.objectContaining({
          code: "forbidden_capability",
          path: "agentSpecification.capabilities[7].capabilityType",
        }),
      ],
      ok: false,
    });
  });

  it("rejects provider-specific model capabilities", () => {
    const permission = "model:invoke:openai" as const;
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          capabilities:
            ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.capabilities.map(
              (capability) =>
                capability.capabilityId === "model-operator-reasoning"
                  ? { ...capability, permission }
                  : capability,
            ),
          policyRequirements:
            ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.policyRequirements.map(
              (requirement) =>
                requirement.requirementId === "audit-operator-model"
                  ? { ...requirement, permissions: [permission] }
                  : requirement,
            ),
        }),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "provider_specific_capability",
          path: "agentSpecification.capabilities[5].permission",
        }),
      ],
      ok: false,
    });
  });

  it("validates the structured input schema", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          inputSchema: {
            ...ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.inputSchema,
            schema: { type: "string" },
          },
        }),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: "agentSpecification.inputSchema.schema.type",
        }),
      ],
      ok: false,
    });
  });

  it("validates the structured output schema", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          outputSchema: {
            ...ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.outputSchema,
            schema: { type: "array" },
          },
        }),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "invalid_value",
          path: "agentSpecification.outputSchema.schema.type",
        }),
      ],
      ok: false,
    });
  });

  it("validates agent capabilities through the existing Agent Specification contract", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          capabilities:
            ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.capabilities.map(
              (capability) =>
                capability.capabilityId === "knowledge-operator"
                  ? removeScopes(capability)
                  : capability,
            ),
        }),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          path: "agentSpecification.capabilities[0].scopes",
        }),
      ]),
    );
  });

  it("validates policy requirements through the existing Agent Specification contract", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        agentSpecification: createAgentSpecification({
          policyRequirements: [
            createPolicyRequirement({
              permissions: ["tool:read:undeclared"],
              requirementId: "audit-undeclared-tool",
            }),
          ],
        }),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "permission_not_declared",
          path: "agentSpecification.policyRequirements[0].permissions[0]",
        }),
      ],
      ok: false,
    });
  });

  it("rejects missing human approval requirements", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        humanApprovalRequirements:
          ONLY_WAY_ASSISTANT_SPECIFICATION.humanApprovalRequirements.map(
            (requirement) =>
              requirement.approvalId === "approve-external-side-effects"
                ? {
                    ...requirement,
                    requiredFor: requirement.requiredFor.filter(
                      (entry) => entry !== "tool_execution",
                    ),
                  }
                : requirement,
          ),
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "humanApprovalRequirements",
        }),
      ],
      ok: false,
    });
  });

  it("validates handoff and delegation policy alignment", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        delegationPolicy: {
          ...ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy,
          allowedTargets:
            ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.allowedTargets.filter(
              ({ agentId }) => agentId !== "research-agent",
            ),
        },
      }),
    );

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "handoff_not_declared",
          path: "agentSpecification.handoffTargets[4]",
        }),
      ],
      ok: false,
    });
  });

  it("validates identity and version boundaries", () => {
    const result = new MainAssistantSpecificationValidator().validate(
      createSpecification({
        assistantId: "other-assistant",
        contractVersion: "2",
      } as unknown as Partial<MainAssistantSpecification>),
    );

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
      ]),
    );
  });

  it("keeps the default specification immutable and deterministic", () => {
    const validator = new MainAssistantSpecificationValidator();

    expect(Object.isFrozen(ONLY_WAY_ASSISTANT_SPECIFICATION)).toBe(true);
    expect(
      Object.isFrozen(
        ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.allowedTargets,
      ),
    ).toBe(true);
    expect(validator.validate(ONLY_WAY_ASSISTANT_SPECIFICATION)).toEqual(
      validator.validate(ONLY_WAY_ASSISTANT_SPECIFICATION),
    );
  });

  it("rejects raw unsafe fields at the assistant specification boundary", () => {
    const result = new MainAssistantSpecificationValidator().validate({
      ...createSpecification(),
      providerPayload: { raw: "payload" },
      secretRef: "env:OPENAI_API_KEY",
    });

    expect(result).toMatchObject({
      issues: [
        expect.objectContaining({
          code: "unexpected",
          path: "providerPayload",
        }),
        expect.objectContaining({
          code: "unexpected",
          path: "secretRef",
        }),
      ],
      ok: false,
    });
  });
});

function createSpecification(
  overrides: Partial<MainAssistantSpecification> = {},
): MainAssistantSpecification {
  return {
    ...structuredClone(ONLY_WAY_ASSISTANT_SPECIFICATION),
    ...overrides,
  };
}

function createAgentSpecification(
  overrides: Partial<AgentSpecification> = {},
): AgentSpecification {
  return {
    ...structuredClone(ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification),
    ...overrides,
  };
}

function createAgentLimits(overrides: Partial<AgentLimit> = {}): AgentLimit {
  return {
    ...ONLY_WAY_ASSISTANT_SPECIFICATION.agentSpecification.limits,
    ...overrides,
  };
}

function createToolExecutionCapability(
  permission: "tool:execute:browser",
): AgentCapability {
  return {
    capabilityId: "tool-browser-execute",
    capabilityType: "tool.execute",
    description: "Attempt to execute a browser tool directly.",
    permission,
    required: false,
  };
}

function removeScopes(capability: AgentCapability): AgentCapability {
  return {
    capabilityId: capability.capabilityId,
    capabilityType: capability.capabilityType,
    description: capability.description,
    permission: capability.permission,
    required: capability.required,
  };
}

function createPolicyRequirement(
  overrides: Partial<AgentPolicyRequirement> = {},
): AgentPolicyRequirement {
  return {
    permissions: ["workflow:propose:operator-review"],
    rationale: "Policy requirement for test composition.",
    requirementId: "audit-test-policy",
    requirementType: "audit",
    ...overrides,
  };
}
