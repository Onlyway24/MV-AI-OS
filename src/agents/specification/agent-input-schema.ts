import type { JsonObject } from "../../contracts/json.js";

export interface AgentInputSchema {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly schema: JsonObject;
  readonly strict: boolean;
}
