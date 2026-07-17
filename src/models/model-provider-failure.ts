import type { ModelError } from "./model-error.js";

/**
 * A provider adapter may throw this marked, already-redacted failure when it
 * cannot produce a provider-neutral response.  The gateway intentionally
 * preserves only this structured form; arbitrary thrown transport errors stay
 * opaque so credentials and provider response bodies cannot escape.
 */
export interface ModelProviderFailure extends Error {
  readonly modelProviderFailure: Omit<ModelError, "occurredAt">;
}

export function isModelProviderFailure(
  value: unknown,
): value is ModelProviderFailure {
  if (!(value instanceof Error) || !("modelProviderFailure" in value)) {
    return false;
  }
  const failure = value.modelProviderFailure;
  return (
    typeof failure === "object" &&
    failure !== null &&
    typeof (failure as Record<string, unknown>).code === "string" &&
    typeof (failure as Record<string, unknown>).category === "string" &&
    typeof (failure as Record<string, unknown>).message === "string" &&
    typeof (failure as Record<string, unknown>).retryable === "boolean" &&
    typeof (failure as Record<string, unknown>).stage === "string"
  );
}
