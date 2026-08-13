export const DAILY_OPERATING_BRIEF_CONTRACT_VERSION = "1" as const;
export type OperatingDataKind = "ASSUMPTION" | "ESTIMATE" | "MEASURED" | "UNAVAILABLE";

export interface OperatingDatum<T> {
  readonly asOf: string;
  readonly kind: OperatingDataKind;
  readonly limitation?: string;
  readonly provenance: readonly string[];
  readonly value: T;
}

export interface DailyOperatingDecision {
  readonly decisionId: string;
  readonly evidence: readonly string[];
  readonly priority: "HIGH" | "LOW" | "MEDIUM";
  readonly question: string;
  readonly status: "OPEN";
}

export interface DailyOperatingBriefSections {
  readonly approvalsRequired: OperatingDatum<readonly { readonly entityId: string; readonly entityType: string; readonly status: string }[]>;
  readonly backupState: OperatingDatum<{ readonly lastVerifiedAt?: string; readonly status: "ATTENTION_REQUIRED" | "READY" | "UNKNOWN" }>;
  readonly blockedTasks: OperatingDatum<readonly { readonly owner: string; readonly reasonCode: string; readonly taskId: string }[]>;
  readonly businessMissions: OperatingDatum<readonly { readonly missionId: string; readonly status: string }[]>;
  readonly costsAndBudgets: OperatingDatum<{ readonly budgetCents: number | "NOT_CONFIGURED"; readonly estimatedCostCents: number; readonly measuredCostCents: number; readonly reconciliation: "NOT_REQUIRED" | "PENDING" }>;
  readonly evidenceFreshness: OperatingDatum<{ readonly fresh: number; readonly stale: number; readonly total: number }>;
  readonly externalActionsPerformed: OperatingDatum<{ readonly deployments: number; readonly messages: number; readonly paidCalls: number; readonly publications: number; readonly purchases: number }>;
  readonly incidents: OperatingDatum<readonly { readonly incidentId: string; readonly severity: string; readonly status: string; readonly summaryCode: string }[]>;
  readonly productionQueue: OperatingDatum<{ readonly active: number; readonly deadLetter: number; readonly pendingFabio: number }>;
  readonly recommendedFounderDecisions: OperatingDatum<readonly DailyOperatingDecision[]>;
  readonly socialIntelligence: OperatingDatum<{ readonly analyticsRecords: number; readonly records: number; readonly status: "INSUFFICIENT_DATA" | "READY" }>;
  readonly systemHealth: OperatingDatum<{ readonly killSwitch: "LOCKED" | "TRIGGERED" | "UNKNOWN"; readonly maintenanceMode: "DISABLED" | "ENABLED" | "UNKNOWN"; readonly scheduler: "MISSING" | "READY" | "STALE" | "UNKNOWN"; readonly status: "ATTENTION_REQUIRED" | "READY"; readonly worker: "MISSING" | "READY" | "STALE" | "UNKNOWN" }>;
  readonly workCompleted: OperatingDatum<readonly { readonly completedAt: string; readonly identity: string; readonly kind: string }[]>;
  readonly workInProgress: OperatingDatum<readonly { readonly identity: string; readonly kind: string; readonly status: string }[]>;
}

export interface DailyOperatingBriefRecord {
  readonly actorId: string;
  readonly briefId: string;
  readonly businessDate: string;
  readonly contractVersion: typeof DAILY_OPERATING_BRIEF_CONTRACT_VERSION;
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly publication: "INTERNAL_ONLY";
  readonly sections: DailyOperatingBriefSections;
  readonly version: number;
  readonly workspaceId: string;
}
