import type { AgentSpecification } from "./agent-specification.js";
import { AgentSpecificationRegistryError } from "./agent-specification-error.js";
import type { AgentSpecificationRegistry } from "./agent-specification-registry.js";
import type { Validator } from "../../validation/validation.js";

export class ImmutableAgentSpecificationRegistry
  implements AgentSpecificationRegistry
{
  readonly #byKey: ReadonlyMap<string, AgentSpecification>;
  readonly #specifications: readonly AgentSpecification[];

  public constructor(
    candidates: readonly unknown[],
    validator: Validator<AgentSpecification>,
  ) {
    const byKey = new Map<string, AgentSpecification>();
    const specifications: AgentSpecification[] = [];

    for (const candidate of candidates) {
      const validation = validator.validate(candidate);
      if (!validation.ok) {
        throw new AgentSpecificationRegistryError(
          "agent_specification_invalid",
          "An agent specification failed validation",
          {
            issues: validation.issues.map(({ code, message, path }) => ({
              code,
              message,
              path,
            })),
          },
        );
      }
      const specification = cloneFrozen(validation.value);
      const key = specificationKey(
        specification.agentId,
        specification.version,
      );
      if (byKey.has(key)) {
        throw new AgentSpecificationRegistryError(
          "agent_specification_duplicate",
          `Agent specification ${key} is registered more than once`,
          {
            agentId: specification.agentId,
            version: specification.version,
          },
        );
      }
      byKey.set(key, specification);
      specifications.push(specification);
    }

    specifications.sort(compareSpecifications);
    this.#byKey = byKey;
    this.#specifications = Object.freeze(specifications);
  }

  public get(
    agentId: string,
    version: string,
  ): AgentSpecification | undefined {
    return this.#byKey.get(specificationKey(agentId, version));
  }

  public list(): readonly AgentSpecification[] {
    return this.#specifications;
  }

  public listVersions(
    agentId: string,
  ): readonly AgentSpecification[] {
    return Object.freeze(
      this.#specifications.filter(
        (specification) => specification.agentId === agentId,
      ),
    );
  }

  public findActiveByTaskType(
    taskType: string,
  ): readonly AgentSpecification[] {
    return Object.freeze(
      this.#specifications.filter(
        (specification) =>
          specification.status === "active" &&
          specification.taskTypes.includes(taskType),
      ),
    );
  }
}

function specificationKey(agentId: string, version: string): string {
  return `${agentId}@${version}`;
}

function compareSpecifications(
  left: AgentSpecification,
  right: AgentSpecification,
): number {
  const agentComparison = compareText(left.agentId, right.agentId);
  return agentComparison === 0
    ? compareText(left.version, right.version)
    : agentComparison;
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
