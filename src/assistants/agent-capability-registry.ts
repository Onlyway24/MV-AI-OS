import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyBusinessValue,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";

export const AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION = "1" as const;
export const DEFAULT_AGENT_CAPABILITY_REGISTRY_ID =
  "agent-capability-registry@1.0.0" as const;

export const AGENT_COMPANY_CAPABILITY_IDS = [
  "source-research",
  "competitor-research",
  "market-trend-mapping",
  "information-synthesis",
  "offer-design",
  "business-model-shaping",
  "value-proposition-design",
  "pricing-strategy-support",
  "mission-planning-support",
  "content-strategy",
  "carousel-structure",
  "script-direction",
  "tone-message-quality-review",
  "quality-review-preparation",
  "implementation-planning",
  "technical-architecture-support",
  "code-change-planning",
  "test-planning-support",
  "knowledge-organization",
  "memory-classification",
  "source-to-knowledge-preparation",
  "retrieval-readiness-support",
  "publishing-preparation",
  "channel-formatting",
  "publishing-checklist-creation",
  "approval-ready-publishing-handoff",
  "sales-strategy",
  "outreach-preparation",
  "lead-qualification-planning",
  "approval-ready-sales-handoff",
  "cost-estimation",
  "roi-analysis",
  "budget-impact-review",
  "pricing-economics-support",
  "risk-identification",
  "compliance-sensitive-review",
  "claim-risk-review",
  "legal-escalation-recommendation",
  "approval-preparation",
  "delivery-preparation",
  "client-handoff-preparation",
  "fulfillment-checklist",
  "approval-ready-delivery-package",
] as const;

export type AgentCompanyCapabilityId =
  (typeof AGENT_COMPANY_CAPABILITY_IDS)[number];

export type AgentCompanyCapabilityCategory =
  | "approval_preparation"
  | "business_strategy"
  | "content_review"
  | "content_strategy"
  | "customer_delivery_preparation"
  | "engineering_planning"
  | "finance_analysis"
  | "knowledge_curation"
  | "legal_risk_review"
  | "market_intelligence"
  | "mission_planning_support"
  | "offer_design"
  | "pricing_support"
  | "publishing_preparation"
  | "quality_review"
  | "research"
  | "sales_planning";

export type AgentCompanyCapabilityRiskLevel = "high" | "low" | "medium";

export type AgentCompanyCapabilitySupportType =
  | "analysis"
  | "drafting"
  | "evidence"
  | "planning"
  | "review";

export type AgentCompanyCapabilityExecutionMode =
  "non_executing_declaration";

export type AgentCompanyFutureWorkflowStepType =
  | "analysis_step"
  | "approval_preparation_step"
  | "handoff_preparation_step"
  | "implementation_planning_step"
  | "knowledge_curation_step"
  | "mission_planning_step"
  | "review_step";

export type AgentCompanyFutureToolCategory =
  | "approval_packet_preparation"
  | "channel_formatting"
  | "customer_delivery_preparation"
  | "engineering_planning"
  | "finance_analysis"
  | "knowledge_readiness"
  | "read_only_research"
  | "sales_material_preparation";

export interface AgentCompanyCapabilityOwner {
  readonly agentId: AgentCompanyRoleId;
  readonly ownership: "accountable";
  readonly rationale: string;
  readonly specificationId: string;
  readonly version: string;
}

export interface AgentCompanyCapabilitySupportRole {
  readonly agentId: AgentCompanyRoleId;
  readonly rationale: string;
  readonly specificationId: string;
  readonly supportType: AgentCompanyCapabilitySupportType;
  readonly version: string;
}

export interface AgentCompanyCapabilityApprovalRequirement {
  readonly approvalId: string;
  readonly rationale: string;
  readonly requiredFor: readonly MainAssistantEscalationType[];
}

export interface AgentCompanyCapabilityGuardianRequirement {
  readonly domains: readonly MainAssistantSafetyDomain[];
  readonly rationale: string;
}

export interface AgentCompanyCapabilityFutureWorkflowMapping {
  readonly approvalSensitive: boolean;
  readonly compatible: boolean;
  readonly guardianSensitive: boolean;
  readonly nonExecuting: true;
  readonly stepType?: AgentCompanyFutureWorkflowStepType;
}

export interface AgentCompanyCapabilityFutureToolMapping {
  readonly approvalSensitive: boolean;
  readonly compatible: boolean;
  readonly guardianSensitive: boolean;
  readonly nonExecuting: true;
  readonly toolCategory?: AgentCompanyFutureToolCategory;
}

export interface AgentCompanyCapability {
  readonly approvalRequired: boolean;
  readonly approvalRequirements: readonly AgentCompanyCapabilityApprovalRequirement[];
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly capabilityId: AgentCompanyCapabilityId;
  readonly category: AgentCompanyCapabilityCategory;
  readonly description: string;
  readonly executionMode: AgentCompanyCapabilityExecutionMode;
  readonly forbiddenAsDirectPermission: true;
  readonly futureTool: AgentCompanyCapabilityFutureToolMapping;
  readonly futureWorkflow: AgentCompanyCapabilityFutureWorkflowMapping;
  readonly guardianRequired: boolean;
  readonly guardianRequirements: readonly AgentCompanyCapabilityGuardianRequirement[];
  readonly order: number;
  readonly primaryOwners: readonly AgentCompanyCapabilityOwner[];
  readonly riskLevel: AgentCompanyCapabilityRiskLevel;
  readonly supportingRoles: readonly AgentCompanyCapabilitySupportRole[];
  readonly title: string;
}

export interface AgentCompanyCapabilityRegistry {
  readonly capabilities: readonly AgentCompanyCapability[];
  readonly contractVersion: typeof AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION;
  readonly nonExecuting: true;
  readonly registryId: string;
}

interface SupportInput {
  readonly agentId: AgentCompanyRoleId;
  readonly rationale: string;
  readonly supportType: AgentCompanyCapabilitySupportType;
}

interface CapabilityInput {
  readonly approvalRequired?: boolean;
  readonly approvalRequiredFor?: readonly MainAssistantEscalationType[];
  readonly approvalRationale?: string;
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly capabilityId: AgentCompanyCapabilityId;
  readonly category: AgentCompanyCapabilityCategory;
  readonly description: string;
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
  readonly order: number;
  readonly owner: AgentCompanyRoleId;
  readonly ownerRationale: string;
  readonly riskLevel: AgentCompanyCapabilityRiskLevel;
  readonly supportingRoles?: readonly SupportInput[];
  readonly title: string;
}

export const DEFAULT_AGENT_CAPABILITY_REGISTRY: AgentCompanyCapabilityRegistry =
  deepFreeze({
    capabilities: [
      capability({
        businessValues: ["save_fabio_time", "reduce_risk", "improve_quality"],
        capabilityId: "source-research",
        category: "research",
        description:
          "Prepare source-backed research notes, evidence gaps, and provenance summaries for future planning.",
        futureTool: { compatible: true, toolCategory: "read_only_research" },
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 1,
        owner: "research-agent",
        ownerRationale: "Research Agent owns evidence gathering and source synthesis.",
        riskLevel: "low",
        supportingRoles: [
          support("knowledge-curator", "evidence", "Check scope, provenance, and freshness labels."),
        ],
        title: "Source research",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "competitor-research",
        category: "market_intelligence",
        description:
          "Prepare competitor evidence, positioning observations, and uncertainty labels without contacting competitors.",
        futureTool: { compatible: true, toolCategory: "read_only_research" },
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 2,
        owner: "research-agent",
        ownerRationale: "Research Agent owns market and competitor evidence.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "analysis", "Assess commercial relevance of competitor findings."),
          support("legal-risk-reviewer", "review", "Flag claim-sensitive competitive comparisons."),
        ],
        title: "Competitor research",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "market-trend-mapping",
        category: "market_intelligence",
        description:
          "Prepare market trend maps and opportunity hypotheses with explicit confidence boundaries.",
        futureTool: { compatible: true, toolCategory: "read_only_research" },
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 3,
        owner: "research-agent",
        ownerRationale: "Research Agent owns trend evidence before strategy is formed.",
        riskLevel: "low",
        supportingRoles: [
          support("business-agent", "analysis", "Translate trends into possible business implications."),
        ],
        title: "Market trend mapping",
      }),
      capability({
        businessValues: ["save_fabio_time", "improve_quality"],
        capabilityId: "information-synthesis",
        category: "research",
        description:
          "Prepare concise research synthesis that separates evidence, inference, gaps, and open questions.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["quality"],
        order: 4,
        owner: "research-agent",
        ownerRationale: "Research Agent owns synthesis of permitted information.",
        riskLevel: "low",
        supportingRoles: [
          support("knowledge-curator", "evidence", "Ensure curation-ready source structure."),
        ],
        title: "Information synthesis",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "improve_quality"],
        capabilityId: "offer-design",
        category: "offer_design",
        description:
          "Prepare offer structure, promise, audience, mechanism, proof, and package options for Fabio review.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 5,
        owner: "business-agent",
        ownerRationale: "Business Agent owns offer architecture.",
        riskLevel: "medium",
        supportingRoles: [
          support("content-director", "drafting", "Translate offer direction into content-ready framing."),
          support("finance-cost-analyst", "analysis", "Check pricing and margin assumptions."),
          support("legal-risk-reviewer", "review", "Flag risky claims in the offer."),
        ],
        title: "Offer design",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        capabilityId: "business-model-shaping",
        category: "business_strategy",
        description:
          "Prepare business model options, assumptions, constraints, and validation paths without committing Fabio.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "cost", "quality"],
        order: 6,
        owner: "business-agent",
        ownerRationale: "Business Agent owns strategy synthesis and business model framing.",
        riskLevel: "medium",
        supportingRoles: [
          support("finance-cost-analyst", "analysis", "Review cost and margin implications."),
          support("research-agent", "evidence", "Provide market and customer evidence."),
        ],
        title: "Business model shaping",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "improve_quality"],
        capabilityId: "value-proposition-design",
        category: "business_strategy",
        description:
          "Prepare value proposition options and positioning language for review against evidence and brand direction.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["quality"],
        order: 7,
        owner: "business-agent",
        ownerRationale: "Business Agent owns value proposition structure.",
        riskLevel: "low",
        supportingRoles: [
          support("content-director", "drafting", "Improve message clarity and tone."),
          support("legal-risk-reviewer", "review", "Flag unsupported or sensitive claims."),
        ],
        title: "Value proposition design",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Customer-facing pricing finalization affects money and reputation and requires Fabio approval.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "pricing-strategy-support",
        category: "pricing_support",
        description:
          "Prepare pricing strategy scenarios and hand them to finance review before any customer-facing commitment.",
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "cost", "quality"],
        order: 8,
        owner: "business-agent",
        ownerRationale: "Business Agent owns strategic pricing framing, not final financial approval.",
        riskLevel: "high",
        supportingRoles: [
          support("finance-cost-analyst", "analysis", "Own cost and margin scenario analysis."),
          support("sales-agent", "planning", "Surface sales packaging constraints without committing prices."),
        ],
        title: "Pricing strategy support",
      }),
      capability({
        businessValues: ["save_fabio_time", "reduce_operational_work"],
        capabilityId: "mission-planning-support",
        category: "mission_planning_support",
        description:
          "Prepare safe mission decomposition candidates for future dry-run planning without launching agents.",
        futureWorkflow: { compatible: true, stepType: "mission_planning_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 9,
        owner: "business-agent",
        ownerRationale: "Business Agent owns the business objective framing used by future mission planning.",
        riskLevel: "medium",
        supportingRoles: [
          support("developer-agent", "planning", "Check architecture and execution-boundary constraints."),
          support("knowledge-curator", "evidence", "Identify knowledge needed for the mission."),
        ],
        title: "Mission planning support",
      }),
      capability({
        businessValues: ["improve_quality", "save_fabio_time"],
        capabilityId: "content-strategy",
        category: "content_strategy",
        description:
          "Prepare content strategy, audience angle, channel fit, and message hierarchy without publishing.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 10,
        owner: "content-director",
        ownerRationale: "Content Director owns channel-aware content direction.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "planning", "Ensure content serves the offer and business objective."),
          support("research-agent", "evidence", "Provide source-backed evidence for content claims."),
        ],
        title: "Content strategy",
      }),
      capability({
        businessValues: ["improve_quality", "save_fabio_time"],
        capabilityId: "carousel-structure",
        category: "content_strategy",
        description:
          "Prepare carousel narrative structure, slide purpose, and review notes without creating public posts.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["quality"],
        order: 11,
        owner: "content-director",
        ownerRationale: "Content Director owns content structure before publishing preparation.",
        riskLevel: "low",
        supportingRoles: [
          support("publisher-agent", "planning", "Check future channel formatting constraints."),
        ],
        title: "Carousel structure",
      }),
      capability({
        businessValues: ["improve_quality", "save_fabio_time"],
        capabilityId: "script-direction",
        category: "content_strategy",
        description:
          "Prepare script direction, narrative beats, voice notes, and review criteria for future drafting.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["quality"],
        order: 12,
        owner: "content-director",
        ownerRationale: "Content Director owns script direction and message flow.",
        riskLevel: "low",
        supportingRoles: [
          support("business-agent", "planning", "Keep script direction aligned with offer strategy."),
        ],
        title: "Script direction",
      }),
      capability({
        businessValues: ["improve_quality", "reduce_risk"],
        capabilityId: "tone-message-quality-review",
        category: "content_review",
        description:
          "Prepare tone, clarity, claim, and message-quality review notes before external use.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 13,
        owner: "content-director",
        ownerRationale: "Content Director owns brand and message-quality review readiness.",
        riskLevel: "medium",
        supportingRoles: [
          support("legal-risk-reviewer", "review", "Review claim or compliance-sensitive language."),
        ],
        title: "Tone and message quality review",
      }),
      capability({
        businessValues: ["improve_quality", "reduce_risk"],
        capabilityId: "quality-review-preparation",
        category: "quality_review",
        description:
          "Prepare quality-review checklists and acceptance criteria for output that will later need operator review.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["quality"],
        order: 14,
        owner: "content-director",
        ownerRationale: "Content Director owns quality-review preparation for customer-facing messaging.",
        riskLevel: "medium",
        supportingRoles: [
          support("customer-delivery-agent", "review", "Check delivery-readiness criteria."),
          support("publisher-agent", "planning", "Check publishing-readiness criteria."),
        ],
        title: "Quality review preparation",
      }),
      capability({
        businessValues: ["reduce_operational_work", "reduce_risk"],
        capabilityId: "implementation-planning",
        category: "engineering_planning",
        description:
          "Prepare implementation plans, integration boundaries, and testable engineering steps without changing systems.",
        futureTool: { compatible: true, toolCategory: "engineering_planning" },
        futureWorkflow: { compatible: true, stepType: "implementation_planning_step" },
        guardianDomains: ["operator_safety", "security", "backup", "quality"],
        order: 15,
        owner: "developer-agent",
        ownerRationale: "Developer Agent owns implementation planning and architecture-safe decomposition.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "planning", "Clarify business acceptance criteria."),
          support("knowledge-curator", "evidence", "Surface architecture and integration knowledge."),
        ],
        title: "Implementation planning",
      }),
      capability({
        businessValues: ["reduce_risk", "reduce_operational_work"],
        capabilityId: "technical-architecture-support",
        category: "engineering_planning",
        description:
          "Prepare architecture support notes that preserve provider neutrality, policy, audit, and safety boundaries.",
        futureWorkflow: { compatible: true, stepType: "implementation_planning_step" },
        guardianDomains: ["security", "backup", "quality"],
        order: 16,
        owner: "developer-agent",
        ownerRationale: "Developer Agent owns technical architecture support.",
        riskLevel: "medium",
        supportingRoles: [
          support("legal-risk-reviewer", "review", "Flag compliance-sensitive architecture implications."),
        ],
        title: "Technical architecture support",
      }),
      capability({
        businessValues: ["reduce_operational_work", "reduce_risk"],
        capabilityId: "code-change-planning",
        category: "engineering_planning",
        description:
          "Prepare code-change plans and review boundaries without writing, staging, committing, or executing code.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "implementation_planning_step" },
        guardianDomains: ["security", "backup", "quality"],
        order: 17,
        owner: "developer-agent",
        ownerRationale: "Developer Agent owns safe code-change planning.",
        riskLevel: "medium",
        title: "Code-change planning",
      }),
      capability({
        businessValues: ["improve_quality", "reduce_risk"],
        capabilityId: "test-planning-support",
        category: "engineering_planning",
        description:
          "Prepare deterministic test plans, conformance expectations, and verification checklists.",
        futureWorkflow: { compatible: true, stepType: "implementation_planning_step" },
        guardianDomains: ["quality"],
        order: 18,
        owner: "developer-agent",
        ownerRationale: "Developer Agent owns engineering test planning support.",
        riskLevel: "low",
        title: "Test planning support",
      }),
      capability({
        businessValues: ["improve_quality", "reduce_operational_work"],
        capabilityId: "knowledge-organization",
        category: "knowledge_curation",
        description:
          "Prepare knowledge scopes, tags, provenance labels, and organization recommendations.",
        futureTool: { compatible: true, toolCategory: "knowledge_readiness" },
        futureWorkflow: { compatible: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["security", "quality"],
        order: 19,
        owner: "knowledge-curator",
        ownerRationale: "Knowledge Curator owns curation structure and source hygiene.",
        riskLevel: "low",
        supportingRoles: [
          support("research-agent", "evidence", "Provide source context and evidence quality."),
        ],
        title: "Knowledge organization",
      }),
      capability({
        businessValues: ["reduce_risk", "reduce_operational_work"],
        capabilityId: "memory-classification",
        category: "knowledge_curation",
        description:
          "Prepare memory classification recommendations while leaving durable memory writes to governed runtime boundaries.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 20,
        owner: "knowledge-curator",
        ownerRationale: "Knowledge Curator owns safe memory classification proposals.",
        riskLevel: "medium",
        title: "Memory classification",
      }),
      capability({
        businessValues: ["improve_quality", "reduce_risk"],
        capabilityId: "source-to-knowledge-preparation",
        category: "knowledge_curation",
        description:
          "Prepare source material for future knowledge ingestion with provenance, freshness, and sensitivity labels.",
        futureTool: { compatible: true, toolCategory: "knowledge_readiness" },
        futureWorkflow: { compatible: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["security", "quality"],
        order: 21,
        owner: "knowledge-curator",
        ownerRationale: "Knowledge Curator owns source-to-knowledge preparation.",
        riskLevel: "low",
        supportingRoles: [
          support("research-agent", "evidence", "Validate source context and confidence."),
        ],
        title: "Source-to-knowledge preparation",
      }),
      capability({
        businessValues: ["save_fabio_time", "improve_quality"],
        capabilityId: "retrieval-readiness-support",
        category: "knowledge_curation",
        description:
          "Prepare retrieval-readiness recommendations so future agents can find governed knowledge without exposing raw stores.",
        futureTool: { compatible: true, toolCategory: "knowledge_readiness" },
        futureWorkflow: { compatible: true, stepType: "knowledge_curation_step" },
        guardianDomains: ["quality"],
        order: 22,
        owner: "knowledge-curator",
        ownerRationale: "Knowledge Curator owns retrieval readiness and citable knowledge preparation.",
        riskLevel: "low",
        title: "Retrieval readiness support",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Publishing preparation can lead to public posting and requires Fabio approval before any external path.",
        businessValues: ["help_fabio_make_money", "reduce_operational_work"],
        capabilityId: "publishing-preparation",
        category: "publishing_preparation",
        description:
          "Prepare public-channel publishing proposals, destination assumptions, and readiness checks without posting.",
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
        order: 23,
        owner: "publisher-agent",
        ownerRationale: "Publisher Agent owns publishing preparation, not public execution.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Confirm content direction and quality readiness."),
          support("legal-risk-reviewer", "review", "Review claim-sensitive public language."),
        ],
        title: "Publishing preparation",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Channel formatting prepares public output and must remain approval-gated before external use.",
        businessValues: ["reduce_operational_work", "improve_quality"],
        capabilityId: "channel-formatting",
        category: "publishing_preparation",
        description:
          "Prepare channel-specific formatting notes and checklist outputs without scheduling or posting.",
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
        order: 24,
        owner: "publisher-agent",
        ownerRationale: "Publisher Agent owns platform preparation and handoff details.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Check message structure and channel fit."),
        ],
        title: "Channel formatting",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Publishing checklist output can precede public action and must expose Fabio approval requirements.",
        businessValues: ["reduce_risk", "reduce_operational_work"],
        capabilityId: "publishing-checklist-creation",
        category: "publishing_preparation",
        description:
          "Prepare pre-publication checklist items, review gates, and missing approval markers.",
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "approval_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 25,
        owner: "publisher-agent",
        ownerRationale: "Publisher Agent owns publishing checklist readiness.",
        riskLevel: "high",
        title: "Publishing checklist creation",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Approval-ready publishing handoff affects public reputation and requires explicit Fabio approval.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "approval-ready-publishing-handoff",
        category: "approval_preparation",
        description:
          "Prepare an approval packet for future publishing workflow review, clearly unsent and unposted.",
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
        order: 26,
        owner: "publisher-agent",
        ownerRationale: "Publisher Agent owns approval-ready publishing handoff preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Confirm quality and brand readiness."),
          support("legal-risk-reviewer", "review", "Confirm legal or claim-risk flags are visible."),
        ],
        title: "Approval-ready publishing handoff",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        capabilityId: "sales-strategy",
        category: "sales_planning",
        description:
          "Prepare sales strategy, target assumptions, proposal angles, and objection themes without contacting anyone.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 27,
        owner: "sales-agent",
        ownerRationale: "Sales Agent owns sales planning and proposal strategy.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "planning", "Align sales strategy to offer architecture."),
          support("finance-cost-analyst", "analysis", "Check pricing and margin constraints."),
        ],
        title: "Sales strategy",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Sales outreach affects external relationships and requires explicit Fabio approval before any send path.",
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        capabilityId: "outreach-preparation",
        category: "sales_planning",
        description:
          "Prepare outreach drafts, relationship-sensitive assumptions, and approval notes without sending messages.",
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
        order: 28,
        owner: "sales-agent",
        ownerRationale: "Sales Agent owns outreach preparation, not external communication.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "drafting", "Check tone and message fit."),
          support("legal-risk-reviewer", "review", "Flag risky claims or promises."),
        ],
        title: "Outreach preparation",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        capabilityId: "lead-qualification-planning",
        category: "sales_planning",
        description:
          "Prepare lead qualification criteria, fit hypotheses, and missing-information questions without contacting leads.",
        futureWorkflow: { compatible: true, stepType: "analysis_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 29,
        owner: "sales-agent",
        ownerRationale: "Sales Agent owns sales qualification planning.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "analysis", "Confirm ICP and offer fit assumptions."),
        ],
        title: "Lead qualification planning",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Approval-ready sales handoff may lead to external contact and requires Fabio approval.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "approval-ready-sales-handoff",
        category: "approval_preparation",
        description:
          "Prepare approval packets for future sales outreach or proposal workflows, clearly unsent.",
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
        order: 30,
        owner: "sales-agent",
        ownerRationale: "Sales Agent owns approval-ready sales handoff preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("finance-cost-analyst", "analysis", "Check price and scope assumptions."),
          support("legal-risk-reviewer", "review", "Check claims and relationship-sensitive promises."),
        ],
        title: "Approval-ready sales handoff",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "cost-estimation",
        category: "finance_analysis",
        description:
          "Prepare cost estimates, assumptions, and uncertainty ranges without authorizing spend.",
        futureTool: { compatible: true, guardianSensitive: true, toolCategory: "finance_analysis" },
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "analysis_step" },
        guardianDomains: ["cost", "quality"],
        order: 31,
        owner: "finance-cost-analyst",
        ownerRationale: "Finance / Cost Analyst owns cost estimation analysis.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "analysis", "Connect costs to business model assumptions."),
        ],
        title: "Cost estimation",
      }),
      capability({
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "roi-analysis",
        category: "finance_analysis",
        description:
          "Prepare ROI scenarios, sensitivity notes, and missing-data warnings without investment advice.",
        futureTool: { compatible: true, guardianSensitive: true, toolCategory: "finance_analysis" },
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "analysis_step" },
        guardianDomains: ["cost", "quality"],
        order: 32,
        owner: "finance-cost-analyst",
        ownerRationale: "Finance / Cost Analyst owns ROI scenario analysis.",
        riskLevel: "medium",
        supportingRoles: [
          support("business-agent", "analysis", "Check strategic relevance of ROI assumptions."),
        ],
        title: "ROI analysis",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Budget-impact outputs can affect money decisions and require Fabio approval before any budget change.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "budget-impact-review",
        category: "finance_analysis",
        description:
          "Prepare budget impact review, constraints, and escalation notes without changing budgets.",
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "finance_analysis",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "cost", "quality"],
        order: 33,
        owner: "finance-cost-analyst",
        ownerRationale: "Finance / Cost Analyst owns budget-impact analysis, not budget changes.",
        riskLevel: "high",
        supportingRoles: [
          support("business-agent", "analysis", "Connect budget impact to business tradeoffs."),
        ],
        title: "Budget impact review",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Customer-facing pricing economics can affect money and external relationships and needs Fabio approval before finalization.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "pricing-economics-support",
        category: "pricing_support",
        description:
          "Prepare pricing economics, margin sensitivity, and assumption labels without final price commitment.",
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "finance_analysis",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "cost", "quality"],
        order: 34,
        owner: "finance-cost-analyst",
        ownerRationale: "Finance / Cost Analyst owns pricing economics support.",
        riskLevel: "high",
        supportingRoles: [
          support("sales-agent", "planning", "Surface sales packaging needs without committing prices."),
        ],
        title: "Pricing economics support",
      }),
      capability({
        businessValues: ["reduce_risk", "improve_quality"],
        capabilityId: "risk-identification",
        category: "legal_risk_review",
        description:
          "Prepare risk flags, uncertainty labels, and escalation recommendations without giving binding advice.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 35,
        owner: "legal-risk-reviewer",
        ownerRationale: "Legal / Risk Reviewer owns risk identification.",
        riskLevel: "medium",
        supportingRoles: [
          support("research-agent", "evidence", "Provide evidence context for risk review."),
        ],
        title: "Risk identification",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect"],
        approvalRationale:
          "Compliance-sensitive output can affect legal exposure and requires Fabio approval before external use.",
        businessValues: ["reduce_risk", "improve_quality"],
        capabilityId: "compliance-sensitive-review",
        category: "legal_risk_review",
        description:
          "Prepare compliance-sensitive review notes and escalation flags without replacing professional advice.",
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "security", "quality"],
        order: 36,
        owner: "legal-risk-reviewer",
        ownerRationale: "Legal / Risk Reviewer owns compliance-sensitive review preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Check claim language and message context."),
        ],
        title: "Compliance-sensitive review",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Claim risk review protects Fabio's reputation and requires approval before external use.",
        businessValues: ["reduce_risk", "improve_quality"],
        capabilityId: "claim-risk-review",
        category: "legal_risk_review",
        description:
          "Prepare claim risk review notes, unsupported-claim flags, and safer-language recommendations.",
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "review_step",
        },
        guardianDomains: ["operator_safety", "quality"],
        order: 37,
        owner: "legal-risk-reviewer",
        ownerRationale: "Legal / Risk Reviewer owns claim-risk review preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("research-agent", "evidence", "Check evidence support for claims."),
        ],
        title: "Claim risk review",
      }),
      capability({
        businessValues: ["reduce_risk", "save_fabio_time"],
        capabilityId: "legal-escalation-recommendation",
        category: "legal_risk_review",
        description:
          "Prepare recommendations for when Fabio should seek qualified legal, tax, accounting, or compliance review.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["operator_safety", "quality"],
        order: 38,
        owner: "legal-risk-reviewer",
        ownerRationale: "Legal / Risk Reviewer owns escalation recommendation preparation.",
        riskLevel: "medium",
        title: "Legal escalation recommendation",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Approval preparation concerns actions that may affect reputation, money, legal exposure, or external relationships.",
        businessValues: ["reduce_risk", "save_fabio_time"],
        capabilityId: "approval-preparation",
        category: "approval_preparation",
        description:
          "Prepare operator approval packets, risk summaries, and decision gates without granting approval itself.",
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
        guardianDomains: ["operator_safety", "quality"],
        order: 39,
        owner: "legal-risk-reviewer",
        ownerRationale: "Legal / Risk Reviewer owns risk-aware approval preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("publisher-agent", "planning", "Provide publishing approval details."),
          support("sales-agent", "planning", "Provide sales approval details."),
          support("customer-delivery-agent", "planning", "Provide delivery approval details."),
        ],
        title: "Approval preparation",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Customer delivery can affect external relationships and requires Fabio approval before sending or delivery.",
        businessValues: ["help_fabio_make_money", "improve_quality"],
        capabilityId: "delivery-preparation",
        category: "customer_delivery_preparation",
        description:
          "Prepare delivery plans, artifact outlines, and missing-input questions without sending deliverables.",
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "customer_delivery_preparation",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "handoff_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "backup", "quality"],
        order: 40,
        owner: "customer-delivery-agent",
        ownerRationale: "Customer Delivery Agent owns delivery preparation, not external sending.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Check deliverable clarity and quality."),
          support("legal-risk-reviewer", "review", "Flag claim or relationship-sensitive risks."),
        ],
        title: "Delivery preparation",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Client handoff material affects customer relationships and requires Fabio approval before external use.",
        businessValues: ["help_fabio_make_money", "reduce_operational_work"],
        capabilityId: "client-handoff-preparation",
        category: "customer_delivery_preparation",
        description:
          "Prepare client handoff summaries, acceptance notes, and review markers without external delivery.",
        futureTool: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          toolCategory: "customer_delivery_preparation",
        },
        futureWorkflow: {
          approvalSensitive: true,
          compatible: true,
          guardianSensitive: true,
          stepType: "handoff_preparation_step",
        },
        guardianDomains: ["operator_safety", "security", "backup", "quality"],
        order: 41,
        owner: "customer-delivery-agent",
        ownerRationale: "Customer Delivery Agent owns client handoff preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("sales-agent", "planning", "Connect handoff to promise and scope."),
          support("legal-risk-reviewer", "review", "Flag customer-sensitive obligations."),
        ],
        title: "Client handoff preparation",
      }),
      capability({
        businessValues: ["reduce_operational_work", "improve_quality"],
        capabilityId: "fulfillment-checklist",
        category: "customer_delivery_preparation",
        description:
          "Prepare fulfillment checklist items, dependencies, and quality gates before any customer-facing delivery.",
        futureWorkflow: { compatible: true, guardianSensitive: true, stepType: "review_step" },
        guardianDomains: ["backup", "quality"],
        order: 42,
        owner: "customer-delivery-agent",
        ownerRationale: "Customer Delivery Agent owns fulfillment checklist preparation.",
        riskLevel: "medium",
        supportingRoles: [
          support("developer-agent", "planning", "Check technical delivery constraints where relevant."),
        ],
        title: "Fulfillment checklist",
      }),
      capability({
        approvalRequired: true,
        approvalRequiredFor: ["external_side_effect", "publish_or_send"],
        approvalRationale:
          "Approval-ready delivery packages may be sent to clients only after explicit Fabio approval.",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        capabilityId: "approval-ready-delivery-package",
        category: "approval_preparation",
        description:
          "Prepare an approval-ready customer delivery package that remains internal until Fabio approves external use.",
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
        guardianDomains: ["operator_safety", "security", "backup", "quality"],
        order: 43,
        owner: "customer-delivery-agent",
        ownerRationale: "Customer Delivery Agent owns approval-ready delivery package preparation.",
        riskLevel: "high",
        supportingRoles: [
          support("content-director", "review", "Check communication quality."),
          support("legal-risk-reviewer", "review", "Check risk and obligation flags."),
        ],
        title: "Approval-ready delivery package",
      }),
    ],
    contractVersion: AGENT_CAPABILITY_REGISTRY_CONTRACT_VERSION,
    nonExecuting: true,
    registryId: DEFAULT_AGENT_CAPABILITY_REGISTRY_ID,
  });

function capability(input: CapabilityInput): AgentCompanyCapability {
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
              "This capability is approval-sensitive and requires Fabio before external or risky use.",
            requiredFor: input.approvalRequiredFor ?? ["external_side_effect"],
          },
        ]
      : [],
    businessValues: input.businessValues,
    capabilityId: input.capabilityId,
    category: input.category,
    description: input.description,
    executionMode: "non_executing_declaration",
    forbiddenAsDirectPermission: true,
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
                "Guardian consultation is required before this capability informs risky future orchestration.",
            },
          ]
        : [],
    order: input.order,
    primaryOwners: [primary(input.owner, input.ownerRationale)],
    riskLevel: input.riskLevel,
    supportingRoles: sortSupportRoles(input.supportingRoles ?? []).map((entry) =>
      support(entry.agentId, entry.supportType, entry.rationale),
    ),
    title: input.title,
  };
}

function futureWorkflow(
  input: CapabilityInput["futureWorkflow"],
): AgentCompanyCapabilityFutureWorkflowMapping {
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
  input: CapabilityInput["futureTool"],
): AgentCompanyCapabilityFutureToolMapping {
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

function primary(
  agentId: AgentCompanyRoleId,
  rationale: string,
): AgentCompanyCapabilityOwner {
  const role = roleById(agentId);
  return {
    agentId,
    ownership: "accountable",
    rationale,
    specificationId: role.futureAgentSpecification.specificationId,
    version: role.futureAgentSpecification.version,
  };
}

function support(
  agentId: AgentCompanyRoleId,
  supportType: AgentCompanyCapabilitySupportType,
  rationale: string,
): AgentCompanyCapabilitySupportRole {
  const role = roleById(agentId);
  return {
    agentId,
    rationale,
    specificationId: role.futureAgentSpecification.specificationId,
    supportType,
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

function sortSupportRoles(
  roles: readonly SupportInput[],
): readonly SupportInput[] {
  return [...roles].sort(
    (left, right) =>
      roleOrder(left.agentId) - roleOrder(right.agentId),
  );
}

function roleOrder(agentId: AgentCompanyRoleId): number {
  return DEFAULT_AGENT_COMPANY_MAP.roles.findIndex(
    (role) => role.roleId === agentId,
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
