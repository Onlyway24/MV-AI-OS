import type { ErrorRecord } from "./error-record.js";
import type { JsonObject } from "./json.js";
import type { RequestContractVersion } from "./request-envelope.js";

export type TaskResponseStatus =
  | "awaiting_approval"
  | "cancelled"
  | "completed"
  | "failed"
  | "needs_input";

export type WorkflowResultStatus =
  | "accepted"
  | "failed"
  | "running"
  | "succeeded"
  | "unknown";

export interface WorkflowResult {
  readonly workflowRequestId: string;
  readonly workflowRunId?: string;
  readonly status: WorkflowResultStatus;
  readonly output?: JsonObject;
  readonly externalRefs?: readonly string[];
  readonly error?: ErrorRecord;
  readonly updatedAt: string;
}

export interface ApprovalReference {
  readonly approvalId: string;
  readonly state:
    | "approved"
    | "cancelled"
    | "expired"
    | "pending"
    | "rejected";
}

export interface TaskResponse {
  readonly contractVersion: RequestContractVersion;
  readonly requestId: string;
  readonly taskId: string;
  readonly correlationId: string;
  readonly status: TaskResponseStatus;
  readonly result?: JsonObject;
  readonly workflow?: WorkflowResult;
  readonly approvals: readonly ApprovalReference[];
  readonly warnings: readonly string[];
  readonly error?: ErrorRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
}
