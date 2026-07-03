import {
  ToolDefinitionRegistryError,
  type ToolDefinition,
  type ToolRegistry,
  type Validator,
} from "../../src/index.js";

export class InMemoryToolRegistry implements ToolRegistry {
  readonly #byKey: ReadonlyMap<string, ToolDefinition>;
  readonly #definitions: readonly ToolDefinition[];

  public constructor(
    candidates: readonly unknown[],
    validator: Validator<ToolDefinition>,
  ) {
    const byKey = new Map<string, ToolDefinition>();
    const definitions: ToolDefinition[] = [];

    for (const candidate of candidates) {
      const validation = validator.validate(candidate);
      if (!validation.ok) {
        throw new ToolDefinitionRegistryError(
          "tool_definition_invalid",
          "A tool definition failed validation",
          {
            issues: validation.issues.map(({ code, message, path }) => ({
              code,
              message,
              path,
            })),
          },
        );
      }
      const definition = cloneFrozen(validation.value);
      const key = definitionKey(definition.toolId, definition.version);
      if (byKey.has(key)) {
        throw new ToolDefinitionRegistryError(
          "tool_definition_duplicate",
          `Tool definition ${key} is registered more than once`,
          {
            toolId: definition.toolId,
            version: definition.version,
          },
        );
      }
      byKey.set(key, definition);
      definitions.push(definition);
    }

    definitions.sort(compareDefinitions);
    this.#byKey = byKey;
    this.#definitions = Object.freeze(definitions);
  }

  public get(
    toolId: string,
    version: string,
  ): ToolDefinition | undefined {
    return this.#byKey.get(definitionKey(toolId, version));
  }

  public list(): readonly ToolDefinition[] {
    return this.#definitions;
  }

  public listVersions(toolId: string): readonly ToolDefinition[] {
    return Object.freeze(
      this.#definitions.filter(
        (definition) => definition.toolId === toolId,
      ),
    );
  }
}

function definitionKey(toolId: string, version: string): string {
  return `${toolId}@${version}`;
}

function compareDefinitions(
  left: ToolDefinition,
  right: ToolDefinition,
): number {
  const toolComparison = compareText(left.toolId, right.toolId);
  return toolComparison === 0
    ? compareText(left.version, right.version)
    : toolComparison;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
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
