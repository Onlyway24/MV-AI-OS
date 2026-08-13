import type { FounderWorkdayRecord } from "./founder-workday.js";

export interface FounderWorkdayRepository {
  getById(workdayId: string): Promise<FounderWorkdayRecord | undefined>;
  insert(record: FounderWorkdayRecord): Promise<void>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly FounderWorkdayRecord[]>;
  update(record: FounderWorkdayRecord, expectation: { readonly version: number }): Promise<void>;
}
