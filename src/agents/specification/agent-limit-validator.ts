import type { AgentLimit } from "./agent-limit.js";
import {
  readOptionalInteger,
  readOptionalNumber,
  readRequiredInteger,
} from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

export class AgentLimitValidator implements Validator<AgentLimit> {
  public validate(value: unknown): ValidationResult<AgentLimit> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent limits must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const timeoutMs = readRequiredInteger(
      record,
      "timeoutMs",
      issues,
      "",
      1,
    );
    const maxInputBytes = readRequiredInteger(
      record,
      "maxInputBytes",
      issues,
      "",
      1,
    );
    const maxResultBytes = readRequiredInteger(
      record,
      "maxResultBytes",
      issues,
      "",
      1,
    );
    const maxModelCalls = readRequiredInteger(
      record,
      "maxModelCalls",
      issues,
    );
    const maxToolCalls = readRequiredInteger(
      record,
      "maxToolCalls",
      issues,
    );
    const maxTokens = readOptionalInteger(
      record,
      "maxTokens",
      issues,
      "",
      1,
    );
    const maxCostUsd = readOptionalNumber(
      record,
      "maxCostUsd",
      issues,
    );

    if (
      issues.length > 0 ||
      timeoutMs === undefined ||
      maxInputBytes === undefined ||
      maxResultBytes === undefined ||
      maxModelCalls === undefined ||
      maxToolCalls === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
      maxInputBytes,
      maxModelCalls,
      maxResultBytes,
      ...(maxTokens === undefined ? {} : { maxTokens }),
      maxToolCalls,
      timeoutMs,
    });
  }
}
