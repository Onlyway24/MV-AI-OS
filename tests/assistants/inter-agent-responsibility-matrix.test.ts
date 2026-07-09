import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_MAP,
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  INITIAL_CORE_AGENT_SPECIFICATIONS,
  ResponsibilityAreaValidator,
  ResponsibilityConflictValidator,
  ResponsibilityMatrixValidator,
  type AgentCompanyRoleId,
  type ResponsibilityArea,
  type ResponsibilityAreaId,
  type ResponsibilityMatrix,
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

const EXPECTED_AREA_IDS = [
  "research",
  "market-analysis",
  "business-strategy",
  "offer-design",
  "pricing-support",
  "content-direction",
  "content-review",
  "implementation-planning",
  "knowledge-curation",
  "publishing-preparation",
  "sales-planning",
  "finance-cost-analysis",
  "legal-risk-review",
  "customer-delivery-preparation",
] as const;

const APPROVAL_SENSITIVE_AREA_IDS: readonly ResponsibilityAreaId[] = [
  "publishing-preparation",
  "sales-planning",
  "customer-delivery-preparation",
];

describe("Inter-Agent Responsibility Matrix", () => {
  it("accepts the valid deterministic matrix", () => {
    expect(
      new ResponsibilityMatrixValidator().validate(
        DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
      ),
    ).toEqual({
      ok: true,
      value: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
    });
  });

  it("validates individual responsibility areas and conflicts", () => {
    const area = areaById("offer-design");
    const conflict = area.conflicts[0];
    if (conflict === undefined) {
      throw new Error("missing test conflict");
    }

    expect(new ResponsibilityAreaValidator().validate(area)).toEqual({
      ok: true,
      value: area,
    });
    expect(new ResponsibilityConflictValidator().validate(conflict)).toEqual({
      ok: true,
      value: conflict,
    });
  });

  it("maps every matrix role to the Agent Company map and an existing AgentSpecification", () => {
    const specificationKeys = new Set(
      [
        ...INITIAL_CORE_AGENT_SPECIFICATIONS,
        ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
      ].map(({ agentId, version }) => `${agentId}@${version}`),
    );

    expect(DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.roles.map(({ agentId }) => agentId)).toEqual(
      EXPECTED_ROLE_IDS,
    );

    for (const role of DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.roles) {
      const companyRole = DEFAULT_AGENT_COMPANY_MAP.roles.find(
        ({ roleId }) => roleId === role.agentId,
      );
      expect(companyRole).toBeDefined();
      expect(role.displayName).toBe(companyRole?.displayName);
      expect(role.specificationId).toBe(
        companyRole?.futureAgentSpecification.specificationId,
      );
      expect(role.version).toBe(companyRole?.futureAgentSpecification.version);
      expect(specificationKeys.has(`${role.agentId}@${role.version}`)).toBe(true);
    }
  });

  it("covers required responsibility areas with one primary owner each", () => {
    expect(DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.map(({ areaId }) => areaId)).toEqual(
      EXPECTED_AREA_IDS,
    );

    for (const [index, area] of DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.entries()) {
      expect(area.order).toBe(index + 1);
      expect(area.primaryOwners).toHaveLength(1);
      expect(area.title.length).toBeGreaterThan(0);
      expect(area.description.length).toBeGreaterThan(0);
      expect(area.businessValues.length).toBeGreaterThan(0);
    }
  });

  it("requires approval markers for external publishing, sales, and customer delivery preparation", () => {
    for (const areaId of APPROVAL_SENSITIVE_AREA_IDS) {
      const area = areaById(areaId);
      expect(area.externalAction).toBe(true);
      expect(area.approvalRequired).toBe(true);
      expect(area.approvalRoles.length).toBeGreaterThan(0);
      expect(
        area.approvalRoles.every(({ requiredBefore }) =>
          requiredBefore.includes("operator-approval"),
        ),
      ).toBe(true);
    }
  });

  it("rejects duplicate primary owners", () => {
    const result = validateWithArea("research", (area) => ({
      ...area,
      primaryOwners: [
        ...area.primaryOwners,
        primaryOwner(area),
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate_primary_owner",
          path: "areas[0].primaryOwners",
        }),
      ]),
    );
  });

  it("rejects missing primary owner", () => {
    const result = validateWithArea("business-strategy", (area) => ({
      ...area,
      primaryOwners: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "owner_missing",
          path: "areas[2].primaryOwners",
        }),
      ]),
    );
  });

  it("rejects circular or unclear ownership", () => {
    const result = validateWithArea("offer-design", (area) => {
      const owner = primaryOwner(area);
      const support = area.supportingRoles[0];
      if (support === undefined) {
        throw new Error("missing support role");
      }
      return {
        ...area,
        supportingRoles: [
          {
            ...support,
            agentId: owner.agentId,
            specificationId: owner.specificationId,
            version: owner.version,
          },
          ...area.supportingRoles.slice(1),
        ],
      };
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unclear_ownership",
          path: "areas[3].supportingRoles",
        }),
      ]),
    );
  });

  it("rejects forbidden ownership", () => {
    const result = validateWithArea("pricing-support", (area) => {
      const owner = primaryOwner(area);
      const forbidden = area.forbiddenRoles[0];
      if (forbidden === undefined) {
        throw new Error("missing forbidden role");
      }
      return {
        ...area,
        forbiddenRoles: [
          {
            ...forbidden,
            agentId: owner.agentId,
            specificationId: owner.specificationId,
            version: owner.version,
          },
          ...area.forbiddenRoles.slice(1),
        ],
      };
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden_ownership",
          path: "areas[4].forbiddenRoles",
        }),
      ]),
    );
  });

  it("rejects unknown agent IDs", () => {
    const base = cloneMatrix();
    const role = base.roles[0];
    if (role === undefined) {
      throw new Error("missing role");
    }
    const matrix: ResponsibilityMatrix = {
      ...base,
      roles: [
        {
          ...role,
          agentId: "unknown-agent" as AgentCompanyRoleId,
        },
        ...base.roles.slice(1),
      ],
    };

    const result = new ResponsibilityMatrixValidator().validate(matrix);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: "roles[0].agentId",
        }),
      ]),
    );
  });

  it("rejects non-deterministic area and role ordering", () => {
    const baseAreaOrder = cloneMatrix();
    const first = baseAreaOrder.areas[0];
    const second = baseAreaOrder.areas[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing areas");
    }
    const areaOrder: ResponsibilityMatrix = {
      ...baseAreaOrder,
      areas: [second, first, ...baseAreaOrder.areas.slice(2)],
    };

    const baseRoleOrder = cloneMatrix();
    const offer = areaIndex(baseRoleOrder, "offer-design");
    const offerArea = baseRoleOrder.areas[offer];
    if (offerArea === undefined) {
      throw new Error("missing offer area");
    }
    const roleOrderAreas = [...baseRoleOrder.areas];
    roleOrderAreas[offer] = {
      ...offerArea,
      supportingRoles: [...offerArea.supportingRoles].reverse(),
    };
    const roleOrder: ResponsibilityMatrix = {
      ...baseRoleOrder,
      areas: roleOrderAreas,
    };

    const areaResult = new ResponsibilityMatrixValidator().validate(areaOrder);
    const roleResult = new ResponsibilityMatrixValidator().validate(roleOrder);

    expect(areaResult.ok).toBe(false);
    expect(roleResult.ok).toBe(false);
    expect(areaResult.ok ? [] : areaResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "areas",
        }),
      ]),
    );
    expect(roleResult.ok ? [] : roleResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "areas[3].supportingRoles",
        }),
      ]),
    );
  });

  it("rejects external-action areas without approval", () => {
    const result = validateWithArea("publishing-preparation", (area) => ({
      ...area,
      approvalRequired: false,
      approvalRoles: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "areas[9].approvalRequired",
        }),
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "areas[9].approvalRoles",
        }),
      ]),
    );
  });

  it("rejects invalid conflicts", () => {
    const conflict = areaById("market-analysis").conflicts[0];
    if (conflict === undefined) {
      throw new Error("missing conflict");
    }

    const result = new ResponsibilityConflictValidator().validate({
      ...conflict,
      involvedAgentIds: ["business-agent"],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: "$.involvedAgentIds",
        }),
      ]),
    );
  });

  it("keeps the matrix redaction-safe", () => {
    const serialized = JSON.stringify(DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX);
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

    const result = new ResponsibilityMatrixValidator().validate({
      ...DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
      prompt: "hidden prompt",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_content",
          path: "prompt",
        }),
      ]),
    );
  });
});

function validateWithArea(
  areaId: ResponsibilityAreaId,
  mutate: (area: ResponsibilityArea) => ResponsibilityArea,
) {
  const matrix = cloneMatrix();
  const index = areaIndex(matrix, areaId);
  const area = matrix.areas[index];
  if (area === undefined) {
    throw new Error(`missing area: ${areaId}`);
  }
  const areas = [...matrix.areas];
  areas[index] = mutate(area);
  return new ResponsibilityMatrixValidator().validate({
    ...matrix,
    areas,
  });
}

function areaById(areaId: ResponsibilityAreaId): ResponsibilityArea {
  const area = DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX.areas.find(
    (candidate) => candidate.areaId === areaId,
  );
  if (area === undefined) {
    throw new Error(`missing area: ${areaId}`);
  }
  return area;
}

function areaIndex(
  matrix: ResponsibilityMatrix,
  areaId: ResponsibilityAreaId,
): number {
  const index = matrix.areas.findIndex((candidate) => candidate.areaId === areaId);
  if (index < 0) {
    throw new Error(`missing area: ${areaId}`);
  }
  return index;
}

function primaryOwner(area: ResponsibilityArea) {
  const owner = area.primaryOwners[0];
  if (owner === undefined) {
    throw new Error(`missing owner: ${area.areaId}`);
  }
  return owner;
}

function cloneMatrix(): ResponsibilityMatrix {
  return structuredClone(DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX);
}
