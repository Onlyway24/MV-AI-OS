import { DEFAULT_AGENT_COMPANY_READINESS_INPUT } from "../assistants/agent-company-readiness-review.js";
import { DeterministicAgentCompanyReadinessEvaluator } from "../assistants/agent-company-readiness-review-service.js";
import { DeterministicMissionPlanner } from "./deterministic-mission-planner.js";
import { DeterministicMissionQualityGate } from "./deterministic-mission-quality-gate.js";
import { LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, type LocalMissionPlanningDryRun, type LocalMissionPlanningDryRunDependencies, type LocalMissionPlanningDryRunInput, type LocalMissionPlanningDryRunResult } from "./local-mission-planning-dry-run.js";
import { LocalMissionPlanningDryRunInputValidator, LocalMissionPlanningDryRunResultValidator } from "./local-mission-planning-dry-run-validator.js";

export class LocalMissionPlanningDryRunValidationError extends Error {
  public constructor(message: string, public readonly issues: readonly { readonly code: string; readonly path: string }[]) { super(message); this.name = "LocalMissionPlanningDryRunValidationError"; }
}

export class DeterministicLocalMissionPlanningDryRun implements LocalMissionPlanningDryRun {
  readonly #input = new LocalMissionPlanningDryRunInputValidator();
  readonly #result = new LocalMissionPlanningDryRunResultValidator();
  readonly #dependencies: LocalMissionPlanningDryRunDependencies;

  public constructor(dependencies: LocalMissionPlanningDryRunDependencies = {
    companyInput: DEFAULT_AGENT_COMPANY_READINESS_INPUT,
    missionPlanner: new DeterministicMissionPlanner(),
    qualityGate: new DeterministicMissionQualityGate(),
    readinessEvaluator: new DeterministicAgentCompanyReadinessEvaluator(),
  }) { this.#dependencies = dependencies; }

  public run(input: LocalMissionPlanningDryRunInput): LocalMissionPlanningDryRunResult {
    const validated = this.#input.validate(input);
    if (!validated.ok) throw new LocalMissionPlanningDryRunValidationError("Local Mission Planning dry-run input is invalid.", validated.issues.map(({ code, path }) => ({ code, path })));
    const readiness = this.#dependencies.readinessEvaluator.evaluate(this.#dependencies.companyInput);
    if (readiness.summary.status !== "READY") return this.#finalize({ contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, nonExecuting: true, readiness, status: "AGENT_COMPANY_NOT_READY" });
    const planning = this.#dependencies.missionPlanner.plan(validated.value.brief);
    if (planning.status === "CLARIFICATION_REQUIRED" || planning.status === "REJECTED") return this.#finalize({ contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, nonExecuting: true, planning, readiness, status: planning.status });
    if (planning.plan === undefined) throw new LocalMissionPlanningDryRunValidationError("Plan-ready dry-run result is missing its Mission Plan.", [{ code: "invalid_planning", path: "planning.plan" }]);
    const quality = this.#dependencies.qualityGate.evaluate({ contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, plan: planning.plan });
    return this.#finalize({ contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, nonExecuting: true, planning, quality, readiness, status: quality.status });
  }

  #finalize(result: LocalMissionPlanningDryRunResult): LocalMissionPlanningDryRunResult {
    const validated = this.#result.validate(result);
    if (!validated.ok) throw new LocalMissionPlanningDryRunValidationError("Local Mission Planning dry-run generated an invalid result.", validated.issues.map(({ code, path }) => ({ code, path })));
    return deepFreeze(validated.value);
  }
}

function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const entry of Object.values(value)) deepFreeze(entry); return value; }
