import type { AgentReference } from "../../agents/agent-manifest.js";
import type { RequestContractVersion } from "../../contracts/request-envelope.js";

export interface RoutingDecision {
  readonly contractVersion: RequestContractVersion;
  readonly decisionId: string;
  readonly taskId: string;
  readonly selectedAgent: AgentReference;
  readonly alternativesConsidered: readonly AgentReference[];
  readonly reasonCode: string;
  readonly confidence: number;
  readonly decidedAt: string;
}
