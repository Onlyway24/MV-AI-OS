import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type {
  OperatorSafetyAutonomyDecision,
  OperatorSafetyReport,
  OperatorSafetyStatus,
} from "../guardians/operator-safety-report.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_SPECIFICATION,
  type MainAssistantEscalationType,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { MainAssistantInvocationRiskLevel } from "./main-assistant-runtime.js";

export const GUARDIAN_CONSULTATION_CONTRACT_VERSION = "1" as const;
export const DEFAULT_GUARDIAN_CONSULTATION_POLICY_ID =
  "only-way-assistant-guardian-consultation@1.0.0" as const;

export type GuardianConsultationDecisionKind =
  | "blocked"
  | "continue_with_warning"
  | "may_continue"
  | "requires_approval"
  | "requires_operator_confirmation";

export type GuardianConsultationReasonCode =
  | "approval_required"
  | "attention_required"
  | "critical_operator_safety"
  | "healthy_operator_safety"
  | "missing_operator_safety_report"
  | "missing_required_safety_domain"
  | "operator_safety_unknown"
  | "unsafe_autonomy_decision";

export type GuardianConsultationReasonSeverity =
  | "allow"
  | "block"
  | "confirm"
  | "warn";

export interface GuardianConsultationApprovalRequirement {
  readonly approvalId: string;
  readonly operation: MainAssistantEscalationType;
  readonly rationale: string;
}

export interface GuardianConsultationSafetyRequirement {
  readonly operation: MainAssistantEscalationType;
  readonly requiredDomains: readonly MainAssistantSafetyDomain[];
}

export interface GuardianConsultationPolicy {
  readonly attentionRequiresAcknowledgementForRiskyOperations: boolean;
  readonly blockCriticalEscalation: boolean;
  readonly blockRiskyWhenSafetyMissing: boolean;
  readonly blockRiskyWhenSafetyUnknown: boolean;
  readonly contractVersion: RequestContractVersion;
  readonly policyId: string;
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
  readonly safetyRequirements: readonly GuardianConsultationSafetyRequirement[];
}

export interface GuardianConsultationRequest {
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly consultationId: string;
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly operatorSafetyReport?: OperatorSafetyReport;
  readonly requestedOperations: readonly MainAssistantEscalationType[];
  readonly riskLevel: MainAssistantInvocationRiskLevel;
}

export interface GuardianConsultationReason {
  readonly code: GuardianConsultationReasonCode;
  readonly message: string;
  readonly severity: GuardianConsultationReasonSeverity;
}

export interface GuardianConsultationDecision {
  readonly acknowledgementRequired: boolean;
  readonly approvalRequired: boolean;
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly blockers: readonly string[];
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly consultationId: string;
  readonly contractVersion: RequestContractVersion;
  readonly decision: GuardianConsultationDecisionKind;
  readonly generatedAt: string;
  readonly missingRequiredSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly operatorSafetyStatus: OperatorSafetyStatus | "missing";
  readonly reasons: readonly GuardianConsultationReason[];
  readonly recommendedNextActions: readonly string[];
  readonly requiredApprovals: readonly GuardianConsultationApprovalRequirement[];
  readonly safetyToAutonomy: OperatorSafetyAutonomyDecision | "missing";
  readonly warnings: readonly string[];
}

export interface GuardianConsultationEvaluator {
  evaluate(request: GuardianConsultationRequest): GuardianConsultationDecision;
}

export class GuardianConsultationValidationError extends Error {
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

const ESCALATION_ORDER: readonly MainAssistantEscalationType[] = [
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
];

const SAFETY_DOMAIN_ORDER: readonly MainAssistantSafetyDomain[] = [
  "operator_safety",
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

export const DEFAULT_GUARDIAN_CONSULTATION_POLICY: GuardianConsultationPolicy =
  deepFreeze({
    attentionRequiresAcknowledgementForRiskyOperations: true,
    blockCriticalEscalation: true,
    blockRiskyWhenSafetyMissing: true,
    blockRiskyWhenSafetyUnknown: true,
    contractVersion: GUARDIAN_CONSULTATION_CONTRACT_VERSION,
    policyId: DEFAULT_GUARDIAN_CONSULTATION_POLICY_ID,
    requiredApprovals: buildRequiredApprovals(),
    safetyRequirements: buildSafetyRequirements(),
  });

function buildRequiredApprovals(): readonly GuardianConsultationApprovalRequirement[] {
  const requirements: GuardianConsultationApprovalRequirement[] = [];
  for (const approval of ONLY_WAY_ASSISTANT_SPECIFICATION.humanApprovalRequirements) {
    for (const operation of approval.requiredFor) {
      requirements.push({
        approvalId: approval.approvalId,
        operation,
        rationale: approval.rationale,
      });
    }
  }
  return requirements.sort(compareApprovalRequirements);
}

function buildSafetyRequirements(): readonly GuardianConsultationSafetyRequirement[] {
  const domainsByOperation = new Map<
    MainAssistantEscalationType,
    Set<MainAssistantSafetyDomain>
  >();
  for (const requirement of ONLY_WAY_ASSISTANT_SPECIFICATION.safetyPreflightRequirements) {
    for (const operation of requirement.requiredBefore) {
      const existing = domainsByOperation.get(operation);
      const domains = existing ?? new Set<MainAssistantSafetyDomain>();
      domains.add(requirement.domain);
      domainsByOperation.set(operation, domains);
    }
  }

  return [...domainsByOperation.entries()]
    .map(([operation, domains]) => ({
      operation,
      requiredDomains: sortSafetyDomains([...domains]),
    }))
    .sort(
      (left, right) =>
        escalationRank(left.operation) - escalationRank(right.operation),
    );
}

function compareApprovalRequirements(
  left: GuardianConsultationApprovalRequirement,
  right: GuardianConsultationApprovalRequirement,
): number {
  return (
    escalationRank(left.operation) - escalationRank(right.operation) ||
    left.approvalId.localeCompare(right.approvalId)
  );
}

export function sortEscalationTypes(
  operations: readonly MainAssistantEscalationType[],
): readonly MainAssistantEscalationType[] {
  return Object.freeze(
    [...operations].sort(
      (left, right) => escalationRank(left) - escalationRank(right),
    ),
  );
}

export function sortSafetyDomains(
  domains: readonly MainAssistantSafetyDomain[],
): readonly MainAssistantSafetyDomain[] {
  return Object.freeze(
    [...new Set(domains)].sort(
      (left, right) => safetyDomainRank(left) - safetyDomainRank(right),
    ),
  );
}

function escalationRank(operation: MainAssistantEscalationType): number {
  return ESCALATION_ORDER.indexOf(operation);
}

function safetyDomainRank(domain: MainAssistantSafetyDomain): number {
  return SAFETY_DOMAIN_ORDER.indexOf(domain);
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
