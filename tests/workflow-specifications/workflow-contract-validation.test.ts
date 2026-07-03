import { describe, expect, it } from "vitest";

import {
  WorkflowConditionValidator,
  WorkflowFailurePolicyValidator,
  WorkflowInputValidator,
  WorkflowOutputValidator,
  WorkflowStepValidator,
  WorkflowTransitionValidator,
} from "../../src/index.js";
import {
  createWorkflowCondition,
  createWorkflowFailurePolicy,
  createWorkflowInput,
  createWorkflowOutput,
  createWorkflowStep,
  createWorkflowTransition,
} from "./fixtures.js";

describe("workflow contract validators", () => {
  it("accepts valid public workflow contracts", () => {
    expect(
      new WorkflowInputValidator().validate(createWorkflowInput()).ok,
    ).toBe(true);
    expect(
      new WorkflowOutputValidator().validate(createWorkflowOutput()).ok,
    ).toBe(true);
    expect(
      new WorkflowStepValidator().validate(createWorkflowStep()).ok,
    ).toBe(true);
    expect(
      new WorkflowConditionValidator().validate(
        createWorkflowCondition(),
      ).ok,
    ).toBe(true);
    expect(
      new WorkflowTransitionValidator().validate(
        createWorkflowTransition({
          condition: createWorkflowCondition(),
        }),
      ).ok,
    ).toBe(true);
    expect(
      new WorkflowFailurePolicyValidator().validate(
        createWorkflowFailurePolicy(),
      ).ok,
    ).toBe(true);
  });

  it("rejects malformed input and output contracts", () => {
    const input = new WorkflowInputValidator().validate(
      createWorkflowInput({ schema: { type: "string" } }),
    );
    const duplicateOutput = new WorkflowOutputValidator().validate(
      createWorkflowOutput({
        sourceStepIds: ["compose", "compose"],
      }),
    );
    const malformedOutput = new WorkflowOutputValidator().validate(
      createWorkflowOutput({
        sourceStepIds: ["Compose"],
      }),
    );

    expect(input.ok).toBe(false);
    expect(duplicateOutput.ok).toBe(false);
    expect(malformedOutput.ok).toBe(false);
    if (!input.ok && !duplicateOutput.ok && !malformedOutput.ok) {
      expect(input.issues).toContainEqual(
        expect.objectContaining({ path: "schema.type" }),
      );
      expect(duplicateOutput.issues).toContainEqual(
        expect.objectContaining({ code: "duplicate" }),
      );
      expect(malformedOutput.issues).toContainEqual(
        expect.objectContaining({ code: "invalid_format" }),
      );
    }
  });

  it("rejects invalid condition source and operator combinations", () => {
    const missingStep = new WorkflowConditionValidator().validate({
      conditionId: "is-ready",
      expectedValue: true,
      field: "ready",
      operator: "equals",
      source: "step_output",
    });
    const unexpectedValue = new WorkflowConditionValidator().validate({
      conditionId: "has-input",
      expectedValue: "unexpected",
      field: "instruction",
      operator: "exists",
      source: "workflow_input",
    });
    const invalidValue = new WorkflowConditionValidator().validate({
      conditionId: "is-ready",
      expectedValue: {},
      field: "ready",
      operator: "equals",
      source: "workflow_input",
    });

    expect(missingStep.ok).toBe(false);
    expect(unexpectedValue.ok).toBe(false);
    expect(invalidValue.ok).toBe(false);
  });

  it("rejects invalid nested transition conditions", () => {
    const validation = new WorkflowTransitionValidator().validate(
      createWorkflowTransition({
        condition: createWorkflowCondition({
          field: "invalid field",
        }),
      }),
    );

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContainEqual(
        expect.objectContaining({ path: "condition.field" }),
      );
    }
  });

  it("rejects contradictory failure policies", () => {
    const failWorkflow = new WorkflowFailurePolicyValidator().validate(
      createWorkflowFailurePolicy({
        preserveSuccessfulOutputs: true,
      }),
    );
    const partial = new WorkflowFailurePolicyValidator().validate(
      createWorkflowFailurePolicy({
        preserveSuccessfulOutputs: false,
        strategy: "return_partial",
      }),
    );

    expect(failWorkflow.ok).toBe(false);
    expect(partial.ok).toBe(false);
  });
});
