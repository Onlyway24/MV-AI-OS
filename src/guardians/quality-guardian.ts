import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const QUALITY_GUARDIAN_CONTRACT_VERSION = "1" as const;

export type QualityGuardianSeverity = "info" | "warning" | "critical";

export type QualityGuardianFindingCategory =
  | "incomplete_task_result"
  | "low_readiness_score"
  | "malformed_result"
  | "missing_evidence_references"
  | "missing_final_response"
  | "missing_human_review"
  | "missing_source_references"
  | "model_output_rejected"
  | "repeated_rejected_outputs"
  | "unsafe_content_pipeline_state"
  | "validation_failure_threshold_exceeded";

export type QualityGuardianSignalName =
  | "content_pipeline"
  | "evidence_references"
  | "final_response"
  | "human_review"
  | "model_output_validation"
  | "readiness_score"
  | "rejected_outputs"
  | "result_shape"
  | "source_references"
  | "task_completion"
  | "validation_failures";

export interface QualityGuardianQualityState {
  readonly evidenceReferencesPresent: boolean;
  readonly evidenceRequired: boolean;
  readonly finalResponsePresent: boolean;
  readonly humanReviewCompleted: boolean;
  readonly humanReviewRequired: boolean;
  readonly minimumReadinessScore: number;
  readonly modelOutputRejected: boolean;
  readonly outputClaimsEvidence: boolean;
  readonly readinessScore: number;
  readonly rejectedOutputCount: number;
  readonly rejectedOutputThreshold: number;
  readonly resultWellFormed: boolean;
  readonly sourceReferencesPresent: boolean;
  readonly taskResultComplete: boolean;
  readonly unsafeContentPipelineDetected: boolean;
  readonly validationFailureCount: number;
  readonly validationFailureThreshold: number;
}

export interface QualityGuardianEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly state: QualityGuardianQualityState;
}

export interface QualityGuardianFindingEvidence {
  readonly affectedSignals?: readonly QualityGuardianSignalName[];
  readonly readinessScore?: number;
  readonly signalCount: number;
  readonly threshold?: number;
}

export interface QualityGuardianFinding {
  readonly category: QualityGuardianFindingCategory;
  readonly contractVersion: RequestContractVersion;
  readonly evidence: QualityGuardianFindingEvidence;
  readonly findingId: string;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: QualityGuardianSeverity;
  readonly title: string;
}

export interface QualityGuardianReportSummary {
  readonly criticalFindings: number;
  readonly highestSeverity: QualityGuardianSeverity;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface QualityGuardianReport {
  readonly contractVersion: RequestContractVersion;
  readonly findings: readonly QualityGuardianFinding[];
  readonly generatedAt: string;
  readonly summary: QualityGuardianReportSummary;
}

export interface QualityGuardian {
  evaluate(input: QualityGuardianEvaluationInput): QualityGuardianReport;
}
