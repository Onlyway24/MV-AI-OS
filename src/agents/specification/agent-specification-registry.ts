import type { AgentSpecification } from "./agent-specification.js";

export interface AgentSpecificationRegistry {
  get(agentId: string, version: string): AgentSpecification | undefined;
  list(): readonly AgentSpecification[];
  listVersions(agentId: string): readonly AgentSpecification[];
  findActiveByTaskType(
    taskType: string,
  ): readonly AgentSpecification[];
}
