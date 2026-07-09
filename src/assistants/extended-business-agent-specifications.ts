import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import type { EffectivePermission } from "../policy/effective-permissions.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyApprovalRequirement,
  type AgentCompanyBusinessValue,
  type AgentCompanyForbiddenCapability,
  type AgentCompanyKnowledgeRequirement,
  type AgentCompanyMemoryRequirement,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";
import type { MainAssistantSafetyDomain } from "./main-assistant-specification.js";
import { createAgentCompanyAgentSpecification } from "./agent-company-agent-specification-factory.js";

export const EXTENDED_BUSINESS_AGENT_SPECIFICATION_VERSION = "1.0.0" as const;

export type ExtendedBusinessAgentId =
  | "customer-delivery-agent"
  | "finance-cost-analyst"
  | "legal-risk-reviewer"
  | "publisher-agent"
  | "sales-agent";

export type ExtendedBusinessFutureToolMode =
  | "future_read_only"
  | "future_workflow_proposal";

export type ExtendedBusinessFutureToolSideEffect =
  | "external_communication"
  | "none";

export interface ExtendedBusinessFutureToolDeclaration {
  readonly approvalRequired: boolean;
  readonly mode: ExtendedBusinessFutureToolMode;
  readonly nonExecuting: true;
  readonly purpose: string;
  readonly sideEffect: ExtendedBusinessFutureToolSideEffect;
  readonly toolId: string;
}

export interface ExtendedBusinessAgentSpecificationProfile {
  readonly agentId: ExtendedBusinessAgentId;
  readonly agentSpecification: AgentSpecification;
  readonly approvalRequirements: readonly AgentCompanyApprovalRequirement[];
  readonly businessPurpose: string;
  readonly businessValues: readonly AgentCompanyBusinessValue[];
  readonly escalationRules: readonly string[];
  readonly expectedOutputQualityBar: readonly string[];
  readonly failureModes: readonly string[];
  readonly forbiddenCapabilities: readonly AgentCompanyForbiddenCapability[];
  readonly futureToolDeclarations: readonly ExtendedBusinessFutureToolDeclaration[];
  readonly guardianConsultationRequirements: readonly MainAssistantSafetyDomain[];
  readonly knowledgeRequirements: readonly AgentCompanyKnowledgeRequirement[];
  readonly memoryRequirements: readonly AgentCompanyMemoryRequirement[];
  readonly nonExecuting: true;
  readonly nonResponsibilities: readonly string[];
  readonly qualityChecks: readonly string[];
  readonly requiredPermissions: readonly EffectivePermission[];
  readonly responsibilities: readonly string[];
}

export const PUBLISHER_AGENT_SPECIFICATION_PROFILE =
  createExtendedBusinessAgentSpecificationProfile({
    agentId: "publisher-agent",
    escalationRules: [
      "Escalate when a publishing proposal would affect a public channel, customer relationship, paid campaign, or brand-sensitive claim.",
      "Require explicit Fabio approval before any future publish, schedule, or send workflow may continue.",
      "Route unsupported claims to Legal / Risk Reviewer before presenting delivery-ready output.",
    ],
    expectedOutputQualityBar: [
      "Output is platform-specific, approval-gated, and clear about what remains only a proposal.",
      "Every customer-facing claim is supported by permitted knowledge or flagged for review.",
      "No output implies that publishing, sending, or scheduling has happened.",
    ],
    failureModes: [
      "Missing approval marker for a public or external publishing path.",
      "Unsupported claim or missing channel requirement.",
      "Ambiguous destination, audience, timing, or final asset reference.",
    ],
    futureToolDeclarations: [
      futureTool({
        approvalRequired: true,
        mode: "future_workflow_proposal",
        purpose:
          "Prepare an approval-gated publish workflow proposal for an already reviewed asset.",
        sideEffect: "external_communication",
        toolId: "publish-workflow-proposal",
      }),
      futureTool({
        approvalRequired: false,
        mode: "future_read_only",
        purpose: "Read approved channel checklist metadata after a tool exists.",
        sideEffect: "none",
        toolId: "channel-checklist-read",
      }),
    ],
    handoffTargets: [
      "content-director",
      "legal-risk-reviewer",
      "sales-agent",
    ],
    modelProfile: "publishing-quality",
    nonResponsibilities: [
      "Do not publish, schedule, send, or deliver any content without explicit Fabio approval.",
      "Do not bypass review, operator safety, security, quality, policy, audit, or future workflow gates.",
      "Do not modify channel accounts, campaign settings, files, calendars, or external systems.",
    ],
    outputName: "PublishingProposal",
    qualityChecks: [
      "Verify approval requirement is visible before any external action is proposed.",
      "Verify destination, asset reference, audience, timing, and claim-review status are explicit.",
      "Verify output contains no credentials, account internals, or unpublished sensitive details.",
    ],
    taskTypes: [
      "publishing.checklist",
      "publishing.plan",
      "publishing.review",
    ],
  });

export const SALES_AGENT_SPECIFICATION_PROFILE =
  createExtendedBusinessAgentSpecificationProfile({
    agentId: "sales-agent",
    escalationRules: [
      "Escalate when outreach, proposal delivery, price commitment, client-specific claim, or relationship-sensitive response is requested.",
      "Require explicit Fabio approval before any future contact or send workflow may continue.",
      "Route margin or price uncertainty to Finance / Cost Analyst and claim uncertainty to Legal / Risk Reviewer.",
    ],
    expectedOutputQualityBar: [
      "Output is persuasive but clearly unsent, approval-gated, and grounded in approved offers or case studies.",
      "Every sales claim is supported, qualified, or sent to review.",
      "The proposal distinguishes draft language from final Fabio-approved communication.",
    ],
    failureModes: [
      "Missing approval marker for outreach or proposal delivery.",
      "Unsupported claim, invented proof, or unreviewed client-specific statement.",
      "Price, scope, or deadline commitment without finance or Fabio approval.",
    ],
    futureToolDeclarations: [
      futureTool({
        approvalRequired: true,
        mode: "future_workflow_proposal",
        purpose:
          "Prepare an approval-gated outreach or proposal-send workflow proposal.",
        sideEffect: "external_communication",
        toolId: "sales-send-workflow-proposal",
      }),
      futureTool({
        approvalRequired: false,
        mode: "future_read_only",
        purpose: "Read approved offer and proposal template metadata after a tool exists.",
        sideEffect: "none",
        toolId: "proposal-template-read",
      }),
    ],
    handoffTargets: [
      "business-agent",
      "content-director",
      "finance-cost-analyst",
      "legal-risk-reviewer",
    ],
    modelProfile: "sales-quality",
    nonResponsibilities: [
      "Do not send outreach, contact anyone, or deliver a proposal without explicit Fabio approval.",
      "Do not invent client proof, case studies, prices, guarantees, or availability.",
      "Do not modify CRM records, email systems, calendars, payment systems, files, or external systems.",
    ],
    outputName: "SalesProposal",
    qualityChecks: [
      "Verify the response is clearly a draft and not a sent message.",
      "Verify proof, pricing, and offer references are grounded or flagged.",
      "Verify external communication approval is required before any future send path.",
    ],
    taskTypes: [
      "sales.objection-handling",
      "sales.outreach-draft",
      "sales.proposal",
    ],
  });

export const FINANCE_COST_ANALYST_SPECIFICATION_PROFILE =
  createExtendedBusinessAgentSpecificationProfile({
    agentId: "finance-cost-analyst",
    escalationRules: [
      "Escalate when a decision would spend money, change a budget, authorize payment, commit price, or depend on missing cost data.",
      "Route legal, tax, and accounting uncertainty to Fabio and qualified professionals.",
      "Route claim or offer-risk concerns to Legal / Risk Reviewer before customer-facing use.",
    ],
    expectedOutputQualityBar: [
      "Output labels assumptions, scenarios, uncertainty, and missing inputs.",
      "Output separates analysis from Fabio approval or professional advice.",
      "No output authorizes spend, payment, budget changes, or final price commitments.",
    ],
    failureModes: [
      "Missing cost, margin, fee, or volume assumption.",
      "Unclear difference between scenario analysis and approved budget.",
      "Request asks the agent to spend, pay, transfer, or change live budgets.",
    ],
    futureToolDeclarations: [
      futureTool({
        approvalRequired: false,
        mode: "future_read_only",
        purpose: "Read approved pricing and cost table metadata after a tool exists.",
        sideEffect: "none",
        toolId: "pricing-cost-table-read",
      }),
    ],
    handoffTargets: [
      "business-agent",
      "legal-risk-reviewer",
      "sales-agent",
    ],
    modelProfile: "finance-quality",
    nonResponsibilities: [
      "Do not spend money, change budgets, execute payments, or authorize purchases.",
      "Do not provide binding financial, tax, accounting, investment, or legal advice.",
      "Do not invent prices, costs, margins, conversion rates, or supplier terms.",
    ],
    outputName: "FinanceCostAnalysis",
    qualityChecks: [
      "Verify assumptions are explicit and scenario-based.",
      "Verify recommendations are framed as decision support, not authorization.",
      "Verify missing cost inputs are blockers or warnings.",
    ],
    taskTypes: [
      "finance.analysis",
      "finance.pricing",
      "finance.scenario",
    ],
  });

export const LEGAL_RISK_AGENT_SPECIFICATION_PROFILE =
  createExtendedBusinessAgentSpecificationProfile({
    agentId: "legal-risk-reviewer",
    escalationRules: [
      "Escalate when a request needs professional legal, tax, compliance, privacy, employment, contract, or regulated-industry judgment.",
      "Block final compliance approval language and route final decisions to Fabio or qualified professionals.",
      "Route unsupported customer-facing claims back to the originating agent for revision.",
    ],
    expectedOutputQualityBar: [
      "Output identifies risk, uncertainty, and non-binding review status clearly.",
      "Output separates policy reminders from professional legal advice.",
      "Output gives practical revision guidance without claiming final compliance approval.",
    ],
    failureModes: [
      "Request asks for binding legal advice or final compliance approval.",
      "Missing claims policy, jurisdiction, contract, or source context.",
      "High-risk claim cannot be grounded in approved knowledge.",
    ],
    futureToolDeclarations: [
      futureTool({
        approvalRequired: false,
        mode: "future_read_only",
        purpose: "Read approved claims-policy and legal-lite reference metadata after a tool exists.",
        sideEffect: "none",
        toolId: "risk-policy-reference-read",
      }),
    ],
    handoffTargets: [
      "business-agent",
      "content-director",
      "publisher-agent",
      "sales-agent",
    ],
    modelProfile: "risk-review-quality",
    nonResponsibilities: [
      "Do not provide binding legal advice or final compliance approval.",
      "Do not replace professional legal, tax, accounting, privacy, or regulatory counsel.",
      "Do not approve external delivery, publishing, spending, contracts, or customer communications.",
    ],
    outputName: "LegalRiskReview",
    qualityChecks: [
      "Verify every risky claim is allowed, revised, escalated, or blocked.",
      "Verify non-binding status is visible.",
      "Verify professional-advice escalation is present when stakes require it.",
    ],
    taskTypes: [
      "risk.claim-review",
      "risk.compliance-review",
      "risk.legal-lite-review",
    ],
  });

export const CUSTOMER_DELIVERY_AGENT_SPECIFICATION_PROFILE =
  createExtendedBusinessAgentSpecificationProfile({
    agentId: "customer-delivery-agent",
    escalationRules: [
      "Escalate when a customer artifact, client communication, timeline, or delivery commitment could leave MV AI OS.",
      "Require explicit Fabio approval before any future customer delivery or send workflow may continue.",
      "Route risky claims to Legal / Risk Reviewer and technical delivery risks to Developer Agent.",
    ],
    expectedOutputQualityBar: [
      "Output is client-ready in structure but clearly not externally delivered.",
      "Output shows approval, review, risk, and handoff status.",
      "Every deliverable has owner, status, assumptions, and missing-input warnings.",
    ],
    failureModes: [
      "Missing Fabio approval for external customer delivery.",
      "Unclear client scope, deliverable status, deadline, or review state.",
      "Sensitive customer information appears beyond the permitted context.",
    ],
    futureToolDeclarations: [
      futureTool({
        approvalRequired: true,
        mode: "future_workflow_proposal",
        purpose:
          "Prepare an approval-gated customer delivery workflow proposal for reviewed artifacts.",
        sideEffect: "external_communication",
        toolId: "customer-delivery-workflow-proposal",
      }),
      futureTool({
        approvalRequired: false,
        mode: "future_read_only",
        purpose: "Read approved delivery checklist metadata after a tool exists.",
        sideEffect: "none",
        toolId: "delivery-checklist-read",
      }),
    ],
    handoffTargets: [
      "developer-agent",
      "legal-risk-reviewer",
      "publisher-agent",
      "sales-agent",
    ],
    modelProfile: "customer-delivery-quality",
    nonResponsibilities: [
      "Do not send deliverables externally, contact customers, or mutate customer systems without explicit Fabio approval.",
      "Do not promise deadlines, scope changes, refunds, support terms, or outcomes without Fabio approval.",
      "Do not modify files, client systems, project boards, communication channels, or external systems.",
    ],
    outputName: "CustomerDeliveryPlan",
    qualityChecks: [
      "Verify output distinguishes prepared delivery material from delivered material.",
      "Verify customer-sensitive risks and missing approvals are visible.",
      "Verify future delivery proposals require explicit approval before external action.",
    ],
    taskTypes: [
      "customer.delivery-plan",
      "customer.handoff",
      "customer.success-plan",
    ],
  });

export const EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES: readonly ExtendedBusinessAgentSpecificationProfile[] =
  deepFreeze([
    PUBLISHER_AGENT_SPECIFICATION_PROFILE,
    SALES_AGENT_SPECIFICATION_PROFILE,
    FINANCE_COST_ANALYST_SPECIFICATION_PROFILE,
    LEGAL_RISK_AGENT_SPECIFICATION_PROFILE,
    CUSTOMER_DELIVERY_AGENT_SPECIFICATION_PROFILE,
  ]);

export const EXTENDED_BUSINESS_AGENT_SPECIFICATIONS: readonly AgentSpecification[] =
  deepFreeze(
    EXTENDED_BUSINESS_AGENT_SPECIFICATION_PROFILES.map(
      ({ agentSpecification }) => agentSpecification,
    ),
  );

function createExtendedBusinessAgentSpecificationProfile(input: {
  readonly agentId: ExtendedBusinessAgentId;
  readonly escalationRules: readonly string[];
  readonly expectedOutputQualityBar: readonly string[];
  readonly failureModes: readonly string[];
  readonly futureToolDeclarations: readonly ExtendedBusinessFutureToolDeclaration[];
  readonly handoffTargets: readonly string[];
  readonly modelProfile: string;
  readonly nonResponsibilities: readonly string[];
  readonly outputName: string;
  readonly qualityChecks: readonly string[];
  readonly taskTypes: readonly string[];
}): ExtendedBusinessAgentSpecificationProfile {
  const role = roleById(input.agentId);
  const agentSpecification = createAgentCompanyAgentSpecification({
    agentId: input.agentId,
    handoffTargets: input.handoffTargets,
    includeWorkflowApprovalRequirement: role.approvalRequirements.length > 0,
    maxCostUsd: 0.08,
    maxTokens: 2_048,
    modelProfile: input.modelProfile,
    outputName: input.outputName,
    riskLevel: "medium",
    taskTypes: input.taskTypes,
    version: EXTENDED_BUSINESS_AGENT_SPECIFICATION_VERSION,
  });

  return deepFreeze({
    agentId: input.agentId,
    agentSpecification,
    approvalRequirements: role.approvalRequirements,
    businessPurpose: role.operatorFacingPurpose,
    businessValues: role.businessValues,
    escalationRules: input.escalationRules,
    expectedOutputQualityBar: input.expectedOutputQualityBar,
    failureModes: input.failureModes,
    forbiddenCapabilities: role.forbiddenCapabilities,
    futureToolDeclarations: input.futureToolDeclarations,
    guardianConsultationRequirements: role.controlPlaneDependencies,
    knowledgeRequirements: role.knowledgeRequirements,
    memoryRequirements: role.memoryRequirements,
    nonExecuting: true,
    nonResponsibilities: [
      ...role.boundaries.nonResponsibilities,
      ...input.nonResponsibilities,
    ],
    qualityChecks: input.qualityChecks,
    requiredPermissions: agentSpecification.capabilities.map(
      ({ permission }) => permission,
    ),
    responsibilities: role.boundaries.responsibilities,
  });
}

function futureTool(
  input: Omit<ExtendedBusinessFutureToolDeclaration, "nonExecuting">,
): ExtendedBusinessFutureToolDeclaration {
  return {
    ...input,
    nonExecuting: true,
  };
}

function roleById(roleId: AgentCompanyRoleId): AgentCompanyRole {
  const role = DEFAULT_AGENT_COMPANY_MAP.roles.find(
    (candidate) => candidate.roleId === roleId,
  );
  if (role === undefined) {
    throw new Error(`Agent Company role missing: ${roleId}`);
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
