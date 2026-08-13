import type { JsonObject } from "../contracts/json.js";
import type { LlmGateway } from "../models/llm-gateway.js";
import type { ModelResponse } from "../models/model-response.js";
import type {
  OpenAiTextDiagnosticCostClassification,
  OpenAiTextDiagnosticOperation,
  OpenAiTextDiagnosticPreflight,
  OpenAiTextDiagnosticSnapshot,
} from "./openai-text-diagnostic-session-ledger.js";

export const OPENAI_TEXT_FAILURE_DIAGNOSIS_CONTRACT_VERSION = "1" as const;
export const OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL = "gpt-4o-mini" as const;
export const OPENAI_TEXT_FAILURE_DIAGNOSIS_OPERATION_COST_USD = 0.01;

export type OpenAiTextFailureReasonCode =
  | "BUDGET_PREFLIGHT_BLOCKED"
  | "LOCAL_VALIDATION"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_HTTP_TRANSPORT"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_PROJECT_OR_PERMISSION"
  | "PROVIDER_RESPONSE_EXTRACTION"
  | "STRUCTURED_OUTPUT_VALIDATION"
  | "USAGE_RECONCILIATION";

export type OpenAiTextFailureStage =
  | "budget_preflight"
  | "local_validation"
  | "provider_http"
  | "provider_response"
  | "response_extraction"
  | "structured_output"
  | "usage_reconciliation";

export interface OpenAiTextDiagnosticAuthorizationPort {
  close(sessionId: string): void;
  preflight(
    sessionId: string,
    operation: OpenAiTextDiagnosticOperation,
    model: string,
    maxCostUsd: number,
  ): OpenAiTextDiagnosticPreflight;
  reconcile(input: {
    readonly costClassification: OpenAiTextDiagnosticCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void;
  reserve(input: {
    readonly maxCostUsd: number;
    readonly model: string;
    readonly operation: OpenAiTextDiagnosticOperation;
    readonly operationId: string;
    readonly sessionId: string;
  }): void;
  snapshot(sessionId: string): OpenAiTextDiagnosticSnapshot;
}

export interface OpenAiTextFailureDiagnosisDependencies {
  readonly authorization: OpenAiTextDiagnosticAuthorizationPort;
  readonly gateway: LlmGateway;
}

export interface OpenAiTextFailureDiagnosisRequest {
  readonly correlationId: string;
  readonly invocationId: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly textProfileId: string;
}

export interface OpenAiTextDiagnosticOperationResult {
  readonly costClassification: OpenAiTextDiagnosticCostClassification;
  readonly estimatedCostUsd?: number;
  readonly operation: OpenAiTextDiagnosticOperation;
  readonly providerDiagnostic?: {
    readonly httpStatus?: number;
    readonly providerCode?: string;
    readonly providerParameter?: string;
    readonly providerType?: string;
  };
  readonly reasonCode?: OpenAiTextFailureReasonCode;
  readonly stage?: OpenAiTextFailureStage;
  readonly status: "BLOCKED" | "PASS";
}

export type OpenAiTextFailureDiagnosisResult =
  | {
      readonly ledger: OpenAiTextDiagnosticSnapshot;
      readonly plainText: OpenAiTextDiagnosticOperationResult;
      readonly providerStatus: "BLOCKED";
      readonly reasonCode: OpenAiTextFailureReasonCode;
      readonly stage: OpenAiTextFailureStage;
      readonly status: "BLOCKED";
      readonly structuredOutput: { readonly status: "NOT_RUN" };
    }
  | {
      readonly ledger: OpenAiTextDiagnosticSnapshot;
      readonly plainText: OpenAiTextDiagnosticOperationResult;
      readonly providerStatus: "BLOCKED";
      readonly reasonCode: OpenAiTextFailureReasonCode;
      readonly stage: OpenAiTextFailureStage;
      readonly status: "BLOCKED";
      readonly structuredOutput: OpenAiTextDiagnosticOperationResult;
    }
  | {
      readonly ledger: OpenAiTextDiagnosticSnapshot;
      readonly plainText: OpenAiTextDiagnosticOperationResult;
      readonly providerStatus: "READY";
      readonly status: "READY";
      readonly structuredOutput: OpenAiTextDiagnosticOperationResult;
    };

/**
 * Executes exactly the two permitted text probes. It has no image or social
 * dependency, and never retries a provider request. Only safe stage and reason
 * codes leave this boundary.
 */
export class OpenAiTextFailureDiagnosis {
  readonly #authorization: OpenAiTextDiagnosticAuthorizationPort;
  readonly #gateway: LlmGateway;

  public constructor(dependencies: OpenAiTextFailureDiagnosisDependencies) {
    this.#authorization = dependencies.authorization;
    this.#gateway = dependencies.gateway;
  }

  public async run(
    request: OpenAiTextFailureDiagnosisRequest,
  ): Promise<OpenAiTextFailureDiagnosisResult> {
    try {
      const plain = await this.#plainText(request);
      if (plain.status === "BLOCKED") {
        return {
          ledger: this.#authorization.snapshot(request.sessionId),
          plainText: plain,
          providerStatus: "BLOCKED",
          reasonCode: requiredReason(plain),
          stage: requiredStage(plain),
          status: "BLOCKED",
          structuredOutput: { status: "NOT_RUN" },
        };
      }

      const structured = await this.#structuredOutput(request);
      if (structured.status === "BLOCKED") {
        return {
          ledger: this.#authorization.snapshot(request.sessionId),
          plainText: plain,
          providerStatus: "BLOCKED",
          reasonCode: requiredReason(structured),
          stage: requiredStage(structured),
          status: "BLOCKED",
          structuredOutput: structured,
        };
      }

      return {
        ledger: this.#authorization.snapshot(request.sessionId),
        plainText: plain,
        providerStatus: "READY",
        status: "READY",
        structuredOutput: structured,
      };
    } finally {
      this.#authorization.close(request.sessionId);
    }
  }

  async #plainText(
    request: OpenAiTextFailureDiagnosisRequest,
  ): Promise<OpenAiTextDiagnosticOperationResult> {
    return this.#execute({
      expected: (response) => response.output.format === "text" && response.output.text.trim() === "ONLYWAY_PROVIDER_OK",
      operation: "OPENAI_TEXT_PLAIN_DIAGNOSTIC",
      operationId: `${request.requestId}:OPENAI_TEXT_PLAIN_DIAGNOSTIC`,
      request: {
        contractVersion: "1",
        correlationId: request.correlationId,
        invocationId: request.invocationId,
        limits: {
          maxCostUsd: OPENAI_TEXT_FAILURE_DIAGNOSIS_OPERATION_COST_USD,
          maxOutputTokens: 12,
          timeoutMs: 20_000,
        },
        messages: [{ content: "Rispondi esattamente:\nONLYWAY_PROVIDER_OK", role: "user" }],
        modelProfile: request.textProfileId,
        modelRequestId: `${request.requestId}-plain`,
        output: { format: "text" },
        taskId: request.taskId,
      },
      sessionId: request.sessionId,
      validationFailure: { reasonCode: "LOCAL_VALIDATION", stage: "local_validation" },
    });
  }

  async #structuredOutput(
    request: OpenAiTextFailureDiagnosisRequest,
  ): Promise<OpenAiTextDiagnosticOperationResult> {
    return this.#execute({
      expected: (response) => response.output.format === "json" && validStructuredOutput(response.output.value),
      operation: "OPENAI_TEXT_STRUCTURED_DIAGNOSTIC",
      operationId: `${request.requestId}:OPENAI_TEXT_STRUCTURED_DIAGNOSTIC`,
      request: {
        contractVersion: "1",
        correlationId: request.correlationId,
        invocationId: request.invocationId,
        limits: {
          maxCostUsd: OPENAI_TEXT_FAILURE_DIAGNOSIS_OPERATION_COST_USD,
          maxOutputTokens: 32,
          timeoutMs: 20_000,
        },
        messages: [{ content: "Restituisci soltanto l'oggetto JSON valido richiesto.", role: "user" }],
        modelProfile: request.textProfileId,
        modelRequestId: `${request.requestId}-structured`,
        output: { format: "json", schema: structuredOutputSchema() },
        taskId: request.taskId,
      },
      sessionId: request.sessionId,
      validationFailure: { reasonCode: "STRUCTURED_OUTPUT_VALIDATION", stage: "structured_output" },
    });
  }

  async #execute(input: {
    readonly expected: (response: Extract<ModelResponse, { readonly status: "succeeded" }>) => boolean;
    readonly operation: OpenAiTextDiagnosticOperation;
    readonly operationId: string;
    readonly request: Parameters<LlmGateway["generate"]>[0];
    readonly sessionId: string;
    readonly validationFailure: { readonly reasonCode: OpenAiTextFailureReasonCode; readonly stage: OpenAiTextFailureStage };
  }): Promise<OpenAiTextDiagnosticOperationResult> {
    const preflight = this.#authorization.preflight(
      input.sessionId,
      input.operation,
      OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL,
      OPENAI_TEXT_FAILURE_DIAGNOSIS_OPERATION_COST_USD,
    );
    if (preflight.status !== "ready") {
      return {
        costClassification: "RECONCILIATION_PENDING",
        operation: input.operation,
        reasonCode: "BUDGET_PREFLIGHT_BLOCKED",
        stage: "budget_preflight",
        status: "BLOCKED",
      };
    }
    try {
      this.#authorization.reserve({
        maxCostUsd: OPENAI_TEXT_FAILURE_DIAGNOSIS_OPERATION_COST_USD,
        model: OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL,
        operation: input.operation,
        operationId: input.operationId,
        sessionId: input.sessionId,
      });
    } catch {
      return {
        costClassification: "RECONCILIATION_PENDING",
        operation: input.operation,
        reasonCode: "BUDGET_PREFLIGHT_BLOCKED",
        stage: "budget_preflight",
        status: "BLOCKED",
      };
    }

    let response: ModelResponse;
    try {
      response = await this.#gateway.generate(input.request);
    } catch {
      return this.#settle(input, "failed", {
        costClassification: "RECONCILIATION_PENDING",
        reasonCode: "PROVIDER_HTTP_TRANSPORT",
        stage: "provider_http",
      });
    }
    if (response.status === "failed") {
      const classified = classifyProviderFailure(response, input.operation);
      return this.#settle(input, "failed", {
        ...classified,
        ...costFromResponse(response),
      });
    }
    if (!input.expected(response)) {
      return this.#settle(input, "failed", {
        ...input.validationFailure,
        ...costFromResponse(response),
      });
    }
    return this.#settle(input, "succeeded", costFromResponse(response));
  }

  #settle(
    input: { readonly operation: OpenAiTextDiagnosticOperation; readonly operationId: string; readonly sessionId: string },
    status: "failed" | "succeeded",
    value: {
      readonly costClassification: OpenAiTextDiagnosticCostClassification;
      readonly costUsd?: number;
      readonly providerDiagnostic?: OpenAiTextDiagnosticOperationResult["providerDiagnostic"];
      readonly reasonCode?: OpenAiTextFailureReasonCode;
      readonly stage?: OpenAiTextFailureStage;
    },
  ): OpenAiTextDiagnosticOperationResult {
    try {
      this.#authorization.reconcile({
        costClassification: value.costClassification,
        ...(value.costUsd === undefined ? {} : { costUsd: value.costUsd }),
        operationId: input.operationId,
        ...(value.reasonCode === undefined ? {} : { reasonCode: value.reasonCode }),
        sessionId: input.sessionId,
        status,
      });
    } catch {
      return {
        costClassification: "RECONCILIATION_PENDING",
        operation: input.operation,
        reasonCode: "USAGE_RECONCILIATION",
        stage: "usage_reconciliation",
        status: "BLOCKED",
      };
    }
    return {
      costClassification: value.costClassification,
      ...(value.costUsd === undefined ? {} : { estimatedCostUsd: value.costUsd }),
      operation: input.operation,
      ...(value.providerDiagnostic === undefined ? {} : { providerDiagnostic: value.providerDiagnostic }),
      ...(value.reasonCode === undefined ? {} : { reasonCode: value.reasonCode }),
      ...(value.stage === undefined ? {} : { stage: value.stage }),
      status: status === "succeeded" ? "PASS" : "BLOCKED",
    };
  }
}

function classifyProviderFailure(
  response: Extract<ModelResponse, { readonly status: "failed" }>,
  operation: OpenAiTextDiagnosticOperation,
): {
  readonly providerDiagnostic?: OpenAiTextDiagnosticOperationResult["providerDiagnostic"];
  readonly reasonCode: OpenAiTextFailureReasonCode;
  readonly stage: OpenAiTextFailureStage;
} {
  if (response.error.stage === "usage_accounting") {
    return { reasonCode: "USAGE_RECONCILIATION", stage: "usage_reconciliation" };
  }
  if (response.error.code === "openai_response_invalid" || response.error.code === "model_response_invalid") {
    return { reasonCode: "PROVIDER_RESPONSE_EXTRACTION", stage: "response_extraction" };
  }
  if (response.error.code === "openai_transport_failed") {
    return { reasonCode: "PROVIDER_HTTP_TRANSPORT", stage: "provider_http" };
  }
  const status = httpStatus(response.error.details);
  const providerDiagnostic = safeProviderDiagnostic(response.error.details);
  if (status === 401) return { reasonCode: "PROVIDER_AUTHENTICATION", stage: "provider_response", ...(providerDiagnostic === undefined ? {} : { providerDiagnostic }) };
  if (status === 403) return { reasonCode: "PROVIDER_PROJECT_OR_PERMISSION", stage: "provider_response", ...(providerDiagnostic === undefined ? {} : { providerDiagnostic }) };
  if (status === 400 || status === 422) {
    return operation === "OPENAI_TEXT_STRUCTURED_DIAGNOSTIC"
      ? { reasonCode: "STRUCTURED_OUTPUT_VALIDATION", stage: "structured_output", ...(providerDiagnostic === undefined ? {} : { providerDiagnostic }) }
      : { reasonCode: "PROVIDER_INVALID_REQUEST", stage: "provider_response", ...(providerDiagnostic === undefined ? {} : { providerDiagnostic }) };
  }
  if (response.error.stage === "response_validation") {
    return { reasonCode: "PROVIDER_RESPONSE_EXTRACTION", stage: "response_extraction" };
  }
  return { reasonCode: "PROVIDER_HTTP_TRANSPORT", stage: "provider_http" };
}

function costFromResponse(response: ModelResponse): {
  readonly costClassification: OpenAiTextDiagnosticCostClassification;
  readonly costUsd?: number;
} {
  const cost = response.usage?.costUsd;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0
    ? { costClassification: "ESTIMATED", costUsd: cost }
    : { costClassification: "RECONCILIATION_PENDING" };
}

function httpStatus(details: JsonObject | undefined): number | undefined {
  return typeof details?.status === "number" && Number.isSafeInteger(details.status)
    ? details.status
    : undefined;
}

function safeProviderDiagnostic(
  details: JsonObject | undefined,
): OpenAiTextDiagnosticOperationResult["providerDiagnostic"] | undefined {
  const status = httpStatus(details);
  const providerCode = identifier(details?.providerCode);
  const providerParameter = identifier(details?.providerParameter);
  const providerType = identifier(details?.providerType);
  return status === undefined && providerCode === undefined && providerParameter === undefined && providerType === undefined
    ? undefined
    : {
        ...(status === undefined ? {} : { httpStatus: status }),
        ...(providerCode === undefined ? {} : { providerCode }),
        ...(providerParameter === undefined ? {} : { providerParameter }),
        ...(providerType === undefined ? {} : { providerType }),
      };
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 96 && /^[A-Za-z0-9_.-]+$/u.test(value)
    ? value
    : undefined;
}

function validStructuredOutput(value: JsonObject): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === "status" && keys[1] === "title" && value.status === "OK" && typeof value.title === "string" && value.title.trim().length >= 1 && value.title.trim().length <= 120;
}

function structuredOutputSchema(): JsonObject {
  return {
    additionalProperties: false,
    properties: {
      status: { const: "OK", type: "string" },
      title: { maxLength: 120, minLength: 1, type: "string" },
    },
    required: ["status", "title"],
    type: "object",
  };
}

function requiredReason(value: OpenAiTextDiagnosticOperationResult): OpenAiTextFailureReasonCode {
  return value.reasonCode ?? "USAGE_RECONCILIATION";
}

function requiredStage(value: OpenAiTextDiagnosticOperationResult): OpenAiTextFailureStage {
  return value.stage ?? "usage_reconciliation";
}
