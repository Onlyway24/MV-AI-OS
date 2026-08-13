import type { EvidencePack, EvidenceRecord, FeedbackMetricSnapshot, PublicationKillSwitch, PublicationPlan, SourceRegistryEntry } from "./operational-plane.js";
import type { SocialLiveRecord } from "../social-intelligence-live/social-intelligence-live.js";

export interface OperationalPlaneRepository {
  getEvidenceById(evidenceId: string): Promise<EvidenceRecord | undefined>;
  getEvidencePackById(packId: string): Promise<EvidencePack | undefined>;
  getFeedbackSnapshotById(snapshotId: string): Promise<FeedbackMetricSnapshot | undefined>;
  getPublicationById(publicationId: string): Promise<PublicationPlan | undefined>;
  getPublicationKillSwitch(workspaceId: string): Promise<PublicationKillSwitch | undefined>;
  getSourceById(sourceId: string): Promise<SourceRegistryEntry | undefined>;
  getSocialLiveRecordById(recordId: string): Promise<SocialLiveRecord | undefined>;
  insertEvidence(record: EvidenceRecord): Promise<void>;
  insertEvidencePack(record: EvidencePack): Promise<void>;
  insertFeedbackSnapshot(record: FeedbackMetricSnapshot): Promise<void>;
  insertPublication(record: PublicationPlan): Promise<void>;
  insertSource(record: SourceRegistryEntry): Promise<void>;
  insertSocialLiveRecord(record: SocialLiveRecord): Promise<void>;
  listEvidenceByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidenceRecord[]>;
  listEvidencePacksByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidencePack[]>;
  listFeedbackSnapshots(publicationId: string): Promise<readonly FeedbackMetricSnapshot[]>;
  listOpenPublicationsByProductionId(productionId: string, limit: number): Promise<readonly PublicationPlan[]>;
  listSourcesByWorkspaceId(workspaceId: string, limit: number): Promise<readonly SourceRegistryEntry[]>;
  listSocialLiveRecordsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly SocialLiveRecord[]>;
  updatePublication(record: PublicationPlan, expectation: { readonly version: number }): Promise<void>;
  upsertPublicationKillSwitch(record: PublicationKillSwitch, expectation: { readonly version: number }): Promise<void>;
}
