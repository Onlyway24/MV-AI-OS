import { describe, expect, it } from "vitest";

import {
  DEFAULT_MISSION_PLAN,
  DeterministicMissionQualityGate,
  MISSION_QUALITY_GATE_CONTRACT_VERSION,
  MissionQualityGateInputValidator,
  MissionQualityGateReportValidator,
  MissionQualityGateValidationError,
  type MissionPlan,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

describe("Only Way Mission Quality Gate", () => {
  it("accepts a valid Mission Plan input", () => {
    expect(new MissionQualityGateInputValidator().validate(input(DEFAULT_MISSION_PLAN))).toMatchObject({
      ok: true,
    });
  });

  it("rejects an invalid Mission Plan input", () => {
    const plan = clonePlan();
    (plan as unknown as { nonExecuting: boolean }).nonExecuting = false;

    expect(new MissionQualityGateInputValidator().validate(input(plan))).toMatchObject({
      issues: [{ code: "invalid_plan", path: "plan" }],
      ok: false,
    });
  });

  it("returns an approval-ready strong plan at the exact 82-point threshold", () => {
    const report = evaluate(DEFAULT_MISSION_PLAN);

    expect(report.totalScore).toBe(82);
    expect(report.status).toBe("APPROVAL_READY");
    expect(report.releaseRecommendation).toBe("APPROVE_FOR_FABIO_REVIEW");
    expect(report.scores.every(({ score }) => score >= 7)).toBe(true);
    expect(report.blockingDefects).toEqual([]);
  });

  it("requires remediation at 81 points even when there are no blocking defects", () => {
    const plan = clonePlan();
    for (const step of plan.steps) step.costClass = "medium";
    plan.control.totalCostClass = "medium";

    const report = evaluate(plan);
    expect(report.totalScore).toBe(81);
    expect(score(report, "feasibility")).toBe(7);
    expect(report.blockingDefects).toEqual([]);
    expect(report.status).toBe("REMEDIATION_REQUIRED");
  });

  it("detects generic filler and anti-slop directive gaps", () => {
    const plan = clonePlan();
    firstStep(plan).title = "Handle task";
    firstStep(plan).purpose = "Do work";
    firstStep(plan).expectedOutput.description = "Do work";

    const report = evaluate(plan);
    expect(report.status).toBe("REMEDIATION_REQUIRED");
    expect(report.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["anti-slop-incomplete-directive", "generic-filler"]),
    );
    expect(score(report, "clarity")).toBe(3);
  });

  it("does not let a bold option compensate for infeasible cost or effort", () => {
    const plan = clonePlan();
    plan.strategyOptions.push({
      compromises: ["Higher execution effort after founder approval."],
      description: "Test a differentiated value proposition against a documented alternative baseline.",
      optionId: "bold-differentiated-option",
      strategyKind: "BOLD",
      valueRationale: "Creates evidence-gated differentiation only if feasibility remains bounded.",
    });
    plan.strategyOptions.sort((left, right) => left.optionId.localeCompare(right.optionId));
    for (const step of plan.steps) {
      step.costClass = "high";
      step.effortClass = "high";
    }
    plan.control.totalCostClass = "high";
    plan.control.totalEffortClass = "high";

    const report = evaluate(plan);
    expect(score(report, "differentiation")).toBe(9);
    expect(score(report, "feasibility")).toBe(3);
    expect(report.status).toBe("REMEDIATION_REQUIRED");
    expect(report.warnings.map(({ code }) => code)).toContain("originality-does-not-compensate");
  });

  it("requires a concrete operator value even when the plan is otherwise safe", () => {
    const plan = clonePlan();
    plan.summary.businessOrOperatorValue = "Improve things.";

    const report = evaluate(plan);
    expect(score(report, "value")).toBe(3);
    expect(report.status).toBe("REMEDIATION_REQUIRED");
    expect(report.weaknesses).toContainEqual(expect.objectContaining({
      code: "low-value",
      dimension: "value",
    }));
  });

  it.each(["publication", "sales-outreach"])("blocks %s intent without explicit external and publish/send approvals", (actionType) => {
    const plan = clonePlan();
    plan.control.externalActionBoundary.requestedActionTypes = [actionType];
    plan.control.approvalQueue.push({
      approvalId: "non-external-approval",
      requiredFor: ["memory_write"],
      stepIds: ["01-research-brief"],
    });

    const report = evaluate(plan);
    expect(report.status).toBe("BLOCKED");
    expect(report.releaseRecommendation).toBe("DO_NOT_RELEASE");
    expect(report.blockingDefects.map(({ code }) => code)).toEqual([
      "missing-external-side-effect-approval",
      "missing-publish-or-send-approval",
    ]);
  });

  it("flags missing metrics, excessive manual work, unsupported certainty, unclear founder alignment, and weak outputs", () => {
    const plan = clonePlan();
    plan.control.successMetrics = [];
    plan.control.totalEffortClass = "high";
    firstStep(plan).effortClass = "high";
    plan.summary.confidence = "high";
    for (const step of plan.steps) {
      step.failureConditions = ["Required information is unavailable."];
      step.stopConditions = ["Stop when a required input is unavailable."];
      step.expectedOutput.requiredSections = ["decision", "output"];
    }
    firstStep(plan).requiredInputs = ["validated planning input"];
    firstStep(plan).expectedOutput.description = "A short result.";
    firstStep(plan).expectedOutput.requiredSections = ["result"];

    const report = evaluate(plan);
    expect(score(report, "specificity")).toBe(4);
    expect(score(report, "manual_work_efficiency")).toBe(4);
    expect(score(report, "evidence_uncertainty")).toBe(3);
    expect(score(report, "founder_alignment")).toBe(3);
    expect(report.warnings.map(({ code }) => code)).toContain("unsupported-certainty");
    expect(report.weaknesses.map(({ dimension }) => dimension)).toEqual(expect.arrayContaining([
      "specificity",
      "manual_work_efficiency",
      "evidence_uncertainty",
      "founder_alignment",
    ]));
  });

  it("is deterministic and deeply immutable", () => {
    const gate = new DeterministicMissionQualityGate();
    const first = gate.evaluate(input(DEFAULT_MISSION_PLAN));
    const second = gate.evaluate(input(DEFAULT_MISSION_PLAN));

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.scores)).toBe(true);
    expect(Object.isFrozen(first.scores[0])).toBe(true);
    expect(Object.isFrozen(first.strengths)).toBe(true);
  });

  it("provides concrete, stable remediation for every low score", () => {
    const plan = clonePlan();
    plan.summary.businessOrOperatorValue = "Improve things.";

    const report = evaluate(plan);
    for (const scorecard of report.scores.filter(({ score }) => score < 7)) {
      const weakness = report.weaknesses.find(
        ({ dimension }) => dimension === scorecard.dimension,
      );
      expect(weakness?.recommendation.length).toBeGreaterThan(20);
      expect(report.remediationRecommendations).toContain(weakness?.recommendation);
    }
  });

  it("rejects unsafe report content without echoing sensitive material", () => {
    const report = evaluate(DEFAULT_MISSION_PLAN);
    const tampered = structuredClone(report) as DeepMutable<typeof report>;
    firstStrength(tampered).message = "Use sk-private-value from /Users/private/source.";

    const result = new MissionQualityGateReportValidator().validate(tampered);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sk-private-value");
    expect(JSON.stringify(result)).not.toContain("/Users/private/source");
  });

  it("fails closed without exposing invalid Plan content", () => {
    const plan = clonePlan();
    plan.summary.normalizedObjective = "Read sk-private-value from /Users/private/source.";

    expect(() => evaluate(plan)).toThrow(MissionQualityGateValidationError);
    try {
      evaluate(plan);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("sk-private-value");
      expect(JSON.stringify(error)).not.toContain("/Users/private/source");
    }
  });
});

function input(plan: MissionPlan) {
  return {
    contractVersion: MISSION_QUALITY_GATE_CONTRACT_VERSION,
    plan,
  } as const;
}

function evaluate(plan: MissionPlan) {
  return new DeterministicMissionQualityGate().evaluate(input(plan));
}

function score(
  report: ReturnType<typeof evaluate>,
  dimension: (typeof report.scores)[number]["dimension"],
): number {
  const value = report.scores.find((entry) => entry.dimension === dimension);
  if (value === undefined) throw new Error(`missing ${dimension} score`);
  return value.score;
}

function clonePlan(): DeepMutable<MissionPlan> {
  return structuredClone(DEFAULT_MISSION_PLAN) as DeepMutable<MissionPlan>;
}

function firstStep(plan: DeepMutable<MissionPlan>): DeepMutable<MissionPlan["steps"][number]> {
  const step = plan.steps[0];
  if (step === undefined) throw new Error("expected a first Mission Plan step");
  return step;
}

function firstStrength(
  report: DeepMutable<ReturnType<typeof evaluate>>,
): DeepMutable<ReturnType<typeof evaluate>["strengths"][number]> {
  const value = report.strengths[0];
  if (value === undefined) throw new Error("expected a quality strength");
  return value;
}
