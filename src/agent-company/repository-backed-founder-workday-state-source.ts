import type { RepositoryTransaction } from "../persistence/repository-transaction.js";
import type { FounderWorkdayStateSnapshot, FounderWorkdayStateSource } from "./founder-workday-service.js";

/** Reads every Founder Workday input in one SQLite transaction. */
export class RepositoryBackedFounderWorkdayStateSource implements FounderWorkdayStateSource {
  public async snapshot({ businessMissions, contentProductions, operationalPlanes }: RepositoryTransaction, workspaceId: string): Promise<FounderWorkdayStateSnapshot> {
      const [businessMissions_, evidencePacks, productions, socialRecords] = await Promise.all([
        businessMissions.listByWorkspaceId(workspaceId, 25),
        operationalPlanes.listEvidencePacksByWorkspaceId(workspaceId, 100),
        contentProductions.listByWorkspaceId(workspaceId, 25),
        operationalPlanes.listSocialLiveRecordsByWorkspaceId(workspaceId, 500),
      ]);
      return Object.freeze({
        businessMissions: Object.freeze(businessMissions_.map(({ mission, status }) => Object.freeze({ missionId: mission.missionId, status }))),
        coverage: Object.freeze({ businessMissions: coverage(businessMissions_, 25), evidencePacks: coverage(evidencePacks, 100), productions: coverage(productions, 25), socialRecords: coverage(socialRecords, 500) }),
        evidencePacks: Object.freeze(evidencePacks.map(({ evidenceIds, minFreshnessExpiresAt, packId, status }) => Object.freeze({ evidenceCount: evidenceIds.length, minFreshnessExpiresAt, packId, status }))),
        productions: Object.freeze(productions.map(({ productionId, status }) => Object.freeze({ productionId, status }))),
        socialRecords: Object.freeze(socialRecords.map(({ kind, recordId }) => Object.freeze({ kind, recordId }))),
      });
  }
}

function coverage(values: readonly unknown[], limit: number): "COMPLETE" | "LIMIT_REACHED" { return values.length < limit ? "COMPLETE" : "LIMIT_REACHED"; }
