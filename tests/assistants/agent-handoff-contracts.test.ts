import { describe, expect, it } from "vitest";

import {
  AGENT_HANDOFF_IDS,
  AGENT_HANDOFF_TYPES,
  DEFAULT_AGENT_COMPANY_MAP,
  DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT,
  DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
  AgentHandoffContractSetValidator,
  AgentHandoffRequestValidator,
  AgentHandoffResultValidator,
  type AgentHandoffContractSet,
  type AgentHandoffEvidenceQuality,
  type AgentHandoffId,
  type AgentHandoffRequest,
  type AgentHandoffUncertaintyLevel,
  type ValidationResult,
} from "../../src/index.js";

const RESTAURANT_CHAIN_HANDOFF_IDS = [
  "research_to_business_strategy-handoff",
  "business_to_content_strategy-handoff",
  "content_to_legal_risk_review-handoff",
  "content_to_publishing_preparation-handoff",
  "business_to_sales_preparation-handoff",
  "customer_delivery_to_fabio_approval_package-handoff",
] as const satisfies readonly AgentHandoffId[];

describe("Agent Communication / Handoff Contracts", () => {
  it("accepts the valid deterministic handoff contract set", () => {
    expect(
      new AgentHandoffContractSetValidator().validate(
        DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
      ),
    ).toEqual({
      ok: true,
      value: DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
    });
  });

  it("accepts an individual valid handoff request", () => {
    const request = handoffById("research_to_business_strategy-handoff");

    expect(new AgentHandoffRequestValidator().validate(request)).toEqual({
      ok: true,
      value: request,
    });
  });

  it("accepts a valid non-executing handoff result", () => {
    expect(
      new AgentHandoffResultValidator().validate(
        DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT,
      ),
    ).toEqual({
      ok: true,
      value: DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT,
    });
  });

  it("covers every supported handoff type and deterministic ID", () => {
    expect(DEFAULT_AGENT_HANDOFF_CONTRACT_SET.handoffs.map(({ handoffType }) => handoffType)).toEqual(
      AGENT_HANDOFF_TYPES,
    );
    expect(DEFAULT_AGENT_HANDOFF_CONTRACT_SET.handoffs.map(({ handoffId }) => handoffId)).toEqual(
      AGENT_HANDOFF_IDS,
    );
  });

  it("uses known source and target roles with exact AgentSpecification references", () => {
    for (const handoff of DEFAULT_AGENT_HANDOFF_CONTRACT_SET.handoffs) {
      expect(roleIds()).toContain(handoff.source.agentId);
      expect(roleIds()).toContain(handoff.target.agentId);
      expect(handoff.source.agentId).not.toBe(handoff.target.agentId);
      expect(handoff.source.specificationId).toBe(
        roleSpec(handoff.source.agentId).specificationId,
      );
      expect(handoff.source.version).toBe(roleSpec(handoff.source.agentId).version);
      expect(handoff.target.specificationId).toBe(
        roleSpec(handoff.target.agentId).specificationId,
      );
      expect(handoff.target.version).toBe(roleSpec(handoff.target.agentId).version);
    }
  });

  it("rejects a handoff where source and target are the same role", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      target: handoff.source,
    }));

    expectIssue(result, "forbidden_handoff");
  });

  it("rejects an unknown source role", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      source: {
        ...handoff.source,
        agentId: "unknown-agent",
      },
    }));

    expectIssue(result, "invalid_value", "handoffs[0].source.agentId");
  });

  it("rejects an unknown target role", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      target: {
        ...handoff.target,
        agentId: "unknown-agent",
      },
    }));

    expectIssue(result, "invalid_value", "handoffs[0].target.agentId");
  });

  it("rejects an unknown handoff type", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      handoffId: "unknown-handoff",
      handoffType: "unknown_handoff_type",
    }));

    expectIssue(result, "invalid_value", "handoffs[0].handoffType");
  });

  it("rejects duplicate handoff IDs", () => {
    const set = mutableCloneSet();
    const first = set.handoffs[0];
    const second = set.handoffs[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing handoff fixture");
    }
    set.handoffs[1] = {
      ...second,
      handoffId: first.handoffId,
    };

    expectIssue(validateSet(set), "duplicate", "handoffs");
  });

  it("rejects unknown responsibility mappings", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      relatedResponsibilityAreaIds: ["unknown-area"],
    }));

    expectIssue(result, "invalid_value", "handoffs[0].relatedResponsibilityAreaIds[0]");
  });

  it("rejects unknown capabilities", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      relatedCapabilityIds: ["unknown-capability"],
    }));

    expectIssue(result, "invalid_value", "handoffs[0].relatedCapabilityIds[0]");
  });

  it("rejects unknown permission rules", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      relatedPermissionRuleIds: ["unknown-permission"],
    }));

    expectIssue(result, "invalid_value", "handoffs[0].relatedPermissionRuleIds[0]");
  });

  it("rejects permission rules that do not align with related capabilities", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      relatedPermissionRuleIds: ["content-strategy-permission"],
    }));

    expectIssue(result, "missing_capability", "handoffs[0].relatedPermissionRuleIds");
  });

  it("rejects approval-sensitive handoffs without Fabio approval requirements", () => {
    const result = validateWithHandoff("content_to_publishing_preparation-handoff", (handoff) => ({
      ...handoff,
      approvalRequired: false,
      approvalRequirements: [],
    }));

    expectIssue(result, "approval_requirement_missing");
  });

  it("rejects guardian-sensitive handoffs without guardian requirements", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      guardianRequired: false,
      guardianRequirements: [],
    }));

    expectIssue(result, "guardian_requirement_missing");
  });

  it("keeps publishing preparation approval-gated", () => {
    const handoff = handoffById("content_to_publishing_preparation-handoff");

    expect(handoff.approvalRequired).toBe(true);
    expect(handoff.approvalRequirements[0]?.requiredFor).toContain("publish_or_send");
    expect(handoff.futureTool.approvalSensitive).toBe(true);
    expect(handoff.futureTool.nonExecuting).toBe(true);
  });

  it("keeps sales preparation approval-gated before outreach", () => {
    const handoff = handoffById("business_to_sales_preparation-handoff");

    expect(handoff.approvalRequired).toBe(true);
    expect(handoff.approvalRequirements[0]?.requiredFor).toContain("publish_or_send");
    expect(handoff.futureTool.toolCategory).toBe("sales_material_preparation");
    expect(handoff.futureTool.nonExecuting).toBe(true);
  });

  it("keeps customer delivery approval packages approval-gated before sending", () => {
    const handoff = handoffById("customer_delivery_to_fabio_approval_package-handoff");

    expect(handoff.approvalRequired).toBe(true);
    expect(handoff.approvalRequirements[0]?.requiredFor).toContain("publish_or_send");
    expect(handoff.expectedOutput.outputKind).toBe("approval_package");
    expect(handoff.futureWorkflow.nonExecuting).toBe(true);
  });

  it("rejects finance handoffs that imply payment or budget mutation", () => {
    const result = validateWithHandoff("business_to_pricing_review-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A finance note that will spend money and change budgets.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects binding legal advice or final compliance approval language", () => {
    const result = validateWithHandoff("content_to_legal_risk_review-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A review that provides binding legal advice and final compliance approval.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects direct tool execution language", () => {
    const result = validateWithHandoff("developer_to_knowledge_curation-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A handoff that may execute tool calls.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects model or provider call language", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A handoff that will call models and providers.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects workflow execution language", () => {
    const result = validateWithHandoff("business_to_content_strategy-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A handoff that can execute workflow steps.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects filesystem or network mutation language", () => {
    const result = validateWithHandoff("developer_to_knowledge_curation-handoff", (handoff) => ({
      ...handoff,
      expectedOutput: {
        ...handoff.expectedOutput,
        description: "A handoff that can mutate filesystem and network state.",
      },
    }));

    expectIssue(result, "unsafe_handoff");
  });

  it("rejects raw prompt, completion, secret, provider payload, and path leakage", () => {
    const result = validateWithHandoff("research_to_business_strategy-handoff", (handoff) => ({
      ...handoff,
      payloadSummary: {
        ...handoff.payloadSummary,
        summary:
          "Unsafe raw prompt, raw completion, providerPayload, sk-test-secret, and /Users/fabio/private/path.",
      },
    }));

    expectIssue(result, "sensitive_content");
  });

  it("supports the sanitized restaurant offer handoff chain", () => {
    const chain = RESTAURANT_CHAIN_HANDOFF_IDS.map(handoffById);

    expect(chain.map(({ handoffId }) => handoffId)).toEqual(
      RESTAURANT_CHAIN_HANDOFF_IDS,
    );
    for (const handoff of chain) {
      expect(new AgentHandoffRequestValidator().validate(handoff).ok).toBe(true);
      expect(handoff.nonExecuting).toBe(true);
      expect(handoff.payloadSummary.summary).not.toMatch(
        /raw prompt|raw completion|providerPayload|secret|\/Users\//iu,
      );
    }
  });

  it("captures competitor positioning for the local restaurant scenario", () => {
    const handoff = handoffById("research_to_business_strategy-handoff");

    expect(handoff.payloadSummary.marketInsightSummary?.competitorSummary).toContain(
      "Competitors",
    );
    expect(handoff.payloadSummary.marketInsightSummary?.competitorSummary).not.toMatch(
      /scraped|private|raw/iu,
    );
  });

  it("captures local trends for the restaurant scenario", () => {
    const handoff = handoffById("research_to_market_opportunity-handoff");

    expect(handoff.payloadSummary.marketInsightSummary?.localTrendSummary).toContain(
      "Local restaurant operators",
    );
  });

  it("captures restaurant owner pain points for the restaurant scenario", () => {
    const handoff = handoffById("research_to_customer_pain_points-handoff");

    expect(handoff.payloadSummary.marketInsightSummary?.restaurantPainPoints).toEqual(
      expect.arrayContaining([
        "Limited time for content",
        "Manual customer communication",
      ]),
    );
  });

  it("captures market weak points for the restaurant scenario", () => {
    const handoff = handoffById("research_to_competitor_positioning-handoff");

    expect(handoff.payloadSummary.marketInsightSummary?.marketWeaknessSummary).toContain(
      "Few offers",
    );
  });

  it("captures opportunity gaps and recommended business decision", () => {
    const handoff = handoffById("research_to_business_strategy-handoff");

    expect(handoff.payloadSummary.opportunitySummary?.opportunityGaps).toEqual(
      expect.arrayContaining([
        "Simple AI assistant package for menu content",
      ]),
    );
    expect(
      handoff.payloadSummary.opportunitySummary?.recommendedNextBusinessQuestion,
    ).toContain("first paid offer");
  });

  it("captures evidence quality and uncertainty explicitly", () => {
    const handoff = handoffById("research_to_business_strategy-handoff");

    expect(handoff.payloadSummary.evidenceSummary.evidenceQuality).toBe(
      "medium" satisfies AgentHandoffEvidenceQuality,
    );
    expect(handoff.payloadSummary.evidenceSummary.uncertaintyLevel).toBe(
      "medium" satisfies AgentHandoffUncertaintyLevel,
    );
    expect(handoff.payloadSummary.evidenceSummary.uncertaintyNotes.length).toBeGreaterThan(0);
  });

  it("rejects non-deterministic handoff ordering", () => {
    const set = mutableCloneSet();
    const first = set.handoffs[0];
    const second = set.handoffs[1];
    if (first === undefined || second === undefined) {
      throw new Error("missing handoff fixture");
    }
    set.handoffs[0] = second;
    set.handoffs[1] = first;

    expectIssue(validateSet(set), "not_deterministic", "handoffs");
  });

  it("keeps the default contract set deeply immutable", () => {
    const handoff = handoffById("research_to_business_strategy-handoff");

    expect(Object.isFrozen(DEFAULT_AGENT_HANDOFF_CONTRACT_SET)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AGENT_HANDOFF_CONTRACT_SET.handoffs)).toBe(true);
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff.payloadSummary)).toBe(true);
    expect(Object.isFrozen(handoff.payloadSummary.businessContext.assumptions)).toBe(true);
  });

  it("requires handoff results to remain non-executing", () => {
    const result = new AgentHandoffResultValidator().validate({
      ...DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT,
      nonExecuting: false,
    });

    expectIssue(result, "unsafe_handoff");
  });
});

type MutableHandoffRequest = {
  -readonly [Property in keyof AgentHandoffRequest]: AgentHandoffRequest[Property];
};

type MutableHandoffContractSet = {
  -readonly [Property in keyof AgentHandoffContractSet]: Property extends "handoffs"
    ? MutableHandoffRequest[]
    : AgentHandoffContractSet[Property];
};

function validateSet(
  value: unknown,
): ValidationResult<AgentHandoffContractSet> {
  return new AgentHandoffContractSetValidator().validate(value);
}

function mutableCloneSet(): MutableHandoffContractSet {
  return structuredClone(
    DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
  ) as MutableHandoffContractSet;
}

function validateWithHandoff(
  handoffId: AgentHandoffId,
  mutate: (handoff: AgentHandoffRequest) => unknown,
): ValidationResult<AgentHandoffContractSet> {
  const set = mutableCloneSet();
  const index = set.handoffs.findIndex((handoff) => handoff.handoffId === handoffId);
  const handoff = set.handoffs[index];
  if (index < 0 || handoff === undefined) {
    throw new Error(`unknown handoff fixture: ${handoffId}`);
  }
  set.handoffs[index] = mutate(handoff) as MutableHandoffRequest;
  return validateSet(set);
}

function handoffById(handoffId: AgentHandoffId): AgentHandoffRequest {
  const handoff = DEFAULT_AGENT_HANDOFF_CONTRACT_SET.handoffs.find(
    (candidate) => candidate.handoffId === handoffId,
  );
  if (handoff === undefined) {
    throw new Error(`unknown handoff fixture: ${handoffId}`);
  }
  return handoff;
}

function expectIssue(
  result:
    | ValidationResult<AgentHandoffContractSet>
    | ValidationResult<AgentHandoffRequest>
    | ValidationResult<typeof DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT>,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  const issues = result.ok ? [] : result.issues;
  expect(issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        ...(path === undefined ? {} : { path }),
      }),
    ]),
  );
}

function roleIds(): readonly string[] {
  return DEFAULT_AGENT_COMPANY_MAP.roles.map(({ roleId }) => roleId);
}

function roleSpec(agentId: string): {
  readonly specificationId: string;
  readonly version: string;
} {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    ({ roleId }) => roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`unknown role fixture: ${agentId}`);
  }
  return role.futureAgentSpecification;
}
