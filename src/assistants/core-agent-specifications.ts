import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import type { AgentCapability } from "../agents/specification/agent-capability.js";
import type { AgentPolicyRequirement } from "../agents/specification/agent-policy-requirement.js";
import type { JsonObject } from "../contracts/json.js";
import type { MemoryCategory } from "../agents/agent-manifest.js";
import {
  DEFAULT_AGENT_COMPANY_MAP,
  type AgentCompanyRole,
  type AgentCompanyRoleId,
} from "./agent-company-specification.js";

export const CORE_AGENT_SPECIFICATION_VERSION = "1.0.0" as const;

export const RESEARCH_AGENT_SPECIFICATION =
  createCoreAgentSpecification({
    agentId: "research-agent",
    handoffTargets: [
      "business-agent",
      "content-director",
      "finance-cost-analyst",
      "knowledge-curator",
      "legal-risk-reviewer",
    ],
    modelProfile: "research-quality",
    outputName: "ResearchReport",
    riskLevel: "low",
    taskTypes: ["research.market", "research.product", "research.topic"],
  });

export const BUSINESS_AGENT_SPECIFICATION =
  createCoreAgentSpecification({
    agentId: "business-agent",
    handoffTargets: [
      "content-director",
      "finance-cost-analyst",
      "legal-risk-reviewer",
      "research-agent",
      "sales-agent",
    ],
    modelProfile: "strategy-quality",
    outputName: "BusinessOffer",
    riskLevel: "medium",
    taskTypes: ["business.analysis", "business.model", "business.offer"],
  });

export const CONTENT_DIRECTOR_SPECIFICATION =
  createCoreAgentSpecification({
    agentId: "content-director",
    handoffTargets: [
      "business-agent",
      "legal-risk-reviewer",
      "research-agent",
      "sales-agent",
    ],
    modelProfile: "content-direction-quality",
    outputName: "ContentDirectionBrief",
    riskLevel: "low",
    taskTypes: [
      "content.brief",
      "content.direction",
      "content.editorial",
    ],
  });

export const DEVELOPER_AGENT_SPECIFICATION =
  createCoreAgentSpecification({
    agentId: "developer-agent",
    handoffTargets: [
      "business-agent",
      "knowledge-curator",
      "legal-risk-reviewer",
      "research-agent",
    ],
    modelProfile: "engineering-quality",
    outputName: "EngineeringSpec",
    riskLevel: "medium",
    taskTypes: [
      "engineering.adapter",
      "engineering.spec",
      "engineering.workflow",
    ],
  });

export const KNOWLEDGE_CURATOR_SPECIFICATION =
  createCoreAgentSpecification({
    agentId: "knowledge-curator",
    handoffTargets: [
      "business-agent",
      "content-director",
      "developer-agent",
      "research-agent",
    ],
    modelProfile: "knowledge-curation-quality",
    outputName: "KnowledgeCurationPlan",
    riskLevel: "low",
    taskTypes: [
      "knowledge.curate",
      "knowledge.freshness-review",
      "knowledge.scope-plan",
    ],
  });

export const INITIAL_CORE_AGENT_SPECIFICATIONS: readonly AgentSpecification[] =
  deepFreeze([
    RESEARCH_AGENT_SPECIFICATION,
    BUSINESS_AGENT_SPECIFICATION,
    CONTENT_DIRECTOR_SPECIFICATION,
    DEVELOPER_AGENT_SPECIFICATION,
    KNOWLEDGE_CURATOR_SPECIFICATION,
  ]);

interface CoreAgentSpecificationInput {
  readonly agentId: AgentCompanyRoleId;
  readonly handoffTargets: readonly string[];
  readonly modelProfile: string;
  readonly outputName: string;
  readonly riskLevel: "low" | "medium";
  readonly taskTypes: readonly string[];
}

function createCoreAgentSpecification(
  input: CoreAgentSpecificationInput,
): AgentSpecification {
  const role = roleById(input.agentId);
  const memoryCategories = uniqueSorted(
    role.memoryRequirements.flatMap(({ categories }) => categories),
  ) as readonly MemoryCategory[];
  const knowledgeScopes = uniqueSorted(
    role.knowledgeRequirements.flatMap(({ scopes }) => scopes),
  );

  const capabilities: AgentCapability[] = [
    {
      capabilityId: "knowledge-search",
      capabilityType: "knowledge.search",
      description: `Search permitted knowledge scopes for ${role.displayName}.`,
      permission: "knowledge:search",
      required: true,
      scopes: knowledgeScopes,
    },
    ...memoryCategories.map(
      (category): AgentCapability => ({
        capabilityId: `memory-read-${category}`,
        capabilityType: "memory.read",
        description: `Read permitted ${category} memory for the current objective.`,
        permission: `memory:read:${category}`,
        required: false,
      }),
    ),
    {
      capabilityId: "memory-proposal",
      capabilityType: "memory.write.proposal",
      description:
        "Propose durable memory updates for governed approval instead of mutating memory directly.",
      permission: "memory:write:proposal",
      required: false,
    },
    {
      capabilityId: "model-invoke",
      capabilityType: "model.invoke",
      description:
        "Request reasoning only through the provider-neutral model gateway.",
      permission: `model:invoke:${input.modelProfile}`,
      required: true,
    },
    {
      capabilityId: "workflow-proposal",
      capabilityType: "workflow.propose",
      description:
        "Propose future workflow handoffs without executing workflows.",
      permission: `workflow:propose:${input.agentId}`,
      required: false,
    },
  ];

  return deepFreeze({
    agentId: input.agentId,
    capabilities,
    handoffTargets: input.handoffTargets,
    implementationRef: `specification:${input.agentId}@${CORE_AGENT_SPECIFICATION_VERSION}`,
    inputSchema: {
      contractId: `${input.agentId}-input`,
      contractVersion: "1",
      schema: createInputSchema(role),
      strict: true,
    },
    instructionsRef: `module:${input.agentId}-instructions@${CORE_AGENT_SPECIFICATION_VERSION}`,
    limits: {
      maxCostUsd: 0.08,
      maxInputBytes: 262_144,
      maxModelCalls: 1,
      maxResultBytes: 131_072,
      maxTokens: 2_048,
      maxToolCalls: 0,
      timeoutMs: 30_000,
    },
    mission: role.operatorFacingPurpose,
    name: role.displayName,
    outputSchema: {
      contractId: `${input.agentId}-output`,
      contractVersion: "1",
      schema: createOutputSchema(input.outputName),
      strict: true,
    },
    policyRequirements: createPolicyRequirements(capabilities, role),
    riskLevel: input.riskLevel,
    schemaVersion: "1",
    status: "experimental",
    taskTypes: input.taskTypes,
    version: CORE_AGENT_SPECIFICATION_VERSION,
  });
}

function createInputSchema(role: AgentCompanyRole): JsonObject {
  return {
    additionalProperties: false,
    properties: {
      constraints: { type: "object" },
      objective: { type: "string" },
      operatorContext: { type: "object" },
      sourceRefs: {
        items: { type: "string" },
        type: "array",
      },
    },
    required: ["objective"],
    title: `${role.displayName}Input`,
    type: "object",
  };
}

function createOutputSchema(outputName: string): JsonObject {
  return {
    additionalProperties: false,
    properties: {
      assumptions: {
        items: { type: "string" },
        type: "array",
      },
      memoryRefs: {
        items: { type: "string" },
        type: "array",
      },
      nextAgents: {
        items: { type: "string" },
        type: "array",
      },
      recommendations: {
        items: { type: "string" },
        type: "array",
      },
      risks: {
        items: { type: "string" },
        type: "array",
      },
      sourceRefs: {
        items: { type: "string" },
        type: "array",
      },
      summary: { type: "string" },
      warnings: {
        items: { type: "string" },
        type: "array",
      },
    },
    required: [
      "assumptions",
      "memoryRefs",
      "nextAgents",
      "recommendations",
      "risks",
      "sourceRefs",
      "summary",
      "warnings",
    ],
    title: outputName,
    type: "object",
  };
}

function createPolicyRequirements(
  capabilities: readonly AgentCapability[],
  role: AgentCompanyRole,
): readonly AgentPolicyRequirement[] {
  return capabilities.map((capability): AgentPolicyRequirement => ({
    permissions: [capability.permission],
    rationale: policyRationale(capability, role),
    requirementId: `scope-${capability.capabilityId}`,
    requirementType: "data_scope",
  }));
}

function policyRationale(
  capability: AgentCapability,
  role: AgentCompanyRole,
): string {
  switch (capability.capabilityType) {
    case "knowledge.search":
      return `${role.displayName} may search only declared knowledge scopes.`;
    case "memory.read":
      return `${role.displayName} may read only policy-permitted memory excerpts.`;
    case "memory.write.proposal":
      return `${role.displayName} may only propose memory writes for governed approval.`;
    case "model.invoke":
      return `${role.displayName} may request model output only through LlmGateway.`;
    case "workflow.propose":
      return `${role.displayName} may propose workflows without executing them.`;
    case "tool.execute":
    case "tool.read":
      return `${role.displayName} has no direct tool capabilities in this milestone.`;
  }
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

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
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
