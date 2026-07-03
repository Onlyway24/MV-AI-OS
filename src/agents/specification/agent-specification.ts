import type {
  AgentRiskLevel,
  AgentStatus,
} from "../agent-manifest.js";
import type { AgentCapability } from "./agent-capability.js";
import type { AgentInputSchema } from "./agent-input-schema.js";
import type { AgentLimit } from "./agent-limit.js";
import type { AgentOutputSchema } from "./agent-output-schema.js";
import type { AgentPolicyRequirement } from "./agent-policy-requirement.js";

export const AGENT_SPECIFICATION_SCHEMA_VERSION = "1" as const;

export interface AgentSpecification {
  readonly schemaVersion: typeof AGENT_SPECIFICATION_SCHEMA_VERSION;
  readonly agentId: string;
  readonly version: string;
  readonly implementationRef: string;
  readonly name: string;
  readonly mission: string;
  readonly status: AgentStatus;
  readonly riskLevel: AgentRiskLevel;
  readonly taskTypes: readonly string[];
  readonly instructionsRef: string;
  readonly inputSchema: AgentInputSchema;
  readonly outputSchema: AgentOutputSchema;
  readonly capabilities: readonly AgentCapability[];
  readonly limits: AgentLimit;
  readonly policyRequirements: readonly AgentPolicyRequirement[];
  readonly handoffTargets: readonly string[];
}
