import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  DEFAULT_FOUNDER_MISSION_BRIEF,
  DeterministicAgentCompanyReadinessEvaluator,
  DeterministicLocalMissionPlanningDryRun,
  DeterministicMissionPlanner,
  DeterministicMissionQualityGate,
  LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION,
  LocalMissionPlanningDryRunInputValidator,
  LocalMissionPlanningDryRunResultValidator,
  LocalMissionPlanningDryRunValidationError,
  type FounderMissionBrief,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[] ? DeepMutable<Entry>[] : T extends object ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> } : T;

describe("Local Mission Planning Dry-Run", () => {
  it("composes readiness, planning, and quality into an approval-ready non-executing result", () => {
    const result = run(DEFAULT_FOUNDER_MISSION_BRIEF);

    expect(result.status).toBe("APPROVAL_READY");
    expect(result.readiness.summary.status).toBe("READY");
    expect(result.planning?.status).toBe("PLAN_READY");
    expect(result.quality?.status).toBe("APPROVAL_READY");
    expect(result.nonExecuting).toBe(true);
    expect(result.planning?.plan?.nonExecuting).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.quality)).toBe(true);
  });

  it("returns clarification without quality when planning needs a decision", () => {
    const brief = cloneBrief();
    brief.unknowns = [{ classification: "DECISION_BLOCKING", impact: "The answer changes the intended offer.", topic: "Audience", unknownId: "audience" }];
    brief.clarificationQuestions = [{ question: "Which audience must this serve?", questionId: "audience-question", sourceUnknownId: "audience", whyDecisionBlocking: "The answer changes the offer." }];

    const result = run(brief);
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
    expect(result.planning?.status).toBe("CLARIFICATION_REQUIRED");
    expect(result.quality).toBeUndefined();
  });

  it("returns a safe rejection without quality for contradictory intent", () => {
    const brief = cloneBrief();
    brief.constraints = [{ constraintId: "publish-now", description: "Publish now.", kind: "non_negotiable" }];
    brief.forbiddenActions = [{ actionId: "no-publishing", category: "publishing", description: "Publish now." }];

    const result = run(brief);
    expect(result.status).toBe("REJECTED");
    expect(result.quality).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("Publish now");
  });

  it("returns remediation when the existing quality gate requires it", () => {
    const brief = cloneBrief();
    brief.missionType = "market_research";

    const result = run(brief);
    expect(result.status).toBe("REMEDIATION_REQUIRED");
    expect(result.quality?.totalScore).toBe(81);
  });

  it("does not call the planner when the injected Agent Company is not ready", () => {
    let planned = false;
    const company = structuredClone(DEFAULT_AGENT_COMPANY_READINESS_INPUT) as DeepMutable<typeof DEFAULT_AGENT_COMPANY_READINESS_INPUT>;
    company.agentSpecifications = [];
    const nonReady = new DeterministicAgentCompanyReadinessEvaluator().evaluate(company);
    const result = new DeterministicLocalMissionPlanningDryRun({
      companyInput: DEFAULT_AGENT_COMPANY_READINESS_INPUT,
      missionPlanner: { plan: () => { planned = true; return new DeterministicMissionPlanner().plan(DEFAULT_FOUNDER_MISSION_BRIEF); } },
      qualityGate: new DeterministicMissionQualityGate(),
      readinessEvaluator: { evaluate: () => nonReady },
    }).run(input(DEFAULT_FOUNDER_MISSION_BRIEF));

    expect(result.status).toBe("AGENT_COMPANY_NOT_READY");
    expect(result.planning).toBeUndefined();
    expect(planned).toBe(false);
  });

  it("rejects invalid outer input and invalid result shape", () => {
    expect(new LocalMissionPlanningDryRunInputValidator().validate({ contractVersion: "2", brief: {} })).toMatchObject({ ok: false });
    expect(new LocalMissionPlanningDryRunResultValidator().validate({ contractVersion: "1", nonExecuting: false })).toMatchObject({ ok: false });
    expect(() => new DeterministicLocalMissionPlanningDryRun().run({ contractVersion: "2" as "1", brief: DEFAULT_FOUNDER_MISSION_BRIEF })).toThrow(LocalMissionPlanningDryRunValidationError);
  });

  it("is deterministic and contains no execution or sensitive payload", () => {
    const first = run(DEFAULT_FOUNDER_MISSION_BRIEF);
    expect(first).toEqual(run(DEFAULT_FOUNDER_MISSION_BRIEF));
    expect(JSON.stringify(first)).not.toMatch(/(?:sk-|api[_-]?key|secret|\/Users\/|\/home\/)/iu);
    expect(first.quality?.nonExecuting).toBe(true);
  });
});

function input(brief: FounderMissionBrief) { return { brief, contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION } as const; }
function run(brief: FounderMissionBrief) { return new DeterministicLocalMissionPlanningDryRun().run(input(brief)); }
function cloneBrief(): DeepMutable<FounderMissionBrief> { return structuredClone(DEFAULT_FOUNDER_MISSION_BRIEF) as DeepMutable<FounderMissionBrief>; }
