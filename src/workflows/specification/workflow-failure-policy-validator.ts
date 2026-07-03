import {
  type WorkflowFailurePolicy,
  type WorkflowFailureStrategy,
} from "./workflow-failure-policy.js";
import {
  readRequiredBoolean,
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

const FAILURE_STRATEGIES = new Set<WorkflowFailureStrategy>([
  "fail_workflow",
  "return_partial",
]);

export class WorkflowFailurePolicyValidator
  implements Validator<WorkflowFailurePolicy>
{
  public validate(
    value: unknown,
  ): ValidationResult<WorkflowFailurePolicy> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "workflow failure policy must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const strategy = readRequiredString(record, "strategy", issues);
    const preserveSuccessfulOutputs = readRequiredBoolean(
      record,
      "preserveSuccessfulOutputs",
      issues,
    );
    if (
      strategy !== undefined &&
      !FAILURE_STRATEGIES.has(strategy as WorkflowFailureStrategy)
    ) {
      issues.push({
        code: "invalid_value",
        message: "strategy is not supported",
        path: "strategy",
      });
    }
    if (
      strategy === "return_partial" &&
      preserveSuccessfulOutputs === false
    ) {
      issues.push({
        code: "invalid_value",
        message:
          "return_partial requires preserveSuccessfulOutputs to be true",
        path: "preserveSuccessfulOutputs",
      });
    }
    if (
      strategy === "fail_workflow" &&
      preserveSuccessfulOutputs === true
    ) {
      issues.push({
        code: "invalid_value",
        message:
          "fail_workflow requires preserveSuccessfulOutputs to be false",
        path: "preserveSuccessfulOutputs",
      });
    }

    if (
      issues.length > 0 ||
      strategy === undefined ||
      !FAILURE_STRATEGIES.has(strategy as WorkflowFailureStrategy) ||
      preserveSuccessfulOutputs === undefined
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({
      preserveSuccessfulOutputs,
      strategy: strategy as WorkflowFailureStrategy,
    });
  }
}
