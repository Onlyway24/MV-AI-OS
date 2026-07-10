import type {
  AgentCompanyReadinessEvaluator,
  AgentCompanyReadinessReport,
  AgentCompanyReadinessReviewInput,
} from "../assistants/agent-company-readiness-review.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { FounderMissionBrief } from "./founder-mission-brief.js";
import type { MissionQualityGate, MissionQualityGateReport } from "./mission-quality-gate.js";
import type { MissionPlanner, MissionPlanningResult } from "./mission-planner.js";

export const LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION = "1" as const;

export type LocalMissionPlanningDryRunStatus =
  | "AGENT_COMPANY_NOT_READY"
  | "APPROVAL_READY"
  | "BLOCKED"
  | "CLARIFICATION_REQUIRED"
  | "REJECTED"
  | "REMEDIATION_REQUIRED";

export interface LocalMissionPlanningDryRunInput {
  readonly brief: FounderMissionBrief;
  readonly contractVersion: RequestContractVersion;
}

export interface LocalMissionPlanningDryRunResult {
  readonly contractVersion: RequestContractVersion;
  readonly nonExecuting: true;
  readonly planning?: MissionPlanningResult;
  readonly quality?: MissionQualityGateReport;
  readonly readiness: AgentCompanyReadinessReport;
  readonly status: LocalMissionPlanningDryRunStatus;
}

export interface LocalMissionPlanningDryRunDependencies {
  readonly companyInput: AgentCompanyReadinessReviewInput;
  readonly qualityGate: MissionQualityGate;
  readonly readinessEvaluator: AgentCompanyReadinessEvaluator;
  readonly missionPlanner: MissionPlanner;
}

export interface LocalMissionPlanningDryRun {
  run(input: LocalMissionPlanningDryRunInput): LocalMissionPlanningDryRunResult;
}
