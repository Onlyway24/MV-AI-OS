import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";

export class ModelRequestValidationError extends CoreError {
  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "model_request_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "The request does not satisfy the ModelRequest contract",
      stage: "model_gateway",
    });
  }
}

export class ModelGatewayInvariantError extends CoreError {
  public constructor(message: string, details?: JsonObject) {
    super({
      category: "internal",
      code: "model_gateway_invariant",
      ...(details === undefined ? {} : { details }),
      message,
      stage: "model_gateway",
    });
  }
}
