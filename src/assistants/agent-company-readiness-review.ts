import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import {
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  type AgentCompanyCapabilityId,
  type AgentCompanyCapabilityRegistry,
} from "./agent-capability-registry.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyMap,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import {
  DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
  type AgentHandoffContractSet,
  type AgentHandoffId,
} from "./agent-handoff-contracts.js";
import {
  DEFAULT_AGENT_PERMISSION_MATRIX,
  type AgentCompanyPermissionMatrix,
  type AgentCompanyPermissionRuleId,
} from "./agent-permission-matrix.js";
import { INITIAL_CORE_AGENT_SPECIFICATIONS } from "./core-agent-specifications.js";
import { EXTENDED_BUSINESS_AGENT_SPECIFICATIONS } from "./extended-business-agent-specifications.js";
import {
  DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
  type ResponsibilityAreaId,
  type ResponsibilityMatrix,
} from "./inter-agent-responsibility-matrix.js";

export const AGENT_COMPANY_READINESS_CONTRACT_VERSION = "1" as const;
export const DEFAULT_AGENT_COMPANY_READINESS_REVIEW_ID =
  "agent-company-readiness@1.0.0" as const;

export type AgentCompanyReadinessStatus =
  | "NOT_READY"
  | "READY"
  | "READY_WITH_NON_BLOCKING_WARNINGS";

export type AgentCompanyReadinessSeverity =
  | "critical"
  | "info"
  | "warning";

export type AgentCompanyReadinessCategory =
  | "approval_control"
  | "artifact_validation"
  | "capability_coverage"
  | "capability_ownership"
  | "control_plane_coverage"
  | "execution_safety"
  | "guardian_control"
  | "handoff_alignment"
  | "handoff_coverage"
  | "identifier_consistency"
  | "permission_boundary"
  | "permission_coverage"
  | "redaction_safety"
  | "responsibility_coverage"
  | "responsibility_ownership"
  | "role_coverage"
  | "specification_coverage";

export interface AgentCompanyReadinessReviewInput {
  readonly agentCompanyMap: AgentCompanyMap;
  readonly agentSpecifications: readonly AgentSpecification[];
  readonly capabilityRegistry: AgentCompanyCapabilityRegistry;
  readonly contractVersion: RequestContractVersion;
  readonly handoffContracts: AgentHandoffContractSet;
  readonly nonExecuting: true;
  readonly permissionMatrix: AgentCompanyPermissionMatrix;
  readonly responsibilityMatrix: ResponsibilityMatrix;
  readonly reviewId: string;
}

export interface AgentCompanyReadinessFinding {
  readonly affectedCapabilityId?: AgentCompanyCapabilityId;
  readonly affectedHandoffId?: AgentHandoffId;
  readonly affectedPermissionId?: AgentCompanyPermissionRuleId;
  readonly affectedResponsibilityAreaId?: ResponsibilityAreaId;
  readonly affectedRoleId?: AgentCompanyRoleId;
  readonly category: AgentCompanyReadinessCategory;
  readonly evidenceRefs: readonly string[];
  readonly findingId: string;
  readonly recommendation: string;
  readonly severity: AgentCompanyReadinessSeverity;
  readonly summary: string;
  readonly title: string;
}

export interface AgentCompanyReadinessSummary {
  readonly criticalFindings: number;
  readonly evaluatedArtifacts: number;
  readonly informationalFindings: number;
  readonly readinessScore: number;
  readonly status: AgentCompanyReadinessStatus;
  readonly totalFindings: number;
  readonly warningFindings: number;
}

export interface AgentCompanyReadinessReport {
  readonly contractVersion: RequestContractVersion;
  readonly evaluatedArtifactIds: readonly string[];
  readonly findings: readonly AgentCompanyReadinessFinding[];
  readonly nonExecuting: true;
  readonly reportId: string;
  readonly summary: AgentCompanyReadinessSummary;
}

export interface AgentCompanyReadinessEvaluator {
  evaluate(
    input: AgentCompanyReadinessReviewInput,
  ): AgentCompanyReadinessReport;
}

export class AgentCompanyReadinessValidationError extends Error {
  public readonly issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }[];

  public constructor(
    message: string,
    issues: readonly {
      readonly code: string;
      readonly message: string;
      readonly path: string;
    }[],
  ) {
    super(message);
    this.issues = issues;
  }
}

export const DEFAULT_AGENT_COMPANY_READINESS_INPUT: AgentCompanyReadinessReviewInput =
  deepFreeze({
    agentCompanyMap: DEFAULT_AGENT_COMPANY_MAP,
    agentSpecifications: [
      ...INITIAL_CORE_AGENT_SPECIFICATIONS,
      ...EXTENDED_BUSINESS_AGENT_SPECIFICATIONS,
    ],
    capabilityRegistry: DEFAULT_AGENT_CAPABILITY_REGISTRY,
    contractVersion: AGENT_COMPANY_READINESS_CONTRACT_VERSION,
    handoffContracts: DEFAULT_AGENT_HANDOFF_CONTRACT_SET,
    nonExecuting: true,
    permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX,
    responsibilityMatrix: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX,
    reviewId: DEFAULT_AGENT_COMPANY_READINESS_REVIEW_ID,
  });

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
