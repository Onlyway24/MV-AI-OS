import type { WorkflowFailurePolicy } from "./workflow-failure-policy.js";
import type { WorkflowInput } from "./workflow-input.js";
import type { WorkflowOutput } from "./workflow-output.js";
import type { WorkflowStep } from "./workflow-step.js";
import type { WorkflowTransition } from "./workflow-transition.js";

export const WORKFLOW_SPECIFICATION_SCHEMA_VERSION = "1" as const;

export type WorkflowSpecificationStatus =
  | "active"
  | "disabled"
  | "experimental";

export interface WorkflowSpecification {
  readonly schemaVersion: typeof WORKFLOW_SPECIFICATION_SCHEMA_VERSION;
  readonly workflowId: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly status: WorkflowSpecificationStatus;
  readonly input: WorkflowInput;
  readonly output: WorkflowOutput;
  readonly entryStepId: string;
  readonly steps: readonly WorkflowStep[];
  readonly transitions: readonly WorkflowTransition[];
  readonly failurePolicy: WorkflowFailurePolicy;
  readonly allowCycles: boolean;
}
