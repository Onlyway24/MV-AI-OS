import type { DailyOperatingBriefRecord } from "./daily-operating-brief.js";

export interface DailyOperatingBriefRepository {
  getByBusinessDate(workspaceId: string, businessDate: string): Promise<DailyOperatingBriefRecord | undefined>;
  getById(briefId: string): Promise<DailyOperatingBriefRecord | undefined>;
  insert(record: DailyOperatingBriefRecord): Promise<void>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly DailyOperatingBriefRecord[]>;
}
