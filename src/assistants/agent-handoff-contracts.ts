import {
  type AgentCompanyCapabilityApprovalRequirement,
  type AgentCompanyCapabilityGuardianRequirement,
  type AgentCompanyCapabilityId,
  type AgentCompanyFutureToolCategory,
  type AgentCompanyFutureWorkflowStepType,
} from "./agent-capability-registry.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import type { AgentCompanyPermissionRuleId } from "./agent-permission-matrix.js";
import type { ResponsibilityAreaId } from "./inter-agent-responsibility-matrix.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

export const AGENT_HANDOFF_CONTRACT_VERSION = "1" as const;
export const DEFAULT_AGENT_HANDOFF_CONTRACT_SET_ID =
  "agent-handoff-contracts@1.0.0" as const;

export const AGENT_HANDOFF_TYPES = [
  "research_to_business_strategy",
  "research_to_market_opportunity",
  "research_to_competitor_positioning",
  "research_to_customer_pain_points",
  "business_to_offer_design",
  "business_to_pricing_review",
  "business_to_content_strategy",
  "business_to_sales_preparation",
  "content_to_publishing_preparation",
  "content_to_legal_risk_review",
  "content_to_quality_review",
  "finance_to_business_review",
  "finance_to_pricing_review",
  "legal_risk_to_content_review",
  "legal_risk_to_sales_review",
  "legal_risk_to_customer_delivery_review",
  "developer_to_knowledge_curation",
  "knowledge_to_research_context",
  "customer_delivery_to_quality_review",
  "publisher_to_fabio_approval_package",
  "sales_to_fabio_approval_package",
  "customer_delivery_to_fabio_approval_package",
] as const;

export type AgentHandoffType = (typeof AGENT_HANDOFF_TYPES)[number];
export type AgentHandoffId = `${AgentHandoffType}-handoff`;

export const AGENT_HANDOFF_IDS = AGENT_HANDOFF_TYPES.map(
  (handoffType) => `${handoffType}-handoff`,
) as readonly AgentHandoffId[];

export type AgentHandoffReason =
  | "approval_preparation"
  | "business_strategy_support"
  | "customer_delivery_review"
  | "evidence_transfer"
  | "knowledge_context_support"
  | "market_opportunity_support"
  | "offer_design_support"
  | "pricing_review"
  | "publishing_preparation"
  | "quality_review"
  | "risk_review"
  | "sales_preparation"
  | "technical_knowledge_support";

export type AgentHandoffRiskLevel = "high" | "low" | "medium";

export type AgentHandoffEvidenceQuality =
  | "high"
  | "low"
  | "medium"
  | "unknown";

export type AgentHandoffUncertaintyLevel =
  | "high"
  | "low"
  | "medium"
  | "unknown";

export type AgentHandoffExpectedOutputKind =
  | "approval_package"
  | "business_strategy_brief"
  | "content_direction_brief"
  | "customer_delivery_review"
  | "knowledge_context_brief"
  | "market_opportunity_brief"
  | "offer_design_brief"
  | "pricing_review_brief"
  | "publishing_preparation_brief"
  | "quality_review_brief"
  | "risk_review_brief"
  | "sales_preparation_brief";

export type AgentHandoffStatus =
  | "accepted"
  | "blocked"
  | "forbidden_handoff"
  | "insufficient_evidence"
  | "invalid_source"
  | "invalid_target"
  | "missing_capability"
  | "missing_permission"
  | "missing_responsibility_mapping"
  | "non_execution_confirmed"
  | "rejected"
  | "requires_fabio_approval"
  | "requires_guardian_review"
  | "unclear_expected_output"
  | "unsafe_external_implication"
  | "unsafe_payload";

export type AgentHandoffResultReasonCode =
  | "accepted_non_executing"
  | "approval_required"
  | "blocked_by_policy"
  | "forbidden_pair"
  | "guardian_required"
  | "insufficient_evidence"
  | "invalid_contract"
  | "missing_alignment"
  | "unsafe_content";

export interface AgentHandoffRoleReference {
  readonly agentId: AgentCompanyRoleId;
  readonly specificationId: string;
  readonly version: string;
}

export interface AgentHandoffMarketInsightSummary {
  readonly commonObjections: readonly string[];
  readonly competitorSummary: string;
  readonly customerBehaviorSignals: readonly string[];
  readonly localTrendSummary: string;
  readonly marketWeaknessSummary: string;
  readonly pricingSensitivity: string;
  readonly restaurantOwnerNeeds: readonly string[];
  readonly restaurantPainPoints: readonly string[];
  readonly unmetDemandSummary: string;
}

export interface AgentHandoffOpportunitySummary {
  readonly opportunityGaps: readonly string[];
  readonly positioningAngles: readonly string[];
  readonly recommendedNextBusinessQuestion: string;
}

export interface AgentHandoffBusinessContext {
  readonly assumptions: readonly string[];
  readonly objectiveSummary: string;
  readonly operationalConstraints: readonly string[];
  readonly recommendedNextStep: string;
  readonly riskNotes: readonly string[];
  readonly targetCustomerProfile?: string;
  readonly valueProposition?: string;
}

export interface AgentHandoffEvidenceSummary {
  readonly evidenceNotes: readonly string[];
  readonly evidenceQuality: AgentHandoffEvidenceQuality;
  readonly uncertaintyLevel: AgentHandoffUncertaintyLevel;
  readonly uncertaintyNotes: readonly string[];
}

export interface AgentHandoffPayloadSummary {
  readonly businessContext: AgentHandoffBusinessContext;
  readonly evidenceSummary: AgentHandoffEvidenceSummary;
  readonly marketInsightSummary?: AgentHandoffMarketInsightSummary;
  readonly opportunitySummary?: AgentHandoffOpportunitySummary;
  readonly summary: string;
}

export interface AgentHandoffExpectedOutput {
  readonly description: string;
  readonly outputKind: AgentHandoffExpectedOutputKind;
  readonly requiredSections: readonly string[];
}

export interface AgentHandoffFutureWorkflowRelevance {
  readonly approvalSensitive: boolean;
  readonly compatible: boolean;
  readonly guardianSensitive: boolean;
  readonly nonExecuting: true;
  readonly stepType?: AgentCompanyFutureWorkflowStepType;
}

export interface AgentHandoffFutureToolRelevance {
  readonly approvalSensitive: boolean;
  readonly compatible: boolean;
  readonly guardianSensitive: boolean;
  readonly nonExecuting: true;
  readonly toolCategory?: AgentCompanyFutureToolCategory;
}

export interface AgentHandoffRequest {
  readonly approvalRequired: boolean;
  readonly approvalRequirements: readonly AgentCompanyCapabilityApprovalRequirement[];
  readonly blockedContentRules: readonly string[];
  readonly contractVersion: typeof AGENT_HANDOFF_CONTRACT_VERSION;
  readonly expectedOutput: AgentHandoffExpectedOutput;
  readonly futureTool: AgentHandoffFutureToolRelevance;
  readonly futureWorkflow: AgentHandoffFutureWorkflowRelevance;
  readonly guardianRequired: boolean;
  readonly guardianRequirements: readonly AgentCompanyCapabilityGuardianRequirement[];
  readonly handoffId: AgentHandoffId;
  readonly handoffType: AgentHandoffType;
  readonly nonExecuting: true;
  readonly payloadSummary: AgentHandoffPayloadSummary;
  readonly reason: AgentHandoffReason;
  readonly relatedCapabilityIds: readonly AgentCompanyCapabilityId[];
  readonly relatedPermissionRuleIds: readonly AgentCompanyPermissionRuleId[];
  readonly relatedResponsibilityAreaIds: readonly ResponsibilityAreaId[];
  readonly riskLevel: AgentHandoffRiskLevel;
  readonly source: AgentHandoffRoleReference;
  readonly target: AgentHandoffRoleReference;
}

export interface AgentHandoffResult {
  readonly contractVersion: typeof AGENT_HANDOFF_CONTRACT_VERSION;
  readonly handoffId: AgentHandoffId;
  readonly nonExecuting: true;
  readonly reasonCode: AgentHandoffResultReasonCode;
  readonly safeMessage: string;
  readonly status: AgentHandoffStatus;
}

export interface AgentHandoffContractSet {
  readonly contractVersion: typeof AGENT_HANDOFF_CONTRACT_VERSION;
  readonly handoffs: readonly AgentHandoffRequest[];
  readonly nonExecuting: true;
  readonly setId: string;
}

interface HandoffInput {
  readonly approvalRequired?: boolean;
  readonly approvalRequiredFor?: readonly MainAssistantEscalationType[];
  readonly approvalRationale?: string;
  readonly businessContext: AgentHandoffBusinessContext;
  readonly expectedOutput: AgentHandoffExpectedOutput;
  readonly futureTool?: {
    readonly approvalSensitive?: boolean;
    readonly compatible: boolean;
    readonly guardianSensitive?: boolean;
    readonly toolCategory?: AgentCompanyFutureToolCategory;
  };
  readonly futureWorkflow?: {
    readonly approvalSensitive?: boolean;
    readonly compatible: boolean;
    readonly guardianSensitive?: boolean;
    readonly stepType?: AgentCompanyFutureWorkflowStepType;
  };
  readonly guardianDomains?: readonly MainAssistantSafetyDomain[];
  readonly guardianRationale?: string;
  readonly handoffType: AgentHandoffType;
  readonly marketInsightSummary?: AgentHandoffMarketInsightSummary;
  readonly opportunitySummary?: AgentHandoffOpportunitySummary;
  readonly reason: AgentHandoffReason;
  readonly relatedCapabilityIds: readonly AgentCompanyCapabilityId[];
  readonly relatedPermissionRuleIds: readonly AgentCompanyPermissionRuleId[];
  readonly relatedResponsibilityAreaIds: readonly ResponsibilityAreaId[];
  readonly riskLevel: AgentHandoffRiskLevel;
  readonly source: AgentCompanyRoleId;
  readonly summary: string;
  readonly target: AgentCompanyRoleId;
}

export const DEFAULT_AGENT_HANDOFF_CONTRACT_SET: AgentHandoffContractSet =
  deepFreeze({
    contractVersion: AGENT_HANDOFF_CONTRACT_VERSION,
    handoffs: [
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Convert sanitized research evidence into business strategy options.",
          recommendedNextStep: "Choose the next business question before offer design.",
        }),
        expectedOutput: expected(
          "business_strategy_brief",
          "A strategy brief with opportunity interpretation, risks, and next business question.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "research_to_business_strategy",
        marketInsightSummary: restaurantMarketInsight(),
        opportunitySummary: restaurantOpportunity(),
        reason: "business_strategy_support",
        relatedCapabilityIds: ["business-model-shaping", "mission-planning-support"],
        relatedPermissionRuleIds: [
          "business-model-shaping-permission",
          "mission-planning-support-permission",
        ],
        relatedResponsibilityAreaIds: ["business-strategy", "market-analysis"],
        riskLevel: "medium",
        source: "research-agent",
        summary:
          "Sanitized market findings suggest a focused business strategy opportunity and open positioning questions.",
        target: "business-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Translate market signals into opportunity hypotheses for business review.",
          recommendedNextStep: "Select the strongest opportunity gap to validate.",
        }),
        expectedOutput: expected(
          "market_opportunity_brief",
          "A market opportunity brief with opportunity gaps, risks, and validation questions.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "research_to_market_opportunity",
        marketInsightSummary: restaurantMarketInsight(),
        opportunitySummary: restaurantOpportunity(),
        reason: "market_opportunity_support",
        relatedCapabilityIds: ["offer-design", "value-proposition-design"],
        relatedPermissionRuleIds: [
          "offer-design-permission",
          "value-proposition-design-permission",
        ],
        relatedResponsibilityAreaIds: ["market-analysis", "offer-design"],
        riskLevel: "medium",
        source: "research-agent",
        summary:
          "Sanitized research points to opportunity gaps that need business interpretation before an offer exists.",
        target: "business-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Turn competitor positioning observations into safer offer positioning options.",
          recommendedNextStep: "Decide which competitor weakness is safe to use in positioning.",
        }),
        expectedOutput: expected(
          "business_strategy_brief",
          "A competitor positioning brief with differentiators and claim-risk notes.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "security", "quality"],
        handoffType: "research_to_competitor_positioning",
        marketInsightSummary: restaurantMarketInsight(),
        opportunitySummary: restaurantOpportunity(),
        reason: "market_opportunity_support",
        relatedCapabilityIds: ["competitor-research", "value-proposition-design"],
        relatedPermissionRuleIds: [
          "competitor-research-permission",
          "value-proposition-design-permission",
        ],
        relatedResponsibilityAreaIds: ["market-analysis", "business-strategy"],
        riskLevel: "medium",
        source: "research-agent",
        summary:
          "Sanitized competitor observations need business interpretation before any public comparison is used.",
        target: "business-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Translate customer pain points into business questions and offer constraints.",
          recommendedNextStep: "Prioritize pain points that match Fabio's capabilities.",
        }),
        expectedOutput: expected(
          "market_opportunity_brief",
          "A customer pain-point brief with objections, constraints, and opportunity fit.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "research_to_customer_pain_points",
        marketInsightSummary: restaurantMarketInsight(),
        opportunitySummary: restaurantOpportunity(),
        reason: "market_opportunity_support",
        relatedCapabilityIds: ["information-synthesis", "offer-design"],
        relatedPermissionRuleIds: [
          "information-synthesis-permission",
          "offer-design-permission",
        ],
        relatedResponsibilityAreaIds: ["research", "offer-design"],
        riskLevel: "medium",
        source: "research-agent",
        summary:
          "Sanitized customer pain points need business filtering before offer design.",
        target: "business-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Convert approved strategy direction into offer structure support.",
          recommendedNextStep: "Prepare offer components for content and review.",
        }),
        expectedOutput: expected(
          "offer_design_brief",
          "An offer design brief with audience, promise, mechanism, proof, and constraints.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "business_to_offer_design",
        reason: "offer_design_support",
        relatedCapabilityIds: ["content-strategy", "tone-message-quality-review"],
        relatedPermissionRuleIds: [
          "content-strategy-permission",
          "tone-message-quality-review-permission",
        ],
        relatedResponsibilityAreaIds: ["offer-design", "content-direction"],
        riskLevel: "medium",
        source: "business-agent",
        summary:
          "Business strategy needs content-ready offer framing before customer-facing material exists.",
        target: "content-director",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Customer-facing pricing or offer terms require Fabio approval before external use.",
        businessContext: businessContext({
          objectiveSummary:
            "Ask Finance / Cost Analyst to review pricing and margin implications.",
          recommendedNextStep: "Return pricing assumptions and budget-risk notes.",
        }),
        expectedOutput: expected(
          "pricing_review_brief",
          "A pricing review brief with cost assumptions, margin notes, and approval risks.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "cost", "quality"],
        handoffType: "business_to_pricing_review",
        reason: "pricing_review",
        relatedCapabilityIds: ["budget-impact-review", "pricing-economics-support"],
        relatedPermissionRuleIds: [
          "budget-impact-review-permission",
          "pricing-economics-support-permission",
        ],
        relatedResponsibilityAreaIds: ["pricing-support", "offer-design"],
        riskLevel: "high",
        source: "business-agent",
        summary:
          "Offer pricing assumptions need finance review before public or customer-facing use.",
        target: "finance-cost-analyst",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Move business positioning into content strategy and messaging direction.",
          recommendedNextStep: "Prepare channel-fit content angles and messaging constraints.",
        }),
        expectedOutput: expected(
          "content_direction_brief",
          "A content direction brief with target audience, angles, objections, and quality risks.",
        ),
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "business_to_content_strategy",
        reason: "business_strategy_support",
        relatedCapabilityIds: ["content-strategy", "script-direction"],
        relatedPermissionRuleIds: [
          "content-strategy-permission",
          "script-direction-permission",
        ],
        relatedResponsibilityAreaIds: ["content-direction", "business-strategy"],
        riskLevel: "medium",
        source: "business-agent",
        summary:
          "Business positioning needs content strategy support before drafts or publishing preparation.",
        target: "content-director",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Sales outreach or proposal preparation can affect external relationships and requires Fabio approval before any send path.",
        businessContext: businessContext({
          objectiveSummary:
            "Prepare sales positioning and outreach structure from business strategy.",
          recommendedNextStep: "Return unsent sales angles, objections, and approval needs.",
        }),
        expectedOutput: expected(
          "sales_preparation_brief",
          "A sales preparation brief with positioning, objections, and approval gates.",
        ),
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "sales_material_preparation",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "approval_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "quality"],
        handoffType: "business_to_sales_preparation",
        reason: "sales_preparation",
        relatedCapabilityIds: ["sales-strategy", "outreach-preparation"],
        relatedPermissionRuleIds: [
          "sales-strategy-permission",
          "outreach-preparation-permission",
        ],
        relatedResponsibilityAreaIds: ["sales-planning", "business-strategy"],
        riskLevel: "high",
        source: "business-agent",
        summary:
          "Business strategy needs sales preparation while remaining unsent and approval-gated.",
        target: "sales-agent",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Publishing preparation can lead to public output and requires Fabio approval before any publish path.",
        businessContext: businessContext({
          objectiveSummary:
            "Prepare publishing package from reviewed content direction.",
          recommendedNextStep: "Return approval-ready publishing checklist and missing gates.",
        }),
        expectedOutput: expected(
          "publishing_preparation_brief",
          "A publishing preparation brief with channel formatting, checklist, and approval markers.",
        ),
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "channel_formatting",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "handoff_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "quality"],
        handoffType: "content_to_publishing_preparation",
        reason: "publishing_preparation",
        relatedCapabilityIds: ["publishing-preparation", "channel-formatting"],
        relatedPermissionRuleIds: [
          "publishing-preparation-permission",
          "channel-formatting-permission",
        ],
        relatedResponsibilityAreaIds: ["publishing-preparation", "content-review"],
        riskLevel: "high",
        source: "content-director",
        summary:
          "Reviewed content direction needs publishing preparation, but no public action may occur.",
        target: "publisher-agent",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Public-facing claims or legal/compliance-sensitive external content require Fabio approval before external use.",
        businessContext: businessContext({
          objectiveSummary:
            "Review public-facing claims and risk-sensitive messaging before external use.",
          recommendedNextStep: "Return risk flags, safer wording, and escalation needs.",
        }),
        expectedOutput: expected(
          "risk_review_brief",
          "A legal/risk review brief with claim risks, uncertainty, and escalation notes.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "quality"],
        handoffType: "content_to_legal_risk_review",
        reason: "risk_review",
        relatedCapabilityIds: ["compliance-sensitive-review", "claim-risk-review"],
        relatedPermissionRuleIds: [
          "compliance-sensitive-review-permission",
          "claim-risk-review-permission",
        ],
        relatedResponsibilityAreaIds: ["legal-risk-review", "content-review"],
        riskLevel: "high",
        source: "content-director",
        summary:
          "Public-facing content claims need risk review without treating notes as binding legal sign-off.",
        target: "legal-risk-reviewer",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Review content quality before publishing or sales preparation.",
          recommendedNextStep: "Return quality gaps and improvement checklist.",
        }),
        expectedOutput: expected(
          "quality_review_brief",
          "A quality review brief with tone, clarity, structure, and evidence checks.",
        ),
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["quality"],
        handoffType: "content_to_quality_review",
        reason: "quality_review",
        relatedCapabilityIds: ["quality-review-preparation", "claim-risk-review"],
        relatedPermissionRuleIds: [
          "quality-review-preparation-permission",
          "claim-risk-review-permission",
        ],
        relatedResponsibilityAreaIds: ["content-review", "legal-risk-review"],
        riskLevel: "medium",
        source: "content-director",
        summary:
          "Content requires quality and claim-risk review before approval-ready packaging.",
        target: "legal-risk-reviewer",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Send finance findings back to business strategy review.",
          recommendedNextStep: "Revise business assumptions based on cost and margin findings.",
        }),
        expectedOutput: expected(
          "business_strategy_brief",
          "A business review brief reflecting cost, margin, and pricing constraints.",
        ),
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["cost", "quality"],
        handoffType: "finance_to_business_review",
        reason: "pricing_review",
        relatedCapabilityIds: ["business-model-shaping", "pricing-strategy-support"],
        relatedPermissionRuleIds: [
          "business-model-shaping-permission",
          "pricing-strategy-support-permission",
        ],
        relatedResponsibilityAreaIds: ["business-strategy", "pricing-support"],
        riskLevel: "medium",
        source: "finance-cost-analyst",
        summary:
          "Finance findings need business interpretation before offer strategy changes.",
        target: "business-agent",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Customer-facing pricing needs Fabio approval before it can be used externally.",
        businessContext: businessContext({
          objectiveSummary:
            "Return finance pricing review for strategy and approval preparation.",
          recommendedNextStep: "Decide whether pricing assumptions are ready for Fabio review.",
        }),
        expectedOutput: expected(
          "pricing_review_brief",
          "A pricing review brief with margin sensitivity and public-pricing approval risks.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "cost", "quality"],
        handoffType: "finance_to_pricing_review",
        reason: "pricing_review",
        relatedCapabilityIds: ["pricing-strategy-support", "pricing-economics-support"],
        relatedPermissionRuleIds: [
          "pricing-strategy-support-permission",
          "pricing-economics-support-permission",
        ],
        relatedResponsibilityAreaIds: ["pricing-support", "offer-design"],
        riskLevel: "high",
        source: "finance-cost-analyst",
        summary:
          "Finance pricing review needs business framing before any customer-facing pricing is proposed.",
        target: "business-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Return legal/risk review notes to content for safer messaging.",
          recommendedNextStep: "Revise claims and tone based on risk flags.",
        }),
        expectedOutput: expected(
          "content_direction_brief",
          "A content revision brief with safer language and unresolved risk notes.",
        ),
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["quality"],
        handoffType: "legal_risk_to_content_review",
        reason: "risk_review",
        relatedCapabilityIds: ["tone-message-quality-review", "quality-review-preparation"],
        relatedPermissionRuleIds: [
          "tone-message-quality-review-permission",
          "quality-review-preparation-permission",
        ],
        relatedResponsibilityAreaIds: ["content-review", "legal-risk-review"],
        riskLevel: "medium",
        source: "legal-risk-reviewer",
        summary:
          "Risk review notes need content revision without treating notes as binding legal sign-off.",
        target: "content-director",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Sales claims and outreach drafts require Fabio approval before external contact.",
        businessContext: businessContext({
          objectiveSummary:
            "Return risk notes to sales preparation for safer unsent outreach.",
          recommendedNextStep: "Revise sales language and approval packet.",
        }),
        expectedOutput: expected(
          "sales_preparation_brief",
          "A sales review brief with claim limits, objections, and approval gates.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "approval_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "quality"],
        handoffType: "legal_risk_to_sales_review",
        reason: "risk_review",
        relatedCapabilityIds: ["approval-ready-sales-handoff", "outreach-preparation"],
        relatedPermissionRuleIds: [
          "approval-ready-sales-handoff-permission",
          "outreach-preparation-permission",
        ],
        relatedResponsibilityAreaIds: ["sales-planning", "legal-risk-review"],
        riskLevel: "high",
        source: "legal-risk-reviewer",
        summary:
          "Risk review notes need sales revision before any external outreach approval packet.",
        target: "sales-agent",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Customer-facing delivery promises require Fabio approval before external delivery.",
        businessContext: businessContext({
          objectiveSummary:
            "Return legal/risk review notes to customer delivery preparation.",
          recommendedNextStep: "Revise delivery package and approval checklist.",
        }),
        expectedOutput: expected(
          "customer_delivery_review",
          "A delivery risk review brief with promise limits, scope flags, and approval gates.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "approval_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "backup", "quality"],
        handoffType: "legal_risk_to_customer_delivery_review",
        reason: "customer_delivery_review",
        relatedCapabilityIds: ["client-handoff-preparation", "approval-ready-delivery-package"],
        relatedPermissionRuleIds: [
          "client-handoff-preparation-permission",
          "approval-ready-delivery-package-permission",
        ],
        relatedResponsibilityAreaIds: [
          "customer-delivery-preparation",
          "legal-risk-review",
        ],
        riskLevel: "high",
        source: "legal-risk-reviewer",
        summary:
          "Risk review notes need delivery package revision before any client-facing handoff.",
        target: "customer-delivery-agent",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Move technical planning knowledge into governed curation preparation.",
          recommendedNextStep: "Prepare source-to-knowledge organization notes.",
        }),
        expectedOutput: expected(
          "knowledge_context_brief",
          "A knowledge curation brief with scopes, tags, provenance, and retrieval risks.",
        ),
        futureTool: {
          compatible: true,
          guardianSensitive: true,
          toolCategory: "knowledge_readiness",
        },
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["security", "backup", "quality"],
        handoffType: "developer_to_knowledge_curation",
        reason: "technical_knowledge_support",
        relatedCapabilityIds: ["source-to-knowledge-preparation", "retrieval-readiness-support"],
        relatedPermissionRuleIds: [
          "source-to-knowledge-preparation-permission",
          "retrieval-readiness-support-permission",
        ],
        relatedResponsibilityAreaIds: ["implementation-planning", "knowledge-curation"],
        riskLevel: "medium",
        source: "developer-agent",
        summary:
          "Technical planning notes need governed knowledge organization without mutating stores.",
        target: "knowledge-curator",
      }),
      handoff({
        businessContext: businessContext({
          objectiveSummary:
            "Provide curated context to research without exposing raw stores.",
          recommendedNextStep: "Use curated source labels to focus research questions.",
        }),
        expectedOutput: expected(
          "knowledge_context_brief",
          "A research context brief with permitted scopes, freshness notes, and evidence gaps.",
        ),
        futureTool: {
          compatible: true,
          guardianSensitive: true,
          toolCategory: "read_only_research",
        },
        futureWorkflow: { compatible: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["security", "quality"],
        handoffType: "knowledge_to_research_context",
        reason: "knowledge_context_support",
        relatedCapabilityIds: ["source-research", "information-synthesis"],
        relatedPermissionRuleIds: [
          "source-research-permission",
          "information-synthesis-permission",
        ],
        relatedResponsibilityAreaIds: ["knowledge-curation", "research"],
        riskLevel: "medium",
        source: "knowledge-curator",
        summary:
          "Curated knowledge context can guide research while keeping raw records out of the handoff.",
        target: "research-agent",
      }),
      handoff({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Customer delivery artifacts may affect customer relationships and require Fabio approval before external use.",
        businessContext: businessContext({
          objectiveSummary:
            "Send delivery preparation to quality review before approval packaging.",
          recommendedNextStep: "Return delivery quality gaps and readiness notes.",
        }),
        expectedOutput: expected(
          "quality_review_brief",
          "A delivery quality review brief with fulfillment checks and customer-facing risks.",
        ),
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "backup", "quality"],
        handoffType: "customer_delivery_to_quality_review",
        reason: "quality_review",
        relatedCapabilityIds: ["quality-review-preparation", "fulfillment-checklist"],
        relatedPermissionRuleIds: [
          "quality-review-preparation-permission",
          "fulfillment-checklist-permission",
        ],
        relatedResponsibilityAreaIds: [
          "customer-delivery-preparation",
          "content-review",
        ],
        riskLevel: "high",
        source: "customer-delivery-agent",
        summary:
          "Delivery preparation needs quality review before client-facing approval packaging.",
        target: "content-director",
      }),
      approvalPackageHandoff({
        handoffType: "publisher_to_fabio_approval_package",
        relatedCapabilityIds: [
          "approval-ready-publishing-handoff",
          "approval-preparation",
        ],
        relatedPermissionRuleIds: [
          "approval-ready-publishing-handoff-permission",
          "approval-preparation-permission",
        ],
        relatedResponsibilityAreaIds: ["publishing-preparation", "legal-risk-review"],
        source: "publisher-agent",
        summary:
          "Publishing preparation needs a Fabio approval package before any public output.",
      }),
      approvalPackageHandoff({
        handoffType: "sales_to_fabio_approval_package",
        relatedCapabilityIds: ["approval-ready-sales-handoff", "approval-preparation"],
        relatedPermissionRuleIds: [
          "approval-ready-sales-handoff-permission",
          "approval-preparation-permission",
        ],
        relatedResponsibilityAreaIds: ["sales-planning", "legal-risk-review"],
        source: "sales-agent",
        summary:
          "Sales preparation needs a Fabio approval package before any external outreach.",
      }),
      approvalPackageHandoff({
        handoffType: "customer_delivery_to_fabio_approval_package",
        relatedCapabilityIds: [
          "approval-ready-delivery-package",
          "approval-preparation",
        ],
        relatedPermissionRuleIds: [
          "approval-ready-delivery-package-permission",
          "approval-preparation-permission",
        ],
        relatedResponsibilityAreaIds: [
          "customer-delivery-preparation",
          "legal-risk-review",
        ],
        source: "customer-delivery-agent",
        summary:
          "Customer delivery preparation needs a Fabio approval package before external delivery.",
      }),
    ],
    nonExecuting: true,
    setId: DEFAULT_AGENT_HANDOFF_CONTRACT_SET_ID,
  });

export const DEFAULT_AGENT_HANDOFF_ACCEPTED_RESULT: AgentHandoffResult =
  deepFreeze({
    contractVersion: AGENT_HANDOFF_CONTRACT_VERSION,
    handoffId: "research_to_business_strategy-handoff",
    nonExecuting: true,
    reasonCode: "accepted_non_executing",
    safeMessage:
      "Handoff declaration is valid and remains non-executing until a future approved runtime consumes it.",
    status: "non_execution_confirmed",
  });

function approvalPackageHandoff(input: {
  readonly handoffType:
    | "customer_delivery_to_fabio_approval_package"
    | "publisher_to_fabio_approval_package"
    | "sales_to_fabio_approval_package";
  readonly relatedCapabilityIds: readonly AgentCompanyCapabilityId[];
  readonly relatedPermissionRuleIds: readonly AgentCompanyPermissionRuleId[];
  readonly relatedResponsibilityAreaIds: readonly ResponsibilityAreaId[];
  readonly source:
    | "customer-delivery-agent"
    | "publisher-agent"
    | "sales-agent";
  readonly summary: string;
}): AgentHandoffRequest {
  return handoff({
    approvalRequired: true,
    approvalRequiredFor: ["external_side_effect", "publish_or_send"],
    approvalRationale:
      "Approval packages prepare Fabio review for external or public actions and do not execute those actions.",
    businessContext: businessContext({
      objectiveSummary: "Prepare an operator approval package without external action.",
      recommendedNextStep: "Fabio must review and approve before any future external path.",
    }),
    expectedOutput: expected(
      "approval_package",
      "An approval package with summary, risks, missing gates, and explicit non-execution note.",
    ),
    futureTool: {
      approvalSensitive: true,
      compatible: true,
      guardianSensitive: true,
      toolCategory: "approval_packet_preparation",
    },
    futureWorkflow: {
      approvalSensitive: true,
      compatible: true,
      guardianSensitive: true,
      stepType: "approval_preparation_step",
    },
    guardianDomains: ["operator_safety", "security", "quality"],
    handoffType: input.handoffType,
    reason: "approval_preparation",
    relatedCapabilityIds: input.relatedCapabilityIds,
    relatedPermissionRuleIds: input.relatedPermissionRuleIds,
    relatedResponsibilityAreaIds: input.relatedResponsibilityAreaIds,
    riskLevel: "high",
    source: input.source,
    summary: input.summary,
    target: "legal-risk-reviewer",
  });
}

function handoff(input: HandoffInput): AgentHandoffRequest {
  const approvalRequired = input.approvalRequired ?? false;
  const guardianDomains = input.guardianDomains ?? [];
  return {
    approvalRequired,
    approvalRequirements: approvalRequired
      ? [
          {
            approvalId: "fabio-explicit-approval",
            rationale:
              input.approvalRationale ??
              "This handoff is approval-sensitive and requires Fabio before any future external or risky use.",
            requiredFor: input.approvalRequiredFor ?? ["external_side_effect"],
          },
        ]
      : [],
    blockedContentRules: [
      "No unredacted model input/output, provider internals, transcript dumps, credentials, private data, legal-sensitive dumps, external endpoints, executable calls, or file/network mutation instructions.",
      "Summaries must be sanitized, bounded, and suitable for planning only.",
    ],
    contractVersion: AGENT_HANDOFF_CONTRACT_VERSION,
    expectedOutput: input.expectedOutput,
    futureTool: futureTool(input.futureTool),
    futureWorkflow: futureWorkflow(input.futureWorkflow),
    guardianRequired: guardianDomains.length > 0,
    guardianRequirements:
      guardianDomains.length > 0
        ? [
            {
              domains: guardianDomains,
              rationale:
                input.guardianRationale ??
                "Guardian consultation is required before this handoff informs future orchestration.",
            },
          ]
        : [],
    handoffId: `${input.handoffType}-handoff`,
    handoffType: input.handoffType,
    nonExecuting: true,
    payloadSummary: {
      businessContext: input.businessContext,
      evidenceSummary: {
        evidenceNotes: [
          "Evidence is summarized for planning and excludes raw source dumps.",
        ],
        evidenceQuality: "medium",
        uncertaintyLevel: "medium",
        uncertaintyNotes: [
          "Future runtime must verify source freshness and exact evidence before execution.",
        ],
      },
      ...(input.marketInsightSummary === undefined
        ? {}
        : { marketInsightSummary: input.marketInsightSummary }),
      ...(input.opportunitySummary === undefined
        ? {}
        : { opportunitySummary: input.opportunitySummary }),
      summary: input.summary,
    },
    reason: input.reason,
    relatedCapabilityIds: input.relatedCapabilityIds,
    relatedPermissionRuleIds: input.relatedPermissionRuleIds,
    relatedResponsibilityAreaIds: input.relatedResponsibilityAreaIds,
    riskLevel: input.riskLevel,
    source: roleReference(input.source),
    target: roleReference(input.target),
  };
}

function expected(
  outputKind: AgentHandoffExpectedOutputKind,
  description: string,
): AgentHandoffExpectedOutput {
  return {
    description,
    outputKind,
    requiredSections: [
      "sanitized summary",
      "assumptions",
      "risk notes",
      "evidence quality",
      "uncertainty notes",
      "recommended next step",
      "non-execution confirmation",
    ],
  };
}

function businessContext(input: {
  readonly objectiveSummary: string;
  readonly recommendedNextStep: string;
}): AgentHandoffBusinessContext {
  return {
    assumptions: [
      "The handoff is a planning declaration and does not execute work.",
      "Future execution requires policy, approval, guardian, workflow, and tool gates where relevant.",
    ],
    objectiveSummary: input.objectiveSummary,
    operationalConstraints: [
      "No external communication.",
      "No workflow execution.",
      "No tool execution.",
      "No model or provider calls.",
    ],
    recommendedNextStep: input.recommendedNextStep,
    riskNotes: [
      "External, public, legal, money, or customer-facing use remains blocked until Fabio approves.",
    ],
  };
}

function restaurantMarketInsight(): AgentHandoffMarketInsightSummary {
  return {
    commonObjections: [
      "Small teams may fear complexity.",
      "Owners may worry automation loses hospitality tone.",
      "Budget sensitivity may be high for generic marketing offers.",
    ],
    competitorSummary:
      "Competitors appear to offer generic marketing packages more often than practical AI automation packages for small restaurants.",
    customerBehaviorSignals: [
      "Restaurants need visible reviews.",
      "Menus and social content change frequently.",
      "Fast customer communication matters.",
    ],
    localTrendSummary:
      "Local restaurant operators appear to need faster menu updates, better review handling, more social content, and simpler customer communication.",
    marketWeaknessSummary:
      "Few offers appear positioned around practical AI automation that preserves small restaurant tone.",
    pricingSensitivity:
      "Pricing likely needs simple packages and clear ROI assumptions before public terms.",
    restaurantOwnerNeeds: [
      "Menu content support",
      "Review response support",
      "Reservation or WhatsApp reply support",
      "Weekly social post support",
    ],
    restaurantPainPoints: [
      "Limited time for content",
      "Inconsistent review responses",
      "Manual customer communication",
      "Difficulty keeping menu and offers updated",
    ],
    unmetDemandSummary:
      "A simple restaurant AI assistant package may address practical operations and content gaps without claiming full automation.",
  };
}

function restaurantOpportunity(): AgentHandoffOpportunitySummary {
  return {
    opportunityGaps: [
      "Simple AI assistant package for menu content",
      "Review response support",
      "WhatsApp reply preparation",
      "Weekly social content planning",
    ],
    positioningAngles: [
      "Practical AI help for restaurant owners",
      "Automation support that keeps human hospitality tone",
      "Small-package operations and content assistant",
    ],
    recommendedNextBusinessQuestion:
      "Which restaurant workflow creates the clearest first paid offer without overpromising automation?",
  };
}

function futureWorkflow(
  input: HandoffInput["futureWorkflow"],
): AgentHandoffFutureWorkflowRelevance {
  if (input?.compatible !== true) {
    return {
      approvalSensitive: false,
      compatible: false,
      guardianSensitive: false,
      nonExecuting: true,
    };
  }
  return {
    approvalSensitive: input.approvalSensitive ?? false,
    compatible: true,
    guardianSensitive: input.guardianSensitive ?? false,
    nonExecuting: true,
    stepType: input.stepType ?? "analysis_step",
  };
}

function futureTool(
  input: HandoffInput["futureTool"],
): AgentHandoffFutureToolRelevance {
  if (input?.compatible !== true) {
    return {
      approvalSensitive: false,
      compatible: false,
      guardianSensitive: false,
      nonExecuting: true,
    };
  }
  return {
    approvalSensitive: input.approvalSensitive ?? false,
    compatible: true,
    guardianSensitive: input.guardianSensitive ?? false,
    nonExecuting: true,
    toolCategory: input.toolCategory ?? "approval_packet_preparation",
  };
}

function roleReference(agentId: AgentCompanyRoleId): AgentHandoffRoleReference {
  const role = roleById(agentId);
  return {
    agentId,
    specificationId: role.futureAgentSpecification.specificationId,
    version: role.futureAgentSpecification.version,
  };
}

function roleById(agentId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`unknown Agent Company role: ${agentId}`);
  }
  return role;
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
