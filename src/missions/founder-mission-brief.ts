import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { MainAssistantEscalationType } from "../assistants/main-assistant-specification.js";
import type { AgentCompanyBusinessValue } from "../assistants/agent-company-specification.js";

export const FOUNDER_MISSION_BRIEF_CONTRACT_VERSION = "1" as const;
export const DEFAULT_FOUNDER_MISSION_BRIEF_ID =
  "founder-mission-brief@1.0.0" as const;

export const FOUNDER_MISSION_TYPES = [
  "business_opportunity",
  "customer_delivery_preparation",
  "internal_operations",
  "market_research",
  "monetization_experiment",
  "product_or_offer_design",
  "quality_improvement",
  "risk_review",
  "software_development",
  "content_strategy",
] as const;

export type FounderMissionType = (typeof FOUNDER_MISSION_TYPES)[number];
export type MissionPriority = "critical" | "high" | "normal" | "low";
export type MissionRiskTolerance = "low" | "moderate" | "high";
export type MissionQualityLevel = "premium" | "professional" | "standard";
export type MissionOriginalityLevel = "high" | "moderate" | "practical";
export type MissionUnknownClassification =
  | "DECISION_BLOCKING"
  | "LOW_IMPACT"
  | "MATERIAL_BUT_ASSUMABLE";
export type MissionDeadlineStatus = "known" | "unknown";
export type MissionBudgetStatus = "known" | "unknown";
export type MissionEvidenceLevel = "high" | "moderate" | "minimal";
export type MissionConstraintKind =
  | "limit"
  | "non_negotiable"
  | "preference";
export type MissionForbiddenActionCategory =
  | "autonomous_action"
  | "external_communication"
  | "filesystem_mutation"
  | "legal_or_compliance_approval"
  | "model_or_provider_call"
  | "network_access"
  | "payment_or_spending"
  | "publishing"
  | "tool_execution"
  | "workflow_execution";
export type MissionExternalActionType =
  | "customer_delivery"
  | "outreach"
  | "payment"
  | "publication";

export interface FounderPreferenceProfile {
  readonly forbiddenCommunicationTraits: readonly string[];
  readonly operatingPreferences: readonly string[];
  readonly profileId: string;
  readonly version: string;
}

export interface MissionBrandProfile {
  readonly applicationScopes: readonly string[];
  readonly brandId: string;
  readonly communicationTraits: readonly string[];
  readonly displayName: string;
  readonly version: string;
  readonly visualDirection?: readonly string[];
}

export interface MissionObjective {
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly desiredOutcome: string;
  readonly purpose: string;
  readonly statement: string;
}

export interface MissionAudience {
  readonly description: string;
  readonly market?: string;
  readonly segments: readonly string[];
}

export interface MissionDeliverable {
  readonly acceptanceCriteria: readonly string[];
  readonly deliverableId: string;
  readonly description: string;
  readonly format: string;
  readonly title: string;
}

export interface MissionConstraint {
  readonly constraintId: string;
  readonly description: string;
  readonly kind: MissionConstraintKind;
}

export interface MissionDeadline {
  readonly dueAt?: string;
  readonly status: MissionDeadlineStatus;
  readonly timezone: string;
}

export interface MissionBudget {
  readonly currency?: "EUR" | "USD";
  readonly maximumAmount?: number;
  readonly status: MissionBudgetStatus;
}

export interface MissionQualityStandard {
  readonly criteria: readonly string[];
  readonly level: MissionQualityLevel;
  readonly minimumAcceptableOutcome: string;
}

export interface MissionOriginalityStandard {
  readonly differentiationCriteria: readonly string[];
  readonly level: MissionOriginalityLevel;
  readonly obviousBaseline?: string;
}

export interface MissionStyleProfile {
  readonly applicableDeliverableIds: readonly string[];
  readonly communicationTraits: readonly string[];
  readonly visualDirection?: readonly string[];
}

export interface MissionApprovalPolicy {
  readonly approvalRequiredFor: readonly MainAssistantEscalationType[];
  readonly fabioIsFinalAuthority: true;
}

export interface MissionForbiddenAction {
  readonly actionId: string;
  readonly category: MissionForbiddenActionCategory;
  readonly description: string;
}

export interface MissionExternalActionRequest {
  readonly actionId: string;
  readonly actionType: MissionExternalActionType;
  readonly approvalRequired: true;
  readonly purpose: string;
  readonly status: "proposal_only";
}

export interface MissionSuccessMetric {
  readonly evidenceRequired: string;
  readonly measurement: string;
  readonly metricId: string;
  readonly target: string;
}

export interface MissionEvidenceExpectation {
  readonly level: MissionEvidenceLevel;
  readonly sourceRequirements: readonly string[];
  readonly unsupportedClaimsForbidden: true;
}

export interface MissionKnownFact {
  readonly factId: string;
  readonly sourceRef?: string;
  readonly statement: string;
}

export interface MissionAssumption {
  readonly assumptionId: string;
  readonly rationale: string;
  readonly sourceUnknownId?: string;
  readonly statement: string;
}

export interface MissionUnknown {
  readonly classification: MissionUnknownClassification;
  readonly conservativeAssumption?: string;
  readonly impact: string;
  readonly topic: string;
  readonly unknownId: string;
}

export interface MissionClarificationQuestion {
  readonly question: string;
  readonly questionId: string;
  readonly sourceUnknownId: string;
  readonly whyDecisionBlocking: string;
}

export interface FounderMissionBrief {
  readonly approvalPolicy: MissionApprovalPolicy;
  readonly assumptions: readonly MissionAssumption[];
  readonly audience: MissionAudience;
  readonly brandProfile: MissionBrandProfile;
  readonly briefId: string;
  readonly budget: MissionBudget;
  readonly clarificationQuestions: readonly MissionClarificationQuestion[];
  readonly constraints: readonly MissionConstraint[];
  readonly contractVersion: RequestContractVersion;
  readonly deadline: MissionDeadline;
  readonly deliverables: readonly MissionDeliverable[];
  readonly evidenceExpectation: MissionEvidenceExpectation;
  readonly externalActionRequests: readonly MissionExternalActionRequest[];
  readonly forbiddenActions: readonly MissionForbiddenAction[];
  readonly founderPreferences: FounderPreferenceProfile;
  readonly knownFacts: readonly MissionKnownFact[];
  readonly missionType: FounderMissionType;
  readonly nonExecuting: true;
  readonly objective: MissionObjective;
  readonly originalityStandard: MissionOriginalityStandard;
  readonly priority: MissionPriority;
  readonly qualityStandard: MissionQualityStandard;
  readonly riskTolerance: MissionRiskTolerance;
  readonly styleProfile: MissionStyleProfile;
  readonly successMetrics: readonly MissionSuccessMetric[];
  readonly unknowns: readonly MissionUnknown[];
}

export const ONLY_WAY_FOUNDER_PREFERENCE_PROFILE: FounderPreferenceProfile =
  deepFreeze({
    forbiddenCommunicationTraits: [
      "generic corporate language",
      "unsupported promises",
      "unnecessary filler",
    ],
    operatingPreferences: [
      "commercially useful",
      "controlled risk",
      "direct",
      "high originality",
      "low unnecessary manual work",
      "practical",
      "premium",
    ],
    profileId: "only-way-founder-preferences@1.0.0",
    version: "1.0.0",
  });

export const MV_AI_OS_BRAND_PROFILE: MissionBrandProfile = deepFreeze({
  applicationScopes: ["technical communication", "product design"],
  brandId: "mv-ai-os@1.0.0",
  communicationTraits: ["controlled", "precise", "premium", "safety-first"],
  displayName: "MV AI OS",
  version: "1.0.0",
  visualDirection: ["dark control-room identity", "strong information hierarchy"],
});

export const METODO_VELOCE_BRAND_PROFILE: MissionBrandProfile = deepFreeze({
  applicationScopes: ["content", "offers", "visual communication"],
  brandId: "metodo-veloce@1.0.0",
  communicationTraits: [
    "aggressive but honest",
    "dark luxury",
    "direct",
    "practical",
    "sharp",
  ],
  displayName: "Metodo Veloce",
  version: "1.0.0",
  visualDirection: ["black yellow and white", "premium not cheap"],
});

export const DEFAULT_FOUNDER_MISSION_BRIEF: FounderMissionBrief = deepFreeze({
  approvalPolicy: {
    approvalRequiredFor: [],
    fabioIsFinalAuthority: true,
  },
  assumptions: [],
  audience: {
    description: "Fabio as founder and operator",
    segments: ["founder operator"],
  },
  brandProfile: MV_AI_OS_BRAND_PROFILE,
  briefId: DEFAULT_FOUNDER_MISSION_BRIEF_ID,
  budget: {
    status: "unknown",
  },
  clarificationQuestions: [],
  constraints: [
    {
      constraintId: "non-executing-output",
      description: "The mission may prepare decisions but must not execute actions.",
      kind: "non_negotiable",
    },
  ],
  contractVersion: FOUNDER_MISSION_BRIEF_CONTRACT_VERSION,
  deadline: {
    status: "unknown",
    timezone: "Europe/Rome",
  },
  deliverables: [
    {
      acceptanceCriteria: [
        "The result is specific, measurable, safe, and ready for Fabio review.",
      ],
      deliverableId: "validated-decision-brief",
      description: "A structured decision brief with evidence needs and next action.",
      format: "structured_json",
      title: "Validated decision brief",
    },
  ],
  evidenceExpectation: {
    level: "moderate",
    sourceRequirements: ["Separate known facts from assumptions."],
    unsupportedClaimsForbidden: true,
  },
  externalActionRequests: [],
  forbiddenActions: [
    {
      actionId: "no-autonomous-action",
      category: "autonomous_action",
      description: "Do not take action without Fabio.",
    },
  ],
  founderPreferences: ONLY_WAY_FOUNDER_PREFERENCE_PROFILE,
  knownFacts: [],
  missionType: "business_opportunity",
  nonExecuting: true,
  objective: {
    businessValues: ["help_fabio_make_money", "save_fabio_time"],
    desiredOutcome: "A clear decision and one safe first action.",
    purpose: "Identify a practical opportunity worth validating.",
    statement: "Evaluate a bounded business opportunity for Fabio.",
  },
  originalityStandard: {
    differentiationCriteria: [
      "Differentiate from the obvious baseline through target-specific value.",
    ],
    level: "high",
  },
  priority: "normal",
  qualityStandard: {
    criteria: ["commercially useful", "evidence-aware", "specific"],
    level: "premium",
    minimumAcceptableOutcome:
      "Fabio can decide whether the opportunity deserves further work.",
  },
  riskTolerance: "low",
  styleProfile: {
    applicableDeliverableIds: ["validated-decision-brief"],
    communicationTraits: ["direct", "high information density", "low fluff"],
  },
  successMetrics: [
    {
      evidenceRequired: "The brief contains a decision, rationale, and validation need.",
      measurement: "decision readiness",
      metricId: "decision-readiness",
      target: "one explicit go, revise, or stop recommendation",
    },
  ],
  unknowns: [],
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
