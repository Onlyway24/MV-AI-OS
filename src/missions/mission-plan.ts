import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { MainAssistantSafetyDomain, MainAssistantEscalationType } from "../assistants/main-assistant-specification.js";
import type { AgentCompanyRoleId } from "../assistants/agent-company-specification.js";
import type { AgentCompanyCapabilityId } from "../assistants/agent-capability-registry.js";
import type { AgentCompanyPermissionRuleId } from "../assistants/agent-permission-matrix.js";
import type { AgentHandoffId } from "../assistants/agent-handoff-contracts.js";
import type { ResponsibilityAreaId } from "../assistants/inter-agent-responsibility-matrix.js";

export const MISSION_PLAN_CONTRACT_VERSION = "1" as const;
export const DEFAULT_MISSION_PLAN_ID = "mission-plan@1.0.0" as const;

export type MissionStrategyKind = "BOLD" | "RAPID" | "RECOMMENDED";
export type MissionStepRiskLevel = "high" | "low" | "medium";
export type MissionEffortClass = "high" | "low" | "medium";
export type MissionCostClass = "high" | "low" | "medium" | "minimal" | "unknown";
export type MissionConfidence = "high" | "low" | "medium";

export interface MissionPlanAgentReference {
  readonly agentId: AgentCompanyRoleId;
  readonly specificationId: string;
  readonly version: string;
}

export interface MissionStrategyOption {
  readonly compromises: readonly string[];
  readonly description: string;
  readonly optionId: string;
  readonly strategyKind: MissionStrategyKind;
  readonly valueRationale: string;
}

export interface MissionStepExpectedOutput {
  readonly artifactType: string;
  readonly description: string;
  readonly requiredSections: readonly string[];
}

export interface MissionPlanStep {
  readonly approvalRequirements: readonly MainAssistantEscalationType[];
  readonly capabilityIds: readonly AgentCompanyCapabilityId[];
  readonly costClass: MissionCostClass;
  readonly dependencies: readonly string[];
  readonly effortClass: MissionEffortClass;
  readonly expectedOutput: MissionStepExpectedOutput;
  readonly failureConditions: readonly string[];
  readonly guardianRequirements: readonly MainAssistantSafetyDomain[];
  readonly handoffIds: readonly AgentHandoffId[];
  readonly nonExecuting: true;
  readonly order: number;
  readonly permissionRuleIds: readonly AgentCompanyPermissionRuleId[];
  readonly primaryAgent: MissionPlanAgentReference;
  readonly purpose: string;
  readonly requiredInputs: readonly string[];
  readonly responsibilityAreaId: ResponsibilityAreaId;
  readonly riskLevel: MissionStepRiskLevel;
  readonly stepId: string;
  readonly stopConditions: readonly string[];
  readonly successCriteria: readonly string[];
  readonly supportingAgents: readonly MissionPlanAgentReference[];
  readonly title: string;
}

export interface MissionPlanSummary {
  readonly assumptions: readonly string[];
  readonly businessOrOperatorValue: string;
  readonly confidence: MissionConfidence;
  readonly expectedFinalResult: string;
  readonly normalizedObjective: string;
  readonly recommendedDirection: string;
  readonly unresolvedQuestions: readonly string[];
}

export interface MissionApprovalQueueItem {
  readonly approvalId: string;
  readonly requiredFor: readonly MainAssistantEscalationType[];
  readonly stepIds: readonly string[];
}

export interface MissionGuardianQueueItem {
  readonly domains: readonly MainAssistantSafetyDomain[];
  readonly reviewId: string;
  readonly stepIds: readonly string[];
}

export interface MissionExternalActionBoundary {
  readonly externalExecutionAllowed: false;
  readonly nonExecuting: true;
  readonly requestedActionTypes: readonly string[];
}

export interface MissionPlanControl {
  readonly approvalQueue: readonly MissionApprovalQueueItem[];
  readonly criticalRisks: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly externalActionBoundary: MissionExternalActionBoundary;
  readonly firstConcreteAction: string;
  readonly guardianReviewQueue: readonly MissionGuardianQueueItem[];
  readonly minimumAcceptableQuality: string;
  readonly rejectionReasons: readonly string[];
  readonly successMetrics: readonly string[];
  readonly totalCostClass: MissionCostClass;
  readonly totalEffortClass: MissionEffortClass;
}

export interface MissionPlan {
  readonly briefId: string;
  readonly companyReadinessReportId: string;
  readonly contractVersion: RequestContractVersion;
  readonly control: MissionPlanControl;
  readonly nonExecuting: true;
  readonly planId: string;
  readonly steps: readonly MissionPlanStep[];
  readonly strategyOptions: readonly MissionStrategyOption[];
  readonly summary: MissionPlanSummary;
}

export const DEFAULT_MISSION_PLAN: MissionPlan = deepFreeze({
  briefId: "founder-mission-brief@1.0.0",
  companyReadinessReportId: "agent-company-readiness@1.0.0",
  contractVersion: MISSION_PLAN_CONTRACT_VERSION,
  control: {
    approvalQueue: [],
    criticalRisks: ["Evidence quality may change the final recommendation."],
    evidenceRequirements: ["Separate known facts, assumptions, and unresolved questions."],
    externalActionBoundary: {
      externalExecutionAllowed: false,
      nonExecuting: true,
      requestedActionTypes: [],
    },
    firstConcreteAction: "Prepare the bounded internal research brief.",
    guardianReviewQueue: [
      {
        domains: ["operator_safety", "security", "quality"],
        reviewId: "research-safety-review",
        stepIds: ["01-research-brief"],
      },
      {
        domains: ["operator_safety", "cost", "quality"],
        reviewId: "strategy-safety-review",
        stepIds: ["02-business-decision"],
      },
    ],
    minimumAcceptableQuality: "A specific evidence-aware recommendation Fabio can approve, revise, or stop.",
    rejectionReasons: [],
    successMetrics: ["One explicit go, revise, or stop recommendation with evidence needs."],
    totalCostClass: "low",
    totalEffortClass: "medium",
  },
  nonExecuting: true,
  planId: DEFAULT_MISSION_PLAN_ID,
  steps: [
    {
      approvalRequirements: [],
      capabilityIds: ["source-research", "information-synthesis"],
      costClass: "low",
      dependencies: [],
      effortClass: "medium",
      expectedOutput: {
        artifactType: "research-brief",
        description: "A bounded source and evidence brief for the business decision.",
        requiredSections: ["evidence gaps", "known facts", "research questions", "uncertainty"],
      },
      failureConditions: ["No evidence boundary or research question can be stated."],
      guardianRequirements: ["operator_safety", "security", "quality"],
      handoffIds: [],
      nonExecuting: true,
      order: 1,
      permissionRuleIds: ["source-research-permission", "information-synthesis-permission"],
      primaryAgent: {
        agentId: "research-agent",
        specificationId: "research-agent@1.0.0",
        version: "1.0.0",
      },
      purpose: "Define the evidence needed before Fabio commits to a business direction.",
      requiredInputs: ["validated Founder Mission Brief"],
      responsibilityAreaId: "research",
      riskLevel: "low",
      stepId: "01-research-brief",
      stopConditions: ["Stop if required evidence cannot be obtained safely."],
      successCriteria: ["The brief separates facts, assumptions, and evidence gaps."],
      supportingAgents: [],
      title: "Prepare evidence brief",
    },
    {
      approvalRequirements: [],
      capabilityIds: ["business-model-shaping", "mission-planning-support"],
      costClass: "low",
      dependencies: ["01-research-brief"],
      effortClass: "medium",
      expectedOutput: {
        artifactType: "business-decision-brief",
        description: "A concrete recommendation with value, constraints, evidence, and first action.",
        requiredSections: ["first action", "recommendation", "risks", "success measures"],
      },
      failureConditions: ["The recommendation has no concrete value or measurable result."],
      guardianRequirements: ["operator_safety", "cost", "quality"],
      handoffIds: ["research_to_business_strategy-handoff"],
      nonExecuting: true,
      order: 2,
      permissionRuleIds: ["business-model-shaping-permission", "mission-planning-support-permission"],
      primaryAgent: {
        agentId: "business-agent",
        specificationId: "business-agent@1.0.0",
        version: "1.0.0",
      },
      purpose: "Convert bounded evidence into one practical decision for Fabio.",
      requiredInputs: ["01-research-brief output"],
      responsibilityAreaId: "business-strategy",
      riskLevel: "medium",
      stepId: "02-business-decision",
      stopConditions: ["Stop if the evidence does not support a responsible recommendation."],
      successCriteria: ["Fabio can approve, revise, or stop the proposed direction."],
      supportingAgents: [
        {
          agentId: "research-agent",
          specificationId: "research-agent@1.0.0",
          version: "1.0.0",
        },
      ],
      title: "Prepare business decision",
    },
  ],
  strategyOptions: [
    {
      compromises: [],
      description: "Use the smallest sufficient team to produce evidence and one business decision.",
      optionId: "recommended-evidence-first",
      strategyKind: "RECOMMENDED",
      valueRationale: "Balances practical value, confidence, cost, and controlled risk.",
    },
  ],
  summary: {
    assumptions: [],
    businessOrOperatorValue: "Help Fabio identify a useful opportunity without unnecessary manual coordination.",
    confidence: "medium",
    expectedFinalResult: "A decision brief ready for Fabio review.",
    normalizedObjective: "Evaluate a bounded business opportunity and recommend one safe next action.",
    recommendedDirection: "Use an evidence-first internal planning path with the smallest sufficient agent team.",
    unresolvedQuestions: [],
  },
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}
