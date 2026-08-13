import { isBusinessDate } from "../contracts/business-calendar.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type {
  DailyOperatingBriefRecord,
  DailyOperatingBriefSections,
  DailyOperatingDecision,
  OperatingDatum,
} from "./daily-operating-brief.js";
import { DailyOperatingBriefRecordValidator, dailyOperatingBriefFingerprint } from "./daily-operating-brief-validator.js";

const FOUNDER_DECISION_LIMIT = 100;

export interface DailyOperatingBriefSourceSnapshot {
  readonly approvals?: readonly { readonly entityId: string; readonly entityType: string; readonly status: string }[] | undefined;
  readonly backup?: { readonly lastVerifiedAt?: string; readonly status: "ATTENTION_REQUIRED" | "READY" } | undefined;
  readonly blockedTasks?: readonly { readonly owner: string; readonly reasonCode: string; readonly taskId: string }[] | undefined;
  readonly businessMissions?: readonly { readonly missionId: string; readonly status: string }[] | undefined;
  readonly costs?: { readonly budgetCents?: number; readonly estimatedCostCents: number; readonly measuredCostCents: number; readonly reconciliation: "NOT_REQUIRED" | "PENDING" } | undefined;
  readonly evidence?: readonly { readonly evidenceId: string; readonly freshnessExpiresAt: string }[] | undefined;
  readonly externalEffects?: { readonly deployments: number; readonly messages: number; readonly paidCalls: number; readonly publications: number; readonly purchases: number } | undefined;
  readonly incidents?: readonly { readonly incidentId: string; readonly severity: string; readonly status: string; readonly summaryCode: string }[] | undefined;
  readonly production?: { readonly active: number; readonly deadLetter: number; readonly pendingFabio: number } | undefined;
  readonly runtime?: { readonly killSwitch: "LOCKED" | "TRIGGERED"; readonly maintenanceMode: "DISABLED" | "ENABLED"; readonly scheduler: "MISSING" | "READY" | "STALE"; readonly worker: "MISSING" | "READY" | "STALE" } | undefined;
  readonly social?: { readonly analyticsRecords: number; readonly records: number } | undefined;
  readonly workCompleted?: readonly { readonly completedAt: string; readonly identity: string; readonly kind: string }[] | undefined;
  readonly workInProgress?: readonly { readonly identity: string; readonly kind: string; readonly status: string }[] | undefined;
}

export interface DailyOperatingBriefSource {
  snapshot(
    repositories: RepositoryTransaction,
    identity: { readonly actorId: string; readonly workspaceId: string },
    asOf: Date,
    businessDate: string,
  ): Promise<DailyOperatingBriefSourceSnapshot>;
}

export class DailyOperatingBriefService {
  readonly #validator = new DailyOperatingBriefRecordValidator();
  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly repositories: RepositoryTransactionRunner;
    readonly source: DailyOperatingBriefSource;
    readonly workspaceId: string;
  }) {}

  public async generate(businessDate: string): Promise<DailyOperatingBriefRecord> {
    assertBusinessDate(businessDate);
    return this.dependencies.repositories.transaction(async (repositories) => {
      const existing = await repositories.dailyOperatingBriefs.getByBusinessDate(this.dependencies.workspaceId, businessDate);
      if (existing !== undefined) {
        if (existing.workspaceId !== this.dependencies.workspaceId || existing.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Daily Operating Brief identity conflicts with durable state");
      }
      const instant = this.dependencies.clock.now();
      const generatedAt = instant.toISOString();
      const snapshot = await this.dependencies.source.snapshot(repositories, { actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId }, instant, businessDate);
      const fresh = snapshot.evidence?.filter(({ freshnessExpiresAt }) => Date.parse(freshnessExpiresAt) > instant.getTime()).length ?? 0;
      const stale = (snapshot.evidence?.length ?? 0) - fresh;
      const decisions = decisionsFrom(snapshot);
      const decisionsWithinContract = decisions.length <= FOUNDER_DECISION_LIMIT;
      const runtime = snapshot.runtime;
      const systemStatus = runtime === undefined || snapshot.production === undefined || snapshot.backup?.status !== "READY" || snapshot.blockedTasks === undefined || snapshot.blockedTasks.length > 0 || snapshot.incidents === undefined || runtime.killSwitch === "TRIGGERED" || runtime.maintenanceMode === "ENABLED" || runtime.scheduler !== "READY" || runtime.worker !== "READY" || snapshot.production.deadLetter > 0 || snapshot.incidents.some(({ status }) => status !== "ACKNOWLEDGED") ? "ATTENTION_REQUIRED" as const : "READY" as const;
      const sections: DailyOperatingBriefSections = deepFreeze({
      approvalsRequired: snapshot.approvals === undefined ? unavailable([], generatedAt, ["content_productions", "business_mission_dossiers", "founder_workdays", "agent_company_workdays"], "Approval coverage is incomplete.") : measured(snapshot.approvals, generatedAt, ["content_productions", "business_mission_dossiers", "founder_workdays", "agent_company_workdays"]),
      backupState: snapshot.backup === undefined ? unavailable({ status: "UNKNOWN" as const }, generatedAt, ["operations_job_attempts:BACKUP_AND_RESTORE_VERIFICATION"], "Nessuna ricevuta di verifica backup è disponibile.") : measured(snapshot.backup, generatedAt, ["operations_job_attempts:BACKUP_AND_RESTORE_VERIFICATION"]),
      blockedTasks: snapshot.blockedTasks === undefined ? unavailable([], generatedAt, ["agent_company_workdays", "founder_workdays", "operations_jobs"], "Blocked-task coverage is incomplete.") : measured(snapshot.blockedTasks, generatedAt, ["agent_company_workdays", "founder_workdays", "operations_jobs"]),
      businessMissions: snapshot.businessMissions === undefined ? unavailable([], generatedAt, ["business_mission_dossiers"], "Business Mission coverage is incomplete.") : measured(snapshot.businessMissions, generatedAt, ["business_mission_dossiers"]),
      costsAndBudgets: snapshot.costs === undefined ? unavailable({ budgetCents: "NOT_CONFIGURED" as const, estimatedCostCents: 0, measuredCostCents: 0, reconciliation: "PENDING" as const }, generatedAt, ["operations cost ledger"], "Cost ledger or budget configuration is unavailable; zero is not asserted as actual spend.") : measured({ budgetCents: snapshot.costs.budgetCents ?? "NOT_CONFIGURED" as const, estimatedCostCents: snapshot.costs.estimatedCostCents, measuredCostCents: snapshot.costs.measuredCostCents, reconciliation: snapshot.costs.reconciliation }, generatedAt, ["operations cost ledger"]),
      evidenceFreshness: snapshot.evidence === undefined ? unavailable({ fresh: 0, stale: 0, total: 0 }, generatedAt, ["evidence_packs.min_freshness_expires_at", generatedAt], "Evidence Pack coverage is incomplete; displayed zeros are placeholders.") : measured({ fresh, stale, total: snapshot.evidence.length }, generatedAt, ["evidence_packs.min_freshness_expires_at", generatedAt]),
      externalActionsPerformed: snapshot.externalEffects === undefined ? unavailable({ deployments: 0, messages: 0, paidCalls: 0, publications: 0, purchases: 0 }, generatedAt, ["operations_job_attempts.external_effects"], "No complete external-effects receipt set is available; displayed zeros are placeholders, not measured claims.") : measured(snapshot.externalEffects, generatedAt, ["operations_job_attempts.external_effects", "publication_plans"]),
      incidents: snapshot.incidents === undefined ? unavailable([], generatedAt, ["operations_incidents"], "Incident aggregate is not available.") : measured(snapshot.incidents, generatedAt, ["operations_incidents"]),
      productionQueue: snapshot.production === undefined ? unavailable({ active: 0, deadLetter: 0, pendingFabio: 0 }, generatedAt, ["production_runtime_jobs", "metodo_veloce_content_productions"], "Production coverage is incomplete; displayed zeros are placeholders.") : measured(snapshot.production, generatedAt, ["production_runtime_jobs", "metodo_veloce_content_productions"]),
      recommendedFounderDecisions: snapshot.approvals === undefined || snapshot.blockedTasks === undefined || !decisionsWithinContract ? unavailable(decisionsWithinContract ? decisions : [], generatedAt, ["derived:approvals", "derived:blockers", "derived:dead-letter"], decisionsWithinContract ? "Decision coverage is incomplete because approval or blocker coverage is unavailable." : "Decision coverage exceeds the bounded contract; reconcile the complete source set before presenting recommendations.") : measured(decisions, generatedAt, ["derived:approvals", "derived:blockers", "derived:dead-letter"]),
      socialIntelligence: snapshot.social === undefined ? unavailable({ analyticsRecords: 0, records: 0, status: "INSUFFICIENT_DATA" as const }, generatedAt, ["social_intelligence_live_records"], "Social-intelligence coverage is incomplete; displayed zeros are placeholders.") : measured({ analyticsRecords: snapshot.social.analyticsRecords, records: snapshot.social.records, status: snapshot.social.analyticsRecords > 0 ? "READY" as const : "INSUFFICIENT_DATA" as const }, generatedAt, ["social_intelligence_live_records"]),
      systemHealth: runtime === undefined ? unavailable({ killSwitch: "UNKNOWN" as const, maintenanceMode: "UNKNOWN" as const, scheduler: "UNKNOWN" as const, status: systemStatus, worker: "UNKNOWN" as const }, generatedAt, ["operations_runtime_controls", "operations_process_leases"], "Scheduler and worker health receipts are unavailable.") : measured({ killSwitch: runtime.killSwitch, maintenanceMode: runtime.maintenanceMode, scheduler: runtime.scheduler, status: systemStatus, worker: runtime.worker }, generatedAt, ["operations_runtime_controls", "operations_process_leases"]),
      workCompleted: snapshot.workCompleted === undefined ? unavailable([], generatedAt, [`operations_jobs.updated_at:Europe/Rome:${businessDate}`, "agent_company_workdays", "founder_workdays"], "Completed-work coverage is incomplete.") : measured(snapshot.workCompleted, generatedAt, [`operations_jobs.updated_at:Europe/Rome:${businessDate}`, "agent_company_workdays", "founder_workdays"]),
      workInProgress: snapshot.workInProgress === undefined ? unavailable([], generatedAt, ["operations_jobs", "agent_company_workdays", "founder_workdays"], "In-progress work coverage is incomplete.") : measured(snapshot.workInProgress, generatedAt, ["operations_jobs", "agent_company_workdays", "founder_workdays"]),
    });
      if (existing !== undefined && sameSections(existing.sections, sections)) return existing;
      const version = (existing?.version ?? -1) + 1;
      const workspaceFingerprint = dailyOperatingBriefFingerprint(this.dependencies.workspaceId).slice(0, 12);
      const briefId = version === 0 ? `daily-brief-${businessDate}-${workspaceFingerprint}` : `daily-brief-${businessDate}-v${String(version)}-${workspaceFingerprint}`;
      const base = { actorId: this.dependencies.actorId, briefId, businessDate, contractVersion: "1" as const, generatedAt, publication: "INTERNAL_ONLY" as const, sections, version, workspaceId: this.dependencies.workspaceId };
      const record: DailyOperatingBriefRecord = deepFreeze({ ...base, fingerprint: dailyOperatingBriefFingerprint(base) });
      if (!this.#validator.validate(record).ok) throw new RepositoryConflictError("Daily Operating Brief output failed validation");
      await repositories.dailyOperatingBriefs.insert(record);
      await repositories.operationalEvents.append({ aggregateType: "DAILY_OPERATING_BRIEF", contractVersion: "1", entityId: record.briefId, entityVersion: record.version, eventId: `event-daily-${record.fingerprint.slice(0, 48)}`, eventType: "DAILY_BRIEF_GENERATED", occurredAt: generatedAt, safeSummaryCode: "daily_brief_generated", workspaceId: record.workspaceId });
      return record;
    });
  }

  public async inspect(briefId: string): Promise<DailyOperatingBriefRecord> {
    assertId(briefId);
    return this.dependencies.repositories.transaction(async ({ dailyOperatingBriefs }) => {
      const record = await dailyOperatingBriefs.getById(briefId);
      if (record?.workspaceId !== this.dependencies.workspaceId || record.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Daily Operating Brief is unavailable");
      return record;
    });
  }
}

function decisionsFrom(snapshot: DailyOperatingBriefSourceSnapshot): readonly DailyOperatingDecision[] {
  const decisions = new Map<string, DailyOperatingDecision>();
  const add = (decision: DailyOperatingDecision): void => { if (!decisions.has(decision.decisionId)) decisions.set(decision.decisionId, deepFreeze(decision)); };
  for (const approval of snapshot.approvals ?? []) add({ decisionId: boundedDecisionId("review", `${approval.entityType.toLowerCase().replace(/[^a-z0-9._-]/gu, "-")}-${approval.entityId}`), evidence: [`${approval.entityType}:${approval.entityId}:${approval.status}`], priority: "HIGH", question: `Revisionare ${approval.entityType} ${approval.entityId}?`, status: "OPEN" });
  for (const blocked of snapshot.blockedTasks ?? []) add({ decisionId: boundedDecisionId("unblock", blocked.taskId), evidence: [`${blocked.reasonCode}:${blocked.owner}`], priority: "HIGH", question: `Fornire o autorizzare l'input necessario per ${blocked.taskId}?`, status: "OPEN" });
  if ((snapshot.production?.deadLetter ?? 0) > 0) add({ decisionId: "review-dead-letter", evidence: [`deadLetter=${String(snapshot.production?.deadLetter ?? 0)}`], priority: "HIGH", question: "Ispezionare i job dead-letter prima di creare successor manuali?", status: "OPEN" });
  return deepFreeze([...decisions.values()]);
}

function boundedDecisionId(prefix: "review" | "unblock", identity: string): string {
  const candidate = `${prefix}-${identity}`;
  return candidate.length <= 128 ? candidate : `${prefix}-${dailyOperatingBriefFingerprint(identity).slice(0, 48)}`;
}

function measured<T>(value: T, asOf: string, provenance: readonly string[]): OperatingDatum<T> { return deepFreeze({ asOf, kind: "MEASURED" as const, provenance: [...provenance], value }); }
function unavailable<T>(value: T, asOf: string, provenance: readonly string[], limitation: string): OperatingDatum<T> { return deepFreeze({ asOf, kind: "UNAVAILABLE" as const, limitation, provenance: [...provenance], value }); }
function assertBusinessDate(value: string): void { if (!isBusinessDate(value)) throw new RepositoryConflictError("Daily Operating Brief business date is invalid"); }
function assertId(value: string): void { if (!/^[a-z0-9][a-z0-9@._-]{0,127}$/u.test(value)) throw new RepositoryConflictError("Daily Operating Brief identity is invalid"); }
function sameSections(left: DailyOperatingBriefSections, right: DailyOperatingBriefSections): boolean { return JSON.stringify(withoutAsOf(left)) === JSON.stringify(withoutAsOf(right)); }
function withoutAsOf(value: unknown): unknown { if (Array.isArray(value)) return value.map(withoutAsOf); if (typeof value !== "object" || value === null) return value; return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "asOf").map(([key, child]) => [key, withoutAsOf(child)])); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
