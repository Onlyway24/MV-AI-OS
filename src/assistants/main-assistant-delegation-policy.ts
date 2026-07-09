import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { GuardianConsultationDecision } from "./guardian-consultation.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_SPECIFICATION,
  type MainAssistantDelegationTargetRole,
  type MainAssistantEscalationType,
  type MainAssistantForbiddenDelegationMode,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { MainAssistantInvocationRiskLevel } from "./main-assistant-runtime.js";

export const MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION = "1" as const;
export const DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY_ID =
  "only-way-assistant-delegation-policy@1.0.0" as const;

export type MainAssistantDelegationCategory =
  | "business"
  | "content_direction"
  | "external_communication"
  | "implementation"
  | "publishing"
  | "research"
  | "sales_outreach"
  | "tool_agent";

export type MainAssistantDelegationRiskLevel =
  | "critical"
  | "high"
  | "low"
  | "medium";

export type MainAssistantDelegationBusinessValue =
  | "help_fabio_make_money"
  | "improve_output_quality"
  | "reduce_babysitting"
  | "reduce_operational_risk"
  | "save_fabio_time";

export type MainAssistantDelegationConstraintKind =
  | "approval_required"
  | "backup_required"
  | "budget_required"
  | "core_brain_mediation_required"
  | "external_communication_requires_approval"
  | "forbidden_category"
  | "guardian_consultation_required"
  | "max_delegation_depth"
  | "no_autonomous_escalation"
  | "no_circular_delegation"
  | "operator_safety_report_required"
  | "policy_evaluation_required"
  | "publisher_requires_approval"
  | "quality_review_required"
  | "sales_outreach_requires_approval"
  | "security_required"
  | "tool_agent_requires_future_approval";

export type MainAssistantDelegationConstraintEnforcement =
  | "block"
  | "require_approval"
  | "require_confirmation";

export type MainAssistantDelegationDecisionKind =
  | "allowed"
  | "blocked"
  | "requires_approval"
  | "requires_operator_confirmation";

export type MainAssistantDelegationReasonCode =
  | "approval_required"
  | "category_forbidden"
  | "category_mismatch"
  | "circular_delegation"
  | "delegation_allowed"
  | "guardian_blocked"
  | "guardian_confirmation_required"
  | "guardian_warning"
  | "max_depth_exceeded"
  | "missing_guardian_consultation"
  | "missing_guardian_domain"
  | "missing_operator_safety_report"
  | "target_not_allowed";

export type MainAssistantDelegationReasonSeverity =
  | "allow"
  | "block"
  | "confirm"
  | "warn";

export interface MainAssistantDelegationConstraint {
  readonly category?: MainAssistantDelegationCategory;
  readonly constraintId: string;
  readonly description: string;
  readonly enforcement: MainAssistantDelegationConstraintEnforcement;
  readonly kind: MainAssistantDelegationConstraintKind;
}

export interface MainAssistantDelegationPolicyTarget {
  readonly agentId: string;
  readonly businessValues: readonly MainAssistantDelegationBusinessValue[];
  readonly category: MainAssistantDelegationCategory;
  readonly description: string;
  readonly operatorFacingPurpose: string;
  readonly requiredApprovalIds: readonly string[];
  readonly requiredGuardianDomains: readonly MainAssistantSafetyDomain[];
  readonly requiredOperations: readonly MainAssistantEscalationType[];
  readonly riskLevel: MainAssistantDelegationRiskLevel;
  readonly role: MainAssistantDelegationTargetRole;
}

export interface MainAssistantDelegationPolicyProfile {
  readonly allowedTargets: readonly MainAssistantDelegationPolicyTarget[];
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly constraints: readonly MainAssistantDelegationConstraint[];
  readonly contractVersion: RequestContractVersion;
  readonly forbiddenCategories: readonly MainAssistantDelegationCategory[];
  readonly forbiddenModes: readonly MainAssistantForbiddenDelegationMode[];
  readonly maxDelegationDepth: number;
  readonly noCircularDelegation: boolean;
  readonly nonExecuting: true;
  readonly policyId: string;
  readonly requiresCoreBrainMediation: boolean;
  readonly requiresGuardianConsultation: boolean;
  readonly requiresOperatorSafetyReport: boolean;
  readonly requiresPolicyEvaluation: boolean;
}

export interface MainAssistantDelegationEvaluationRequest {
  readonly approvalGrantIds: readonly string[];
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly contractVersion: RequestContractVersion;
  readonly currentDelegationDepth: number;
  readonly delegationPath: readonly string[];
  readonly generatedAt: string;
  readonly guardianConsultation?: GuardianConsultationDecision;
  readonly policy: MainAssistantDelegationPolicyProfile;
  readonly requestId: string;
  readonly requestedCategory: MainAssistantDelegationCategory;
  readonly requestedOperations: readonly MainAssistantEscalationType[];
  readonly riskLevel: MainAssistantInvocationRiskLevel;
  readonly targetAgentId: string;
}

export interface MainAssistantDelegationDecisionReason {
  readonly code: MainAssistantDelegationReasonCode;
  readonly message: string;
  readonly severity: MainAssistantDelegationReasonSeverity;
}

export interface MainAssistantDelegationDecision {
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly blockedReasons: readonly string[];
  readonly checkedGuardianDomains: readonly MainAssistantSafetyDomain[];
  readonly contractVersion: RequestContractVersion;
  readonly currentDelegationDepth: number;
  readonly decision: MainAssistantDelegationDecisionKind;
  readonly delegationPath: readonly string[];
  readonly generatedAt: string;
  readonly missingApprovalIds: readonly string[];
  readonly missingGuardianDomains: readonly MainAssistantSafetyDomain[];
  readonly nonExecuting: true;
  readonly reasons: readonly MainAssistantDelegationDecisionReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requestId: string;
  readonly requiredApprovalIds: readonly string[];
  readonly targetAgentId: string;
  readonly targetCategory: MainAssistantDelegationCategory;
}

export interface MainAssistantDelegationPolicyEvaluator {
  evaluate(
    request: MainAssistantDelegationEvaluationRequest,
  ): MainAssistantDelegationDecision;
}

export class MainAssistantDelegationPolicyValidationError extends Error {
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

export const DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY: MainAssistantDelegationPolicyProfile =
  deepFreeze({
    allowedTargets: buildAllowedTargets(),
    assistantId: ONLY_WAY_ASSISTANT_ID,
    constraints: [
      {
        constraintId: "require-core-brain-mediation",
        description:
          "Delegation remains a Core Brain-mediated future handoff, never an agent-to-agent direct call.",
        enforcement: "block",
        kind: "core_brain_mediation_required",
      },
      {
        constraintId: "require-guardian-consultation",
        description:
          "Guardian Consultation must be supplied before any delegation decision can allow escalation.",
        enforcement: "block",
        kind: "guardian_consultation_required",
      },
      {
        constraintId: "require-operator-safety-report",
        description:
          "Operator Safety state must be known before future specialists are involved.",
        enforcement: "block",
        kind: "operator_safety_report_required",
      },
      {
        constraintId: "require-policy-evaluation",
        description:
          "Default-deny policy remains authoritative before any future specialist receives context.",
        enforcement: "block",
        kind: "policy_evaluation_required",
      },
      {
        constraintId: "require-budget-for-business",
        category: "business",
        description:
          "Business delegation must include cost/budget safety because business decisions can expand spend.",
        enforcement: "block",
        kind: "budget_required",
      },
      {
        constraintId: "require-security-for-implementation",
        category: "implementation",
        description:
          "Implementation delegation must include Security Guardian coverage before any future execution layer exists.",
        enforcement: "block",
        kind: "security_required",
      },
      {
        constraintId: "require-backup-for-implementation",
        category: "implementation",
        description:
          "Implementation delegation must include Backup Guardian readiness before runtime or persistence risk expands.",
        enforcement: "block",
        kind: "backup_required",
      },
      {
        constraintId: "require-quality-for-publishing",
        category: "publishing",
        description:
          "Publishing delegation must include Quality Guardian review before any customer-facing delivery.",
        enforcement: "block",
        kind: "quality_review_required",
      },
      {
        constraintId: "publisher-requires-approval",
        category: "publishing",
        description:
          "Publisher delegation is never allowed without explicit Fabio approval.",
        enforcement: "require_approval",
        kind: "publisher_requires_approval",
      },
      {
        constraintId: "sales-outreach-requires-approval",
        category: "sales_outreach",
        description:
          "Sales outreach is forbidden until explicit future approval and external communication boundaries exist.",
        enforcement: "block",
        kind: "sales_outreach_requires_approval",
      },
      {
        constraintId: "tool-agent-requires-future-approval",
        category: "tool_agent",
        description:
          "Tool-agent delegation is forbidden until explicit future approval and audited tool execution exist.",
        enforcement: "block",
        kind: "tool_agent_requires_future_approval",
      },
      {
        constraintId: "external-communication-requires-approval",
        category: "external_communication",
        description:
          "External communication is forbidden until approved delivery boundaries exist.",
        enforcement: "block",
        kind: "external_communication_requires_approval",
      },
      {
        constraintId: "forbid-unsafe-categories",
        description:
          "Unsafe delegation categories remain forbidden before runtime approvals and execution layers exist.",
        enforcement: "block",
        kind: "forbidden_category",
      },
      {
        constraintId: "limit-delegation-depth",
        description:
          "Only Way Assistant can propose at most one future specialist layer.",
        enforcement: "block",
        kind: "max_delegation_depth",
      },
      {
        constraintId: "forbid-circular-delegation",
        description:
          "Delegation paths cannot point back to an already involved agent.",
        enforcement: "block",
        kind: "no_circular_delegation",
      },
      {
        constraintId: "forbid-autonomous-escalation",
        description:
          "Delegation cannot silently increase autonomy or bypass Fabio.",
        enforcement: "block",
        kind: "no_autonomous_escalation",
      },
      {
        constraintId: "approval-required-for-risky-targets",
        description:
          "High-risk and critical future specialists require explicit approval markers.",
        enforcement: "require_approval",
        kind: "approval_required",
      },
    ],
    contractVersion: MAIN_ASSISTANT_DELEGATION_POLICY_CONTRACT_VERSION,
    forbiddenCategories: [
      "external_communication",
      "sales_outreach",
      "tool_agent",
    ],
    forbiddenModes: ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.forbiddenModes,
    maxDelegationDepth:
      ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.maxDelegationDepth,
    noCircularDelegation:
      ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.noCircularDelegation,
    nonExecuting: true,
    policyId: DEFAULT_MAIN_ASSISTANT_DELEGATION_POLICY_ID,
    requiresCoreBrainMediation:
      ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy
        .requiresCoreBrainMediation,
    requiresGuardianConsultation: true,
    requiresOperatorSafetyReport:
      ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy
        .requiresOperatorSafetyCheck,
    requiresPolicyEvaluation:
      ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.requiresPolicyEvaluation,
  });

function buildAllowedTargets(): readonly MainAssistantDelegationPolicyTarget[] {
  return ONLY_WAY_ASSISTANT_SPECIFICATION.delegationPolicy.allowedTargets.map(
    (target): MainAssistantDelegationPolicyTarget => {
      if (target.role === "research") {
        return {
          agentId: target.agentId,
          businessValues: [
            "save_fabio_time",
            "improve_output_quality",
            "reduce_operational_risk",
          ],
          category: "research",
          description: target.description,
          operatorFacingPurpose:
            "Gather and synthesize evidence for Fabio without external side effects.",
          requiredApprovalIds: [],
          requiredGuardianDomains: target.requiredPreflightDomains,
          requiredOperations: [],
          riskLevel: "low",
          role: target.role,
        };
      }
      if (target.role === "business") {
        return {
          agentId: target.agentId,
          businessValues: [
            "help_fabio_make_money",
            "save_fabio_time",
            "reduce_babysitting",
          ],
          category: "business",
          description: target.description,
          operatorFacingPurpose:
            "Turn business objectives into bounded analysis and decision support.",
          requiredApprovalIds: [],
          requiredGuardianDomains: target.requiredPreflightDomains,
          requiredOperations: [],
          riskLevel: "medium",
          role: target.role,
        };
      }
      if (target.role === "content_direction") {
        return {
          agentId: target.agentId,
          businessValues: [
            "improve_output_quality",
            "save_fabio_time",
            "reduce_babysitting",
          ],
          category: "content_direction",
          description: target.description,
          operatorFacingPurpose:
            "Shape content direction while keeping Fabio approval before publishing.",
          requiredApprovalIds: [],
          requiredGuardianDomains: target.requiredPreflightDomains,
          requiredOperations: [],
          riskLevel: "medium",
          role: target.role,
        };
      }
      if (target.role === "implementation") {
        return {
          agentId: target.agentId,
          businessValues: [
            "save_fabio_time",
            "reduce_operational_risk",
            "reduce_babysitting",
          ],
          category: "implementation",
          description: target.description,
          operatorFacingPurpose:
            "Prepare implementation work only after security, backup, and approval gates are satisfied.",
          requiredApprovalIds: ["approve-implementation-delegation"],
          requiredGuardianDomains: target.requiredPreflightDomains,
          requiredOperations: ["workflow_execution"],
          riskLevel: "high",
          role: target.role,
        };
      }
      return {
        agentId: target.agentId,
        businessValues: [
          "help_fabio_make_money",
          "improve_output_quality",
          "reduce_operational_risk",
        ],
        category: "publishing",
        description: target.description,
        operatorFacingPurpose:
          "Prepare publishing or delivery handoff only after Fabio approval and quality/security gates.",
        requiredApprovalIds: ["approve-external-side-effects"],
        requiredGuardianDomains: target.requiredPreflightDomains,
        requiredOperations: ["publish_or_send"],
        riskLevel: "critical",
        role: target.role,
      };
    },
  );
}

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
