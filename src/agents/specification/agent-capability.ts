import type { EffectivePermission } from "../../policy/effective-permissions.js";

export type AgentCapabilityType =
  | "knowledge.search"
  | "memory.read"
  | "memory.write.proposal"
  | "model.invoke"
  | "tool.execute"
  | "tool.read"
  | "workflow.propose";

export interface AgentCapability {
  readonly capabilityId: string;
  readonly capabilityType: AgentCapabilityType;
  readonly permission: EffectivePermission;
  readonly required: boolean;
  readonly description: string;
  readonly scopes?: readonly string[];
}
