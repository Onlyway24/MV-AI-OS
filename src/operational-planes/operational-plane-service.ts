import { createHash } from "node:crypto";

import type { ContentEvidence } from "../content-production/metodo-veloce-content-production.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { EvidenceRecord, EvidenceRecordRequest, FeedbackAnalysis, FeedbackMetricImportRequest, FeedbackMetricSnapshot, PublicationAuthorizationRequest, PublicationDryRunRequest, PublicationKillSwitch, PublicationKillSwitchRequest, PublicationPlan, PublicationReceiptRequest, SourceRegistrationRequest, SourceRegistryEntry } from "./operational-plane.js";
import type { OperationalPlaneRepository } from "./operational-plane-repository.js";

export interface OperationalPlaneServiceDependencies { readonly actorId: string; readonly clock: Clock; readonly repositories: RepositoryTransactionRunner; readonly workspaceId: string; }

export class OperationalPlaneService {
  public constructor(private readonly dependencies: OperationalPlaneServiceDependencies) {}

  public async registerSource(input: SourceRegistrationRequest): Promise<SourceRegistryEntry> {
    const createdAt = this.#now();
    const source: SourceRegistryEntry = { ...input, actorId: this.dependencies.actorId, createdAt, version: 0, workspaceId: this.dependencies.workspaceId };
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      if (await operationalPlanes.getSourceById(source.sourceId) !== undefined) throw new RepositoryConflictError("Evidence source already exists");
      await operationalPlanes.insertSource(source); return source;
    });
  }

  public async recordEvidence(input: EvidenceRecordRequest): Promise<EvidenceRecord> {
    const acquiredAt = this.#now();
    const candidate: EvidenceRecord = { ...input, acquiredAt, actorId: this.dependencies.actorId, version: 0, workspaceId: this.dependencies.workspaceId };
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const source = await this.#ownedSource(operationalPlanes, candidate.sourceId);
      if (await operationalPlanes.getEvidenceById(candidate.evidenceId) !== undefined) throw new RepositoryConflictError("Evidence record already exists");
      this.#assertEvidencePolicy(candidate, source);
      if (candidate.status === "VERIFIED") await this.#assertCorroboration(candidate, source, operationalPlanes);
      await operationalPlanes.insertEvidence(candidate); return candidate;
    });
  }

  public async assertEvidenceForContent(evidence: readonly ContentEvidence[], evidenceIds: readonly string[]): Promise<void> {
    if (evidence.length !== evidenceIds.length || new Set(evidenceIds).size !== evidenceIds.length || !evidence.every((item, index) => item.evidenceId === evidenceIds[index])) throw new RepositoryValidationError("Content evidence IDs must be exact and unique");
    await this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const records = await Promise.all(evidenceIds.map((id) => operationalPlanes.getEvidenceById(id)));
      for (const [index, item] of evidence.entries()) {
        const record = records[index];
        if (record?.workspaceId !== this.dependencies.workspaceId || record.status !== "VERIFIED" || Date.parse(record.freshnessExpiresAt) <= this.dependencies.clock.now().getTime() || record.sourceId !== item.sourceRef || !record.claimMappings.some(({ statement }) => statement === item.statement)) throw new RepositoryConflictError("Content evidence is not verified, current, or claim-bound");
        const source = await this.#ownedSource(operationalPlanes, record.sourceId);
        if (!source.publicCitationAllowed) throw new RepositoryConflictError("Content evidence source is not eligible for public citation");
      }
    });
  }

  public async createPublicationDryRun(input: PublicationDryRunRequest): Promise<PublicationPlan> {
    return this.dependencies.repositories.transaction(async ({ contentProductions, operationalPlanes }) => {
      if (await operationalPlanes.getPublicationById(input.publicationId) !== undefined) throw new RepositoryConflictError("Publication plan already exists");
      const content = await this.#ownedContent(contentProductions, input.productionId);
      if (content.status !== "SCHEDULED" || content.version !== input.contentVersion || content.schedule?.scheduledFor !== input.scheduledFor) throw new RepositoryConflictError("Publication dry-run must bind the exact scheduled content version");
      const now = this.#now();
      const plan: PublicationPlan = { accountRef: input.accountRef, actorId: this.dependencies.actorId, contentPackageFingerprint: fingerprint(content.package), contentVersion: content.version, createdAt: now, dryRun: true, idempotencyKey: input.idempotencyKey, platform: input.platform, productionId: content.productionId, publicationId: input.publicationId, scheduledFor: input.scheduledFor, status: "DRY_RUN", updatedAt: now, version: 0, workspaceId: this.dependencies.workspaceId };
      await operationalPlanes.insertPublication(plan); return plan;
    });
  }

  public async authorizePublication(input: PublicationAuthorizationRequest): Promise<PublicationPlan> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const control = await operationalPlanes.getPublicationKillSwitch(this.dependencies.workspaceId);
      if (control?.enabled === true) throw new RepositoryConflictError("Global publication kill switch is enabled");
      const current = await this.#ownedPublication(operationalPlanes, input.publicationId);
      if (current.status !== "DRY_RUN" || current.version !== input.expectedVersion) throw new RepositoryConflictError("Publication plan is not eligible for final authorization");
      const now = this.#now();
      const next: PublicationPlan = { ...current, authorization: { authorizedAt: now, authorizedBy: this.dependencies.actorId }, status: "AUTHORIZED", updatedAt: now, version: current.version + 1 };
      await operationalPlanes.updatePublication(next, { version: current.version }); return next;
    });
  }

  public async recordPublicationReceipt(input: PublicationReceiptRequest): Promise<PublicationPlan> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const current = await this.#ownedPublication(operationalPlanes, input.publicationId);
      if (current.status !== "AUTHORIZED" || current.version !== input.expectedVersion) throw new RepositoryConflictError("Publication plan is not eligible for a receipt");
      const now = this.#now();
      const next: PublicationPlan = { ...current, receipt: { outcome: input.outcome, ...(input.platformContentRef === undefined ? {} : { platformContentRef: input.platformContentRef }), receiptFingerprint: input.receiptFingerprint, recordedAt: now }, status: input.outcome, updatedAt: now, version: current.version + 1 };
      await operationalPlanes.updatePublication(next, { version: current.version }); return next;
    });
  }

  public async setPublicationKillSwitch(input: PublicationKillSwitchRequest): Promise<PublicationKillSwitch> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const current = await operationalPlanes.getPublicationKillSwitch(this.dependencies.workspaceId);
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== input.expectedVersion) throw new RepositoryConflictError("Publication kill switch changed after read");
      const next: PublicationKillSwitch = { enabled: input.enabled, updatedAt: this.#now(), updatedBy: this.dependencies.actorId, version: currentVersion + 1, workspaceId: this.dependencies.workspaceId };
      await operationalPlanes.upsertPublicationKillSwitch(next, { version: currentVersion }); return next;
    });
  }

  public async importFeedbackMetrics(input: FeedbackMetricImportRequest): Promise<FeedbackMetricSnapshot> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      const publication = await this.#ownedPublication(operationalPlanes, input.publicationId);
      if (publication.status !== "SUCCEEDED" || publication.receipt?.receiptFingerprint !== input.publicationReceiptFingerprint) throw new RepositoryConflictError("Feedback import requires a confirmed external publication receipt");
      if (await operationalPlanes.getFeedbackSnapshotById(input.snapshotId) !== undefined) throw new RepositoryConflictError("Feedback metric snapshot already exists");
      if (input.correctionOfSnapshotId !== undefined) { const original = await operationalPlanes.getFeedbackSnapshotById(input.correctionOfSnapshotId); if (original?.workspaceId !== this.dependencies.workspaceId || original.publicationId !== publication.publicationId) throw new RepositoryConflictError("Feedback correction must reference a snapshot for the same publication"); }
      const snapshot: FeedbackMetricSnapshot = { actorId: this.dependencies.actorId, capturedAt: this.#now(), conversionAttribution: input.conversionAttribution, ...(input.correctionOfSnapshotId === undefined ? {} : { correctionOfSnapshotId: input.correctionOfSnapshotId }), metrics: input.metrics, periodEnd: input.periodEnd, periodStart: input.periodStart, platform: publication.platform, productionId: publication.productionId, publicationId: publication.publicationId, publicationReceiptFingerprint: input.publicationReceiptFingerprint, snapshotFingerprint: input.snapshotFingerprint, snapshotId: input.snapshotId, workspaceId: this.dependencies.workspaceId };
      await operationalPlanes.insertFeedbackSnapshot(snapshot); return snapshot;
    });
  }

  public async analyzeFeedback(publicationId: string): Promise<FeedbackAnalysis> {
    return this.dependencies.repositories.transaction(async ({ operationalPlanes }) => {
      await this.#ownedPublication(operationalPlanes, publicationId);
      const snapshots = await operationalPlanes.listFeedbackSnapshots(publicationId);
      const corrected = new Set(snapshots.flatMap((snapshot) => snapshot.correctionOfSnapshotId === undefined ? [] : [snapshot.correctionOfSnapshotId]));
      const latest = snapshots.filter((snapshot) => !corrected.has(snapshot.snapshotId)).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt) || right.snapshotId.localeCompare(left.snapshotId))[0];
      return { contractVersion: "1", correctionCount: corrected.size, ...(latest === undefined ? {} : { latest }), publicationId, snapshotCount: snapshots.length, unauthorizedExternalEffectOccurred: false };
    });
  }

  async #ownedSource(repository: OperationalPlaneRepository, sourceId: string): Promise<SourceRegistryEntry> { const source = await repository.getSourceById(sourceId); if (source?.workspaceId !== this.dependencies.workspaceId || source.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Evidence source is unavailable"); return source; }
  async #ownedPublication(repository: OperationalPlaneRepository, publicationId: string): Promise<PublicationPlan> { const publication = await repository.getPublicationById(publicationId); if (publication?.workspaceId !== this.dependencies.workspaceId || publication.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Publication plan is unavailable"); return publication; }
  async #ownedContent(repository: { getById(id: string): Promise<MetodoVeloceContentProductionRecord | undefined> }, productionId: string): Promise<MetodoVeloceContentProductionRecord> { const content = await repository.getById(productionId); if (content?.workspaceId !== this.dependencies.workspaceId || content.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Content production is unavailable"); return content; }
  #assertEvidencePolicy(evidence: EvidenceRecord, source: SourceRegistryEntry): void {
    if (source.status !== "AUTHORIZED" || source.category === "FORBIDDEN") throw new RepositoryConflictError("Evidence source is not authorized");
    if (!evidence.sourceReference.startsWith(source.canonicalReference) || !source.permittedRiskDomains.includes(evidence.riskDomain)) throw new RepositoryValidationError("Evidence does not match the authorized source policy");
    const maxExpiry = Date.parse(evidence.acquiredAt) + source.maxFreshnessDays * 86_400_000;
    if (Date.parse(evidence.freshnessExpiresAt) > maxExpiry) throw new RepositoryValidationError("Evidence freshness exceeds the source policy");
    const now = this.dependencies.clock.now().getTime();
    if ((Date.parse(evidence.freshnessExpiresAt) <= now) !== (evidence.status === "STALE")) throw new RepositoryValidationError("Evidence freshness status is inconsistent");
    if (evidence.status === "VERIFIED" && source.reliability === "LOW") throw new RepositoryValidationError("Low-reliability source evidence cannot be marked verified");
  }
  async #assertCorroboration(evidence: EvidenceRecord, source: SourceRegistryEntry, repository: OperationalPlaneRepository): Promise<void> {
    const needsSecondSource = source.requiresSecondSource || evidence.riskDomain !== "GENERAL";
    if (!needsSecondSource) return;
    const corroborations = await Promise.all(evidence.corroboratingEvidenceIds.map((id) => repository.getEvidenceById(id)));
    const claimIds = new Set(evidence.claimMappings.map(({ claimId }) => claimId));
    if (!corroborations.some((item) => item?.workspaceId === this.dependencies.workspaceId && item.status === "VERIFIED" && item.sourceId !== evidence.sourceId && item.claimMappings.some(({ claimId }) => claimIds.has(claimId)))) throw new RepositoryValidationError("Verified high-risk or corroborated evidence requires an independent supporting source");
  }
  #now(): string { const value = this.dependencies.clock.now(); if (Number.isNaN(value.getTime())) throw new RepositoryValidationError("Operational plane clock is invalid"); return value.toISOString(); }
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
