import type { AgentCompanyWorkday } from "./operational-agent-company.js";

export interface AgentCompanyWorkdayRepository {
  getById(workdayId: string): Promise<AgentCompanyWorkday | undefined>;
  insert(record: AgentCompanyWorkday): Promise<void>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly AgentCompanyWorkday[]>;
  update(record: AgentCompanyWorkday, expectation: { readonly version: number }): Promise<void>;
}
