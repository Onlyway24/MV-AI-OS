import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { MissionPlan } from "./mission-plan.js";

export const MISSION_QUALITY_GATE_CONTRACT_VERSION = "1" as const;

export const MISSION_QUALITY_DIMENSIONS = [
  "clarity",
  "specificity",
  "actionability",
  "value",
  "differentiation",
  "founder_alignment",
  "feasibility",
  "manual_work_efficiency",
  "evidence_uncertainty",
  "safety_control",
] as const;

export type MissionQualityDimension =
  (typeof MISSION_QUALITY_DIMENSIONS)[number];

export type MissionQualityGateStatus =
  | "APPROVAL_READY"
  | "BLOCKED"
  | "REMEDIATION_REQUIRED";

export type MissionQualityReleaseRecommendation =
  | "APPROVE_FOR_FABIO_REVIEW"
  | "DO_NOT_RELEASE"
  | "REMEDIATE_BEFORE_REVIEW";

export type MissionQualityFindingSeverity = "blocking" | "info" | "warning";

export interface MissionQualityGateInput {
  readonly contractVersion: RequestContractVersion;
  readonly plan: MissionPlan;
}

export interface MissionQualityDimensionScore {
  readonly dimension: MissionQualityDimension;
  readonly evidenceCodes: readonly string[];
  readonly score: number;
}

export interface MissionQualityFinding {
  readonly code: string;
  readonly dimension?: MissionQualityDimension;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: MissionQualityFindingSeverity;
}

export interface MissionQualityGateReport {
  readonly blockingDefects: readonly MissionQualityFinding[];
  readonly contractVersion: RequestContractVersion;
  readonly nonExecuting: true;
  readonly planId: string;
  readonly releaseRecommendation: MissionQualityReleaseRecommendation;
  readonly remediationRecommendations: readonly string[];
  readonly scores: readonly MissionQualityDimensionScore[];
  readonly status: MissionQualityGateStatus;
  readonly strengths: readonly MissionQualityFinding[];
  readonly totalScore: number;
  readonly warnings: readonly MissionQualityFinding[];
  readonly weaknesses: readonly MissionQualityFinding[];
}

export interface MissionQualityGate {
  evaluate(input: MissionQualityGateInput): MissionQualityGateReport;
}
