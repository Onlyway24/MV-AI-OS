import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { ProductionRuntimeService, SqliteRepositoryTransactionRunner } from "../../src/index.js";

describe("Production Runtime service", () => {
  it("queues and completes a preparation-only content job without an external action", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const runner = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const runtime = service(runner, clock);
    const queued = await runtime.enqueue(request("runtime-job-001", "mv-runtime-content-001", clock.now().toISOString()));
    expect(queued).toMatchObject({ attempt: 0, status: "QUEUED", version: 0 });
    expect(await runtime.health()).toMatchObject({ counts: { queued: 1 }, status: "READY", unauthorizedExternalEffectOccurred: false });

    const completed = await runtime.runOnce((job) => Promise.resolve(job.brief.productionId));
    expect(completed).toMatchObject({ job: { attempt: 1, result: { productionId: "mv-runtime-content-001" }, status: "COMPLETED", version: 2 }, status: "COMPLETED", unauthorizedExternalEffectOccurred: false });
    expect(await runtime.health()).toMatchObject({ counts: { completed: 1 }, status: "READY" });
    await runner.close();
  }));

  it("retries bounded failures and moves exhausted work into the dead-letter queue", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const runner = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const runtime = service(runner, clock);
    await runtime.enqueue(request("runtime-job-retry-001", "mv-runtime-content-retry-001", clock.now().toISOString()));

    expect((await runtime.runOnce(() => Promise.reject(new Error("offline")))).job).toMatchObject({ attempt: 1, lastError: { code: "runtime_execution_failed" }, status: "RETRY_SCHEDULED" });
    clock.advance(30_000);
    expect((await runtime.runOnce(() => Promise.reject(new Error("offline")))).job).toMatchObject({ attempt: 2, status: "RETRY_SCHEDULED" });
    clock.advance(60_000);
    expect((await runtime.runOnce(() => Promise.reject(new Error("offline")))).job).toMatchObject({ attempt: 3, status: "DEAD_LETTER" });
    expect(await runtime.health()).toMatchObject({ counts: { deadLetter: 1 }, deadLetterAttentionRequired: true, status: "ATTENTION_REQUIRED" });
    await runner.close();
  }));

  it("recovers an expired worker lease after restart before it retries", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const runtime = service(first, clock);
    await runtime.enqueue(request("runtime-job-lease-001", "mv-runtime-content-lease-001", clock.now().toISOString()));
    await first.transaction(({ productionRuntimeJobs }) => productionRuntimeJobs.claimNextDue("workspace-local", clock.now().toISOString(), "2026-07-14T12:01:00.000Z"));
    await first.close();

    clock.advance(120_000);
    const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const recoveredRuntime = service(reopened, clock);
    expect(await recoveredRuntime.runOnce((job) => Promise.resolve(job.brief.productionId))).toMatchObject({ recoveredExpiredClaims: 1, status: "IDLE" });
    clock.advance(30_000);
    expect(await recoveredRuntime.runOnce((job) => Promise.resolve(job.brief.productionId))).toMatchObject({ job: { status: "COMPLETED" }, status: "COMPLETED" });
    await reopened.close();
  }));

  it("migrates a version 17 database before it accepts H24 production jobs", async () => withDatabase(async (path) => {
    const current = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await current.close();
    const legacy = new DatabaseSync(path);
    legacy.exec("DROP TABLE feedback_metric_snapshots; DROP TABLE publication_kill_switches; DROP TABLE publication_plans; DROP TABLE evidence_records; DROP TABLE source_registry_entries; DROP TABLE production_runtime_jobs; DELETE FROM schema_migrations WHERE version IN (18, 19); PRAGMA user_version = 17;");
    legacy.close();

    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const migrated = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await expect(service(migrated, clock).enqueue(request("runtime-job-migrated-001", "mv-runtime-content-migrated-001", clock.now().toISOString()))).resolves.toMatchObject({ status: "QUEUED" });
    await migrated.close();
  }));
});

function service(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock): ProductionRuntimeService { return new ProductionRuntimeService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" }); }
function request(jobId: string, productionId: string, runAfter: string) { return { brief: { audience: "Persone che vogliono testare un'offerta prima di investire budget.", callToAction: "Salva il post e scegli un test piccolo per questa settimana.", contractVersion: "1", evidence: [{ evidenceId: "customer-note-1", sourceRef: "interview-2026-07", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }], language: "it", missionReference: "mission-draft-1", objective: "educate", offer: "un percorso per validare offerte digitali", productionId, topic: "come validare un'offerta prima di promuoverla" }, jobId, runAfter } as const; }
class MutableClock { #now: Date; public constructor(timestamp: string) { this.#now = new Date(timestamp); } public now(): Date { return new Date(this.#now); } public advance(milliseconds: number): void { this.#now = new Date(this.#now.getTime() + milliseconds); } }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-production-runtime-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
