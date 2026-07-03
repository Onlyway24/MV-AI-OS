import type { JsonObject } from "../../contracts/json.js";
import { CoreError } from "../../errors/core-error.js";
import type { ValidationIssue } from "../../validation/validation.js";

export class SqliteConfigurationError extends CoreError {
  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "sqlite_configuration_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "SQLite connection configuration is invalid",
      stage: "sqlite_configuration",
    });
  }
}

export class SqliteSchemaError extends CoreError {
  public constructor(
    code: "sqlite_schema_invalid" | "sqlite_schema_unsupported",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: "persistence",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "sqlite_schema",
    });
  }
}

export class SqliteRepositoryError extends CoreError {
  public constructor(
    message: string,
    operation: string,
    details?: JsonObject,
  ) {
    super({
      category: "persistence",
      code: "sqlite_repository_failed",
      details: {
        operation,
        ...(details ?? {}),
      },
      message,
      stage: "persistence",
    });
  }
}

export function isSqliteConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    readonly code?: unknown;
    readonly errcode?: unknown;
  };
  return (
    candidate.code === "ERR_SQLITE_ERROR" &&
    typeof candidate.errcode === "number" &&
    (candidate.errcode & 0xff) === 19
  );
}

export function withSqliteErrors<T>(
  operation: string,
  action: () => T,
): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof CoreError) {
      throw error;
    }
    throw new SqliteRepositoryError(
      "SQLite repository operation failed",
      operation,
    );
  }
}
