import { RepositoryConflictError } from "../errors/core-error.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import {
  OPERATIONAL_AGENT_COMPANY_CATALOG,
  type OperationalAgentId,
} from "./operational-agent-company.js";
import {
  FOUNDER_WORKDAY_OBJECTIVE,
  type FounderWorkdayBlocker,
  type FounderWorkdayDecision,
  type FounderWorkdayRecord,
  type FounderWorkdayTask,
} from "./founder-workday.js";
import { FounderWorkdayRecordValidator, founderWorkdayFingerprint } from "./founder-workday-validator.js";

export interface FounderWorkdayStateSnapshot {
  readonly businessMissions: readonly { readonly missionId: string; readonly status: string }[];
  readonly coverage: {
    readonly businessMissions: "COMPLETE" | "LIMIT_REACHED";
    readonly evidencePacks: "COMPLETE" | "LIMIT_REACHED";
    readonly productions: "COMPLETE" | "LIMIT_REACHED";
    readonly socialRecords: "COMPLETE" | "LIMIT_REACHED";
  };
  readonly evidencePacks: readonly { readonly evidenceCount: number; readonly minFreshnessExpiresAt: string; readonly packId: string; readonly status: string }[];
  readonly productions: readonly { readonly productionId: string; readonly status: string }[];
  readonly socialRecords: readonly { readonly kind: string; readonly recordId: string }[];
}

export interface FounderWorkdayStateSource {
  snapshot(repositories: RepositoryTransaction, workspaceId: string): Promise<FounderWorkdayStateSnapshot>;
}

const DEPENDENCIES: Readonly<Record<OperationalAgentId, readonly OperationalAgentId[]>> = Object.freeze({
  "onlyway-assistant": [],
  "research-agent": ["onlyway-assistant"],
  "business-agent": ["research-agent"],
  "content-director": ["business-agent"],
  "content-producer": ["content-director"],
  "sales-agent": ["business-agent"],
  "customer-delivery-agent": ["business-agent"],
  "knowledge-curator": ["research-agent", "business-agent", "content-producer"],
  "developer-agent": ["onlyway-assistant"],
  "finance-cost-analyst": ["business-agent"],
  "legal-risk-reviewer": ["business-agent", "content-producer"],
  "quality-guardian": ["business-agent", "content-producer", "sales-agent", "customer-delivery-agent"],
  "risk-guardian": ["legal-risk-reviewer"],
  "cost-guardian": ["finance-cost-analyst"],
  "security-guardian": ["developer-agent", "publisher-agent"],
  "backup-guardian": ["knowledge-curator"],
  "publisher-agent": ["content-producer", "legal-risk-reviewer"],
});

const ASSIGNMENTS: Readonly<Record<OperationalAgentId, string>> = Object.freeze({
  "onlyway-assistant": "Coordinate the founder objective, inventory durable inputs and produce the decision dependency map.",
  "research-agent": "Verify three distinct, fresh Evidence Packs and document every missing evidence input without inventing market data.",
  "business-agent": "Perform opportunity analysis, business strategy and a validation plan from a real persisted Business Mission dossier.",
  "content-director": "Select the next evidence-backed editorial direction from the approved operating plan.",
  "content-producer": "Prepare the next internal Metodo Veloce production package through the gated production boundary.",
  "sales-agent": "Prepare a local sales sequence and objection map linked to the selected commercial opportunity; send nothing.",
  "customer-delivery-agent": "Prepare the delivery plan, acceptance checklist and customer boundaries for the selected offer.",
  "knowledge-curator": "Index evidence, decisions, outputs and provenance into the durable founder dossier.",
  "developer-agent": "Prepare bounded technical improvements with acceptance checks; do not merge or deploy.",
  "finance-cost-analyst": "Review economics, capital constraints and measured versus estimated operating costs.",
  "legal-risk-reviewer": "Review claims, evidence limitations, platform constraints and commercial risk.",
  "quality-guardian": "Evaluate completeness, provenance and usability of all workday outputs.",
  "risk-guardian": "Block unsafe, unsupported or externally effective proposals.",
  "cost-guardian": "Verify budget ceilings and reconcile measured costs without assuming missing provider usage.",
  "security-guardian": "Verify least privilege, redaction, publication lock and zero unauthorized external effects.",
  "backup-guardian": "Verify that the exact workday and its receipts can be restored after process restart.",
  "publisher-agent": "Prepare an idempotent Instagram/TikTok dry-run plan while keeping publication locked.",
});

export class FounderWorkdayService {
  readonly #validator = new FounderWorkdayRecordValidator();

  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly repositories: RepositoryTransactionRunner;
    readonly state: FounderWorkdayStateSource;
    readonly workspaceId: string;
  }) {}

  public run(workdayId: string, budgetCents = 0): Promise<FounderWorkdayRecord> {
    assertId(workdayId);
    assertBudget(budgetCents);
    return this.dependencies.repositories.transaction(async (repositories) => {
      const existing = await repositories.founderWorkdays.getById(workdayId);
      if (existing !== undefined) {
        if (existing.workspaceId !== this.dependencies.workspaceId || existing.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Founder workday identity conflicts with durable state");
      }
      const instant = this.dependencies.clock.now();
      const now = instant.toISOString();
      const snapshot = await this.dependencies.state.snapshot(repositories, this.dependencies.workspaceId);
      const freshPacks = snapshot.evidencePacks.filter(({ evidenceCount, minFreshnessExpiresAt, status }) => status === "READY" && evidenceCount >= 1 && Date.parse(minFreshnessExpiresAt) > instant.getTime());
    const missingPackCount = Math.max(0, 3 - freshPacks.length);
    const eligibleBusinessMissions = snapshot.businessMissions.filter(({ status }) => status === "APPROVED" || status === "PENDING_FABIO_APPROVAL");
    const missingBusiness = eligibleBusinessMissions.length === 0;
      const blocker = coverageBlocker(snapshot.coverage) ?? evidenceBlocker(freshPacks.map(({ packId }) => packId), missingPackCount, missingBusiness);
    const tasks = taskPlan(workdayId, blocker);
    const blockers = tasks.flatMap((task) => task.blocker === undefined ? [] : [task.blocker]);
    const decisions = decisionList(snapshot, blocker);
    const socialAnalytics = snapshot.socialRecords.filter(({ kind }) => kind === "ANALYTICS").length;
    const socialCount = snapshot.socialRecords.length;
    const candidateProductions = snapshot.productions.filter(({ status }) => status === "APPROVED_FOR_SCHEDULING" || status === "PENDING_FABIO_APPROVAL");
    const downstreamComplete = tasks.every(({ status }) => status === "COMPLETED");
    const blockedBy = blockers.length > 0 ? blockers.map(({ missingInput }) => missingInput) : downstreamComplete ? [] : ["Le receipt e le decisioni Gate dei task downstream non sono ancora disponibili."];
    const manifest = Object.freeze({
      agentIds: Object.freeze(OPERATIONAL_AGENT_COMPANY_CATALOG.map(({ agentId }) => agentId)),
      businessMissionIds: Object.freeze(snapshot.businessMissions.map(({ missionId }) => missionId)),
      dependencyGraph: Object.freeze(OPERATIONAL_AGENT_COMPANY_CATALOG.map(({ agentId }) => Object.freeze({ agentId, dependencies: DEPENDENCIES[agentId] }))),
      evidencePackIds: Object.freeze(snapshot.evidencePacks.map(({ packId }) => packId)),
      productionIds: Object.freeze(snapshot.productions.map(({ productionId }) => productionId)),
      socialRecordIds: Object.freeze(snapshot.socialRecords.map(({ recordId }) => recordId)),
    });
    const base = {
      actorId: this.dependencies.actorId,
      artifacts: Object.freeze({
        blockedWorkReport: Object.freeze({ blockedTaskIds: Object.freeze(tasks.filter(({ status }) => status === "BLOCKED").map(({ taskId }) => taskId)), blockers: Object.freeze(blockers) }),
        costSummary: Object.freeze({ budgetCents, coverage: "PREFLIGHT_ONLY" as const, estimatedCostCents: 0, measuredCostCents: 0, providerCalls: 0 as const }),
        decisionList: decisions,
        externalEffectsSummary: Object.freeze({ coverage: "PREFLIGHT_ONLY" as const, deployments: 0 as const, messages: 0 as const, paidCalls: 0 as const, publications: 0 as const, purchases: 0 as const }),
        founderDailyDossier: Object.freeze({
          businessMissions: datum(eligibleBusinessMissions.length, ["business_mission_dossiers:gate-eligible"], snapshot.coverage.businessMissions),
          evidencePacks: datum(snapshot.evidencePacks.length, ["evidence_packs"], snapshot.coverage.evidencePacks),
          freshEvidencePacks: datum(freshPacks.length, ["evidence_packs.min_freshness_expires_at", now], snapshot.coverage.evidencePacks),
          productionPackages: datum(snapshot.productions.length, ["metodo_veloce_content_productions"], snapshot.coverage.productions),
          socialAnalyticsRecords: Object.freeze({ kind: snapshot.coverage.socialRecords === "COMPLETE" && socialAnalytics > 0 ? "MEASURED" as const : "UNAVAILABLE" as const, provenance: Object.freeze(["social_intelligence_live_records.kind=ANALYTICS"]), value: socialAnalytics }),
          socialIntelligenceRecords: datum(socialCount, ["social_intelligence_live_records"], snapshot.coverage.socialRecords),
          summary: blockers.length === 0 ? "Gli input durevoli minimi sono disponibili; il piano può avanzare verso le boundary operative e i Gate." : `Giornata bloccata onestamente: ${blockedBy.join(" ")}`,
        }),
        nextDayProductionPlan: Object.freeze({ blockedBy: Object.freeze(blockedBy), candidateProductionIds: Object.freeze(candidateProductions.map(({ productionId }) => productionId)), mode: "INTERNAL_PACKAGE_ONLY" as const, publication: "LOCKED" as const, status: blockers.length === 0 && downstreamComplete ? "READY_FOR_FABIO" as const : "BLOCKED" as const }),
      }),
      contractVersion: "1" as const,
      manifest,
      objective: FOUNDER_WORKDAY_OBJECTIVE,
      // This aggregate is the durable operating-day preflight and dossier. It
      // never claims that Agent Company executors are running without their
      // own task receipts. A green preflight therefore waits for the bounded
      // execution decision instead of fabricating runtime activity.
      status: blockers.length > 0 ? "BLOCKED" as const : "AWAITING_FABIO" as const,
      tasks,
      updatedAt: now,
      version: existing === undefined ? 0 : existing.version + 1,
      workdayId,
      workspaceId: this.dependencies.workspaceId,
      createdAt: existing?.createdAt ?? now,
    };
    const record: FounderWorkdayRecord = deepFreeze({ ...base, fingerprint: founderWorkdayFingerprint(base) });
    if (!this.#validator.validate(record).ok) throw new RepositoryConflictError("Founder workday output failed validation");
      if (existing !== undefined && sameEvaluation(existing, record)) return existing;
      if (existing === undefined) await repositories.founderWorkdays.insert(record);
      else await repositories.founderWorkdays.update(record, { version: existing.version });
      const eventType = existing === undefined ? "FOUNDER_WORKDAY_CREATED" as const : "FOUNDER_WORKDAY_UPDATED" as const;
      await repositories.operationalEvents.append({ aggregateType: "FOUNDER_WORKDAY", contractVersion: "1", entityId: record.workdayId, entityVersion: record.version, eventId: `event-founder-${record.fingerprint.slice(0, 48)}`, eventType, occurredAt: now, safeSummaryCode: existing === undefined ? "founder_workday_created" : "founder_workday_updated", workspaceId: record.workspaceId });
      return record;
    });
  }

  public inspect(workdayId: string): Promise<FounderWorkdayRecord> {
    assertId(workdayId);
    return this.dependencies.repositories.transaction(async ({ founderWorkdays }) => {
      const record = await founderWorkdays.getById(workdayId);
      if (record?.workspaceId !== this.dependencies.workspaceId || record.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Founder workday is unavailable");
      return record;
    });
  }
}

function taskPlan(workdayId: string, blocker: FounderWorkdayBlocker | undefined): readonly FounderWorkdayTask[] {
  return Object.freeze(OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry) => {
    if (entry.agentId === "onlyway-assistant") {
      return Object.freeze({ agentId: entry.agentId, assignment: ASSIGNMENTS[entry.agentId], attempts: 0, costClass: "LOCAL_ZERO_COST" as const, decisionRequired: blocker === undefined || blocker.owner === "FABIO", dependencies: DEPENDENCIES[entry.agentId], department: entry.displayName, gateStatus: "AWAITING_INPUT" as const, status: blocker === undefined || blocker.owner === "FABIO" ? "AWAITING_FABIO" as const : "AWAITING_DEPENDENCY" as const, taskId: `${workdayId}-${entry.agentId}` });
    }
    if (entry.agentId === "research-agent" && blocker !== undefined) return Object.freeze({ agentId: entry.agentId, assignment: ASSIGNMENTS[entry.agentId], attempts: 0, blocker, costClass: "LOCAL_ZERO_COST" as const, decisionRequired: blocker.owner === "FABIO", dependencies: DEPENDENCIES[entry.agentId], department: entry.displayName, gateStatus: "BLOCKED" as const, status: "BLOCKED" as const, taskId: `${workdayId}-${entry.agentId}` });
    return Object.freeze({ agentId: entry.agentId, assignment: ASSIGNMENTS[entry.agentId], attempts: 0, costClass: "LOCAL_ZERO_COST" as const, decisionRequired: false, dependencies: DEPENDENCIES[entry.agentId], department: entry.displayName, gateStatus: "AWAITING_INPUT" as const, status: "AWAITING_DEPENDENCY" as const, taskId: `${workdayId}-${entry.agentId}` });
  }));
}

function evidenceBlocker(packIds: readonly string[], missingPackCount: number, missingBusiness: boolean): FounderWorkdayBlocker | undefined {
  if (missingPackCount === 0 && !missingBusiness) return undefined;
  const missing = [missingPackCount > 0 ? `${String(missingPackCount)} Evidence Pack distinti, freschi e sostanziali` : undefined, missingBusiness ? "un Business Mission dossier persistito" : undefined].filter((value): value is string => value !== undefined).join(" e ");
  return Object.freeze({ evidence: Object.freeze([`Evidence Pack reali disponibili: ${packIds.length === 0 ? "nessuno" : packIds.join(", ")}`, `Business Mission persistita: ${missingBusiness ? "nessuna" : "disponibile"}`]), missingInput: `Mancano ${missing}.`, nextAction: "Acquisire o validare gli input mancanti tramite le boundary autorizzate, quindi rieseguire la stessa workday identity.", owner: missingBusiness ? "FABIO" as const : "RESEARCH" as const, remediation: "Non duplicare Evidence Pack, non inventare metriche e non sostituire evidenze con assunzioni. Persistire soltanto nuovi input con provenienza verificabile." });
}

function coverageBlocker(coverage: FounderWorkdayStateSnapshot["coverage"]): FounderWorkdayBlocker | undefined {
  const incomplete = Object.entries(coverage).filter(([, state]) => state !== "COMPLETE").map(([name]) => name);
  if (incomplete.length === 0) return undefined;
  return Object.freeze({ evidence: Object.freeze(incomplete.map((name) => `Snapshot limit reached: ${name}`)), missingInput: "La copertura dello snapshot repository non è completa.", nextAction: "Aggiungere query aggregate o paginazione deterministica prima di valutare la giornata.", owner: "SYSTEM" as const, remediation: "Non presentare conteggi troncati come totali misurati e non avanzare i Gate con copertura parziale." });
}

function decisionList(snapshot: FounderWorkdayStateSnapshot, blocker: FounderWorkdayBlocker | undefined): readonly FounderWorkdayDecision[] {
  const decisions: FounderWorkdayDecision[] = [];
  if (blocker?.owner === "FABIO") decisions.push(Object.freeze({ decisionId: "founder-input-acquisition", evidence: blocker.evidence, owner: "FABIO", priority: "HIGH", question: "Fabio deve autorizzare o fornire gli input reali mancanti prima di proseguire con Business Mission e produzione?", status: "OPEN" }));
  if (blocker === undefined) decisions.push(Object.freeze({ decisionId: "founder-workday-execution", evidence: Object.freeze(["founder_workday:preflight-complete", "external_effects:locked"]), owner: "FABIO", priority: "HIGH", question: "Autorizzare l'avvio interno delle boundary Agent Company per questa versione esatta del piano?", status: "OPEN" }));
  for (const production of snapshot.productions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL")) decisions.push(Object.freeze({ decisionId: `review-${production.productionId}`, evidence: Object.freeze([`metodo_veloce_content_productions:${production.productionId}`]), owner: "FABIO", priority: "MEDIUM", question: `Revisionare il pacchetto ${production.productionId} nel Centro Approvazioni senza pubblicarlo?`, status: "OPEN" }));
  return Object.freeze(decisions);
}

function datum(value: number, provenance: readonly string[], coverage: "COMPLETE" | "LIMIT_REACHED") { return Object.freeze({ kind: coverage === "COMPLETE" ? "MEASURED" as const : "UNAVAILABLE" as const, provenance: Object.freeze([...provenance]), value }); }
function sameEvaluation(left: FounderWorkdayRecord, right: FounderWorkdayRecord): boolean {
  return JSON.stringify(evaluationView(left)) === JSON.stringify(evaluationView(right));
}
function evaluationView(record: FounderWorkdayRecord): unknown {
  return normalizeAsOf({ artifacts: record.artifacts, manifest: record.manifest, objective: record.objective, status: record.status, tasks: record.tasks }, record.updatedAt);
}
function normalizeAsOf(value: unknown, asOf: string): unknown {
  if (value === asOf) return "$AS_OF";
  if (Array.isArray(value)) return value.map((entry) => normalizeAsOf(entry, asOf));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeAsOf(entry, asOf)]));
}
function assertId(value: string): void { if (!/^[a-zA-Z0-9@._:-]{1,128}$/u.test(value)) throw new RepositoryConflictError("Founder workday identity is invalid"); }
function assertBudget(value: number): void { if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw new RepositoryConflictError("Founder workday budget is invalid"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
