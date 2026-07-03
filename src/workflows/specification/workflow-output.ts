import type { JsonObject } from "../../contracts/json.js";

export interface WorkflowOutput {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly schema: JsonObject;
  readonly strict: boolean;
  readonly sourceStepIds: readonly string[];
}
