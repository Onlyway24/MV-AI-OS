import type { JsonPrimitive } from "../../contracts/json.js";

export type WorkflowConditionSource =
  | "step_output"
  | "workflow_input";

export type WorkflowConditionOperator =
  | "equals"
  | "exists"
  | "not_equals"
  | "not_exists";

export interface WorkflowCondition {
  readonly conditionId: string;
  readonly source: WorkflowConditionSource;
  readonly sourceStepId?: string;
  readonly field: string;
  readonly operator: WorkflowConditionOperator;
  readonly expectedValue?: JsonPrimitive;
}
