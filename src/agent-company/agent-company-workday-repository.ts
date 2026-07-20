import type { AgentCompanyWorkday } from "./operational-agent-company.js";

export interface AgentCompanyWorkdayIdentity {
  readonly actorId: string;
  readonly workspaceId: string;
}

export interface AgentCompanyWorkdayRepository {
  getByOwner(identity: AgentCompanyWorkdayIdentity, workdayId: string): Promise<AgentCompanyWorkday | undefined>;
  insert(record: AgentCompanyWorkday): Promise<void>;
  listByOwner(identity: AgentCompanyWorkdayIdentity, limit: number): Promise<readonly AgentCompanyWorkday[]>;
  update(record: AgentCompanyWorkday, expectation: { readonly version: number }): Promise<void>;
}
