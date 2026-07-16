import type { BusinessMissionDossier } from "./business-mission.js";

export interface BusinessMissionRepository {
  getById(missionId: string): Promise<BusinessMissionDossier | undefined>;
  insert(record: BusinessMissionDossier): Promise<void>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly BusinessMissionDossier[]>;
  update(record: BusinessMissionDossier, expectation: { readonly version: number }): Promise<void>;
}
