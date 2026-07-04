import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";

export class LocalRuntimeConfigurationError extends CoreError {
  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "local_runtime_configuration_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "Local runtime configuration is invalid",
      stage: "local_runtime_configuration",
    });
  }
}

export class LocalRuntimeStateError extends CoreError {
  public constructor() {
    super({
      category: "conflict",
      code: "local_runtime_closed",
      message: "The local runtime is closed",
      stage: "local_runtime",
    });
  }
}

export class LocalRuntimeIdentityError extends CoreError {
  public constructor() {
    super({
      category: "authorization",
      code: "local_runtime_identity_mismatch",
      message:
        "The request actor or workspace does not match the local runtime",
      stage: "local_runtime_intake",
    });
  }
}
