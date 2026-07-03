import type { AgentManifest } from "../agent-manifest.js";
import { CONTENT_AGENT_INSTRUCTIONS_REF } from "./content-agent-instructions.js";

export const CONTENT_AGENT_MANIFEST: AgentManifest = Object.freeze({
  agentId: "content",
  description:
    "Produces structured business content from an approved invocation.",
  handoffTargets: Object.freeze([]),
  inputContract: Object.freeze({
    contractId: "business-content-input",
    contractVersion: "1",
  }),
  instructionsRef: CONTENT_AGENT_INSTRUCTIONS_REF,
  knowledgeAccess: Object.freeze(["general"]),
  limits: Object.freeze({
    maxCostUsd: 0.1,
    maxResultBytes: 262_144,
    maxTokens: 2_048,
    maxToolCalls: 0,
    timeoutMs: 30_000,
  }),
  memoryAccess: Object.freeze({
    proposeWrites: false,
    read: Object.freeze(["conversation", "semantic", "user"] as const),
  }),
  modelProfile: "content-quality",
  name: "Content Agent",
  outputContract: Object.freeze({
    contractId: "content-output",
    contractVersion: "1",
  }),
  riskLevel: "low",
  status: "active",
  taskTypes: Object.freeze(["business.content"]),
  tools: Object.freeze([]),
  version: "1.0.0",
  workflowProposals: Object.freeze([]),
});
