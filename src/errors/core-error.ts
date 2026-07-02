import type {
  ErrorCategory,
  ErrorRecord,
} from "../contracts/error-record.js";
import type { JsonObject } from "../contracts/json.js";
import type { ValidationIssue } from "../validation/validation.js";

interface CoreErrorOptions {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly retryable?: boolean;
  readonly stage: string;
  readonly details?: JsonObject;
  readonly cause?: unknown;
}

export class CoreError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly stage: string;
  public readonly details: JsonObject | undefined;

  public constructor(options: CoreErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    this.stage = options.stage;
    this.details = options.details;
  }

  public toRecord(occurredAt: string): ErrorRecord {
    return {
      category: this.category,
      code: this.code,
      ...(this.details === undefined ? {} : { details: this.details }),
      message: this.message,
      occurredAt,
      retryable: this.retryable,
      stage: this.stage,
    };
  }
}

export class RequestValidationError extends CoreError {
  public readonly issues: readonly ValidationIssue[];

  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "request_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "The request does not satisfy the RequestEnvelope contract",
      stage: "request_validation",
    });
    this.issues = issues;
  }
}

export class RegistryError extends CoreError {
  public constructor(
    code: "agent_manifest_invalid" | "duplicate_agent_manifest",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: code === "duplicate_agent_manifest" ? "conflict" : "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "agent_registry",
    });
  }
}

export class RoutingError extends CoreError {
  public constructor(
    code: "route_ambiguous" | "route_not_found",
    message: string,
    details: JsonObject,
  ) {
    super({
      category: code === "route_not_found" ? "not_found" : "conflict",
      code,
      details,
      message,
      stage: "routing",
    });
  }
}

export class TaskStateError extends CoreError {
  public constructor(message: string, details: JsonObject) {
    super({
      category: "conflict",
      code: "task_transition_invalid",
      details,
      message,
      stage: "task_state",
    });
  }
}

export class AgentRuntimeError extends CoreError {
  public constructor(
    code:
      | "agent_invocation_invalid"
      | "agent_result_invalid"
      | "agent_runtime_invariant",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: code === "agent_runtime_invariant" ? "internal" : "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "agent_runtime",
    });
  }
}

export class InvariantError extends CoreError {
  public constructor(message: string, stage: string, details?: JsonObject) {
    super({
      category: "internal",
      code: "invariant_violated",
      ...(details === undefined ? {} : { details }),
      message,
      stage,
    });
  }
}

export function normalizeCoreError(error: unknown, stage: string): CoreError {
  if (error instanceof CoreError) {
    return error;
  }

  return new CoreError({
    category: "internal",
    cause: error,
    code: "internal_error",
    message: "An internal orchestration error occurred",
    stage,
  });
}
