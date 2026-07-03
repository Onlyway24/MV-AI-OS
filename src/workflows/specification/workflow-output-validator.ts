import type { WorkflowOutput } from "./workflow-output.js";
import { validateWorkflowSchema } from "./workflow-schema-validation.js";
import { isWorkflowIdentifier } from "./workflow-specification-validation.js";
import { readRequiredStringArray } from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

export class WorkflowOutputValidator implements Validator<WorkflowOutput> {
  public validate(value: unknown): ValidationResult<WorkflowOutput> {
    const schemaValidation = validateWorkflowSchema(
      value,
      "workflow output",
    );
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure(
        schemaValidation.ok ? [] : schemaValidation.issues,
      );
    }

    const issues: ValidationIssue[] = schemaValidation.ok
      ? []
      : [...schemaValidation.issues];
    const sourceStepIds = readRequiredStringArray(
      record,
      "sourceStepIds",
      issues,
      "",
      false,
    );
    if (
      sourceStepIds?.some((stepId) => !isWorkflowIdentifier(stepId)) ===
      true
    ) {
      issues.push({
        code: "invalid_format",
        message: "sourceStepIds must contain lowercase identifiers",
        path: "sourceStepIds",
      });
    }
    if (
      issues.length > 0 ||
      !schemaValidation.ok ||
      sourceStepIds === undefined
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({
      ...schemaValidation.value,
      sourceStepIds,
    });
  }
}
