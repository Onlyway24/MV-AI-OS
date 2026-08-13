import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalWorkflowCommandBoundary, SOCIAL_OPPORTUNITY_CRITERIA, SocialPublishingPackValidator, visualApprovalManifestFingerprint, type MetodoVeloceContentProductionRecord } from "../../src/index.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import { FixedClock } from "../support/fixtures.js";

const NOW = "2026-07-15T08:00:00.000Z";

describe("Social Publishing Pack command boundary", () => {
  it("persists the Evidence-Pack-bound six-slide package without external action or invented timing", async () => withDatabase(async (path) => {
    const directory = dirname(path);
    const assetRoot = join(directory, "assets");
    const manifestPath = join(assetRoot, "manifest.json");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock: new FixedClock(NOW), repositories, visualApproval: { assetRoot, manifestPath, repositoryRoot: directory }, workspaceId: "workspace-local" });
    await boundary.execute(command("social-source-command", "REGISTER_EVIDENCE_SOURCE", { canonicalReference: "https://example.org/social/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Fonte social autorizzata", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "social-source", status: "AUTHORIZED" }));
    await boundary.execute(command("social-evidence-command", "RECORD_EVIDENCE", { claimMappings: [{ claimId: "social-claim", statement: "Il pubblico richiede passaggi pratici e verificabili." }], contentPublishedAt: "2026-07-14T08:00:00.000Z", corroboratingEvidenceIds: [], evidenceId: "social-evidence", excerpt: "Estratto strutturato da una fonte autorizzata.", fingerprint: "c".repeat(64), freshnessExpiresAt: "2026-07-30T08:00:00.000Z", limitations: ["Il dato non dimostra un risultato economico garantito."], riskDomain: "GENERAL", sourceId: "social-source", sourceReference: "https://example.org/social/report", status: "VERIFIED" }));
    await boundary.execute(command("social-pack-command", "CREATE_EVIDENCE_PACK", { evidenceIds: ["social-evidence"], packId: "social-pack" }));

    const response = await boundary.execute(command("social-production-command", "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK", { brief: brief(), evidencePackId: "social-pack", socialIntelligence: intelligence() }));
    const record = response.result as { readonly package: { readonly socialPublishingPack?: unknown }; readonly status: string };
    expect(response.nextAction).toContain("Social Publishing Pack");
    expect(response.unauthorizedExternalEffectOccurred).toBe(false);
    expect(record.status).toBe("PENDING_FABIO_APPROVAL");
    expect(record.package.socialPublishingPack).toMatchObject({ decision: "PRODURRE_ORA", externalActionsAllowed: false, publicationWindows: { status: "DATI_INSUFFICIENTI", windows: [] }, status: "READY_FOR_FABIO_APPROVAL" });
    expect(new SocialPublishingPackValidator().validate(record.package.socialPublishingPack)).toMatchObject({ ok: true });

    const inspected = await boundary.execute(command("social-inspect-command", "INSPECT_METODO_VELOCE_CONTENT", { productionId: "social-production-001" }));
    expect(inspected.result).toEqual(response.result);
    const snapshot = await new CommandCenterQueryService({ actorId: "actor-local", clock: new FixedClock(NOW), repositories, workspaceId: "workspace-local" }).snapshot();
    expect(snapshot.socialIntelligence).toMatchObject({ blocked: 0, packs: [expect.objectContaining({ productionId: "social-production-001" })], readyForFabio: 1, requiresResearch: 0 });

    await expect(boundary.execute(command("social-review-missing-manifest", "REVIEW_METODO_VELOCE_CONTENT", { decision: "APPROVED", expectedVersion: 0, note: "Approvazione diretta priva di un manifest verificabile.", productionId: "social-production-001" }))).rejects.toThrow("VISUAL_MANIFEST_MISSING");
    const stillPending = await boundary.execute(command("social-inspect-after-block", "INSPECT_METODO_VELOCE_CONTENT", { productionId: "social-production-001" }));
    expect(stillPending.result).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });
    expect((stillPending.result as MetodoVeloceContentProductionRecord).review).toBeUndefined();

    const production = response.result as MetodoVeloceContentProductionRecord;
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const assets = Object.freeze({ instagram: [Object.freeze({ height: 1, path: "assets/visual.png", sha256: createHash("sha256").update(image).digest("hex"), width: 1 })] });
    const socialPublishingPack = production.package.socialPublishingPack;
    if (socialPublishingPack === undefined) throw new Error("Expected a Social Publishing Pack");
    const approvalBinding = Object.freeze({
      assetSetFingerprint: canonicalSha256(assets),
      contentPackageFingerprint: canonicalSha256(production.package),
      masterContentPackFingerprint: socialPublishingPack.masterContentPack.fingerprint,
      productionId: production.productionId,
      productionVersion: production.version,
      socialPublishingPackFingerprint: socialPublishingPack.fingerprint,
      workspaceId: production.workspaceId,
    });
    const manifestPayload = Object.freeze({ approvalBinding, assets, visualReview: Object.freeze({ status: "READY_FOR_HUMAN_DECISION" }) });
    const manifestFingerprint = visualApprovalManifestFingerprint(manifestPayload);
    const bindingFingerprint = canonicalSha256({ ...approvalBinding, manifestFingerprint });
    await mkdir(assetRoot, { recursive: true });
    await writeFile(join(assetRoot, "visual.png"), image);
    await writeFile(manifestPath, JSON.stringify({ ...manifestPayload, fingerprint: manifestFingerprint }));

    const reviewed = await boundary.execute(command("social-review-exact-visual-binding", "REVIEW_METODO_VELOCE_CONTENT", { decision: "APPROVED", expectedVersion: 0, note: "Approvato sul master e sugli asset esatti del Visual Gate.", productionId: "social-production-001" }));
    expect(reviewed.result).toMatchObject({ review: { decision: "APPROVED", visualApprovalBindingFingerprint: bindingFingerprint }, status: "APPROVED_FOR_SCHEDULING", version: 1 });
    const scheduled = await boundary.execute(command("social-schedule-exact-visual-binding", "SCHEDULE_METODO_VELOCE_CONTENT", { expectedVersion: 1, productionId: "social-production-001", scheduledFor: "2026-07-16T09:00:00.000Z" }));
    expect(scheduled).toMatchObject({ result: { review: { visualApprovalBindingFingerprint: bindingFingerprint }, status: "SCHEDULED", version: 2 }, unauthorizedExternalEffectOccurred: false });
    await repositories.close();

    const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const recoveredBoundary = createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock: new FixedClock(NOW), repositories: reopened, visualApproval: { assetRoot, manifestPath, repositoryRoot: directory }, workspaceId: "workspace-local" });
    const recovered = await recoveredBoundary.execute(command("social-inspect-durable-visual-binding", "INSPECT_METODO_VELOCE_CONTENT", { productionId: "social-production-001" }));
    expect(recovered.result).toMatchObject({ review: { visualApprovalBindingFingerprint: bindingFingerprint }, status: "SCHEDULED", version: 2 });
    await reopened.close();
  }));
});

function brief() {
  return { audience: "Persone che vogliono vendere oggetti usati con criteri verificabili.", callToAction: "Salva il post e applica la checklist.", contractVersion: "1", evidence: [{ evidenceId: "social-evidence", sourceRef: "social-source", statement: "Il pubblico richiede passaggi pratici e verificabili." }], language: "it", missionReference: "social-mission-001", objective: "educate", offer: "una guida pratica Metodo Veloce", productionId: "social-production-001", topic: "vendere oggetti usati senza svendere" } as const;
}

function intelligence() {
  const measured = (note: string) => ({ dataKind: "MEASURED" as const, note, observedAt: NOW, sourceId: "social-analytics-import" });
  const evidence = (evidenceId: string) => ({ dataKind: "EVIDENCE" as const, evidenceId, note: "Segnale attestato dalla fonte autorizzata.", observedAt: NOW });
  return {
    audienceSignals: [{ ...measured("Query importata."), intent: "PROBLEMA", query: "come vendere usato senza svendere", strength: 88 }, { ...measured("Salvataggi importati."), intent: "APPRENDIMENTO", query: "prezzo giusto usato", strength: 80 }],
    audioCandidates: [],
    brandChecks: ["CTA", "FONT", "LOGO", "PALETTE", "STRUCTURE", "TONE", "VISUAL_DIRECTION"].map((component) => ({ component, score: 90 })),
    competitorSignals: [{ ...evidence("social-evidence"), authorized: true, competitorId: "competitor-one", format: "carosello", observedGap: "Nessuna checklist finale." }, { ...evidence("social-evidence"), authorized: true, competitorId: "competitor-two", format: "slideshow", observedGap: "Nessun claim mapping visibile." }],
    contractVersion: "1",
    conversionIntent: { commercialStep: "Preparare una futura guida pratica.", doNext: "Salva il post e usa la checklist.", feel: "Capace di valutare senza fretta.", understand: "Prezzo, condizioni e confronto devono essere verificati." },
    criterionInputs: SOCIAL_OPPORTUNITY_CRITERIA.map((criterion) => ({ criterion, ...measured("Valore normalizzato da dati importati."), value: 90 })),
    culturalRisks: [],
    hashtagCandidates: ["#metodoveloce", "#rivendita", "#usato", "#microbusiness", "#prezzogiusto", "#vendereonline"].map((tag) => ({ ...evidence("social-evidence"), cluster: tag === "#metodoveloce" ? "BRAND" as const : "TOPIC" as const, relevance: 85, saturation: 50, tag })),
    mode: "EVERGREEN",
    observedAt: NOW,
    platforms: ["INSTAGRAM", "TIKTOK"],
    portfolioRole: "DISCOVERY",
    productionId: "social-production-001",
    recentContents: [],
    scheduling: { audienceSampleCount: 0, candidateWindows: [], historicalPostCount: 0 },
    topic: "vendere oggetti usati senza svendere",
  } as const;
}

function command(commandId: string, operation: Parameters<ReturnType<typeof createLocalWorkflowCommandBoundary>["execute"]>[0]["operation"], input: Readonly<Record<string, unknown>>) { return { actorId: "actor-local", commandId, contractVersion: "1" as const, input, operation, workspaceId: "workspace-local" }; }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-social-command-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
