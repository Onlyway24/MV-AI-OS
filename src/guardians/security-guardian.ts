import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const SECURITY_GUARDIAN_CONTRACT_VERSION = "1" as const;

export type SecurityGuardianSeverity = "info" | "warning" | "critical";

export type SecurityGuardianFindingCategory =
  | "invalid_secret_reference"
  | "live_provider_mode_enabled"
  | "missing_backup_restore"
  | "missing_budget_enforcement"
  | "missing_cost_guardian"
  | "missing_operation_limits"
  | "missing_secret_reference"
  | "missing_usage_accounting"
  | "tool_execution_enabled_without_approval"
  | "unsafe_cloud_readiness"
  | "unsafe_secret_material";

export type SecurityGuardianControlName =
  | "backup_restore"
  | "budget_enforcement"
  | "cost_guardian"
  | "operation_limits"
  | "secret_reference"
  | "tool_approval"
  | "tool_audit"
  | "usage_accounting";

export interface SecurityGuardianSafetyState {
  readonly backupRestoreAvailable: boolean;
  readonly budgetEnforcementConfigured: boolean;
  readonly cloudOrVpsReadinessTargeted: boolean;
  readonly controlledSecretReferenceConfigured: boolean;
  readonly costGuardianAvailable: boolean;
  readonly invalidSecretReferenceDetected: boolean;
  readonly liveProviderEnabled: boolean;
  readonly operationLimitsConfigured: boolean;
  readonly toolExecutionApprovalRequired: boolean;
  readonly toolExecutionAudited: boolean;
  readonly toolExecutionEnabled: boolean;
  readonly unsafeSecretMaterialDetected: boolean;
  readonly usageAccountingConfigured: boolean;
}

export interface SecurityGuardianEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly state: SecurityGuardianSafetyState;
}

export interface SecurityGuardianFindingEvidence {
  readonly affectedControls?: readonly SecurityGuardianControlName[];
  readonly liveProviderEnabled?: boolean;
  readonly signalCount: number;
}

export interface SecurityGuardianFinding {
  readonly category: SecurityGuardianFindingCategory;
  readonly contractVersion: RequestContractVersion;
  readonly evidence: SecurityGuardianFindingEvidence;
  readonly findingId: string;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: SecurityGuardianSeverity;
  readonly title: string;
}

export interface SecurityGuardianReportSummary {
  readonly criticalFindings: number;
  readonly highestSeverity: SecurityGuardianSeverity;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface SecurityGuardianReport {
  readonly contractVersion: RequestContractVersion;
  readonly findings: readonly SecurityGuardianFinding[];
  readonly generatedAt: string;
  readonly summary: SecurityGuardianReportSummary;
}

export interface SecurityGuardian {
  evaluate(input: SecurityGuardianEvaluationInput): SecurityGuardianReport;
}
