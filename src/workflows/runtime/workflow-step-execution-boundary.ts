import type { AgentCompanyCapabilityId } from "../../assistants/agent-capability-registry.js";
import type {
  AgentCompanyPermissionRuleId,
} from "../../assistants/agent-permission-matrix.js";
import type { AgentCompanyRoleId } from "../../assistants/agent-company-specification.js";
import type { MainAssistantSafetyDomain } from "../../assistants/main-assistant-specification.js";
import type { ResponsibilityAreaId } from "../../assistants/inter-agent-responsibility-matrix.js";
import type { PolicyDecision } from "../../policy/policy-decision.js";
import type { EffectivePermission } from "../../policy/effective-permissions.js";

export const WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION = "1" as const;

export type WorkflowStepSelection =
  | { readonly mode: "NEXT_READY" }
  | { readonly mode: "EXACT_STEP"; readonly stepId: string };

export type WorkflowApprovalEvidenceStatus =
  | "APPROVED"
  | "EXPIRED"
  | "REJECTED"
  | "WITHDRAWN";

export interface WorkflowApprovalEvidence {
  readonly authorityActorId: string;
  readonly definitionId: string;
  readonly evidenceId: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly scope: "STEP_CANDIDATE_PREPARATION";
  readonly status: WorkflowApprovalEvidenceStatus;
  readonly stepId: string;
  readonly workflowVersion: string;
}

export type WorkflowGuardianEvidenceStatus =
  | "BLOCKED"
  | "CLEAR"
  | "EXPIRED"
  | "WITHDRAWN";

export interface WorkflowGuardianEvidence {
  readonly definitionId: string;
  readonly domain: MainAssistantSafetyDomain;
  readonly evidenceId: string;
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly status: WorkflowGuardianEvidenceStatus;
  readonly stepId: string;
  readonly workflowVersion: string;
}

export interface WorkflowStepAgentAssignment {
  readonly agentId: AgentCompanyRoleId;
  readonly capabilityIds: readonly AgentCompanyCapabilityId[];
  readonly permissionIds: readonly AgentCompanyPermissionRuleId[];
  readonly responsibilityAreaId: ResponsibilityAreaId;
  readonly specificationId: string;
  readonly specificationVersion: string;
}

export interface WorkflowStepExecutionBoundaryRequest {
  readonly actorId: string;
  readonly agentAssignment: WorkflowStepAgentAssignment;
  readonly approvalEvidence: readonly WorkflowApprovalEvidence[];
  readonly contractVersion: typeof WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION;
  readonly expectedDefinitionId: string;
  readonly expectedVersion: number;
  readonly expectedWorkflowVersion: string;
  readonly guardianEvidence: readonly WorkflowGuardianEvidence[];
  readonly instanceId: string;
  readonly maxBlockers: number;
  readonly nonExecuting: true;
  readonly policyDecision: PolicyDecision;
  readonly selection: WorkflowStepSelection;
  readonly workspaceId: string;
}

export type WorkflowStepExecutionBlockerCode =
  | "AGENT_SPECIFICATION_MISMATCH"
  | "AGENT_SPECIFICATION_MISSING"
  | "APPROVAL_INVALID"
  | "APPROVAL_REQUIRED"
  | "CAPABILITY_MISMATCH"
  | "DEPENDENCY_CYCLE"
  | "DEPENDENCY_INCOMPLETE"
  | "GUARDIAN_BLOCKED"
  | "GUARDIAN_EVIDENCE_INVALID"
  | "GUARDIAN_REQUIRED"
  | "NO_ELIGIBLE_STEP"
  | "PERMISSION_DECLARATION_MISMATCH"
  | "POLICY_DENIED"
  | "POLICY_MISMATCH"
  | "RESPONSIBILITY_MISMATCH"
  | "STALE_DEFINITION"
  | "STALE_WORKFLOW_VERSION"
  | "STEP_AWAITING_RESULT"
  | "STEP_NOT_FOUND"
  | "WORKFLOW_DEFINITION_MISSING"
  | "WORKFLOW_INSTANCE_MISSING"
  | "WORKFLOW_NOT_ACTIVE";

export interface WorkflowStepExecutionBlocker {
  readonly code: WorkflowStepExecutionBlockerCode;
  readonly domain?: MainAssistantSafetyDomain;
  readonly relatedStepId?: string;
  readonly stepId?: string;
}

export interface WorkflowStepExecutionCandidate {
  readonly agentId: AgentCompanyRoleId;
  readonly approvalEvidenceIds: readonly string[];
  readonly capabilityIds: readonly AgentCompanyCapabilityId[];
  readonly capabilityTitles: readonly string[];
  readonly contractVersion: typeof WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION;
  readonly definitionId: string;
  readonly guardianDomains: readonly MainAssistantSafetyDomain[];
  readonly guardianEvidenceIds: readonly string[];
  readonly instanceId: string;
  readonly instanceVersion: number;
  readonly nonExecuting: true;
  readonly permissionIds: readonly AgentCompanyPermissionRuleId[];
  readonly requiredPolicyPermissions: readonly EffectivePermission[];
  readonly responsibilityAreaId: ResponsibilityAreaId;
  readonly responsibilityTitle: string;
  readonly specificationId: string;
  readonly specificationVersion: string;
  readonly stepId: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
}

export type WorkflowStepExecutionBoundaryResult =
  | {
      readonly blockers: readonly [];
      readonly candidate: WorkflowStepExecutionCandidate;
      readonly contractVersion: typeof WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION;
      readonly nonExecuting: true;
      readonly status: "CANDIDATE_AVAILABLE";
    }
  | {
      readonly blockers: readonly WorkflowStepExecutionBlocker[];
      readonly contractVersion: typeof WORKFLOW_STEP_EXECUTION_BOUNDARY_CONTRACT_VERSION;
      readonly evaluatedVersion?: number;
      readonly instanceId: string;
      readonly nonExecuting: true;
      readonly status: "BLOCKED";
    };

export interface WorkflowStepExecutionBoundary {
  prepare(
    request: WorkflowStepExecutionBoundaryRequest,
  ): Promise<WorkflowStepExecutionBoundaryResult>;
}

export function freezeWorkflowStepExecutionBoundaryValue<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }
  for (const entry of Object.values(value)) {
    freezeWorkflowStepExecutionBoundaryValue(entry);
  }
  return value;
}
