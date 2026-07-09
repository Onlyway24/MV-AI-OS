import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import {
  createAgentCompanyAgentSpecification,
  type AgentCompanyAgentSpecificationInput,
} from "./agent-company-agent-specification-factory.js";

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

type CoreAgentSpecificationInput = Omit<
  AgentCompanyAgentSpecificationInput,
  "maxCostUsd" | "maxTokens" | "version"
>;

function createCoreAgentSpecification(
  input: CoreAgentSpecificationInput,
): AgentSpecification {
  return createAgentCompanyAgentSpecification({
    ...input,
    maxCostUsd: 0.08,
    maxTokens: 2_048,
    version: CORE_AGENT_SPECIFICATION_VERSION,
  });
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
