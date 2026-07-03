import type { JsonObject } from "../../contracts/json.js";

export interface AgentOutputSchema {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly schema: JsonObject;
  readonly strict: boolean;
}
