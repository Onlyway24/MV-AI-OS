import type {
  BuildExecutionContextInput,
  ExecutionContextBuilder,
} from "../core/execution-context-builder.js";
import type {
  ExecutionContext,
  SupplementalContextItem,
} from "../core/models/execution-context.js";
import type { JsonObject } from "../contracts/json.js";
import type { MemoryCategory } from "./memory-record.js";
import type { MemoryReadPermission } from "./memory-scope.js";

export class MemoryExecutionContextBuilder implements ExecutionContextBuilder {
  readonly #baseBuilder: ExecutionContextBuilder;
  readonly #limit: number;
  readonly #permissions: readonly MemoryReadPermission[];

  public constructor(
    baseBuilder: ExecutionContextBuilder,
    permissions: readonly MemoryReadPermission[],
    limit = 20,
  ) {
    this.#baseBuilder = baseBuilder;
    this.#permissions = Object.freeze([...permissions]);
    this.#limit = limit;
  }

  public async build(
    input: BuildExecutionContextInput,
  ): Promise<ExecutionContext> {
    const base = await this.#baseBuilder.build(input);
    const categories = categoriesForScope(
      this.#permissions,
      input.request.sessionId,
    );
    if (categories.length === 0) {
      return base;
    }

    const result = await input.memory.retrieve({
      categories,
      contractVersion: "1",
      limit: this.#limit,
      queryId: `memory:${input.contextId}`,
      scope: {
        actorId: input.request.actorId,
        permissions: this.#permissions,
        permissionTags: Object.freeze([]),
        ...(input.request.sessionId === undefined
          ? {}
          : { sessionId: input.request.sessionId }),
        taskId: input.taskId,
        workspaceId: input.request.workspaceId,
      },
    });
    const memoryContext = result.records.map(toContextItem);

    return Object.freeze({
      ...base,
      supplementalContext: Object.freeze([
        ...base.supplementalContext,
        ...memoryContext,
      ]),
    });
  }
}

function categoriesForScope(
  permissions: readonly MemoryReadPermission[],
  sessionId: string | undefined,
): readonly MemoryCategory[] {
  const categories = permissions.map((permission) =>
    permission.slice("memory:read:".length) as MemoryCategory,
  );
  return Object.freeze(
    categories.filter(
      (category, index) =>
        (category !== "conversation" || sessionId !== undefined) &&
        categories.indexOf(category) === index,
    ),
  );
}

function toContextItem(
  record: Awaited<
    ReturnType<BuildExecutionContextInput["memory"]["retrieve"]>
  >["records"][number],
): SupplementalContextItem {
  const metadata: JsonObject = {
    category: record.category,
    provenance: {
      ...record.provenance,
    },
    sensitivity: record.sensitivity,
  };

  return Object.freeze({
    content: record.content,
    metadata,
    referenceId: record.memoryId,
    source: record.category === "conversation" ? "conversation" : "memory",
  });
}
