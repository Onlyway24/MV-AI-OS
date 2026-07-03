import type { JsonObject } from "../../contracts/json.js";

export interface WorkflowInput {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly schema: JsonObject;
  readonly strict: boolean;
}
