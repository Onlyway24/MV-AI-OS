import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyBusinessValue,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";

export const INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION = "1" as const;
export const DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX_ID =
  "inter-agent-responsibility-matrix@1.0.0" as const;

export type ResponsibilityAreaId =
  | "business-strategy"
  | "content-direction"
  | "content-review"
  | "customer-delivery-preparation"
  | "finance-cost-analysis"
  | "implementation-planning"
  | "knowledge-curation"
  | "legal-risk-review"
  | "market-analysis"
  | "offer-design"
  | "pricing-support"
  | "publishing-preparation"
  | "research"
  | "sales-planning";

export type ResponsibilityDecisionPoint =
  | "external-action"
  | "final-output"
  | "operator-approval"
  | "planning"
  | "review";

export type ResponsibilityApprovalKind =
  | "operator-approval-required"
  | "specialist-review-required";

export type ResponsibilityConflictSeverity = "blocking" | "warning";

export interface ResponsibilityMatrixRole {
  readonly agentId: AgentCompanyRoleId;
  readonly displayName: string;
  readonly specificationId: string;
  readonly version: string;
}

export interface ResponsibilityRoleReference {
  readonly agentId: AgentCompanyRoleId;
  readonly rationale: string;
  readonly specificationId: string;
  readonly version: string;
}

export interface PrimaryOwner extends ResponsibilityRoleReference {
  readonly ownership: "accountable";
}

export interface SupportingRole extends ResponsibilityRoleReference {
  readonly supportType: "analysis" | "drafting" | "evidence" | "planning";
}

export interface ConsultedRole extends ResponsibilityRoleReference {
  readonly requiredBefore: readonly ResponsibilityDecisionPoint[];
}

export interface ApprovalRole extends ResponsibilityRoleReference {
  readonly approvalKind: ResponsibilityApprovalKind;
  readonly requiredBefore: readonly ResponsibilityDecisionPoint[];
}

export interface ForbiddenRole extends ResponsibilityRoleReference {
  readonly forbiddenReason: string;
}

export interface ResponsibilityConflict {
  readonly conflictId: string;
  readonly description: string;
  readonly involvedAgentIds: readonly AgentCompanyRoleId[];
  readonly resolution: string;
  readonly severity: ResponsibilityConflictSeverity;
}

export interface ResponsibilityArea {
  readonly approvalRequired: boolean;
  readonly approvalRoles: readonly ApprovalRole[];
  readonly areaId: ResponsibilityAreaId;
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly conflicts: readonly ResponsibilityConflict[];
  readonly consultedRoles: readonly ConsultedRole[];
  readonly description: string;
  readonly externalAction: boolean;
  readonly forbiddenRoles: readonly ForbiddenRole[];
  readonly order: number;
  readonly primaryOwners: readonly PrimaryOwner[];
  readonly supportingRoles: readonly SupportingRole[];
  readonly title: string;
}

export interface ResponsibilityMatrix {
  readonly areas: readonly ResponsibilityArea[];
  readonly contractVersion: typeof INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION;
  readonly matrixId: string;
  readonly nonExecuting: true;
  readonly roles: readonly ResponsibilityMatrixRole[];
}

export const DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX: ResponsibilityMatrix =
  deepFreeze({
    areas: [
      area({
        areaId: "research",
        businessValues: ["save_fabio_time", "reduce_risk", "improve_quality"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Review claim-sensitive research boundaries."),
        ],
        description:
          "Own evidence gathering, source synthesis, and research gap identification.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publishing roles must not own research conclusions."),
          forbidden("customer-delivery-agent", "Delivery roles must not own source research."),
        ],
        order: 1,
        primaryOwner: primary("research-agent", "Research Agent owns source-backed research."),
        supportingRoles: [
          support("business-agent", "planning", "Translate research needs into business questions."),
          support("knowledge-curator", "evidence", "Surface citable knowledge scopes and source hygiene."),
        ],
        title: "Research",
      }),
      area({
        areaId: "market-analysis",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag regulated or claim-sensitive market conclusions."),
        ],
        conflicts: [
          conflict({
            conflictId: "market-analysis-vs-offer-design",
            description:
              "Research can identify opportunities, but Business Agent owns offer decisions.",
            involvedAgentIds: ["research-agent", "business-agent"],
            resolution:
              "Research Agent owns market evidence; Business Agent owns offer interpretation.",
          }),
        ],
        description:
          "Own market, competitor, product, and opportunity analysis before business decisions.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own market evidence."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own market evidence."),
        ],
        order: 2,
        primaryOwner: primary("research-agent", "Research Agent owns market analysis evidence."),
        supportingRoles: [
          support("business-agent", "analysis", "Assess commercial relevance of market findings."),
          support("finance-cost-analyst", "analysis", "Surface cost or margin implications where known."),
        ],
        title: "Market analysis",
      }),
      area({
        areaId: "business-strategy",
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag material legal or compliance risk in strategy."),
        ],
        description:
          "Own positioning, business model direction, and founder/operator strategic recommendations.",
        order: 3,
        primaryOwner: primary("business-agent", "Business Agent owns strategy synthesis."),
        supportingRoles: [
          support("research-agent", "evidence", "Provide market and competitor evidence."),
          support("finance-cost-analyst", "analysis", "Provide cost and pricing constraints."),
        ],
        title: "Business strategy",
      }),
      area({
        areaId: "offer-design",
        businessValues: ["help_fabio_make_money", "improve_quality"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Review risky claims and compliance-sensitive language."),
        ],
        conflicts: [
          conflict({
            conflictId: "offer-design-vs-pricing",
            description:
              "Business Agent can design offers, but Finance / Cost Analyst owns pricing analysis.",
            involvedAgentIds: ["business-agent", "finance-cost-analyst"],
            resolution:
              "Business Agent owns offer structure; Finance / Cost Analyst owns cost and pricing support.",
          }),
        ],
        description:
          "Own promise, audience, mechanism, proof, packaging, and offer structure.",
        order: 4,
        primaryOwner: primary("business-agent", "Business Agent owns offer architecture."),
        supportingRoles: [
          support("content-director", "drafting", "Translate offer direction into content-ready framing."),
          support("sales-agent", "planning", "Assess proposal and objection implications."),
          support("finance-cost-analyst", "analysis", "Validate margin and pricing assumptions."),
        ],
        title: "Offer design",
      }),
      area({
        areaId: "pricing-support",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag financial, tax, accounting, or compliance-sensitive concerns."),
        ],
        description:
          "Own pricing scenarios, margin assumptions, budget implications, and cost constraints.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own pricing or budget analysis."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own pricing or budget analysis."),
        ],
        order: 5,
        primaryOwner: primary("finance-cost-analyst", "Finance / Cost Analyst owns pricing support."),
        supportingRoles: [
          support("business-agent", "analysis", "Connect pricing support to offer strategy."),
          support("sales-agent", "planning", "Surface sales-package constraints without committing prices."),
        ],
        title: "Pricing support",
      }),
      area({
        areaId: "content-direction",
        businessValues: ["improve_quality", "save_fabio_time"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Review claim-sensitive content direction."),
        ],
        description:
          "Own briefs, brand alignment, voice direction, and content asset framing.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent prepares publishing but must not own content direction."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own content direction."),
        ],
        order: 6,
        primaryOwner: primary("content-director", "Content Director owns content direction."),
        supportingRoles: [
          support("research-agent", "evidence", "Provide source-backed facts for content briefs."),
          support("business-agent", "planning", "Ensure content supports the offer and objective."),
          support("sales-agent", "analysis", "Surface sales objections and customer language."),
        ],
        title: "Content direction",
      }),
      area({
        approvalRoles: [
          approval("legal-risk-reviewer", "specialist-review-required", "Review claims and compliance-sensitive content before external use."),
        ],
        areaId: "content-review",
        businessValues: ["improve_quality", "reduce_risk"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Review claims, disclaimers, and compliance-sensitive content."),
        ],
        description:
          "Own pre-publication content review for brand, clarity, quality, and review readiness.",
        order: 7,
        primaryOwner: primary("content-director", "Content Director owns content review readiness."),
        supportingRoles: [
          support("publisher-agent", "planning", "Check channel-readiness after content review."),
        ],
        title: "Content review",
      }),
      area({
        areaId: "implementation-planning",
        businessValues: ["reduce_operational_work", "reduce_risk"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag compliance-sensitive implementation risks."),
        ],
        description:
          "Own technical planning, automation design, adapter boundaries, and implementation risk notes.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own implementation planning."),
          forbidden("sales-agent", "Sales Agent must not own implementation planning."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own implementation planning."),
        ],
        order: 8,
        primaryOwner: primary("developer-agent", "Developer Agent owns implementation planning."),
        supportingRoles: [
          support("knowledge-curator", "evidence", "Provide architecture and integration knowledge references."),
        ],
        title: "Implementation planning",
      }),
      area({
        areaId: "knowledge-curation",
        businessValues: ["reduce_operational_work", "reduce_risk", "improve_quality"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag sensitive or unsafe knowledge material."),
        ],
        description:
          "Own source organization, scope hygiene, provenance, freshness, and curation recommendations.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own raw knowledge curation."),
          forbidden("sales-agent", "Sales Agent must not own raw knowledge curation."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own raw knowledge curation."),
        ],
        order: 9,
        primaryOwner: primary("knowledge-curator", "Knowledge Curator owns source and scope hygiene."),
        supportingRoles: [
          support("research-agent", "evidence", "Identify evidence gaps and stale sources."),
          support("developer-agent", "planning", "Connect curation requirements to technical import boundaries."),
        ],
        title: "Knowledge curation",
      }),
      area({
        approvalRequired: true,
        approvalRoles: [
          approval("content-director", "specialist-review-required", "Confirm asset readiness before publish proposal."),
          approval("legal-risk-reviewer", "specialist-review-required", "Confirm claim and risk review before external proposal."),
        ],
        areaId: "publishing-preparation",
        businessValues: ["help_fabio_make_money", "reduce_operational_work"],
        conflicts: [
          conflict({
            conflictId: "content-direction-vs-publishing-preparation",
            description:
              "Content Director owns asset direction, while Publisher Agent owns publishing preparation.",
            involvedAgentIds: ["content-director", "publisher-agent"],
            resolution:
              "Publisher Agent prepares channel-specific publishing proposals only after content direction and review.",
          }),
        ],
        description:
          "Own channel-specific publishing checklists and approval-gated publishing proposals without publishing.",
        externalAction: true,
        forbiddenRoles: [
          forbidden("finance-cost-analyst", "Finance / Cost Analyst must not own publishing preparation."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own public publishing preparation."),
        ],
        order: 10,
        primaryOwner: primary("publisher-agent", "Publisher Agent owns publishing preparation only."),
        supportingRoles: [
          support("content-director", "planning", "Confirm content and brand readiness."),
          support("sales-agent", "analysis", "Surface offer and conversion implications."),
        ],
        title: "Publishing preparation",
      }),
      area({
        approvalRequired: true,
        approvalRoles: [
          approval("legal-risk-reviewer", "specialist-review-required", "Review sales claims before outreach or proposal sending."),
        ],
        areaId: "sales-planning",
        businessValues: ["help_fabio_make_money", "save_fabio_time"],
        conflicts: [
          conflict({
            conflictId: "sales-planning-vs-pricing-commitments",
            description:
              "Sales Agent may draft proposals, but Finance / Cost Analyst owns price and margin support.",
            involvedAgentIds: ["sales-agent", "finance-cost-analyst"],
            resolution:
              "Sales Agent owns sales planning; Finance / Cost Analyst owns pricing support and budget constraints.",
          }),
        ],
        description:
          "Own sales proposals, objection planning, and outreach drafts without contacting anyone.",
        externalAction: true,
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own sales outreach planning."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own sales planning."),
        ],
        order: 11,
        primaryOwner: primary("sales-agent", "Sales Agent owns sales planning only."),
        supportingRoles: [
          support("business-agent", "planning", "Ensure sales plan matches offer strategy."),
          support("content-director", "drafting", "Support message clarity and voice."),
          support("finance-cost-analyst", "analysis", "Support price and margin constraints."),
        ],
        title: "Sales planning",
      }),
      area({
        areaId: "finance-cost-analysis",
        businessValues: ["help_fabio_make_money", "reduce_risk"],
        consultedRoles: [
          consulted("legal-risk-reviewer", "Flag professional finance, tax, or compliance escalation needs."),
        ],
        description:
          "Own cost analysis, scenario modeling, margin review, and budget-risk analysis without spending.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own finance or cost analysis."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own finance or cost analysis."),
        ],
        order: 12,
        primaryOwner: primary("finance-cost-analyst", "Finance / Cost Analyst owns cost analysis."),
        supportingRoles: [
          support("business-agent", "analysis", "Connect analysis to business strategy."),
          support("sales-agent", "planning", "Surface sales-package assumptions without committing prices."),
        ],
        title: "Finance / cost analysis",
      }),
      area({
        areaId: "legal-risk-review",
        businessValues: ["reduce_risk", "improve_quality"],
        conflicts: [
          conflict({
            conflictId: "legal-risk-review-vs-final-approval",
            description:
              "Legal / Risk Reviewer can flag issues, but Fabio or qualified professionals make final legal decisions.",
            involvedAgentIds: ["business-agent", "legal-risk-reviewer"],
            resolution:
              "Legal / Risk Reviewer owns non-binding risk review; final decisions remain outside agent authority.",
          }),
        ],
        description:
          "Own non-binding claim, compliance, and risk review without final legal approval.",
        forbiddenRoles: [
          forbidden("publisher-agent", "Publisher Agent must not own legal or compliance review."),
          forbidden("sales-agent", "Sales Agent must not own legal or compliance review."),
          forbidden("customer-delivery-agent", "Customer Delivery Agent must not own legal or compliance review."),
        ],
        order: 13,
        primaryOwner: primary("legal-risk-reviewer", "Legal / Risk Reviewer owns non-binding risk review."),
        supportingRoles: [
          support("content-director", "analysis", "Provide content and brand context for review."),
          support("finance-cost-analyst", "analysis", "Surface financial assumptions where relevant."),
        ],
        title: "Legal / risk review",
      }),
      area({
        approvalRequired: true,
        approvalRoles: [
          approval("business-agent", "specialist-review-required", "Confirm delivery aligns with the approved offer and scope."),
          approval("legal-risk-reviewer", "specialist-review-required", "Review customer-sensitive risks before delivery proposal."),
        ],
        areaId: "customer-delivery-preparation",
        businessValues: [
          "help_fabio_make_money",
          "reduce_operational_work",
          "improve_quality",
        ],
        description:
          "Own client delivery checklists, handoff summaries, and approval-gated delivery proposals without sending.",
        externalAction: true,
        forbiddenRoles: [
          forbidden("finance-cost-analyst", "Finance / Cost Analyst must not own customer delivery preparation."),
        ],
        order: 14,
        primaryOwner: primary("customer-delivery-agent", "Customer Delivery Agent owns delivery preparation only."),
        supportingRoles: [
          support("developer-agent", "planning", "Support technical delivery requirements."),
          support("publisher-agent", "planning", "Support channel or delivery checklist preparation."),
          support("sales-agent", "planning", "Support handoff from proposal to delivery scope."),
        ],
        title: "Customer delivery preparation",
      }),
    ],
    contractVersion: INTER_AGENT_RESPONSIBILITY_MATRIX_CONTRACT_VERSION,
    matrixId: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX_ID,
    nonExecuting: true,
    roles: DEFAULT_AGENT_COMPANY_MAP.roles.map((role) => matrixRole(role)),
  });

function area(input: {
  readonly approvalRequired?: boolean;
  readonly approvalRoles?: readonly ApprovalRole[];
  readonly areaId: ResponsibilityAreaId;
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly conflicts?: readonly ResponsibilityConflict[];
  readonly consultedRoles?: readonly ConsultedRole[];
  readonly description: string;
  readonly externalAction?: boolean;
  readonly forbiddenRoles?: readonly ForbiddenRole[];
  readonly order: number;
  readonly primaryOwner: PrimaryOwner;
  readonly supportingRoles?: readonly SupportingRole[];
  readonly title: string;
}): ResponsibilityArea {
  return {
    approvalRequired: input.approvalRequired ?? false,
    approvalRoles: input.approvalRoles ?? [],
    areaId: input.areaId,
    businessValues: input.businessValues,
    conflicts: input.conflicts ?? [],
    consultedRoles: input.consultedRoles ?? [],
    description: input.description,
    externalAction: input.externalAction ?? false,
    forbiddenRoles: input.forbiddenRoles ?? [],
    order: input.order,
    primaryOwners: [input.primaryOwner],
    supportingRoles: input.supportingRoles ?? [],
    title: input.title,
  };
}

function matrixRole(role: AgentCompanyRole): ResponsibilityMatrixRole {
  return {
    agentId: role.roleId,
    displayName: role.displayName,
    specificationId: role.futureAgentSpecification.specificationId,
    version: role.futureAgentSpecification.version,
  };
}

function primary(
  agentId: AgentCompanyRoleId,
  rationale: string,
): PrimaryOwner {
  return {
    ...roleReference(agentId, rationale),
    ownership: "accountable",
  };
}

function support(
  agentId: AgentCompanyRoleId,
  supportType: SupportingRole["supportType"],
  rationale: string,
): SupportingRole {
  return {
    ...roleReference(agentId, rationale),
    supportType,
  };
}

function consulted(
  agentId: AgentCompanyRoleId,
  rationale: string,
): ConsultedRole {
  return {
    ...roleReference(agentId, rationale),
    requiredBefore: ["review", "final-output"],
  };
}

function approval(
  agentId: AgentCompanyRoleId,
  approvalKind: ResponsibilityApprovalKind,
  rationale: string,
): ApprovalRole {
  return {
    ...roleReference(agentId, rationale),
    approvalKind,
    requiredBefore: ["operator-approval", "external-action"],
  };
}

function forbidden(
  agentId: AgentCompanyRoleId,
  forbiddenReason: string,
): ForbiddenRole {
  return {
    ...roleReference(agentId, forbiddenReason),
    forbiddenReason,
  };
}

function conflict(input: {
  readonly conflictId: string;
  readonly description: string;
  readonly involvedAgentIds: readonly AgentCompanyRoleId[];
  readonly resolution: string;
  readonly severity?: ResponsibilityConflictSeverity;
}): ResponsibilityConflict {
  return {
    conflictId: input.conflictId,
    description: input.description,
    involvedAgentIds: input.involvedAgentIds,
    resolution: input.resolution,
    severity: input.severity ?? "warning",
  };
}

function roleReference(
  agentId: AgentCompanyRoleId,
  rationale: string,
): ResponsibilityRoleReference {
  const role = roleById(agentId);
  return {
    agentId,
    rationale,
    specificationId: role.futureAgentSpecification.specificationId,
    version: role.futureAgentSpecification.version,
  };
}

function roleById(agentId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === agentId,
  );
  if (role === undefined) {
    throw new Error(`Agent Company role missing: ${agentId}`);
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
