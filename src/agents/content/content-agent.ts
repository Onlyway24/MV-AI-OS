import { CONTENT_AGENT_MANIFEST } from "./content-agent-manifest.js";
import {
  assertContentAgentInvocation,
  collectContentEvidence,
} from "./content-agent-boundary.js";
import type { ContentOutput } from "./content-output.js";
import type { AgentExecutor } from "../agent-runtime.js";
import type {
  AgentInvocation,
  AgentResult,
  EvidenceReference,
} from "../../contracts/agent-execution.js";
import { AgentRuntimeError } from "../../errors/core-error.js";
import type { Clock } from "../../ports/clock.js";
import {
  asRecord,
  isJsonObject,
} from "../../validation/primitives.js";
import type { Validator } from "../../validation/validation.js";

export class ContentAgent implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });

  readonly #clock: Clock;
  readonly #outputValidator: Validator<ContentOutput>;

  public constructor(clock: Clock, outputValidator: Validator<ContentOutput>) {
    this.#clock = clock;
    this.#outputValidator = outputValidator;
  }

  public execute(invocation: AgentInvocation): Promise<unknown> {
    assertContentAgentInvocation(invocation);

    const requestedOutput = asRecord(invocation.input.requestedOutput);
    const contentType = readString(requestedOutput?.contentType);
    if (contentType === undefined) {
      return Promise.resolve(
        this.#result(invocation, {
          evidence: collectContentEvidence(invocation.context),
          status: "needs_input",
        }),
      );
    }

    const constraints = asRecord(invocation.input.constraints);
    const data = isJsonObject(invocation.input.data)
      ? invocation.input.data
      : undefined;
    const audience = readString(constraints?.audience) ?? "general audience";
    const tone = readString(constraints?.tone) ?? "clear";
    const language = readString(constraints?.language) ?? "en";
    const channel = readString(constraints?.channel) ?? "unspecified";
    const format = readString(requestedOutput?.format) ?? "structured";
    const callToAction = readString(constraints?.callToAction);
    const product = readString(data?.product);
    const title =
      readString(requestedOutput?.title) ??
      (product === undefined
        ? `Draft ${toTitleCase(contentType)}`
        : `${product}: ${toTitleCase(contentType)}`);
    const evidence = collectContentEvidence(invocation.context);
    const output: ContentOutput = {
      assumptions: [
        ...(readString(constraints?.audience) === undefined
          ? ["Audience defaulted to general audience"]
          : []),
        ...(readString(constraints?.tone) === undefined
          ? ["Tone defaulted to clear"]
          : []),
        ...(readString(constraints?.language) === undefined
          ? ["Language defaulted to en"]
          : []),
      ],
      audience,
      body: {
        ...(data === undefined ? {} : { facts: data }),
        heading: title,
        message: invocation.objective,
      },
      ...(callToAction === undefined ? {} : { callToAction }),
      contentType,
      language,
      memoryRefs: evidence
        .filter(({ source }) => source !== "knowledge")
        .map(({ referenceId }) => referenceId),
      metadata: {
        channel,
        characterCount: invocation.objective.length,
        format,
        generator: "deterministic-content-agent",
      },
      sourceRefs: evidence
        .filter(({ source }) => source === "knowledge")
        .map(({ referenceId }) => referenceId),
      summary: `${title} prepared for ${audience}.`,
      title,
      tone,
      warnings: [],
    };
    const validation = this.#outputValidator.validate(output);
    if (!validation.ok) {
      throw new AgentRuntimeError(
        "agent_runtime_invariant",
        "Content Agent generated an invalid ContentOutput",
        {
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }

    return Promise.resolve(
      this.#result(invocation, {
        evidence,
        output: validation.value,
        status: "succeeded",
      }),
    );
  }

  #result(
    invocation: AgentInvocation,
    values:
      | {
          readonly status: "needs_input";
          readonly evidence: readonly EvidenceReference[];
        }
      | {
          readonly status: "succeeded";
          readonly evidence: readonly EvidenceReference[];
          readonly output: ContentOutput;
        },
  ): AgentResult {
    return {
      agent: this.agent,
      completedAt: this.#timestamp(),
      contractVersion: "1",
      evidence: values.evidence,
      invocationId: invocation.invocationId,
      memoryProposals: Object.freeze([]),
      ...(values.status === "succeeded" ? { output: values.output } : {}),
      status: values.status,
      taskId: invocation.taskId,
      usage: {
        modelCalls: 0,
        toolCalls: 0,
      },
    };
  }

  #timestamp(): string {
    const value = this.#clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new AgentRuntimeError(
        "agent_runtime_invariant",
        "Clock returned an invalid date",
      );
    }
    return value.toISOString();
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toTitleCase(value: string): string {
  return value
    .split(/[._\s-]+/u)
    .filter((part) => part.length > 0)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
}
