import { describe, expect, it } from "vitest";

import {
  AgentSpecificationRegistryError,
  AgentSpecificationValidator,
  DEFAULT_AGENT_COMPANY_MAP,
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES,
  ExtendedBusinessAgentSpecificationProfileValidator,
  ImmutableAgentSpecificationRegistry,
  type ExtendedBusinessAgentId,
  type ExtendedBusinessAgentSpecificationProfile,
} from "../../src/index.js";

const EXPECTED_AGENT_IDS = [
  "publisher-agent",
  "sales-agent",
  "finance-cost-analyst",
  "legal-risk-reviewer",
  "customer-delivery-agent",
] as const;

const APPROVAL_SENSITIVE_AGENT_IDS: readonly ExtendedBusinessAgentId[] = [
  "publisher-agent",
  "sales-agent",
  "customer-delivery-agent",
];

describe("Extended Business Agent Specifications", () => {
  it("accepts all five valid business AgentSpecifications and profiles", () => {
    const profileValidator =
      new ExtendedBusinessAgentSpecificationProfileValidator();
    const specificationValidator = new AgentSpecificationValidator();

    expect(EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES).toHaveLength(5);
    expect(EXTENDED_BUSINESS_AGENT_SPECIFICATIONS).toHaveLength(5);
    expect(EXTENDED_BUSINESS_AGENT_SPECIFICATIONS.map(({ agentId }) => agentId)).toEqual(
      EXPECTED_AGENT_IDS,
    );

    for (const profile of EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES) {
      expect(profileValidator.validate(profile)).toEqual({
        ok: true,
        value: profile,
      });
      expect(specificationValidator.validate(profile.agentSpecification)).toEqual({
        ok: true,
        value: profile.agentSpecification,
      });
    }
  });

  it("maps every specification to the Agent Company role map", () => {
    for (const profile of EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES) {
      const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
        ({ roleId }) => roleId === profile.agentId,
      );
      expect(role).toBeDefined();
      expect(profile.businessPurpose).toBe(role?.operatorFacingPurpose);
      expect(profile.businessValues).toEqual(role?.businessValues);
      expect(profile.responsibilities).toEqual(role?.boundaries.responsibilities);
      expect(profile.guardianConsultationRequirements).toEqual(
        role?.controlPlaneDependencies,
      );
      expect(profile.agentSpecification.version).toBe(
        role?.futureAgentSpecification.version,
      );
      expect(profile.agentSpecification.status).toBe(
        role?.futureAgentSpecification.expectedStatus,
      );
    }
  });

  it("defines every required business-side profile field", () => {
    for (const profile of EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES) {
      expect(profile.nonExecuting).toBe(true);
      expect(profile.businessPurpose.length).toBeGreaterThan(0);
      expect(profile.responsibilities.length).toBeGreaterThan(0);
      expect(profile.nonResponsibilities.length).toBeGreaterThan(0);
      expect(profile.agentSpecification.inputSchema.strict).toBe(true);
      expect(profile.agentSpecification.outputSchema.strict).toBe(true);
      expect(profile.requiredPermissions).toEqual(
        profile.agentSpecification.capabilities.map(({ permission }) => permission),
      );
      expect(profile.forbiddenCapabilities).toEqual(
        DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities,
      );
      expect(profile.futureToolDeclarations.length).toBeGreaterThan(0);
      for (const declaration of profile.futureToolDeclarations) {
        expect(declaration.nonExecuting).toBe(true);
      }
      expect(profile.failureModes.length).toBeGreaterThan(0);
      expect(profile.qualityChecks.length).toBeGreaterThan(0);
      expect(profile.businessValues.length).toBeGreaterThan(0);
      expect(profile.escalationRules.length).toBeGreaterThan(0);
      expect(profile.expectedOutputQualityBar.length).toBeGreaterThan(0);
    }
  });

  it("preserves explicit approval requirements for external publishing, sales, and customer delivery", () => {
    for (const agentId of APPROVAL_SENSITIVE_AGENT_IDS) {
      const profile = profileById(agentId);
      expect(
        profile.approvalRequirements.some(
          ({ approvalId, requiredFor }) =>
            approvalId === "approve-external-side-effects" &&
            requiredFor.includes("external_side_effect") &&
            requiredFor.includes("publish_or_send"),
        ),
      ).toBe(true);

      const workflowPermission = profile.agentSpecification.capabilities.find(
        ({ capabilityType }) => capabilityType === "workflow.propose",
      )?.permission;
      expect(workflowPermission).toBeDefined();
      expect(
        profile.agentSpecification.policyRequirements.some(
          ({ permissions, requirementType }) =>
            requirementType === "approval" &&
            workflowPermission !== undefined &&
            permissions.includes(workflowPermission),
        ),
      ).toBe(true);
    }
  });

  it("keeps Finance and Legal / Risk advisory and non-binding", () => {
    const finance = profileById("finance-cost-analyst");
    const legal = profileById("legal-risk-reviewer");

    expect(finance.nonResponsibilities.join(" ")).toContain("spend money");
    expect(finance.nonResponsibilities.join(" ")).toContain("change budgets");
    expect(finance.nonResponsibilities.join(" ")).toContain("execute payments");
    expect(finance.approvalRequirements).toEqual([]);
    expect(legal.nonResponsibilities.join(" ")).toContain(
      "binding legal advice",
    );
    expect(legal.nonResponsibilities.join(" ")).toContain(
      "final compliance approval",
    );
    expect(legal.approvalRequirements).toEqual([]);
  });

  it("keeps all business AgentSpecifications non-executing and without direct tool access", () => {
    for (const specification of EXTENDED_BUSINESS_AGENT_SPECIFICATIONS) {
      expect(
        specification.capabilities.every(
          ({ capabilityType }) =>
            capabilityType !== "tool.execute" &&
            capabilityType !== "tool.read",
        ),
      ).toBe(true);
      expect(specification.limits.maxToolCalls).toBe(0);
      expect(specification.limits.maxModelCalls).toBe(1);
      expect(specification.taskTypes).toEqual(
        [...specification.taskTypes].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      expect(specification.handoffTargets).toEqual(
        [...specification.handoffTargets].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      expect(specification.handoffTargets).not.toContain(specification.agentId);
    }
  });

  it("composes through immutable registry and rejects duplicates", () => {
    const validator = new AgentSpecificationValidator();
    const registry = new ImmutableAgentSpecificationRegistry(
      EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
      validator,
    );

    expect(registry.list().map(({ agentId }) => agentId)).toEqual([
      "customer-delivery-agent",
      "finance-cost-analyst",
      "legal-risk-reviewer",
      "publisher-agent",
      "sales-agent",
    ]);
    expect(registry.get("sales-agent", "1.0.0")?.agentId).toBe("sales-agent");
    expect(registry.findActiveByTaskType("sales.proposal")).toEqual([]);
    expect(
      () =>
        new ImmutableAgentSpecificationRegistry(
          [
            ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
            EXTENDED_BUSINESS_AGENT_SPECIFICATIONS[0],
          ],
          validator,
        ),
    ).toThrow(AgentSpecificationRegistryError);
  });

  it("rejects missing forbidden capabilities", () => {
    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...profileById("publisher-agent"),
      forbiddenCapabilities:
        DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities.slice(1),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden_capability_mismatch",
          path: "forbiddenCapabilities",
        }),
      ]),
    );
  });

  it("rejects missing guardian requirements", () => {
    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...profileById("sales-agent"),
      guardianConsultationRequirements: ["operator_safety"],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "guardian_requirement_missing",
          path: "guardianConsultationRequirements",
        }),
      ]),
    );
  });

  it("rejects missing approval requirements", () => {
    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...profileById("customer-delivery-agent"),
      approvalRequirements: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "approvalRequirements",
        }),
      ]),
    );
  });

  it("rejects missing business value classification", () => {
    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...profileById("finance-cost-analyst"),
      businessValues: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "empty",
          path: "businessValues",
        }),
      ]),
    );
  });

  it("blocks future external communication declarations unless approval is required", () => {
    const sales = profileById("sales-agent");
    const firstDeclaration = sales.futureToolDeclarations[0];
    if (firstDeclaration === undefined) {
      throw new Error("missing test declaration");
    }

    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...sales,
      futureToolDeclarations: [
        {
          ...firstDeclaration,
          approvalRequired: false,
        },
        ...sales.futureToolDeclarations.slice(1),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "futureToolDeclarations[0].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects direct tool capabilities even if the generic AgentSpecification is otherwise valid", () => {
    const publisher = profileById("publisher-agent");
    const permission = "tool:read:publishing-catalog" as const;
    const result = new ExtendedBusinessAgentSpecificationProfileValidator().validate({
      ...publisher,
      agentSpecification: {
        ...publisher.agentSpecification,
        capabilities: [
          ...publisher.agentSpecification.capabilities,
          {
            capabilityId: "publishing-catalog-read",
            capabilityType: "tool.read",
            description: "Read future publishing catalog data.",
            permission,
            required: false,
          },
        ],
        limits: {
          ...publisher.agentSpecification.limits,
          maxToolCalls: 1,
        },
        policyRequirements: [
          ...publisher.agentSpecification.policyRequirements,
          {
            permissions: [permission],
            rationale: "Direct tool access would require audit if it existed.",
            requirementId: "audit-publishing-catalog-read",
            requirementType: "audit",
          },
        ],
      },
      requiredPermissions: [
        ...publisher.requiredPermissions,
        permission,
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "direct_tool_capability_forbidden",
          path: "agentSpecification.capabilities",
        }),
      ]),
    );
  });

  it("keeps profiles redaction-safe", () => {
    const serialized = JSON.stringify(
      EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES,
    );
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("completion");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("secretRef");
    expect(serialized).not.toContain("secretValue");
    expect(serialized).not.toContain("rawTranscript");
    expect(serialized).not.toContain("rawKnowledge");
    expect(serialized).not.toContain("rawMemory");
    expect(serialized).not.toContain("rawGuardianPayload");
    expect(serialized).not.toContain("transportInternals");
    expect(serialized).not.toContain("/Users/");
  });
});

function profileById(
  agentId: ExtendedBusinessAgentId,
): ExtendedBusinessAgentSpecificationProfile {
  const profile = EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES.find(
    (candidate) => candidate.agentId === agentId,
  );
  if (profile === undefined) {
    throw new Error(`missing profile: ${agentId}`);
  }
  return profile;
}
