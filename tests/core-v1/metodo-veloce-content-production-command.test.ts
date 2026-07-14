import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { createLocalRuntime, MetodoVeloceContentProductionPackageValidator, type LocalRuntime, type LocalRuntimeConfig, type LocalWorkflowCommand } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Metodo Veloce durable content production command", () => {
  it("creates, replays, and recovers a preparation-only content package through the Core V1 command boundary", async () => withDatabase(async (path) => {
    const runtime = await createRuntime(path);
    const created = await run(runtime, "PRODUCE_METODO_VELOCE_CONTENT", { brief: brief() }, "content-package-001");
    expect(created).toMatchObject({ replayed: false, result: { package: { externalActionsAllowed: false, status: "READY_FOR_FABIO_APPROVAL", assets: { tiktok: { durationSeconds: 35 } } }, status: "PENDING_FABIO_APPROVAL", version: 0 }, unauthorizedExternalEffectOccurred: false });
    expect(new MetodoVeloceContentProductionPackageValidator().validate((created.result as { package: unknown }).package)).toMatchObject({ ok: true });

    const replay = await run(runtime, "PRODUCE_METODO_VELOCE_CONTENT", { brief: brief() }, "content-package-001");
    expect(replay).toEqual({ ...created, replayed: true });

    const inspected = await run(runtime, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-20260714-001" }, "inspect-content-package-001");
    expect(inspected.result).toEqual(created.result);
    await runtime.close();

    const reopened = await createRuntime(path);
    const recovered = await run(reopened, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-20260714-001" }, "inspect-content-package-recovered");
    expect(recovered.result).toEqual(created.result);
    await reopened.close();
  }));

  it("runs the durable Fabio-review, calendar, metric, and archive lifecycle without publishing", async () => withDatabase(async (path) => {
    const runtime = await createRuntime(path);
    await run(runtime, "PRODUCE_METODO_VELOCE_CONTENT", { brief: { ...brief(), productionId: "mv-content-factory-001" } }, "factory-create-001");

    await expect(run(runtime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 0, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-too-early-001")).rejects.toMatchObject({ code: "repository_conflict" });

    const reviewed = await run(runtime, "REVIEW_METODO_VELOCE_CONTENT", { decision: "APPROVED", expectedVersion: 0, note: "Coerente con la direzione editoriale approvata.", productionId: "mv-content-factory-001" }, "factory-review-001");
    expect(reviewed.result).toMatchObject({ review: { decision: "APPROVED" }, status: "APPROVED_FOR_SCHEDULING", version: 1 });

    await expect(run(runtime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 0, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-stale-001")).rejects.toMatchObject({ code: "repository_conflict" });
    const scheduled = await run(runtime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 1, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-001");
    expect(scheduled.nextAction).toContain("separate publication decision");
    expect(scheduled).toMatchObject({ result: { schedule: { scheduledFor: "2026-07-21T10:00:00.000Z" }, status: "SCHEDULED", version: 2 }, unauthorizedExternalEffectOccurred: false });

    const metrics = await run(runtime, "RECORD_METODO_VELOCE_CONTENT_METRICS", { conversions: 2, costCents: 0, expectedVersion: 2, leadCount: 8, productionId: "mv-content-factory-001", saves: 32, views: 1_200 }, "factory-metrics-001");
    expect(metrics).toMatchObject({ result: { metrics: { conversions: 2, costCents: 0, leadCount: 8, saves: 32, views: 1_200 }, status: "SCHEDULED", version: 3 }, unauthorizedExternalEffectOccurred: false });

    const queued = await run(runtime, "LIST_METODO_VELOCE_CONTENT_QUEUE", { limit: 10 }, "factory-list-001");
    expect(queued.result).toEqual([expect.objectContaining({ productionId: "mv-content-factory-001", status: "SCHEDULED", version: 3 })]);

    const archived = await run(runtime, "ARCHIVE_METODO_VELOCE_CONTENT", { expectedVersion: 3, productionId: "mv-content-factory-001", reason: "MANUAL" }, "factory-archive-001");
    expect(archived.result).toMatchObject({ archive: { reason: "MANUAL" }, metrics: { views: 1_200 }, status: "ARCHIVED", version: 4 });
    await runtime.close();

    const reopened = await createRuntime(path);
    const recovered = await run(reopened, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-factory-001" }, "factory-inspect-recovered-001");
    expect(recovered.result).toEqual(archived.result);
    await reopened.close();
  }));

  it("migrates a Core V1 version 16 database before it creates the production queue", async () => withDatabase(async (path) => {
    const current = await createRuntime(path);
    await current.close();
    const legacy = new DatabaseSync(path);
    legacy.exec("DROP TABLE evidence_packs; DROP TABLE feedback_metric_snapshots; DROP TABLE publication_kill_switches; DROP TABLE publication_plans; DROP TABLE evidence_records; DROP TABLE source_registry_entries; DROP TABLE production_runtime_jobs; DROP TABLE metodo_veloce_content_productions; DELETE FROM schema_migrations WHERE version IN (17, 18, 19, 20); PRAGMA user_version = 16;");
    legacy.close();

    const migrated = await createRuntime(path);
    const created = await run(migrated, "PRODUCE_METODO_VELOCE_CONTENT", { brief: { ...brief(), productionId: "mv-content-migrated-001" } }, "migrated-content-create-001");
    expect(created.result).toMatchObject({ productionId: "mv-content-migrated-001", status: "PENDING_FABIO_APPROVAL" });
    await migrated.close();
  }));

  it("runs a due content-preparation job through the controlled Production Runtime worker", async () => withDatabase(async (path) => {
    const runtime = await createRuntime(path);
    const enqueued = await run(runtime, "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION", { brief: { ...brief(), productionId: "mv-content-runtime-command-001" }, jobId: "content-runtime-command-001", runAfter: "2026-07-14T12:00:00.000Z" }, "content-runtime-enqueue-001");
    expect(enqueued.result).toMatchObject({ status: "QUEUED", version: 0 });
    expect((await run(runtime, "GET_PRODUCTION_RUNTIME_HEALTH", {}, "content-runtime-health-before-001")).result).toMatchObject({ counts: { queued: 1 }, status: "READY" });

    const processed = await run(runtime, "RUN_PRODUCTION_RUNTIME_ONCE", {}, "content-runtime-run-001");
    expect(processed).toMatchObject({ result: { job: { result: { productionId: "mv-content-runtime-command-001" }, status: "COMPLETED" }, status: "COMPLETED", unauthorizedExternalEffectOccurred: false } });
    expect((await run(runtime, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-runtime-command-001" }, "content-runtime-inspect-001")).result).toMatchObject({ status: "PENDING_FABIO_APPROVAL" });
    await runtime.close();
  }));
});

function brief() {
  return {
    audience: "Persone che vogliono testare un'offerta prima di investire budget.",
    callToAction: "Salva il post e scegli un test piccolo per questa settimana.",
    contractVersion: "1",
    evidence: [{ evidenceId: "customer-note-1", sourceRef: "interview-2026-07", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }],
    language: "it",
    missionReference: "mission-draft-1",
    objective: "educate",
    offer: "un percorso per validare offerte digitali",
    productionId: "mv-content-20260714-001",
    topic: "come validare un'offerta prima di promuoverla",
  } as const;
}

async function run(runtime: LocalRuntime, operation: LocalWorkflowCommand["operation"], input: Readonly<Record<string, unknown>>, commandId: string) {
  if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow commands unavailable");
  return runtime.executeWorkflowCommand({ actorId: "actor-local", commandId, contractVersion: "1", input, operation, workspaceId: "workspace-local" });
}
function config(path: string): LocalRuntimeConfig { return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }; }
function createRuntime(path: string) { return createLocalRuntime(config(path), { clock: new FixedClock("2026-07-14T12:00:00.000Z") }); }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-content-command-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
