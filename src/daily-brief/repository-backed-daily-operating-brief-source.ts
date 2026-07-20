import { businessDayWindow } from "../contracts/business-calendar.js";
import type { RepositoryTransaction } from "../persistence/repository-transaction.js";
import type {
  DailyOperatingBriefSource,
  DailyOperatingBriefSourceSnapshot,
} from "./daily-operating-brief-service.js";

const BUSINESS_LIMIT = 25;
const CONTENT_LIMIT = 25;
const EVIDENCE_LIMIT = 100;
const INCIDENT_LIMIT = 250;
const JOB_LIMIT = 250;
const SOCIAL_LIMIT = 500;
const WORKDAY_LIMIT = 25;
const LEASE_LIMIT = 100;
const BLOCKED_TASK_LIMIT = 500;
const WORK_ITEM_LIMIT = 500;

/**
 * Builds a bounded, fail-closed operating snapshot using the caller's active
 * transaction. A list returned at its limit is treated as incomplete rather
 * than being presented as a measured total.
 */
export class RepositoryBackedDailyOperatingBriefSource implements DailyOperatingBriefSource {
  public async snapshot(repositories: RepositoryTransaction, identity: { readonly actorId: string; readonly workspaceId: string }, asOf: Date, businessDate: string): Promise<DailyOperatingBriefSourceSnapshot> {
    const { workspaceId } = identity;
    const [businessMissions, contentProductions, evidencePacks, socialRecords, founderWorkdays, agentCompanyWorkdays, productionCounts, incidents, runtimeControl, schedulers, workers, jobs] = await Promise.all([
      repositories.businessMissions.listByWorkspaceId(workspaceId, BUSINESS_LIMIT),
      repositories.contentProductions.listByWorkspaceId(workspaceId, CONTENT_LIMIT),
      repositories.operationalPlanes.listEvidencePacksByWorkspaceId(workspaceId, EVIDENCE_LIMIT),
      repositories.operationalPlanes.listSocialLiveRecordsByWorkspaceId(workspaceId, SOCIAL_LIMIT),
      repositories.founderWorkdays.listByWorkspaceId(workspaceId, WORKDAY_LIMIT),
      repositories.agentCompanyWorkdays.listByOwner(identity, WORKDAY_LIMIT),
      repositories.productionRuntimeJobs.summarize(workspaceId),
      repositories.operationsControls.listIncidents(workspaceId, INCIDENT_LIMIT),
      repositories.operationsRuntime.getControl(workspaceId),
      repositories.operationsRuntime.listProcessLeases(workspaceId, "SCHEDULER", LEASE_LIMIT),
      repositories.operationsRuntime.listProcessLeases(workspaceId, "WORKER", LEASE_LIMIT),
      repositories.operationsRuntime.listJobsByWorkspaceId(workspaceId, JOB_LIMIT),
    ]);

    const approvalCoverage = complete(businessMissions, BUSINESS_LIMIT)
      && complete(contentProductions, CONTENT_LIMIT)
      && complete(founderWorkdays, WORKDAY_LIMIT)
      && complete(agentCompanyWorkdays, WORKDAY_LIMIT);
    const approvals = approvalCoverage
      ? Object.freeze([
        ...contentProductions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").map(({ productionId, status }) => frozen({ entityId: productionId, entityType: "CONTENT_PRODUCTION", status })),
        ...businessMissions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").map(({ mission, status }) => frozen({ entityId: mission.missionId, entityType: "BUSINESS_MISSION", status })),
        ...founderWorkdays.filter(({ status }) => status === "AWAITING_FABIO").map(({ status, workdayId }) => frozen({ entityId: workdayId, entityType: "FOUNDER_WORKDAY", status })),
        ...agentCompanyWorkdays.filter(({ status }) => status === "AWAITING_FABIO").map(({ status, workdayId }) => frozen({ entityId: workdayId, entityType: "AGENT_COMPANY_WORKDAY", status })),
      ])
      : undefined;
    const production = complete(contentProductions, CONTENT_LIMIT)
      ? frozen({
        active: productionCounts.queued + productionCounts.retryScheduled + productionCounts.running,
        deadLetter: productionCounts.deadLetter,
        pendingFabio: contentProductions.filter(({ status }) => status === "PENDING_FABIO_APPROVAL").length,
      })
      : undefined;
    const runtime = runtimeControl !== undefined && complete(schedulers, LEASE_LIMIT) && complete(workers, LEASE_LIMIT)
      ? frozen({
        killSwitch: runtimeControl.killSwitch === "ACTIVE" ? "TRIGGERED" as const : "LOCKED" as const,
        maintenanceMode: runtimeControl.maintenanceMode,
        scheduler: leaseState(schedulers, asOf),
        worker: leaseState(workers, asOf),
      })
      : undefined;
    const jobCoverage = complete(jobs, JOB_LIMIT);
    const workdayCoverage = complete(founderWorkdays, WORKDAY_LIMIT) && complete(agentCompanyWorkdays, WORKDAY_LIMIT);
    const backupJob = jobCoverage ? jobs.find(({ jobType }) => jobType === "BACKUP_AND_RESTORE_VERIFICATION") : undefined;
    const businessWindow = businessDayWindow(businessDate);
    const blockedTasks = [
      ...jobs.filter(({ status }) => status === "BLOCKED" || status === "DEAD_LETTER" || status === "FAILED").map(({ blockCode, failureCode, jobId, owner, status }) => frozen({ owner, reasonCode: blockCode ?? failureCode ?? status, taskId: jobId })),
      ...agentCompanyWorkdays.flatMap(({ tasks }) => tasks.filter(({ status }) => status === "BLOCKED").map(({ agentId, blocker, workItemId }) => frozen({ owner: blocker?.owner ?? agentId, reasonCode: blocker?.reasonCode ?? "AGENT_COMPANY_TASK_BLOCKED", taskId: workItemId }))),
      ...founderWorkdays.flatMap(({ tasks }) => tasks.filter(({ status }) => status === "BLOCKED").map(({ agentId, blocker, taskId }) => frozen({ owner: blocker?.owner ?? agentId, reasonCode: "FOUNDER_WORKDAY_INPUT_REQUIRED", taskId }))),
    ];
    const workCompleted = [
      ...jobs.filter(({ status, updatedAt }) => status === "COMPLETED" && inWindow(updatedAt, businessWindow)).map(({ jobId, jobType, updatedAt }) => frozen({ completedAt: updatedAt, identity: jobId, kind: jobType })),
      ...agentCompanyWorkdays.flatMap(({ tasks }) => tasks.flatMap((task) => {
        if (task.status !== "COMPLETED" || task.completedAt === undefined || !inWindow(task.completedAt, businessWindow)) return [];
        return [frozen({ completedAt: task.completedAt, identity: task.workItemId, kind: "AGENT_COMPANY_TASK" })];
      })),
      ...founderWorkdays.flatMap(({ tasks }) => tasks.flatMap((task) => {
        if (task.status !== "COMPLETED" || task.receipt === undefined || !inWindow(task.receipt.completedAt, businessWindow)) return [];
        return [frozen({ completedAt: task.receipt.completedAt, identity: task.taskId, kind: "FOUNDER_WORKDAY_TASK" })];
      })),
    ];
    const workInProgress = [
      ...jobs.filter(({ status }) => status === "QUEUED" || status === "RETRY_SCHEDULED" || status === "RUNNING").map(({ jobId, jobType, status }) => frozen({ identity: jobId, kind: jobType, status })),
      ...agentCompanyWorkdays.flatMap(({ tasks }) => tasks.filter(({ status }) => status === "QUEUED" || status === "RUNNING").map(({ status, workItemId }) => frozen({ identity: workItemId, kind: "AGENT_COMPANY_TASK", status }))),
      ...founderWorkdays.flatMap(({ tasks }) => tasks.filter(({ status }) => status === "AWAITING_DEPENDENCY" || status === "AWAITING_FABIO" || status === "RUNNING").map(({ status, taskId }) => frozen({ identity: taskId, kind: "FOUNDER_WORKDAY_TASK", status }))),
    ];
    const aggregateCoverage = jobCoverage && workdayCoverage;

    return frozen({
      approvals,
      backup: backupJob === undefined ? undefined : frozen({
        ...(backupJob.status === "COMPLETED" ? { lastVerifiedAt: backupJob.updatedAt } : {}),
        status: backupJob.status === "COMPLETED" ? "READY" as const : "ATTENTION_REQUIRED" as const,
      }),
      blockedTasks: aggregateCoverage && blockedTasks.length <= BLOCKED_TASK_LIMIT
        ? Object.freeze(blockedTasks)
        : undefined,
      businessMissions: complete(businessMissions, BUSINESS_LIMIT)
        ? Object.freeze(businessMissions.map(({ mission, status }) => frozen({ missionId: mission.missionId, status })))
        : undefined,
      evidence: complete(evidencePacks, EVIDENCE_LIMIT)
        ? Object.freeze(evidencePacks.map(({ minFreshnessExpiresAt, packId }) => frozen({ evidenceId: packId, freshnessExpiresAt: minFreshnessExpiresAt })))
        : undefined,
      // The H24 attempt ledger is intentionally not promoted to a global spend
      // or external-effects claim. OpenAI, publication, social, messaging,
      // purchase and deployment ledgers need one coverage-attested aggregator.
      // Until that boundary exists the Daily Brief must render UNAVAILABLE.
      costs: undefined,
      externalEffects: undefined,
      incidents: complete(incidents, INCIDENT_LIMIT)
        ? Object.freeze(incidents.map(({ incidentId, severity, status, summaryCode }) => frozen({ incidentId, severity, status, summaryCode })))
        : undefined,
      production,
      runtime,
      social: complete(socialRecords, SOCIAL_LIMIT)
        ? frozen({ analyticsRecords: socialRecords.filter(({ kind }) => kind === "ANALYTICS").length, records: socialRecords.length })
        : undefined,
      workCompleted: aggregateCoverage && workCompleted.length <= WORK_ITEM_LIMIT
        ? Object.freeze(workCompleted)
        : undefined,
      workInProgress: aggregateCoverage && workInProgress.length <= WORK_ITEM_LIMIT
        ? Object.freeze(workInProgress)
        : undefined,
    });
  }
}

function complete(values: readonly unknown[], limit: number): boolean { return values.length < limit; }
function inWindow(timestamp: string, window: Readonly<{ readonly endsAt: string; readonly startsAt: string }>): boolean { return timestamp >= window.startsAt && timestamp < window.endsAt; }
function leaseState(values: readonly { readonly expiresAt: string }[], asOf: Date): "MISSING" | "READY" | "STALE" {
  if (values.length === 0) return "MISSING";
  return values.some(({ expiresAt }) => Date.parse(expiresAt) > asOf.getTime()) ? "READY" : "STALE";
}
function frozen<T>(value: T): T { return Object.freeze(value); }
