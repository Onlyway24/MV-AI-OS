export type WorkflowFailureStrategy =
  | "fail_workflow"
  | "return_partial";

export interface WorkflowFailurePolicy {
  readonly strategy: WorkflowFailureStrategy;
  readonly preserveSuccessfulOutputs: boolean;
}
