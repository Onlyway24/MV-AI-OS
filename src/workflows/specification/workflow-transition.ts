import type { WorkflowCondition } from "./workflow-condition.js";

export interface WorkflowTransition {
  readonly transitionId: string;
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly priority: number;
  readonly condition?: WorkflowCondition;
}
