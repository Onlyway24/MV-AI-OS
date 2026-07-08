import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const BACKUP_GUARDIAN_CONTRACT_VERSION = "1" as const;

export type BackupGuardianSeverity = "info" | "warning" | "critical";

export type BackupGuardianFindingCategory =
  | "backup_metadata_invalid"
  | "backup_missing"
  | "backup_path_invalid"
  | "backup_stale"
  | "missing_restore_verification"
  | "restore_verification_failed"
  | "schema_version_mismatch"
  | "source_database_missing"
  | "unsafe_cloud_backup_readiness";

export type BackupGuardianControlName =
  | "backup_freshness"
  | "backup_metadata"
  | "backup_path"
  | "backup_presence"
  | "restore_verification"
  | "schema_version"
  | "source_database";

export interface BackupGuardianReadinessState {
  readonly backupMetadataValid: boolean;
  readonly backupPathValid: boolean;
  readonly cloudOrVpsReadinessTargeted: boolean;
  readonly latestBackupAgeHours?: number;
  readonly latestBackupAvailable: boolean;
  readonly latestRestoreVerificationSucceeded: boolean;
  readonly maxBackupAgeHours: number;
  readonly restoreVerificationAvailable: boolean;
  readonly schemaVersionMatches: boolean;
  readonly sourceDatabaseAvailable: boolean;
}

export interface BackupGuardianEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly state: BackupGuardianReadinessState;
}

export interface BackupGuardianFindingEvidence {
  readonly affectedControls?: readonly BackupGuardianControlName[];
  readonly backupAgeHours?: number;
  readonly maxBackupAgeHours?: number;
  readonly signalCount: number;
}

export interface BackupGuardianFinding {
  readonly category: BackupGuardianFindingCategory;
  readonly contractVersion: RequestContractVersion;
  readonly evidence: BackupGuardianFindingEvidence;
  readonly findingId: string;
  readonly message: string;
  readonly recommendation: string;
  readonly severity: BackupGuardianSeverity;
  readonly title: string;
}

export interface BackupGuardianReportSummary {
  readonly criticalFindings: number;
  readonly highestSeverity: BackupGuardianSeverity;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface BackupGuardianReport {
  readonly contractVersion: RequestContractVersion;
  readonly findings: readonly BackupGuardianFinding[];
  readonly generatedAt: string;
  readonly summary: BackupGuardianReportSummary;
}

export interface BackupGuardian {
  evaluate(input: BackupGuardianEvaluationInput): BackupGuardianReport;
}
