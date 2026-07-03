import type { WorkflowSpecification } from "./workflow-specification.js";

export interface WorkflowSpecificationRegistry {
  get(
    workflowId: string,
    version: string,
  ): WorkflowSpecification | undefined;
  list(): readonly WorkflowSpecification[];
  listVersions(workflowId: string): readonly WorkflowSpecification[];
  listActive(): readonly WorkflowSpecification[];
}
