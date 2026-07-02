export type AgentStatus = "active" | "disabled" | "experimental";

export type AgentRiskLevel = "high" | "low" | "medium";

export type MemoryCategory =
  | "conversation"
  | "operational"
  | "semantic"
  | "user"
  | "working";

export interface AgentReference {
  readonly agentId: string;
  readonly version: string;
}

export interface ContractReference {
  readonly contractId: string;
  readonly contractVersion: string;
}

export interface AgentMemoryAccess {
  readonly read: readonly MemoryCategory[];
  readonly proposeWrites: boolean;
}

export interface AgentLimits {
  readonly timeoutMs: number;
  readonly maxToolCalls: number;
  readonly maxResultBytes: number;
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
}

export interface AgentManifest {
  readonly agentId: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly status: AgentStatus;
  readonly taskTypes: readonly string[];
  readonly inputContract: ContractReference;
  readonly outputContract: ContractReference;
  readonly modelProfile: string;
  readonly memoryAccess: AgentMemoryAccess;
  readonly knowledgeAccess: readonly string[];
  readonly tools: readonly string[];
  readonly workflowProposals: readonly string[];
  readonly limits: AgentLimits;
  readonly instructionsRef: string;
  readonly handoffTargets: readonly string[];
  readonly riskLevel: AgentRiskLevel;
}
