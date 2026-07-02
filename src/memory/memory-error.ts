import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";

export class MemoryValidationError extends CoreError {
  public constructor(message: string, details?: JsonObject) {
    super({
      category: "validation",
      code: "memory_request_invalid",
      ...(details === undefined ? {} : { details }),
      message,
      stage: "memory",
    });
  }
}

export class MemoryPermissionError extends CoreError {
  public constructor(message: string, details?: JsonObject) {
    super({
      category: "authorization",
      code: "memory_permission_denied",
      ...(details === undefined ? {} : { details }),
      message,
      stage: "memory",
    });
  }
}

export class MemoryConflictError extends CoreError {
  public constructor(message: string, details?: JsonObject) {
    super({
      category: "conflict",
      code: "memory_conflict",
      ...(details === undefined ? {} : { details }),
      message,
      stage: "memory",
    });
  }
}
