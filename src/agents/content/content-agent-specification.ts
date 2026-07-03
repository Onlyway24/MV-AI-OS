import { CONTENT_AGENT_INSTRUCTIONS_REF } from "./content-agent-instructions.js";
import { CONTENT_AGENT_MANIFEST } from "./content-agent-manifest.js";
import type { AgentSpecification } from "../specification/agent-specification.js";
import type { JsonObject } from "../../contracts/json.js";

export const MODEL_BACKED_CONTENT_AGENT_IMPLEMENTATION_REF =
  "module:model-backed-content-agent@1.0.0";

export const CONTENT_OUTPUT_MODEL_SCHEMA: JsonObject = deepFreeze({
  additionalProperties: false,
  properties: {
    assumptions: {
      items: { type: "string" },
      type: "array",
    },
    audience: { type: "string" },
    body: { type: "object" },
    callToAction: { type: "string" },
    contentType: { type: "string" },
    language: { type: "string" },
    memoryRefs: {
      items: { type: "string" },
      type: "array",
    },
    metadata: { type: "object" },
    sourceRefs: {
      items: { type: "string" },
      type: "array",
    },
    summary: { type: "string" },
    title: { type: "string" },
    tone: { type: "string" },
    warnings: {
      items: { type: "string" },
      type: "array",
    },
  },
  required: [
    "assumptions",
    "audience",
    "body",
    "contentType",
    "language",
    "memoryRefs",
    "metadata",
    "sourceRefs",
    "summary",
    "tone",
    "warnings",
  ],
  type: "object",
});

export const CONTENT_AGENT_SPECIFICATION: AgentSpecification = deepFreeze({
  agentId: CONTENT_AGENT_MANIFEST.agentId,
  capabilities: [
    {
      capabilityId: "knowledge-general",
      capabilityType: "knowledge.search",
      description: "Retrieve approved general workspace knowledge.",
      permission: "knowledge:search",
      required: false,
      scopes: ["general"],
    },
    {
      capabilityId: "memory-conversation",
      capabilityType: "memory.read",
      description: "Read permitted conversation context.",
      permission: "memory:read:conversation",
      required: false,
    },
    {
      capabilityId: "memory-semantic",
      capabilityType: "memory.read",
      description: "Read permitted semantic context.",
      permission: "memory:read:semantic",
      required: false,
    },
    {
      capabilityId: "memory-user",
      capabilityType: "memory.read",
      description: "Read explicitly approved user context.",
      permission: "memory:read:user",
      required: false,
    },
    {
      capabilityId: "model-content-quality",
      capabilityType: "model.invoke",
      description: "Generate structured content through the named model profile.",
      permission: "model:invoke:content-quality",
      required: true,
    },
  ],
  handoffTargets: [],
  implementationRef: MODEL_BACKED_CONTENT_AGENT_IMPLEMENTATION_REF,
  inputSchema: {
    contractId: CONTENT_AGENT_MANIFEST.inputContract.contractId,
    contractVersion: CONTENT_AGENT_MANIFEST.inputContract.contractVersion,
    schema: {
      properties: {
        constraints: { type: "object" },
        data: { type: "object" },
        requestedOutput: { type: "object" },
      },
      required: ["requestedOutput"],
      type: "object",
    },
    strict: true,
  },
  instructionsRef: CONTENT_AGENT_INSTRUCTIONS_REF,
  limits: {
    maxCostUsd: 0.1,
    maxInputBytes: 262_144,
    maxModelCalls: 1,
    maxResultBytes: CONTENT_AGENT_MANIFEST.limits.maxResultBytes,
    maxTokens: 2_048,
    maxToolCalls: 0,
    timeoutMs: CONTENT_AGENT_MANIFEST.limits.timeoutMs,
  },
  mission: "Produce bounded, evidence-aware structured business content.",
  name: CONTENT_AGENT_MANIFEST.name,
  outputSchema: {
    contractId: CONTENT_AGENT_MANIFEST.outputContract.contractId,
    contractVersion: CONTENT_AGENT_MANIFEST.outputContract.contractVersion,
    schema: CONTENT_OUTPUT_MODEL_SCHEMA,
    strict: true,
  },
  policyRequirements: [
    {
      permissions: ["knowledge:search"],
      rationale: "Knowledge retrieval must remain within declared scopes.",
      requirementId: "scope-knowledge",
      requirementType: "data_scope",
    },
  ],
  riskLevel: CONTENT_AGENT_MANIFEST.riskLevel,
  schemaVersion: "1",
  status: CONTENT_AGENT_MANIFEST.status,
  taskTypes: CONTENT_AGENT_MANIFEST.taskTypes,
  version: CONTENT_AGENT_MANIFEST.version,
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
