import {
  assertContentAgentInvocation,
  collectContentEvidence,
} from "./content-agent-boundary.js";
import {
  CONTENT_AGENT_INSTRUCTIONS,
  CONTENT_AGENT_INSTRUCTIONS_REF,
} from "./content-agent-instructions.js";
import { MODEL_BACKED_CONTENT_AGENT_IMPLEMENTATION_REF } from "./content-agent-specification.js";
import { CONTENT_AGENT_MANIFEST } from "./content-agent-manifest.js";
import type { ContentOutput } from "./content-output.js";
import type { AgentExecutor } from "../agent-runtime.js";
import type { AgentSpecification } from "../specification/agent-specification.js";
import type { AgentSpecificationRegistry } from "../specification/agent-specification-registry.js";
import type {
  AgentInvocation,
  AgentResult,
  EvidenceReference,
} from "../../contracts/agent-execution.js";
import type {
  ErrorCategory,
  ErrorRecord,
} from "../../contracts/error-record.js";
import type { JsonObject } from "../../contracts/json.js";
import { AgentRuntimeError } from "../../errors/core-error.js";
import type { LlmGateway } from "../../models/llm-gateway.js";
import type { ModelError } from "../../models/model-error.js";
import type { ModelRequest } from "../../models/model-request.js";
import type { ModelResponse } from "../../models/model-response.js";
import type { Clock } from "../../ports/clock.js";
import { asRecord } from "../../validation/primitives.js";
import type {
  ValidationIssue,
  Validator,
} from "../../validation/validation.js";

export interface ModelBackedContentAgentDependencies {
  readonly clock: Clock;
  readonly gateway: LlmGateway;
  readonly outputValidator: Validator<ContentOutput>;
  readonly specifications: AgentSpecificationRegistry;
}

export class ModelBackedContentAgent implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });

  readonly #dependencies: ModelBackedContentAgentDependencies;

  public constructor(dependencies: ModelBackedContentAgentDependencies) {
    this.#dependencies = dependencies;
  }

  public async execute(invocation: AgentInvocation): Promise<unknown> {
    assertContentAgentInvocation(invocation);
    const evidence = collectContentEvidence(invocation.context);
    const requestedOutput = asRecord(invocation.input.requestedOutput);
    if (readString(requestedOutput?.contentType) === undefined) {
      return this.#result(invocation, {
        evidence,
        status: "needs_input",
      });
    }

    const specification = this.#dependencies.specifications.get(
      invocation.agent.agentId,
      invocation.agent.version,
    );
    if (specification === undefined) {
      return this.#failure(
        invocation,
        evidence,
        "agent_specification_not_found",
        "The exact Content Agent specification is not registered",
        "not_found",
        "agent_specification",
      );
    }
    const compatibilityError = specificationError(
      invocation,
      specification,
    );
    if (compatibilityError !== undefined) {
      return this.#failure(
        invocation,
        evidence,
        "agent_specification_incompatible",
        compatibilityError,
        "validation",
        "agent_specification",
      );
    }

    const modelPermission =
      `model:invoke:${invocation.limits.modelProfile}` as const;
    if (!invocation.permissions.includes(modelPermission)) {
      return this.#failure(
        invocation,
        evidence,
        "model_permission_denied",
        "The invocation does not grant the required model permission",
        "authorization",
        "model_authorization",
      );
    }

    const payload = {
      context: invocation.context,
      input: invocation.input,
      objective: invocation.objective,
    };
    if (
      Buffer.byteLength(JSON.stringify(payload), "utf8") >
      specification.limits.maxInputBytes
    ) {
      return this.#failure(
        invocation,
        evidence,
        "agent_input_too_large",
        "The model input exceeds the Agent Specification limit",
        "validation",
        "model_request",
      );
    }

    const response = await this.#dependencies.gateway.generate(
      createModelRequest(invocation, specification, payload),
    );
    if (response.status === "failed") {
      return this.#modelFailure(invocation, evidence, response);
    }
    if (response.output.format !== "json") {
      return this.#failure(
        invocation,
        evidence,
        "model_output_format_invalid",
        "The model did not return structured JSON content",
        "validation",
        "content_output_validation",
        response.completedAt,
        modelUsage(response),
      );
    }

    const candidate = {
      ...response.output.value,
      memoryRefs: evidence
        .filter(({ source }) => source !== "knowledge")
        .map(({ referenceId }) => referenceId),
      sourceRefs: evidence
        .filter(({ source }) => source === "knowledge")
        .map(({ referenceId }) => referenceId),
    };
    const outputValidation =
      this.#dependencies.outputValidator.validate(candidate);
    if (!outputValidation.ok) {
      return this.#failure(
        invocation,
        evidence,
        "content_output_invalid",
        "The model output does not satisfy the ContentOutput contract",
        "validation",
        "content_output_validation",
        response.completedAt,
        modelUsage(response),
        outputValidation.issues,
      );
    }

    return this.#result(
      invocation,
      {
        evidence,
        output: outputValidation.value,
        status: "succeeded",
      },
      response.completedAt,
      modelUsage(response),
    );
  }

  #modelFailure(
    invocation: AgentInvocation,
    evidence: readonly EvidenceReference[],
    response: Extract<ModelResponse, { readonly status: "failed" }>,
  ): AgentResult {
    return this.#result(
      invocation,
      {
        error: toErrorRecord(response.error),
        evidence,
        status: "failed",
      },
      response.completedAt,
      {
        modelCalls: 1,
        ...(response.usage === undefined
          ? {}
          : {
              modelUsage: {
                ...response.usage,
              },
            }),
        toolCalls: 0,
      },
    );
  }

  #failure(
    invocation: AgentInvocation,
    evidence: readonly EvidenceReference[],
    code: string,
    message: string,
    category: ErrorCategory,
    stage: string,
    completedAt = this.#timestamp(),
    usage: JsonObject = { modelCalls: 0, toolCalls: 0 },
    issues?: readonly ValidationIssue[],
  ): AgentResult {
    return this.#result(
      invocation,
      {
        error: {
          category,
          code,
          ...(issues === undefined
            ? {}
            : {
                details: {
                  issues: issues.map(({ code: issueCode, message: detail, path }) => ({
                    code: issueCode,
                    message: detail,
                    path,
                  })),
                },
              }),
          message,
          occurredAt: completedAt,
          retryable: false,
          stage,
        },
        evidence,
        status: "failed",
      },
      completedAt,
      usage,
    );
  }

  #result(
    invocation: AgentInvocation,
    values:
      | {
          readonly status: "failed";
          readonly evidence: readonly EvidenceReference[];
          readonly error: ErrorRecord;
        }
      | {
          readonly status: "needs_input";
          readonly evidence: readonly EvidenceReference[];
        }
      | {
          readonly status: "succeeded";
          readonly evidence: readonly EvidenceReference[];
          readonly output: ContentOutput;
        },
    completedAt = this.#timestamp(),
    usage: JsonObject = { modelCalls: 0, toolCalls: 0 },
  ): AgentResult {
    return {
      agent: this.agent,
      completedAt,
      contractVersion: "1",
      ...(values.status === "failed" ? { error: values.error } : {}),
      evidence: values.evidence,
      invocationId: invocation.invocationId,
      memoryProposals: Object.freeze([]),
      ...(values.status === "succeeded" ? { output: values.output } : {}),
      status: values.status,
      taskId: invocation.taskId,
      usage,
    };
  }

  #timestamp(): string {
    const value = this.#dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new AgentRuntimeError(
        "agent_runtime_invariant",
        "Clock returned an invalid date",
      );
    }
    return value.toISOString();
  }
}

function createModelRequest(
  invocation: AgentInvocation,
  specification: AgentSpecification,
  payload: JsonObject,
): ModelRequest {
  const maxOutputTokens = specification.limits.maxTokens;
  if (maxOutputTokens === undefined) {
    throw new AgentRuntimeError(
      "agent_runtime_invariant",
      "Content Agent specification requires maxTokens",
    );
  }
  const boundedOutputTokens = Math.min(
    maxOutputTokens,
    invocation.limits.maxTokens ?? maxOutputTokens,
  );
  const boundedCost = minimumDefined(
    specification.limits.maxCostUsd,
    invocation.limits.maxCostUsd,
  );
  return {
    contractVersion: invocation.contractVersion,
    correlationId: invocation.correlationId,
    invocationId: invocation.invocationId,
    limits: {
      ...(boundedCost === undefined ? {} : { maxCostUsd: boundedCost }),
      maxOutputTokens: boundedOutputTokens,
      timeoutMs: Math.min(
        invocation.limits.timeoutMs,
        specification.limits.timeoutMs,
      ),
    },
    messages: [
      {
        content: CONTENT_AGENT_INSTRUCTIONS,
        role: "system",
      },
      {
        content: JSON.stringify(payload),
        role: "user",
      },
    ],
    metadata: {
      agentId: invocation.agent.agentId,
      agentVersion: invocation.agent.version,
      instructionsRef: specification.instructionsRef,
    },
    modelProfile: invocation.limits.modelProfile,
    modelRequestId: `model:${invocation.invocationId}:1`,
    output: {
      format: "json",
      schema: specification.outputSchema.schema,
    },
    taskId: invocation.taskId,
  };
}

function specificationError(
  invocation: AgentInvocation,
  specification: AgentSpecification,
): string | undefined {
  if (
    specification.implementationRef !==
      MODEL_BACKED_CONTENT_AGENT_IMPLEMENTATION_REF ||
    specification.instructionsRef !== CONTENT_AGENT_INSTRUCTIONS_REF ||
    specification.outputSchema.contractId !==
      invocation.outputContract.contractId ||
    specification.outputSchema.contractVersion !==
      invocation.outputContract.contractVersion
  ) {
    return "The Agent Specification does not match the selected implementation";
  }
  const permission =
    `model:invoke:${invocation.limits.modelProfile}` as const;
  if (
    !specification.capabilities.some(
      (capability) =>
        capability.capabilityType === "model.invoke" &&
        capability.permission === permission,
    )
  ) {
    return "The Agent Specification does not declare the selected model profile";
  }
  if (specification.limits.maxTokens === undefined) {
    return "The Agent Specification does not declare a model token limit";
  }
  return undefined;
}

function modelUsage(
  response: Extract<ModelResponse, { readonly status: "succeeded" }>,
): JsonObject {
  return {
    modelCalls: 1,
    modelUsage: {
      ...response.usage,
    },
    toolCalls: 0,
  };
}

function toErrorRecord(error: ModelError): ErrorRecord {
  return {
    category: modelErrorCategory(error.category),
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details }),
    message: error.message,
    occurredAt: error.occurredAt,
    retryable: error.retryable,
    stage: error.stage,
  };
}

function modelErrorCategory(
  category: ModelError["category"],
): ErrorCategory {
  return category === "provider" ? "model" : category;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function minimumDefined(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) {
    return right;
  }
  return right === undefined ? left : Math.min(left, right);
}
