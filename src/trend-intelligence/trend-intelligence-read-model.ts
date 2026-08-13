import { OPERATIONAL_AGENT_COMPANY_CATALOG, OPERATIONAL_AGENT_IDS, type OperationalAgentId, type OperationalAgentState } from "../agent-company/operational-agent-company.js";
import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import type { SocialTrendObservation } from "../social-intelligence-live/social-intelligence-live.js";
import { buildTrendConsensusView, type TrendConsensusCandidate } from "./trend-consensus.js";
import { MAX_TREND_ITEMS_PER_REQUEST, MAX_TREND_RECEIPTS, TREND_INTELLIGENCE_CONTRACT_VERSION, deepFreezeTrend, type TrendConnectorReceipt, type TrendSignal, type TrendSourceCatalogEntry } from "./trend-intelligence-contract.js";
import { PREMIUM_TREND_SOURCE_CATALOG } from "./trend-source-catalog.js";

export const TREND_OPERATOR_CELL_IDS = Object.freeze([
  "MISSION_COMMAND",
  "SIGNAL_ACQUISITION",
  "MARKET_SYNTHESIS",
  "CREATIVE_TRANSLATION",
  "DELIVERY_BUILD",
  "GOVERNANCE_RELEASE",
] as const);

export type TrendOperatorCellId = typeof TREND_OPERATOR_CELL_IDS[number];
export type TrendObservedWorkState = "BLOCKED" | "COMPLETED" | "NOT_OBSERVED" | "QUEUED" | "RUNNING";

export interface TrendAgentObservedWork {
  readonly agentId: OperationalAgentId;
  readonly observedAt: string;
  readonly state: Exclude<TrendObservedWorkState, "NOT_OBSERVED">;
}

export interface TrendOperatorCellMemberView {
  readonly agentId: OperationalAgentId;
  readonly capabilityState: OperationalAgentState;
  readonly displayName: string;
  readonly observedWorkState: TrendObservedWorkState;
}

export interface TrendOperatorCellView {
  readonly agentIds: readonly OperationalAgentId[];
  readonly capabilityState: "BLOCKED" | "READY";
  readonly cellId: TrendOperatorCellId;
  readonly members: readonly TrendOperatorCellMemberView[];
  readonly mission: string;
  readonly observedWorkState: TrendObservedWorkState;
  readonly title: string;
}

export interface TrendIntelligenceSourceView {
  readonly accessRequirement: TrendSourceCatalogEntry["accessRequirement"];
  readonly connectorState: "BLOCKED" | "DISABLED" | "NOT_CONFIGURED" | "READY" | "RECONCILIATION_PENDING";
  readonly dataState: "FRESH" | "INVALID" | "NOT_OBSERVED" | "RECONCILIATION_PENDING" | "STALE";
  readonly displayName: string;
  readonly latestReceipt?: {
    readonly cost: TrendConnectorReceipt["cost"];
    readonly itemCount: number;
    readonly reasonCode: TrendConnectorReceipt["diagnostic"]["reasonCode"];
    readonly receiptId: string;
    readonly recordedAt: string;
    readonly status: TrendConnectorReceipt["status"];
  };
  readonly latestReasonCode?: TrendConnectorReceipt["diagnostic"]["reasonCode"];
  readonly licenseState: TrendSourceCatalogEntry["licenseState"];
  readonly observedSignalCount: number;
  readonly registrationState: "AUTHORIZED" | "CONFLICT" | "FORBIDDEN" | "NOT_REGISTERED";
  readonly sourceId: string;
  readonly sourceKey: TrendSourceCatalogEntry["sourceKey"];
}

export interface TrendPipelineStageView {
  readonly detail: string;
  readonly index: string;
  readonly stageId: "ACQUIRE" | "CORROBORATE" | "FABIO_DECISION" | "NORMALIZE" | "PROVENANCE" | "TRANSLATE";
  readonly status: "AWAITING_CORROBORATION" | "AWAITING_FABIO" | "BLOCKED" | "NOT_OBSERVED" | "OBSERVED";
  readonly title: string;
}

export interface TrendCandidateView extends TrendConsensusCandidate {
  readonly decisionState: "AWAITING_FABIO" | "BLOCKED";
  readonly publication: "LOCKED";
}

export interface TrendIntelligenceReadModel {
  readonly candidates: readonly TrendCandidateView[];
  readonly cells: readonly TrendOperatorCellView[];
  readonly contractVersion: typeof TREND_INTELLIGENCE_CONTRACT_VERSION;
  readonly externalWrites: "LOCKED";
  readonly generatedAt: string;
  readonly pipeline: readonly TrendPipelineStageView[];
  readonly publication: "LOCKED";
  readonly sources: readonly TrendIntelligenceSourceView[];
  readonly summary: {
    readonly catalogSources: number;
    readonly configuredConnectors: number;
    readonly corroboratedCandidates: number;
    readonly observedSignals: number;
    readonly reconciliationPending: number;
  };
}

interface CellDefinition {
  readonly agentIds: readonly OperationalAgentId[];
  readonly cellId: TrendOperatorCellId;
  readonly mission: string;
  readonly title: string;
}

export const TREND_OPERATOR_CELL_CATALOG: readonly CellDefinition[] = deepFreezeTrend([
  { agentIds: ["onlyway-assistant"], cellId: "MISSION_COMMAND", mission: "Definisce la domanda, conserva i gate e porta a Fabio solo decisioni verificabili.", title: "Mission Command" },
  { agentIds: ["research-agent", "knowledge-curator", "security-guardian"], cellId: "SIGNAL_ACQUISITION", mission: "Acquisisce segnali autorizzati, attribuisce provenienza e protegge il boundary.", title: "Signal Acquisition" },
  { agentIds: ["business-agent", "sales-agent", "finance-cost-analyst"], cellId: "MARKET_SYNTHESIS", mission: "Confronta evidenza, rilevanza commerciale ed economics senza inventare domanda.", title: "Market Synthesis" },
  { agentIds: ["content-director", "content-producer"], cellId: "CREATIVE_TRANSLATION", mission: "Traduce soltanto candidati corroborati in direzione e pacchetti locali.", title: "Creative Translation" },
  { agentIds: ["customer-delivery-agent", "developer-agent"], cellId: "DELIVERY_BUILD", mission: "Prepara delivery ed esperimenti reversibili senza deploy o effetti esterni.", title: "Delivery & Build" },
  { agentIds: ["legal-risk-reviewer", "quality-guardian", "risk-guardian", "cost-guardian", "backup-guardian", "publisher-agent"], cellId: "GOVERNANCE_RELEASE", mission: "Esegue i gate e mantiene distribuzione e pubblicazione bloccate fino a decisione Fabio.", title: "Governance & Release" },
]);

assertCellCoverage();

export function buildTrendIntelligenceReadModel(input: {
  readonly actorId: string;
  readonly agentWork?: readonly TrendAgentObservedWork[];
  readonly generatedAt: string;
  readonly receipts: readonly TrendConnectorReceipt[];
  readonly socialTrends: readonly SocialTrendObservation[];
  readonly sources: readonly SourceRegistryEntry[];
  readonly workspaceId: string;
}): TrendIntelligenceReadModel {
  validateInput(input);
  const receiptSignals = receiptBackedSignals(
    socialSignals(input.socialTrends, input.sources),
    input.receipts,
    input.sources,
  );
  const signals = receiptSignals.filter(({ retentionExpiresAt }) =>
    retentionExpiresAt === undefined || Date.parse(retentionExpiresAt) > Date.parse(input.generatedAt)
  );
  const consensus = buildTrendConsensusView({ generatedAt: input.generatedAt, maxCandidates: 3, signals, sources: input.sources });
  const sourceViews = PREMIUM_TREND_SOURCE_CATALOG.map((source) => sourceView(source, input, receiptSignals));
  const candidates = consensus.candidates.map((candidate): TrendCandidateView => deepFreezeTrend({
    ...candidate,
    decisionState: candidate.status === "CORROBORATED" ? "AWAITING_FABIO" : "BLOCKED",
    publication: "LOCKED",
  }));
  const cells = cellViews(input.agentWork ?? []);
  const readySources = sourceViews.filter(({ connectorState }) => connectorState === "READY").length;
  const corroborated = candidates.filter(({ status }) => status === "CORROBORATED").length;
  const reconciliationPending = sourceViews.filter(({ connectorState }) => connectorState === "RECONCILIATION_PENDING").length;
  return deepFreezeTrend({
    candidates,
    cells,
    contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
    externalWrites: "LOCKED",
    generatedAt: input.generatedAt,
    pipeline: pipeline({ candidates, readySources, signals }),
    publication: "LOCKED",
    sources: sourceViews,
    summary: {
      catalogSources: PREMIUM_TREND_SOURCE_CATALOG.length,
      configuredConnectors: readySources,
      corroboratedCandidates: corroborated,
      observedSignals: signals.length,
      reconciliationPending,
    },
  });
}

function sourceView(
  source: TrendSourceCatalogEntry,
  input: Parameters<typeof buildTrendIntelligenceReadModel>[0],
  signals: readonly TrendSignal[],
): TrendIntelligenceSourceView {
  const registrations = input.sources.filter(({ sourceId }) => sourceId === source.sourceId);
  const registration = registrations[0];
  const registrationState = registrations.length === 0
    ? "NOT_REGISTERED"
    : registrations.length > 1 ||
      registration?.actorId !== input.actorId ||
      registration.workspaceId !== input.workspaceId ||
      !referenceWithinCatalogBoundary(registration.canonicalReference, source.canonicalReference)
      ? "CONFLICT"
      : registration.status === "AUTHORIZED" && registration.category !== "FORBIDDEN"
        ? "AUTHORIZED"
        : "FORBIDDEN";
  const receipts = input.receipts.filter(({ sourceId }) => sourceId === source.sourceId).sort((left, right) => right.sequence - left.sequence);
  const latest = receipts[0];
  const unresolvedPending = receipts.some((receipt) =>
    receipt.status === "UNCERTAIN" &&
    !receipts.some((candidate) =>
      candidate.reconcilesReceiptId === receipt.receiptId &&
      candidate.status === "RECONCILED"
    )
  );
  const successfulExecution = source.providerRuntime === "CONFIGURABLE" &&
    registrationState === "AUTHORIZED" &&
    latest !== undefined &&
    receiptProvesSuccessfulExecution(latest, input.receipts);
  const connectorState = source.providerRuntime === "DISABLED"
    ? "DISABLED"
    : unresolvedPending
      ? "RECONCILIATION_PENDING"
      : latest === undefined
        ? "NOT_CONFIGURED"
        : successfulExecution
          ? "READY"
          : latest.status === "UNCERTAIN"
            ? "RECONCILIATION_PENDING"
            : "BLOCKED";
  const sourceSignals = signals.filter(({ sourceId }) => sourceId === source.sourceId);
  const receiptFingerprints = new Set(latest?.signalFingerprints ?? []);
  const receiptBacked = sourceSignals.filter(({ signalFingerprint }) => receiptFingerprints.has(signalFingerprint));
  const completeReceiptCoverage = receiptBacked.length === latest?.itemCount &&
    sourceSignals.length === latest.itemCount &&
    latest.signalFingerprints.every((fingerprint) =>
      sourceSignals.some(({ signalFingerprint }) => signalFingerprint === fingerprint)
    );
  const dataState = unresolvedPending
    ? "RECONCILIATION_PENDING"
    : latest === undefined
      ? "NOT_OBSERVED"
      : successfulExecution
        ? latest.itemCount === 0
          ? "NOT_OBSERVED"
          : !completeReceiptCoverage
          ? "INVALID"
          : receiptBacked.every((signal) => fresh(signal, input.generatedAt, registration?.maxFreshnessDays ?? 1))
            ? "FRESH"
            : "STALE"
        : "INVALID";
  return deepFreezeTrend({
    accessRequirement: source.accessRequirement,
    connectorState,
    dataState,
    displayName: source.displayName,
    ...(latest === undefined ? {} : {
      latestReceipt: {
        cost: latest.cost,
        itemCount: latest.itemCount,
        reasonCode: latest.diagnostic.reasonCode,
        receiptId: latest.receiptId,
        recordedAt: latest.recordedAt,
        status: latest.status,
      },
    }),
    ...(latest === undefined ? {} : { latestReasonCode: latest.diagnostic.reasonCode }),
    licenseState: source.licenseState,
    observedSignalCount: sourceSignals.length,
    registrationState,
    sourceId: source.sourceId,
    sourceKey: source.sourceKey,
  });
}

function cellViews(observed: readonly TrendAgentObservedWork[]): readonly TrendOperatorCellView[] {
  const work = new Map(observed.map((entry) => [entry.agentId, entry]));
  return TREND_OPERATOR_CELL_CATALOG.map((definition): TrendOperatorCellView => {
    const members = definition.agentIds.map((agentId): TrendOperatorCellMemberView => {
      const capability = OPERATIONAL_AGENT_COMPANY_CATALOG.find((entry) => entry.agentId === agentId);
      if (capability === undefined) throw new Error("Trend operator capability is unavailable");
      return deepFreezeTrend({
        agentId,
        capabilityState: capability.state,
        displayName: capability.displayName,
        observedWorkState: work.get(agentId)?.state ?? "NOT_OBSERVED",
      });
    });
    return deepFreezeTrend({
      agentIds: definition.agentIds,
      capabilityState: members.every(({ capabilityState }) => capabilityState === "READY") ? "READY" : "BLOCKED",
      cellId: definition.cellId,
      members,
      mission: definition.mission,
      observedWorkState: aggregateWork(members.map(({ observedWorkState }) => observedWorkState)),
      title: definition.title,
    });
  });
}

function pipeline(input: { readonly candidates: readonly TrendCandidateView[]; readonly readySources: number; readonly signals: readonly TrendSignal[] }): readonly TrendPipelineStageView[] {
  const provenanceComplete = input.candidates.length > 0;
  const corroborated = input.candidates.some(({ status }) => status === "CORROBORATED");
  return deepFreezeTrend([
    stage("01", "ACQUIRE", "Source access", input.readySources > 0 ? "OBSERVED" : "NOT_OBSERVED", `${String(input.readySources)} connector osservati READY; registrazione fonte da sola non vale.`),
    stage("02", "NORMALIZE", "Signal normalization", input.signals.length > 0 ? "OBSERVED" : "NOT_OBSERVED", `${String(input.signals.length)} segnali osservati e attribuiti.`),
    stage("03", "PROVENANCE", "Provenance gate", provenanceComplete ? "OBSERVED" : input.candidates.length > 0 ? "BLOCKED" : "NOT_OBSERVED", "Ogni candidato deve restare collegato a Source Registry e fingerprint."),
    stage("04", "CORROBORATE", "Cross-source consensus", corroborated ? "OBSERVED" : input.candidates.length > 0 ? "AWAITING_CORROBORATION" : "NOT_OBSERVED", "Nessuno score sintetico: servono fonti autorizzate distinte."),
    stage("05", "TRANSLATE", "Opportunity translation", "NOT_OBSERVED", "Il modello non simula interpretazione commerciale o lavoro agente."),
    stage("06", "FABIO_DECISION", "Founder decision", corroborated ? "AWAITING_FABIO" : "BLOCKED", "Fabio mantiene la decisione; publication ed external writes restano LOCKED."),
  ]);
}

function stage(index: string, stageId: TrendPipelineStageView["stageId"], title: string, status: TrendPipelineStageView["status"], detail: string): TrendPipelineStageView {
  return { detail, index, stageId, status, title };
}

function socialSignals(trends: readonly SocialTrendObservation[], sources: readonly SourceRegistryEntry[]): readonly TrendSignal[] {
  const sourceRegistry = new Map(sources.map((source) => [source.sourceId, source]));
  const sourceCatalog = new Map(PREMIUM_TREND_SOURCE_CATALOG.map((source) => [source.sourceId, source]));
  return deepFreezeTrend(trends.flatMap((trend): readonly TrendSignal[] => {
    const source = sourceCatalog.get(trend.sourceId);
    if (source === undefined) return [];
    const expectedPlatform = source.sourceKey === "GOOGLE_TRENDS"
      ? "GOOGLE_TRENDS"
      : source.sourceKey === "TIKTOK_CREATIVE_CENTER"
        ? "TIKTOK"
        : undefined;
    if (expectedPlatform === undefined || trend.platform !== expectedPlatform) return [];
    const registeredReference = sourceRegistry.get(trend.sourceId)?.canonicalReference ?? source.canonicalReference;
    const providerReference = source.sourceKey === "GOOGLE_TRENDS"
      ? googleLegacyProviderReference(trend.sourceFinalUrl, registeredReference)
      : persistableReferenceWithinBoundary(trend.sourceFinalUrl, registeredReference)
        ? trend.sourceFinalUrl
        : undefined;
    if (providerReference === undefined) return [];
    const payload = {
      attributionRequired: true,
      evidenceKind: trend.platform === "GOOGLE_TRENDS" ? "SEARCH_TERM" as const : "RANKING" as const,
      externalId: trend.recordId,
      observedAt: trend.observedAt,
      providerReference,
      ...(trend.publishedAt === undefined ? {} : { publishedAt: trend.publishedAt }),
      retentionExpiresAt: trend.expiresAt,
      rightsClass: "AGGREGATE" as const,
      signalFamily: trend.platform === "GOOGLE_TRENDS" ? "SEARCH_INTENT" as const : "ATTENTION_SIGNAL" as const,
      sourceId: trend.sourceId,
      sourceKey: source.sourceKey,
      summary: trend.approximateTraffic ?? "Segnale osservato; metrica quantitativa non disponibile.",
      tags: Object.freeze([]),
      territory: trend.territory,
      topic: trend.keyword,
    };
    return [{
      ...payload,
      signalFingerprint: canonicalSha256(payload),
      signalId: trend.recordId,
    }];
  }));
}

function receiptBackedSignals(
  signals: readonly TrendSignal[],
  receipts: readonly TrendConnectorReceipt[],
  sources: readonly SourceRegistryEntry[],
): readonly TrendSignal[] {
  const authorizedSourceIds = new Set(sources
    .filter((source) =>
      source.status === "AUTHORIZED" &&
      source.category !== "FORBIDDEN" &&
      PREMIUM_TREND_SOURCE_CATALOG.some((entry) =>
        entry.sourceId === source.sourceId &&
        entry.providerRuntime === "CONFIGURABLE" &&
        referenceWithinCatalogBoundary(source.canonicalReference, entry.canonicalReference)
      )
    )
    .map(({ sourceId }) => sourceId));
  const latestBySource = new Map<string, TrendConnectorReceipt>();
  for (const receipt of receipts) {
    const current = latestBySource.get(receipt.sourceId);
    if (current === undefined || receipt.sequence > current.sequence) {
      latestBySource.set(receipt.sourceId, receipt);
    }
  }
  const activeFingerprints = new Map<string, ReadonlySet<string>>();
  for (const [sourceId, receipt] of latestBySource) {
    if (authorizedSourceIds.has(sourceId) && receiptProvesSuccessfulExecution(receipt, receipts)) {
      const available = signals.filter(({ sourceId: signalSourceId }) =>
        signalSourceId === sourceId
      );
      const availableFingerprints = new Set(available.map(({ signalFingerprint }) =>
        signalFingerprint
      ));
      if (
        available.length === receipt.itemCount &&
        receipt.signalFingerprints.every((fingerprint) =>
          availableFingerprints.has(fingerprint)
        )
      ) {
        activeFingerprints.set(sourceId, new Set(receipt.signalFingerprints));
      }
    }
  }
  return deepFreezeTrend(signals.filter((signal) =>
    activeFingerprints.get(signal.sourceId)?.has(signal.signalFingerprint) === true
  ));
}

function aggregateWork(states: readonly TrendObservedWorkState[]): TrendObservedWorkState {
  if (states.includes("RUNNING")) return "RUNNING";
  if (states.includes("BLOCKED")) return "BLOCKED";
  if (states.includes("QUEUED")) return "QUEUED";
  if (states.length > 0 && states.every((state) => state === "COMPLETED")) return "COMPLETED";
  return "NOT_OBSERVED";
}

function validateInput(input: Parameters<typeof buildTrendIntelligenceReadModel>[0]): void {
  if (
    !identifier(input.actorId) ||
    !identifier(input.workspaceId) ||
    !timestamp(input.generatedAt) ||
    input.sources.length > 100 ||
    input.socialTrends.length > 500 ||
    input.receipts.length > MAX_TREND_RECEIPTS ||
    input.sources.some((source) => !record(source)) ||
    input.socialTrends.some((trend) => !record(trend)) ||
    input.receipts.some((receipt) => !record(receipt))
  ) throw new Error("Trend Intelligence read-model input is invalid");
  if (
    new Set(input.sources.map(({ sourceId }) => sourceId)).size !== input.sources.length ||
    input.sources.some(({ actorId, workspaceId }) => actorId !== input.actorId || workspaceId !== input.workspaceId) ||
    new Set(input.socialTrends.map(({ recordId }) => recordId)).size !== input.socialTrends.length ||
    input.socialTrends.some(({ actorId, workspaceId }) => actorId !== input.actorId || workspaceId !== input.workspaceId) ||
    new Set(input.receipts.map(({ receiptId }) => receiptId)).size !== input.receipts.length ||
    new Set(input.receipts.map(({ sequence, sourceId }) => `${sourceId}:${String(sequence)}`)).size !== input.receipts.length ||
    input.receipts.some((receipt) => !validReceipt(
      receipt,
      input.generatedAt,
      input.actorId,
      input.workspaceId,
    )) ||
    !receiptRelationshipsValid(input.receipts)
  ) throw new Error("Trend Intelligence read-model identity or receipt binding is invalid");
  const work = input.agentWork ?? [];
  if (work.length > OPERATIONAL_AGENT_IDS.length || new Set(work.map(({ agentId }) => agentId)).size !== work.length || work.some(({ agentId, observedAt }) => !OPERATIONAL_AGENT_IDS.includes(agentId) || !timestamp(observedAt))) throw new Error("Trend agent work observation is invalid");
}

function validReceipt(
  receipt: TrendConnectorReceipt,
  generatedAt: string,
  actorId: string,
  workspaceId: string,
): boolean {
  if (!record(receipt) || !record(receipt.diagnostic) || !record(receipt.cost) || !Array.isArray(receipt.signalFingerprints)) return false;
  const rawReceipt = receipt as unknown as Readonly<Record<string, unknown>>;
  const rawCost = receipt.cost as unknown as Readonly<Record<string, unknown>>;
  const source = PREMIUM_TREND_SOURCE_CATALOG.find(({ sourceKey }) => sourceKey === receipt.sourceKey);
  const keys = Object.keys(receipt).sort();
  const expectedKeys = [
    "actorId",
    "clientRequestId",
    "contractVersion",
    "cost",
    "diagnostic",
    "externalEffectOccurred",
    "externalWrites",
    "idempotencyKeyFingerprint",
    "itemCount",
    "operationId",
    ...(receipt.providerOperationId === undefined ? [] : ["providerOperationId"]),
    ...(receipt.providerRequestId === undefined ? [] : ["providerRequestId"]),
    "publication",
    "rawPayloadStored",
    "receiptId",
    ...(receipt.reconcilesReceiptId === undefined ? [] : ["reconcilesReceiptId"]),
    "recordedAt",
    ...(receipt.replayOfReceiptId === undefined ? [] : ["replayOfReceiptId"]),
    "requestFingerprint",
    "retryCount",
    "secretMaterialStored",
    "sequence",
    "signalFingerprints",
    "sourceId",
    "sourceKey",
    "status",
    "transportId",
    "workspaceId",
  ].sort();
  const diagnosticKeys = Object.keys(receipt.diagnostic).sort();
  const expectedDiagnosticKeys = [
    "reasonCode",
    "stage",
    ...(receipt.diagnostic.statusCode === undefined ? [] : ["statusCode"]),
  ].sort();
  const costKeys = Object.keys(receipt.cost).sort();
  const expectedCostKeys = rawCost.classification === "NO_PAID_CALL"
    ? ["amountUsd", "classification"]
    : ["classification"];
  const pending = rawCost.classification === "RECONCILIATION_PENDING";
  const terminalShape = receiptTerminalShapeValid(receipt);
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    diagnosticKeys.length === expectedDiagnosticKeys.length &&
    diagnosticKeys.every((key, index) => key === expectedDiagnosticKeys[index]) &&
    costKeys.length === expectedCostKeys.length &&
    costKeys.every((key, index) => key === expectedCostKeys[index]) &&
    source?.sourceId === receipt.sourceId &&
    receipt.actorId === actorId &&
    receipt.workspaceId === workspaceId &&
    rawReceipt.contractVersion === TREND_INTELLIGENCE_CONTRACT_VERSION &&
    rawReceipt.externalEffectOccurred === false &&
    rawReceipt.externalWrites === "LOCKED" &&
    rawReceipt.publication === "LOCKED" &&
    rawReceipt.rawPayloadStored === false &&
    rawReceipt.retryCount === 0 &&
    rawReceipt.secretMaterialStored === false &&
    identifier(receipt.clientRequestId) &&
    identifier(receipt.operationId) &&
    identifier(receipt.receiptId) &&
    identifier(receipt.transportId) &&
    (receipt.providerOperationId === undefined || identifier(receipt.providerOperationId)) &&
    (receipt.providerRequestId === undefined || identifier(receipt.providerRequestId)) &&
    (receipt.reconcilesReceiptId === undefined || identifier(receipt.reconcilesReceiptId)) &&
    (receipt.replayOfReceiptId === undefined || identifier(receipt.replayOfReceiptId)) &&
    hash(receipt.idempotencyKeyFingerprint) &&
    hash(receipt.requestFingerprint) &&
    receipt.signalFingerprints.every(hash) &&
    new Set(receipt.signalFingerprints).size === receipt.signalFingerprints.length &&
    timestamp(receipt.recordedAt) &&
    Date.parse(receipt.recordedAt) <= Date.parse(generatedAt) &&
    Number.isSafeInteger(receipt.itemCount) &&
    receipt.itemCount >= 0 &&
    receipt.itemCount <= MAX_TREND_ITEMS_PER_REQUEST &&
    receipt.itemCount === receipt.signalFingerprints.length &&
    Number.isSafeInteger(receipt.sequence) &&
    receipt.sequence >= 1 &&
    receipt.sequence <= MAX_TREND_RECEIPTS &&
    (receipt.diagnostic.statusCode === undefined ||
      (Number.isSafeInteger(receipt.diagnostic.statusCode) &&
        receipt.diagnostic.statusCode >= 100 &&
        receipt.diagnostic.statusCode <= 599)) &&
    pending === (receipt.status === "UNCERTAIN") &&
    (pending ||
      (rawCost.classification === "NO_PAID_CALL" &&
        rawCost.amountUsd === 0)) &&
    terminalShape;
}

function receiptProvesSuccessfulExecution(receipt: TrendConnectorReceipt, receipts: readonly TrendConnectorReceipt[]): boolean {
  if (receipt.status === "COMPLETED" || receipt.status === "RECONCILED") return true;
  if (receipt.status !== "REPLAYED" || receipt.replayOfReceiptId === undefined) return false;
  const original = receipts.find(({ receiptId }) => receiptId === receipt.replayOfReceiptId);
  return (original?.status === "COMPLETED" || original?.status === "RECONCILED") &&
    sameReceiptLineage(original, receipt) &&
    original.itemCount === receipt.itemCount &&
    sameStrings(original.signalFingerprints, receipt.signalFingerprints);
}

function receiptTerminalShapeValid(receipt: TrendConnectorReceipt): boolean {
  const emptyOutcome = receipt.itemCount === 0 && receipt.signalFingerprints.length === 0;
  switch (receipt.status) {
    case "COMPLETED":
      return receipt.diagnostic.reasonCode === "REQUEST_COMPLETED" &&
        receipt.diagnostic.stage === "VALIDATION" &&
        receipt.diagnostic.statusCode === 200 &&
        receipt.reconcilesReceiptId === undefined &&
        receipt.replayOfReceiptId === undefined;
    case "RECONCILED":
      return receipt.diagnostic.reasonCode === "RECONCILIATION_COMPLETED" &&
        receipt.diagnostic.stage === "RECONCILIATION" &&
        receipt.diagnostic.statusCode === 200 &&
        receipt.reconcilesReceiptId !== undefined &&
        receipt.replayOfReceiptId === undefined;
    case "REPLAYED":
      return receipt.diagnostic.reasonCode === "IDEMPOTENT_REPLAY" &&
        receipt.diagnostic.stage === "IDEMPOTENCY" &&
        receipt.diagnostic.statusCode === undefined &&
        receipt.replayOfReceiptId !== undefined &&
        receipt.reconcilesReceiptId === undefined;
    case "UNCERTAIN":
      return receipt.diagnostic.reasonCode === "RECONCILIATION_PENDING" &&
        (receipt.diagnostic.stage === "TRANSPORT" || receipt.diagnostic.stage === "RECONCILIATION") &&
        receipt.diagnostic.statusCode === undefined &&
        receipt.replayOfReceiptId === undefined &&
        emptyOutcome &&
        (receipt.diagnostic.stage === "TRANSPORT"
          ? receipt.reconcilesReceiptId === undefined
          : receipt.reconcilesReceiptId !== undefined);
    case "BLOCKED":
      return emptyOutcome &&
        receipt.replayOfReceiptId === undefined &&
        blockedReceiptShapeValid(receipt);
    case "FAILED":
      return emptyOutcome &&
        receipt.replayOfReceiptId === undefined &&
        failedReceiptShapeValid(receipt);
  }
}

function receiptRelationshipsValid(receipts: readonly TrendConnectorReceipt[]): boolean {
  const reconciliationTargets = receipts.flatMap(({ reconcilesReceiptId }) =>
    reconcilesReceiptId === undefined ? [] : [reconcilesReceiptId]
  );
  if (new Set(reconciliationTargets).size !== reconciliationTargets.length) return false;
  const byId = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
  return receipts.every((receipt) => {
    if (receipt.replayOfReceiptId !== undefined) {
      const original = byId.get(receipt.replayOfReceiptId);
      return original !== undefined &&
        original.sequence < receipt.sequence &&
        Date.parse(original.recordedAt) <= Date.parse(receipt.recordedAt) &&
        sameReceiptLineage(original, receipt) &&
        receiptProvesSuccessfulExecution(receipt, receipts);
    }
    if (receipt.reconcilesReceiptId !== undefined) {
      const original = byId.get(receipt.reconcilesReceiptId);
      return original?.status === "UNCERTAIN" &&
        original.providerOperationId !== undefined &&
        original.sequence < receipt.sequence &&
        Date.parse(original.recordedAt) <= Date.parse(receipt.recordedAt) &&
        sameReceiptLineage(original, receipt);
    }
    return receipt.status !== "RECONCILED";
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameReceiptLineage(
  left: TrendConnectorReceipt,
  right: TrendConnectorReceipt,
): boolean {
  return left.actorId === right.actorId &&
    left.workspaceId === right.workspaceId &&
    left.clientRequestId === right.clientRequestId &&
    left.idempotencyKeyFingerprint === right.idempotencyKeyFingerprint &&
    left.requestFingerprint === right.requestFingerprint &&
    left.sourceId === right.sourceId &&
    left.sourceKey === right.sourceKey &&
    left.transportId === right.transportId;
}

function blockedReceiptShapeValid(receipt: TrendConnectorReceipt): boolean {
  const { reasonCode, stage, statusCode } = receipt.diagnostic;
  if (reasonCode === "PREFLIGHT_BLOCKED") {
    return stage === "PREFLIGHT" &&
      statusCode === undefined &&
      receipt.reconcilesReceiptId === undefined;
  }
  if (reasonCode === "IDEMPOTENCY_CONFLICT") {
    return stage === "IDEMPOTENCY" &&
      statusCode === undefined &&
      receipt.reconcilesReceiptId === undefined;
  }
  if (reasonCode === "AUTHENTICATION_REQUIRED" || reasonCode === "AUTHORIZATION_REQUIRED") {
    const expectedStatus = reasonCode === "AUTHENTICATION_REQUIRED" ? 401 : 403;
    return statusCode === expectedStatus &&
      (receipt.reconcilesReceiptId === undefined
        ? stage === "TRANSPORT"
        : stage === "RECONCILIATION");
  }
  return false;
}

function failedReceiptShapeValid(receipt: TrendConnectorReceipt): boolean {
  const { reasonCode, stage, statusCode } = receipt.diagnostic;
  const providerStageValid = receipt.reconcilesReceiptId === undefined
    ? stage === "TRANSPORT"
    : stage === "RECONCILIATION";
  switch (reasonCode) {
    case "PROVIDER_RATE_LIMITED": return providerStageValid && statusCode === 429;
    case "PROVIDER_UNAVAILABLE": return providerStageValid && statusCode !== undefined && statusCode >= 500;
    case "PROVIDER_INVALID_REQUEST":
      return providerStageValid &&
        statusCode !== undefined &&
        statusCode < 500 &&
        ![401, 403, 429].includes(statusCode);
    case "INVALID_PROVIDER_RESPONSE":
      return (receipt.reconcilesReceiptId === undefined
        ? stage === "VALIDATION"
        : stage === "RECONCILIATION") &&
        (statusCode === undefined || statusCode === 200);
    case "RECONCILIATION_FAILED":
      return stage === "RECONCILIATION" &&
        receipt.reconcilesReceiptId !== undefined &&
        statusCode === undefined;
    case "TRANSPORT_FAILED":
      return stage === "TRANSPORT" &&
        receipt.reconcilesReceiptId === undefined &&
        statusCode === undefined;
    default:
      return false;
  }
}

function hash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function assertCellCoverage(): void {
  const mapped = TREND_OPERATOR_CELL_CATALOG.flatMap(({ agentIds }) => agentIds);
  if (mapped.length !== OPERATIONAL_AGENT_IDS.length || new Set(mapped).size !== OPERATIONAL_AGENT_IDS.length || OPERATIONAL_AGENT_IDS.some((agentId) => !mapped.includes(agentId))) throw new Error("Trend operator cell catalog must map every operational agent exactly once");
}

function identifier(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value);
}

function timestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function fresh(signal: TrendSignal, generatedAt: string, maxFreshnessDays: number): boolean {
  return Date.parse(generatedAt) - Date.parse(signal.observedAt) <= maxFreshnessDays * 86_400_000 &&
    (signal.retentionExpiresAt === undefined || Date.parse(signal.retentionExpiresAt) > Date.parse(generatedAt));
}

function referenceWithinCatalogBoundary(value: string, boundary: string): boolean {
  return persistableReferenceWithinBoundary(value, boundary);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function persistableReferenceWithinBoundary(value: string | undefined, boundary: string): value is string {
  if (value === undefined) return false;
  try {
    const candidate = new URL(value);
    const canonical = new URL(boundary);
    const path = canonical.pathname.endsWith("/") ? canonical.pathname : `${canonical.pathname}/`;
    return candidate.protocol === "https:" &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.search === "" &&
      candidate.hash === "" &&
      candidate.hostname === canonical.hostname &&
      candidate.port === canonical.port &&
      (candidate.pathname === canonical.pathname || candidate.pathname.startsWith(path));
  } catch {
    return false;
  }
}

function googleLegacyProviderReference(
  value: string | undefined,
  boundary: string,
): string | undefined {
  try {
    const canonical = new URL(boundary);
    if (
      canonical.protocol !== "https:" ||
      canonical.username !== "" ||
      canonical.password !== "" ||
      canonical.search !== "" ||
      canonical.hash !== ""
    ) return undefined;
    if (value === undefined) return boundary;
    const candidate = new URL(value);
    const path = canonical.pathname.endsWith("/")
      ? canonical.pathname
      : `${canonical.pathname}/`;
    const queryKeys = [...candidate.searchParams.keys()];
    const queryAllowed = queryKeys.length <= 1 &&
      queryKeys.every((key) => key === "geo") &&
      [...candidate.searchParams.values()].every((entry) => /^[A-Z]{2}$/u.test(entry));
    if (
      candidate.protocol !== "https:" ||
      candidate.username !== "" ||
      candidate.password !== "" ||
      candidate.hash !== "" ||
      candidate.hostname !== canonical.hostname ||
      candidate.port !== canonical.port ||
      (candidate.pathname !== canonical.pathname &&
        !candidate.pathname.startsWith(path)) ||
      !queryAllowed
    ) return undefined;
    return boundary;
  } catch {
    return undefined;
  }
}
