import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";

export class KnowledgeValidationError extends CoreError {
  public constructor(
    message: string,
    issues?: readonly ValidationIssue[],
  ) {
    super({
      category: "validation",
      code: "knowledge_contract_invalid",
      ...(issues === undefined
        ? {}
        : {
            details: {
              issues: issues.map(({ code, message: detail, path }) => ({
                code,
                message: detail,
                path,
              })),
            },
          }),
      message,
      stage: "knowledge",
    });
  }
}

export class KnowledgePermissionError extends CoreError {
  public constructor(details?: JsonObject) {
    super({
      category: "authorization",
      code: "knowledge_permission_denied",
      ...(details === undefined ? {} : { details }),
      message: "Knowledge search permission is not granted",
      stage: "knowledge",
    });
  }
}

export class KnowledgeInvariantError extends CoreError {
  public constructor(message: string, details?: JsonObject) {
    super({
      category: "internal",
      code: "knowledge_invariant_violated",
      ...(details === undefined ? {} : { details }),
      message,
      stage: "knowledge",
    });
  }
}
