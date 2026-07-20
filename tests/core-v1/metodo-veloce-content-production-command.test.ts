import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { createLocalRuntime, MetodoVeloceContentProductionPackageValidator, type LocalRuntime, type LocalRuntimeConfig, type LocalWorkflowCommand } from "../../src/index.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { FixedClock } from "../support/fixtures.js";
import { downgradeTelegramDeliveryReconciliationSchemaToV29 } from "../support/sqlite-migration-fixtures.js";

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

  it("fails closed on an unbound approval while preserving the legacy record for inspection and archive", async () => withDatabase(async (path) => {
    const initialRuntime = await createRuntime(path);
    await run(initialRuntime, "PRODUCE_METODO_VELOCE_CONTENT", { brief: { ...brief(), productionId: "mv-content-factory-001" } }, "factory-create-001");

    await expect(run(initialRuntime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 0, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-too-early-001")).rejects.toMatchObject({ code: "repository_conflict" });
    await expect(run(initialRuntime, "REVIEW_METODO_VELOCE_CONTENT", { decision: "APPROVED", expectedVersion: 0, note: "Tentativo privo di un binding visuale verificabile.", productionId: "mv-content-factory-001" }, "factory-review-unbound-001")).rejects.toThrow("Visual Gate bloccato");
    const unchanged = await run(initialRuntime, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-factory-001" }, "factory-inspect-after-unbound-review");
    expect(unchanged.result).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });
    await initialRuntime.close();

    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await repositories.transaction(async ({ contentProductions }) => {
      const current = await contentProductions.getById("mv-content-factory-001");
      if (current === undefined) throw new Error("Expected pending content production");
      const reviewedAt = "2026-07-14T12:00:00.000Z";
      await contentProductions.update({ ...current, review: { decision: "APPROVED", note: "Approvazione legacy precedente all'introduzione della ricevuta visuale.", reviewedAt, reviewedBy: "actor-local" }, status: "APPROVED_FOR_SCHEDULING", updatedAt: reviewedAt, version: 1 }, { version: 0 });
    });
    await repositories.close();

    const runtime = await createRuntime(path);
    const legacy = await run(runtime, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-factory-001" }, "factory-inspect-legacy-review");
    expect(legacy.result).toMatchObject({ review: { decision: "APPROVED" }, status: "APPROVED_FOR_SCHEDULING", version: 1 });
    expect((legacy.result as { readonly review?: { readonly visualApprovalBindingFingerprint?: string } }).review?.visualApprovalBindingFingerprint).toBeUndefined();

    await expect(run(runtime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 0, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-stale-001")).rejects.toMatchObject({ code: "repository_conflict" });
    await expect(run(runtime, "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 1, productionId: "mv-content-factory-001", scheduledFor: "2026-07-21T10:00:00.000Z" }, "factory-schedule-unbound-001")).rejects.toMatchObject({ code: "repository_conflict" });
    const archived = await run(runtime, "ARCHIVE_METODO_VELOCE_CONTENT", { expectedVersion: 1, productionId: "mv-content-factory-001", reason: "MANUAL" }, "factory-archive-legacy-001");
    expect(archived.result).toMatchObject({ archive: { reason: "MANUAL" }, review: { decision: "APPROVED" }, status: "ARCHIVED", version: 2 });
    await runtime.close();

    const reopened = await createRuntime(path);
    const recovered = await run(reopened, "INSPECT_METODO_VELOCE_CONTENT", { productionId: "mv-content-factory-001" }, "factory-inspect-recovered-001");
    expect(recovered.result).toEqual(archived.result);
    await reopened.close();
  }));

  it("keeps Fabio rejection available without a Visual Gate receipt", async () => withDatabase(async (path) => {
    const runtime = await createRuntime(path);
    await run(runtime, "PRODUCE_METODO_VELOCE_CONTENT", { brief: { ...brief(), productionId: "mv-content-rejected-001" } }, "rejected-content-create-001");
    const rejected = await run(runtime, "REVIEW_METODO_VELOCE_CONTENT", { decision: "REJECTED", expectedVersion: 0, note: "Rifiutato da Fabio senza autorizzare alcun effetto esterno.", productionId: "mv-content-rejected-001" }, "rejected-content-review-001");
    expect(rejected.result).toMatchObject({ archive: { reason: "REJECTED_BY_FABIO" }, review: { decision: "REJECTED" }, status: "ARCHIVED", version: 1 });
    expect((rejected.result as { readonly review?: { readonly visualApprovalBindingFingerprint?: string } }).review?.visualApprovalBindingFingerprint).toBeUndefined();
    await runtime.close();
  }));

  it("migrates a Core V1 version 16 database before it creates the production queue", async () => withDatabase(async (path) => {
    const current = await createRuntime(path);
    await current.close();
    const legacy = new DatabaseSync(path);
    downgradeTelegramDeliveryReconciliationSchemaToV29(legacy);
    legacy.exec("DROP TABLE reference_vault_audit_events; DROP TABLE reference_vault_command_receipts; DROP TABLE reference_vault_records; DROP TABLE reference_vault_blobs; DROP TABLE control_action_receipts; DROP TABLE control_action_proposals; DROP TABLE daily_operating_briefs; DROP TABLE founder_workdays; DROP TABLE operations_incidents; DROP TABLE production_controls; DROP TABLE operations_job_successors; DROP TABLE operations_runtime_usage_rollups; DROP TABLE operations_job_attempts; DROP TABLE operations_jobs; DROP TABLE operations_events; DROP TABLE operations_process_leases; DROP TABLE operations_runtime_controls; DROP TABLE operations_schedules; DROP TABLE social_intelligence_live_records; DROP TABLE research_acquisition_snapshots; DROP TABLE authorized_research_missions; DROP TABLE agent_company_workdays; DROP TABLE business_mission_dossiers; DROP TABLE evidence_packs; DROP TABLE feedback_metric_snapshots; DROP TABLE publication_kill_switches; DROP TABLE publication_plans; DROP TABLE evidence_records; DROP TABLE source_registry_entries; DROP TABLE production_runtime_jobs; DROP TABLE metodo_veloce_content_productions; DELETE FROM schema_migrations WHERE version IN (17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31); PRAGMA user_version = 16;");
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
