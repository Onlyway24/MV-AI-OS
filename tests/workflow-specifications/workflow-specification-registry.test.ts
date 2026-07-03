import { describe, expect, it } from "vitest";

import { WorkflowSpecificationRegistryError } from "../../src/index.js";
import { InMemoryWorkflowSpecificationRegistry } from "../support/in-memory-workflow-specification-registry.js";
import {
  createWorkflowSpecification,
  createWorkflowSpecificationValidator,
} from "./fixtures.js";

describe("InMemoryWorkflowSpecificationRegistry", () => {
  const validator = createWorkflowSpecificationValidator();

  it("returns deterministic immutable specifications", () => {
    const registry = new InMemoryWorkflowSpecificationRegistry(
      [
        createWorkflowSpecification({
          workflowId: "support-triage",
        }),
        createWorkflowSpecification(),
      ],
      validator,
    );

    expect(registry.list().map(({ workflowId }) => workflowId)).toEqual([
      "research-and-compose",
      "support-triage",
    ]);
    expect(
      registry.get("research-and-compose", "1.0.0"),
    ).toBeDefined();
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(
      Object.isFrozen(registry.get("research-and-compose", "1.0.0")),
    ).toBe(true);
    expect(
      Object.isFrozen(
        registry.get("research-and-compose", "1.0.0")?.steps,
      ),
    ).toBe(true);
  });

  it("supports multiple versions with exact lookup", () => {
    const registry = new InMemoryWorkflowSpecificationRegistry(
      [
        createWorkflowSpecification({ version: "2.0.0" }),
        createWorkflowSpecification({ version: "1.0.0" }),
      ],
      validator,
    );

    expect(
      registry
        .listVersions("research-and-compose")
        .map(({ version }) => version),
    ).toEqual(["1.0.0", "2.0.0"]);
    expect(
      registry.get("research-and-compose", "2.0.0")?.version,
    ).toBe("2.0.0");
    expect(
      registry.get("research-and-compose", "3.0.0"),
    ).toBeUndefined();
  });

  it("rejects duplicate workflow ID and version pairs", () => {
    expect(
      () =>
        new InMemoryWorkflowSpecificationRegistry(
          [
            createWorkflowSpecification(),
            createWorkflowSpecification(),
          ],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<
        Partial<WorkflowSpecificationRegistryError>
      >({
        code: "workflow_specification_duplicate",
      }),
    );
  });

  it("rejects invalid workflows before registration", () => {
    expect(
      () =>
        new InMemoryWorkflowSpecificationRegistry(
          [createWorkflowSpecification({ version: "latest" })],
          validator,
        ),
    ).toThrow(
      expect.objectContaining<
        Partial<WorkflowSpecificationRegistryError>
      >({
        code: "workflow_specification_invalid",
      }),
    );
  });

  it("lists only active specifications", () => {
    const registry = new InMemoryWorkflowSpecificationRegistry(
      [
        createWorkflowSpecification(),
        createWorkflowSpecification({
          status: "disabled",
          workflowId: "support-triage",
        }),
      ],
      validator,
    );

    expect(
      registry.listActive().map(({ workflowId }) => workflowId),
    ).toEqual(["research-and-compose"]);
  });
});
