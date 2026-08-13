import type { JsonObject } from "../contracts/json.js";
import type { LlmGateway } from "../models/llm-gateway.js";
import type { ModelResponse } from "../models/model-response.js";
import type { MediaGenerationProvider } from "./media-generation-provider.js";
import {
  type LivePilotLedgerSnapshot,
  type LivePilotOperation,
  type LivePilotSessionPreflight,
} from "./live-pilot-session-ledger.js";

export const LIVE_AI_BRAND_MEDIA_PILOT_CONTRACT_VERSION = "1" as const;
export const LIVE_AI_BRAND_MEDIA_PILOT_PLAN = Object.freeze({
  apiBudgetEur: 5,
  closureMaxLiveCalls: 2,
  closureSessionMaxCostUsd: 0.1,
  hardStopUsd: 4,
  imageModelId: "gpt-image-1-mini",
  imageQuality: "low" as const,
  imageReservedCostUsd: 0.006,
  maxImageGenerations: 1,
  maxLiveCalls: 8,
  serverSpendUsd: 0,
  textModelId: "gpt-4o-mini",
  textReservedCostUsd: 0.005,
});

export interface LivePilotAuthorizationPort {
  close(sessionId: string): void;
  preflight(
    sessionId: string,
    operation: LivePilotOperation,
    model: string,
    maxCostUsd: number,
  ): LivePilotSessionPreflight;
  reconcile(
    sessionId: string,
    operationId: string,
    result: {
      readonly actualCostUsd: number;
      readonly reasonCode?: string;
      readonly status: "failed" | "succeeded";
    },
  ): void;
  reserve(input: {
    readonly maxCostUsd: number;
    readonly operation: LivePilotOperation;
    readonly operationId: string;
    readonly sessionId: string;
  }): void;
  snapshot(sessionId: string): LivePilotLedgerSnapshot;
}

export interface LiveAiBrandMediaPilotDependencies {
  readonly authorization: LivePilotAuthorizationPort;
  readonly imageProvider: MediaGenerationProvider;
  readonly textGateway: LlmGateway;
}

export interface LiveAiBrandMediaPilotRequest {
  readonly correlationId: string;
  readonly invocationId: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly textProfileId: string;
  readonly topic: string;
}

export interface LiveAiBrandMediaCostLedger {
  readonly apiBudgetEur: number;
  readonly estimatedCumulativeCostUsd: number;
  readonly hardStopUsd: number;
  readonly imageGenerations: number;
  readonly liveCalls: number;
  readonly preflightReservedCostUsd: number;
  readonly serverSpendUsd: 0;
  readonly sessionResidualBudgetUsd: number;
  readonly sessionStatus: string;
  readonly textCostUsd?: number;
}

export interface LiveAiContentBrief {
  readonly editorialAngle: string;
  readonly title: string;
  readonly visualSceneSummary: string;
}

export type LiveAiBrandMediaPilotResult =
  | {
      readonly brief: LiveAiContentBrief;
      readonly costLedger: LiveAiBrandMediaCostLedger;
      readonly imagePrompt: string;
      readonly master: {
        readonly bytes: Uint8Array;
        readonly height: number;
        readonly sha256: string;
        readonly width: number;
      };
      readonly status: "READY_FOR_LOCAL_RENDER";
    }
  | {
      readonly costLedger: LiveAiBrandMediaCostLedger;
      readonly reason:
        | "image_generation_failed"
        | "preflight_blocked"
        | "text_generation_failed";
      readonly status: "BLOCKED";
    };

/**
 * This orchestration layer knows only two provider-neutral ports. The SQLite
 * session gate authorizes each operation before it reaches either provider;
 * social transports and credentials are intentionally outside this boundary.
 */
export class LiveAiBrandMediaPilot {
  readonly #authorization: LivePilotAuthorizationPort;
  readonly #imageProvider: MediaGenerationProvider;
  readonly #textGateway: LlmGateway;

  public constructor(dependencies: LiveAiBrandMediaPilotDependencies) {
    this.#authorization = dependencies.authorization;
    this.#imageProvider = dependencies.imageProvider;
    this.#textGateway = dependencies.textGateway;
  }

  public async run(
    request: LiveAiBrandMediaPilotRequest,
  ): Promise<LiveAiBrandMediaPilotResult> {
    const textOperationId = `${request.requestId}:OPENAI_TEXT_PROVIDER_SMOKE`;
    if (!this.#authorize(
      request.sessionId,
      "OPENAI_TEXT_PROVIDER_SMOKE",
      LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textModelId,
      LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd,
      textOperationId,
    )) return this.#blocked(request.sessionId, "preflight_blocked");

    let textResponse: ModelResponse;
    try {
      textResponse = await this.#textGateway.generate({
        contractVersion: "1",
        correlationId: request.correlationId,
        invocationId: request.invocationId,
        limits: {
          maxCostUsd: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd,
          maxOutputTokens: 90,
          timeoutMs: 20_000,
        },
        messages: [
          {
            content: "Sei il direttore editoriale Metodo Veloce. Restituisci solo JSON conforme allo schema. Nessun claim economico non verificabile, nessun testo destinato a comparire nell'immagine.",
            role: "system",
          },
          {
            content: `Prepara un brief minimo, concreto e sobrio sul tema: ${request.topic}. Il contenuto riguarda “5 oggetti in casa che puoi vendere subito”.`,
            role: "user",
          },
        ],
        modelProfile: request.textProfileId,
        modelRequestId: `${request.requestId}-text`,
        output: { format: "json", schema: contentBriefSchema() },
        taskId: request.taskId,
      });
    } catch {
      this.#fail(
        request.sessionId,
        textOperationId,
        LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd,
        "text_transport_failed_unpriced",
      );
      return this.#blocked(
        request.sessionId,
        "text_generation_failed",
        LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd,
      );
    }

    const textCost = successfulCost(textResponse) ?? 0;
    const brief = contentBrief(textResponse);
    if (brief === undefined) {
      this.#fail(request.sessionId, textOperationId, textCost, "text_brief_invalid");
      return this.#blocked(request.sessionId, "text_generation_failed", textCost);
    }
    this.#authorization.reconcile(request.sessionId, textOperationId, {
      actualCostUsd: textCost,
      status: "succeeded",
    });

    const imageOperationId = `${request.requestId}:OPENAI_METODO_VELOCE_MASTER_IMAGE`;
    if (!this.#authorize(
      request.sessionId,
      "OPENAI_METODO_VELOCE_MASTER_IMAGE",
      LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageModelId,
      LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd,
      imageOperationId,
    )) return this.#blocked(request.sessionId, "preflight_blocked", textCost);

    const imagePrompt = imagePromptFor(brief);
    try {
      const imageResponse = await this.#imageProvider.generate({
        contractVersion: "1",
        maxEstimatedCostUsd: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd,
        modelId: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageModelId,
        outputFormat: "png",
        prompt: imagePrompt,
        quality: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageQuality,
        requestId: `${request.requestId}-image`,
        size: "1024x1536",
      });
      if (imageResponse.status !== "succeeded") {
        this.#fail(request.sessionId, imageOperationId, LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd, "image_provider_failed");
        return this.#blocked(request.sessionId, "image_generation_failed", textCost);
      }
      this.#authorization.reconcile(request.sessionId, imageOperationId, {
        actualCostUsd: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd,
        status: "succeeded",
      });
      return {
        brief,
        costLedger: this.#ledger(request.sessionId, textCost),
        imagePrompt,
        master: {
          bytes: imageResponse.image.bytes,
          height: imageResponse.image.height,
          sha256: imageResponse.image.sha256,
          width: imageResponse.image.width,
        },
        status: "READY_FOR_LOCAL_RENDER",
      };
    } catch {
      this.#fail(request.sessionId, imageOperationId, LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd, "image_transport_failed");
      return this.#blocked(request.sessionId, "image_generation_failed", textCost);
    }
  }

  public preflight(sessionId: string): readonly LivePilotSessionPreflight[] {
    return [
      this.#authorization.preflight(sessionId, "OPENAI_TEXT_PROVIDER_SMOKE", LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textModelId, LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd),
      this.#authorization.preflight(sessionId, "OPENAI_METODO_VELOCE_MASTER_IMAGE", LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageModelId, LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd),
    ];
  }

  #authorize(
    sessionId: string,
    operation: LivePilotOperation,
    model: string,
    maxCostUsd: number,
    operationId: string,
  ): boolean {
    const preflight = this.#authorization.preflight(sessionId, operation, model, maxCostUsd);
    if (preflight.status !== "ready" || preflight.model !== model || preflight.maxCostUsd !== maxCostUsd) return false;
    try {
      this.#authorization.reserve({ maxCostUsd, operation, operationId, sessionId });
      return true;
    } catch {
      return false;
    }
  }

  #fail(sessionId: string, operationId: string, cost: number, reasonCode: string): void {
    try {
      this.#authorization.reconcile(sessionId, operationId, {
        actualCostUsd: cost,
        reasonCode,
        status: "failed",
      });
      this.#authorization.close(sessionId);
    } catch {
      // A failed reconciliation remains safely reserved and the call is not retried.
    }
  }

  #blocked(
    sessionId: string,
    reason: Extract<LiveAiBrandMediaPilotResult, { readonly status: "BLOCKED" }> ["reason"],
    textCostUsd?: number,
  ): Extract<LiveAiBrandMediaPilotResult, { readonly status: "BLOCKED" }> {
    return { costLedger: this.#ledger(sessionId, textCostUsd), reason, status: "BLOCKED" };
  }

  #ledger(sessionId: string, textCostUsd?: number): LiveAiBrandMediaCostLedger {
    const snapshot = this.#authorization.snapshot(sessionId);
    return {
      apiBudgetEur: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.apiBudgetEur,
      estimatedCumulativeCostUsd: snapshot.actualCostUsd,
      hardStopUsd: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.hardStopUsd,
      imageGenerations: snapshot.authorizedCounts.image,
      liveCalls: snapshot.liveCalls,
      preflightReservedCostUsd: LIVE_AI_BRAND_MEDIA_PILOT_PLAN.textReservedCostUsd + LIVE_AI_BRAND_MEDIA_PILOT_PLAN.imageReservedCostUsd,
      serverSpendUsd: 0,
      sessionResidualBudgetUsd: snapshot.sessionResidualBudgetUsd,
      sessionStatus: snapshot.status,
      ...(textCostUsd === undefined ? {} : { textCostUsd }),
    };
  }
}

function successfulCost(response: ModelResponse): number | undefined {
  return response.status === "succeeded" ? response.usage.costUsd : undefined;
}

function contentBrief(response: ModelResponse): LiveAiContentBrief | undefined {
  if (response.status !== "succeeded" || response.output.format !== "json") return undefined;
  const value = response.output.value;
  const title = text(value.title, 90);
  const editorialAngle = text(value.editorialAngle, 260);
  const visualSceneSummary = text(value.visualSceneSummary, 360);
  return title === undefined || editorialAngle === undefined || visualSceneSummary === undefined
    ? undefined
    : { editorialAngle, title, visualSceneSummary };
}

function text(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  return normalized.length >= 3 && normalized.length <= maximum ? normalized : undefined;
}

function contentBriefSchema(): JsonObject {
  return {
    additionalProperties: false,
    properties: {
      editorialAngle: { maxLength: 260, minLength: 3, type: "string" },
      title: { maxLength: 90, minLength: 3, type: "string" },
      visualSceneSummary: { maxLength: 360, minLength: 3, type: "string" },
    },
    required: ["title", "editorialAngle", "visualSceneSummary"],
    type: "object",
  };
}

function imagePromptFor(brief: LiveAiContentBrief): string {
  return `Vertical editorial still life for Metodo Veloce, theme “5 oggetti in casa che puoi vendere subito”. Visual direction: ${brief.visualSceneSummary}. Dark obsidian setting, precise yellow accents, natural cinematic light, practical resale and organisation mood. No words, no letters, no typography, no logos, no watermark, no trademarks, no interface, no brand marks. Leave clear negative space at top and lower-right for a local title and a locally overlaid original logo.`;
}
