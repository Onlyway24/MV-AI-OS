import type { OperationalAgentId } from "./operational-agent-company.js";

export const FOUNDER_WORKDAY_CONTRACT_VERSION = "1" as const;
export const FOUNDER_WORKDAY_OBJECTIVE = "Prepare the best evidence-backed next operating plan for Metodo Veloce and Onlyway, including the next social production, the associated commercial opportunity, the delivery plan, technical improvements and all decisions required from Fabio." as const;

export type FounderWorkdayStatus = "AWAITING_FABIO" | "BLOCKED" | "RUNNING";
export type FounderWorkdayTaskStatus = "AWAITING_DEPENDENCY" | "AWAITING_FABIO" | "BLOCKED" | "COMPLETED" | "RUNNING";
export type FounderDataKind = "ASSUMPTION" | "ESTIMATE" | "MEASURED" | "UNAVAILABLE";

export interface FounderWorkdayBlocker {
  readonly evidence: readonly string[];
  readonly missingInput: string;
  readonly nextAction: string;
  readonly owner: "FABIO" | "OPERATIONS_RUNTIME" | "RESEARCH" | "SYSTEM";
  readonly remediation: string;
}

export interface FounderWorkdayTaskReceipt {
  readonly completedAt: string;
  readonly costCents: number;
  readonly durationMs: number;
  readonly executorId: string;
  readonly externalEffects: 0;
  readonly outputFingerprint: string;
  readonly receiptId: string;
  readonly startedAt: string;
}

export interface FounderWorkdayTask {
  readonly agentId: OperationalAgentId;
  readonly assignment: string;
  readonly attempts: number;
  readonly blocker?: FounderWorkdayBlocker;
  readonly costClass: "LOCAL_ZERO_COST";
  readonly decisionRequired: boolean;
  readonly dependencies: readonly OperationalAgentId[];
  readonly department: string;
  readonly gateStatus: "AWAITING_INPUT" | "BLOCKED" | "PASSED";
  readonly outputIdentity?: string;
  readonly receipt?: FounderWorkdayTaskReceipt;
  readonly status: FounderWorkdayTaskStatus;
  readonly taskId: string;
}

export interface FounderWorkdayDecision {
  readonly decisionId: string;
  readonly evidence: readonly string[];
  readonly owner: "FABIO" | "SYSTEM";
  readonly priority: "HIGH" | "LOW" | "MEDIUM";
  readonly question: string;
  readonly status: "OPEN";
}

export interface FounderWorkdayDatum<T> {
  readonly kind: FounderDataKind;
  readonly provenance: readonly string[];
  readonly value: T;
}

export interface FounderWorkdayArtifacts {
  readonly blockedWorkReport: {
    readonly blockedTaskIds: readonly string[];
    readonly blockers: readonly FounderWorkdayBlocker[];
  };
  readonly costSummary: {
    readonly budgetCents: number;
    readonly coverage: "PREFLIGHT_ONLY";
    readonly estimatedCostCents: number;
    readonly measuredCostCents: number;
    readonly providerCalls: 0;
  };
  readonly decisionList: readonly FounderWorkdayDecision[];
  readonly externalEffectsSummary: {
    readonly coverage: "PREFLIGHT_ONLY";
    readonly deployments: 0;
    readonly messages: 0;
    readonly paidCalls: 0;
    readonly publications: 0;
    readonly purchases: 0;
  };
  readonly founderDailyDossier: {
    readonly businessMissions: FounderWorkdayDatum<number>;
    readonly evidencePacks: FounderWorkdayDatum<number>;
    readonly freshEvidencePacks: FounderWorkdayDatum<number>;
    readonly productionPackages: FounderWorkdayDatum<number>;
    readonly socialAnalyticsRecords: FounderWorkdayDatum<number>;
    readonly socialIntelligenceRecords: FounderWorkdayDatum<number>;
    readonly summary: string;
  };
  readonly nextDayProductionPlan: {
    readonly blockedBy: readonly string[];
    readonly candidateProductionIds: readonly string[];
    readonly mode: "INTERNAL_PACKAGE_ONLY";
    readonly publication: "LOCKED";
    readonly status: "BLOCKED" | "READY_FOR_FABIO";
  };
}

export interface FounderWorkdayManifest {
  readonly agentIds: readonly OperationalAgentId[];
  readonly businessMissionIds: readonly string[];
  readonly dependencyGraph: readonly {
    readonly agentId: OperationalAgentId;
    readonly dependencies: readonly OperationalAgentId[];
  }[];
  readonly evidencePackIds: readonly string[];
  readonly productionIds: readonly string[];
  readonly socialRecordIds: readonly string[];
}

export interface FounderWorkdayRecord {
  readonly actorId: string;
  readonly artifacts: FounderWorkdayArtifacts;
  readonly contractVersion: typeof FOUNDER_WORKDAY_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly manifest: FounderWorkdayManifest;
  readonly objective: typeof FOUNDER_WORKDAY_OBJECTIVE;
  readonly status: FounderWorkdayStatus;
  readonly tasks: readonly FounderWorkdayTask[];
  readonly updatedAt: string;
  readonly version: number;
  readonly workdayId: string;
  readonly workspaceId: string;
}
