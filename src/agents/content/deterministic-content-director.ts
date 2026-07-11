import type { AgentExecutor } from "../agent-runtime.js";
import type { AgentInvocation, AgentResult } from "../../contracts/agent-execution.js";
import type { JsonObject } from "../../contracts/json.js";
import type { Validator, ValidationResult } from "../../validation/validation.js";
import { validationFailure, validationSuccess } from "../../validation/validation.js";
import type { AgentExecutionBinding, AgentExecutorDescriptor } from "../agent-runtime-resolution.js";

export const DETERMINISTIC_CONTENT_DIRECTOR_EXECUTOR_ID = "deterministic-content-director";
export const DETERMINISTIC_CONTENT_DIRECTOR_EXECUTOR_VERSION = "1.0.0";
export const CONTENT_DIRECTOR_AGENT_ID = "content-director";
export const DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR: AgentExecutorDescriptor = deepFreeze({
  executionMode: "DETERMINISTIC_LOCAL",
  executorId: DETERMINISTIC_CONTENT_DIRECTOR_EXECUTOR_ID,
  executorVersion: DETERMINISTIC_CONTENT_DIRECTOR_EXECUTOR_VERSION,
  inputContractId: "content-director-input@1",
  outputContractId: "content-director-output@1",
  roleId: CONTENT_DIRECTOR_AGENT_ID,
  runtimeAgentId: CONTENT_DIRECTOR_AGENT_ID,
  runtimeAgentVersion: "1.0.0",
  safety: { browserUse: false, deterministic: true, externalSideEffects: false, filesystemSideEffects: false, localOnly: true, modelUse: false, networkUse: false, providerUse: false, replaySafe: true, toolUse: false },
  specificationId: "content-director@1.0.0",
  specificationVersion: "1.0.0",
  supportedCapabilityIds: ["content-strategy", "quality-review-preparation"],
});
export const DETERMINISTIC_CONTENT_DIRECTOR_BINDING: AgentExecutionBinding = deepFreeze({
  ...DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR,
  active: true,
});

export interface ContentDirectorDirectionInput {
  readonly objective: string;
  readonly audience: string;
  readonly deliverableType: string;
  readonly brandPreferences: readonly string[];
  readonly constraints: readonly string[];
  readonly evidenceReferences: readonly string[];
}

export interface ContentDirectionArtifact extends JsonObject {
  readonly normalizedObjective: string;
  readonly targetAudience: string;
  readonly messageHierarchy: readonly string[];
  readonly contentPillars: readonly string[];
  readonly recommendedStructure: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly qualityReviewChecklist: readonly string[];
  readonly claimRiskFlags: readonly string[];
  readonly approvalSensitiveElements: readonly string[];
  readonly handoffSummary: string;
  readonly preparationOnly: true;
  readonly externalEffects: false;
}

export class ContentDirectorDirectionInputValidator implements Validator<ContentDirectorDirectionInput> {
  public validate(value: unknown): ValidationResult<ContentDirectorDirectionInput> {
    try { return validationSuccess(validateDirectionInput(value)); }
    catch { return validationFailure([{ code: "content_direction_input_invalid", message: "Content direction input is invalid or contains prohibited material", path: "$" }]); }
  }
}

export class ContentDirectionArtifactValidator implements Validator<ContentDirectionArtifact> {
  public validate(value: unknown): ValidationResult<ContentDirectionArtifact> {
    try {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("artifact must be an object");
      const raw = value as Record<string, unknown>;
      const artifact = value as unknown as ContentDirectionArtifact;
      if (raw.preparationOnly !== true || raw.externalEffects !== false ||
          !boundedArtifactStrings(artifact.messageHierarchy, 10) ||
          !boundedArtifactStrings(artifact.contentPillars, 10) ||
          !boundedArtifactStrings(artifact.recommendedStructure, 10) ||
          !boundedArtifactStrings(artifact.evidenceReferences, 20) ||
          !boundedArtifactStrings(artifact.qualityReviewChecklist, 10) ||
          !boundedArtifactStrings(artifact.claimRiskFlags, 10) ||
          !boundedArtifactStrings(artifact.approvalSensitiveElements, 20) ||
          boundedString(artifact.normalizedObjective, 2_000).length === 0 ||
          boundedString(artifact.targetAudience, 1_000).length === 0 ||
          boundedString(artifact.handoffSummary, 2_000).length === 0) throw new Error("artifact is invalid");
      return validationSuccess(deepFreeze(structuredClone(artifact)));
    } catch { return validationFailure([{ code: "content_direction_output_invalid", message: "Content direction artifact is invalid", path: "$" }]); }
  }
}

export class DeterministicContentDirectorExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({ agentId: CONTENT_DIRECTOR_AGENT_ID, version: "1.0.0" });

  public execute(invocation: AgentInvocation): Promise<AgentResult> {
    const input = validateInvocationInput(invocation);
    const evidence = input.evidenceReferences;
    const channel = input.deliverableType;
    const candidate = {
      approvalSensitiveElements: input.constraints.filter((item) => /approv|legal|price|claim/iu.test(item)),
      claimRiskFlags: evidence.length === 0 ? ["Claims require supplied evidence before external use"] : [],
      contentPillars: stableUnique([input.objective, ...input.brandPreferences]).slice(0, 5),
      evidenceReferences: evidence,
      externalEffects: false,
      handoffSummary: `Prepare a ${channel} from this direction; verify evidence and obtain required approval before external use.`,
      messageHierarchy: [input.objective, `For ${input.audience}`, `Adapt to ${channel}`],
      normalizedObjective: input.objective,
      preparationOnly: true,
      qualityReviewChecklist: ["Objective is explicit", "Audience fit is visible", "Claims map to supplied evidence", "Approval-sensitive elements are flagged"],
      recommendedStructure: ["Opening context", "Core message", "Evidence or proof points", "Review and approval notes"],
      targetAudience: input.audience,
    } satisfies ContentDirectionArtifact;
    const validation = new ContentDirectionArtifactValidator().validate(candidate);
    if (!validation.ok) throw new Error("deterministic Content Director produced invalid output");
    const output = validation.value;
    return Promise.resolve(deepFreeze({
      agent: this.agent,
      completedAt: "1970-01-01T00:00:00.000Z",
      contractVersion: "1",
      evidence: [],
      invocationId: invocation.invocationId,
      memoryProposals: [],
      output,
      status: "succeeded",
      taskId: invocation.taskId,
      usage: { modelCalls: 0, toolCalls: 0 },
    }));
  }
}

function validateInvocationInput(invocation: AgentInvocation): ContentDirectorDirectionInput {
  if (invocation.agent.agentId !== CONTENT_DIRECTOR_AGENT_ID || invocation.agent.version !== "1.0.0" ||
      invocation.outputContract.contractId !== "content-director-output" || invocation.outputContract.contractVersion !== "1") {
    throw new Error("deterministic Content Director invocation identity is invalid");
  }
  return validateDirectionInput(invocation.input);
}

function validateDirectionInput(candidate: unknown): ContentDirectorDirectionInput {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new Error("input must be an object");
  const value = candidate as Record<string, unknown>;
  const allowed = new Set(["objective", "audience", "deliverableType", "brandPreferences", "constraints", "evidenceReferences"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("deterministic Content Director input contains an unsupported field");
  const objective = boundedString(value.objective, 2_000);
  const audience = boundedString(value.audience, 1_000);
  const deliverableType = boundedString(value.deliverableType, 100);
  const brandPreferences = boundedStrings(value.brandPreferences, 10, 500);
  const constraints = boundedStrings(value.constraints, 20, 500);
  const evidenceReferences = boundedStrings(value.evidenceReferences, 20, 256);
  const allText = [objective, audience, deliverableType, ...brandPreferences, ...constraints, ...evidenceReferences].join(" ");
  if (/(api[_ -]?key|password|secret|raw prompt|raw completion|provider payload|tool call|https?:\/\/|execute command)/iu.test(allText)) {
    throw new Error("deterministic Content Director input contains prohibited material");
  }
  return deepFreeze({ audience, brandPreferences: stableUnique(brandPreferences), constraints: stableUnique(constraints), deliverableType, evidenceReferences: stableUnique(evidenceReferences), objective });
}
function boundedString(value: unknown, max: number): string { if (typeof value !== "string") throw new Error("required bounded string is missing"); const normalized = value.trim().replace(/\s+/gu, " "); if (normalized.length === 0 || normalized.length > max) throw new Error("bounded string is invalid"); return normalized; }
function boundedStrings(value: unknown, count: number, max: number): readonly string[] { if (!Array.isArray(value) || value.length > count) throw new Error("bounded string list is invalid"); return value.map((entry) => boundedString(entry, max)); }
function boundedArtifactStrings(value: unknown, count: number): value is readonly string[] { return Array.isArray(value) && value.length <= count && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 2_000); }
function stableUnique(values: readonly string[]): readonly string[] { return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b))); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
