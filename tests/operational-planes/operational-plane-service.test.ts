import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { DeterministicMetodoVeloceContentProductionLine } from "../../src/content-production/deterministic-metodo-veloce-content-production-line.js";
import type { MetodoVeloceContentProductionRecord } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SQLITE_SCHEMA_VERSION } from "../../src/persistence/sqlite/sqlite-schema.js";
import { openSqliteDatabase } from "../../src/persistence/sqlite/sqlite-database.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";

describe("OperationalPlaneService", () => {
  it("accepts attributable, fresh evidence only from authorized source registry entries", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const service = createService(path, clock);
    await service.registerSource({ canonicalReference: "https://example.org/official/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Fonte ufficiale", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "official-source", status: "AUTHORIZED" });
    const evidence = await service.recordEvidence({ claimMappings: [{ claimId: "claim-001", statement: "Il dato è disponibile nella fonte dichiarata." }], contentPublishedAt: "2026-07-10T00:00:00.000Z", corroboratingEvidenceIds: [], evidenceId: "evidence-001", excerpt: "Estratto strutturato e limitato della fonte ufficiale.", fingerprint: "a".repeat(64), freshnessExpiresAt: "2026-07-20T12:00:00.000Z", limitations: ["Non prova risultati futuri individuali."], riskDomain: "GENERAL", sourceId: "official-source", sourceReference: "https://example.org/official/report-2026", status: "VERIFIED" });
    expect(evidence).toMatchObject({ status: "VERIFIED", sourceId: "official-source", workspaceId: "workspace-local" });
    await service.registerSource({ canonicalReference: "https://blocked.example/", category: "FORBIDDEN", maxFreshnessDays: 7, name: "Fonte vietata", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: false, reliability: "LOW", requiresSecondSource: true, sourceId: "blocked-source", status: "FORBIDDEN" });
    await expect(service.recordEvidence({ claimMappings: [{ claimId: "claim-002", statement: "Claim non utilizzabile." }], contentPublishedAt: "2026-07-10T00:00:00.000Z", corroboratingEvidenceIds: [], evidenceId: "evidence-002", excerpt: "Un estratto che non deve entrare nella produzione.", fingerprint: "b".repeat(64), freshnessExpiresAt: "2026-07-18T12:00:00.000Z", limitations: ["Fonte vietata."], riskDomain: "GENERAL", sourceId: "blocked-source", sourceReference: "https://blocked.example/post", status: "INSUFFICIENT" })).rejects.toThrow(/not authorized/iu);
  }));

  it("keeps publication as dry-run, gates authorization with the global kill switch, and records uncertain outcomes separately", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const service = createService(path, clock);
    await seedScheduledContent(path, clock);
    const dryRun = await service.createPublicationDryRun({ accountRef: "metodo-veloce-main", contentVersion: 2, idempotencyKey: "publication-key-001", platform: "instagram", productionId: "production-001", publicationId: "publication-001", scheduledFor: "2026-07-20T09:00:00.000Z" });
    expect(dryRun).toMatchObject({ dryRun: true, status: "DRY_RUN", version: 0 });
    await service.setPublicationKillSwitch({ enabled: true, expectedVersion: 0 });
    await expect(service.authorizePublication({ expectedVersion: 0, publicationId: "publication-001" })).rejects.toThrow(/kill switch/iu);
    await service.setPublicationKillSwitch({ enabled: false, expectedVersion: 1 });
    const authorized = await service.authorizePublication({ expectedVersion: 0, publicationId: "publication-001" });
    const uncertain = await service.recordPublicationReceipt({ expectedVersion: authorized.version, outcome: "UNCERTAIN", publicationId: "publication-001", receiptFingerprint: "c".repeat(64) });
    expect(uncertain.status).toBe("UNCERTAIN");
    await expect(service.importFeedbackMetrics(feedbackInput("publication-001", "c".repeat(64), "snapshot-001", "d".repeat(64)))).rejects.toThrow(/confirmed external publication receipt/iu);
  }));

  it("imports only fingerprinted snapshots after a confirmed receipt and keeps corrections append-only", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const service = createService(path, clock);
    await seedScheduledContent(path, clock);
    await service.createPublicationDryRun({ accountRef: "metodo-veloce-main", contentVersion: 2, idempotencyKey: "publication-key-002", platform: "tiktok", productionId: "production-001", publicationId: "publication-002", scheduledFor: "2026-07-20T09:00:00.000Z" });
    const authorized = await service.authorizePublication({ expectedVersion: 0, publicationId: "publication-002" });
    const receipt = await service.recordPublicationReceipt({ expectedVersion: authorized.version, outcome: "SUCCEEDED", platformContentRef: "tiktok-video-001", publicationId: "publication-002", receiptFingerprint: "e".repeat(64) });
    const first = await service.importFeedbackMetrics(feedbackInput(receipt.publicationId, "e".repeat(64), "snapshot-002", "f".repeat(64)));
    const correction = await service.importFeedbackMetrics({ ...feedbackInput(receipt.publicationId, "e".repeat(64), "snapshot-003", "1".repeat(64)), conversionAttribution: "VERIFIED", correctionOfSnapshotId: first.snapshotId, metrics: { ...metrics(), conversions: 2 } });
    const analysis = await service.analyzeFeedback(receipt.publicationId);
    expect(correction.metrics.conversions).toBe(2);
    expect(analysis).toMatchObject({ correctionCount: 1, latest: { snapshotId: "snapshot-003", metrics: { conversions: 2 } }, snapshotCount: 2, unauthorizedExternalEffectOccurred: false });
  }));

  it("migrates an existing version 18 database without losing the runtime tables", async () => withDatabase(async (path) => {
    const initial = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); await initial.close();
    const legacy = openSqliteDatabase({ path, timeoutMs: 1_000 }).database;
    legacy.exec("DROP TABLE feedback_metric_snapshots; DROP TABLE publication_kill_switches; DROP TABLE publication_plans; DROP TABLE evidence_records; DROP TABLE source_registry_entries; DELETE FROM schema_migrations WHERE version = 19; PRAGMA user_version = 18;"); legacy.close();
    const migrated = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await migrated.transaction(async ({ operationalPlanes, productionRuntimeJobs }) => { expect(await operationalPlanes.getSourceById("missing-source")).toBeUndefined(); expect(await productionRuntimeJobs.getById("missing-job")).toBeUndefined(); });
    await migrated.close();
    const verified = openSqliteDatabase({ path, timeoutMs: 1_000 }).database;
    const versionRow = verified.prepare("PRAGMA user_version").get(); expect(versionRow?.user_version).toBe(SQLITE_SCHEMA_VERSION); verified.close();
  }));

  it("exposes evidence intake through the replay-safe local command boundary without external action", async () => withDatabase(async (path) => {
    const clock = new MutableClock("2026-07-14T12:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
    const source = await boundary.execute({ actorId: "actor-local", commandId: "source-command-001", contractVersion: "1", input: { canonicalReference: "https://example.org/official/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Fonte comando", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "command-source", status: "AUTHORIZED" }, operation: "REGISTER_EVIDENCE_SOURCE", workspaceId: "workspace-local" });
    const evidence = await boundary.execute({ actorId: "actor-local", commandId: "evidence-command-001", contractVersion: "1", input: { claimMappings: [{ claimId: "command-claim", statement: "Il claim ha un riferimento registrato." }], contentPublishedAt: "2026-07-10T00:00:00.000Z", corroboratingEvidenceIds: [], evidenceId: "command-evidence", excerpt: "Estratto strutturato ricevuto dalla fonte autorizzata.", fingerprint: "2".repeat(64), freshnessExpiresAt: "2026-07-20T12:00:00.000Z", limitations: ["Nessuna generalizzazione oltre la fonte."], riskDomain: "GENERAL", sourceId: "command-source", sourceReference: "https://example.org/official/page", status: "VERIFIED" }, operation: "RECORD_EVIDENCE", workspaceId: "workspace-local" });
    const content = await boundary.execute({ actorId: "actor-local", commandId: "evidence-content-command-001", contractVersion: "1", input: { brief: { audience: "imprenditori", callToAction: "Salva questo controllo.", contractVersion: "1", evidence: [{ evidenceId: "command-evidence", sourceRef: "command-source", statement: "Il claim ha un riferimento registrato." }], language: "it", missionReference: "mission-evidence-001", objective: "educate", offer: "Metodo Veloce", productionId: "production-evidence-001", topic: "controllo editoriale" }, evidenceIds: ["command-evidence"] }, operation: "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE", workspaceId: "workspace-local" });
    expect(source.unauthorizedExternalEffectOccurred).toBe(false);
    expect(evidence).toMatchObject({ result: { evidenceId: "command-evidence", status: "VERIFIED" }, unauthorizedExternalEffectOccurred: false });
    expect(content).toMatchObject({ result: { productionId: "production-evidence-001", status: "PENDING_FABIO_APPROVAL" }, unauthorizedExternalEffectOccurred: false });
    await repositories.close();
  }));
});

function createService(path: string, clock: MutableClock): OperationalPlaneService { return new OperationalPlaneService({ actorId: "actor-local", clock, repositories: new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }), workspaceId: "workspace-local" }); }
async function seedScheduledContent(path: string, clock: MutableClock): Promise<void> {
  const runner = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 }); const line = new DeterministicMetodoVeloceContentProductionLine(clock); const contentPackage = line.produce({ audience: "imprenditori", callToAction: "Salva questo controllo.", contractVersion: "1", evidence: [{ evidenceId: "source-001", sourceRef: "fonte-autorizzata", statement: "Il controllo parte da una decisione verificabile." }], language: "it", missionReference: "mission-001", objective: "educate", offer: "Metodo Veloce", productionId: "production-001", topic: "controllo editoriale" });
  const initial: MetodoVeloceContentProductionRecord = { actorId: "actor-local", contractVersion: "1", createdAt: contentPackage.generatedAt, package: contentPackage, productionId: "production-001", status: "PENDING_FABIO_APPROVAL", updatedAt: contentPackage.generatedAt, version: 0, workspaceId: "workspace-local" };
  await runner.transaction(async ({ contentProductions }) => { await contentProductions.insert(initial); const approved: MetodoVeloceContentProductionRecord = { ...initial, review: { decision: "APPROVED", note: "Approvato per test.", reviewedAt: clock.now().toISOString(), reviewedBy: "actor-local" }, status: "APPROVED_FOR_SCHEDULING", updatedAt: clock.now().toISOString(), version: 1 }; await contentProductions.update(approved, { version: 0 }); const scheduled: MetodoVeloceContentProductionRecord = { ...approved, schedule: { scheduledFor: "2026-07-20T09:00:00.000Z" }, status: "SCHEDULED", updatedAt: clock.now().toISOString(), version: 2 }; await contentProductions.update(scheduled, { version: 1 }); });
  await runner.close();
}
function feedbackInput(publicationId: string, publicationReceiptFingerprint: string, snapshotId: string, snapshotFingerprint: string) { return { conversionAttribution: "NOT_ATTRIBUTED" as const, metrics: metrics(), periodEnd: "2026-07-21T00:00:00.000Z", periodStart: "2026-07-20T09:00:00.000Z", publicationId, publicationReceiptFingerprint, snapshotFingerprint, snapshotId }; }
function metrics() { return { clicks: 5, comments: 3, completionCount: 60, conversions: 0, leadCount: 2, profileVisits: 9, saves: 12, shares: 4, views: 100, watchTimeSeconds: 750 }; }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-operational-plane-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
class MutableClock { #value: Date; public constructor(value: string) { this.#value = new Date(value); } public now(): Date { return new Date(this.#value); } }
