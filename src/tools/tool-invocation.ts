import type { AgentReference } from "../agents/agent-manifest.js";
import type { JsonObject } from "../contracts/json.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { PolicyDecision } from "../policy/policy-decision.js";
import type { ToolAccessPermission } from "./tool-permission.js";

export interface ToolApprovalMarker {
  readonly approvalId: string;
  readonly permission: ToolAccessPermission;
}

export interface ToolInvocation {
  readonly contractVersion: RequestContractVersion;
  readonly toolInvocationId: string;
  readonly correlationId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentReference;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly input: JsonObject;
  readonly timeoutMs: number;
  readonly idempotencyKey?: string;
  readonly approvals: readonly ToolApprovalMarker[];
  readonly policyDecision: PolicyDecision;
  readonly requestedAt: string;
}
