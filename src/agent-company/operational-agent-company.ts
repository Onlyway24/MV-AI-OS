import type { BusinessMissionExecutionInput } from "../business/business-mission.js";
import type { JsonObject } from "../contracts/json.js";
import type { MetodoVeloceContentProductionBrief } from "../content-production/metodo-veloce-content-production.js";

export const OPERATIONAL_AGENT_COMPANY_CONTRACT_VERSION = "1" as const;

export const OPERATIONAL_AGENT_IDS = Object.freeze([
  "onlyway-assistant",
  "research-agent",
  "business-agent",
  "content-director",
  "content-producer",
  "sales-agent",
  "customer-delivery-agent",
  "knowledge-curator",
  "developer-agent",
  "finance-cost-analyst",
  "legal-risk-reviewer",
  "quality-guardian",
  "risk-guardian",
  "cost-guardian",
  "security-guardian",
  "backup-guardian",
  "publisher-agent",
] as const);

export type OperationalAgentId = typeof OPERATIONAL_AGENT_IDS[number];
export type OperationalAgentState = "ACTIVE" | "BLOCKED" | "DEGRADED" | "IMPLEMENTING" | "READY" | "RETIRED" | "SPECIFIED";
export type AgentCompanyWorkdayStatus = "AWAITING_FABIO" | "BLOCKED" | "RUNNING";
export type AgentCompanyWorkItemStatus = "BLOCKED" | "COMPLETED" | "QUEUED" | "RUNNING";

export interface OperationalAgentCatalogEntry {
  readonly agentId: OperationalAgentId;
  readonly displayName: string;
  readonly executorId: string;
  readonly forbiddenActions: readonly string[];
  readonly inputContractId: string;
  readonly outputContractId: string;
  readonly permissions: readonly string[];
  readonly requiredGates: readonly ("COST" | "QUALITY" | "RISK")[];
  readonly role: string;
  readonly state: OperationalAgentState;
  readonly supportedTasks: readonly string[];
  readonly version: "1.0.0";
}

export interface AgentCompanyResearchPackRequest {
  readonly evidenceIds: readonly string[];
  readonly packId: string;
}

export interface AgentCompanyWorkdayInput {
  readonly businessMission: BusinessMissionExecutionInput;
  readonly content: {
    readonly brief: MetodoVeloceContentProductionBrief;
    readonly evidencePackId: string;
  };
  readonly developer: {
    readonly acceptanceChecks: readonly string[];
    readonly filesInScope: readonly string[];
    readonly isolatedBranch: string;
    readonly objective: string;
  };
  readonly maxBudgetCents: number;
  readonly missionId: string;
  readonly objective: string;
  readonly publisher: {
    readonly platforms: readonly ("instagram" | "tiktok")[];
    readonly scheduledFor: string;
  };
  readonly researchMissionId?: string;
  readonly researchPacks: readonly [AgentCompanyResearchPackRequest, AgentCompanyResearchPackRequest, AgentCompanyResearchPackRequest];
  readonly workdayId: string;
}

export interface OperationalAgentGate {
  readonly findings: readonly string[];
  readonly gate: "COST" | "QUALITY" | "RISK";
  readonly score: number;
  readonly status: "BLOCKED" | "PASSED";
}

export interface AgentCompanyWorkItem {
  readonly agentId: OperationalAgentId;
  readonly attempts: number;
  readonly blocker?: string;
  readonly completedAt?: string;
  readonly costCents: number;
  readonly dependencies: readonly OperationalAgentId[];
  readonly durationMs: number;
  readonly executorId: string;
  readonly gates: readonly OperationalAgentGate[];
  readonly output?: JsonObject;
  readonly outputFingerprint?: string;
  readonly startedAt?: string;
  readonly status: AgentCompanyWorkItemStatus;
  readonly taskType: string;
  readonly workItemId: string;
}

export interface AgentCompanyWorkday {
  readonly actorId: string;
  readonly contractVersion: typeof OPERATIONAL_AGENT_COMPANY_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly externalActionsExecuted: false;
  readonly input: AgentCompanyWorkdayInput;
  readonly inputFingerprint: string;
  readonly status: AgentCompanyWorkdayStatus;
  readonly tasks: readonly AgentCompanyWorkItem[];
  readonly updatedAt: string;
  readonly version: number;
  readonly workdayId: string;
  readonly workspaceId: string;
}

export interface OperationalAgentMetrics {
  readonly agentId: OperationalAgentId;
  readonly acceptedFirstPassTasks: number;
  readonly averageQualityScore: number | "NOT_AVAILABLE";
  readonly blockedTasks: number;
  readonly completedTasks: number;
  readonly measuredCostCents: number;
  readonly measuredDurationMs: number;
  readonly revisionsRequired: number;
  readonly state: OperationalAgentState;
  readonly validationErrors: number;
}

const GLOBAL_FORBIDDEN = Object.freeze(["email", "external-contact", "merge", "deploy", "publication", "spend", "crm-write", "destructive-change"]);
const GATES = Object.freeze(["QUALITY", "RISK", "COST"] as const);

export const OPERATIONAL_AGENT_COMPANY_CATALOG: readonly OperationalAgentCatalogEntry[] = Object.freeze([
  entry("onlyway-assistant", "Onlyway Assistant", "Coordinamento della Missione e delle approvazioni", "mission.coordinate"),
  entry("research-agent", "Research Agent", "Acquisizione HTTPS autorizzata, snapshot immutabili, corroborazione e Evidence Pack", "research.compile-evidence-packs"),
  entry("business-agent", "Business Agent", "Confronto opportunità e Commercial Package", "business.compare-and-package"),
  entry("content-director", "Content Director", "Direzione editoriale evidence-led", "content.direct"),
  entry("content-producer", "Content Producer", "Produzione pacchetti Metodo Veloce", "content.produce"),
  entry("sales-agent", "Sales Agent", "Preparazione locale di sequenze e obiezioni", "sales.prepare-sequence"),
  entry("customer-delivery-agent", "Customer Delivery Agent", "Piano di consegna e checklist cliente", "delivery.prepare-plan"),
  entry("knowledge-curator", "Knowledge Curator", "Indice durevole di fonti, decisioni e artefatti", "knowledge.curate-index"),
  entry("developer-agent", "Developer Agent", "Change plan tecnico per branch isolato; nessun merge o deploy", "engineering.prepare-change-plan"),
  entry("finance-cost-analyst", "Finance / Cost Agent", "Verifica di economics e budget dichiarati", "finance.review-economics"),
  entry("legal-risk-reviewer", "Legal / Risk Agent", "Classificazione di claim, limiti e assunzioni", "risk.review-claims"),
  entry("publisher-agent", "Publisher Agent", "Calendario e dry-run idempotente, senza pubblicazione", "publishing.prepare-dry-run"),
  entry("quality-guardian", "Quality Guardian", "Attestazione della qualità degli output", "guardian.quality"),
  entry("risk-guardian", "Risk Guardian", "Blocco dei rischi non controllati", "guardian.risk"),
  entry("cost-guardian", "Cost Guardian", "Blocco degli sforamenti di budget", "guardian.cost"),
  entry("security-guardian", "Security Guardian", "Verifica dell'assenza di effetti esterni", "guardian.security"),
  entry("backup-guardian", "Backup Guardian", "Verifica della recuperabilità dello stato durevole", "guardian.backup"),
]);

function entry(agentId: OperationalAgentId, displayName: string, role: string, task: string): OperationalAgentCatalogEntry {
  return Object.freeze({
    agentId,
    displayName,
    executorId: `operational-${agentId}@1.0.0`,
    forbiddenActions: GLOBAL_FORBIDDEN,
    inputContractId: `${task}-input@1`,
    outputContractId: `${task}-output@1`,
    permissions: Object.freeze(["read-authorized-local-state", "write-durable-local-result"]),
    requiredGates: GATES,
    role,
    state: "READY" as const,
    supportedTasks: Object.freeze([task]),
    version: "1.0.0" as const,
  });
}
