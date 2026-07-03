import { describe, expect, it } from "vitest";

import type {
  ValidationIssue,
  WorkflowSpecification,
} from "../../src/index.js";
import {
  createWorkflowCondition,
  createWorkflowOutput,
  createWorkflowSpecification,
  createWorkflowSpecificationValidator,
  createWorkflowStep,
  createWorkflowTransition,
} from "./fixtures.js";

describe("WorkflowSpecificationValidator", () => {
  const validator = createWorkflowSpecificationValidator();

  it("accepts valid deterministic workflow specifications", () => {
    const specification = createWorkflowSpecification();
    const first = validator.validate(specification);
    const second = validator.validate(structuredClone(specification));

    expect(first).toEqual(second);
    expect(first).toEqual({
      ok: true,
      value: specification,
    });
  });

  it("rejects duplicate step IDs", () => {
    expectIssue(
      createWorkflowSpecification({
        steps: [
          createWorkflowStep(),
          createWorkflowStep({
            agent: { agentId: "content", version: "1.0.0" },
          }),
        ],
      }),
      "duplicate",
    );
  });

  it("rejects a missing entry step", () => {
    expectIssue(
      createWorkflowSpecification({ entryStepId: "missing" }),
      "entry_step_missing",
    );
  });

  it("rejects unreachable steps", () => {
    const specification = createWorkflowSpecification();
    expectIssue(
      createWorkflowSpecification({
        steps: [
          ...specification.steps,
          createWorkflowStep({
            agent: { agentId: "content", version: "1.0.0" },
            name: "Archive",
            stepId: "archive",
            terminal: true,
          }),
        ],
      }),
      "step_unreachable",
    );
  });

  it("rejects transitions with undeclared endpoints", () => {
    expectIssue(
      createWorkflowSpecification({
        transitions: [
          createWorkflowTransition({ toStepId: "missing" }),
        ],
      }),
      "transition_step_missing",
    );
  });

  it("rejects conditions that reference undeclared steps", () => {
    expectIssue(
      createWorkflowSpecification({
        transitions: [
          createWorkflowTransition({
            condition: createWorkflowCondition({
              sourceStepId: "missing",
            }),
            priority: 0,
            transitionId: "conditional-compose",
          }),
          createWorkflowTransition({
            priority: 1,
            transitionId: "fallback-compose",
          }),
        ],
      }),
      "condition_step_missing",
    );
  });

  it("rejects conditions that read another step's output", () => {
    expectIssue(
      createWorkflowSpecification({
        transitions: [
          createWorkflowTransition({
            condition: createWorkflowCondition({
              sourceStepId: "compose",
            }),
            priority: 0,
            transitionId: "conditional-compose",
          }),
          createWorkflowTransition({
            priority: 1,
            transitionId: "fallback-compose",
          }),
        ],
      }),
      "condition_source_invalid",
    );
  });

  it("rejects invalid transition fallback and priority rules", () => {
    expectIssue(
      createWorkflowSpecification({
        transitions: [
          createWorkflowTransition({
            condition: createWorkflowCondition(),
            priority: 1,
            transitionId: "conditional-compose",
          }),
          createWorkflowTransition({
            priority: 0,
            transitionId: "fallback-compose",
          }),
        ],
      }),
      "transition_priority_invalid",
    );
  });

  it("rejects cycles unless the specification explicitly permits them", () => {
    const cyclic = createCyclicWorkflow();

    expectIssue(cyclic, "workflow_cycle_forbidden");
    expect(
      validator.validate({
        ...cyclic,
        allowCycles: true,
      }).ok,
    ).toBe(true);
  });

  it("rejects output sources that are not terminal", () => {
    expectIssue(
      createWorkflowSpecification({
        output: createWorkflowOutput({
          sourceStepIds: ["research"],
        }),
      }),
      "output_step_not_terminal",
    );
  });

  it("requires every exact agent ID and version to be declared", () => {
    const specification = createWorkflowSpecification();
    expectIssue(
      createWorkflowSpecification({
        steps: specification.steps.map((step) =>
          step.stepId === "compose"
            ? {
                ...step,
                agent: { agentId: "content", version: "2.0.0" },
              }
            : step,
        ),
      }),
      "agent_specification_not_found",
    );
  });

  function expectIssue(
    specification: WorkflowSpecification,
    code: string,
  ): void {
    const validation = validator.validate(specification);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(issueCodes(validation.issues)).toContain(code);
    }
  }
});

function createCyclicWorkflow(): WorkflowSpecification {
  return createWorkflowSpecification({
    steps: [
      createWorkflowStep(),
      createWorkflowStep({
        agent: { agentId: "content", version: "1.0.0" },
        name: "Review",
        stepId: "review",
        terminal: false,
      }),
      createWorkflowStep({
        agent: { agentId: "content", version: "1.0.0" },
        name: "Compose",
        stepId: "compose",
        terminal: true,
      }),
    ],
    transitions: [
      createWorkflowTransition({
        toStepId: "review",
        transitionId: "research-to-review",
      }),
      createWorkflowTransition({
        condition: createWorkflowCondition({
          conditionId: "review-rejected",
          sourceStepId: "review",
        }),
        fromStepId: "review",
        priority: 0,
        toStepId: "research",
        transitionId: "review-to-research",
      }),
      createWorkflowTransition({
        fromStepId: "review",
        priority: 1,
        transitionId: "review-to-compose",
      }),
    ],
  });
}

function issueCodes(issues: readonly ValidationIssue[]): readonly string[] {
  return issues.map(({ code }) => code);
}
