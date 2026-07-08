import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const INCIDENT_GUARDIAN_CONTRACT_VERSION = "1" as const;

export type IncidentGuardianSeverity = "info" | "warning" | "critical";

export type IncidentGuardianFindingCategory =
  | "backup_restore_verification_failures"
  | "high_severity_backup_findings"
  | "high_severity_cost_findings"
  | "high_severity_security_findings"
  | "provider_unavailable_pattern"
  | "repeated_budget_blocks"
  | "repeated_invalid_configuration_attempts"
  | "repeated_model_failures"
  | "repeated_operation_limit_blocks";

export type IncidentGuardianSignalName =
  | "backup_restore_verification_failures"
  | "budget_blocks"
  | "guardian_findings"
  | "invalid_configuration_attempts"
  | "model_failures"
  | "operation_limit_blocks"
  | "provider_unavailable";

export type IncidentGuardianSourceGuardian = "backup" | "cost" | "security";

export interface IncidentGuardianOperationalSignals {
  readonly backupRestoreVerificationFailureCount: number;
  readonly budgetBlockCount: number;
  readonly invalidConfigurationAttemptCount: number;
  readonly modelFailureCount: number;
  readonly operationLimitBlockCount: number;
  readonly providerUnavailableCount: number;
}

export interface IncidentGuardianSourceSummary {
  readonly criticalFindings: number;
  readonly guardian: IncidentGuardianSourceGuardian;
  readonly warningFindings: number;
}

export interface IncidentGuardianThresholds {
  readonly backupRestoreVerificationFailureThreshold: number;
  readonly budgetBlockThreshold: number;
  readonly invalidConfigurationAttemptThreshold: number;
  readonly modelFailureThreshold: number;
  readonly operationLimitBlockThreshold: number;
  readonly providerUnavailableThreshold: number;
}

export interface IncidentGuardianEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly guardianSummaries: readonly IncidentGuardianSourceSummary[];
  readonly signals: IncidentGuardianOperationalSignals;
  readonly thresholds?: IncidentGuardianThresholds;
}

export interface IncidentGuardianFindingEvidence {
  readonly affectedSignals?: readonly IncidentGuardianSignalName[];
  readonly sourceGuardians?: readonly IncidentGuardianSourceGuardian[];
  readonly signalCount: number;
  readonly threshold?: number;
}

export interface IncidentGuardianFinding {
  readonly category: IncidentGuardianFindingCategory;
  readonly contractVersion: RequestContractVersion;
  readonly evidence: IncidentGuardianFindingEvidence;
  readonly findingId: string;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: IncidentGuardianSeverity;
  readonly title: string;
}

export interface IncidentGuardianReportSummary {
  readonly criticalFindings: number;
  readonly highestSeverity: IncidentGuardianSeverity;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface IncidentGuardianReport {
  readonly contractVersion: RequestContractVersion;
  readonly findings: readonly IncidentGuardianFinding[];
  readonly generatedAt: string;
  readonly summary: IncidentGuardianReportSummary;
}

export interface IncidentGuardian {
  evaluate(input: IncidentGuardianEvaluationInput): IncidentGuardianReport;
}
