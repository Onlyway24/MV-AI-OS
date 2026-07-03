import type { JsonObject } from "../../contracts/json.js";
import {
  readRequiredBoolean,
  readRequiredJsonObject,
  readRequiredString,
} from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

export interface ValidatedWorkflowSchema {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly schema: JsonObject;
  readonly strict: boolean;
}

export function validateWorkflowSchema(
  value: unknown,
  label: string,
): ValidationResult<ValidatedWorkflowSchema> {
  const record = asRecord(value);
  if (record === undefined) {
    return validationFailure([
      {
        code: "invalid_type",
        message: `${label} must be an object`,
        path: "$",
      },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const contractId = readRequiredString(record, "contractId", issues);
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  const schema = readRequiredJsonObject(record, "schema", issues);
  const strict = readRequiredBoolean(record, "strict", issues);
  if (schema !== undefined && schema.type !== "object") {
    issues.push({
      code: "invalid_value",
      message: "schema.type must be object",
      path: "schema.type",
    });
  }

  if (
    issues.length > 0 ||
    contractId === undefined ||
    contractVersion === undefined ||
    schema === undefined ||
    strict === undefined
  ) {
    return validationFailure(issues);
  }
  return validationSuccess({
    contractId,
    contractVersion,
    schema,
    strict,
  });
}
