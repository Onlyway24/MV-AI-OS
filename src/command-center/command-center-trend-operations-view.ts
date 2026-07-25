import type {
  AgentCompanyWorkItemStatus,
  AgentCompanyWorkday,
  OperationalAgentId,
} from "../agent-company/operational-agent-company.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import type { SocialTrendObservation } from "../social-intelligence-live/social-intelligence-live.js";
import {
  deepFreezeTrend,
  type TrendConnectorReceipt,
  type TrendSignalFamily,
  type TrendSourceAcquisitionMode,
  type TrendSourceAccessRequirement,
  type TrendSourceKey,
} from "../trend-intelligence/trend-intelligence-contract.js";
import {
  buildTrendIntelligenceReadModel,
  type TrendAgentObservedWork,
  type TrendIntelligenceSourceView,
  type TrendObservedWorkState,
  type TrendOperatorCellId,
  type TrendPipelineStageView,
} from "../trend-intelligence/trend-intelligence-read-model.js";
import {
  PREMIUM_TREND_SOURCE_CATALOG,
} from "../trend-intelligence/trend-source-catalog.js";

export type CommandCenterTrendPolicyStatus =
  | "AUTHORIZED"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_REGISTERED";
export type CommandCenterTrendCapabilityStatus =
  | "CATALOGUED"
  | "DISABLED";
export type CommandCenterTrendConnectorStatus =
  | "BLOCKED"
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "RECEIPT_BACKED"
  | "RECONCILIATION_PENDING";
export type CommandCenterTrendDataStatus = TrendIntelligenceSourceView["dataState"];
export type CommandCenterTrendAgentCallSign =
  | "AEGIS"
  | "ARCHIVE"
  | "BRIDGE"
  | "CIPHER"
  | "FORGE"
  | "LAUNCH"
  | "LEDGER"
  | "NEXUS"
  | "ORACLE"
  | "PRIME"
  | "PRISM"
  | "PULSE"
  | "SCALE"
  | "SENTINEL"
  | "TITAN"
  | "VAULT"
  | "VECTOR";

export interface CommandCenterTrendOperationsView {
  readonly candidates: readonly CommandCenterTrendCandidateView[];
  readonly cells: readonly CommandCenterTrendOperatorCellView[];
  readonly contractVersion: "1";
  readonly externalWrites: "LOCKED";
  readonly generatedAt: string;
  readonly pipeline: readonly CommandCenterTrendPipelineStageView[];
  readonly publication: "LOCKED";
  readonly sources: readonly CommandCenterTrendSourceView[];
  readonly summary: {
    readonly authorizedPolicies: number;
    readonly cataloguedCapabilities: number;
    readonly dataStatus: CommandCenterTrendDataStatus;
    readonly freshSources: number;
    readonly receiptBackedConnectors: number;
  };
}

export interface CommandCenterTrendPipelineStageView {
  readonly index: string;
  readonly nextAction: string;
  readonly owners: readonly string[];
  readonly stageId: TrendPipelineStageView["stageId"];
  readonly state: TrendPipelineStageView["status"];
  readonly title: string;
}

export interface CommandCenterTrendOperatorCellView {
  readonly callSign: TrendOperatorCellId;
  readonly capabilityReady: number;
  readonly nextAction: string;
  readonly observedWorkCount: number;
  readonly operatorCallSigns: readonly CommandCenterTrendAgentCallSign[];
  readonly operatorCount: number;
  readonly reasonCode:
    | "CAPABILITY_READY_NO_WORK_OBSERVED"
    | "OPERATOR_CAPABILITY_BLOCKED"
    | "WORK_BLOCKED"
    | "WORK_COMPLETED"
    | "WORK_QUEUED"
    | "WORK_RUNNING";
  readonly state:
    | "BLOCKED"
    | "CAPABILITY_READY"
    | "COMPLETED"
    | "QUEUED"
    | "RUNNING";
  readonly title: string;
}

export interface CommandCenterTrendCandidateView {
  readonly candidateId: string;
  readonly independentSourceCount: number;
  readonly publication: "LOCKED";
  readonly reasonCode:
    | "CORROBORATED_AWAITING_FABIO"
    | "CORROBORATING_SOURCE_REQUIRED"
    | "SOURCE_REGISTRY_ENTRY_REQUIRED";
  readonly sourceFamilies: readonly TrendSignalFamily[];
  readonly status: "AWAITING_FABIO" | "BLOCKED";
  readonly title: string;
}

export interface CommandCenterTrendSourceView {
  readonly accessLevel: TrendSourceAccessRequirement;
  readonly capabilities: readonly string[];
  readonly capabilityStatus: CommandCenterTrendCapabilityStatus;
  readonly connectorStatus: CommandCenterTrendConnectorStatus;
  readonly dataStatus: CommandCenterTrendDataStatus;
  readonly latestReceipt?: {
    readonly reasonCode: TrendConnectorReceipt["diagnostic"]["reasonCode"];
    readonly receiptId: string;
    readonly recordedAt: string;
    readonly status: TrendConnectorReceipt["status"];
  };
  readonly limitation: string;
  readonly name: string;
  readonly policyStatus: CommandCenterTrendPolicyStatus;
  readonly sourceId: string;
  readonly sourceKey: TrendSourceKey;
  readonly tier: "AUTHORIZED" | "ENTERPRISE" | "PUBLIC" | "RESEARCH";
}

const TREND_AGENT_CALL_SIGNS: Readonly<Record<OperationalAgentId, CommandCenterTrendAgentCallSign>> = Object.freeze({
  "backup-guardian": "VAULT",
  "business-agent": "VECTOR",
  "content-director": "PRISM",
  "content-producer": "FORGE",
  "cost-guardian": "SCALE",
  "customer-delivery-agent": "BRIDGE",
  "developer-agent": "TITAN",
  "finance-cost-analyst": "LEDGER",
  "knowledge-curator": "ARCHIVE",
  "legal-risk-reviewer": "AEGIS",
  "onlyway-assistant": "NEXUS",
  "publisher-agent": "LAUNCH",
  "quality-guardian": "PRIME",
  "research-agent": "ORACLE",
  "risk-guardian": "SENTINEL",
  "sales-agent": "PULSE",
  "security-guardian": "CIPHER",
});

export function buildCommandCenterTrendOperationsView(input: {
  readonly actorId: string;
  readonly generatedAt: string;
  readonly receipts: readonly TrendConnectorReceipt[];
  readonly socialTrends: readonly SocialTrendObservation[];
  readonly sources: readonly SourceRegistryEntry[];
  readonly workdays: readonly AgentCompanyWorkday[];
  readonly workspaceId: string;
}): CommandCenterTrendOperationsView {
  const readModel = buildTrendIntelligenceReadModel({
    actorId: input.actorId,
    agentWork: latestObservedAgentWork(input.workdays),
    generatedAt: input.generatedAt,
    receipts: input.receipts,
    socialTrends: input.socialTrends,
    sources: input.sources,
    workspaceId: input.workspaceId,
  });
  const catalog = new Map(PREMIUM_TREND_SOURCE_CATALOG.map((source) => [source.sourceId, source]));
  const sourceViews = readModel.sources.map((source): CommandCenterTrendSourceView => {
    const definition = catalog.get(source.sourceId);
    if (definition === undefined) throw new Error("Command Center Trend source is absent from the canonical catalog");
    return {
      accessLevel: definition.accessRequirement,
      capabilities: definition.dataClasses,
      capabilityStatus: definition.providerRuntime === "DISABLED" ? "DISABLED" : "CATALOGUED",
      connectorStatus: connectorStatus(source),
      dataStatus: source.dataState,
      ...(source.latestReceipt === undefined ? {} : {
        latestReceipt: {
          reasonCode: source.latestReceipt.reasonCode,
          receiptId: source.latestReceipt.receiptId,
          recordedAt: source.latestReceipt.recordedAt,
          status: source.latestReceipt.status,
        },
      }),
      limitation: definition.termsNote,
      name: definition.displayName,
      policyStatus: source.registrationState,
      sourceId: definition.sourceId,
      sourceKey: definition.sourceKey,
      tier: sourceTier(definition.accessRequirement, definition.acquisitionMode),
    };
  });
  const cells = readModel.cells.map((cell): CommandCenterTrendOperatorCellView => {
    const observedWorkCount = cell.members.filter(({ observedWorkState }) => observedWorkState !== "NOT_OBSERVED").length;
    const capabilityReady = cell.members.filter(({ capabilityState }) => capabilityState === "READY").length;
    const state = cellState(cell.capabilityState, cell.observedWorkState);
    const reasonCode = cellReasonCode(cell.capabilityState, cell.observedWorkState);
    return {
      callSign: cell.cellId,
      capabilityReady,
      nextAction: cellNextAction(reasonCode),
      observedWorkCount,
      operatorCallSigns: cell.members.map(({ agentId }) => TREND_AGENT_CALL_SIGNS[agentId]),
      operatorCount: cell.members.length,
      reasonCode,
      state,
      title: cell.title,
    };
  });
  const candidates = readModel.candidates.slice(0, 3).map((candidate): CommandCenterTrendCandidateView => ({
    candidateId: candidate.candidateId,
    independentSourceCount: candidate.sourceCount,
    publication: "LOCKED",
    reasonCode: candidate.status === "CORROBORATED"
      ? "CORROBORATED_AWAITING_FABIO"
      : candidate.status === "MISSING_PROVENANCE"
        ? "SOURCE_REGISTRY_ENTRY_REQUIRED"
        : "CORROBORATING_SOURCE_REQUIRED",
    sourceFamilies: candidate.sourceFamilies,
    status: candidate.decisionState,
    title: candidate.topic,
  }));
  const freshSources = sourceViews.filter(({ dataStatus }) => dataStatus === "FRESH").length;
  const networkDataStatus = sourceViews.some(({ dataStatus: state }) => state === "RECONCILIATION_PENDING")
    ? "RECONCILIATION_PENDING" as const
    : sourceViews.some(({ dataStatus: state }) => state === "INVALID")
      ? "INVALID" as const
      : freshSources > 0
        ? "FRESH" as const
        : sourceViews.some(({ dataStatus: state }) => state === "STALE")
          ? "STALE" as const
          : "NOT_OBSERVED" as const;

  return deepFreezeTrend({
    candidates,
    cells,
    contractVersion: "1",
    externalWrites: "LOCKED",
    generatedAt: readModel.generatedAt,
    pipeline: readModel.pipeline.map((stage) => ({
      index: stage.index,
      nextAction: stage.detail,
      owners: pipelineOwners(stage.stageId),
      stageId: stage.stageId,
      state: stage.status,
      title: stage.title,
    })),
    publication: "LOCKED",
    sources: sourceViews,
    summary: {
      authorizedPolicies: sourceViews.filter(({ policyStatus }) => policyStatus === "AUTHORIZED").length,
      cataloguedCapabilities: sourceViews.filter(({ capabilityStatus }) => capabilityStatus === "CATALOGUED").length,
      dataStatus: networkDataStatus,
      freshSources,
      receiptBackedConnectors: sourceViews.filter(({ connectorStatus: state }) => state === "RECEIPT_BACKED").length,
    },
  });
}

export function latestObservedAgentWork(workdays: readonly AgentCompanyWorkday[]): readonly TrendAgentObservedWork[] {
  const latest = new Map<OperationalAgentId, TrendAgentObservedWork>();
  for (const workday of workdays) {
    for (const task of workday.tasks) {
      const observedAt = task.completedAt ?? task.startedAt ?? workday.updatedAt;
      const candidate: TrendAgentObservedWork = {
        agentId: task.agentId,
        observedAt,
        state: observedWorkState(task.status),
      };
      const current = latest.get(task.agentId);
      if (current === undefined || candidate.observedAt > current.observedAt) latest.set(task.agentId, candidate);
    }
  }
  return deepFreezeTrend([...latest.values()].sort((left, right) => left.agentId.localeCompare(right.agentId)));
}

function observedWorkState(state: AgentCompanyWorkItemStatus): Exclude<TrendObservedWorkState, "NOT_OBSERVED"> {
  return state;
}

function connectorStatus(source: TrendIntelligenceSourceView): CommandCenterTrendConnectorStatus {
  if (source.connectorState === "READY") return "RECEIPT_BACKED";
  return source.connectorState;
}

function sourceTier(
  access: TrendSourceAccessRequirement,
  acquisitionMode: TrendSourceAcquisitionMode,
): CommandCenterTrendSourceView["tier"] {
  if (access === "LICENSE_REQUIRED" || acquisitionMode === "COMMERCIAL_PROVIDER") return "ENTERPRISE";
  if (access === "PUBLIC_OFFICIAL_ENDPOINT") return "PUBLIC";
  if (access === "AUTHORIZED_IMPORT_REQUIRED"
    || acquisitionMode === "OFFICIAL_EXPORT"
    || acquisitionMode === "OPERATOR_RESEARCH") return "RESEARCH";
  return "AUTHORIZED";
}

function cellState(
  capabilityState: "BLOCKED" | "READY",
  observedWorkState: TrendObservedWorkState,
): CommandCenterTrendOperatorCellView["state"] {
  if (capabilityState === "BLOCKED" || observedWorkState === "BLOCKED") return "BLOCKED";
  if (observedWorkState === "RUNNING") return "RUNNING";
  if (observedWorkState === "QUEUED") return "QUEUED";
  if (observedWorkState === "COMPLETED") return "COMPLETED";
  return "CAPABILITY_READY";
}

function cellReasonCode(
  capabilityState: "BLOCKED" | "READY",
  observedWorkState: TrendObservedWorkState,
): CommandCenterTrendOperatorCellView["reasonCode"] {
  if (capabilityState === "BLOCKED") return "OPERATOR_CAPABILITY_BLOCKED";
  if (observedWorkState === "BLOCKED") return "WORK_BLOCKED";
  if (observedWorkState === "RUNNING") return "WORK_RUNNING";
  if (observedWorkState === "QUEUED") return "WORK_QUEUED";
  if (observedWorkState === "COMPLETED") return "WORK_COMPLETED";
  return "CAPABILITY_READY_NO_WORK_OBSERVED";
}

function cellNextAction(reasonCode: CommandCenterTrendOperatorCellView["reasonCode"]): string {
  switch (reasonCode) {
    case "OPERATOR_CAPABILITY_BLOCKED": return "Ripristina la capacità dell'operatore prima di assegnare lavoro.";
    case "WORK_BLOCKED": return "Risolvi il blocker durevole osservato; nessuna attività viene simulata.";
    case "WORK_RUNNING": return "Osserva il workday reale e conserva gate, budget e publication lock.";
    case "WORK_QUEUED": return "Attendi il runtime supervisionato o intervieni dal controllo operativo.";
    case "WORK_COMPLETED": return "Revisiona output ed evidenze prima di una decisione Fabio.";
    case "CAPABILITY_READY_NO_WORK_OBSERVED": return "Capacità disponibile; nessun workday Trend Intelligence è stato osservato.";
  }
}

function pipelineOwners(stageId: TrendPipelineStageView["stageId"]): readonly string[] {
  switch (stageId) {
    case "ACQUIRE": return ["Signal Acquisition"];
    case "NORMALIZE": return ["Signal Acquisition"];
    case "PROVENANCE": return ["Signal Acquisition", "Governance & Release"];
    case "CORROBORATE": return ["Market Synthesis", "Governance & Release"];
    case "TRANSLATE": return ["Creative Translation", "Delivery & Build"];
    case "FABIO_DECISION": return ["Mission Command", "Fabio"];
  }
}
