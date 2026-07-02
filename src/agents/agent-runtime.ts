import type {
  AgentInvocation,
  AgentResult,
} from "../contracts/agent-execution.js";
import type { AgentReference } from "./agent-manifest.js";

export interface AgentExecutor {
  readonly agent: AgentReference;
  execute(invocation: AgentInvocation): Promise<unknown>;
}

export interface AgentRuntime {
  execute(invocation: AgentInvocation): Promise<AgentResult>;
}
