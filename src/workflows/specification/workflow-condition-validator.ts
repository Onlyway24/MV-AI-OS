import {
  type WorkflowCondition,
  type WorkflowConditionOperator,
  type WorkflowConditionSource,
} from "./workflow-condition.js";
import {
  isWorkflowFieldPath,
  isWorkflowIdentifier,
} from "./workflow-specification-validation.js";
import type { JsonPrimitive } from "../../contracts/json.js";
import {
  readOptionalString,
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

const CONDITION_SOURCES = new Set<WorkflowConditionSource>([
  "step_output",
  "workflow_input",
]);
const CONDITION_OPERATORS = new Set<WorkflowConditionOperator>([
  "equals",
  "exists",
  "not_equals",
  "not_exists",
]);

export class WorkflowConditionValidator
  implements Validator<WorkflowCondition>
{
  public validate(value: unknown): ValidationResult<WorkflowCondition> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "workflow condition must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const conditionId = readRequiredString(
      record,
      "conditionId",
      issues,
    );
    const source = readRequiredString(record, "source", issues);
    const sourceStepId = readOptionalString(
      record,
      "sourceStepId",
      issues,
    );
    const field = readRequiredString(record, "field", issues);
    const operator = readRequiredString(record, "operator", issues);
    const expectedValue = readExpectedValue(
      record.expectedValue,
      issues,
    );

    validateIdentifier(conditionId, "conditionId", issues);
    validateIdentifier(sourceStepId, "sourceStepId", issues);
    if (
      source !== undefined &&
      !CONDITION_SOURCES.has(source as WorkflowConditionSource)
    ) {
      issues.push({
        code: "invalid_value",
        message: "source is not supported",
        path: "source",
      });
    }
    if (
      operator !== undefined &&
      !CONDITION_OPERATORS.has(operator as WorkflowConditionOperator)
    ) {
      issues.push({
        code: "invalid_value",
        message: "operator is not supported",
        path: "operator",
      });
    }
    if (field !== undefined && !isWorkflowFieldPath(field)) {
      issues.push({
        code: "invalid_format",
        message: "field must be a dotted object-field path",
        path: "field",
      });
    }
    if (source === "step_output" && sourceStepId === undefined) {
      issues.push({
        code: "required",
        message: "sourceStepId is required for step_output",
        path: "sourceStepId",
      });
    }
    if (source === "workflow_input" && sourceStepId !== undefined) {
      issues.push({
        code: "forbidden",
        message: "sourceStepId is not allowed for workflow_input",
        path: "sourceStepId",
      });
    }
    const operatorNeedsValue =
      operator === "equals" || operator === "not_equals";
    if (operatorNeedsValue && record.expectedValue === undefined) {
      issues.push({
        code: "required",
        message: "expectedValue is required for comparison operators",
        path: "expectedValue",
      });
    }
    if (
      (operator === "exists" || operator === "not_exists") &&
      record.expectedValue !== undefined
    ) {
      issues.push({
        code: "forbidden",
        message: "expectedValue is not allowed for existence operators",
        path: "expectedValue",
      });
    }

    if (
      issues.length > 0 ||
      conditionId === undefined ||
      source === undefined ||
      !CONDITION_SOURCES.has(source as WorkflowConditionSource) ||
      field === undefined ||
      operator === undefined ||
      !CONDITION_OPERATORS.has(operator as WorkflowConditionOperator)
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      conditionId,
      ...(expectedValue === undefined ? {} : { expectedValue }),
      field,
      operator: operator as WorkflowConditionOperator,
      source: source as WorkflowConditionSource,
      ...(sourceStepId === undefined ? {} : { sourceStepId }),
    });
  }
}

function readExpectedValue(
  value: unknown,
  issues: ValidationIssue[],
): JsonPrimitive | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  issues.push({
    code: "invalid_type",
    message: "expectedValue must be a finite JSON primitive",
    path: "expectedValue",
  });
  return undefined;
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
