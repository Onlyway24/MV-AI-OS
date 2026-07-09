import { describe, expect, it } from "vitest";

import {
  AgentSpecificationRegistryError,
  AgentSpecificationValidator,
  DEFAULT_AGENT_COMPANY_MAP,
  ImmutableAgentSpecificationRegistry,
  INITIAL_CORE_AGENT_SPECIFICATIONS,
} from "../../src/index.js";

const EXPECTED_AGENT_IDS = [
  "research-agent",
  "business-agent",
  "content-director",
  "developer-agent",
  "knowledge-curator",
] as const;

describe("Initial Core Agent Specifications", () => {
  it("validates every initial core AgentSpecification with existing validator", () => {
    const validator = new AgentSpecificationValidator();

    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      expect(validator.validate(specification)).toEqual({
        ok: true,
        value: specification,
      });
    }
  });

  it("maps every specification to the Agent Company role map", () => {
    expect(INITIAL_CORE_AGENT_SPECIFICATIONS.map(({ agentId }) => agentId)).toEqual(
      EXPECTED_AGENT_IDS,
    );

    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
        ({ roleId }) => roleId === specification.agentId,
      );
      expect(role).toBeDefined();
      expect(specification.version).toBe(
        role?.futureAgentSpecification.version,
      );
      expect(specification.status).toBe(
        role?.futureAgentSpecification.expectedStatus,
      );
      expect(specification.implementationRef).toBe(
        `specification:${specification.agentId}@1.0.0`,
      );
    }
  });

  it("declares deterministic identities, task types, and strict schemas", () => {
    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      expect(specification.status).toBe("experimental");
      expect(specification.version).toBe("1.0.0");
      expect(specification.taskTypes.length).toBeGreaterThan(0);
      expect([...specification.taskTypes]).toEqual(
        [...specification.taskTypes].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      expect(specification.inputSchema.strict).toBe(true);
      expect(specification.inputSchema.schema).toMatchObject({
        additionalProperties: false,
        type: "object",
      });
      expect(specification.outputSchema.strict).toBe(true);
      expect(specification.outputSchema.schema).toMatchObject({
        additionalProperties: false,
        type: "object",
      });
    }
  });

  it("aligns capabilities with memory, knowledge, model, workflow proposal, and no direct tool execution", () => {
    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      const capabilityTypes = specification.capabilities.map(
        ({ capabilityType }) => capabilityType,
      );
      expect(capabilityTypes).toContain("knowledge.search");
      expect(capabilityTypes).toContain("memory.read");
      expect(capabilityTypes).toContain("memory.write.proposal");
      expect(capabilityTypes).toContain("model.invoke");
      expect(capabilityTypes).toContain("workflow.propose");
      expect(capabilityTypes).not.toContain("tool.execute");
      expect(capabilityTypes).not.toContain("tool.read");
      expect(specification.limits.maxModelCalls).toBe(1);
      expect(specification.limits.maxToolCalls).toBe(0);

      const knowledge = specification.capabilities.find(
        ({ capabilityType }) => capabilityType === "knowledge.search",
      );
      expect(knowledge?.permission).toBe("knowledge:search");
      expect(knowledge?.scopes?.length).toBeGreaterThan(0);
      expect(knowledge?.scopes).toEqual(
        [...(knowledge?.scopes ?? [])].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
    }
  });

  it("declares policy requirements for every capability permission", () => {
    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      const capabilityPermissions = specification.capabilities.map(
        ({ permission }) => permission,
      );
      const policyPermissions = specification.policyRequirements.flatMap(
        ({ permissions }) => permissions,
      );
      expect(policyPermissions).toEqual(capabilityPermissions);
      expect(
        specification.policyRequirements.every(
          ({ requirementType }) => requirementType === "data_scope",
        ),
      ).toBe(true);
    }
  });

  it("declares deterministic handoff targets without self-handoffs", () => {
    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      expect(specification.handoffTargets).toEqual(
        [...specification.handoffTargets].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
      expect(specification.handoffTargets).not.toContain(specification.agentId);
    }
  });

  it("composes through immutable registry, resolves exact versions, and rejects duplicates", () => {
    const validator = new AgentSpecificationValidator();
    const registry = new ImmutableAgentSpecificationRegistry(
      INITIAL_CORE_AGENT_SPECIFICATIONS,
      validator,
    );

    expect(registry.list().map(({ agentId }) => agentId)).toEqual([
      "business-agent",
      "content-director",
      "developer-agent",
      "knowledge-curator",
      "research-agent",
    ]);
    expect(registry.get("research-agent", "1.0.0")?.agentId).toBe(
      "research-agent",
    );
    expect(registry.findActiveByTaskType("research.market")).toEqual([]);

    expect(
      () =>
        new ImmutableAgentSpecificationRegistry(
          [
            ...INITIAL_CORE_AGENT_SPECIFICATIONS,
            specificationAt(0),
          ],
          validator,
        ),
    ).toThrow(AgentSpecificationRegistryError);
  });

  it("keeps specifications redaction-safe and non-executing", () => {
    const serialized = JSON.stringify(INITIAL_CORE_AGENT_SPECIFICATIONS);
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

    for (const specification of INITIAL_CORE_AGENT_SPECIFICATIONS) {
      expect(
        specification.capabilities.every(
          ({ capabilityType }) =>
            capabilityType !== "tool.execute" &&
            capabilityType !== "tool.read",
        ),
      ).toBe(true);
    }
  });
});

function specificationAt(index: number) {
  const specification = INITIAL_CORE_AGENT_SPECIFICATIONS[index];
  if (specification === undefined) {
    throw new Error(`missing test specification at index ${String(index)}`);
  }
  return specification;
}
