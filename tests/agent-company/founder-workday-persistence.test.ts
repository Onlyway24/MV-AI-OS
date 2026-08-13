import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FounderWorkdayService } from "../../src/agent-company/founder-workday-service.js";
import { RepositoryBackedFounderWorkdayStateSource } from "../../src/agent-company/repository-backed-founder-workday-state-source.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

describe("Founder Workday durable transaction", () => {
  it("persists record and event atomically, replays after restart, and rejects cross-workspace identity reuse", async () => withDatabase(async (path) => {
    const clock = { now: (): Date => new Date("2026-07-19T08:00:00.000Z") };
    const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const initialService = service(first, "workspace-local", clock);
    const created = await initialService.run("founder-workday-integration-001");
    expect(created.status).toBe("BLOCKED");
    expect(created.tasks.every(({ status }) => status !== "COMPLETED")).toBe(true);
    expect(created.artifacts.nextDayProductionPlan).toMatchObject({ publication: "LOCKED", status: "BLOCKED" });
    expect(created.artifacts.costSummary.coverage).toBe("PREFLIGHT_ONLY");
    const firstEvents = await first.transaction(({ operationalEvents }) => operationalEvents.listAfter("workspace-local", 0, 10));
    expect(firstEvents.map(({ eventType }) => eventType)).toEqual(["FOUNDER_WORKDAY_CREATED"]);
    await first.close();

    const restarted = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const restartedService = service(restarted, "workspace-local", clock);
    expect(await restartedService.run("founder-workday-integration-001")).toEqual(created);
    expect(await restartedService.inspect("founder-workday-integration-001")).toEqual(created);
    const replayEvents = await restarted.transaction(({ operationalEvents }) => operationalEvents.listAfter("workspace-local", 0, 10));
    expect(replayEvents).toHaveLength(1);
    await expect(service(restarted, "workspace-other", clock).run("founder-workday-integration-001")).rejects.toThrow(/identity conflicts/iu);
    await restarted.close();
  }));
});

function service(repositories: SqliteRepositoryTransactionRunner, workspaceId: string, clock: { now(): Date }): FounderWorkdayService {
  return new FounderWorkdayService({ actorId: "actor-local", clock, repositories, state: new RepositoryBackedFounderWorkdayStateSource(), workspaceId });
}
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-founder-workday-"));
  try { await test(join(directory, "runtime.sqlite")); }
  finally { await rm(directory, { force: true, recursive: true }); }
}
