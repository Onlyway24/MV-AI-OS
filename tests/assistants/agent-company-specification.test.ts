import { describe, expect, it } from "vitest";

import {
  AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION,
  AgentCompanyMapValidator,
  AgentCompanyRoleValidator,
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyMap,
  type AgentCompanyRole,
} from "../../src/index.js";

describe("Agent Company Specification Foundation", () => {
  const developerRole = roleAt(3);

  it("accepts the valid declarative Agent Company map", () => {
    expect(new AgentCompanyMapValidator().validate(DEFAULT_AGENT_COMPANY_MAP)).toEqual(
      {
        ok: true,
        value: DEFAULT_AGENT_COMPANY_MAP,
      },
    );
  });

  it("accepts valid individual roles", () => {
    const validator = new AgentCompanyRoleValidator();

    for (const role of DEFAULT_AGENT_COMPANY_MAP.roles) {
      expect(validator.validate(role)).toEqual({
        ok: true,
        value: role,
      });
    }
  });

  it("rejects invalid map contracts", () => {
    const result = new AgentCompanyMapValidator().validate({
      ...DEFAULT_AGENT_COMPANY_MAP,
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

  it("rejects unsafe role definitions", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("research-agent", {
        prompt: "use this hidden prompt",
        operatorFacingPurpose: "Read /Users/fabio/private.txt before acting.",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_key",
          path: "roles[0].prompt",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "roles[0].prompt",
        }),
        expect.objectContaining({
          code: "unsafe_content",
          path: "roles[0].operatorFacingPurpose",
        }),
      ]),
    );
  });

  it("rejects missing business value classification", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("business-agent", {
        businessValues: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "empty",
          path: "roles[1].businessValues",
        }),
      ]),
    );
  });

  it("rejects role boundary violations", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("developer-agent", {
        boundaries: {
          ...developerRole.boundaries,
          nonResponsibilities: ["Do not execute tools."],
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "role_boundary_violation",
          path: "roles[3].boundaries.nonResponsibilities",
        }),
      ]),
    );
  });

  it("rejects missing forbidden capabilities", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("publisher-agent", {
        forbiddenCapabilities:
          DEFAULT_AGENT_COMPANY_MAP.globalForbiddenCapabilities.slice(1),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "roles[4].forbiddenCapabilities",
        }),
      ]),
    );
  });

  it("rejects missing approval requirements where required", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("sales-agent", {
        approvalRequirements: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "roles[6].approvalRequirements",
        }),
      ]),
    );
  });

  it("rejects missing control-plane dependencies where required", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("finance-cost-analyst", {
        controlPlaneDependencies: ["operator_safety", "quality"],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "control_plane_dependency_missing",
          path: "roles[7].controlPlaneDependencies",
        }),
      ]),
    );
  });

  it("rejects non-deterministic role ordering", () => {
    const roles = [...DEFAULT_AGENT_COMPANY_MAP.roles];
    const first = roleAt(0);
    const second = roleAt(1);
    roles[0] = second;
    roles[1] = first;

    const result = new AgentCompanyMapValidator().validate({
      ...DEFAULT_AGENT_COMPANY_MAP,
      roles,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "roles",
        }),
      ]),
    );
  });

  it("rejects non-deterministic department, dependency, approval, and mapping order", () => {
    const result = new AgentCompanyMapValidator().validate(
      withRole("customer-delivery-agent", {
        approvalRequirements: [
          {
            approvalId: "approve-external-side-effects",
            rationale: "Required before customer delivery side effects.",
            requiredFor: ["publish_or_send", "external_side_effect"],
          },
        ],
        controlPlaneDependencies: ["operator_safety", "backup", "security", "quality"],
        futureAgentSpecification: {
          agentId: "not-customer-delivery-agent",
          expectedStatus: "experimental",
          specificationId: "not-customer-delivery-agent@1.0.0",
          version: "1.0.0",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "roles[9].approvalRequirements[0].requiredFor",
        }),
        expect.objectContaining({
          code: "not_deterministic",
          path: "roles[9].controlPlaneDependencies",
        }),
        expect.objectContaining({
          code: "invalid_specification_mapping",
          path: "roles[9].futureAgentSpecification.agentId",
        }),
      ]),
    );
  });

  it("keeps all roles non-executing and redaction-safe", () => {
    const result = new AgentCompanyMapValidator().validate({
      ...DEFAULT_AGENT_COMPANY_MAP,
      contractVersion: AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION,
    });

    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(DEFAULT_AGENT_COMPANY_MAP);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("completion");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("secretRef");
    expect(serialized).not.toContain("secretValue");
    expect(serialized).not.toContain("rawKnowledge");
    expect(serialized).not.toContain("rawMemory");
    expect(serialized).not.toContain("rawGuardianPayload");
    expect(serialized).not.toContain("transportInternals");
    expect(DEFAULT_AGENT_COMPANY_MAP.nonExecuting).toBe(true);
  });
});

function withRole(
  roleId: AgentCompanyRole["roleId"],
  patch: Partial<AgentCompanyRole> & Record<string, unknown>,
): AgentCompanyMap {
  return {
    ...DEFAULT_AGENT_COMPANY_MAP,
    roles: DEFAULT_AGENT_COMPANY_MAP.roles.map((role) =>
      role.roleId === roleId
        ? {
            ...role,
            ...patch,
          }
        : role,
    ),
  };
}

function roleAt(index: number): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles[index];
  if (role === undefined) {
    throw new Error(`missing test role at index ${String(index)}`);
  }
  return role;
}
