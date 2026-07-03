import type { WorkflowStep } from "./workflow-step.js";
import { isWorkflowIdentifier } from "./workflow-specification-validation.js";
import { readAgentReference } from "../../validation/agent-contract-readers.js";
import {
  readRequiredBoolean,
  readRequiredJsonObject,
  readRequiredString,
} from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

export class WorkflowStepValidator implements Validator<WorkflowStep> {
  public validate(value: unknown): ValidationResult<WorkflowStep> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "workflow step must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const stepId = readRequiredString(record, "stepId", issues);
    const name = readRequiredString(record, "name", issues);
    const agent = readAgentReference(record.agent, "agent", issues);
    const objective = readRequiredString(record, "objective", issues);
    const inputMapping = readRequiredJsonObject(
      record,
      "inputMapping",
      issues,
    );
    const terminal = readRequiredBoolean(record, "terminal", issues);

    if (stepId !== undefined && !isWorkflowIdentifier(stepId)) {
      issues.push({
        code: "invalid_format",
        message: "stepId must be a lowercase identifier",
        path: "stepId",
      });
    }

    if (
      issues.length > 0 ||
      stepId === undefined ||
      name === undefined ||
      agent === undefined ||
      objective === undefined ||
      inputMapping === undefined ||
      terminal === undefined
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({
      agent,
      inputMapping,
      name,
      objective,
      stepId,
      terminal,
    });
  }
}
