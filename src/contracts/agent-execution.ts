import type {
  AgentReference,
  ContractReference,
} from "../agents/agent-manifest.js";
import type { ErrorRecord } from "./error-record.js";
import type { JsonObject } from "./json.js";
import type { RequestContractVersion } from "./request-envelope.js";

export type AgentResultStatus =
  | "failed"
  | "needs_approval"
  | "needs_input"
  | "succeeded";

export type EvidenceSource = "conversation" | "knowledge" | "memory";

export interface EvidenceReference {
  readonly referenceId: string;
  readonly source: EvidenceSource;
}

export interface AgentInvocationLimits {
  readonly timeoutMs: number;
  readonly modelProfile: string;
  readonly maxToolCalls: number;
  readonly maxResultBytes: number;
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
}

export interface AgentInvocation {
  readonly contractVersion: RequestContractVersion;
  readonly invocationId: string;
  readonly taskId: string;
  readonly correlationId: string;
  readonly agent: AgentReference;
  readonly objective: string;
  readonly input: JsonObject;
  readonly context: JsonObject;
  readonly permissions: readonly string[];
  readonly outputContract: ContractReference;
  readonly limits: AgentInvocationLimits;
  readonly attempt: number;
}

export interface AgentResult {
  readonly contractVersion: RequestContractVersion;
  readonly invocationId: string;
  readonly taskId: string;
  readonly agent: AgentReference;
  readonly status: AgentResultStatus;
  readonly output?: JsonObject;
  readonly evidence: readonly EvidenceReference[];
  readonly memoryProposals: readonly JsonObject[];
  readonly workflowProposal?: JsonObject;
  readonly usage?: JsonObject;
  readonly error?: ErrorRecord;
  readonly completedAt: string;
}
