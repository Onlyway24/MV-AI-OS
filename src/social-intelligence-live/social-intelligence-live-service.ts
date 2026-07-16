import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { OperationalPlaneRepository } from "../operational-planes/operational-plane-repository.js";
import type { AuthorizedCompetitorRecord, CompetitorIntelligencePack, CompetitorIntelligencePackRecord, CompetitorObservation, DailySocialOperationsReport, SocialAccountBaseline, SocialAnalyticsSnapshot, SocialLiveImportBatchReceipt, SocialLiveImportBatchRequest, SocialLiveRecord, SocialLiveRecordKind, SocialPublicationExperiment, SocialTrendObservation } from "./social-intelligence-live.js";
import { socialLiveFingerprint, SocialLiveRecordValidator } from "./social-intelligence-live-validator.js";
import { INITIAL_SOCIAL_SOURCE_BLUEPRINTS } from "./social-official-sources.js";

export class SocialIntelligenceLiveService {
  readonly #validator = new SocialLiveRecordValidator();
  public constructor(private readonly dependencies: { readonly actorId: string; readonly clock: Clock; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string }) {}

  public async importRecord(value: unknown): Promise<SocialLiveRecord> {
    const record = this.#validate(value);
    this.#owned(record);
    const existing = await this.dependencies.repositories.transaction(({ operationalPlanes }) => operationalPlanes.getSocialLiveRecordById(record.recordId));
    if (existing !== undefined) {
      if (existing.fingerprint !== record.fingerprint) throw new RepositoryConflictError("Social Intelligence Live record ID conflicts with a different fingerprint");
      return existing;
    }
    await this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      if (record.kind === "ANALYTICS") {
        const account = await operationalPlanes.getSocialLiveRecordById(record.accountRecordId);
        if (account?.kind !== "ACCOUNT" || account.workspaceId !== record.workspaceId || account.platform !== record.platform) throw new RepositoryConflictError("Analytics import requires a matching owned account record");
        if (record.correctionOfRecordId !== undefined) {
          const corrected = await operationalPlanes.getSocialLiveRecordById(record.correctionOfRecordId);
          if (corrected?.kind !== "ANALYTICS" || corrected.contentId !== record.contentId || corrected.accountRecordId !== record.accountRecordId) throw new RepositoryConflictError("Analytics correction does not reference the same content and account");
        }
      }
      if (record.kind === "COMPETITOR_OBSERVATION") {
        const competitor = await operationalPlanes.getSocialLiveRecordById(record.competitorRecordId);
        if (competitor?.kind !== "COMPETITOR" || competitor.status !== "AUTHORIZED" || competitor.workspaceId !== record.workspaceId) throw new RepositoryConflictError("Competitor observation requires an authorized public competitor record");
      }
      if (record.kind === "COMPETITOR" && record.replacesCompetitorRecordId !== undefined) {
        const replaced = await operationalPlanes.getSocialLiveRecordById(record.replacesCompetitorRecordId);
        if (replaced?.kind !== "COMPETITOR" || replaced.status !== "AUTHORIZED" || replaced.workspaceId !== record.workspaceId || replaced.platform !== record.platform) throw new RepositoryConflictError("Competitor replacement requires an active competitor in the same workspace and platform");
        const all = await operationalPlanes.listSocialLiveRecordsByWorkspaceId(record.workspaceId, 500);
        if (all.some((candidate) => candidate.kind === "COMPETITOR" && candidate.replacesCompetitorRecordId === record.replacesCompetitorRecordId)) throw new RepositoryConflictError("Competitor has already been replaced");
      }
      if (record.kind === "TREND") await assertTrendClassificationEvidence(record, (recordId) => operationalPlanes.getSocialLiveRecordById(recordId));
      if (["ANALYTICS", "AUDIO_RIGHTS", "COMPETITOR_OBSERVATION", "TREND"].includes(record.kind)) {
        const sourceId = "sourceId" in record ? record.sourceId : undefined;
        const source = sourceId === undefined ? undefined : await operationalPlanes.getSourceById(sourceId);
        if (source?.workspaceId !== record.workspaceId || source.actorId !== record.actorId || source.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new RepositoryConflictError("Social Intelligence Live import requires an authorized Source Registry entry");
      }
      await operationalPlanes.insertSocialLiveRecord(record);
    });
    return record;
  }

  public createRecord(input: Readonly<Record<string, unknown>>): SocialLiveRecord {
    const base = { ...input, actorId: this.dependencies.actorId, contractVersion: "1" as const, importedAt: this.#now(), workspaceId: this.dependencies.workspaceId };
    return this.#validate({ ...base, fingerprint: socialLiveFingerprint(base) });
  }

  public async report(): Promise<DailySocialOperationsReport> {
    const { records, sourceIds } = await this.dependencies.repositories.transaction(async ({ operationalPlanes }) => ({ records: await operationalPlanes.listSocialLiveRecordsByWorkspaceId(this.dependencies.workspaceId, 500), sourceIds: (await operationalPlanes.listSourcesByWorkspaceId(this.dependencies.workspaceId, 100)).map(({ sourceId }) => sourceId) }));
    return buildDailySocialOperationsReport(records, this.dependencies.clock.now(), sourceIds);
  }

  public async materializeCompetitorIntelligencePack(recordId: string): Promise<CompetitorIntelligencePackRecord> {
    if (!/^[a-zA-Z0-9@._:-]{1,128}$/u.test(recordId)) throw new RepositoryValidationError("Competitor Intelligence Pack record ID is invalid");
    const records = await this.dependencies.repositories.transaction(({ operationalPlanes }) => operationalPlanes.listSocialLiveRecordsByWorkspaceId(this.dependencies.workspaceId, 500));
    const existing = records.find((record) => record.recordId === recordId);
    if (existing !== undefined) {
      if (existing.kind !== "COMPETITOR_PACK") throw new RepositoryConflictError("Competitor Intelligence Pack record ID is already in use");
      return existing;
    }
    const history = competitorPackHistory(records);
    const previous = history.at(-1);
    const version = (previous?.version ?? 0) + 1;
    const pack = buildCompetitorIntelligencePack(activeCompetitors(records), records.filter((record): record is CompetitorObservation => record.kind === "COMPETITOR_OBSERVATION"), this.dependencies.clock.now(), {
      packId: `competitor-intelligence-pack-v${String(version)}`,
      ...(previous === undefined ? {} : { supersedesFingerprint: previous.fingerprint }),
      version,
    });
    const created = this.createRecord({ kind: "COMPETITOR_PACK", pack, recordId }) as CompetitorIntelligencePackRecord;
    return await this.importRecord(created) as CompetitorIntelligencePackRecord;
  }

  public previewBatch(value: unknown): Promise<SocialLiveImportBatchReceipt> { return this.#batch(value, false); }
  public importBatch(value: unknown): Promise<SocialLiveImportBatchReceipt> { return this.#batch(value, true); }

  async #batch(value: unknown, commit: boolean): Promise<SocialLiveImportBatchReceipt> {
    const input = this.#batchInput(value);
    const records = input.records.map((record) => { const checked = this.#validate(record); this.#owned(checked); return checked; });
    const batchFingerprint = socialLiveFingerprint({ batchId: input.batchId, records: [...records].sort((left, right) => left.recordId.localeCompare(right.recordId)).map(({ fingerprint, kind, recordId }) => ({ fingerprint, kind, recordId })) });
    const generatedAt = this.#now();
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const existing = await Promise.all(records.map(({ recordId }) => operationalPlanes.getSocialLiveRecordById(recordId)));
      const existingCount = existing.filter((record) => record !== undefined).length;
      if (existingCount === records.length && existing.every((record, index) => record?.fingerprint === records[index]?.fingerprint)) return batchReceipt(input.batchId, batchFingerprint, records, generatedAt, "REPLAYED", []);
      const blockers: string[] = [];
      if (existingCount > 0) blockers.push("BATCH_PARTIAL_REPLAY_CONFLICT");
      const batchRecords = new Map(records.map((record) => [record.recordId, record]));
      for (const record of records) {
        if (existing.find((candidate) => candidate?.recordId === record.recordId) !== undefined) continue;
        try { await this.#preflightRecord(operationalPlanes, record, batchRecords); }
        catch (error) { blockers.push(`${record.recordId}:${safeBatchBlocker(error)}`); }
      }
      if (blockers.length > 0) return batchReceipt(input.batchId, batchFingerprint, records, generatedAt, "BLOCKED", blockers);
      if (!commit) return batchReceipt(input.batchId, batchFingerprint, records, generatedAt, "READY", []);
      for (const record of records) await operationalPlanes.insertSocialLiveRecord(record);
      return batchReceipt(input.batchId, batchFingerprint, records, generatedAt, "COMMITTED", []);
    });
  }

  async #preflightRecord(repository: OperationalPlaneRepository, record: SocialLiveRecord, batchRecords: ReadonlyMap<string, SocialLiveRecord>): Promise<void> {
    const lookup = async (recordId: string): Promise<SocialLiveRecord | undefined> => batchRecords.get(recordId) ?? repository.getSocialLiveRecordById(recordId);
    if (record.kind === "ANALYTICS") {
      const account = await lookup(record.accountRecordId);
      if (account?.kind !== "ACCOUNT" || account.workspaceId !== record.workspaceId || account.platform !== record.platform) throw new RepositoryConflictError("ANALYTICS_ACCOUNT_NOT_OWNED");
      if (record.correctionOfRecordId !== undefined) {
        const corrected = await lookup(record.correctionOfRecordId);
        if (corrected?.kind !== "ANALYTICS" || corrected.contentId !== record.contentId || corrected.accountRecordId !== record.accountRecordId) throw new RepositoryConflictError("ANALYTICS_CORRECTION_IDENTITY_MISMATCH");
      }
    }
    if (record.kind === "COMPETITOR_OBSERVATION") {
      const competitor = await lookup(record.competitorRecordId);
      if (competitor?.kind !== "COMPETITOR" || competitor.status !== "AUTHORIZED" || competitor.workspaceId !== record.workspaceId) throw new RepositoryConflictError("COMPETITOR_NOT_AUTHORIZED");
    }
    if (record.kind === "COMPETITOR" && record.replacesCompetitorRecordId !== undefined) {
      const replaced = await lookup(record.replacesCompetitorRecordId);
      if (replaced?.kind !== "COMPETITOR" || replaced.status !== "AUTHORIZED" || replaced.workspaceId !== record.workspaceId || replaced.platform !== record.platform) throw new RepositoryConflictError("COMPETITOR_REPLACEMENT_TARGET_INVALID");
      const persisted = await repository.listSocialLiveRecordsByWorkspaceId(record.workspaceId, 500);
      if (persisted.some((candidate) => candidate.kind === "COMPETITOR" && candidate.replacesCompetitorRecordId === record.replacesCompetitorRecordId)) throw new RepositoryConflictError("COMPETITOR_ALREADY_REPLACED");
    }
    if (record.kind === "TREND") await assertTrendClassificationEvidence(record, lookup);
    if (["ANALYTICS", "AUDIO_RIGHTS", "COMPETITOR_OBSERVATION", "TREND"].includes(record.kind)) {
      const sourceId = "sourceId" in record ? record.sourceId : undefined;
      const source = sourceId === undefined ? undefined : await repository.getSourceById(sourceId);
      if (source?.workspaceId !== record.workspaceId || source.actorId !== record.actorId || source.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new RepositoryConflictError("SOURCE_NOT_AUTHORIZED");
    }
  }

  #validate(value: unknown): SocialLiveRecord { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Social Intelligence Live record failed validation", { issueCount: result.issues.length }); return result.value; }
  #batchInput(value: unknown): SocialLiveImportBatchRequest {
    if (!isUnknownRecord(value)) throw new RepositoryValidationError("Social Intelligence Live batch is invalid");
    const input = value;
    if (typeof input.batchId !== "string" || !/^[a-zA-Z0-9@._:-]{1,128}$/u.test(input.batchId) || !Array.isArray(input.records) || input.records.length < 1 || input.records.length > 500) throw new RepositoryValidationError("Social Intelligence Live batch is invalid");
    const records = input.records.map((record) => this.#validate(record));
    if (new Set(records.map(({ recordId }) => recordId)).size !== records.length) throw new RepositoryValidationError("Social Intelligence Live batch record IDs must be unique");
    return Object.freeze({ batchId: input.batchId, records: Object.freeze(records) });
  }
  #owned(record: SocialLiveRecord): void { if (record.actorId !== this.dependencies.actorId || record.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Social Intelligence Live record is outside the active operator boundary"); }
  #now(): string { const now = this.dependencies.clock.now(); if (Number.isNaN(now.getTime())) throw new RepositoryValidationError("Social Intelligence Live clock is invalid"); return now.toISOString(); }
}

function batchReceipt(batchId: string, batchFingerprint: string, records: readonly SocialLiveRecord[], generatedAt: string, status: SocialLiveImportBatchReceipt["status"], blockers: readonly string[]): SocialLiveImportBatchReceipt {
  const counts = Object.fromEntries((["ACCOUNT", "ANALYTICS", "AUDIO_RIGHTS", "COMPETITOR", "COMPETITOR_OBSERVATION", "COMPETITOR_PACK", "EXPERIMENT", "TREND"] as const).map((kind) => [kind, records.filter((record) => record.kind === kind).length])) as Record<SocialLiveRecordKind, number>;
  return deepFreeze({ batchFingerprint, batchId, blockers: Object.freeze([...new Set(blockers)]), counts, generatedAt, recordCount: records.length, status, unauthorizedExternalEffectOccurred: false as const });
}
function safeBatchBlocker(error: unknown): string { return error instanceof RepositoryConflictError || error instanceof RepositoryValidationError ? error.message.replaceAll(" ", "_").toUpperCase() : "PREFLIGHT_FAILED"; }
function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function buildDailySocialOperationsReport(records: readonly SocialLiveRecord[], generatedAt: Date, registeredSourceIds: readonly string[] = []): DailySocialOperationsReport {
    const now = generatedAt.getTime();
    const accounts = records.filter((record) => record.kind === "ACCOUNT");
    const analytics = latestAnalytics(records.filter((record): record is SocialAnalyticsSnapshot => record.kind === "ANALYTICS"));
    const trends = latestTrendObservations(records.filter((record): record is SocialTrendObservation => record.kind === "TREND"));
    const competitors = activeCompetitors(records);
    const competitorObservations = records.filter((record): record is CompetitorObservation => record.kind === "COMPETITOR_OBSERVATION");
    const competitorIntelligencePackHistory = competitorPackHistory(records);
    const competitorIntelligencePack = competitorIntelligencePackHistory.at(-1) ?? buildCompetitorIntelligencePack(competitors, competitorObservations, generatedAt);
    const usableCompetitorObservations = competitorIntelligencePack.coverage.usableObservations;
    const audio = records.filter((record) => record.kind === "AUDIO_RIGHTS");
    const experiment = records.filter((record): record is SocialPublicationExperiment => record.kind === "EXPERIMENT").sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0];
    const baseline = accountBaseline(accounts[0]?.recordId, analytics);
    const officialSourcesRegistered = INITIAL_SOCIAL_SOURCE_BLUEPRINTS.filter(({ sourceId }) => registeredSourceIds.includes(sourceId)).length;
    const audioAuthorized = audio.filter((record) => record.available && record.commercialUse === "ALLOWED" && record.accountCompatibility === "AVAILABLE" && Date.parse(record.expiresAt) > now).length;
    const unclassifiedTrends = trends.filter((record) => record.compatibility === undefined || record.compatibility === "UNCLASSIFIED").length;
    const compatibleTrends = trends.filter((record) => record.compatibility === "COMPATIBLE" && Date.parse(record.expiresAt) > now).length;
    const cycleBlockers = [
      ...(trends.length < 1 ? ["TREND_EXPORT_NON_IMPORTATO"] : []),
      ...(trends.length > 0 && compatibleTrends < 1 ? ["NESSUN_TREND_COMPATIBILE_CLASSIFICATO"] : []),
      ...(competitors.length < 6 ? [`COMPETITOR_AUTORIZZATI_INSUFFICIENTI_${String(competitors.length)}_DI_6`] : []),
      ...(usableCompetitorObservations < 6 ? [`OSSERVAZIONI_COMPETITOR_INSUFFICIENTI_${String(usableCompetitorObservations)}_DI_6`] : []),
      ...(audio.length < 1 ? ["COMMERCIAL_MUSIC_LIBRARY_NON_VERIFICATA"] : []),
    ];
    const missingInputs = [
      ...(accounts.length === 0 ? ["ACCOUNT_METODO_VELOCE_NON_REGISTRATO"] : []),
      ...(analytics.length === 0 ? ["ANALYTICS_REALI_NON_IMPORTATI"] : []),
      ...(trends.length === 0 ? ["TREND_REALI_NON_IMPORTATI"] : []),
      ...(trends.length > 0 && unclassifiedTrends === trends.length ? ["TREND_COMPATIBILITA_NON_CLASSIFICATA"] : []),
      ...(competitors.length === 0 ? ["REGISTRO_COMPETITOR_AUTORIZZATI_VUOTO"] : []),
      ...(audio.length === 0 ? ["DIRITTI_AUDIO_NON_VERIFICATI"] : []),
      ...(experiment === undefined ? ["ESPERIMENTO_NON_CREATO"] : []),
      ...(officialSourcesRegistered < INITIAL_SOCIAL_SOURCE_BLUEPRINTS.length ? ["FONTI_SOCIAL_UFFICIALI_NON_REGISTRATE"] : []),
    ];
    return deepFreeze({
      acquisitionReadiness: officialSourcesRegistered === 0 ? "NOT_CONFIGURED" as const : officialSourcesRegistered === INITIAL_SOCIAL_SOURCE_BLUEPRINTS.length ? "READY" as const : "PARTIAL" as const,
      audioAuthorized,
      audioNotAuthorized: audio.filter((record) => !record.available || record.commercialUse !== "ALLOWED" || record.accountCompatibility !== "AVAILABLE" || Date.parse(record.expiresAt) <= now).length,
      baseline,
      compatibleTrends,
      competitorAccountsAuthorized: competitors.length,
      competitorIntelligencePack,
      competitorIntelligencePackHistory,
      competitorObservations: competitorObservations.length,
      cycleReadiness: {
        analyticsSnapshots: analytics.length,
        audioDecision: audioAuthorized > 0 ? "AUDIO_AUTORIZZATO" as const : audio.length > 0 ? "AUDIO_NON_AUTORIZZATO" as const : "NON_VERIFICATO" as const,
        blockers: Object.freeze(cycleBlockers),
        competitorAccounts: competitors.length,
        competitorObservations: competitorObservations.length,
        status: cycleBlockers.length === 0 ? "READY_FOR_EVIDENCE_PRODUCTION" as const : "BLOCKED" as const,
        trendObservations: trends.length,
      },
      decisionsRequired: (experiment?.status === "AWAITING_FABIO_PARAMETERS" ? 1 : 0) + (competitorIntelligencePack.status === "PARTIAL" ? 1 : 0),
      ...(experiment === undefined ? {} : { experiment }),
      firstPackageReadiness: {
        blockers: Object.freeze(cycleBlockers),
        inputs: {
          analyticsImported: analytics.length > 0,
          audioLibraryVerified: audio.length > 0,
          competitorObservationsComplete: usableCompetitorObservations >= 6,
          competitorSetAuthorized: competitors.length >= 6,
          compatibleTrendAvailable: compatibleTrends > 0,
          trendFeedAcquired: trends.length > 0,
        },
        publication: "LOCKED" as const,
        status: cycleBlockers.length === 0 ? "READY_FOR_EVIDENCE_PRODUCTION" as const : "BLOCKED" as const,
        theme: "5 oggetti in casa che puoi vendere subito — nuova versione evidence-led" as const,
      },
      generatedAt: generatedAt.toISOString(),
      missingInputs: Object.freeze(missingInputs),
      officialSourcesRegistered,
      totalTrends: trends.length,
      unclassifiedTrends,
      trendsExpiringWithin24Hours: trends.filter((record) => Date.parse(record.expiresAt) > now && Date.parse(record.expiresAt) <= now + 86_400_000).length,
      unauthorizedExternalEffectOccurred: false as const,
    });
  }

export function buildCompetitorIntelligencePack(competitors: readonly AuthorizedCompetitorRecord[], observations: readonly CompetitorObservation[], generatedAt: Date, identity: { readonly packId: string; readonly supersedesFingerprint?: string; readonly version: number } = { packId: "competitor-intelligence-pack-v1", version: 1 }): CompetitorIntelligencePack {
  const authorized = [...competitors].sort((left, right) => left.recordId.localeCompare(right.recordId));
  const authorizedIds = new Set(authorized.map(({ recordId }) => recordId));
  const latest = new Map<string, CompetitorObservation>();
  for (const observation of observations) {
    if (!authorizedIds.has(observation.competitorRecordId)) continue;
    const current = latest.get(observation.competitorRecordId);
    if (current === undefined || observation.observedAt > current.observedAt || observation.observedAt === current.observedAt && observation.importedAt > current.importedAt) latest.set(observation.competitorRecordId, observation);
  }
  const findings = authorized.flatMap((competitor) => {
    const observation = latest.get(competitor.recordId);
    if (observation === undefined) return [];
    const usable = observation.format !== "PROFILE_REDIRECT" && observation.frequency !== "NESSUN_CONTENUTO_VISIBILE";
    return [{
      accountRef: competitor.accountRef,
      callToAction: observation.callToAction,
      competitorRecordId: competitor.recordId,
      editorialGap: observation.editorialGap,
      format: observation.format,
      frequency: observation.frequency,
      hook: observation.hook,
      observedAt: observation.observedAt,
      observationRecordId: observation.recordId,
      role: competitor.categories[0] ?? "UNCLASSIFIED",
      ...(observation.sourceUrl === undefined ? {} : { sourceUrl: observation.sourceUrl }),
      usable,
      ...(observation.visibleEngagement === undefined ? {} : { visibleEngagement: observation.visibleEngagement }),
    }];
  });
  const usableObservations = findings.filter(({ usable }) => usable).length;
  const sourceGeneratedAt = [...authorized.map(({ importedAt }) => importedAt), ...[...latest.values()].map(({ importedAt }) => importedAt)].sort().at(-1) ?? generatedAt.toISOString();
  const risks = [
    ...findings.filter(({ usable }) => !usable).map(({ accountRef }) => `PROFILO_AUTORIZZATO_NON_UTILIZZABILE:${accountRef}`),
    ...(authorized.length < 6 ? [`REGISTRO_INCOMPLETO:${String(authorized.length)}_DI_6`] : []),
    ...(findings.length < 6 ? [`COPERTURA_OSSERVAZIONI_INCOMPLETA:${String(findings.length)}_DI_6`] : []),
  ];
  const status = authorized.length < 6 || findings.length < 6 ? "BLOCKED" as const : usableObservations < 6 ? "PARTIAL" as const : "READY" as const;
  const payload = {
    contractVersion: "1" as const,
    copyingAllowed: false as const,
    coverage: { authorizedAccounts: authorized.length, expectedAccounts: 6 as const, observedAccounts: findings.length, usableObservations },
    externalActionsAllowed: false as const,
    findings: Object.freeze(findings),
    generatedAt: sourceGeneratedAt,
    nextAction: status === "READY" ? "Usare i gap osservati per costruire un angolo Metodo Veloce distinto e verificabile." : status === "PARTIAL" ? "Richiedere a Fabio una nuova autorizzazione esplicita per sostituire il profilo-rimando; non osservare automaticamente l'account indicato in bio." : "Completare autorizzazioni e osservazioni pubbliche attribuibili prima di usare il confronto competitor.",
    opportunityGaps: Object.freeze(findings.filter(({ usable }) => usable).map(({ accountRef, editorialGap }) => `${accountRef}: ${editorialGap}`)),
    packId: identity.packId,
    restrictions: ["NO_COPYING", "NO_OUTREACH", "NO_PROFILE_INTERACTION", "NO_EXTERNAL_ACTIONS"] as const,
    risks: Object.freeze(risks),
    sourceRecordIds: Object.freeze(findings.map(({ observationRecordId }) => observationRecordId)),
    status,
    ...(identity.supersedesFingerprint === undefined ? {} : { supersedesFingerprint: identity.supersedesFingerprint }),
    version: identity.version,
  };
  return deepFreeze({ ...payload, fingerprint: socialLiveFingerprint(payload) });
}

function activeCompetitors(records: readonly SocialLiveRecord[]): readonly AuthorizedCompetitorRecord[] {
  const competitors = records.filter((record): record is AuthorizedCompetitorRecord => record.kind === "COMPETITOR" && record.status === "AUTHORIZED");
  const replaced = new Set(competitors.flatMap((record) => record.replacesCompetitorRecordId === undefined ? [] : [record.replacesCompetitorRecordId]));
  return Object.freeze(competitors.filter((record) => !replaced.has(record.recordId)));
}

function competitorPackHistory(records: readonly SocialLiveRecord[]): readonly CompetitorIntelligencePack[] {
  return Object.freeze(records.filter((record): record is CompetitorIntelligencePackRecord => record.kind === "COMPETITOR_PACK").sort((left, right) => left.pack.version - right.pack.version || left.importedAt.localeCompare(right.importedAt)).map(({ pack }) => pack));
}

export function createFirstMetodoVeloceExperiment(service: SocialIntelligenceLiveService, input: { readonly eveningPublicationAt?: string; readonly experimentId: string; readonly lunchPublicationAt?: string }): SocialPublicationExperiment {
  const both = input.eveningPublicationAt !== undefined && input.lunchPublicationAt !== undefined;
  return service.createRecord({
    arms: [{ label: "FASCIA_SERALE", ...(input.eveningPublicationAt === undefined ? {} : { publicationAt: input.eveningPublicationAt }) }, { label: "FASCIA_PRANZO", ...(input.lunchPublicationAt === undefined ? {} : { publicationAt: input.lunchPublicationAt }) }],
    contentTheme: "5 oggetti in casa che puoi vendere subito — angolo aggiornato evidence-led",
    hypothesis: "Il pubblico interessato a rivendita e micro-business risponde meglio in una fascia serale rispetto a una fascia pranzo, a parità di format, stile, CTA e qualità.",
    invariants: ["FORMAT", "STYLE", "CTA", "QUALITY"],
    kind: "EXPERIMENT",
    metrics: ["SAVES_PER_REACH", "SHARES_PER_REACH", "PROFILE_VISITS_PER_REACH", "CAROUSEL_COMPLETION"],
    primaryVariable: "PUBLICATION_WINDOW",
    recordId: input.experimentId,
    status: both ? "READY_FOR_INTERNAL_SCHEDULING" : "AWAITING_FABIO_PARAMETERS",
  } as const) as SocialPublicationExperiment;
}

function latestAnalytics(records: readonly SocialAnalyticsSnapshot[]): readonly SocialAnalyticsSnapshot[] {
  const corrected = new Set(records.flatMap((record) => record.correctionOfRecordId === undefined ? [] : [record.correctionOfRecordId]));
  const latest = new Map<string, SocialAnalyticsSnapshot>();
  for (const record of records) {
    if (corrected.has(record.recordId)) continue;
    const key = `${record.accountRecordId}\n${record.contentId}`;
    const current = latest.get(key);
    if (current === undefined || record.capturedAt > current.capturedAt || record.capturedAt === current.capturedAt && record.importedAt > current.importedAt) latest.set(key, record);
  }
  return Object.freeze([...latest.values()]);
}
function latestTrendObservations(records: readonly SocialTrendObservation[]): readonly SocialTrendObservation[] {
  const latest = new Map<string, SocialTrendObservation>();
  for (const record of records) {
    const key = `${record.platform}\n${record.territory.toLocaleLowerCase("it-IT")}\n${record.keyword.toLocaleLowerCase("it-IT")}`;
    const current = latest.get(key);
    if (current === undefined || record.observedAt > current.observedAt || (record.observedAt === current.observedAt && record.importedAt > current.importedAt)) latest.set(key, record);
  }
  return Object.freeze([...latest.values()]);
}
async function assertTrendClassificationEvidence(record: SocialTrendObservation, lookup: (recordId: string) => Promise<SocialLiveRecord | undefined>): Promise<void> {
  if (record.compatibility === undefined || record.compatibility === "UNCLASSIFIED") return;
  const evidenceIds = record.classificationEvidenceRecordIds ?? [];
  const evidence = await Promise.all(evidenceIds.map((recordId) => lookup(recordId)));
  if (evidenceIds.length < 2 || evidence.some((candidate) => candidate?.workspaceId !== record.workspaceId || !["COMPETITOR_OBSERVATION", "TREND"].includes(candidate.kind))) throw new RepositoryConflictError("TREND_CLASSIFICATION_EVIDENCE_INVALID");
}
function accountBaseline(accountRecordId: string | undefined, records: readonly SocialAnalyticsSnapshot[]): SocialAccountBaseline {
  const scoped = accountRecordId === undefined ? [] : records.filter((record) => record.accountRecordId === accountRecordId);
  const ratio = (key: "profileVisits" | "saves" | "shares"): number | undefined => { const valid = scoped.filter((record) => record.metrics.reach !== undefined && record.metrics.reach > 0 && record.metrics[key] !== undefined); if (valid.length === 0) return undefined; return round(valid.reduce((total, record) => total + (record.metrics[key] ?? 0) / (record.metrics.reach ?? 1), 0) / valid.length); };
  const postCount = new Set(scoped.map(({ contentId }) => contentId)).size;
  const profileVisitsPerReach = ratio("profileVisits"); const savesPerReach = ratio("saves"); const sharesPerReach = ratio("shares");
  return deepFreeze({ ...(accountRecordId === undefined ? {} : { accountRecordId }), postCount, ratios: { ...(profileVisitsPerReach === undefined ? {} : { profileVisitsPerReach }), ...(savesPerReach === undefined ? {} : { savesPerReach }), ...(sharesPerReach === undefined ? {} : { sharesPerReach }) }, status: postCount >= 10 ? "MEASURED" : "INSUFFICIENT_DATA", timingConclusion: postCount >= 10 ? "MEASURED_PATTERN_AVAILABLE" : "EXPERIMENT_REQUIRED" });
}
function round(value: number): number { return Math.round(value * 10000) / 10000; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
