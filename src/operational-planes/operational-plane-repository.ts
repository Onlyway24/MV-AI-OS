import type { EvidencePack, EvidenceRecord, FeedbackMetricSnapshot, PublicationKillSwitch, PublicationPlan, SourceRegistryEntry } from "./operational-plane.js";

export interface OperationalPlaneRepository {
  getEvidenceById(evidenceId: string): Promise<EvidenceRecord | undefined>;
  getEvidencePackById(packId: string): Promise<EvidencePack | undefined>;
  getFeedbackSnapshotById(snapshotId: string): Promise<FeedbackMetricSnapshot | undefined>;
  getPublicationById(publicationId: string): Promise<PublicationPlan | undefined>;
  getPublicationKillSwitch(workspaceId: string): Promise<PublicationKillSwitch | undefined>;
  getSourceById(sourceId: string): Promise<SourceRegistryEntry | undefined>;
  insertEvidence(record: EvidenceRecord): Promise<void>;
  insertEvidencePack(record: EvidencePack): Promise<void>;
  insertFeedbackSnapshot(record: FeedbackMetricSnapshot): Promise<void>;
  insertPublication(record: PublicationPlan): Promise<void>;
  insertSource(record: SourceRegistryEntry): Promise<void>;
  listEvidenceByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidenceRecord[]>;
  listEvidencePacksByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidencePack[]>;
  listFeedbackSnapshots(publicationId: string): Promise<readonly FeedbackMetricSnapshot[]>;
  listSourcesByWorkspaceId(workspaceId: string, limit: number): Promise<readonly SourceRegistryEntry[]>;
  updatePublication(record: PublicationPlan, expectation: { readonly version: number }): Promise<void>;
  upsertPublicationKillSwitch(record: PublicationKillSwitch, expectation: { readonly version: number }): Promise<void>;
}
