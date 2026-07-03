import { describe, expect, it } from "vitest";

import {
  AgentCapabilityValidator,
  AgentInputSchemaValidator,
  AgentLimitValidator,
  AgentOutputSchemaValidator,
  AgentPolicyRequirementValidator,
  AgentSpecificationValidator,
} from "../../src/index.js";
import {
  createAgentCapability,
  createAgentInputSchema,
  createAgentLimit,
  createAgentOutputSchema,
  createAgentPolicyRequirement,
  createAgentSpecification,
} from "./fixtures.js";

describe("Agent specification validation", () => {
  it("accepts all valid public agent specification contracts", () => {
    expect(
      new AgentInputSchemaValidator().validate(createAgentInputSchema()).ok,
    ).toBe(true);
    expect(
      new AgentOutputSchemaValidator().validate(createAgentOutputSchema()).ok,
    ).toBe(true);
    expect(
      new AgentCapabilityValidator().validate(createAgentCapability()).ok,
    ).toBe(true);
    expect(
      new AgentLimitValidator().validate(createAgentLimit()).ok,
    ).toBe(true);
    expect(
      new AgentPolicyRequirementValidator().validate(
        createAgentPolicyRequirement(),
      ).ok,
    ).toBe(true);
    expect(
      new AgentSpecificationValidator().validate(
        createAgentSpecification(),
      ).ok,
    ).toBe(true);
  });

  it("rejects non-object structured input and output schemas", () => {
    const input = new AgentInputSchemaValidator().validate(
      createAgentInputSchema({ schema: { type: "string" } }),
    );
    const output = new AgentOutputSchemaValidator().validate(
      createAgentOutputSchema({ schema: {} }),
    );

    expect(input.ok).toBe(false);
    expect(output.ok).toBe(false);
  });

  it("rejects mismatched capabilities and missing knowledge scopes", () => {
    const mismatch = new AgentCapabilityValidator().validate(
      createAgentCapability({
        capabilityType: "tool.read",
        permission: "model:invoke:content-quality",
      }),
    );
    const missingScopes = new AgentCapabilityValidator().validate(
      createAgentCapability({
        capabilityType: "knowledge.search",
        permission: "knowledge:search",
      }),
    );
    const emptyKnowledgeAccess = new AgentCapabilityValidator().validate(
      createAgentCapability({
        capabilityType: "knowledge.search",
        permission: "knowledge:search",
        scopes: ["none"],
      }),
    );

    expect(mismatch.ok).toBe(false);
    expect(missingScopes.ok).toBe(false);
    expect(emptyKnowledgeAccess.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "permission_mismatch",
            path: "permission",
          }),
        ]),
      );
    }
  });

  it("rejects invalid limits and policy requirements", () => {
    const limits = new AgentLimitValidator().validate(
      createAgentLimit({ maxResultBytes: 0, maxTokens: 1.5 }),
    );
    const policy = new AgentPolicyRequirementValidator().validate(
      {
        ...createAgentPolicyRequirement(),
        permissions: ["knowledge:invalid"],
      },
    );

    expect(limits.ok).toBe(false);
    expect(policy.ok).toBe(false);
  });

  it("rejects duplicate capabilities and policy references outside declared permissions", () => {
    const capability = createAgentCapability();
    const result = new AgentSpecificationValidator().validate(
      createAgentSpecification({
        capabilities: [capability, capability],
        policyRequirements: [
          createAgentPolicyRequirement({
            permissions: ["tool:read:undeclared"],
          }),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate",
            path: "capabilities",
          }),
          expect.objectContaining({
            code: "permission_not_declared",
          }),
        ]),
      );
    }
  });

  it("enforces semantic versions and capability-aligned limits", () => {
    const result = new AgentSpecificationValidator().validate(
      createAgentSpecification({
        limits: createAgentLimit({
          maxModelCalls: 0,
          maxToolCalls: 0,
        }),
        version: "latest",
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_format",
            path: "version",
          }),
          expect.objectContaining({
            code: "limit_mismatch",
            path: "limits.maxModelCalls",
          }),
          expect.objectContaining({
            code: "limit_mismatch",
            path: "limits.maxToolCalls",
          }),
        ]),
      );
    }
  });

  it("requires approval and audit policies for direct tool execution", () => {
    const executeCapability = createAgentCapability({
      capabilityId: "tool-catalog-execute",
      capabilityType: "tool.execute",
      permission: "tool:execute:catalog",
    });
    const result = new AgentSpecificationValidator().validate(
      createAgentSpecification({
        capabilities: [
          createAgentCapability(),
          executeCapability,
        ],
        policyRequirements: [],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.filter(
          ({ code }) => code === "policy_requirement_missing",
        ),
      ).toHaveLength(2);
    }
  });

  it("accepts direct tool execution with matching approval and audit requirements", () => {
    const permission = "tool:execute:catalog" as const;
    const result = new AgentSpecificationValidator().validate(
      createAgentSpecification({
        capabilities: [
          createAgentCapability(),
          createAgentCapability({
            capabilityId: "tool-catalog-execute",
            capabilityType: "tool.execute",
            permission,
          }),
        ],
        policyRequirements: [
          createAgentPolicyRequirement({
            permissions: [permission],
            requirementId: "audit-catalog-execute",
          }),
          createAgentPolicyRequirement({
            permissions: [permission],
            rationale: "Execution requires explicit human approval.",
            requirementId: "approve-catalog-execute",
            requirementType: "approval",
          }),
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });
});
