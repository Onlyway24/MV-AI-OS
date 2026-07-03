import type { AgentSpecificationRegistry } from "../agents/specification/agent-specification-registry.js";
import type { AgentCapability } from "../agents/specification/agent-capability.js";
import type {
  BuildExecutionContextInput,
  ExecutionContextBuilder,
} from "../core/execution-context-builder.js";
import type {
  ExecutionContext,
  SupplementalContextItem,
} from "../core/models/execution-context.js";
import type { JsonObject } from "../contracts/json.js";
import { InvariantError } from "../errors/core-error.js";
import type { KnowledgeRecord } from "./knowledge-record.js";
import type { KnowledgeService } from "./knowledge-service.js";

export class KnowledgeExecutionContextBuilder
  implements ExecutionContextBuilder
{
  readonly #baseBuilder: ExecutionContextBuilder;
  readonly #knowledge: KnowledgeService;
  readonly #limit: number;
  readonly #specifications: AgentSpecificationRegistry;

  public constructor(
    baseBuilder: ExecutionContextBuilder,
    knowledge: KnowledgeService,
    specifications: AgentSpecificationRegistry,
    limit = 20,
  ) {
    this.#baseBuilder = baseBuilder;
    this.#knowledge = knowledge;
    this.#specifications = specifications;
    this.#limit = limit;
  }

  public async build(
    input: BuildExecutionContextInput,
  ): Promise<ExecutionContext> {
    const base = await this.#baseBuilder.build(input);
    if (!input.effectivePermissions.includes("knowledge:search")) {
      return base;
    }

    const specification = this.#specifications.get(
      input.agent.agentId,
      input.agent.version,
    );
    if (specification === undefined) {
      throw new InvariantError(
        "Knowledge context requires an exact Agent Specification",
        "context_assembly",
        {
          agentId: input.agent.agentId,
          agentVersion: input.agent.version,
        },
      );
    }
    const allowedScopes = knowledgeScopes(specification.capabilities);
    if (allowedScopes.length === 0) {
      return base;
    }

    const result = await this.#knowledge.search({
      contractVersion: input.request.contractVersion,
      limit: this.#limit,
      queryId: `knowledge:${input.contextId}`,
      scope: {
        actorId: input.request.actorId,
        agentId: input.agent.agentId,
        allowedScopes,
        effectivePermissions: ["knowledge:search"],
        permissionTags: [],
        taskId: input.taskId,
        workspaceId: input.request.workspaceId,
      },
      text: input.request.instruction,
    });

    return Object.freeze({
      ...base,
      supplementalContext: Object.freeze([
        ...base.supplementalContext,
        ...result.records.map(toContextItem),
      ]),
    });
  }
}

function knowledgeScopes(
  capabilities: readonly AgentCapability[],
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        capabilities.flatMap((capability) =>
          capability.capabilityType === "knowledge.search"
            ? (capability.scopes ?? [])
            : [],
        ),
      ),
    ].sort(compareText),
  );
}

function toContextItem(record: KnowledgeRecord): SupplementalContextItem {
  const metadata: JsonObject = {
    requiredScopes: record.requiredScopes,
    source: {
      capturedAt: record.source.capturedAt,
      ...(record.source.locator === undefined
        ? {}
        : { locator: record.source.locator }),
      ...(record.source.publisher === undefined
        ? {}
        : { publisher: record.source.publisher }),
      sourceId: record.source.sourceId,
      sourceType: record.source.sourceType,
      title: record.source.title,
    },
    tags: record.tags,
    title: record.title,
    verifiedAt: record.verifiedAt,
  };
  return Object.freeze({
    content: record.content,
    metadata,
    referenceId: record.knowledgeId,
    source: "knowledge",
  });
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
