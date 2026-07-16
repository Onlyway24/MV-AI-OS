import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { EvidenceRecordRequest, SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { extractAuthorizedDocument } from "./authorized-document-extractor.js";
import type {
  AuthorizedResearchClaimResult,
  AuthorizedResearchMission,
  AuthorizedResearchMissionInput,
  ResearchAcquisitionSnapshot,
} from "./authorized-research.js";
import {
  AuthorizedResearchMissionInputValidator,
  researchInputFingerprint,
  sha256,
} from "./authorized-research-validator.js";
import type { RestrictedHttpsClient } from "./restricted-https-client.js";

export class AuthorizedResearchService {
  readonly #validator = new AuthorizedResearchMissionInputValidator();
  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly https: RestrictedHttpsClient;
    readonly operationalPlanes: OperationalPlaneService;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) {}

  public async run(value: unknown): Promise<AuthorizedResearchMission> {
    const input = this.#validate(value);
    const inputFingerprint = researchInputFingerprint(input);
    let mission = await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.getMissionById(input.missionId));
    if (mission === undefined) {
      const initialMission = this.#initial(input, inputFingerprint);
      await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.insertMission(initialMission));
      mission = initialMission;
    } else if (mission.workspaceId !== this.dependencies.workspaceId || mission.actorId !== this.dependencies.actorId || mission.inputFingerprint !== inputFingerprint) throw new RepositoryConflictError("Authorized Research Mission identity conflicts with durable state");
    if (mission.status !== "RUNNING") return mission;

    try {
      const sources = await this.#sources(input);
      const snapshots: ResearchAcquisitionSnapshot[] = [];
      for (const target of input.targets) {
        const snapshotId = `${input.missionId}:${target.evidenceId}`;
        const existing = await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.getSnapshotById(snapshotId));
        if (existing !== undefined) {
          if (existing.missionId !== input.missionId || existing.evidenceId !== target.evidenceId || existing.sourceId !== target.sourceId || existing.requestedUrl !== target.url) throw new RepositoryConflictError("Authorized Research snapshot identity conflicts with durable state");
          snapshots.push(existing);
          continue;
        }
        const source = sources.get(target.sourceId);
        if (source === undefined) throw new RepositoryConflictError("Authorized Research target source is unavailable");
        const acquisition = await this.dependencies.https.acquire({ maxBytes: input.maxBytesPerSource, maxRedirects: input.maxRedirects, source, timeoutMs: input.timeoutMs, url: target.url });
        const acquiredAt = this.#now();
        const claims = input.claims.filter(({ claimId }) => target.claimIds.includes(claimId));
        const extraction = extractAuthorizedDocument({ acquiredAt, acquisition, claims, source });
        const snapshot: ResearchAcquisitionSnapshot = deepFreeze({
          acquiredAt,
          actorId: this.dependencies.actorId,
          attribution: extraction.attribution,
          byteLength: acquisition.byteLength,
          ...(extraction.contentPublishedAt === undefined ? {} : { contentPublishedAt: extraction.contentPublishedAt }),
          contentText: acquisition.body,
          contentType: acquisition.contentType,
          evidenceId: target.evidenceId,
          extractedFacts: extraction.facts,
          extractedTables: extraction.tables,
          finalUrl: acquisition.finalUrl,
          fingerprint: sha256(acquisition.body),
          limitations: Object.freeze([...target.limitations, ...extraction.limitations]),
          missionId: input.missionId,
          redirectChain: acquisition.redirectChain,
          requestedUrl: target.url,
          snapshotId,
          sourceId: target.sourceId,
          title: extraction.title,
          workspaceId: this.dependencies.workspaceId,
        });
        await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.insertSnapshot(snapshot));
        snapshots.push(snapshot);
      }

      const claimResults = this.#claimResults(input, snapshots, sources);
      const blockers = this.#blockers(input, snapshots, sources, claimResults);
      if (blockers.length > 0) return await this.#finish(mission, { blockers, claimResults, snapshotIds: snapshots.map(({ snapshotId }) => snapshotId), status: "BLOCKED" });

      const evidenceInputs = this.#evidenceInputs(input, snapshots, sources, claimResults);
      const evidenceIds = evidenceInputs.map(({ evidenceId }) => evidenceId);
      const existingEvidence = await this.dependencies.repositories.transaction(({ operationalPlanes }) => Promise.all(evidenceIds.map((evidenceId) => operationalPlanes.getEvidenceById(evidenceId))));
      if (existingEvidence.every((record) => record === undefined)) await this.dependencies.operationalPlanes.recordEvidenceBatch(evidenceInputs);
      else if (!existingEvidence.every((record, index) => record?.workspaceId === this.dependencies.workspaceId && record.actorId === this.dependencies.actorId && record.fingerprint === evidenceInputs[index]?.fingerprint)) throw new RepositoryConflictError("Authorized Research evidence recovery is inconsistent");

      const packIds: string[] = [];
      for (const plan of input.packs) {
        const existing = await this.dependencies.repositories.transaction(({ operationalPlanes }) => operationalPlanes.getEvidencePackById(plan.packId));
        if (existing === undefined) await this.dependencies.operationalPlanes.createEvidencePack({ evidenceIds: plan.evidenceIds, packId: plan.packId });
        else if (existing.workspaceId !== this.dependencies.workspaceId || existing.actorId !== this.dependencies.actorId || !sameIds(existing.evidenceIds, plan.evidenceIds)) throw new RepositoryConflictError("Authorized Research Evidence Pack recovery is inconsistent");
        packIds.push(plan.packId);
      }
      return await this.#finish(mission, { blockers: [], claimResults, evidenceIds, packIds, snapshotIds: snapshots.map(({ snapshotId }) => snapshotId), status: "READY" });
    } catch (error) {
      return this.#finish(mission, { blockers: [safeBlocker(error)], status: "BLOCKED" });
    }
  }

  public inspect(missionId: string): Promise<AuthorizedResearchMission> {
    return this.dependencies.repositories.transaction(async ({ authorizedResearch }) => this.#owned(await authorizedResearch.getMissionById(missionId)));
  }

  public list(limit: number): Promise<readonly AuthorizedResearchMission[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Authorized Research Mission list limit is invalid");
    return this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.listMissionsByWorkspaceId(this.dependencies.workspaceId, limit));
  }

  #initial(input: AuthorizedResearchMissionInput, inputFingerprint: string): AuthorizedResearchMission {
    const now = this.#now();
    return deepFreeze({ actorId: this.dependencies.actorId, blockers: [], claimResults: [], contractVersion: "1", createdAt: now, evidenceIds: [], input, inputFingerprint, packIds: [], snapshotIds: [], status: "RUNNING", updatedAt: now, version: 0, workspaceId: this.dependencies.workspaceId });
  }

  async #finish(mission: AuthorizedResearchMission, changes: Partial<AuthorizedResearchMission>): Promise<AuthorizedResearchMission> {
    const next = deepFreeze({ ...mission, ...changes, updatedAt: this.#now(), version: mission.version + 1 });
    await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.updateMission(next, { version: mission.version }));
    return next;
  }

  async #sources(input: AuthorizedResearchMissionInput): Promise<Map<string, SourceRegistryEntry>> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const sources = new Map<string, SourceRegistryEntry>();
      for (const sourceId of new Set(input.targets.map(({ sourceId }) => sourceId))) {
        const source = await operationalPlanes.getSourceById(sourceId);
        if (source?.workspaceId !== this.dependencies.workspaceId || source.actorId !== this.dependencies.actorId || source.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new RepositoryConflictError("Authorized Research source is unavailable or not authorized");
        sources.set(sourceId, source);
      }
      return sources;
    });
  }

  #claimResults(input: AuthorizedResearchMissionInput, snapshots: readonly ResearchAcquisitionSnapshot[], sources: ReadonlyMap<string, SourceRegistryEntry>): readonly AuthorizedResearchClaimResult[] {
    return Object.freeze(input.claims.map((claim) => {
      const facts = snapshots.flatMap((snapshot) => snapshot.extractedFacts.filter(({ claimId }) => claimId === claim.claimId).map((fact) => ({ fact, snapshot })));
      const supported = facts.filter(({ fact }) => fact.status === "SUPPORTED");
      const sourceIds = new Set(supported.map(({ snapshot }) => snapshot.sourceId));
      const requiresSecond = claim.riskDomain !== "GENERAL" || supported.some(({ snapshot }) => sources.get(snapshot.sourceId)?.requiresSecondSource === true);
      const requiredSourceCount = requiresSecond ? 2 as const : 1 as const;
      const status = facts.some(({ fact }) => fact.status === "CONTESTED") ? "CONTESTED" as const : sourceIds.size >= requiredSourceCount ? "VERIFIED" as const : "INSUFFICIENT" as const;
      return Object.freeze({ claimId: claim.claimId, evidenceIds: Object.freeze(supported.map(({ snapshot }) => snapshot.evidenceId)), independentSourceCount: sourceIds.size, requiredSourceCount, statement: claim.statement, status });
    }));
  }

  #blockers(input: AuthorizedResearchMissionInput, snapshots: readonly ResearchAcquisitionSnapshot[], sources: ReadonlyMap<string, SourceRegistryEntry>, results: readonly AuthorizedResearchClaimResult[]): readonly string[] {
    const blockers: string[] = results.filter(({ status }) => status !== "VERIFIED").map(({ claimId, independentSourceCount, requiredSourceCount, status }) => `Claim ${claimId}: ${status}; fonti indipendenti ${String(independentSourceCount)}/${String(requiredSourceCount)}.`);
    for (const snapshot of snapshots) {
      const source = sources.get(snapshot.sourceId);
      if (source === undefined) continue;
      const basis = snapshot.contentPublishedAt ?? snapshot.acquiredAt;
      const expiresAt = Date.parse(basis) + source.maxFreshnessDays * 86_400_000;
      if (expiresAt <= this.dependencies.clock.now().getTime()) blockers.push(`Fonte ${snapshot.sourceId}: contenuto scaduto secondo la freshness policy.`);
      if (snapshot.contentPublishedAt !== undefined && Date.parse(snapshot.contentPublishedAt) > Date.parse(snapshot.acquiredAt)) blockers.push(`Fonte ${snapshot.sourceId}: data contenuto futura o incoerente.`);
    }
    for (const pack of input.packs) if (!pack.evidenceIds.every((evidenceId) => snapshots.some((snapshot) => snapshot.evidenceId === evidenceId))) blockers.push(`Evidence Pack ${pack.packId}: snapshot incompleto.`);
    return Object.freeze([...new Set(blockers)]);
  }

  #evidenceInputs(input: AuthorizedResearchMissionInput, snapshots: readonly ResearchAcquisitionSnapshot[], sources: ReadonlyMap<string, SourceRegistryEntry>, results: readonly AuthorizedResearchClaimResult[]): readonly EvidenceRecordRequest[] {
    const resultByClaim = new Map(results.map((result) => [result.claimId, result]));
    return Object.freeze(input.targets.map((target) => {
      const snapshot = snapshots.find(({ evidenceId }) => evidenceId === target.evidenceId);
      const source = sources.get(target.sourceId);
      if (snapshot === undefined || source === undefined) throw new RepositoryConflictError("Authorized Research snapshot is unavailable for evidence creation");
      const mappings = snapshot.extractedFacts.filter(({ claimId, status }) => target.claimIds.includes(claimId) && status === "SUPPORTED" && resultByClaim.get(claimId)?.status === "VERIFIED").map(({ claimId, statement }) => ({ claimId, statement }));
      if (mappings.length < 1) throw new RepositoryValidationError("Authorized Research target has no verified claim mapping");
      const corroboratingEvidenceIds = [...new Set(mappings.flatMap(({ claimId }) => resultByClaim.get(claimId)?.evidenceIds ?? []).filter((evidenceId) => evidenceId !== target.evidenceId))].slice(0, 4);
      const basis = snapshot.contentPublishedAt ?? snapshot.acquiredAt;
      const freshnessExpiresAt = new Date(Math.min(Date.parse(snapshot.acquiredAt) + source.maxFreshnessDays * 86_400_000, Date.parse(basis) + source.maxFreshnessDays * 86_400_000)).toISOString();
      const excerpt = snapshot.extractedFacts.filter(({ status }) => status === "SUPPORTED").map(({ excerpt: value }) => value).join("\n\n").slice(0, 1_200);
      const riskDomains = new Set(mappings.map(({ claimId }) => input.claims.find((claim) => claim.claimId === claimId)?.riskDomain ?? "GENERAL"));
      if (riskDomains.size !== 1) throw new RepositoryValidationError("One evidence target cannot mix risk domains");
      return Object.freeze({
        claimMappings: Object.freeze(mappings),
        contentPublishedAt: snapshot.contentPublishedAt ?? snapshot.acquiredAt,
        corroboratingEvidenceIds: Object.freeze(corroboratingEvidenceIds),
        evidenceId: target.evidenceId,
        excerpt,
        fingerprint: snapshot.fingerprint,
        freshnessExpiresAt,
        limitations: Object.freeze(snapshot.limitations.slice(0, 6)),
        riskDomain: [...riskDomains][0] ?? "GENERAL",
        sourceId: target.sourceId,
        sourceReference: snapshot.finalUrl,
        status: "VERIFIED" as const,
      });
    }));
  }

  #validate(value: unknown): AuthorizedResearchMissionInput { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Authorized Research Mission input failed validation", { issueCount: checked.issues.length }); return checked.value; }
  #owned(value: AuthorizedResearchMission | undefined): AuthorizedResearchMission { if (value?.workspaceId !== this.dependencies.workspaceId || value.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Authorized Research Mission is unavailable"); return value; }
  #now(): string { const now = this.dependencies.clock.now(); if (Number.isNaN(now.getTime())) throw new RepositoryValidationError("Authorized Research clock is invalid"); return now.toISOString(); }
}

function safeBlocker(error: unknown): string { return error instanceof RepositoryConflictError || error instanceof RepositoryValidationError ? error.message : "Authorized Research acquisition failed without a safe attributable result."; }
function sameIds(left: readonly string[], right: readonly string[]): boolean { return [...left].sort().join("\n") === [...right].sort().join("\n"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
