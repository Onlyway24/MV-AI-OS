import type { AgentCompanyWorkday } from "../agent-company/operational-agent-company.js";
import type { BusinessMissionDossier } from "../business/business-mission.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import type { EvidencePack } from "../operational-planes/operational-plane.js";
import type { CommandCenterBusinessContextView } from "./reference-vault-view.js";

export const COMMAND_CENTER_REVENUE_CONTRACT_VERSION = "1" as const;

export type CommandCenterRevenueReasonCode =
  | "AGENT_WORKDAY_NOT_AVAILABLE"
  | "ATTRIBUTED_OUTCOME_NOT_AVAILABLE"
  | "BUSINESS_CONTEXT_REQUIRED"
  | "BUSINESS_MISSION_BLOCKED"
  | "BUSINESS_MISSION_REQUIRED"
  | "CONTROL_PLANE_COVERAGE_LIMITED"
  | "DELIVERY_RUN_NOT_AVAILABLE"
  | "ECONOMICS_INPUT_REQUIRED"
  | "EXTERNAL_ACTION_LOCKED"
  | "FABIO_REVIEW_REQUIRED"
  | "PIPELINE_AGGREGATE_NOT_AVAILABLE"
  | "THREE_EVIDENCE_PACKS_REQUIRED"
  | "VALIDATION_NOT_EXECUTED";

export type CommandCenterRevenueMetric =
  | Readonly<{
      classification: "CALCULATED_PLAN" | "FABIO_TARGET";
      currency: "EUR";
      provenance: string;
      status: "AVAILABLE";
      valueCents: number;
    }>
  | Readonly<{
      reasonCode: CommandCenterRevenueReasonCode;
      status: "NOT_AVAILABLE";
    }>;

export interface CommandCenterRevenueStage {
  readonly detail: string;
  readonly id: "ACQUISITION" | "DELIVERY" | "ECONOMICS" | "EVIDENCE" | "OFFER" | "PRODUCTION" | "SALES";
  readonly label: string;
  readonly reasonCode: CommandCenterRevenueReasonCode;
  readonly status: "BLOCKED" | "MEASURED" | "NOT_AVAILABLE" | "PLANNED" | "READY" | "REVIEW_REQUIRED";
  readonly value: string;
}

export interface CommandCenterRevenueReadinessItem {
  readonly detail: string;
  readonly id: "DELIVERY" | "ECONOMICS" | "FUNNEL" | "OFFER";
  readonly label: string;
  readonly reasonCode: CommandCenterRevenueReasonCode;
  readonly status: CommandCenterRevenueStage["status"];
}

export interface CommandCenterRevenueView {
  readonly activeMissionId?: string;
  readonly blockers: readonly Readonly<{
    readonly detail: string;
    readonly reasonCode: CommandCenterRevenueReasonCode;
  }>[];
  readonly contributionMarginCents: CommandCenterRevenueMetric;
  readonly contractVersion: typeof COMMAND_CENTER_REVENUE_CONTRACT_VERSION;
  readonly coverage: "COMPLETE" | "LIMIT_REACHED";
  readonly externalActions: "LOCKED";
  readonly nextAction: Readonly<{
    readonly detail: string;
    readonly href: "#business" | "#evidence" | "#production";
    readonly label: string;
  }>;
  readonly plannedRevenueCents: CommandCenterRevenueMetric;
  readonly readiness: readonly CommandCenterRevenueReadinessItem[];
  readonly reasonCode: CommandCenterRevenueReasonCode;
  readonly stages: readonly CommandCenterRevenueStage[];
  readonly state: "BLOCKED" | "READY" | "REVIEW_REQUIRED" | "SETUP_REQUIRED" | "VALIDATION_PLANNED";
  readonly targetMonthlyRevenueCents: CommandCenterRevenueMetric;
  readonly verifiedPipelineCents: CommandCenterRevenueMetric;
}

export function buildCommandCenterRevenueView(input: {
  readonly agentCompany: readonly AgentCompanyWorkday[];
  readonly businessContext: CommandCenterBusinessContextView | null;
  readonly businessMissions: readonly BusinessMissionDossier[];
  readonly coverage: "COMPLETE" | "LIMIT_REACHED";
  readonly evidencePacks: readonly EvidencePack[];
  readonly productions: readonly MetodoVeloceContentProductionRecord[];
}): CommandCenterRevenueView {
  const mission = selectMission(input.businessMissions);
  const evidenceCount = relevantEvidencePacks(mission, input.evidencePacks);
  const base = mission?.economics.find(({ name }) => name === "BASE");
  const economicsAvailable = base?.revenueCents.status === "CALCULATED"
    && base.contributionMarginCents.status === "CALCULATED";
  const missionApproved = mission?.status === "APPROVED";
  const missionPending = mission?.status === "PENDING_FABIO_APPROVAL";
  const target = targetMetric(input.businessContext);
  const plannedRevenue = calculatedPlanMetric(base?.revenueCents.value, mission?.mission.missionId, "BASE revenue plan");
  const contributionMargin = calculatedPlanMetric(base?.contributionMarginCents.value, mission?.mission.missionId, "BASE contribution margin");
  const pipeline = unavailable("PIPELINE_AGGREGATE_NOT_AVAILABLE");
  const state = revenueState(mission, economicsAvailable, evidenceCount, input.coverage);
  const reasonCode = primaryReasonCode(mission, economicsAvailable, evidenceCount, input.coverage);
  const stages = Object.freeze([
    stage("EVIDENCE", "Evidenze", evidenceCount >= 3 ? "READY" : "BLOCKED", `${String(evidenceCount)}/3 pack`, evidenceCount >= 3 ? "Evidence Pack minimi disponibili." : "Servono tre Evidence Pack distinti per il confronto opportunità.", evidenceCount >= 3 ? "EXTERNAL_ACTION_LOCKED" : "THREE_EVIDENCE_PACKS_REQUIRED"),
    stage("OFFER", "Offerta", missionApproved ? "READY" : missionPending ? "REVIEW_REQUIRED" : mission === undefined ? "NOT_AVAILABLE" : "BLOCKED", mission === undefined ? "—" : `${String(mission.commercialPlan.offer.tiers.length)} tier`, offerDetail(mission), missionPending ? "FABIO_REVIEW_REQUIRED" : mission === undefined ? "BUSINESS_MISSION_REQUIRED" : missionApproved ? "EXTERNAL_ACTION_LOCKED" : "BUSINESS_MISSION_BLOCKED"),
    stage("ECONOMICS", "Economics", economicsAvailable ? "READY" : "BLOCKED", economicsAvailable ? "BASE calcolato" : "—", economicsAvailable ? "Formule calcolate dagli input dichiarati; non sono ricavi effettivi." : "Prezzo, costi, capacità o volume non sono completi.", economicsAvailable ? "EXTERNAL_ACTION_LOCKED" : "ECONOMICS_INPUT_REQUIRED"),
    stage("ACQUISITION", "Acquisizione", mission === undefined ? "NOT_AVAILABLE" : "PLANNED", mission === undefined ? "—" : String(mission.commercialPlan.validation.length) + " test", mission === undefined ? "Nessun funnel autorevole disponibile." : "Landing, canali e script restano draft interni non eseguiti.", mission === undefined ? "BUSINESS_MISSION_REQUIRED" : "VALIDATION_NOT_EXECUTED"),
    stage("PRODUCTION", "Produzione", input.productions.length > 0 ? "MEASURED" : "NOT_AVAILABLE", input.productions.length > 0 ? String(input.productions.length) + " pack" : "—", input.productions.length > 0 ? "Pacchetti osservati; il collegamento a ricavi non è attribuito." : "Nessun pacchetto di produzione osservato.", "ATTRIBUTED_OUTCOME_NOT_AVAILABLE"),
    stage("SALES", "Vendita", "NOT_AVAILABLE", "—", "Lead, opportunità e vendite vinte non hanno ancora un aggregate autorevole.", "PIPELINE_AGGREGATE_NOT_AVAILABLE"),
    stage("DELIVERY", "Consegna", "NOT_AVAILABLE", "—", "Nessuna consegna cliente verificata è stata registrata.", "DELIVERY_RUN_NOT_AVAILABLE"),
  ]);
  const readiness = Object.freeze([
    readinessItem("OFFER", "Offerta", missionApproved ? "READY" : missionPending ? "REVIEW_REQUIRED" : mission === undefined ? "NOT_AVAILABLE" : "BLOCKED", offerDetail(mission), missionPending ? "FABIO_REVIEW_REQUIRED" : mission === undefined ? "BUSINESS_MISSION_REQUIRED" : missionApproved ? "EXTERNAL_ACTION_LOCKED" : "BUSINESS_MISSION_BLOCKED"),
    readinessItem("FUNNEL", "Funnel", mission === undefined ? "NOT_AVAILABLE" : "PLANNED", mission === undefined ? "Canali, landing e sequenze non disponibili." : `${String(mission.commercialPlan.acquisition.channels.length)} canale/i e ${String(mission.commercialPlan.validation.length)} esperimento/i preparati; esecuzione bloccata.`, mission === undefined ? "BUSINESS_MISSION_REQUIRED" : "VALIDATION_NOT_EXECUTED"),
    readinessItem("ECONOMICS", "Economics", economicsAvailable ? "READY" : "BLOCKED", economicsAvailable ? "Scenario BASE calcolato da input espliciti." : "Input economici incompleti; nessuno zero sostitutivo.", economicsAvailable ? "EXTERNAL_ACTION_LOCKED" : "ECONOMICS_INPUT_REQUIRED"),
    readinessItem("DELIVERY", "Consegna", "NOT_AVAILABLE", "Checklist pronta; capacità e run cliente non verificati.", "DELIVERY_RUN_NOT_AVAILABLE"),
  ]);
  const blockers = blockersFor({ coverage: input.coverage, economicsAvailable, evidenceCount, mission, workdays: input.agentCompany.length });
  return freeze({
    ...(mission === undefined ? {} : { activeMissionId: mission.mission.missionId }),
    blockers,
    contributionMarginCents: contributionMargin,
    contractVersion: COMMAND_CENTER_REVENUE_CONTRACT_VERSION,
    coverage: input.coverage,
    externalActions: "LOCKED" as const,
    nextAction: nextActionFor({ economicsAvailable, evidenceCount, mission }),
    plannedRevenueCents: plannedRevenue,
    readiness,
    reasonCode,
    stages,
    state,
    targetMonthlyRevenueCents: target,
    verifiedPipelineCents: pipeline,
  });
}

function selectMission(missions: readonly BusinessMissionDossier[]): BusinessMissionDossier | undefined {
  const rank: Readonly<Record<BusinessMissionDossier["status"], number>> = Object.freeze({
    APPROVED: 1,
    BLOCKED: 2,
    PENDING_FABIO_APPROVAL: 0,
    REJECTED: 4,
    REVISION_REQUESTED: 3,
  });
  return [...missions].sort((left, right) => rank[left.status] - rank[right.status] || Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.mission.missionId.localeCompare(right.mission.missionId))[0];
}

function relevantEvidencePacks(mission: BusinessMissionDossier | undefined, packs: readonly EvidencePack[]): number {
  const observedIds = new Set(packs.map(({ packId }) => packId));
  if (mission === undefined) return observedIds.size;
  return new Set(mission.evidencePackIds.filter((packId) => observedIds.has(packId))).size;
}

function targetMetric(context: CommandCenterBusinessContextView | null): CommandCenterRevenueMetric {
  const value = context?.revenueTargets;
  if (!record(value) || !exactKeys(value, ["contractVersion", "currency", "monthlyTargetCents", "sourceRef"]) || value.contractVersion !== "1" || value.currency !== "EUR" || !safeNonNegativeInteger(value.monthlyTargetCents) || !boundedText(value.sourceRef)) return unavailable("BUSINESS_CONTEXT_REQUIRED");
  return freeze({ classification: "FABIO_TARGET" as const, currency: "EUR" as const, provenance: value.sourceRef, status: "AVAILABLE" as const, valueCents: value.monthlyTargetCents });
}

function calculatedPlanMetric(value: number | undefined, missionId: string | undefined, label: string): CommandCenterRevenueMetric {
  return value === undefined || !Number.isSafeInteger(value) || missionId === undefined
    ? unavailable("ECONOMICS_INPUT_REQUIRED")
    : freeze({ classification: "CALCULATED_PLAN" as const, currency: "EUR" as const, provenance: `${missionId}:${label}`, status: "AVAILABLE" as const, valueCents: value });
}

function unavailable(reasonCode: CommandCenterRevenueReasonCode): CommandCenterRevenueMetric {
  return Object.freeze({ reasonCode, status: "NOT_AVAILABLE" as const });
}

function revenueState(mission: BusinessMissionDossier | undefined, economicsAvailable: boolean, evidenceCount: number, coverage: CommandCenterRevenueView["coverage"]): CommandCenterRevenueView["state"] {
  if (coverage === "LIMIT_REACHED") return "BLOCKED";
  if (mission === undefined) return "SETUP_REQUIRED";
  if (evidenceCount < 3) return "BLOCKED";
  if (mission.status === "PENDING_FABIO_APPROVAL") return "REVIEW_REQUIRED";
  if (mission.status !== "APPROVED" || !economicsAvailable) return "BLOCKED";
  return mission.commercialPlan.validation.length > 0 ? "VALIDATION_PLANNED" : "READY";
}

function primaryReasonCode(mission: BusinessMissionDossier | undefined, economicsAvailable: boolean, evidenceCount: number, coverage: CommandCenterRevenueView["coverage"]): CommandCenterRevenueReasonCode {
  if (coverage === "LIMIT_REACHED") return "CONTROL_PLANE_COVERAGE_LIMITED";
  if (mission === undefined) return "BUSINESS_MISSION_REQUIRED";
  if (evidenceCount < 3) return "THREE_EVIDENCE_PACKS_REQUIRED";
  if (mission.status === "PENDING_FABIO_APPROVAL") return "FABIO_REVIEW_REQUIRED";
  if (mission.status !== "APPROVED") return "BUSINESS_MISSION_BLOCKED";
  return economicsAvailable ? "VALIDATION_NOT_EXECUTED" : "ECONOMICS_INPUT_REQUIRED";
}

function nextActionFor(input: { readonly economicsAvailable: boolean; readonly evidenceCount: number; readonly mission: BusinessMissionDossier | undefined }): CommandCenterRevenueView["nextAction"] {
  if (input.evidenceCount < 3) return freeze({ detail: `Sono disponibili ${String(input.evidenceCount)} Evidence Pack distinti su 3 richiesti.`, href: "#evidence" as const, label: "Completa le evidenze" });
  if (input.mission === undefined) return freeze({ detail: "Crea una Business Mission usando tre opportunità supportate da evidenze.", href: "#business" as const, label: "Crea la Revenue Mission" });
  if (input.mission.status === "PENDING_FABIO_APPROVAL") return freeze({ detail: "Verifica opportunità, offerta, economics e gate dell'esatta versione.", href: "#business" as const, label: "Revisiona il dossier" });
  if (!input.economicsAvailable || input.mission.status !== "APPROVED") return freeze({ detail: "Risolvi input e gate bloccanti senza stimare valori mancanti.", href: "#business" as const, label: "Risolvi i blocker" });
  return freeze({ detail: "Gli esperimenti sono pianificati ma nessuna azione esterna è autorizzata.", href: "#business" as const, label: "Revisiona il piano di validazione" });
}

function blockersFor(input: { readonly coverage: CommandCenterRevenueView["coverage"]; readonly economicsAvailable: boolean; readonly evidenceCount: number; readonly mission: BusinessMissionDossier | undefined; readonly workdays: number }): CommandCenterRevenueView["blockers"] {
  const blockers: { detail: string; reasonCode: CommandCenterRevenueReasonCode }[] = [];
  if (input.coverage === "LIMIT_REACHED") blockers.push({ detail: "La finestra del control plane è parziale: i totali globali non sono determinabili.", reasonCode: "CONTROL_PLANE_COVERAGE_LIMITED" });
  if (input.evidenceCount < 3) blockers.push({ detail: `Mancano ${String(3 - input.evidenceCount)} Evidence Pack per confrontare tre opportunità.`, reasonCode: "THREE_EVIDENCE_PACKS_REQUIRED" });
  if (input.mission === undefined) blockers.push({ detail: "Nessuna Business Mission durevole definisce ancora offerta, acquisition ed economics.", reasonCode: "BUSINESS_MISSION_REQUIRED" });
  else if (input.mission.status === "PENDING_FABIO_APPROVAL") blockers.push({ detail: "Il dossier esatto richiede una decisione di Fabio.", reasonCode: "FABIO_REVIEW_REQUIRED" });
  else if (input.mission.status !== "APPROVED") blockers.push({ detail: "La Business Mission corrente non è approvata.", reasonCode: "BUSINESS_MISSION_BLOCKED" });
  if (input.mission !== undefined && !input.economicsAvailable) blockers.push({ detail: "Lo scenario BASE non è calcolabile dagli input disponibili.", reasonCode: "ECONOMICS_INPUT_REQUIRED" });
  if (input.workdays === 0) blockers.push({ detail: "Nessuna giornata Agent Company ha ancora prodotto un handoff commerciale completo.", reasonCode: "AGENT_WORKDAY_NOT_AVAILABLE" });
  blockers.push({ detail: "Pipeline, outcome attribuiti e delivery run restano NOT_AVAILABLE finché non esiste un aggregate autorevole.", reasonCode: "PIPELINE_AGGREGATE_NOT_AVAILABLE" });
  blockers.push({ detail: "Contatto, invio, spesa, firma, pagamento, pubblicazione e deploy restano bloccati.", reasonCode: "EXTERNAL_ACTION_LOCKED" });
  return freeze(blockers);
}

function offerDetail(mission: BusinessMissionDossier | undefined): string {
  if (mission === undefined) return "Offerta non disponibile: nessun dossier commerciale durevole.";
  if (mission.status === "PENDING_FABIO_APPROVAL") return "Promessa, scope e prezzo attendono la decisione esplicita di Fabio.";
  if (mission.status === "APPROVED") return "Offerta interna approvata; uso esterno ancora bloccato.";
  return "Il dossier è bloccato, rifiutato o richiede revisione.";
}

function stage(id: CommandCenterRevenueStage["id"], label: string, status: CommandCenterRevenueStage["status"], value: string, detail: string, reasonCode: CommandCenterRevenueReasonCode): CommandCenterRevenueStage {
  return freeze({ detail, id, label, reasonCode, status, value });
}

function readinessItem(id: CommandCenterRevenueReadinessItem["id"], label: string, status: CommandCenterRevenueStage["status"], detail: string, reasonCode: CommandCenterRevenueReasonCode): CommandCenterRevenueReadinessItem {
  return freeze({ detail, id, label, reasonCode, status });
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}
function safeNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function boundedText(value: unknown): value is string { return typeof value === "string" && value.length >= 1 && value.length <= 1_000 && value.trim() === value; }

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
