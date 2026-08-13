import type { JsonObject } from "../../contracts/json.js";
import type { WorkflowAgentSpecificationAttribution } from "./workflow-runtime.js";

export const WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION = "1" as const;

export interface WorkflowSpecificationAdmissionRequest {
  readonly contractVersion: typeof WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION;
  readonly admissionId: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly instanceId: string;
  readonly input: JsonObject;
  readonly nonExecuting: true;
}

export type WorkflowSpecificationAdmissionOutcome = "ADMITTED" | "REPLAYED";

export interface WorkflowSpecificationAdmissionResult {
  readonly contractVersion: typeof WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION;
  readonly admissionId: string;
  readonly auditEventId: string;
  readonly definitionId: string;
  readonly instanceId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly specificationFingerprint: string;
  readonly agentSpecifications: readonly WorkflowAgentSpecificationAttribution[];
  readonly outcome: WorkflowSpecificationAdmissionOutcome;
  readonly nonExecuting: true;
  readonly externalEffectsAllowed: false;
}

export interface WorkflowSpecificationAdmissionService {
  admit(
    request: WorkflowSpecificationAdmissionRequest,
  ): Promise<WorkflowSpecificationAdmissionResult>;
}

export function freezeWorkflowSpecificationAdmissionValue<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    freezeWorkflowSpecificationAdmissionValue(entry);
  }
  return value;
}
