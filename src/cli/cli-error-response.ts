import type { ErrorCategory } from "../contracts/error-record.js";
import { CoreError } from "../errors/core-error.js";

export const CLI_ERROR_RESPONSE_CONTRACT_VERSION = "1" as const;

export interface CliErrorResponse {
  readonly contractVersion: typeof CLI_ERROR_RESPONSE_CONTRACT_VERSION;
  readonly error: {
    readonly category: ErrorCategory;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly stage: string;
  };
  readonly status: "error";
}

export class CliBoundaryError extends CoreError {
  public constructor(
    code: string,
    message: string,
    stage: string,
    category: ErrorCategory = "validation",
  ) {
    super({
      category,
      code,
      message,
      stage,
    });
  }
}

export function createCliErrorResponse(error: unknown): CliErrorResponse {
  const normalized =
    error instanceof CoreError
      ? error
      : new CliBoundaryError(
          "cli_internal_error",
          "The local CLI operation failed",
          "local_cli",
          "internal",
        );

  return {
    contractVersion: CLI_ERROR_RESPONSE_CONTRACT_VERSION,
    error: {
      category: normalized.category,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      stage: normalized.stage,
    },
    status: "error",
  };
}
