import type { WorkflowTransition } from "./workflow-transition.js";
import { WorkflowConditionValidator } from "./workflow-condition-validator.js";
import {
  isWorkflowIdentifier,
  prefixWorkflowSpecificationIssues,
} from "./workflow-specification-validation.js";
import {
  readRequiredInteger,
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

export class WorkflowTransitionValidator
  implements Validator<WorkflowTransition>
{
  readonly #conditionValidator = new WorkflowConditionValidator();

  public validate(value: unknown): ValidationResult<WorkflowTransition> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "workflow transition must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const transitionId = readRequiredString(
      record,
      "transitionId",
      issues,
    );
    const fromStepId = readRequiredString(record, "fromStepId", issues);
    const toStepId = readRequiredString(record, "toStepId", issues);
    const priority = readRequiredInteger(record, "priority", issues);
    const conditionValidation =
      record.condition === undefined
        ? undefined
        : this.#conditionValidator.validate(record.condition);
    if (conditionValidation?.ok === false) {
      issues.push(
        ...prefixWorkflowSpecificationIssues(
          conditionValidation.issues,
          "condition",
        ),
      );
    }
    validateIdentifier(transitionId, "transitionId", issues);
    validateIdentifier(fromStepId, "fromStepId", issues);
    validateIdentifier(toStepId, "toStepId", issues);

    if (
      issues.length > 0 ||
      transitionId === undefined ||
      fromStepId === undefined ||
      toStepId === undefined ||
      priority === undefined ||
      conditionValidation?.ok === false
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({
      ...(conditionValidation?.ok === true
        ? { condition: conditionValidation.value }
        : {}),
      fromStepId,
      priority,
      toStepId,
      transitionId,
    });
  }
}

function validateIdentifier(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isWorkflowIdentifier(value)) {
    issues.push({
      code: "invalid_format",
      message: `${path} must be a lowercase identifier`,
      path,
    });
  }
}
