import type { ToolPermission } from "./tool-permission.js";
import { isToolAccessPermission } from "./tool-validation.js";
import {
  readRequiredBoolean,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class ToolPermissionValidator implements Validator<ToolPermission> {
  public validate(value: unknown): ValidationResult<ToolPermission> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "tool permission must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const permission = readRequiredString(record, "permission", issues);
    const approvalRequired = readRequiredBoolean(
      record,
      "approvalRequired",
      issues,
    );
    if (
      permission !== undefined &&
      !isToolAccessPermission(permission)
    ) {
      issues.push({
        code: "invalid_value",
        message: "permission must be a tool read or execute permission",
        path: "permission",
      });
    }

    if (
      issues.length > 0 ||
      permission === undefined ||
      !isToolAccessPermission(permission) ||
      approvalRequired === undefined
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({
      approvalRequired,
      permission,
    });
  }
}
