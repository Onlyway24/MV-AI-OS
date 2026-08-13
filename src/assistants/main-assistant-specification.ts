import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import type { JsonObject } from "../contracts/json.js";

export const MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION = "1" as const;
export const ONLY_WAY_ASSISTANT_ID = "only-way-assistant" as const;
export const ONLY_WAY_ASSISTANT_INSTRUCTIONS_REF =
  "module:only-way-assistant-instructions@1.0.0" as const;

export type MainAssistantSafetyDomain =
  | "backup"
  | "cost"
  | "incident"
  | "operator_safety"
  | "quality"
  | "security";

export type MainAssistantEscalationType =
  | "cloud_or_vps_readiness"
  | "external_side_effect"
  | "increase_autonomy"
  | "memory_write"
  | "model_expansion"
  | "publish_or_send"
  | "tool_execution"
  | "workflow_execution";

export type MainAssistantForbiddenCapability =
  | "autonomous_background_execution"
  | "autonomous_destructive_action"
  | "bypass_core_brain"
  | "bypass_guardians"
  | "bypass_policy"
  | "direct_browser_control"
  | "direct_database_mutation"
  | "direct_email_calendar_social_posting"
  | "direct_filesystem_mutation"
  | "direct_n8n_execution"
  | "direct_provider_call"
  | "direct_secret_reading"
  | "direct_tool_execution"
  | "publishing_without_approval"
  | "spending_without_budget_limits";

export type MainAssistantDelegationTargetRole =
  | "business"
  | "content_direction"
  | "implementation"
  | "publishing"
  | "research";

export type MainAssistantForbiddenDelegationMode =
  | "agent_to_agent_direct_call"
  | "autonomous_escalation"
  | "unapproved_publishing"
  | "unapproved_tool_execution";

export type MainAssistantOutputRule =
  | "avoid_raw_internal_payloads"
  | "state_approval_needed"
  | "state_blockers"
  | "state_checked_safety"
  | "state_next_action";

export interface MainAssistantSafetyPreflightRequirement {
  readonly domain: MainAssistantSafetyDomain;
  readonly requiredBefore: readonly MainAssistantEscalationType[];
  readonly requirementId: string;
  readonly rationale: string;
}

export interface MainAssistantHumanApprovalRequirement {
  readonly approvalId: string;
  readonly rationale: string;
  readonly requiredFor: readonly MainAssistantEscalationType[];
}

export interface MainAssistantDelegationTarget {
  readonly agentId: string;
  readonly description: string;
  readonly requiredApproval: boolean;
  readonly requiredPreflightDomains: readonly MainAssistantSafetyDomain[];
  readonly role: MainAssistantDelegationTargetRole;
}

export interface MainAssistantDelegationPolicy {
  readonly allowedTargets: readonly MainAssistantDelegationTarget[];
  readonly forbiddenModes: readonly MainAssistantForbiddenDelegationMode[];
  readonly maxDelegationDepth: number;
  readonly noCircularDelegation: boolean;
  readonly requiresCoreBrainMediation: boolean;
  readonly requiresOperatorSafetyCheck: boolean;
  readonly requiresPolicyEvaluation: boolean;
}

export interface MainAssistantSpecification {
  readonly agentSpecification: AgentSpecification;
  readonly assistantId: string;
  readonly contractVersion: typeof MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION;
  readonly delegationPolicy: MainAssistantDelegationPolicy;
  readonly displayName: string;
  readonly forbiddenCapabilities: readonly MainAssistantForbiddenCapability[];
  readonly humanApprovalRequirements: readonly MainAssistantHumanApprovalRequirement[];
  readonly mission: string;
  readonly nonResponsibilities: readonly string[];
  readonly operatorOutputRules: readonly MainAssistantOutputRule[];
  readonly operatorRole: string;
  readonly responsibilities: readonly string[];
  readonly safetyPreflightRequirements: readonly MainAssistantSafetyPreflightRequirement[];
}

export const ONLY_WAY_ASSISTANT_INPUT_SCHEMA: JsonObject = deepFreeze({
  additionalProperties: false,
  properties: {
    constraints: { type: "object" },
    objective: { type: "string" },
    operatorContext: { type: "object" },
    requestedOutcome: { type: "string" },
    safetyContext: { type: "object" },
  },
  required: ["objective", "requestedOutcome"],
  type: "object",
});

export const ONLY_WAY_ASSISTANT_OUTPUT_SCHEMA: JsonObject = deepFreeze({
  additionalProperties: false,
  properties: {
    approvalRequired: { type: "boolean" },
    blockers: {
      items: { type: "string" },
      type: "array",
    },
    checkedSafetyDomains: {
      items: { type: "string" },
      type: "array",
    },
    nextAction: { type: "string" },
    operatorSummary: { type: "string" },
    recommendedDelegations: {
      items: { type: "string" },
      type: "array",
    },
    safetyDecision: { type: "string" },
  },
  required: [
    "approvalRequired",
    "blockers",
    "checkedSafetyDomains",
    "nextAction",
    "operatorSummary",
    "recommendedDelegations",
    "safetyDecision",
  ],
  type: "object",
});

export const ONLY_WAY_ASSISTANT_INSTRUCTIONS = [
  "Act as Fabio's single operator-facing assistant boundary.",
  "Use existing Core Brain, policy, memory, knowledge, model gateway, guardian, workflow-specification, and tool-gateway boundaries.",
  "Consult Operator Safety before risky escalation or movement toward more autonomy.",
  "Never call providers, tools, workflows, browsers, filesystems, dashboards, n8n, or external systems directly.",
  "Never publish, spend, mutate, or delegate dangerous work without explicit approval and policy coverage.",
  "Keep specialized agents internal and surface concise operator decisions to Fabio.",
  "Do not expose raw prompts, completions, provider payloads, secrets, transcripts, raw knowledge, raw memory, or internal transport details.",
].join(" ");

export const ONLY_WAY_ASSISTANT_SPECIFICATION: MainAssistantSpecification =
  deepFreeze({
    agentSpecification: {
      agentId: ONLY_WAY_ASSISTANT_ID,
      capabilities: [
        {
          capabilityId: "knowledge-operator",
          capabilityType: "knowledge.search",
          description:
            "Retrieve permitted operator, project-state, and business context through governed knowledge search.",
          permission: "knowledge:search",
          required: true,
          scopes: ["operator", "project_state", "business"],
        },
        {
          capabilityId: "memory-conversation",
          capabilityType: "memory.read",
          description: "Read permitted conversation memory for operator continuity.",
          permission: "memory:read:conversation",
          required: false,
        },
        {
          capabilityId: "memory-semantic",
          capabilityType: "memory.read",
          description: "Read permitted semantic memory for stable context.",
          permission: "memory:read:semantic",
          required: false,
        },
        {
          capabilityId: "memory-user",
          capabilityType: "memory.read",
          description: "Read explicitly approved user memory.",
          permission: "memory:read:user",
          required: false,
        },
        {
          capabilityId: "memory-proposal",
          capabilityType: "memory.write.proposal",
          description:
            "Propose memory writes for later governed approval instead of mutating memory directly.",
          permission: "memory:write:proposal",
          required: false,
        },
        {
          capabilityId: "model-operator-reasoning",
          capabilityType: "model.invoke",
          description:
            "Request operator-facing reasoning only through the provider-neutral model gateway.",
          permission: "model:invoke:operator-reasoning",
          required: true,
        },
        {
          capabilityId: "workflow-operator-review",
          capabilityType: "workflow.propose",
          description:
            "Propose governed workflow handoffs without executing workflows.",
          permission: "workflow:propose:operator-review",
          required: false,
        },
      ],
      handoffTargets: [
        "business-agent",
        "content-director",
        "developer-agent",
        "publisher-agent",
        "research-agent",
      ],
      implementationRef: "specification:only-way-assistant@1.0.0",
      inputSchema: {
        contractId: "only-way-assistant-input",
        contractVersion: "1",
        schema: ONLY_WAY_ASSISTANT_INPUT_SCHEMA,
        strict: true,
      },
      instructionsRef: ONLY_WAY_ASSISTANT_INSTRUCTIONS_REF,
      limits: {
        maxCostUsd: 0.05,
        maxInputBytes: 262_144,
        maxModelCalls: 1,
        maxResultBytes: 131_072,
        maxTokens: 2_048,
        maxToolCalls: 0,
        timeoutMs: 30_000,
      },
      mission:
        "Coordinate Fabio's objectives through controlled architecture boundaries while preserving safety, budget, security, backup readiness, quality, and human approval.",
      name: "Onlyway Assistant",
      outputSchema: {
        contractId: "only-way-assistant-output",
        contractVersion: "1",
        schema: ONLY_WAY_ASSISTANT_OUTPUT_SCHEMA,
        strict: true,
      },
      policyRequirements: [
        {
          permissions: [
            "knowledge:search",
            "memory:read:conversation",
            "memory:read:semantic",
            "memory:read:user",
            "memory:write:proposal",
          ],
          rationale:
            "Operator context must remain scoped by governed memory and knowledge permissions.",
          requirementId: "scope-operator-context",
          requirementType: "data_scope",
        },
        {
          permissions: ["model:invoke:operator-reasoning"],
          rationale:
            "Model usage must be auditable and pass through the provider-neutral gateway.",
          requirementId: "audit-operator-model",
          requirementType: "audit",
        },
        {
          permissions: ["workflow:propose:operator-review"],
          rationale:
            "Workflow handoffs may be proposed only through governed, auditable boundaries.",
          requirementId: "audit-workflow-proposal",
          requirementType: "audit",
        },
        {
          permissions: ["workflow:propose:operator-review"],
          rationale:
            "Workflow execution is not allowed without later explicit approval.",
          requirementId: "approve-workflow-proposal",
          requirementType: "approval",
        },
        {
          permissions: ["memory:write:proposal"],
          rationale:
            "Memory changes remain proposals until an approved memory flow accepts them.",
          requirementId: "approve-memory-proposal",
          requirementType: "approval",
        },
      ],
      riskLevel: "medium",
      schemaVersion: "1",
      status: "experimental",
      taskTypes: [
        "operator.coordinate",
        "operator.decide",
        "operator.plan",
        "operator.review",
      ],
      version: "1.0.0",
    },
    assistantId: ONLY_WAY_ASSISTANT_ID,
    contractVersion: MAIN_ASSISTANT_SPECIFICATION_CONTRACT_VERSION,
    delegationPolicy: {
      allowedTargets: [
        {
          agentId: "research-agent",
          description:
            "Future specialist for source gathering and knowledge synthesis.",
          requiredApproval: false,
          requiredPreflightDomains: ["operator_safety", "quality"],
          role: "research",
        },
        {
          agentId: "business-agent",
          description:
            "Future specialist for business analysis and operator decision support.",
          requiredApproval: false,
          requiredPreflightDomains: ["operator_safety", "cost"],
          role: "business",
        },
        {
          agentId: "content-director",
          description:
            "Future specialist for content direction while preserving Fabio's voice.",
          requiredApproval: false,
          requiredPreflightDomains: ["operator_safety", "quality"],
          role: "content_direction",
        },
        {
          agentId: "developer-agent",
          description:
            "Future specialist for implementation tasks through approved engineering boundaries.",
          requiredApproval: true,
          requiredPreflightDomains: [
            "operator_safety",
            "security",
            "backup",
            "incident",
          ],
          role: "implementation",
        },
        {
          agentId: "publisher-agent",
          description:
            "Future specialist for publishing or delivery only after explicit approval.",
          requiredApproval: true,
          requiredPreflightDomains: [
            "operator_safety",
            "quality",
            "security",
          ],
          role: "publishing",
        },
      ],
      forbiddenModes: [
        "agent_to_agent_direct_call",
        "autonomous_escalation",
        "unapproved_publishing",
        "unapproved_tool_execution",
      ],
      maxDelegationDepth: 1,
      noCircularDelegation: true,
      requiresCoreBrainMediation: true,
      requiresOperatorSafetyCheck: true,
      requiresPolicyEvaluation: true,
    },
    displayName: "Onlyway Assistant",
    forbiddenCapabilities: [
      "autonomous_background_execution",
      "autonomous_destructive_action",
      "bypass_core_brain",
      "bypass_guardians",
      "bypass_policy",
      "direct_browser_control",
      "direct_database_mutation",
      "direct_email_calendar_social_posting",
      "direct_filesystem_mutation",
      "direct_n8n_execution",
      "direct_provider_call",
      "direct_secret_reading",
      "direct_tool_execution",
      "publishing_without_approval",
      "spending_without_budget_limits",
    ],
    humanApprovalRequirements: [
      {
        approvalId: "approve-external-side-effects",
        rationale:
          "Fabio must approve external side effects before messages, publishing, tools, or workflows can act.",
        requiredFor: [
          "external_side_effect",
          "publish_or_send",
          "tool_execution",
          "workflow_execution",
        ],
      },
      {
        approvalId: "approve-autonomy-increase",
        rationale:
          "Fabio must approve movement toward more autonomy after Operator Safety review.",
        requiredFor: ["cloud_or_vps_readiness", "increase_autonomy"],
      },
      {
        approvalId: "approve-memory-changes",
        rationale:
          "Persistent memory changes must remain governed proposals until approved.",
        requiredFor: ["memory_write"],
      },
    ],
    mission:
      "Be Fabio's single controlled operator-facing assistant for interpreting objectives, consulting safety signals, coordinating future specialists, and surfacing clear decisions without hidden autonomy.",
    nonResponsibilities: [
      "Do not execute tools, workflows, browser actions, filesystem actions, or n8n directly.",
      "Do not call providers directly or bypass the model gateway.",
      "Do not publish, send, spend, mutate, or delete without explicit approval and policy coverage.",
      "Do not expose sub-agent chaos to Fabio as separate assistants to babysit.",
    ],
    operatorOutputRules: [
      "avoid_raw_internal_payloads",
      "state_approval_needed",
      "state_blockers",
      "state_checked_safety",
      "state_next_action",
    ],
    operatorRole: "Fabio remains the operator and investor of MV AI OS.",
    responsibilities: [
      "Interpret Fabio's high-level objectives.",
      "Check Operator Safety before risky escalation.",
      "Consult Cost Guardian before expensive model expansion.",
      "Consult Security Guardian before risky integration, tool, cloud, or provider behavior.",
      "Consult Backup Guardian before persistence, migration, cloud, or runtime-risk changes.",
      "Consult Incident Guardian when repeated failures or abnormal signals exist.",
      "Consult Quality Guardian before publishing, delivery, or handoff decisions.",
      "Delegate future specialist work only through controlled boundaries.",
      "Surface concise operator decisions, blockers, approvals, and next actions to Fabio.",
    ],
    safetyPreflightRequirements: [
      {
        domain: "operator_safety",
        rationale:
          "Overall operator safety must be known before increasing autonomy or risk.",
        requiredBefore: [
          "cloud_or_vps_readiness",
          "external_side_effect",
          "increase_autonomy",
          "publish_or_send",
          "tool_execution",
          "workflow_execution",
        ],
        requirementId: "operator-safety-preflight",
      },
      {
        domain: "cost",
        rationale:
          "Model usage and budget posture must be checked before expanded or expensive model activity.",
        requiredBefore: ["increase_autonomy", "model_expansion"],
        requirementId: "cost-preflight",
      },
      {
        domain: "security",
        rationale:
          "Security posture must be checked before tools, cloud, provider expansion, or external side effects.",
        requiredBefore: [
          "cloud_or_vps_readiness",
          "external_side_effect",
          "tool_execution",
          "workflow_execution",
        ],
        requirementId: "security-preflight",
      },
      {
        domain: "backup",
        rationale:
          "Recovery posture must be checked before persistence, migration, cloud, or runtime-risk changes.",
        requiredBefore: [
          "cloud_or_vps_readiness",
          "increase_autonomy",
          "memory_write",
          "workflow_execution",
        ],
        requirementId: "backup-preflight",
      },
      {
        domain: "incident",
        rationale:
          "Repeated failures must be understood before expanding integrations or autonomy.",
        requiredBefore: [
          "external_side_effect",
          "increase_autonomy",
          "tool_execution",
          "workflow_execution",
        ],
        requirementId: "incident-preflight",
      },
      {
        domain: "quality",
        rationale:
          "Output quality and evidence posture must be checked before publishing, delivery, or operator handoff.",
        requiredBefore: ["publish_or_send", "workflow_execution"],
        requirementId: "quality-preflight",
      },
    ],
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
