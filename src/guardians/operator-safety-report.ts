import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { BackupGuardianReport } from "./backup-guardian.js";
import type { CostGuardianReport } from "./cost-guardian.js";
import type { IncidentGuardianReport } from "./incident-guardian.js";
import type { QualityGuardianReport } from "./quality-guardian.js";
import type { SecurityGuardianReport } from "./security-guardian.js";

export const OPERATOR_SAFETY_REPORT_CONTRACT_VERSION = "1" as const;

export type OperatorSafetyDomain =
  | "backup"
  | "cost"
  | "incident"
  | "quality"
  | "security";

export type OperatorSafetySeverity = "info" | "warning" | "critical";

export type OperatorSafetyStatus =
  | "attention_required"
  | "critical"
  | "healthy"
  | "unknown";

export type OperatorSafetyAutonomyDecision =
  | "continue_with_attention"
  | "do_not_increase_autonomy"
  | "safe_to_continue"
  | "unknown";

export interface OperatorSafetyGuardianReports {
  readonly backup?: BackupGuardianReport;
  readonly cost?: CostGuardianReport;
  readonly incident?: IncidentGuardianReport;
  readonly quality?: QualityGuardianReport;
  readonly security?: SecurityGuardianReport;
}

export interface OperatorSafetyEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly expectedGuardians: readonly OperatorSafetyDomain[];
  readonly generatedAt: string;
  readonly guardianReports: OperatorSafetyGuardianReports;
}

export interface OperatorSafetyCoverageSummary {
  readonly expectedGuardians: readonly OperatorSafetyDomain[];
  readonly includedGuardians: readonly OperatorSafetyDomain[];
  readonly missingGuardians: readonly OperatorSafetyDomain[];
}

export interface OperatorSafetyFindingSummary {
  readonly affectedAreas: readonly string[];
  readonly category: string;
  readonly domain: OperatorSafetyDomain;
  readonly findingId: string;
  readonly severity: OperatorSafetySeverity;
  readonly title: string;
}

export interface OperatorSafetyGuardianSummary {
  readonly affectedAreas: readonly string[];
  readonly criticalFindings: number;
  readonly domain: OperatorSafetyDomain;
  readonly highestSeverity: OperatorSafetySeverity;
  readonly included: boolean;
  readonly status: OperatorSafetyStatus;
  readonly topFinding?: OperatorSafetyFindingSummary;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface OperatorRecommendedAction {
  readonly actionId: string;
  readonly domain?: OperatorSafetyDomain;
  readonly recommendation: string;
  readonly severity: OperatorSafetySeverity;
  readonly title: string;
}

export interface OperatorSafetyReportSummary {
  readonly coverage: OperatorSafetyCoverageSummary;
  readonly criticalDomains: readonly OperatorSafetyDomain[];
  readonly healthyDomains: readonly OperatorSafetyDomain[];
  readonly highestSeverity: OperatorSafetySeverity;
  readonly primaryAttentionDomain?: OperatorSafetyDomain;
  readonly safetyToAutonomy: OperatorSafetyAutonomyDecision;
  readonly status: OperatorSafetyStatus;
  readonly totalCriticalFindings: number;
  readonly totalFindings: number;
  readonly totalWarningFindings: number;
  readonly unknownDomains: readonly OperatorSafetyDomain[];
  readonly warningDomains: readonly OperatorSafetyDomain[];
}

export interface OperatorSafetyReport {
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly guardianSummaries: readonly OperatorSafetyGuardianSummary[];
  readonly recommendedActions: readonly OperatorRecommendedAction[];
  readonly summary: OperatorSafetyReportSummary;
}

export interface OperatorSafetyReporter {
  evaluate(input: OperatorSafetyEvaluationInput): OperatorSafetyReport;
}
