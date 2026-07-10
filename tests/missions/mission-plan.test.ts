import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  DEFAULT_MISSION_PLAN,
  MissionPlanValidator,
  type AgentCompanyReadinessReviewInput,
  type MissionPlan,
  type MissionPlanStep,
  type OperatorMissionPlanCandidate,
  type ValidationResult,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

describe("Mission Plan Contracts", () => {
  it("accepts the complete non-executing default plan", () => {
    const result = validate(DEFAULT_MISSION_PLAN);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.nonExecuting : false).toBe(true);
  });

  it("accepts materially distinct rapid and bold options", () => {
    const plan = clonePlan();
    plan.strategyOptions.push(
      {
        compromises: ["Lower evidence depth."],
        description: "Produce a narrower validation decision with one research question.",
        optionId: "rapid-narrow-validation",
        strategyKind: "RAPID",
        valueRationale: "Reduces time and cost while preserving a bounded decision.",
      },
      {
        compromises: ["Higher evidence and review effort."],
        description: "Test a differentiated opportunity against two alternative baselines.",
        optionId: "bold-differentiated-validation",
        strategyKind: "BOLD",
        valueRationale: "May create stronger differentiation if evidence supports it.",
      },
    );
    plan.strategyOptions.sort((left, right) => left.optionId.localeCompare(right.optionId));

    expect(validate(plan).ok).toBe(true);
  });

  it("rejects an unknown or mismatched primary agent", () => {
    const plan = clonePlan();
    step(plan, 0).primaryAgent.agentId = "unknown-agent" as "research-agent";

    expectIssue(validate(plan), "not_found", "steps[0].primaryAgent");
  });

  it("rejects responsibility ownership mismatch", () => {
    const plan = clonePlan();
    step(plan, 0).responsibilityAreaId = "business-strategy";

    expectIssue(validate(plan), "ownership_mismatch", "steps[0].primaryAgent");
  });

  it("rejects missing and unowned capabilities", () => {
    const missing = clonePlan();
    step(missing, 0).capabilityIds = ["missing-capability" as "source-research"];
    expectIssue(validate(missing), "not_found", "steps[0].capabilityIds");

    const unowned = clonePlan();
    step(unowned, 0).capabilityIds = ["business-model-shaping"];
    step(unowned, 0).permissionRuleIds = ["business-model-shaping-permission"];
    expectIssue(validate(unowned), "ownership_mismatch", "steps[0].capabilityIds");
  });

  it("rejects missing or mismatched permission coverage", () => {
    const plan = clonePlan();
    step(plan, 0).permissionRuleIds = ["business-model-shaping-permission"];

    expectIssue(validate(plan), "permission_mismatch", "steps[0].permissionRuleIds");
    expectIssue(validate(plan), "permission_required", "steps[0].permissionRuleIds");
  });

  it("rejects an invalid handoff", () => {
    const plan = clonePlan();
    step(plan, 1).handoffIds = ["business_to_content_strategy-handoff"];

    expectIssue(validate(plan), "ownership_mismatch", "steps[1].handoffIds");
  });

  it("rejects duplicate step IDs", () => {
    const plan = clonePlan();
    step(plan, 1).stepId = step(plan, 0).stepId;

    expectIssue(validate(plan), "duplicate", "steps");
  });

  it("rejects missing dependencies", () => {
    const plan = clonePlan();
    step(plan, 1).dependencies = ["missing-step"];

    expectIssue(validate(plan), "not_found", "steps.02-business-decision.dependencies");
  });

  it("rejects dependency cycles or forward dependencies", () => {
    const plan = clonePlan();
    step(plan, 0).dependencies = ["02-business-decision"];

    expectIssue(validate(plan), "dependency_cycle", "steps.01-research-brief.dependencies");
  });

  it("rejects unstable step ordering", () => {
    const plan = clonePlan();
    plan.steps.reverse();

    expectIssue(validate(plan), "not_deterministic");
  });

  it("rejects missing expected output", () => {
    const plan = clonePlan();
    step(plan, 0).expectedOutput.requiredSections = [];

    expectIssue(validate(plan), "invalid_type", "steps[0].expectedOutput.requiredSections");
  });

  it.each([
    "successCriteria",
    "failureConditions",
    "stopConditions",
  ] as const)("rejects a step with no %s", (field) => {
    const plan = clonePlan();
    step(plan, 0)[field] = [];

    expectIssue(validate(plan), "invalid_type", `steps[0].${field}`);
  });

  it("rejects guardian-sensitive steps without guardian coverage", () => {
    const plan = clonePlan();
    step(plan, 0).guardianRequirements = [];

    expectIssue(validate(plan), "guardian_required");
  });

  it("rejects approval-sensitive capabilities without approval coverage", () => {
    const plan = clonePlan();
    const pricingStep = step(plan, 1);
    pricingStep.capabilityIds = ["pricing-strategy-support"];
    pricingStep.permissionRuleIds = ["pricing-strategy-support-permission"];
    pricingStep.guardianRequirements = ["operator_safety", "cost", "quality"];
    pricingStep.approvalRequirements = [];

    expectIssue(validate(plan), "approval_required", "steps[1].approvalRequirements");
  });

  it("rejects external execution and external action requests without an approval queue", () => {
    const plan = clonePlan();
    plan.control.externalActionBoundary.requestedActionTypes = ["publication"];
    (
      plan.control.externalActionBoundary as unknown as {
        externalExecutionAllowed: boolean;
      }
    ).externalExecutionAllowed = true;

    expectIssue(validate(plan), "unsafe_execution", "control.externalActionBoundary");
    expectIssue(validate(plan), "approval_required", "control.approvalQueue");
  });

  it("rejects total effort or cost that understates a step", () => {
    const plan = clonePlan();
    step(plan, 1).effortClass = "high";
    step(plan, 1).costClass = "high";
    plan.control.totalEffortClass = "low";
    plan.control.totalCostClass = "low";

    expectIssue(validate(plan), "inconsistent_summary", "control.totalEffortClass");
    expectIssue(validate(plan), "inconsistent_summary", "control.totalCostClass");
  });

  it("fails closed when supplied Agent Company declarations are not READY", () => {
    const company = structuredClone(
      DEFAULT_AGENT_COMPANY_READINESS_INPUT,
    ) as DeepMutable<AgentCompanyReadinessReviewInput>;
    company.agentSpecifications = company.agentSpecifications.slice(1);

    expectIssue(
      new MissionPlanValidator(company).validate(DEFAULT_MISSION_PLAN),
      "company_not_ready",
      "companyReadinessReportId",
    );
  });

  it("rejects execution implications at every plan boundary", () => {
    const plan = clonePlan();
    (plan as unknown as { nonExecuting: boolean }).nonExecuting = false;
    (plan.steps[0] as unknown as { nonExecuting: boolean }).nonExecuting = false;

    expectIssue(validate(plan), "unsafe_execution", "nonExecuting");
    expectIssue(validate(plan), "unsafe_execution", "steps[0].nonExecuting");
  });

  it("rejects sensitive material without echoing it", () => {
    const plan = clonePlan();
    plan.summary.normalizedObjective = "Use sk-private-value from /Users/private/source.";

    const result = validate(plan);
    expectIssue(result, "sensitive_content");
    expect(JSON.stringify(result)).not.toContain("sk-private-value");
  });

  it("returns a deeply immutable validated copy", () => {
    const candidate = clonePlan();
    const result = validate(candidate);
    if (!result.ok) throw new Error("expected valid Mission Plan fixture");

    expect(result.value).not.toBe(candidate);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.steps)).toBe(true);
    expect(Object.isFrozen(result.value.steps[0])).toBe(true);
  });

  it("does not replace the existing OperatorMissionPlanCandidate contract", () => {
    const existingCandidate: OperatorMissionPlanCandidate = {
      candidateId: "operator-candidate",
      nonExecuting: true,
      objective: "Prepare a shallow operator candidate.",
      requestedOutcome: "A bounded candidate result.",
      steps: [
        {
          description: "Prepare one shallow candidate step.",
          requiresApproval: false,
          stepId: "candidate-step",
          title: "Candidate step",
        },
      ],
    };

    expect("control" in existingCandidate).toBe(false);
    expect("control" in DEFAULT_MISSION_PLAN).toBe(true);
  });
});

function validate(value: unknown): ValidationResult<MissionPlan> {
  return new MissionPlanValidator().validate(value);
}

function clonePlan(): DeepMutable<MissionPlan> {
  return structuredClone(DEFAULT_MISSION_PLAN) as DeepMutable<MissionPlan>;
}

function step(
  plan: DeepMutable<MissionPlan>,
  index: number,
): DeepMutable<MissionPlanStep> {
  const value = plan.steps[index];
  if (value === undefined) {
    throw new Error(`missing Mission Plan step ${String(index)}`);
  }
  return value;
}

function expectIssue(
  result: ValidationResult<MissionPlan>,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        ...(path === undefined ? {} : { path }),
      }),
    ]),
  );
}
