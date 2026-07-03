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

const MAX_SQLITE_TIMEOUT_MS = 60_000;

export interface SqliteConnectionConfig {
  readonly path: string;
  readonly timeoutMs: number;
}

export class SqliteConnectionConfigValidator
  implements Validator<SqliteConnectionConfig>
{
  public validate(
    value: unknown,
  ): ValidationResult<SqliteConnectionConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "SQLite connection configuration must be an object",
          path: "$",
        },
      ]);
    }
    const issues: ValidationIssue[] = [];
    const path = readRequiredString(record, "path", issues);
    const timeoutMs = readRequiredInteger(
      record,
      "timeoutMs",
      issues,
    );
    if (timeoutMs !== undefined && timeoutMs > MAX_SQLITE_TIMEOUT_MS) {
      issues.push({
        code: "too_large",
        message: `timeoutMs must not exceed ${String(MAX_SQLITE_TIMEOUT_MS)}`,
        path: "timeoutMs",
      });
    }
    if (
      issues.length > 0 ||
      path === undefined ||
      timeoutMs === undefined ||
      timeoutMs > MAX_SQLITE_TIMEOUT_MS
    ) {
      return validationFailure(issues);
    }
    return validationSuccess({ path, timeoutMs });
  }
}
