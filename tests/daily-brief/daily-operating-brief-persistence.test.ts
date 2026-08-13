import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DailyOperatingBriefService } from "../../src/daily-brief/daily-operating-brief-service.js";
import { RepositoryBackedDailyOperatingBriefSource } from "../../src/daily-brief/repository-backed-daily-operating-brief-source.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

describe("Daily Operating Brief durable transaction", () => {
  it("persists one truthful brief and event, replays after restart, and isolates workspace records", async () => withDatabase(async (path) => {
    const clock = { now: (): Date => new Date("2026-07-19T08:00:00.000Z") };
    const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const firstService = service(first, "workspace-local", clock);
    const created = await firstService.generate("2026-07-19");
    expect(created.publication).toBe("INTERNAL_ONLY");
    expect(created.sections.systemHealth).toMatchObject({ kind: "UNAVAILABLE", value: { status: "ATTENTION_REQUIRED" } });
    expect(created.sections.costsAndBudgets).toMatchObject({ kind: "UNAVAILABLE", value: { measuredCostCents: 0, reconciliation: "PENDING" } });
    expect(created.sections.externalActionsPerformed).toMatchObject({ kind: "UNAVAILABLE", value: { publications: 0 } });
    expect(created.sections.workCompleted).toMatchObject({ kind: "MEASURED", value: [] });
    const initialEvents = await first.transaction(({ operationalEvents }) => operationalEvents.listAfter("workspace-local", 0, 10));
    expect(initialEvents.map(({ eventType }) => eventType)).toEqual(["DAILY_BRIEF_GENERATED"]);
    await first.close();

    const restarted = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const restartedService = service(restarted, "workspace-local", clock);
    expect(await restartedService.generate("2026-07-19")).toEqual(created);
    expect(await restartedService.inspect(created.briefId)).toEqual(created);
    const otherService = service(restarted, "workspace-other", clock);
    const other = await otherService.generate("2026-07-19");
    expect(other.briefId).not.toBe(created.briefId);
    await expect(otherService.inspect(created.briefId)).rejects.toThrow(/unavailable/iu);
    const counts = await restarted.transaction(async ({ dailyOperatingBriefs, operationalEvents }) => ({
      local: await dailyOperatingBriefs.listByWorkspaceId("workspace-local", 10),
      other: await dailyOperatingBriefs.listByWorkspaceId("workspace-other", 10),
      localEvents: await operationalEvents.listAfter("workspace-local", 0, 10),
      otherEvents: await operationalEvents.listAfter("workspace-other", 0, 10),
    }));
    expect(counts).toMatchObject({ local: { length: 1 }, localEvents: { length: 1 }, other: { length: 1 }, otherEvents: { length: 1 } });
    await restarted.close();
  }));
});

function service(repositories: SqliteRepositoryTransactionRunner, workspaceId: string, clock: { now(): Date }): DailyOperatingBriefService {
  return new DailyOperatingBriefService({ actorId: "actor-local", clock, repositories, source: new RepositoryBackedDailyOperatingBriefSource(), workspaceId });
}
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-daily-brief-"));
  try { await test(join(directory, "runtime.sqlite")); }
  finally { await rm(directory, { force: true, recursive: true }); }
}
