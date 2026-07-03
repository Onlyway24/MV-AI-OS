import type { AgentReference } from "../../agents/agent-manifest.js";
import type { JsonObject } from "../../contracts/json.js";

export interface WorkflowStep {
  readonly stepId: string;
  readonly name: string;
  readonly agent: AgentReference;
  readonly objective: string;
  readonly inputMapping: JsonObject;
  readonly terminal: boolean;
}
