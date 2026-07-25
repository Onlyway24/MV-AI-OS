import { frozenTrendClone, type TrendSourceTransport, type TrendTransportReconciliationRequest, type TrendTransportRequest, type TrendTransportResponse } from "./trend-intelligence-contract.js";
import { TrendTransportFailureError, TrendTransportTimeoutError } from "./trend-source-connector.js";

export type FakeTrendTransportOutcome =
  | { readonly kind: "FAILURE" }
  | { readonly kind: "RESPONSE"; readonly response: TrendTransportResponse }
  | { readonly kind: "TIMEOUT"; readonly operationId?: string };

export interface FakeTrendTransportScript {
  readonly acquisitions: Readonly<Record<string, FakeTrendTransportOutcome>>;
  readonly reconciliations?: Readonly<Record<string, FakeTrendTransportOutcome>>;
}

/**
 * Deterministic offline transport. Outcomes are selected by stable request IDs,
 * never by queue order or time, and every returned value is a frozen clone.
 */
export class DeterministicFakeTrendTransport implements TrendSourceTransport {
  readonly #acquisitionCalls: TrendTransportRequest[] = [];
  readonly #reconciliationCalls: TrendTransportReconciliationRequest[] = [];
  readonly #script: FakeTrendTransportScript;
  public readonly transportId = "deterministic-fake-trend-transport";

  public constructor(script: FakeTrendTransportScript) {
    this.#script = frozenTrendClone(script);
  }

  public acquire(request: TrendTransportRequest): Promise<TrendTransportResponse> {
    this.#acquisitionCalls.push(frozenTrendClone(request));
    return applyOutcome(this.#script.acquisitions[request.clientRequestId]);
  }

  public reconcile(request: TrendTransportReconciliationRequest): Promise<TrendTransportResponse> {
    this.#reconciliationCalls.push(frozenTrendClone(request));
    return applyOutcome(this.#script.reconciliations?.[request.operationId]);
  }

  public acquisitionCalls(): readonly TrendTransportRequest[] {
    return frozenTrendClone(this.#acquisitionCalls);
  }

  public reconciliationCalls(): readonly TrendTransportReconciliationRequest[] {
    return frozenTrendClone(this.#reconciliationCalls);
  }
}

function applyOutcome(outcome: FakeTrendTransportOutcome | undefined): Promise<TrendTransportResponse> {
  if (outcome === undefined) return Promise.resolve(Object.freeze({ statusCode: 500 }));
  if (outcome.kind === "FAILURE") return Promise.reject(new TrendTransportFailureError());
  if (outcome.kind === "TIMEOUT") return Promise.reject(new TrendTransportTimeoutError(outcome.operationId));
  return Promise.resolve(frozenTrendClone(outcome.response));
}
