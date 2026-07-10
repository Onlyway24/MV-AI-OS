import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  DEFAULT_FOUNDER_MISSION_BRIEF,
  DeterministicAgentCompanyReadinessEvaluator,
  DeterministicMissionPlanner,
  DeterministicMissionQualityGate,
  FOUNDER_MISSION_TYPES,
  FounderMissionBriefValidator,
  MISSION_QUALITY_GATE_CONTRACT_VERSION,
  MissionPlanValidator,
  type FounderMissionBrief,
  type FounderMissionType,
  type MissionPlan,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

interface PlanningScenario {
  readonly expectedAgents: readonly string[];
  readonly missionType: FounderMissionType;
  readonly qualityStatus: "APPROVAL_READY" | "REMEDIATION_REQUIRED";
  readonly totalScore: number;
}

const SCENARIOS: readonly PlanningScenario[] = [
  {
    expectedAgents: ["research-agent", "business-agent"],
    missionType: "business_opportunity",
    qualityStatus: "APPROVAL_READY",
    totalScore: 84,
  },
  {
    expectedAgents: ["customer-delivery-agent"],
    missionType: "customer_delivery_preparation",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 77,
  },
  {
    expectedAgents: ["developer-agent"],
    missionType: "internal_operations",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 77,
  },
  {
    expectedAgents: ["research-agent"],
    missionType: "market_research",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 81,
  },
  {
    expectedAgents: ["research-agent", "business-agent", "finance-cost-analyst"],
    missionType: "monetization_experiment",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 79,
  },
  {
    expectedAgents: ["research-agent", "business-agent"],
    missionType: "product_or_offer_design",
    qualityStatus: "APPROVAL_READY",
    totalScore: 84,
  },
  {
    expectedAgents: ["content-director"],
    missionType: "quality_improvement",
    qualityStatus: "APPROVAL_READY",
    totalScore: 82,
  },
  {
    expectedAgents: ["legal-risk-reviewer"],
    missionType: "risk_review",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 77,
  },
  {
    expectedAgents: ["developer-agent"],
    missionType: "software_development",
    qualityStatus: "REMEDIATION_REQUIRED",
    totalScore: 77,
  },
  {
    expectedAgents: ["content-director"],
    missionType: "content_strategy",
    qualityStatus: "APPROVAL_READY",
    totalScore: 83,
  },
];

describe("Mission Planning Scenario Lab", () => {
  it("starts from an Agent Company that is ready for non-executing planning", () => {
    const report = new DeterministicAgentCompanyReadinessEvaluator().evaluate(
      DEFAULT_AGENT_COMPANY_READINESS_INPUT,
    );

    expect(report.summary).toMatchObject({
      readinessScore: 100,
      status: "READY",
    });
    expect(report.findings).toEqual([]);
  });

  it.each(SCENARIOS)(
    "runs the $missionType scenario through validated planning and quality evaluation",
    ({ expectedAgents, missionType, qualityStatus, totalScore }) => {
      const brief = cloneBrief();
      brief.missionType = missionType;

      const briefValidation = new FounderMissionBriefValidator().validate(brief);
      expect(briefValidation.ok).toBe(true);

      const result = new DeterministicMissionPlanner().plan(brief);
      const plan = requirePlan(result.plan);
      const report = evaluate(plan);

      expect(result.status).toBe("PLAN_READY");
      expect(new MissionPlanValidator().validate(plan).ok).toBe(true);
      expect(plan.steps.map(({ primaryAgent }) => primaryAgent.agentId)).toEqual(expectedAgents);
      expect(plan.steps.every((step) => (
        step as unknown as { readonly nonExecuting: boolean }
      ).nonExecuting)).toBe(true);
      expect(plan.control.externalActionBoundary).toMatchObject({
        externalExecutionAllowed: false,
        nonExecuting: true,
      });
      expect(report.status).toBe(qualityStatus);
      expect(report.totalScore).toBe(totalScore);
      expect(report.releaseRecommendation).toBe(
        qualityStatus === "APPROVAL_READY"
          ? "APPROVE_FOR_FABIO_REVIEW"
          : "REMEDIATE_BEFORE_REVIEW",
      );
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(plan.steps)).toBe(true);
      expect(Object.isFrozen(report)).toBe(true);
      expect(Object.isFrozen(report.scores)).toBe(true);
    },
  );

  it("requests clarification before planning when a decision-blocking unknown exists", () => {
    const brief = cloneBrief();
    brief.unknowns = [
      {
        classification: "DECISION_BLOCKING",
        impact: "The answer changes the audience and offer decision.",
        topic: "Target audience",
        unknownId: "target-audience",
      },
    ];
    brief.clarificationQuestions = [
      {
        question: "Which audience must this mission serve?",
        questionId: "target-audience-question",
        sourceUnknownId: "target-audience",
        whyDecisionBlocking: "The answer changes the recommended direction.",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    expect(result.plan).toBeUndefined();
    expect(result.clarificationQuestions.map(({ sourceUnknownId }) => sourceUnknownId)).toEqual([
      "target-audience",
    ]);
  });

  it("continues with an explicit conservative assumption when the unknown is assumable", () => {
    const brief = cloneBrief();
    brief.unknowns = [
      {
        classification: "MATERIAL_BUT_ASSUMABLE",
        conservativeAssumption: "Assume a founder-operated small-business audience.",
        impact: "The audience changes tone but not the safety boundary.",
        topic: "Audience detail",
        unknownId: "audience-detail",
      },
    ];
    brief.assumptions = [
      {
        assumptionId: "audience-detail-assumption",
        rationale: "The conservative audience scope preserves safe progress.",
        sourceUnknownId: "audience-detail",
        statement: "Assume a founder-operated small-business audience.",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    const plan = requirePlan(result.plan);

    expect(result.status).toBe("PLAN_READY");
    expect(result.assumptions).toHaveLength(1);
    expect(plan.summary.confidence).toBe("medium");
    expect(evaluate(plan).scores.find(({ dimension }) => dimension === "evidence_uncertainty")?.score).toBe(8);
  });

  it("rejects a contradictory external-action request without exposing its contents", () => {
    const brief = cloneBrief();
    brief.constraints = [
      {
        constraintId: "publish-now",
        description: "Publish immediately.",
        kind: "non_negotiable",
      },
    ];
    brief.forbiddenActions = [
      {
        actionId: "no-publishing",
        category: "publishing",
        description: "Publish immediately.",
      },
    ];

    const result = new DeterministicMissionPlanner().plan(brief);
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionCodes).toContain("brief-contradiction");
    expect(JSON.stringify(result)).not.toContain("Publish immediately");
  });

  it("keeps a publication proposal non-executing and approval-controlled through quality evaluation", () => {
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
        purpose: "Prepare publication only for later Fabio review.",
        status: "proposal_only",
      },
    ];

    const plan = requirePlan(new DeterministicMissionPlanner().plan(brief).plan);
    const report = evaluate(plan);
    expect(plan.control.externalActionBoundary).toEqual({
      externalExecutionAllowed: false,
      nonExecuting: true,
      requestedActionTypes: ["publication"],
    });
    expect(plan.control.approvalQueue.flatMap(({ requiredFor }) => requiredFor)).toEqual(
      expect.arrayContaining(["external_side_effect", "publish_or_send"]),
    );
    expect(report.blockingDefects).toEqual([]);
    expect(report.status).toBe("APPROVAL_READY");
  });

  it("blocks a structurally valid plan when external commercial controls are removed", () => {
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
        purpose: "Prepare publication only for later Fabio review.",
        status: "proposal_only",
      },
    ];
    const unsafe = structuredClone(requirePlan(new DeterministicMissionPlanner().plan(brief).plan)) as DeepMutable<MissionPlan>;
    firstStep(unsafe).approvalRequirements = [];
    unsafe.control.approvalQueue = [
      {
        approvalId: "unrelated-approval",
        requiredFor: ["memory_write"],
        stepIds: [firstStep(unsafe).stepId],
      },
    ];

    expect(new MissionPlanValidator().validate(unsafe).ok).toBe(true);
    const report = evaluate(unsafe);
    expect(report.status).toBe("BLOCKED");
    expect(report.blockingDefects.map(({ code }) => code)).toEqual([
      "missing-external-side-effect-approval",
      "missing-publish-or-send-approval",
    ]);
  });

  it("keeps scenario outputs deterministic, redaction-safe, and non-executing", () => {
    const planner = new DeterministicMissionPlanner();
    const first = planner.plan(DEFAULT_FOUNDER_MISSION_BRIEF);
    const second = planner.plan(DEFAULT_FOUNDER_MISSION_BRIEF);
    const plan = requirePlan(first.plan);

    expect(first).toEqual(second);
    expect(evaluate(plan)).toEqual(evaluate(plan));
    expect(JSON.stringify({ plan, report: evaluate(plan) })).not.toMatch(
      /(?:sk-|api[_-]?key|secret|\/Users\/|\/home\/)/iu,
    );
    expect(plan.nonExecuting).toBe(true);
    expect(plan.steps.every((step) => (
      step as unknown as { readonly nonExecuting: boolean }
    ).nonExecuting)).toBe(true);
  });

  it("covers every declared Founder Mission type exactly once", () => {
    expect(SCENARIOS.map(({ missionType }) => missionType).sort()).toEqual(
      [...FOUNDER_MISSION_TYPES].sort(),
    );
  });
});

function cloneBrief(): DeepMutable<FounderMissionBrief> {
  return structuredClone(DEFAULT_FOUNDER_MISSION_BRIEF) as DeepMutable<FounderMissionBrief>;
}

function requirePlan(plan: MissionPlan | undefined): MissionPlan {
  if (plan === undefined) throw new Error("expected a plan-ready Mission Planning scenario");
  return plan;
}

function evaluate(plan: MissionPlan) {
  return new DeterministicMissionQualityGate().evaluate({
    contractVersion: MISSION_QUALITY_GATE_CONTRACT_VERSION,
    plan,
  });
}

function firstStep(plan: DeepMutable<MissionPlan>): DeepMutable<MissionPlan["steps"][number]> {
  const step = plan.steps[0];
  if (step === undefined) throw new Error("expected a Mission Plan step");
  return step;
}
