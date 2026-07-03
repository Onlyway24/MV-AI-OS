import {
  WorkflowSpecificationRegistryError,
  type Validator,
  type WorkflowSpecification,
  type WorkflowSpecificationRegistry,
} from "../../src/index.js";

export class InMemoryWorkflowSpecificationRegistry
  implements WorkflowSpecificationRegistry
{
  readonly #byKey: ReadonlyMap<string, WorkflowSpecification>;
  readonly #specifications: readonly WorkflowSpecification[];

  public constructor(
    candidates: readonly unknown[],
    validator: Validator<WorkflowSpecification>,
  ) {
    const byKey = new Map<string, WorkflowSpecification>();
    const specifications: WorkflowSpecification[] = [];

    for (const candidate of candidates) {
      const validation = validator.validate(candidate);
      if (!validation.ok) {
        throw new WorkflowSpecificationRegistryError(
          "workflow_specification_invalid",
          "A workflow specification failed validation",
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
        specification.workflowId,
        specification.version,
      );
      if (byKey.has(key)) {
        throw new WorkflowSpecificationRegistryError(
          "workflow_specification_duplicate",
          `Workflow specification ${key} is registered more than once`,
          {
            version: specification.version,
            workflowId: specification.workflowId,
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
    workflowId: string,
    version: string,
  ): WorkflowSpecification | undefined {
    return this.#byKey.get(specificationKey(workflowId, version));
  }

  public list(): readonly WorkflowSpecification[] {
    return this.#specifications;
  }

  public listVersions(
    workflowId: string,
  ): readonly WorkflowSpecification[] {
    return Object.freeze(
      this.#specifications.filter(
        (specification) => specification.workflowId === workflowId,
      ),
    );
  }

  public listActive(): readonly WorkflowSpecification[] {
    return Object.freeze(
      this.#specifications.filter(
        (specification) => specification.status === "active",
      ),
    );
  }
}

function specificationKey(workflowId: string, version: string): string {
  return `${workflowId}@${version}`;
}

function compareSpecifications(
  left: WorkflowSpecification,
  right: WorkflowSpecification,
): number {
  const workflowComparison = compareText(
    left.workflowId,
    right.workflowId,
  );
  return workflowComparison === 0
    ? compareText(left.version, right.version)
    : workflowComparison;
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
