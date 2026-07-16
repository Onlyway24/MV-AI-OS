import type { AuthorizedResearchMission, ResearchAcquisitionSnapshot } from "./authorized-research.js";

export interface AuthorizedResearchRepository {
  getMissionById(missionId: string): Promise<AuthorizedResearchMission | undefined>;
  getSnapshotById(snapshotId: string): Promise<ResearchAcquisitionSnapshot | undefined>;
  insertMission(mission: AuthorizedResearchMission): Promise<void>;
  insertSnapshot(snapshot: ResearchAcquisitionSnapshot): Promise<void>;
  listMissionsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly AuthorizedResearchMission[]>;
  listSnapshotsByMissionId(missionId: string): Promise<readonly ResearchAcquisitionSnapshot[]>;
  updateMission(mission: AuthorizedResearchMission, expectation: { readonly version: number }): Promise<void>;
}
