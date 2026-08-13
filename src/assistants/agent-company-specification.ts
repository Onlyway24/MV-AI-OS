import type { AgentStatus } from "../agents/agent-manifest.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type {
  MainAssistantEscalationType,
  MainAssistantForbiddenCapability,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

export const AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION = "1" as const;
export const DEFAULT_AGENT_COMPANY_MAP_ID = "agent-company-map@1.0.0" as const;

export type AgentCompanyBusinessValue =
  | "help_fabio_make_money"
  | "improve_quality"
  | "reduce_operational_work"
  | "reduce_risk"
  | "save_fabio_time";

export type AgentCompanyDepartment =
  | "business_growth"
  | "content_and_delivery"
  | "control_and_risk"
  | "knowledge_and_research"
  | "technical_operations";

export type AgentCompanyRolePriority = "core" | "supporting";

export type AgentCompanyRoleCategory =
  | "business"
  | "content"
  | "customer_delivery"
  | "finance"
  | "knowledge"
  | "legal_risk"
  | "publishing"
  | "research"
  | "sales"
  | "technical";

export type AgentCompanyRoleId =
  | "business-agent"
  | "content-director"
  | "customer-delivery-agent"
  | "developer-agent"
  | "finance-cost-analyst"
  | "knowledge-curator"
  | "legal-risk-reviewer"
  | "publisher-agent"
  | "research-agent"
  | "sales-agent";

export type AgentCompanyForbiddenCapability =
  | MainAssistantForbiddenCapability
  | "autonomous_customer_delivery"
  | "autonomous_legal_or_financial_advice"
  | "autonomous_outreach"
  | "autonomous_publishing"
  | "direct_agent_invocation"
  | "durable_memory_mutation"
  | "raw_knowledge_exposure"
  | "raw_memory_exposure"
  | "workflow_execution";

export interface AgentCompanyRoleBoundary {
  readonly nonResponsibilities: readonly string[];
  readonly responsibilities: readonly string[];
}

export interface AgentCompanyApprovalRequirement {
  readonly approvalId: string;
  readonly requiredFor: readonly MainAssistantEscalationType[];
  readonly rationale: string;
}

export interface AgentCompanySpecificationMapping {
  readonly agentId: string;
  readonly expectedStatus: AgentStatus;
  readonly specificationId: string;
  readonly version: string;
}

export interface AgentCompanyMemoryRequirement {
  readonly categories: readonly string[];
  readonly purpose: string;
}

export interface AgentCompanyKnowledgeRequirement {
  readonly purpose: string;
  readonly scopes: readonly string[];
}

export interface AgentCompanyRole {
  readonly approvalRequirements: readonly AgentCompanyApprovalRequirement[];
  readonly boundaries: AgentCompanyRoleBoundary;
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly category: AgentCompanyRoleCategory;
  readonly controlPlaneDependencies: readonly MainAssistantSafetyDomain[];
  readonly department: AgentCompanyDepartment;
  readonly displayName: string;
  readonly forbiddenCapabilities: readonly AgentCompanyForbiddenCapability[];
  readonly futureAgentSpecification: AgentCompanySpecificationMapping;
  readonly knowledgeRequirements: readonly AgentCompanyKnowledgeRequirement[];
  readonly memoryRequirements: readonly AgentCompanyMemoryRequirement[];
  readonly operatorFacingPurpose: string;
  readonly priority: AgentCompanyRolePriority;
  readonly roleId: AgentCompanyRoleId;
}

export interface AgentCompanyMap {
  readonly assistantId: "only-way-assistant";
  readonly contractVersion: RequestContractVersion;
  readonly departments: readonly AgentCompanyDepartment[];
  readonly globalForbiddenCapabilities: readonly AgentCompanyForbiddenCapability[];
  readonly mapId: string;
  readonly nonExecuting: true;
  readonly roles: readonly AgentCompanyRole[];
}

export class AgentCompanySpecificationValidationError extends Error {
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

const DEFAULT_ROLE_FORBIDDEN_CAPABILITIES: readonly AgentCompanyForbiddenCapability[] =
  [
    "autonomous_background_execution",
    "autonomous_customer_delivery",
    "autonomous_destructive_action",
    "autonomous_legal_or_financial_advice",
    "autonomous_outreach",
    "autonomous_publishing",
    "bypass_core_brain",
    "bypass_guardians",
    "bypass_policy",
    "direct_agent_invocation",
    "direct_browser_control",
    "direct_database_mutation",
    "direct_email_calendar_social_posting",
    "direct_filesystem_mutation",
    "direct_n8n_execution",
    "direct_provider_call",
    "direct_secret_reading",
    "direct_tool_execution",
    "durable_memory_mutation",
    "publishing_without_approval",
    "raw_knowledge_exposure",
    "raw_memory_exposure",
    "spending_without_budget_limits",
    "workflow_execution",
  ];

export const DEFAULT_AGENT_COMPANY_MAP: AgentCompanyMap = deepFreeze({
  assistantId: "only-way-assistant",
  contractVersion: AGENT_COMPANY_SPECIFICATION_CONTRACT_VERSION,
  departments: [
    "knowledge_and_research",
    "business_growth",
    "content_and_delivery",
    "technical_operations",
    "control_and_risk",
  ],
  globalForbiddenCapabilities: DEFAULT_ROLE_FORBIDDEN_CAPABILITIES,
  mapId: DEFAULT_AGENT_COMPANY_MAP_ID,
  nonExecuting: true,
  roles: [
    createRole({
      businessValues: ["save_fabio_time", "reduce_risk", "improve_quality"],
      category: "research",
      controlPlaneDependencies: ["operator_safety", "security", "quality"],
      department: "knowledge_and_research",
      displayName: "Research Agent",
      futureAgentId: "research-agent",
      knowledgeScopes: ["market", "products", "competitors", "sources"],
      memoryCategories: ["semantic"],
      operatorFacingPurpose:
        "Prepare grounded research briefs so Fabio can decide from evidence instead of scattered notes.",
      priority: "core",
      responsibilities: [
        "Synthesize permitted market, competitor, product, and topic knowledge.",
        "Identify evidence gaps and stale sources before recommendations are made.",
        "Prepare source-backed briefs for business, finance, content, and review roles.",
      ],
      roleId: "research-agent",
    }),
    createRole({
      businessValues: [
        "help_fabio_make_money",
        "save_fabio_time",
        "improve_quality",
      ],
      category: "business",
      controlPlaneDependencies: ["operator_safety", "cost", "quality"],
      department: "business_growth",
      displayName: "Business Agent",
      futureAgentId: "business-agent",
      knowledgeScopes: ["offers", "brand", "market", "products"],
      memoryCategories: ["semantic", "user"],
      operatorFacingPurpose:
        "Turn objectives and research into offers, positioning, and validation plans.",
      priority: "core",
      responsibilities: [
        "Create offer architecture, positioning, and business model drafts.",
        "Label assumptions and route pricing or margin questions to finance review.",
        "Translate research into practical next business decisions for Fabio.",
      ],
      roleId: "business-agent",
    }),
    createRole({
      businessValues: ["improve_quality", "save_fabio_time"],
      category: "content",
      controlPlaneDependencies: ["operator_safety", "quality"],
      department: "content_and_delivery",
      displayName: "Content Director",
      futureAgentId: "content-director",
      knowledgeScopes: ["brand", "voice-profile", "offers", "channels"],
      memoryCategories: ["semantic", "user"],
      operatorFacingPurpose:
        "Coordinate on-brand content direction before assets are drafted or reviewed.",
      priority: "core",
      responsibilities: [
        "Translate business objectives into content briefs and asset direction.",
        "Keep content aligned with Fabio's brand, voice profile, offer, and channel.",
        "Prepare review-ready content direction without publishing or sending.",
      ],
      roleId: "content-director",
    }),
    createRole({
      businessValues: ["reduce_operational_work", "reduce_risk"],
      category: "technical",
      controlPlaneDependencies: [
        "operator_safety",
        "security",
        "backup",
        "quality",
      ],
      department: "technical_operations",
      displayName: "Developer Agent",
      futureAgentId: "developer-agent",
      knowledgeScopes: ["architecture", "integrations", "n8n-catalog", "tools-catalog"],
      memoryCategories: ["operational"],
      operatorFacingPurpose:
        "Prepare technical specifications and automation designs without executing tools or changing systems.",
      priority: "supporting",
      responsibilities: [
        "Convert approved automation needs into engineering specifications.",
        "Preserve MV AI OS architecture, policy, audit, and provider-neutrality rules.",
        "Identify implementation risks before runtime or tool capabilities expand.",
      ],
      roleId: "developer-agent",
    }),
    createRole({
      approvalRequirements: [
        approval(
          "approve-external-side-effects",
          ["external_side_effect", "publish_or_send"],
          "Publishing, scheduling, or sending content affects Fabio's public reputation and requires explicit approval.",
        ),
      ],
      businessValues: ["help_fabio_make_money", "reduce_operational_work"],
      category: "publishing",
      controlPlaneDependencies: ["operator_safety", "security", "quality"],
      department: "content_and_delivery",
      displayName: "Publisher Agent",
      futureAgentId: "publisher-agent",
      knowledgeScopes: ["channels", "campaigns", "claims-policy"],
      memoryCategories: ["operational"],
      operatorFacingPurpose:
        "Prepare publish or delivery proposals only after review and approval gates are satisfied.",
      priority: "supporting",
      responsibilities: [
        "Prepare platform-specific publishing plans and delivery checklists.",
        "Verify that review and approval markers are present before proposing delivery.",
        "Keep publishing as a proposal until a future approved workflow executes it.",
      ],
      roleId: "publisher-agent",
    }),
    createRole({
      businessValues: ["reduce_risk", "reduce_operational_work", "improve_quality"],
      category: "knowledge",
      controlPlaneDependencies: ["operator_safety", "security", "quality"],
      department: "knowledge_and_research",
      displayName: "Knowledge Curator",
      futureAgentId: "knowledge-curator",
      knowledgeScopes: ["general", "sources", "operations", "claims-policy"],
      memoryCategories: ["semantic", "operational"],
      operatorFacingPurpose:
        "Keep source material organized, scoped, fresh, and useful without polluting memory.",
      priority: "supporting",
      responsibilities: [
        "Propose scopes, tags, provenance, freshness, and curation improvements.",
        "Flag stale, duplicate, low-confidence, or sensitive knowledge records.",
        "Preserve the distinction between citable knowledge and approved memory.",
      ],
      roleId: "knowledge-curator",
    }),
    createRole({
      approvalRequirements: [
        approval(
          "approve-external-side-effects",
          ["external_side_effect", "publish_or_send"],
          "Sales outreach, proposal sending, and client communication require explicit operator approval.",
        ),
      ],
      businessValues: ["help_fabio_make_money", "save_fabio_time"],
      category: "sales",
      controlPlaneDependencies: ["operator_safety", "security", "quality"],
      department: "business_growth",
      displayName: "Sales Agent",
      futureAgentId: "sales-agent",
      knowledgeScopes: ["offers", "brand", "case-studies", "pricing", "clients"],
      memoryCategories: ["semantic", "user"],
      operatorFacingPurpose:
        "Prepare sales proposals and outreach drafts without sending or contacting anyone.",
      priority: "core",
      responsibilities: [
        "Draft proposal structures, objection handling, and outreach variants.",
        "Keep claims grounded in approved knowledge and case studies.",
        "Request review and explicit approval before any external send path.",
      ],
      roleId: "sales-agent",
    }),
    createRole({
      businessValues: ["help_fabio_make_money", "reduce_risk"],
      category: "finance",
      controlPlaneDependencies: ["operator_safety", "cost", "quality"],
      department: "control_and_risk",
      displayName: "Finance / Cost Analyst",
      futureAgentId: "finance-cost-analyst",
      knowledgeScopes: ["pricing", "costs", "offers", "operations"],
      memoryCategories: ["semantic", "operational"],
      operatorFacingPurpose:
        "Analyze pricing, margins, budgets, and cost scenarios before Fabio commits money.",
      priority: "core",
      responsibilities: [
        "Prepare unit-economics, margin, pricing, and budget scenarios.",
        "Label assumptions and missing inputs before financial recommendations are used.",
        "Support cost-aware decisions without moving money or inventing prices.",
      ],
      roleId: "finance-cost-analyst",
    }),
    createRole({
      businessValues: ["reduce_risk", "improve_quality"],
      category: "legal_risk",
      controlPlaneDependencies: ["operator_safety", "security", "quality"],
      department: "control_and_risk",
      displayName: "Legal / Risk Reviewer",
      futureAgentId: "legal-risk-reviewer",
      knowledgeScopes: ["claims-policy", "legal-lite", "brand"],
      memoryCategories: ["semantic"],
      operatorFacingPurpose:
        "Flag claim, compliance, and risk issues without replacing professional legal advice.",
      priority: "supporting",
      responsibilities: [
        "Review claims, disclaimers, and risk language against approved policy.",
        "Identify when Fabio needs professional legal, tax, or accounting input.",
        "Prevent unsupported or high-risk claims from reaching customer-facing output.",
      ],
      roleId: "legal-risk-reviewer",
    }),
    createRole({
      approvalRequirements: [
        approval(
          "approve-external-side-effects",
          ["external_side_effect", "publish_or_send"],
          "Customer delivery can affect real relationships and must not happen without explicit approval.",
        ),
      ],
      businessValues: [
        "help_fabio_make_money",
        "reduce_operational_work",
        "improve_quality",
      ],
      category: "customer_delivery",
      controlPlaneDependencies: ["operator_safety", "security", "backup", "quality"],
      department: "content_and_delivery",
      displayName: "Customer Delivery Agent",
      futureAgentId: "customer-delivery-agent",
      knowledgeScopes: ["clients", "offers", "case-studies", "operations"],
      memoryCategories: ["operational", "semantic"],
      operatorFacingPurpose:
        "Prepare client delivery plans and artifacts without contacting clients or mutating customer systems.",
      priority: "supporting",
      responsibilities: [
        "Prepare delivery checklists, client artifact plans, and handoff summaries.",
        "Surface missing approvals or client-sensitive risks before delivery.",
        "Keep customer delivery as a proposal until approved workflow execution exists.",
      ],
      roleId: "customer-delivery-agent",
    }),
  ],
});

function createRole(input: {
  readonly approvalRequirements?: readonly AgentCompanyApprovalRequirement[];
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly category: AgentCompanyRoleCategory;
  readonly controlPlaneDependencies: readonly MainAssistantSafetyDomain[];
  readonly department: AgentCompanyDepartment;
  readonly displayName: string;
  readonly futureAgentId: string;
  readonly knowledgeScopes: readonly string[];
  readonly memoryCategories: readonly string[];
  readonly operatorFacingPurpose: string;
  readonly priority: AgentCompanyRolePriority;
  readonly responsibilities: readonly string[];
  readonly roleId: AgentCompanyRoleId;
}): AgentCompanyRole {
  return {
    approvalRequirements: input.approvalRequirements ?? [],
    boundaries: {
      nonResponsibilities: [
        "Do not execute agents, workflows, tools, models, providers, network calls, or external communications.",
        "Do not mutate memory, knowledge, files, backups, runtime state, customer systems, or external systems.",
        "Do not bypass Onlyway Assistant, Core Brain, policy, guardians, approvals, budget, security, quality, or audit.",
      ],
      responsibilities: input.responsibilities,
    },
    businessValues: input.businessValues,
    category: input.category,
    controlPlaneDependencies: input.controlPlaneDependencies,
    department: input.department,
    displayName: input.displayName,
    forbiddenCapabilities: DEFAULT_ROLE_FORBIDDEN_CAPABILITIES,
    futureAgentSpecification: {
      agentId: input.futureAgentId,
      expectedStatus: "experimental",
      specificationId: `${input.futureAgentId}@1.0.0`,
      version: "1.0.0",
    },
    knowledgeRequirements: [
      {
        purpose: "Retrieve only permitted source material with provenance for this role.",
        scopes: input.knowledgeScopes,
      },
    ],
    memoryRequirements: [
      {
        categories: input.memoryCategories,
        purpose:
          "Use only policy-permitted memory excerpts needed for the current operator objective.",
      },
    ],
    operatorFacingPurpose: input.operatorFacingPurpose,
    priority: input.priority,
    roleId: input.roleId,
  };
}

function approval(
  approvalId: string,
  requiredFor: readonly MainAssistantEscalationType[],
  rationale: string,
): AgentCompanyApprovalRequirement {
  return {
    approvalId,
    rationale,
    requiredFor,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  Object.freeze(value);

  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }

  return value;
}
