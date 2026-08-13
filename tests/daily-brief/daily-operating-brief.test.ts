import { describe, expect, it } from "vitest";

import type { DailyOperatingBriefRepository } from "../../src/daily-brief/daily-operating-brief-repository.js";
import { DailyOperatingBriefService, type DailyOperatingBriefSourceSnapshot } from "../../src/daily-brief/daily-operating-brief-service.js";
import type { DailyOperatingBriefRecord } from "../../src/daily-brief/daily-operating-brief.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";

describe("Daily Operating Brief", () => {
  it("persists one evidence-led brief and labels unavailable runtime facts honestly", async () => {
    const repository = new MemoryRepository();
    const snapshot: DailyOperatingBriefSourceSnapshot = {
      approvals: [{ entityId: "production-001", entityType: "CONTENT_PRODUCTION", status: "PENDING_FABIO_APPROVAL" }],
      blockedTasks: [{ owner: "FABIO", reasonCode: "EVIDENCE_PACKS_MISSING", taskId: "research-workday-001" }],
      businessMissions: [],
      evidence: [{ evidenceId: "evidence-001", freshnessExpiresAt: "2026-07-22T00:00:00.000Z" }],
      production: { active: 0, deadLetter: 0, pendingFabio: 1 },
      social: { analyticsRecords: 0, records: 42 },
      workCompleted: [{ completedAt: "2026-07-19T07:59:00.000Z", identity: "workday-assistant-receipt", kind: "AGENT_TASK" }],
      workInProgress: [],
    };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(repository), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });
    const brief = await service.generate("2026-07-19");
    expect(brief).toMatchObject({ businessDate: "2026-07-19", publication: "INTERNAL_ONLY", sections: { backupState: { kind: "UNAVAILABLE", value: { status: "UNKNOWN" } }, costsAndBudgets: { kind: "UNAVAILABLE", value: { reconciliation: "PENDING" } }, externalActionsPerformed: { kind: "UNAVAILABLE" }, socialIntelligence: { kind: "MEASURED", value: { analyticsRecords: 0, records: 42, status: "INSUFFICIENT_DATA" } }, systemHealth: { kind: "UNAVAILABLE", value: { status: "ATTENTION_REQUIRED" } } } });
    expect(brief.briefId).toMatch(/^daily-brief-2026-07-19-[a-f0-9]{12}$/u);
    expect(brief.sections.recommendedFounderDecisions.value).toHaveLength(2);
    expect(brief.sections.workCompleted.provenance).toContain("operations_jobs.updated_at:Europe/Rome:2026-07-19");
    expect(brief.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(await service.generate("2026-07-19")).toEqual(brief);
    expect(repository.inserts).toBe(1);
  });

  it("reports measured zero external effects only when a receipt source supplies it", async () => {
    const snapshot: DailyOperatingBriefSourceSnapshot = { approvals: [], backup: { lastVerifiedAt: "2026-07-19T07:00:00.000Z", status: "READY" }, blockedTasks: [], businessMissions: [], costs: { budgetCents: 0, estimatedCostCents: 0, measuredCostCents: 0, reconciliation: "NOT_REQUIRED" }, evidence: [], externalEffects: { deployments: 0, messages: 0, paidCalls: 0, publications: 0, purchases: 0 }, incidents: [], production: { active: 0, deadLetter: 0, pendingFabio: 0 }, runtime: { killSwitch: "LOCKED", maintenanceMode: "DISABLED", scheduler: "READY", worker: "READY" }, social: { analyticsRecords: 1, records: 1 }, workCompleted: [], workInProgress: [] };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(new MemoryRepository()), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });
    const brief = await service.generate("2026-07-19");
    expect(brief.sections.externalActionsPerformed).toMatchObject({ kind: "MEASURED", value: { publications: 0 } });
    expect(brief.sections.systemHealth).toMatchObject({ kind: "MEASURED", value: { status: "READY" } });
  });

  it("marks a triggered kill switch as attention and rejects normalized calendar dates", async () => {
    const snapshot: DailyOperatingBriefSourceSnapshot = { approvals: [], blockedTasks: [], businessMissions: [], evidence: [], externalEffects: { deployments: 0, messages: 0, paidCalls: 0, publications: 0, purchases: 0 }, incidents: [], production: { active: 0, deadLetter: 0, pendingFabio: 0 }, runtime: { killSwitch: "TRIGGERED", maintenanceMode: "DISABLED", scheduler: "READY", worker: "READY" }, social: { analyticsRecords: 0, records: 0 }, workCompleted: [], workInProgress: [] };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(new MemoryRepository()), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });
    expect((await service.generate("2026-07-19")).sections.systemHealth.value.status).toBe("ATTENTION_REQUIRED");
    await expect(service.generate("2026-02-30")).rejects.toThrow(/date/iu);
  });

  it("fails oversized founder-decision derivation closed without producing an invalid brief", async () => {
    const approvals = Array.from({ length: 101 }, (_, index) => ({ entityId: `production-${String(index)}`, entityType: "CONTENT_PRODUCTION", status: "PENDING_FABIO_APPROVAL" }));
    const snapshot: DailyOperatingBriefSourceSnapshot = { approvals, backup: { lastVerifiedAt: "2026-07-19T07:00:00.000Z", status: "READY" }, blockedTasks: [], businessMissions: [], evidence: [], incidents: [], production: { active: 0, deadLetter: 0, pendingFabio: approvals.length }, runtime: { killSwitch: "LOCKED", maintenanceMode: "DISABLED", scheduler: "READY", worker: "READY" }, social: { analyticsRecords: 0, records: 0 }, workCompleted: [], workInProgress: [] };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(new MemoryRepository()), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });

    const brief = await service.generate("2026-07-19");

    expect(brief.sections.recommendedFounderDecisions).toMatchObject({ kind: "UNAVAILABLE", value: [] });
    expect(brief.sections.recommendedFounderDecisions.limitation).toMatch(/bounded contract/iu);
  });

  it("deduplicates founder decisions and bounds identifiers derived from maximal entity IDs", async () => {
    const entityId = `production-${"x".repeat(117)}`;
    const taskId = `task-${"y".repeat(122)}`;
    const approval = { entityId, entityType: "CONTENT_PRODUCTION", status: "PENDING_FABIO_APPROVAL" };
    const blocked = { owner: "FABIO", reasonCode: "INPUT_REQUIRED", taskId };
    const snapshot: DailyOperatingBriefSourceSnapshot = { approvals: [approval, approval], backup: { lastVerifiedAt: "2026-07-19T07:00:00.000Z", status: "READY" }, blockedTasks: [blocked, blocked], businessMissions: [], evidence: [], incidents: [], production: { active: 0, deadLetter: 0, pendingFabio: 1 }, runtime: { killSwitch: "LOCKED", maintenanceMode: "DISABLED", scheduler: "READY", worker: "READY" }, social: { analyticsRecords: 0, records: 0 }, workCompleted: [], workInProgress: [] };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(new MemoryRepository()), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });

    const decisions = (await service.generate("2026-07-19")).sections.recommendedFounderDecisions.value;

    expect(decisions).toHaveLength(2);
    expect(new Set(decisions.map(({ decisionId }) => decisionId)).size).toBe(2);
    expect(decisions.every(({ decisionId }) => decisionId.length <= 128)).toBe(true);
  });

  it("keeps immutable morning/EOD history while exposing the latest changed snapshot", async () => {
    const repository = new MemoryRepository();
    let now = new Date("2026-07-19T06:00:00.000Z");
    let snapshot: DailyOperatingBriefSourceSnapshot = { approvals: [], blockedTasks: [], businessMissions: [], evidence: [], incidents: [], production: { active: 0, deadLetter: 0, pendingFabio: 0 }, social: { analyticsRecords: 0, records: 0 }, workCompleted: [], workInProgress: [] };
    const service = new DailyOperatingBriefService({ actorId: "actor-local", clock: { now: () => now }, repositories: runner(repository), source: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });
    const morning = await service.generate("2026-07-19");
    expect(morning.version).toBe(0);
    now = new Date("2026-07-19T18:00:00.000Z");
    snapshot = { ...snapshot, approvals: [{ entityId: "production-eod", entityType: "CONTENT_PRODUCTION", status: "PENDING_FABIO_APPROVAL" }], production: { active: 0, deadLetter: 0, pendingFabio: 1 } };
    const endOfDay = await service.generate("2026-07-19");
    expect(endOfDay).toMatchObject({ businessDate: "2026-07-19", version: 1 });
    expect(endOfDay.briefId).toContain("-v1-");
    expect(await service.generate("2026-07-19")).toEqual(endOfDay);
    expect(await service.inspect(morning.briefId)).toEqual(morning);
    expect(await repository.getByBusinessDate("workspace-local", "2026-07-19")).toEqual(endOfDay);
    expect(await repository.listByWorkspaceId("workspace-local", 10)).toEqual([endOfDay, morning]);
    expect(repository.inserts).toBe(2);
  });
});

class MemoryRepository implements DailyOperatingBriefRepository {
  readonly #records = new Map<string, DailyOperatingBriefRecord>();
  public inserts = 0;
  public getByBusinessDate(workspaceId: string, businessDate: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve([...this.#records.values()].filter((record) => record.workspaceId === workspaceId && record.businessDate === businessDate).sort((left, right) => right.version - left.version)[0]); }
  public getById(briefId: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve(this.#records.get(briefId)); }
  public insert(record: DailyOperatingBriefRecord): Promise<void> { if ([...this.#records.values()].some((item) => item.workspaceId === record.workspaceId && item.businessDate === record.businessDate && item.version === record.version)) throw new Error("duplicate version"); this.inserts += 1; this.#records.set(record.briefId, record); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit = 100): Promise<readonly DailyOperatingBriefRecord[]> { return Promise.resolve([...this.#records.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => right.businessDate.localeCompare(left.businessDate) || right.version - left.version).slice(0, limit)); }
}

function runner(repository: MemoryRepository): RepositoryTransactionRunner {
  const repositories = { dailyOperatingBriefs: repository, operationalEvents: { append: () => Promise.resolve() } } as unknown as RepositoryTransaction;
  return { transaction: (operation) => operation(repositories) };
}
