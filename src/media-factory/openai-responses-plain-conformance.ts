import type {
  OpenAiResponsesCanonicalRequest,
  OpenAiResponsesRequestShapeManifest,
} from "../models/providers/openai-responses-request-builder.js";
import type {
  OpenAiResponsesPlainConformanceProvider,
  OpenAiResponsesProviderDiagnostic,
} from "../models/providers/openai-responses-conformance-provider.js";
import {
  OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD,
  OPENAI_RESPONSES_CONFORMANCE_OPERATION,
  type OpenAiResponsesConformanceCostClassification,
  type OpenAiResponsesConformancePreflight,
  type OpenAiResponsesConformanceSnapshot,
} from "./openai-responses-conformance-session-ledger.js";

export const OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL = "gpt-4o-mini" as const;

export interface OpenAiResponsesPlainConformanceAuthorizationPort {
  close(sessionId: string): void;
  preflight(
    sessionId: string,
    model: string,
    maxCostUsd: number,
  ): OpenAiResponsesConformancePreflight;
  reconcile(input: {
    readonly costClassification: OpenAiResponsesConformanceCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void;
  reserve(input: {
    readonly maxCostUsd: number;
    readonly model: string;
    readonly operationId: string;
    readonly sessionId: string;
  }): void;
  snapshot(sessionId: string): OpenAiResponsesConformanceSnapshot;
}

export type OpenAiResponsesPlainReasonCode =
  | "BUDGET_PREFLIGHT_BLOCKED"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_HTTP_TRANSPORT"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_PLAIN_OUTPUT_MISMATCH"
  | "PROVIDER_PROJECT_OR_PERMISSION"
  | "PROVIDER_RESPONSE_EXTRACTION"
  | "USAGE_RECONCILIATION";

export interface OpenAiResponsesPlainConformanceResult {
  readonly conformanceGate: "PASS" | "BLOCKED";
  readonly ledger: OpenAiResponsesConformanceSnapshot;
  readonly preflight: OpenAiResponsesConformancePreflight;
  readonly providerDiagnostic?: OpenAiResponsesProviderDiagnostic;
  readonly providerStatus: "BLOCKED" | "READY";
  readonly reasonCode?: OpenAiResponsesPlainReasonCode;
  readonly requestShape: OpenAiResponsesRequestShapeManifest;
  readonly status: "PROVIDER_PLAIN_READY" | "BLOCKED";
  readonly usage?: {
    readonly estimatedCostUsd: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

export interface OpenAiResponsesPlainConformanceDependencies {
  readonly authorization: OpenAiResponsesPlainConformanceAuthorizationPort;
  readonly provider: OpenAiResponsesPlainConformanceProvider;
}

/**
 * One request, zero retries. The provider receives a canonical prebuilt body;
 * this operation has no route to legacy ModelRequest fields or structured mode.
 */
export class OpenAiResponsesPlainConformanceCheck {
  readonly #authorization: OpenAiResponsesPlainConformanceAuthorizationPort;
  readonly #provider: OpenAiResponsesPlainConformanceProvider;

  public constructor(dependencies: OpenAiResponsesPlainConformanceDependencies) {
    this.#authorization = dependencies.authorization;
    this.#provider = dependencies.provider;
  }

  public async run(input: {
    readonly idempotencyKey: string;
    readonly operationId: string;
    readonly request: OpenAiResponsesCanonicalRequest;
    readonly sessionId: string;
  }): Promise<OpenAiResponsesPlainConformanceResult> {
    const preflight = this.#authorization.preflight(
      input.sessionId,
      OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
      OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD,
    );
    if (preflight.status !== "ready") {
      this.#authorization.close(input.sessionId);
      return this.#blocked({
        preflight,
        reasonCode: "BUDGET_PREFLIGHT_BLOCKED",
        requestShape: input.request.manifest,
        sessionId: input.sessionId,
      });
    }
    try {
      this.#authorization.reserve({
        maxCostUsd: OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD,
        model: OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
        operationId: input.operationId,
        sessionId: input.sessionId,
      });
    } catch {
      this.#authorization.close(input.sessionId);
      return this.#blocked({
        preflight,
        reasonCode: "BUDGET_PREFLIGHT_BLOCKED",
        requestShape: input.request.manifest,
        sessionId: input.sessionId,
      });
    }

    try {
      const response = await this.#provider.execute({
        idempotencyKey: input.idempotencyKey,
        request: input.request,
        timeoutMs: 20_000,
      });
      if (response.status === "failure") {
        return this.#settleBlocked({
          diagnostic: response.diagnostic,
          operationId: input.operationId,
          preflight,
          reasonCode: classifyFailure(response.diagnostic),
          requestShape: input.request.manifest,
          sessionId: input.sessionId,
        });
      }
      if (response.outputText === undefined) {
        return this.#settleBlocked({
          operationId: input.operationId,
          preflight,
          reasonCode: "PROVIDER_RESPONSE_EXTRACTION",
          requestShape: input.request.manifest,
          sessionId: input.sessionId,
        });
      }
      if (response.outputText !== "ONLYWAY_PROVIDER_OK") {
        return this.#settleBlocked({
          operationId: input.operationId,
          preflight,
          reasonCode: "PROVIDER_PLAIN_OUTPUT_MISMATCH",
          requestShape: input.request.manifest,
          sessionId: input.sessionId,
        });
      }
      if (response.usage === undefined) {
        return this.#settleBlocked({
          operationId: input.operationId,
          preflight,
          reasonCode: "USAGE_RECONCILIATION",
          requestShape: input.request.manifest,
          sessionId: input.sessionId,
        });
      }
      const estimatedCostUsd = estimateGpt4oMiniCost(response.usage);
      this.#authorization.reconcile({
        costClassification: "ESTIMATED",
        costUsd: estimatedCostUsd,
        operationId: input.operationId,
        sessionId: input.sessionId,
        status: "succeeded",
      });
      this.#authorization.close(input.sessionId);
      return {
        conformanceGate: "PASS",
        ledger: this.#authorization.snapshot(input.sessionId),
        preflight,
        providerStatus: "READY",
        requestShape: input.request.manifest,
        status: "PROVIDER_PLAIN_READY",
        usage: { ...response.usage, estimatedCostUsd },
      };
    } catch {
      return this.#settleBlocked({
        operationId: input.operationId,
        preflight,
        reasonCode: "USAGE_RECONCILIATION",
        requestShape: input.request.manifest,
        sessionId: input.sessionId,
      });
    }
  }

  #settleBlocked(input: {
    readonly diagnostic?: OpenAiResponsesProviderDiagnostic;
    readonly operationId: string;
    readonly preflight: OpenAiResponsesConformancePreflight;
    readonly reasonCode: OpenAiResponsesPlainReasonCode;
    readonly requestShape: OpenAiResponsesRequestShapeManifest;
    readonly sessionId: string;
  }): OpenAiResponsesPlainConformanceResult {
    try {
      this.#authorization.reconcile({
        costClassification: "RECONCILIATION_PENDING",
        operationId: input.operationId,
        reasonCode: input.reasonCode,
        sessionId: input.sessionId,
        status: "failed",
      });
    } catch {
      input = { ...input, reasonCode: "USAGE_RECONCILIATION" };
    }
    this.#authorization.close(input.sessionId);
    return this.#blocked(input);
  }

  #blocked(input: {
    readonly diagnostic?: OpenAiResponsesProviderDiagnostic;
    readonly preflight: OpenAiResponsesConformancePreflight;
    readonly reasonCode: OpenAiResponsesPlainReasonCode;
    readonly requestShape: OpenAiResponsesRequestShapeManifest;
    readonly sessionId: string;
  }): OpenAiResponsesPlainConformanceResult {
    return {
      conformanceGate: "BLOCKED",
      ledger: this.#authorization.snapshot(input.sessionId),
      preflight: input.preflight,
      ...(input.diagnostic === undefined ? {} : { providerDiagnostic: input.diagnostic }),
      providerStatus: "BLOCKED",
      reasonCode: input.reasonCode,
      requestShape: input.requestShape,
      status: "BLOCKED",
    };
  }
}

function classifyFailure(
  diagnostic: OpenAiResponsesProviderDiagnostic,
): OpenAiResponsesPlainReasonCode {
  if (diagnostic.httpStatus === 0) return "PROVIDER_HTTP_TRANSPORT";
  if (diagnostic.httpStatus === 401) return "PROVIDER_AUTHENTICATION";
  if (diagnostic.httpStatus === 403) return "PROVIDER_PROJECT_OR_PERMISSION";
  if (diagnostic.httpStatus === 400 || diagnostic.httpStatus === 422) {
    return "PROVIDER_INVALID_REQUEST";
  }
  return "PROVIDER_RESPONSE_EXTRACTION";
}

function estimateGpt4oMiniCost(usage: {
  readonly inputTokens: number;
  readonly outputTokens: number;
}): number {
  return Math.round(
    ((usage.inputTokens * 0.15 + usage.outputTokens * 0.6) / 1_000_000) * 1_000_000_000,
  ) / 1_000_000_000;
}

export { OPENAI_RESPONSES_CONFORMANCE_OPERATION };
