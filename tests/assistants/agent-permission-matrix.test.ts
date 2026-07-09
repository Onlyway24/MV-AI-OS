import { describe, expect, it } from "vitest";

import {
  AGENT_COMPANY_CAPABILITY_IDS,
  AGENT_COMPANY_PERMISSION_RULE_IDS,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  DEFAULT_AGENT_COMPANY_MAP,
  DEFAULT_AGENT_PERMISSION_MATRIX,
  EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
  INITIAL_CORE_AGENT_SPECIFICATIONS,
  AgentCompanyPermissionMatrixValidator,
  AgentCompanyPermissionRuleValidator,
  type AgentCompanyPermissionMatrix,
  type AgentCompanyPermissionRule,
  type AgentCompanyPermissionRuleId,
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

describe("Agent Permission Matrix", () => {
  it("accepts the valid deterministic permission matrix", () => {
    expect(
      new AgentCompanyPermissionMatrixValidator().validate(
        DEFAULT_AGENT_PERMISSION_MATRIX,
      ),
    ).toEqual({
      ok: true,
      value: DEFAULT_AGENT_PERMISSION_MATRIX,
    });
  });

  it("validates individual permission rules", () => {
    const rule = ruleById("offer-design-permission");

    expect(new AgentCompanyPermissionRuleValidator().validate(rule)).toEqual({
      ok: true,
      value: rule,
    });
  });

  it("covers every current Agent Company role", () => {
    expect(DEFAULT_AGENT_PERMISSION_MATRIX.roleBoundaries.map(({ role }) => role.agentId)).toEqual(
      EXPECTED_ROLE_IDS,
    );
  });

  it("gives every current role allowed permission declarations", () => {
    for (const boundary of DEFAULT_AGENT_PERMISSION_MATRIX.roleBoundaries) {
      expect(boundary.allowedPermissionIds.length).toBeGreaterThan(0);
    }
  });

  it("gives every current role forbidden actions", () => {
    for (const boundary of DEFAULT_AGENT_PERMISSION_MATRIX.roleBoundaries) {
      expect(boundary.forbiddenActions.length).toBeGreaterThan(0);
    }
  });

  it("maps every capability to one permission rule", () => {
    expect(DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules.map(({ capabilityId }) => capabilityId)).toEqual(
      AGENT_COMPANY_CAPABILITY_IDS,
    );
    expect(DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules.map(({ permissionId }) => permissionId)).toEqual(
      AGENT_COMPANY_PERMISSION_RULE_IDS,
    );
  });

  it("maps permission subjects to Agent Company roles and exact AgentSpecification IDs", () => {
    const specificationKeys = new Set(
      [
        ...INITIAL_CORE_AGENT_SPECIFICATIONS,
        ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
      ].map(({ agentId, version }) => `${agentId}@${version}`),
    );

    for (const rule of DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules) {
      const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
        ({ roleId }) => roleId === rule.subject.agentId,
      );
      const capability = DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.find(
        ({ capabilityId }) => capabilityId === rule.capabilityId,
      );

      expect(role).toBeDefined();
      expect(capability).toBeDefined();
      expect(rule.subject.agentId).toBe(capability?.primaryOwners[0]?.agentId);
      expect(rule.subject.specificationId).toBe(
        role?.futureAgentSpecification.specificationId,
      );
      expect(rule.subject.version).toBe(role?.futureAgentSpecification.version);
      expect(specificationKeys.has(`${rule.subject.agentId}@${rule.subject.version}`)).toBe(true);
    }
  });

  it("rejects unknown agents", () => {
    const result = validateWithRule("source-research-permission", (rule) => ({
      ...rule,
      subject: {
        ...rule.subject,
        agentId: "unknown-agent" as AgentCompanyRoleId,
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          path: "permissionRules[0].subject.agentId",
        }),
      ]),
    );
  });

  it("rejects missing agent coverage", () => {
    const base = cloneMatrix();
    const result = validateMatrix({
      ...base,
      roleBoundaries: base.roleBoundaries.slice(1),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "roleBoundaries",
        }),
      ]),
    );
  });

  it("rejects duplicate permission IDs", () => {
    const base = cloneMatrix();
    const first = base.permissionRules[0];
    const second = base.permissionRules[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing permission rules");
    }

    const result = validateMatrix({
      ...base,
      permissionRules: [
        first,
        {
          ...second,
          permissionId: first.permissionId,
        },
        ...base.permissionRules.slice(2),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate",
          path: "permissionRules",
        }),
      ]),
    );
  });

  it("rejects direct execution permission wording", () => {
    const result = validateWithRule("implementation-planning-permission", (rule) =>
      withActionDescription(rule, "This declaration can execute workflow steps."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects autonomous execution permission wording", () => {
    const result = validateWithRule("mission-planning-support-permission", (rule) =>
      withActionDescription(rule, "Allow autonomous execution for future planning."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects model, provider, or tool execution permission wording", () => {
    const result = validateWithRule("technical-architecture-support-permission", (rule) =>
      withActionDescription(rule, "This may call models, providers, and execute tools."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects filesystem or network mutation permission wording", () => {
    const result = validateWithRule("code-change-planning-permission", (rule) =>
      withActionDescription(rule, "This can mutate filesystem and network state."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects publishing permissions without Fabio approval", () => {
    const result = validateWithRule("publishing-preparation-permission", (rule) => ({
      ...rule,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "permissionRules[22].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects sales outreach permissions without Fabio approval", () => {
    const result = validateWithRule("outreach-preparation-permission", (rule) => ({
      ...rule,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "permissionRules[27].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects external communication permissions without Fabio approval", () => {
    const result = validateWithRule("approval-ready-sales-handoff-permission", (rule) => ({
      ...rule,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "permissionRules[29].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects customer delivery sending permissions without Fabio approval", () => {
    const result = validateWithRule("delivery-preparation-permission", (rule) => ({
      ...rule,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "permissionRules[39].approvalRequired",
        }),
      ]),
    );
  });

  it("rejects spending, payment, or budget mutation permission wording", () => {
    const result = validateWithRule("cost-estimation-permission", (rule) =>
      withActionDescription(rule, "This may spend money and execute payment."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects binding legal advice or final compliance approval wording", () => {
    const result = validateWithRule("compliance-sensitive-review-permission", (rule) =>
      withActionDescription(rule, "Provide binding legal advice and final compliance approval."),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsafe_permission" }),
      ]),
    );
  });

  it("rejects guardian-sensitive permissions without guardian requirements", () => {
    const result = validateWithRule("technical-architecture-support-permission", (rule) => ({
      ...rule,
      guardianRequired: false,
      guardianRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "guardian_requirement_missing",
          path: "permissionRules[15].guardianRequired",
        }),
      ]),
    );
  });

  it("rejects approval-sensitive permissions without approval requirements", () => {
    const result = validateWithRule("approval-ready-publishing-handoff-permission", (rule) => ({
      ...rule,
      approvalRequired: true,
      approvalRequirements: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_requirement_missing",
          path: "permissionRules[25].approvalRequirements",
        }),
      ]),
    );
  });

  it("rejects future tool mappings unless explicitly non-executing", () => {
    const result = validateWithRule("source-research-permission", (rule) => ({
      ...rule,
      futureTool: {
        ...rule.futureTool,
        nonExecuting: false,
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe_permission",
          path: "permissionRules[0].futureTool.nonExecuting",
        }),
      ]),
    );
  });

  it("rejects non-deterministic permission ordering", () => {
    const base = cloneMatrix();
    const first = base.permissionRules[0];
    const second = base.permissionRules[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing permission rules");
    }

    const result = validateMatrix({
      ...base,
      permissionRules: [
        second,
        first,
        ...base.permissionRules.slice(2),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "not_deterministic",
          path: "permissionRules",
        }),
      ]),
    );
  });

  it("exposes an immutable default matrix", () => {
    const firstBoundary = DEFAULT_AGENT_PERMISSION_MATRIX.roleBoundaries[0];
    const firstRule = DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules[0];
    if (firstBoundary === undefined || firstRule === undefined) {
      throw new Error("missing matrix entries");
    }

    expect(Object.isFrozen(DEFAULT_AGENT_PERMISSION_MATRIX)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AGENT_PERMISSION_MATRIX.roleBoundaries)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules)).toBe(true);
    expect(Object.isFrozen(firstBoundary)).toBe(true);
    expect(Object.isFrozen(firstRule)).toBe(true);
  });

  it("rejects sensitive raw text and provider payload leakage", () => {
    const result = validateWithRule("source-research-permission", (rule) =>
      withActionDescription(
        rule,
        "Contains raw prompt text, providerPayload details, and sk-test-secret.",
      ),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "sensitive_content",
          path: "permissionRules[0].allowedActions[0].description",
        }),
      ]),
    );
  });
});

function validateMatrix(value: unknown) {
  return new AgentCompanyPermissionMatrixValidator().validate(value);
}

function validateWithRule(
  permissionId: AgentCompanyPermissionRuleId,
  mutate: (rule: AgentCompanyPermissionRule) => unknown,
) {
  const base = cloneMatrix();
  return validateMatrix({
    ...base,
    permissionRules: base.permissionRules.map((rule) =>
      rule.permissionId === permissionId ? mutate(rule) : rule,
    ),
  });
}

function withActionDescription(
  rule: AgentCompanyPermissionRule,
  description: string,
) {
  const action = rule.allowedActions[0];
  if (action === undefined) {
    throw new Error("missing allowed action");
  }

  return {
    ...rule,
    allowedActions: [
      {
        ...action,
        description,
      },
      ...rule.allowedActions.slice(1),
    ],
  };
}

function ruleById(
  permissionId: AgentCompanyPermissionRuleId,
): AgentCompanyPermissionRule {
  const rule = DEFAULT_AGENT_PERMISSION_MATRIX.permissionRules.find(
    (candidate) => candidate.permissionId === permissionId,
  );
  if (rule === undefined) {
    throw new Error(`missing permission rule ${permissionId}`);
  }
  return rule;
}

function cloneMatrix(): AgentCompanyPermissionMatrix {
  return structuredClone(DEFAULT_AGENT_PERMISSION_MATRIX);
}
