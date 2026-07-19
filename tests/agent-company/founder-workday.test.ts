import { describe, expect, it } from "vitest";

import { FounderWorkdayService, type FounderWorkdayStateSnapshot } from "../../src/agent-company/founder-workday-service.js";
import type { FounderWorkdayRepository } from "../../src/agent-company/founder-workday-repository.js";
import type { FounderWorkdayRecord } from "../../src/agent-company/founder-workday.js";
import { FounderWorkdayRecordValidator } from "../../src/agent-company/founder-workday-validator.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";

describe("Founder Workday #001", () => {
  it("persists an honest structured blocker and replays the exact workday", async () => {
    const repository = new MemoryRepository();
    let snapshot: FounderWorkdayStateSnapshot = {
      businessMissions: [],
      coverage: { businessMissions: "COMPLETE", evidencePacks: "COMPLETE", productions: "COMPLETE", socialRecords: "COMPLETE" },
      evidencePacks: [{ evidenceCount: 2, minFreshnessExpiresAt: "2026-07-22T22:38:54.000Z", packId: "evidence-pack-social-second-hand-20260716", status: "READY" }],
      productions: [{ productionId: "social-pack-five-items-evidence-led-20260716-v2", status: "PENDING_FABIO_APPROVAL" }],
      socialRecords: [{ kind: "TREND", recordId: "trend-instagram-second-hand-vinted-20260716" }],
    };
    const service = new FounderWorkdayService({ actorId: "actor-local", clock: { now: () => new Date("2026-07-19T08:00:00.000Z") }, repositories: runner(repository), state: { snapshot: () => Promise.resolve(snapshot) }, workspaceId: "workspace-local" });
    const first = await service.run("onlyway-founder-workday-001");
    expect(new FounderWorkdayRecordValidator().validate(first).ok).toBe(true);
    expect(first).toMatchObject({ status: "BLOCKED", artifacts: { costSummary: { measuredCostCents: 0, providerCalls: 0 }, externalEffectsSummary: { publications: 0 }, founderDailyDossier: { businessMissions: { kind: "MEASURED", value: 0 }, evidencePacks: { value: 1 }, socialAnalyticsRecords: { kind: "UNAVAILABLE", value: 0 } }, nextDayProductionPlan: { publication: "LOCKED", status: "BLOCKED" } } });
    expect(first.tasks).toHaveLength(17);
    expect(first.tasks.find(({ agentId }) => agentId === "onlyway-assistant")).toMatchObject({ attempts: 0, decisionRequired: true, status: "AWAITING_FABIO" });
    expect(first.tasks.find(({ agentId }) => agentId === "research-agent")).toMatchObject({ status: "BLOCKED", blocker: { owner: "FABIO" } });
    expect(first.tasks.filter(({ status }) => status === "AWAITING_DEPENDENCY")).toHaveLength(15);
    expect(first.artifacts.decisionList.map(({ decisionId }) => decisionId)).toEqual(["founder-input-acquisition", "review-social-pack-five-items-evidence-led-20260716-v2"]);

    const replay = await service.run("onlyway-founder-workday-001");
    expect(replay).toEqual(first);
    expect(repository.inserts).toBe(1);
    expect(repository.updates).toBe(0);

    snapshot = {
      ...snapshot,
      businessMissions: [{ missionId: "business-mission-approved", status: "APPROVED" }],
      evidencePacks: [
        ...snapshot.evidencePacks,
        { evidenceCount: 1, minFreshnessExpiresAt: "2026-07-22T22:38:54.000Z", packId: "evidence-pack-second", status: "READY" },
        { evidenceCount: 1, minFreshnessExpiresAt: "2026-07-22T22:38:54.000Z", packId: "evidence-pack-third", status: "READY" },
      ],
    };
    const reevaluated = await service.run("onlyway-founder-workday-001");
    expect(reevaluated).toMatchObject({ status: "AWAITING_FABIO", version: 1 });
    expect(reevaluated.tasks.every(({ status }) => status !== "COMPLETED" && status !== "RUNNING")).toBe(true);
    expect(reevaluated.tasks.find(({ agentId }) => agentId === "onlyway-assistant")).toMatchObject({ decisionRequired: true, status: "AWAITING_FABIO" });
    expect(reevaluated.artifacts.decisionList.map(({ decisionId }) => decisionId)).toContain("founder-workday-execution");
    expect(repository.updates).toBe(1);
    await expect(service.run("onlyway-founder-workday-001")).resolves.toEqual(reevaluated);
    expect(repository.updates).toBe(1);
  });
});

class MemoryRepository implements FounderWorkdayRepository {
  readonly #records = new Map<string, FounderWorkdayRecord>();
  public inserts = 0;
  public updates = 0;
  public getById(workdayId: string): Promise<FounderWorkdayRecord | undefined> { return Promise.resolve(this.#records.get(workdayId)); }
  public insert(record: FounderWorkdayRecord): Promise<void> { this.inserts += 1; this.#records.set(record.workdayId, record); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string): Promise<readonly FounderWorkdayRecord[]> { return Promise.resolve([...this.#records.values()].filter((record) => record.workspaceId === workspaceId)); }
  public update(record: FounderWorkdayRecord, expectation: { readonly version: number }): Promise<void> {
    const current = this.#records.get(record.workdayId);
    if (current?.version !== expectation.version) throw new Error("stale Founder Workday update");
    this.updates += 1;
    this.#records.set(record.workdayId, record);
    return Promise.resolve();
  }
}

function runner(repository: MemoryRepository): RepositoryTransactionRunner {
  const repositories = { founderWorkdays: repository, operationalEvents: { append: () => Promise.resolve() } } as unknown as RepositoryTransaction;
  return { transaction: (operation) => operation(repositories) };
}
