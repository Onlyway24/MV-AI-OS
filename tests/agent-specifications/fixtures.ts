import type {
  AgentCapability,
  AgentInputSchema,
  AgentLimit,
  AgentOutputSchema,
  AgentPolicyRequirement,
  AgentSpecification,
} from "../../src/index.js";

export function createAgentInputSchema(
  overrides: Partial<AgentInputSchema> = {},
): AgentInputSchema {
  return {
    contractId: "business-content-input",
    contractVersion: "1",
    schema: {
      properties: {
        instruction: { type: "string" },
      },
      required: ["instruction"],
      type: "object",
    },
    strict: true,
    ...overrides,
  };
}

export function createAgentOutputSchema(
  overrides: Partial<AgentOutputSchema> = {},
): AgentOutputSchema {
  return {
    contractId: "content-output",
    contractVersion: "1",
    schema: {
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
      type: "object",
    },
    strict: true,
    ...overrides,
  };
}

export function createAgentCapability(
  overrides: Partial<AgentCapability> = {},
): AgentCapability {
  return {
    capabilityId: "model-content-quality",
    capabilityType: "model.invoke",
    description: "Generate content through the approved model profile.",
    permission: "model:invoke:content-quality",
    required: true,
    ...overrides,
  };
}

export function createAgentLimit(
  overrides: Partial<AgentLimit> = {},
): AgentLimit {
  return {
    maxCostUsd: 0.1,
    maxInputBytes: 131_072,
    maxModelCalls: 1,
    maxResultBytes: 262_144,
    maxTokens: 2_048,
    maxToolCalls: 1,
    timeoutMs: 30_000,
    ...overrides,
  };
}

export function createAgentPolicyRequirement(
  overrides: Partial<AgentPolicyRequirement> = {},
): AgentPolicyRequirement {
  return {
    permissions: ["tool:read:catalog"],
    rationale: "Direct tool calls must be included in the audit trail.",
    requirementId: "audit-catalog",
    requirementType: "audit",
    ...overrides,
  };
}

export function createAgentSpecification(
  overrides: Partial<AgentSpecification> = {},
): AgentSpecification {
  return {
    agentId: "content",
    capabilities: [
      createAgentCapability(),
      createAgentCapability({
        capabilityId: "knowledge-brand",
        capabilityType: "knowledge.search",
        description: "Retrieve approved brand knowledge.",
        permission: "knowledge:search",
        required: false,
        scopes: ["brand"],
      }),
      createAgentCapability({
        capabilityId: "tool-catalog-read",
        capabilityType: "tool.read",
        description: "Read approved catalog data.",
        permission: "tool:read:catalog",
        required: false,
      }),
    ],
    handoffTargets: [],
    implementationRef: "module:content-agent@1.0.0",
    inputSchema: createAgentInputSchema(),
    instructionsRef: "module:content-instructions@1.0.0",
    limits: createAgentLimit(),
    mission: "Produce bounded, evidence-aware structured business content.",
    name: "Content Agent",
    outputSchema: createAgentOutputSchema(),
    policyRequirements: [
      createAgentPolicyRequirement(),
      createAgentPolicyRequirement({
        permissions: ["knowledge:search"],
        rationale: "Knowledge retrieval must remain within approved scopes.",
        requirementId: "scope-knowledge",
        requirementType: "data_scope",
      }),
    ],
    riskLevel: "low",
    schemaVersion: "1",
    status: "active",
    taskTypes: ["business.content"],
    version: "1.0.0",
    ...overrides,
  };
}
