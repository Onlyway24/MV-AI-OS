import { CONTENT_AGENT_MANIFEST } from "./content-agent-manifest.js";
import type {
  AgentInvocation,
  EvidenceReference,
} from "../../contracts/agent-execution.js";
import type { JsonObject } from "../../contracts/json.js";
import { AgentRuntimeError } from "../../errors/core-error.js";
import { asRecord } from "../../validation/primitives.js";

export function assertContentAgentInvocation(
  invocation: AgentInvocation,
): void {
  if (
    invocation.agent.agentId !== CONTENT_AGENT_MANIFEST.agentId ||
    invocation.agent.version !== CONTENT_AGENT_MANIFEST.version ||
    invocation.outputContract.contractId !==
      CONTENT_AGENT_MANIFEST.outputContract.contractId ||
    invocation.outputContract.contractVersion !==
      CONTENT_AGENT_MANIFEST.outputContract.contractVersion
  ) {
    throw new AgentRuntimeError(
      "agent_invocation_invalid",
      "Invocation does not match the Content Agent contract",
    );
  }
}

export function collectContentEvidence(
  context: JsonObject,
): readonly EvidenceReference[] {
  const supplemental = context.supplementalContext;
  if (!Array.isArray(supplemental)) {
    return Object.freeze([]);
  }

  const evidence: EvidenceReference[] = [];
  for (const item of supplemental) {
    const record = asRecord(item);
    const referenceId = readString(record?.referenceId);
    const source = readEvidenceSource(record?.source);
    if (referenceId !== undefined && source !== undefined) {
      evidence.push({ referenceId, source });
    }
  }
  return Object.freeze(evidence);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readEvidenceSource(
  value: unknown,
): EvidenceReference["source"] | undefined {
  return value === "conversation" || value === "knowledge" || value === "memory"
    ? value
    : undefined;
}
