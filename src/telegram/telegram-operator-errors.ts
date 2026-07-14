export const TELEGRAM_OPERATOR_ERROR_CODES = Object.freeze([
  "CONFIGURATION_UNAVAILABLE",
  "SECRET_REFERENCE_UNAVAILABLE",
  "DATABASE_UNAVAILABLE",
  "OPERATOR_LOCK_HELD",
  "TELEGRAM_IDENTITY_FAILED",
  "TELEGRAM_BOOTSTRAP_FAILED",
  "POLLING_TRANSIENT_FAILURE",
  "UPDATE_PROCESSING_FAILED",
  "OUTBOUND_DELIVERY_FAILED",
  "OPERATOR_SHUTDOWN_FAILED",
  "INTERNAL_OPERATOR_FAILURE",
] as const);

export type TelegramOperatorErrorCode = (typeof TELEGRAM_OPERATOR_ERROR_CODES)[number];
export type TelegramOperatorLifecycleStage = "BOOTSTRAP" | "CONFIGURATION" | "POLLING" | "SHUTDOWN" | "UPDATE";

const REMEDIATION: Readonly<Record<TelegramOperatorErrorCode, string>> = Object.freeze({
  CONFIGURATION_UNAVAILABLE: "Check the documented local operator configuration.",
  SECRET_REFERENCE_UNAVAILABLE: "Check the documented local secret reference.",
  DATABASE_UNAVAILABLE: "Check the private local database directory.",
  OPERATOR_LOCK_HELD: "Confirm the existing operator process before touching its lock.",
  TELEGRAM_IDENTITY_FAILED: "Check the dedicated bot configuration and try again.",
  TELEGRAM_BOOTSTRAP_FAILED: "Check Telegram availability and restart the local operator.",
  POLLING_TRANSIENT_FAILURE: "The bounded polling retry budget was exhausted; restart the local operator when Telegram is reachable.",
  UPDATE_PROCESSING_FAILED: "The affected update was isolated; send a new supported command if needed.",
  OUTBOUND_DELIVERY_FAILED: "The affected response could not be delivered; send a new supported command if needed.",
  OPERATOR_SHUTDOWN_FAILED: "Confirm the process has stopped before starting another operator.",
  INTERNAL_OPERATOR_FAILURE: "Run the documented preflight and doctor checks before retrying.",
});

/** Bounded, redaction-safe failure metadata for the local operator process. */
export class TelegramOperatorError extends Error {
  public constructor(
    public readonly code: TelegramOperatorErrorCode,
    public readonly stage: TelegramOperatorLifecycleStage,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "TelegramOperatorError";
  }
}

export function telegramOperatorError(
  error: unknown,
  fallback: TelegramOperatorErrorCode = "INTERNAL_OPERATOR_FAILURE",
  stage: TelegramOperatorLifecycleStage = "POLLING",
): TelegramOperatorError {
  return error instanceof TelegramOperatorError ? error : new TelegramOperatorError(fallback, stage, false);
}

export function isRetryablePollingFailure(error: unknown): error is TelegramOperatorError {
  return error instanceof TelegramOperatorError && error.code === "POLLING_TRANSIENT_FAILURE" && error.retryable;
}

export function safeTelegramOperatorDiagnostic(error: unknown, diagnostics: boolean): string {
  const safe = telegramOperatorError(error);
  if (!diagnostics) return `Telegram operator: ${safe.code}\n`;
  return `Telegram operator: ${safe.code}; stage: ${safe.stage}; retryable: ${safe.retryable ? "yes" : "no"}; remediation: ${REMEDIATION[safe.code]}\n`;
}

/** Internal classifier only; its result is never rendered to the operator. */
export function isTelegramDatabaseFailure(error: unknown): boolean {
  if (error instanceof TelegramOperatorError) return error.code === "DATABASE_UNAVAILABLE";
  if (typeof error !== "object" || error === null) return false;
  const value = error as { readonly code?: unknown; readonly message?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  return /SQLITE|ERR_SQLITE|ERR_INVALID_STATE/iu.test(code) || /database|state store is closed|sqlite/iu.test(message);
}
