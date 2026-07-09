import { describe, expect, it } from "vitest";

import {
  AGENT_COMPANY_CAPABILITY_IDS,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  DEFAULT_AGENT_COMPANY_MAP,
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  INITIAL_CORE_AGENT_SPECIFICATIONS,
  AgentCompanyCapabilityRegistryValidator,
  AgentCompanyCapabilityValidator,
  type AgentCompanyCapability,
  type AgentCompanyCapabilityId,
  type AgentCompanyCapabilityRegistry,
  type AgentCompanyRoleId,
} from "../../src/index.js";

const EXPECTED_ROLE_IDS = [
  "research-agent",
  "business-agent",
  "content-director",
  "developer-agent",
  "publisher-agent",
  "knowledge-curator",
  "sales-agent",
  "finance-cost-analyst",
  "legal-risk-reviewer",
  "customer-delivery-agent",
] as const;

describe("Agent Capability Registry", () => {
  it("accepts the valid deterministic capability registry", () => {
    expect(
      new AgentCompanyCapabilityRegistryValidator().validate(
        DEFAULT_AGENT_CAPABILITY_REGISTRY,
      ),
    ).toEqual({
      ok: true,
      value: DEFAULT_AGENT_CAPABILITY_REGISTRY,
    });
  });

  it("validates individual capabilities", () => {
    const capability = capabilityById("offer-design");

    expect(new AgentCompanyCapabilityValidator().validate(capability)).toEqual({
      ok: true,
      value: capability,
    });
  });

  it("ensures every current Agent Company role owns at least one capability", () => {
    const ownedRoleIds = new Set(
      DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.flatMap(({ primaryOwners }) =>
        primaryOwners.map(({ agentId }) => agentId),
      ),
    );

    expect(DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId)).toEqual(
      EXPECTED_ROLE_IDS,
    );
    for (const roleId of EXPECTED_ROLE_IDS) {
      expect(ownedRoleIds.has(roleId)).toBe(true);
    }
  });

  it("requires every capability to have exactly one primary owner", () => {
    for (const capability of DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities) {
      expect(capability.primaryOwners).toHaveLength(1);
      expect(capability.primaryOwners[0]?.ownership).toBe("accountable");
    }
  });

  it("maps owners and supporters to Agent Company roles and exact AgentSpecification IDs", () => {
    const specificationKeys = new Set(
      [
        ...INITIAL_CORE_AGENT_SPECIFICATIONS,
        ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
      ].map(({ agentId, version }) => `${agentId}@${version}`),
    );

    for (const capability of DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities) {
      for (const roleReference of [
        ...capability.primaryOwners,
        ...capability.supportingRoles,
      ]) {
        const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
          ({ roleId }) => roleId === roleReference.agentId,
        );
        expect(role).toBeDefined();
        expect(roleReference.specificationId).toBe(
          role?.futureAgentSpecification.specificationId,
        );
        expect(roleReference.version).toBe(
          role?.futureAgentSpecification.version,
        );
        expect(
          specificationKeys.has(
            `${roleReference.agentId}@${roleReference.version}`,
          ),
        ).toBe(true);
      }
    }
  });

  it("rejects duplicate capability IDs", () => {
    const base = cloneRegistry();
    const first = base.capabilities[0];
    const second = base.capabilities[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing test capabilities");
    }

    const result = validateRegistry({
      ...base,
      capabilities: [
        first,
        {
          ...second,
          capabilityId: first.capabilityId,
        },
        ...base.capabilities.slice(2),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate",
          path: "capabilities",
        }),
      ]),
    );
  });

  it("rejects duplicate primary ownership", () => {
    const result = validateWithCapability("source-research", (capability) => {
      const owner = primaryOwner(capability);
      return {
        ...capability,
        primaryOwners: [
          owner,
          owner,
        ],
      };
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate_primary_owner",
          path: "capabilities[0].primaryOwners",
        }),
      ]),
    );
  });

  it("rejects missing primary ownership", () => {
    const result = validateWithCapability("source-research", (capability) => ({
      ...capability,
      primaryOwners: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "owner_missing",
          path: "capabilities[0].primaryOwners",
        }),
      ]),
    );
  });

  it("rejects capability owners that are not known Agent Company roles", () => {
    const result = validateWithCapability("source-research", (capability) => {
      const owner = primaryOwner(capability);
      return {
        ...capability,
        primaryOwners: [
          {
            ...owner,
            agentId: "unknown-agent" as AgentCompanyRoleId,
          },
        ],
      };
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: "capabilities[0].primaryOwners[0].agentId",
        }),
      ]),
    );
  });

  it("rejects empty or invalid capability categories", () => {
    const result = validateWithCapability("source-research", (capability) => ({
      ...capability,
      category: "" as AgentCompanyCapability["category"],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "empty",
          path: "capabilities[0].category",
        }),
      ]),
    );
  });

  it("rejects capabilities that imply direct execution", () => {
    const result = validateWithCapability("implementation-planning", (capability) => ({
      ...capability,
      description: "This capability can execute workflow steps directly.",
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_capability",
        }),
      ]),
    );
  });

  it("rejects external communication capabilities without approval", () => {
    const result = validateWithCapability("client-handoff-preparation", (capability) => ({
      ...capability,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "capabilities[40].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects publishing capabilities without Fabio approval", () => {
    const result = validateWithCapability("publishing-preparation", (capability) => ({
      ...capability,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "capabilities[22].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects sales outreach capabilities without Fabio approval", () => {
    const result = validateWithCapability("outreach-preparation", (capability) => ({
      ...capability,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "capabilities[27].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects finance capabilities that imply payment, spending, or budget mutation", () => {
    const result = validateWithCapability("cost-estimation", (capability) => ({
      ...capability,
      description: "Prepare analysis and execute payment for the operator.",
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_capability",
        }),
      ]),
    );
  });

  it("rejects legal/risk capabilities that imply final compliance approval", () => {
    const result = validateWithCapability(
      "compliance-sensitive-review",
      (capability) => ({
        ...capability,
        description: "Provide final compliance approval for customer-facing use.",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_capability",
        }),
      ]),
    );
  });

  it("rejects future tool mappings unless explicitly non-executing", () => {
    const result = validateWithCapability("source-research", (capability) => ({
      ...capability,
      futureTool: {
        ...capability.futureTool,
        nonExecuting: false,
      },
    }) as unknown as AgentCompanyCapability);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_capability",
          path: "capabilities[0].futureTool.nonExecuting",
        }),
      ]),
    );
  });

  it("rejects future workflow mappings unless explicitly non-executing", () => {
    const result = validateWithCapability("offer-design", (capability) => ({
      ...capability,
      futureWorkflow: {
        ...capability.futureWorkflow,
        nonExecuting: false,
      },
    }) as unknown as AgentCompanyCapability);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_capability",
          path: "capabilities[4].futureWorkflow.nonExecuting",
        }),
      ]),
    );
  });

  it("rejects guardian-sensitive capabilities with missing guardian requirements", () => {
    const result = validateWithCapability(
      "technical-architecture-support",
      (capability) => ({
        ...capability,
        guardianRequired: false,
        guardianRequirements: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "guardian_requirement_missing",
          path: "capabilities[15].guardianRequired",
        }),
      ]),
    );
  });

  it("rejects approval-sensitive capabilities with missing approval requirements", () => {
    const result = validateWithCapability(
      "approval-ready-sales-handoff",
      (capability) => ({
        ...capability,
        approvalRequired: true,
        approvalRequirements: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "capabilities[29].approvalRequirements",
        }),
      ]),
    );
  });

  it("rejects non-deterministic capability ordering", () => {
    const base = cloneRegistry();
    const first = base.capabilities[0];
    const second = base.capabilities[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing test capabilities");
    }

    const result = validateRegistry({
      ...base,
      capabilities: [
        second,
        first,
        ...base.capabilities.slice(2),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "capabilities",
        }),
      ]),
    );
  });

  it("exposes an immutable default registry", () => {
    const firstCapability = DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities[0];
    if (firstCapability === undefined) {
      throw new Error("missing first capability");
    }

    expect(Object.isFrozen(DEFAULT_AGENT_CAPABILITY_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities)).toBe(
      true,
    );
    expect(Object.isFrozen(firstCapability)).toBe(true);
    expect(Object.isFrozen(firstCapability.primaryOwners)).toBe(true);
  });

  it("rejects sensitive raw text and provider payload leakage", () => {
    const result = validateWithCapability("source-research", (capability) => ({
      ...capability,
      description:
        "Contains raw prompt text, providerPayload details, and sk-test-secret.",
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "sensitive_content",
          path: "capabilities[0].description",
        }),
      ]),
    );
  });

  it("keeps the exported capability IDs aligned with registry order", () => {
    expect(DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.map(({ capabilityId }) => capabilityId)).toEqual(
      AGENT_COMPANY_CAPABILITY_IDS,
    );
  });
});

function validateRegistry(registry: AgentCompanyCapabilityRegistry) {
  return new AgentCompanyCapabilityRegistryValidator().validate(registry);
}

function validateWithCapability(
  capabilityId: AgentCompanyCapabilityId,
  mutate: (capability: AgentCompanyCapability) => AgentCompanyCapability,
) {
  const base = cloneRegistry();
  return validateRegistry({
    ...base,
    capabilities: base.capabilities.map((capability) =>
      capability.capabilityId === capabilityId ? mutate(capability) : capability,
    ),
  });
}

function capabilityById(
  capabilityId: AgentCompanyCapabilityId,
): AgentCompanyCapability {
  const capability = DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  if (capability === undefined) {
    throw new Error(`missing capability ${capabilityId}`);
  }
  return capability;
}

function primaryOwner(
  capability: AgentCompanyCapability,
): AgentCompanyCapability["primaryOwners"][number] {
  const owner = capability.primaryOwners[0];
  if (owner === undefined) {
    throw new Error("missing primary owner");
  }
  return owner;
}

function cloneRegistry(): AgentCompanyCapabilityRegistry {
  return structuredClone(DEFAULT_AGENT_CAPABILITY_REGISTRY);
}
