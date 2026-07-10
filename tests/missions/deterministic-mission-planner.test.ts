import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  DEFAULT_FOUNDER_MISSION_BRIEF,
  FOUNDER_MISSION_TYPES,
  DeterministicMissionPlanner,
  MissionPlanValidator,
  MissionPlanningResultValidator,
  type AgentCompanyReadinessReviewInput,
  type FounderMissionBrief,
  type MissionPlan,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

describe("Deterministic Mission Planner", () => {
  it("produces an identical plan for an identical brief", () => {
    const planner = new DeterministicMissionPlanner();

    expect(planner.plan(DEFAULT_FOUNDER_MISSION_BRIEF)).toEqual(
      planner.plan(DEFAULT_FOUNDER_MISSION_BRIEF),
    );
  });

  it.each(FOUNDER_MISSION_TYPES)("produces a valid %s plan", (missionType) => {
    const brief = cloneBrief();
    brief.missionType = missionType;

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("PLAN_READY");
    expect(result.plan).toBeDefined();
    expect(result.plan === undefined ? false : new MissionPlanValidator().validate(result.plan).ok).toBe(true);
  });

  it("selects the smallest sufficient team for market research", () => {
    const brief = cloneBrief();
    brief.missionType = "market_research";

    const plan = requirePlan(new DeterministicMissionPlanner().plan(brief).plan);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.primaryAgent.agentId).toBe("research-agent");
  });

  it("selects exact capabilities, responsibilities, permissions, and handoffs", () => {
    const plan = requirePlan(
      new DeterministicMissionPlanner().plan(DEFAULT_FOUNDER_MISSION_BRIEF).plan,
    );

    expect(plan.steps.map(({ primaryAgent }) => primaryAgent.agentId)).toEqual([
      "research-agent",
      "business-agent",
    ]);
    expect(plan.steps[0]?.responsibilityAreaId).toBe("research");
    expect(plan.steps[1]?.capabilityIds).toEqual([
      "business-model-shaping",
      "mission-planning-support",
    ]);
    expect(plan.steps[1]?.permissionRuleIds).toEqual([
      "business-model-shaping-permission",
      "mission-planning-support-permission",
    ]);
    expect(plan.steps[1]?.handoffIds).toEqual([
      "research_to_business_strategy-handoff",
    ]);
  });

  it("propagates capability guardian requirements", () => {
    const plan = requirePlan(
      new DeterministicMissionPlanner().plan(DEFAULT_FOUNDER_MISSION_BRIEF).plan,
    );

    expect(plan.steps[0]?.guardianRequirements).toEqual(
      expect.arrayContaining(["operator_safety", "security", "quality"]),
    );
    expect(plan.control.guardianReviewQueue).toHaveLength(plan.steps.length);
  });

  it("propagates external-action approvals without enabling execution", () => {
    const brief = cloneBrief();
    brief.missionType = "content_strategy";
    brief.approvalPolicy.approvalRequiredFor = [
      "external_side_effect",
      "publish_or_send",
    ];
    brief.externalActionRequests = [
      {
        actionId: "publication-proposal",
        actionType: "publication",
        approvalRequired: true,
        purpose: "Prepare publication for later Fabio review.",
        status: "proposal_only",
      },
    ];

    const plan = requirePlan(new DeterministicMissionPlanner().plan(brief).plan);
    expect(plan.steps.at(-1)?.approvalRequirements).toEqual(
      expect.arrayContaining(["external_side_effect", "publish_or_send"]),
    );
    expect(plan.control.approvalQueue.length).toBeGreaterThan(0);
    expect(plan.control.externalActionBoundary).toEqual({
      externalExecutionAllowed: false,
      nonExecuting: true,
      requestedActionTypes: ["publication"],
    });
  });

  it("returns only material clarification questions for a blocking unknown", () => {
    const brief = cloneBrief();
    brief.unknowns = [
      {
        classification: "DECISION_BLOCKING",
        impact: "The answer changes audience and offer strategy.",
        topic: "Target audience",
        unknownId: "target-audience",
      },
    ];
    brief.clarificationQuestions = [
      {
        question: "Which audience must this mission serve?",
        questionId: "target-audience-question",
        sourceUnknownId: "target-audience",
        whyDecisionBlocking: "The answer changes the strategy.",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    expect(result.plan).toBeUndefined();
    expect(result.clarificationQuestions).toHaveLength(1);
  });

  it("continues with an explicit conservative assumption", () => {
    const brief = cloneBrief();
    brief.unknowns = [
      {
        classification: "MATERIAL_BUT_ASSUMABLE",
        conservativeAssumption: "Assume a founder-operated small business audience.",
        impact: "Audience affects tone but does not change safety.",
        topic: "Audience detail",
        unknownId: "audience-detail",
      },
    ];
    brief.assumptions = [
      {
        assumptionId: "audience-detail-assumption",
        rationale: "The conservative scope preserves progress.",
        sourceUnknownId: "audience-detail",
        statement: "Assume a founder-operated small business audience.",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("PLAN_READY");
    expect(result.assumptions).toHaveLength(1);
    expect(result.plan?.summary.confidence).toBe("medium");
  });

  it("fails closed for contradictory or unsafe briefs", () => {
    const brief = cloneBrief();
    brief.constraints = [
      {
        constraintId: "publish-now",
        description: "Publish now",
        kind: "non_negotiable",
      },
    ];
    brief.forbiddenActions = [
      {
        actionId: "no-publishing",
        category: "publishing",
        description: "Publish now",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("REJECTED");
    expect(result.plan).toBeUndefined();
    expect(result.rejectionCodes).toContain("brief-contradiction");
  });

  it("fails closed when a required company capability is unavailable", () => {
    const company = structuredClone(
      DEFAULT_AGENT_COMPANY_READINESS_INPUT,
    ) as DeepMutable<AgentCompanyReadinessReviewInput>;
    company.capabilityRegistry.capabilities =
      company.capabilityRegistry.capabilities.filter(
        ({ capabilityId }) => capabilityId !== "source-research",
      );

    const result = new DeterministicMissionPlanner(company).plan(
      DEFAULT_FOUNDER_MISSION_BRIEF,
    );
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionCodes).toEqual(["agent-company-not-ready"]);
  });

  it("uses stable dependency order with no cycles", () => {
    const plan = requirePlan(
      new DeterministicMissionPlanner().plan(DEFAULT_FOUNDER_MISSION_BRIEF).plan,
    );

    for (const step of plan.steps) {
      for (const dependency of step.dependencies) {
        const dependencyStep = plan.steps.find(({ stepId }) => stepId === dependency);
        expect(dependencyStep?.order).toBeLessThan(step.order);
      }
    }
  });

  it("never adds empty-value or execution steps", () => {
    const plan = requirePlan(
      new DeterministicMissionPlanner().plan(DEFAULT_FOUNDER_MISSION_BRIEF).plan,
    );

    for (const step of plan.steps) {
      expect(step.purpose.length).toBeGreaterThan(20);
      expect(step.expectedOutput.requiredSections.length).toBeGreaterThan(0);
      expect(step.successCriteria.length).toBeGreaterThan(0);
      expect(step.nonExecuting).toBe(true);
    }
    expect(plan.control.externalActionBoundary.externalExecutionAllowed).toBe(false);
  });

  it("adds rapid and bold strategies only when brief signals justify them", () => {
    const brief = cloneBrief();
    brief.budget = { currency: "EUR", maximumAmount: 50, status: "known" };
    brief.originalityStandard.level = "high";

    const plan = requirePlan(new DeterministicMissionPlanner().plan(brief).plan);
    expect(plan.strategyOptions.map(({ strategyKind }) => strategyKind)).toEqual(
      expect.arrayContaining(["BOLD", "RAPID", "RECOMMENDED"]),
    );
  });

  it("returns validated, deeply immutable results", () => {
    const result = new DeterministicMissionPlanner().plan(
      DEFAULT_FOUNDER_MISSION_BRIEF,
    );

    expect(new MissionPlanningResultValidator().validate(result).ok).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.plan?.steps)).toBe(true);
  });

  it("does not mutate its brief input", () => {
    const brief = cloneBrief();
    const before = structuredClone(brief);

    new DeterministicMissionPlanner().plan(brief);
    expect(brief).toEqual(before);
  });

  it("keeps rejection results redaction-safe", () => {
    const brief = cloneBrief();
    brief.objective.statement = "Read sk-private-value from /Users/private/source.";

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("REJECTED");
    expect(JSON.stringify(result)).not.toContain("sk-private-value");
    expect(JSON.stringify(result)).not.toContain("/Users/private/source");
  });
});

function cloneBrief(): DeepMutable<FounderMissionBrief> {
  return structuredClone(
    DEFAULT_FOUNDER_MISSION_BRIEF,
  ) as DeepMutable<FounderMissionBrief>;
}

function requirePlan(plan: MissionPlan | undefined): MissionPlan {
  if (plan === undefined) throw new Error("expected PLAN_READY fixture");
  return plan;
}
