import type { MainAssistantSpecification } from "./main-assistant-specification.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantEscalationType,
} from "./main-assistant-specification.js";
import type {
  GuardianConsultationApprovalRequirement,
  GuardianConsultationDecision,
} from "./guardian-consultation.js";
import type {
  MainAssistantInvocationIntent,
  MainAssistantInvocationRiskLevel,
} from "./main-assistant-runtime.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";

export const OPERATOR_DECISION_ENGINE_CONTRACT_VERSION = "1" as const;

export type OperatorDecisionKind =
  | "approval_required"
  | "blocked"
  | "clarification_required"
  | "confirmation_required"
  | "mission_plan_candidate"
  | "proceed"
  | "refused";

export type OperatorDecisionReasonCode =
  | "approval_required"
  | "cost_budget_blocked"
  | "cost_budget_warning"
  | "delegation_not_allowed"
  | "guardian_blocked"
  | "guardian_confirmation_required"
  | "guardian_warning"
  | "mission_plan_candidate_ready"
  | "ready_to_proceed"
  | "under_specified_request";

export type OperatorDecisionReasonSeverity =
  | "allow"
  | "block"
  | "confirm"
  | "info"
  | "warn";

export type OperatorDecisionCertainty = "high" | "low" | "medium";

export type OperatorDecisionCostStatus =
  | "near_limit"
  | "over_budget"
  | "unknown"
  | "within_budget";

export interface OperatorDecisionCostPosture {
  readonly status: OperatorDecisionCostStatus;
  readonly summary: string;
}

export interface OperatorDecisionDelegationSignal {
  readonly candidateAgentIds: readonly string[];
  readonly delegationAllowed: boolean;
  readonly rationale: string;
}

export interface OperatorMissionPlanCandidateStep {
  readonly description: string;
  readonly requiresApproval: boolean;
  readonly stepId: string;
  readonly title: string;
}

export interface OperatorMissionPlanCandidate {
  readonly candidateId: string;
  readonly nonExecuting: true;
  readonly objective: string;
  readonly requestedOutcome: string;
  readonly steps: readonly OperatorMissionPlanCandidateStep[];
}

export interface OperatorDecisionContext {
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly assistantSpecification: MainAssistantSpecification;
  readonly contractVersion: RequestContractVersion;
  readonly costPosture?: OperatorDecisionCostPosture;
  readonly decisionId: string;
  readonly delegationSignal?: OperatorDecisionDelegationSignal;
  readonly generatedAt: string;
  readonly guardianConsultation: GuardianConsultationDecision;
  readonly intent: MainAssistantInvocationIntent;
  readonly objective: string;
  readonly requestedOperations: readonly MainAssistantEscalationType[];
  readonly requestedOutcome: string;
  readonly riskLevel: MainAssistantInvocationRiskLevel;
}

export interface OperatorDecisionReason {
  readonly code: OperatorDecisionReasonCode;
  readonly message: string;
  readonly severity: OperatorDecisionReasonSeverity;
}

export interface OperatorDecision {
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly blockedReasons: readonly string[];
  readonly certainty: OperatorDecisionCertainty;
  readonly clarificationQuestions: readonly string[];
  readonly contractVersion: RequestContractVersion;
  readonly costPosture?: OperatorDecisionCostPosture;
  readonly decision: OperatorDecisionKind;
  readonly decisionId: string;
  readonly explanation: string;
  readonly generatedAt: string;
  readonly guardianDecision: GuardianConsultationDecision["decision"];
  readonly missionPlanCandidate?: OperatorMissionPlanCandidate;
  readonly reasons: readonly OperatorDecisionReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
  readonly requestedOperations: readonly MainAssistantEscalationType[];
  readonly riskLevel: MainAssistantInvocationRiskLevel;
}

export interface OperatorDecisionEngine {
  decide(context: OperatorDecisionContext): OperatorDecision;
}

export class OperatorDecisionValidationError extends Error {
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
