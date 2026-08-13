import type { BusinessMissionDossier } from "./business-mission.js";

export interface BusinessMissionRepository {
  getById(missionId: string): Promise<BusinessMissionDossier | undefined>;
  insert(record: BusinessMissionDossier): Promise<void>;
  listApprovedByOwner(owner: { readonly actorId: string; readonly workspaceId: string }, limit: number): Promise<readonly BusinessMissionDossier[]>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly BusinessMissionDossier[]>;
  update(record: BusinessMissionDossier, expectation: { readonly version: number }): Promise<void>;
}
