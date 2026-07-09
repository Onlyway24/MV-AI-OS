import {
  AGENT_COMPANY_CAPABILITY_IDS,
  DEFAULT_AGENT_CAPABILITY_REGISTRY,
  type AgentCompanyCapability,
  type AgentCompanyCapabilityApprovalRequirement,
  type AgentCompanyCapabilityFutureToolMapping,
  type AgentCompanyCapabilityFutureWorkflowMapping,
  type AgentCompanyCapabilityGuardianRequirement,
  type AgentCompanyCapabilityId,
  type AgentCompanyCapabilityRiskLevel,
} from "./agent-capability-registry.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";

export const AGENT_PERMISSION_MATRIX_CONTRACT_VERSION = "1" as const;
export const DEFAULT_AGENT_PERMISSION_MATRIX_ID =
  "agent-permission-matrix@1.0.0" as const;

export const AGENT_COMPANY_PERMISSION_RULE_IDS =
  AGENT_COMPANY_CAPABILITY_IDS.map(
    (capabilityId) => `${capabilityId}-permission`,
  ) as readonly AgentCompanyPermissionRuleId[];

export type AgentCompanyPermissionRuleId =
  `${AgentCompanyCapabilityId}-permission`;

export type AgentCompanyPermissionActionKind =
  | "analyze"
  | "classify"
  | "format"
  | "organize"
  | "prepare"
  | "recommend"
  | "review"
  | "synthesize";

export type AgentCompanyPermissionScope =
  | "approval_preparation"
  | "future_tool_preparation"
  | "future_workflow_preparation"
  | "internal_analysis"
  | "planning_only";

export type AgentCompanyPermissionBoundary =
  "default_deny_non_executing_declaration";

export type AgentCompanyForbiddenPermissionCategory =
  | "autonomous_execution"
  | "binding_legal_advice"
  | "budget_mutation"
  | "bypass_guardians"
  | "bypass_policy"
  | "customer_delivery_sending_without_approval"
  | "direct_agent_invocation"
  | "direct_model_provider_call"
  | "direct_tool_execution"
  | "external_communication_without_approval"
  | "filesystem_mutation"
  | "final_compliance_approval"
  | "final_strategy_decision_without_fabio"
  | "network_mutation"
  | "payment_or_spend_execution"
  | "publishing_without_approval"
  | "raw_memory_or_private_data_exposure"
  | "sales_outreach_without_approval"
  | "secret_storage"
  | "unsupported_claim";

export interface AgentCompanyPermissionSubject {
  readonly agentId: AgentCompanyRoleId;
  readonly specificationId: string;
  readonly version: string;
}

export interface AgentCompanyPermissionAllowedAction {
  readonly actionId: string;
  readonly actionKind: AgentCompanyPermissionActionKind;
  readonly description: string;
  readonly nonExecuting: true;
  readonly scope: AgentCompanyPermissionScope;
}

export interface AgentCompanyPermissionForbiddenAction {
  readonly category: AgentCompanyForbiddenPermissionCategory;
  readonly description: string;
}

export interface AgentCompanyPermissionRule {
  readonly allowedActions: readonly AgentCompanyPermissionAllowedAction[];
  readonly approvalRequired: boolean;
  readonly approvalRequirements: readonly AgentCompanyCapabilityApprovalRequirement[];
  readonly boundary: AgentCompanyPermissionBoundary;
  readonly capabilityId: AgentCompanyCapabilityId;
  readonly forbiddenAsRuntimePermission: true;
  readonly futureTool: AgentCompanyCapabilityFutureToolMapping;
  readonly futureWorkflow: AgentCompanyCapabilityFutureWorkflowMapping;
  readonly grantsRuntimeAccess: false;
  readonly guardianRequired: boolean;
  readonly guardianRequirements: readonly AgentCompanyCapabilityGuardianRequirement[];
  readonly nonExecuting: true;
  readonly order: number;
  readonly permissionId: AgentCompanyPermissionRuleId;
  readonly riskLevel: AgentCompanyCapabilityRiskLevel;
  readonly subject: AgentCompanyPermissionSubject;
}

export interface AgentCompanyRolePermissionBoundary {
  readonly allowedPermissionIds: readonly AgentCompanyPermissionRuleId[];
  readonly forbiddenActions: readonly AgentCompanyPermissionForbiddenAction[];
  readonly nonExecutionNotice: string;
  readonly role: AgentCompanyPermissionSubject;
}

export interface AgentCompanyPermissionMatrix {
  readonly contractVersion: typeof AGENT_PERMISSION_MATRIX_CONTRACT_VERSION;
  readonly defaultDeny: true;
  readonly matrixId: string;
  readonly nonExecuting: true;
  readonly permissionRules: readonly AgentCompanyPermissionRule[];
  readonly roleBoundaries: readonly AgentCompanyRolePermissionBoundary[];
}

interface ActionInput {
  readonly actionKind: AgentCompanyPermissionActionKind;
  readonly description: string;
  readonly scope: AgentCompanyPermissionScope;
}

export const DEFAULT_AGENT_PERMISSION_MATRIX: AgentCompanyPermissionMatrix =
  deepFreeze({
    contractVersion: AGENT_PERMISSION_MATRIX_CONTRACT_VERSION,
    defaultDeny: true,
    matrixId: DEFAULT_AGENT_PERMISSION_MATRIX_ID,
    nonExecuting: true,
    permissionRules: DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.map(
      (capability, index) => permissionRule(capability, index + 1),
    ),
    roleBoundaries: DEFAULT_AGENT_COMPANY_MAP.roles.map((role) =>
      roleBoundary(role),
    ),
  });

function permissionRule(
  capability: AgentCompanyCapability,
  order: number,
): AgentCompanyPermissionRule {
  const owner = capability.primaryOwners[0];
  if (owner === undefined) {
    throw new Error(`capability ${capability.capabilityId} has no owner`);
  }
  return {
    allowedActions: [
      allowedAction(capability.capabilityId, actionForCapability(capability)),
    ],
    approvalRequired: capability.approvalRequired,
    approvalRequirements: capability.approvalRequirements,
    boundary: "default_deny_non_executing_declaration",
    capabilityId: capability.capabilityId,
    forbiddenAsRuntimePermission: true,
    futureTool: capability.futureTool,
    futureWorkflow: capability.futureWorkflow,
    grantsRuntimeAccess: false,
    guardianRequired: capability.guardianRequired,
    guardianRequirements: capability.guardianRequirements,
    nonExecuting: true,
    order,
    permissionId: permissionIdForCapability(capability.capabilityId),
    riskLevel: capability.riskLevel,
    subject: {
      agentId: owner.agentId,
      specificationId: owner.specificationId,
      version: owner.version,
    },
  };
}

function allowedAction(
  capabilityId: AgentCompanyCapabilityId,
  input: ActionInput,
): AgentCompanyPermissionAllowedAction {
  return {
    actionId: `${capabilityId}-${input.actionKind}`,
    actionKind: input.actionKind,
    description: input.description,
    nonExecuting: true,
    scope: input.scope,
  };
}

function roleBoundary(
  role: AgentCompanyRole,
): AgentCompanyRolePermissionBoundary {
  return {
    allowedPermissionIds: AGENT_COMPANY_PERMISSION_RULE_IDS.filter(
      (permissionId) =>
        capabilityOwner(permissionCapabilityId(permissionId)) === role.roleId,
    ),
    forbiddenActions: forbiddenActionsForRole(role),
    nonExecutionNotice:
      "These permissions are planning declarations only and grant no runtime access, tool access, model access, workflow access, external communication, spend, publication, delivery, or autonomy.",
    role: {
      agentId: role.roleId,
      specificationId: role.futureAgentSpecification.specificationId,
      version: role.futureAgentSpecification.version,
    },
  };
}

function actionForCapability(capability: AgentCompanyCapability): ActionInput {
  switch (capability.capabilityId) {
    case "source-research":
      return prepare("Prepare research summaries and source notes for planning.");
    case "competitor-research":
      return analyze("Map competitors and summarize competitive evidence.");
    case "market-trend-mapping":
      return synthesize("Synthesize market trend signals and opportunity hypotheses.");
    case "information-synthesis":
      return synthesize("Synthesize permitted market information into planning notes.");
    case "offer-design":
      return prepare("Prepare offer structure drafts for Fabio review.");
    case "business-model-shaping":
      return analyze("Analyze business model options and constraints.");
    case "value-proposition-design":
      return prepare("Prepare value proposition language and positioning options.");
    case "pricing-strategy-support":
      return analyze("Support pricing logic with non-final strategy analysis.");
    case "mission-planning-support":
      return prepare("Prepare mission planning inputs for future dry runs.");
    case "content-strategy":
      return prepare("Prepare content strategy and channel-fit notes.");
    case "carousel-structure":
      return prepare("Prepare carousel structure and slide intent outlines.");
    case "script-direction":
      return prepare("Prepare script direction and narrative beats.");
    case "tone-message-quality-review":
      return review("Review tone, structure, claims, and message quality.");
    case "quality-review-preparation":
      return review("Prepare quality review checklists and acceptance criteria.");
    case "implementation-planning":
      return prepare("Prepare implementation plans and architecture-safe steps.");
    case "technical-architecture-support":
      return analyze("Analyze architecture risks and provider-neutral boundaries.");
    case "code-change-planning":
      return prepare("Prepare code change plans without changing systems.");
    case "test-planning-support":
      return prepare("Prepare deterministic test plans and verification gates.");
    case "knowledge-organization":
      return organize("Organize knowledge scopes, tags, and provenance labels.");
    case "memory-classification":
      return classify("Classify memory categories for governed future review.");
    case "source-to-knowledge-preparation":
      return prepare("Prepare source material for governed knowledge curation.");
    case "retrieval-readiness-support":
      return organize("Prepare retrieval structures and readiness recommendations.");
    case "publishing-preparation":
      return prepareApproval("Prepare publishing checklists and approval notes.");
    case "channel-formatting":
      return format("Format channel-ready drafts for approval review.");
    case "publishing-checklist-creation":
      return prepareApproval("Prepare publishing checklist packages.");
    case "approval-ready-publishing-handoff":
      return prepareApproval("Prepare approval-ready publishing handoff packages.");
    case "sales-strategy":
      return prepare("Prepare sales strategy and proposal planning notes.");
    case "outreach-preparation":
      return prepareApproval("Prepare outreach drafts for Fabio approval.");
    case "lead-qualification-planning":
      return analyze("Analyze lead categories and qualification criteria.");
    case "approval-ready-sales-handoff":
      return prepareApproval("Prepare approval-ready sales handoff packages.");
    case "cost-estimation":
      return analyze("Estimate costs and assumptions without spend authority.");
    case "roi-analysis":
      return analyze("Analyze ROI scenarios and uncertainty.");
    case "budget-impact-review":
      return analyze("Model budget impact for Fabio approval review.");
    case "pricing-economics-support":
      return analyze("Support pricing economics without final public pricing.");
    case "risk-identification":
      return review("Identify risk flags and escalation needs.");
    case "compliance-sensitive-review":
      return review("Review compliance-sensitive language for escalation.");
    case "claim-risk-review":
      return review("Review claims for evidence and risk flags.");
    case "legal-escalation-recommendation":
      return recommend("Recommend when professional legal or compliance review is needed.");
    case "approval-preparation":
      return prepareApproval("Prepare operator approval packets and risk summaries.");
    case "delivery-preparation":
      return prepareApproval("Prepare delivery packages for Fabio approval.");
    case "client-handoff-preparation":
      return prepareApproval("Prepare client handoff drafts for Fabio approval.");
    case "fulfillment-checklist":
      return prepare("Prepare fulfillment checklists and quality gates.");
    case "approval-ready-delivery-package":
      return prepareApproval("Prepare approval-ready delivery packages.");
  }
}

function prepare(description: string): ActionInput {
  return {
    actionKind: "prepare",
    description,
    scope: "planning_only",
  };
}

function prepareApproval(description: string): ActionInput {
  return {
    actionKind: "prepare",
    description,
    scope: "approval_preparation",
  };
}

function analyze(description: string): ActionInput {
  return {
    actionKind: "analyze",
    description,
    scope: "internal_analysis",
  };
}

function review(description: string): ActionInput {
  return {
    actionKind: "review",
    description,
    scope: "internal_analysis",
  };
}

function synthesize(description: string): ActionInput {
  return {
    actionKind: "synthesize",
    description,
    scope: "internal_analysis",
  };
}

function organize(description: string): ActionInput {
  return {
    actionKind: "organize",
    description,
    scope: "planning_only",
  };
}

function classify(description: string): ActionInput {
  return {
    actionKind: "classify",
    description,
    scope: "planning_only",
  };
}

function format(description: string): ActionInput {
  return {
    actionKind: "format",
    description,
    scope: "approval_preparation",
  };
}

function recommend(description: string): ActionInput {
  return {
    actionKind: "recommend",
    description,
    scope: "internal_analysis",
  };
}

function forbiddenActionsForRole(
  role: AgentCompanyRole,
): readonly AgentCompanyPermissionForbiddenAction[] {
  const common = [
    forbidden("autonomous_execution", "Do not act autonomously or run background work."),
    forbidden("direct_agent_invocation", "Do not invoke specialist agents directly."),
    forbidden("direct_tool_execution", "Do not execute tools or tool-like operations."),
    forbidden("direct_model_provider_call", "Do not call models or providers directly."),
    forbidden("bypass_policy", "Do not bypass policy, approvals, guardians, or audit."),
  ];

  switch (role.roleId) {
    case "research-agent":
      return [
        ...common,
        forbidden("final_strategy_decision_without_fabio", "Do not decide final strategy alone."),
        forbidden("external_communication_without_approval", "Do not contact external people."),
        forbidden("publishing_without_approval", "Do not publish anything."),
        forbidden("binding_legal_advice", "Do not make legal or financial decisions."),
      ];
    case "business-agent":
      return [
        ...common,
        forbidden("publishing_without_approval", "Do not send offers externally."),
        forbidden("unsupported_claim", "Do not make unsupported legal or marketing claims."),
        forbidden("payment_or_spend_execution", "Do not spend money."),
        forbidden("budget_mutation", "Do not finalize public pricing without approval."),
      ];
    case "content-director":
      return [
        ...common,
        forbidden("publishing_without_approval", "Do not publish content."),
        forbidden("unsupported_claim", "Do not impersonate Fabio or make unsupported claims."),
        forbidden("bypass_guardians", "Do not bypass quality review when required."),
      ];
    case "developer-agent":
      return [
        ...common,
        forbidden("network_mutation", "Do not deploy externally or mutate production systems."),
        forbidden("filesystem_mutation", "Do not mutate files or systems through this declaration."),
        forbidden("bypass_guardians", "Do not bypass security, cost, backup, or quality guardians."),
      ];
    case "knowledge-curator":
      return [
        ...common,
        forbidden("raw_memory_or_private_data_exposure", "Do not expose unredacted memory excerpts or private data."),
        forbidden("secret_storage", "Do not store secrets."),
      ];
    case "publisher-agent":
      return [
        ...common,
        forbidden("publishing_without_approval", "Do not publish or schedule public posts without Fabio approval."),
        forbidden("external_communication_without_approval", "Do not send external content directly."),
        forbidden("unsupported_claim", "Do not modify brand identity without approval."),
      ];
    case "sales-agent":
      return [
        ...common,
        forbidden("sales_outreach_without_approval", "Do not contact leads without Fabio approval."),
        forbidden("external_communication_without_approval", "Do not send emails or messages autonomously."),
        forbidden("unsupported_claim", "Do not make guarantees."),
        forbidden("final_strategy_decision_without_fabio", "Do not negotiate final terms alone."),
      ];
    case "finance-cost-analyst":
      return [
        ...common,
        forbidden("payment_or_spend_execution", "Do not spend money or execute payments."),
        forbidden("budget_mutation", "Do not change budgets."),
        forbidden("final_strategy_decision_without_fabio", "Do not make financial commitments."),
      ];
    case "legal-risk-reviewer":
      return [
        ...common,
        forbidden("binding_legal_advice", "Do not provide binding legal advice."),
        forbidden("final_compliance_approval", "Do not approve legal compliance finally."),
        forbidden("unsupported_claim", "Do not authorize risky external claims."),
      ];
    case "customer-delivery-agent":
      return [
        ...common,
        forbidden("customer_delivery_sending_without_approval", "Do not send deliverables externally without Fabio approval."),
        forbidden("external_communication_without_approval", "Do not make client promises."),
        forbidden("final_strategy_decision_without_fabio", "Do not change scope or accept completion alone."),
      ];
  }
}

function forbidden(
  category: AgentCompanyForbiddenPermissionCategory,
  description: string,
): AgentCompanyPermissionForbiddenAction {
  return {
    category,
    description,
  };
}

function capabilityOwner(capabilityId: AgentCompanyCapabilityId): AgentCompanyRoleId {
  const capability = DEFAULT_AGENT_CAPABILITY_REGISTRY.capabilities.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  const owner = capability?.primaryOwners[0];
  if (owner === undefined) {
    throw new Error(`missing owner for capability ${capabilityId}`);
  }
  return owner.agentId;
}

function permissionIdForCapability(
  capabilityId: AgentCompanyCapabilityId,
): AgentCompanyPermissionRuleId {
  return `${capabilityId}-permission`;
}

function permissionCapabilityId(
  permissionId: AgentCompanyPermissionRuleId,
): AgentCompanyCapabilityId {
  return permissionId.slice(
    0,
    -"permission".length - 1,
  ) as AgentCompanyCapabilityId;
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
