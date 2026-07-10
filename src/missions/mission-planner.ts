import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { FounderMissionBrief, MissionAssumption, MissionClarificationQuestion } from "./founder-mission-brief.js";
import type { MissionPlan } from "./mission-plan.js";

export const MISSION_PLANNING_RESULT_CONTRACT_VERSION = "1" as const;

export type MissionPlanningStatus =
  | "CLARIFICATION_REQUIRED"
  | "PLAN_READY"
  | "REJECTED";

export interface MissionPlanningResult {
  readonly assumptions: readonly MissionAssumption[];
  readonly briefId: string;
  readonly clarificationQuestions: readonly MissionClarificationQuestion[];
  readonly contractVersion: RequestContractVersion;
  readonly nonExecuting: true;
  readonly plan?: MissionPlan;
  readonly rejectionCodes: readonly string[];
  readonly status: MissionPlanningStatus;
}

export interface MissionPlanner {
  plan(brief: FounderMissionBrief): MissionPlanningResult;
}
