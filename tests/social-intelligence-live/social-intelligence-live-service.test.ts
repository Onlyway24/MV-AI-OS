import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RepositoryConflictError } from "../../src/errors/core-error.js";
import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import { SocialIntelligenceLiveService, createFirstMetodoVeloceExperiment } from "../../src/social-intelligence-live/social-intelligence-live-service.js";
import { parseSocialAnalyticsCsv } from "../../src/social-intelligence-live/social-analytics-csv-adapter.js";
import { ensureInitialSocialSources, INITIAL_SOCIAL_SOURCE_BLUEPRINTS } from "../../src/social-intelligence-live/social-official-sources.js";
import { SOCIAL_PUBLIC_OBSERVATION_SOURCE_BLUEPRINTS } from "../../src/social-intelligence-live/social-official-sources.js";
import type { SocialAnalyticsSnapshot, SocialLiveRecord } from "../../src/social-intelligence-live/social-intelligence-live.js";
import { parseGoogleTrendsRss } from "../../src/social-intelligence-live/google-trends-rss-adapter.js";
import { authorizeInitialSocialCompetitors, authorizeSocialCompetitorReplacement, EXACT_COMPETITOR_AUTHORIZATION_TEXT, EXACT_COMPETITOR_REPLACEMENT_TEXT } from "../../src/social-intelligence-live/social-competitor-authorization.js";
import { GoogleTrendsLiveAcquisitionService } from "../../src/social-intelligence-live/google-trends-live-acquisition-service.js";
import type { RestrictedHttpsClient } from "../../src/research/restricted-https-client.js";
import { parseCompetitorObservationsCsv } from "../../src/social-intelligence-live/social-competitor-observation-csv-adapter.js";
import { parseAudioRightsCsv } from "../../src/social-intelligence-live/social-audio-rights-csv-adapter.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

class FixedClock { public constructor(private readonly value = "2026-07-15T10:00:00.000Z") {} public now(): Date { return new Date(this.value); } }

describe("Social Intelligence Live activation", () => {
  it("returns the newest bounded SQLite window when more than 500 records exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-social-window-"));
    const repositories = new SqliteRepositoryTransactionRunner({ path: join(directory, "runtime.sqlite"), timeoutMs: 1_000 });
    try {
      const service = new SocialIntelligenceLiveService({ actorId: "fabio", clock: new FixedClock(), repositories, workspaceId: "onlyway" });
      const records = Array.from({ length: 501 }, (_, index) => service.createRecord({
        accountRef: `account-${String(index).padStart(3, "0")}`,
        country: "IT",
        kind: "ACCOUNT",
        ownership: "OWNED",
        platform: "INSTAGRAM",
        recordId: `social-window-${String(index).padStart(3, "0")}`,
      }));
      await expect(service.importBatch({ batchId: "social-window-first-500", records: records.slice(0, 500) })).resolves.toMatchObject({ status: "COMMITTED" });
      await service.importRecord(records[500]);
      const latest = await repositories.transaction(({ operationalPlanes }) => operationalPlanes.listSocialLiveRecordsByWorkspaceId("onlyway", 500));
      expect(latest).toHaveLength(500);
      expect(latest[0]?.recordId).toBe("social-window-001");
      expect(latest.at(-1)?.recordId).toBe("social-window-500");
      expect(latest.some(({ recordId }) => recordId === "social-window-000")).toBe(false);
    } finally {
      await repositories.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("persists replay-safe real imports and refuses fingerprint conflicts", async () => {
    const { service } = await fixture();
    const account = service.createRecord({ accountRef: "mr.metodo.veloce_official", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "social-account-mv-001" } as const);
    expect(await service.importRecord(account)).toEqual(account);
    expect(await service.importRecord(account)).toEqual(account);
    const conflicting = service.createRecord({ accountRef: "different-account", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "social-account-mv-001" } as const);
    await expect(service.importRecord(conflicting)).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("blocks competitor observations until Fabio has authorized the public account", async () => {
    const { service } = await fixture();
    const observation = service.createRecord({ callToAction: "Salva il post", competitorRecordId: "competitor-001", coverPattern: "Titolo ad alto contrasto", editorialGap: "Claim poco attestati", format: "CAROUSEL", frequency: "NON_MISURATA", hashtags: [], hook: "Oggetti da rivendere", kind: "COMPETITOR_OBSERVATION", observedAt: "2026-07-15T09:00:00.000Z", recordId: "competitor-observation-001", repetitions: [], sourceId: "source-social-public", topics: ["rivendita"] } as const);
    await expect(service.importRecord(observation)).rejects.toThrow("authorized public competitor");
  });

  it("keeps corrections append-only and does not claim a best time from one post", async () => {
    const { service } = await fixture();
    const account = service.createRecord({ accountRef: "mr.metodo.veloce_official", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "social-account-mv-001" } as const);
    await service.importRecord(account);
    const first = analytics(service, { metrics: { profileVisits: 12, reach: 1_000, saves: 80, shares: 20 }, recordId: "analytics-post-001" });
    await service.importRecord(first);
    const correction = analytics(service, { correctionOfRecordId: first.recordId, metrics: { profileVisits: 13, reach: 1_000, saves: 90, shares: 25 }, recordId: "analytics-post-001-correction" });
    await service.importRecord(correction);
    const report = await service.report();
    expect(report.baseline).toEqual({ accountRecordId: account.recordId, postCount: 1, ratios: { profileVisitsPerReach: 0.013, savesPerReach: 0.09, sharesPerReach: 0.025 }, status: "INSUFFICIENT_DATA", timingConclusion: "EXPERIMENT_REQUIRED" });
    expect(report.missingInputs).toContain("TREND_REALI_NON_IMPORTATI");
    expect(report.unauthorizedExternalEffectOccurred).toBe(false);
  });

  it("keeps post-publication history append-only while using only the latest snapshot per content", async () => {
    const { service } = await fixture();
    const account = service.createRecord({ accountRef: "mr.metodo.veloce_official", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "social-account-mv-001" } as const);
    await service.importRecord(account);
    await service.importRecord(analytics(service, { metrics: { reach: 100, saves: 5 }, recordId: "analytics-post-snapshot-001" }));
    const later = service.createRecord({ accountRecordId: "social-account-mv-001", capturedAt: "2026-07-15T10:00:00.000Z", contentId: "post-five-items-001", format: "CAROUSEL", kind: "ANALYTICS", metrics: { reach: 200, saves: 20 }, platform: "INSTAGRAM", publishedAt: "2026-06-09T18:00:00.000Z", recordId: "analytics-post-snapshot-002", sourceId: "source-social-public" });
    await service.importRecord(later);
    expect((await service.report()).baseline).toMatchObject({ postCount: 1, ratios: { savesPerReach: 0.1 } });
  });

  it("creates the first controlled experiment without inventing publication timestamps", async () => {
    const { service } = await fixture();
    const experiment = createFirstMetodoVeloceExperiment(service, { experimentId: "mv-experiment-001" });
    await service.importRecord(experiment);
    const report = await service.report();
    expect(report.experiment).toMatchObject({ primaryVariable: "PUBLICATION_WINDOW", status: "AWAITING_FABIO_PARAMETERS" });
    expect(report.experiment?.arms).toEqual([{ label: "FASCIA_SERALE" }, { label: "FASCIA_PRANZO" }]);
    expect(report.decisionsRequired).toBe(1);
  });

  it("previews, commits, and replays a batch atomically", async () => {
    const { service } = await fixture();
    const account = service.createRecord({ accountRef: "mr.metodo.veloce_official", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "batch-account-001" });
    const analyticsRecord = service.createRecord({ accountRecordId: "batch-account-001", capturedAt: "2026-07-15T09:30:00.000Z", contentId: "batch-post-001", format: "CAROUSEL", kind: "ANALYTICS", metrics: { reach: 1_000, saves: 75 }, platform: "INSTAGRAM", publishedAt: "2026-07-14T18:00:00.000Z", recordId: "batch-analytics-001", sourceId: "source-social-public" });
    const batch = { batchId: "social-batch-001", records: [account, analyticsRecord] };
    await expect(service.previewBatch(batch)).resolves.toMatchObject({ recordCount: 2, status: "READY", counts: { ACCOUNT: 1, ANALYTICS: 1 } });
    await expect(service.importBatch(batch)).resolves.toMatchObject({ status: "COMMITTED", unauthorizedExternalEffectOccurred: false });
    await expect(service.importBatch(batch)).resolves.toMatchObject({ status: "REPLAYED" });
    expect((await service.report()).baseline.postCount).toBe(1);
  });

  it("rolls back the entire batch when one competitor observation is unauthorized", async () => {
    const { service } = await fixture();
    const account = service.createRecord({ accountRef: "rollback-account", country: "IT", kind: "ACCOUNT", ownership: "OWNED", platform: "INSTAGRAM", recordId: "rollback-account-001" });
    const invalidObservation = service.createRecord({ callToAction: "Salva", competitorRecordId: "missing-competitor", coverPattern: "Titolo", editorialGap: "Gap", format: "CAROUSEL", frequency: "SETTIMANALE", hashtags: [], hook: "Hook", kind: "COMPETITOR_OBSERVATION", observedAt: "2026-07-15T09:00:00.000Z", recordId: "rollback-observation-001", repetitions: [], sourceId: "source-social-public", topics: ["rivendita"] });
    await expect(service.importBatch({ batchId: "blocked-batch-001", records: [account, invalidObservation] })).resolves.toMatchObject({ status: "BLOCKED", blockers: [expect.stringContaining("COMPETITOR_NOT_AUTHORIZED")] });
    expect((await service.report()).missingInputs).toContain("ACCOUNT_METODO_VELOCE_NON_REGISTRATO");
  });

  it("normalizes an attributed analytics CSV without imputing blank metrics", async () => {
    const { service } = await fixture();
    const csv = "snapshot_id,content_id,published_at,captured_at,format,reach,views,saves,shares,comments,profile_visits,followers_gained,carousel_completions\nanalytics-csv-001,post-csv-001,2026-07-14T18:00:00.000Z,2026-07-15T09:00:00.000Z,CAROUSEL,1000,,82,21,4,13,,600\n";
    const [record] = parseSocialAnalyticsCsv({ accountRecordId: "account-csv-001", csv, platform: "INSTAGRAM", service, sourceId: "source-social-public" });
    expect(record).toMatchObject({ kind: "ANALYTICS", metrics: { carouselCompletions: 600, comments: 4, profileVisits: 13, reach: 1_000, saves: 82, shares: 21 } });
    expect((record as SocialAnalyticsSnapshot).metrics).not.toHaveProperty("views");
  });

  it("registers the bounded official Social source policy idempotently", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner(); const clock = new FixedClock();
    const operationalPlanes = new OperationalPlaneService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
    const first = await ensureInitialSocialSources({ operationalPlanes, repositories, workspaceId: "onlyway" });
    const replay = await ensureInitialSocialSources({ operationalPlanes, repositories, workspaceId: "onlyway" });
    expect(first.map(({ sourceId }) => sourceId)).toEqual([...INITIAL_SOCIAL_SOURCE_BLUEPRINTS, ...SOCIAL_PUBLIC_OBSERVATION_SOURCE_BLUEPRINTS].map(({ sourceId }) => sourceId));
    expect(replay).toEqual(first);
  });

  it("imports an immutable Google Trends RSS snapshot without declaring compatibility", async () => {
    const { service } = await fixture();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel><link>https://trends.google.com/trending/rss</link><item><title>mercatino usato</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>Wed, 15 Jul 2026 09:00:00 +0000</pubDate></item></channel></rss>`;
    const parsed = parseGoogleTrendsRss({ acquiredAt: "2026-07-15T10:00:00.000Z", byteLength: Buffer.byteLength(xml), finalUrl: "https://trends.google.com/trending/rss?geo=IT", service, sourceId: "source-social-public", territory: "IT", xml });
    await expect(service.importBatch({ batchId: `trend-${parsed.contentHash.slice(0, 20)}`, records: parsed.items })).resolves.toMatchObject({ status: "COMMITTED" });
    const report = await service.report();
    expect(report).toMatchObject({ compatibleTrends: 0, totalTrends: 1, unclassifiedTrends: 1 });
    expect(report.missingInputs).toContain("TREND_COMPATIBILITA_NON_CLASSIFICATA");
    expect(report.cycleReadiness).toMatchObject({ status: "BLOCKED", trendObservations: 1 });
  });

  it("classifies compatibility separately from trend phase and requires two durable evidence records", async () => {
    const { service } = await fixture();
    await authorizeInitialSocialCompetitors({ actorId: "fabio", request: { authorizationId: "competitors-for-trend", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: EXACT_COMPETITOR_AUTHORIZATION_TEXT }, service });
    const createObservation = (recordId: string, competitorRecordId: string): SocialLiveRecord => service.createRecord({ callToAction: "Salva", competitorRecordId, coverPattern: "Cover", editorialGap: "Manca una procedura verificabile", format: "CAROUSEL", frequency: "NON_MISURATA", hashtags: [], hook: "Second hand", kind: "COMPETITOR_OBSERVATION", observedAt: "2026-07-15T09:00:00.000Z", recordId, repetitions: [], sourceId: "source-social-public", topics: ["second-hand"] });
    const first = createObservation("trend-evidence-001", "competitor-instagram-maert-ens");
    const second = createObservation("trend-evidence-002", "competitor-instagram-telotrovosu");
    await service.importBatch({ batchId: "trend-evidence-batch", records: [first, second] });
    expect(() => service.createRecord({ audience: "Pubblico italiano interessato alla rivendita", classificationEvidenceRecordIds: [first.recordId], classificationRationale: "Un solo segnale non basta", classifiedAt: "2026-07-15T10:00:00.000Z", classifiedBy: "fabio", compatibility: "COMPATIBLE", expiresAt: "2026-07-22T09:00:00.000Z", keyword: "second-hand", kind: "TREND", observedAt: "2026-07-15T09:00:00.000Z", phase: "UNCLASSIFIED", platform: "INSTAGRAM", recordId: "classified-trend-invalid", sourceId: "source-social-public", territory: "IT" })).toThrow(/validation/iu);
    const classified = service.createRecord({ audience: "Pubblico italiano interessato alla rivendita", classificationEvidenceRecordIds: [first.recordId, second.recordId], classificationRationale: "Due osservazioni pubbliche attribuibili mostrano interesse corrente per second-hand e scoperta di articoli rivendibili; la fase resta non classificata.", classifiedAt: "2026-07-15T10:00:00.000Z", classifiedBy: "fabio", compatibility: "COMPATIBLE", expiresAt: "2026-07-22T09:00:00.000Z", keyword: "second-hand", kind: "TREND", observedAt: "2026-07-15T09:00:00.000Z", phase: "UNCLASSIFIED", platform: "INSTAGRAM", recordId: "classified-trend-valid", sourceId: "source-social-public", territory: "IT" });
    await expect(service.importRecord(classified)).resolves.toMatchObject({ compatibility: "COMPATIBLE", phase: "UNCLASSIFIED" });
    expect(await service.report()).toMatchObject({ compatibleTrends: 1, unclassifiedTrends: 0 });
  });

  it("requires the exact Fabio confirmation before authorizing the six-account competitor set", async () => {
    const { service } = await fixture();
    await expect(authorizeInitialSocialCompetitors({ actorId: "fabio", request: { authorizationId: "competitors-v1", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: "APPROVA" }, service })).rejects.toThrow(/authorization is invalid/iu);
    await expect(authorizeInitialSocialCompetitors({ actorId: "fabio", request: { authorizationId: "competitors-v1", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: EXACT_COMPETITOR_AUTHORIZATION_TEXT }, service })).resolves.toMatchObject({ counts: { COMPETITOR: 6 }, status: "COMMITTED" });
    const report = await service.report();
    expect(report.competitorAccountsAuthorized).toBe(6);
    expect(report.cycleReadiness.blockers).toContain("OSSERVAZIONI_COMPETITOR_INSUFFICIENTI_0_DI_6");
  });

  it("acquires the official Italian Trends feed through the bounded source and replays it safely", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner(); const clock = new FixedClock();
    const operationalPlanes = new OperationalPlaneService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
    await ensureInitialSocialSources({ operationalPlanes, repositories, workspaceId: "onlyway" });
    const live = new SocialIntelligenceLiveService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
    const xml = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel><link>https://trends.google.com/trending/rss</link><item><title>usato</title><ht:approx_traffic>200+</ht:approx_traffic><pubDate>Wed, 15 Jul 2026 09:00:00 +0000</pubDate></item></channel></rss>`;
    const https: RestrictedHttpsClient = Object.freeze({ acquire: () => Promise.resolve(Object.freeze({ body: xml, byteLength: Buffer.byteLength(xml), contentType: "text/xml" as const, finalUrl: "https://trends.google.com/trending/rss?geo=IT", redirectChain: Object.freeze([]) })) });
    const acquisition = new GoogleTrendsLiveAcquisitionService({ actorId: "fabio", clock, https, live, repositories, workspaceId: "onlyway" });
    await expect(acquisition.acquire()).resolves.toMatchObject({ importReceipt: { status: "COMMITTED" }, itemCount: 1, unauthorizedExternalEffectOccurred: false });
    await expect(acquisition.acquire()).resolves.toMatchObject({ importReceipt: { status: "REPLAYED" }, itemCount: 1 });
  });

  it("imports attributable competitor observations only after the exact account authorization", async () => {
    const { service } = await fixture();
    await authorizeInitialSocialCompetitors({ actorId: "fabio", request: { authorizationId: "competitors-for-observations", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: EXACT_COMPETITOR_AUTHORIZATION_TEXT }, service });
    const csv = "observation_id,competitor_record_id,observed_at,source_url,source_excerpt,format,frequency,hook,cover_pattern,call_to_action,audio,hashtags,topics,repetitions,visible_engagement,editorial_gap\nobservation-maert-001,competitor-instagram-maert-ens,2026-07-15T09:00:00.000Z,https://www.instagram.com/maert.ens/,Carosello pubblico osservato il 15 luglio,CAROUSEL,SETTIMANALE,Errore comune nella rivendita,Titolo bianco su fondo scuro,Salva il post,,vinted|usato,rivendita|second-hand,checklist,1200,Manca attestazione dei claim di prezzo\n";
    const records = parseCompetitorObservationsCsv({ csv, service, sourceId: "source-social-public" });
    await expect(service.importBatch({ batchId: "competitor-observations-001", records })).resolves.toMatchObject({ status: "COMMITTED" });
    const observation = records[0];
    expect(observation?.kind).toBe("COMPETITOR_OBSERVATION");
    if (observation?.kind !== "COMPETITOR_OBSERVATION") throw new Error("Expected a competitor observation");
    expect(observation.sourceContentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(observation.sourceUrl).toBe("https://www.instagram.com/maert.ens/");
    const report = await service.report();
    expect(report.competitorObservations).toBe(1);
    expect(report.competitorIntelligencePack).toMatchObject({ coverage: { authorizedAccounts: 6, observedAccounts: 1, usableObservations: 1 }, externalActionsAllowed: false, copyingAllowed: false, status: "BLOCKED" });
    expect(report.competitorIntelligencePack.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const later = await service.report();
    expect(later.competitorIntelligencePack.fingerprint).toBe(report.competitorIntelligencePack.fingerprint);
  });

  it("records an attributable negative Commercial Music Library result without inventing an authorized audio", async () => {
    const { service } = await fixture();
    const csv = "observation_id,audio_id,title,platform,account_ref,country,available,account_compatibility,commercial_use,mood,observed_at,expires_at,saturation\naudio-check-001,no-authorized-result,Nessun audio autorizzato rilevato,TIKTOK,mr.metodo.veloce_official,IT,false,UNKNOWN,NOT_AUTHORIZED,NON_APPLICABILE,2026-07-15T09:00:00.000Z,2026-07-16T09:00:00.000Z,\n";
    const records = parseAudioRightsCsv({ csv, service, sourceId: "source-social-public" });
    await expect(service.importBatch({ batchId: "audio-rights-001", records })).resolves.toMatchObject({ status: "COMMITTED" });
    const report = await service.report();
    expect(report).toMatchObject({ audioAuthorized: 0, audioNotAuthorized: 1, cycleReadiness: { audioDecision: "AUDIO_NON_AUTORIZZATO" } });
    expect(report.cycleReadiness.blockers).not.toContain("COMMERCIAL_MUSIC_LIBRARY_NON_VERIFICATA");
  });

  it("keeps the previous competitor pack immutable while materializing a replacement version", async () => {
    const { service } = await fixture();
    await authorizeInitialSocialCompetitors({ actorId: "fabio", request: { authorizationId: "competitors-pack-v1", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: EXACT_COMPETITOR_AUTHORIZATION_TEXT }, service });
    const observation = (recordId: string, competitorRecordId: string, format = "CAROUSEL") => service.createRecord({ callToAction: "Salva", competitorRecordId, coverPattern: "Headline ad alto contrasto", editorialGap: "Metodo Veloce può aggiungere una procedura verificabile", format, frequency: "NON_MISURATA", hashtags: [], hook: "Hook pubblico", kind: "COMPETITOR_OBSERVATION", observedAt: "2026-07-15T09:00:00.000Z", recordId, repetitions: [], sourceId: "source-social-public", sourceUrl: "https://www.instagram.com/flashnotizie24/reel/Da0eRRSiYl0/", topics: ["visual"] });
    const initialIds = ["competitor-instagram-maert-ens", "competitor-instagram-telotrovosu", "competitor-instagram-imprenditore-it", "competitor-instagram-marcelloascani", "competitor-instagram-leonpinn", "competitor-instagram-pillole-di-economia"];
    await service.importBatch({ batchId: "observations-pack-v1", records: initialIds.map((id, index) => observation(`observation-pack-v1-${String(index + 1)}`, id, id.endsWith("leonpinn") ? "PROFILE_REDIRECT" : "CAROUSEL")) });
    const v1 = await service.materializeCompetitorIntelligencePack("competitor-pack-record-v1");
    expect(v1.pack).toMatchObject({ status: "PARTIAL", version: 1 });
    await authorizeSocialCompetitorReplacement({ actorId: "fabio", request: { accountRef: "flashnotizie24", authorizationId: "replace-leonpinn-v2", authorizedAt: "2026-07-15T10:00:00.000Z", confirmationText: EXACT_COMPETITOR_REPLACEMENT_TEXT, recordId: "competitor-instagram-flashnotizie24", replacementReason: "Profilo pubblico visuale osservabile autorizzato da Fabio", replacesCompetitorRecordId: "competitor-instagram-leonpinn", role: "VISUAL_REFERENCE", subrole: "HOOK_AND_HEADLINE_REFERENCE" }, service });
    await service.importRecord(observation("observation-flashnotizie24-v2", "competitor-instagram-flashnotizie24"));
    const v2 = await service.materializeCompetitorIntelligencePack("competitor-pack-record-v2");
    const report = await service.report();
    expect(v2.pack).toMatchObject({ status: "READY", supersedesFingerprint: v1.pack.fingerprint, version: 2 });
    expect(report.competitorIntelligencePackHistory.map(({ fingerprint }) => fingerprint)).toEqual([v1.pack.fingerprint, v2.pack.fingerprint]);
    expect(report.competitorIntelligencePackHistory[0]).toEqual(v1.pack);
    expect(report.competitorAccountsAuthorized).toBe(6);
  });

  it("rejects a commercially allowed audio that is unavailable for the exact account", async () => {
    const { service } = await fixture();
    const csv = "observation_id,audio_id,title,platform,account_ref,country,available,account_compatibility,commercial_use,mood,observed_at,expires_at,saturation\naudio-check-invalid,audio-001,Traccia,TIKTOK,mr.metodo.veloce_official,IT,false,UNKNOWN,ALLOWED,ENERGICO,2026-07-15T09:00:00.000Z,2026-07-16T09:00:00.000Z,50\n";
    expect(() => parseAudioRightsCsv({ csv, service, sourceId: "source-social-public" })).toThrow(/must be available/iu);
  });
});

async function fixture(): Promise<{ readonly service: SocialIntelligenceLiveService }> {
  const repositories = new InMemoryRepositoryTransactionRunner();
  const source: SourceRegistryEntry = { actorId: "fabio", canonicalReference: "https://example.test/social-export", category: "AUTHORIZED_DATASET", createdAt: "2026-07-15T10:00:00.000Z", maxFreshnessDays: 30, name: "Import social autorizzato", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: false, reliability: "HIGH", requiresSecondSource: false, sourceId: "source-social-public", status: "AUTHORIZED", version: 0, workspaceId: "onlyway" };
  await repositories.transaction(({ operationalPlanes }) => operationalPlanes.insertSource(source));
  return { service: new SocialIntelligenceLiveService({ actorId: "fabio", clock: new FixedClock(), repositories, workspaceId: "onlyway" }) };
}

function analytics(service: SocialIntelligenceLiveService, input: { readonly correctionOfRecordId?: string; readonly metrics: SocialAnalyticsSnapshot["metrics"]; readonly recordId: string }): SocialLiveRecord {
  return service.createRecord({ accountRecordId: "social-account-mv-001", capturedAt: "2026-07-15T09:30:00.000Z", contentId: "post-five-items-001", ...(input.correctionOfRecordId === undefined ? {} : { correctionOfRecordId: input.correctionOfRecordId }), format: "CAROUSEL", kind: "ANALYTICS", metrics: input.metrics, platform: "INSTAGRAM", publishedAt: "2026-06-09T18:00:00.000Z", recordId: input.recordId, sourceId: "source-social-public" } as const);
}
