import { createHash } from "node:crypto";

import type {
  GeneratedMasterImage,
  MediaGenerationProvider,
  MediaGenerationProviderReceipt,
} from "./media-generation-provider.js";
import { MediaGenerationProviderError } from "./media-generation-provider.js";
import {
  IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
  type ImageRecoveryReceiptRow,
  type ImageRecoverySessionLedger,
  type ImageRecoverySnapshot,
} from "./image-recovery-session-ledger.js";
import {
  MEDIA_QUALITY_IMAGE_MODEL,
  MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD,
  MEDIA_QUALITY_IMAGE_SNAPSHOT,
  type MediaContentDirection,
  masterImagePrompt,
} from "./media-quality-closure.js";

export const IMAGE_RECOVERY_TIMEOUT_MS = 180_000;

export type ImageRecoveryReasonCode =
  | "IMAGE_PROVIDER_AUTHENTICATION"
  | "IMAGE_PROVIDER_HTTP_TRANSPORT"
  | "IMAGE_PROVIDER_INVALID_REQUEST"
  | "IMAGE_PROVIDER_PROJECT_OR_PERMISSION"
  | "IMAGE_PROVIDER_RATE_OR_BUDGET"
  | "IMAGE_PROVIDER_TRANSPORT_TIMEOUT"
  | "IMAGE_RESPONSE_INVALID";

export interface ImageRecoveryOperationReceipt {
  readonly costClassification: "ESTIMATED" | "RECONCILIATION_PENDING";
  readonly estimatedCostUsd?: number;
  readonly idempotencyKeyFingerprint: string;
  readonly model: typeof MEDIA_QUALITY_IMAGE_MODEL;
  readonly modelSnapshot: typeof MEDIA_QUALITY_IMAGE_SNAPSHOT;
  readonly operationId: string;
  readonly provider: MediaGenerationProviderReceipt;
  readonly requestFingerprint: string;
  readonly status: "FAILED" | "SUCCEEDED" | "UNCERTAIN";
}

export type ImageRecoveryResult =
  | {
      readonly callCount: 1;
      readonly ledger: ImageRecoverySnapshot;
      readonly ledgerReceipt: ImageRecoveryReceiptRow;
      readonly reasonCode: ImageRecoveryReasonCode;
      readonly receipt: ImageRecoveryOperationReceipt;
      readonly status: "BLOCKED";
    }
  | {
      readonly callCount: 1;
      readonly estimatedCostUsd: number;
      readonly ledger: ImageRecoverySnapshot;
      readonly ledgerReceipt: ImageRecoveryReceiptRow;
      readonly master: GeneratedMasterImage;
      readonly receipt: ImageRecoveryOperationReceipt;
      readonly status: "READY_FOR_LOCAL_RENDER";
    };

export class ImageRecovery {
  readonly #ledger: ImageRecoverySessionLedger;
  readonly #provider: MediaGenerationProvider;

  public constructor(input: { readonly ledger: ImageRecoverySessionLedger; readonly provider: MediaGenerationProvider }) {
    this.#ledger = input.ledger;
    this.#provider = input.provider;
  }

  public preflight(sessionId: string): Readonly<Record<string, unknown>> {
    return this.#ledger.preflight({ maxCostUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD, sessionId });
  }

  public async run(input: {
    readonly clientRequestId: string;
    readonly direction: MediaContentDirection;
    readonly idempotencyKey: string;
    readonly operationId: string;
    readonly sessionId: string;
  }): Promise<ImageRecoveryResult> {
    const prompt = masterImagePrompt(input.direction);
    const requestFingerprint = sha(JSON.stringify({
      model: MEDIA_QUALITY_IMAGE_MODEL,
      modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
      promptFingerprint: sha(prompt),
      quality: "high",
      size: "1024x1536",
    }));
    this.#ledger.reserve({
      clientRequestId: input.clientRequestId,
      idempotencyKeyFingerprint: sha(input.idempotencyKey),
      maxCostUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
      modelId: MEDIA_QUALITY_IMAGE_SNAPSHOT,
      operationId: input.operationId,
      requestFingerprint,
      sessionId: input.sessionId,
    });

    try {
      const response = await this.#provider.generate({
        clientRequestId: input.clientRequestId,
        contractVersion: "1",
        maxEstimatedCostUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
        modelId: MEDIA_QUALITY_IMAGE_SNAPSHOT,
        outputFormat: "png",
        prompt,
        quality: "high",
        requestId: input.idempotencyKey,
        size: "1024x1536",
      });
      if (response.status === "failed") {
        const reasonCode = classifyHttpFailure(response.error.status);
        const provider = response.providerReceipt ?? { xClientRequestId: input.clientRequestId };
        this.#ledger.settle({
          costClassification: "RECONCILIATION_PENDING",
          operationId: input.operationId,
          reasonCode,
          sessionId: input.sessionId,
          status: response.error.status === undefined ? "uncertain" : "failed",
          ...(provider.xRequestId === undefined ? {} : { xRequestId: provider.xRequestId }),
        });
        return this.#blocked(input, provider, requestFingerprint, reasonCode, response.error.status === undefined ? "UNCERTAIN" : "FAILED");
      }
      if (response.image.width !== 1024 || response.image.height !== 1536) {
        const provider = response.providerReceipt ?? { xClientRequestId: input.clientRequestId };
        this.#ledger.settle({
          costClassification: "RECONCILIATION_PENDING",
          operationId: input.operationId,
          reasonCode: "IMAGE_RESPONSE_INVALID",
          sessionId: input.sessionId,
          status: "uncertain",
          ...(provider.xRequestId === undefined ? {} : { xRequestId: provider.xRequestId }),
        });
        return this.#blocked(input, provider, requestFingerprint, "IMAGE_RESPONSE_INVALID", "UNCERTAIN");
      }
      const provider = response.providerReceipt ?? { xClientRequestId: input.clientRequestId };
      const estimatedCostUsd = estimateCost(provider);
      this.#ledger.settle({
        costClassification: "ESTIMATED",
        costUsd: estimatedCostUsd,
        operationId: input.operationId,
        sessionId: input.sessionId,
        status: "succeeded",
        ...(provider.xRequestId === undefined ? {} : { xRequestId: provider.xRequestId }),
      });
      const receipt: ImageRecoveryOperationReceipt = {
        costClassification: "ESTIMATED",
        estimatedCostUsd,
        idempotencyKeyFingerprint: sha(input.idempotencyKey),
        model: MEDIA_QUALITY_IMAGE_MODEL,
        modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
        operationId: input.operationId,
        provider,
        requestFingerprint,
        status: "SUCCEEDED",
      };
      return {
        callCount: 1,
        estimatedCostUsd,
        ledger: this.#ledger.snapshot(input.sessionId),
        ledgerReceipt: this.#ledger.receipt(input.operationId),
        master: response.image,
        receipt,
        status: "READY_FOR_LOCAL_RENDER",
      };
    } catch (error) {
      const provider = error instanceof MediaGenerationProviderError && error.providerReceipt !== undefined
        ? error.providerReceipt
        : { xClientRequestId: input.clientRequestId };
      const reasonCode: ImageRecoveryReasonCode = error instanceof MediaGenerationProviderError && error.code === "image_transport_timeout"
        ? "IMAGE_PROVIDER_TRANSPORT_TIMEOUT"
        : error instanceof MediaGenerationProviderError && error.code === "image_response_invalid"
          ? "IMAGE_RESPONSE_INVALID"
          : "IMAGE_PROVIDER_HTTP_TRANSPORT";
      this.#ledger.settle({
        costClassification: "RECONCILIATION_PENDING",
        operationId: input.operationId,
        reasonCode,
        sessionId: input.sessionId,
        status: "uncertain",
        ...(provider.xRequestId === undefined ? {} : { xRequestId: provider.xRequestId }),
      });
      return this.#blocked(input, provider, requestFingerprint, reasonCode, "UNCERTAIN");
    }
  }

  #blocked(
    input: { readonly idempotencyKey: string; readonly operationId: string; readonly sessionId: string },
    provider: MediaGenerationProviderReceipt,
    requestFingerprint: string,
    reasonCode: ImageRecoveryReasonCode,
    status: "FAILED" | "UNCERTAIN",
  ): ImageRecoveryResult {
    return {
      callCount: 1,
      ledger: this.#ledger.snapshot(input.sessionId),
      ledgerReceipt: this.#ledger.receipt(input.operationId),
      reasonCode,
      receipt: {
        costClassification: "RECONCILIATION_PENDING",
        idempotencyKeyFingerprint: sha(input.idempotencyKey),
        model: MEDIA_QUALITY_IMAGE_MODEL,
        modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
        operationId: input.operationId,
        provider,
        requestFingerprint,
        status,
      },
      status: "BLOCKED",
    };
  }
}

export function recoveredValidatedDirection(): MediaContentDirection {
  return Object.freeze({
    editorialAngle: "Trasformare il disordine in una checklist concreta, senza promesse di vendita o guadagno.",
    hook: "Cinque categorie da controllare prima del prossimo annuncio.",
    negativeRules: Object.freeze([
      "nessun testo generato",
      "nessun logo o watermark",
      "nessun oggetto duplicato o deformato",
      "nessun marchio inventato",
      "nessuna promessa economica",
    ]),
    requiredObjects: Object.freeze([
      "smartphone usato",
      "cuffie",
      "sneakers",
      "accessorio streetwear",
      "piccolo oggetto di valore",
    ]),
    title: "5 oggetti da riscoprire in casa",
    visualMood: "dark luxury cinematografico, nero con accenti gialli e luci bianche pulite",
    visualScene: "still life pubblicitario premium con materiali realistici e spazio negativo per headline locale",
  });
}

function estimateCost(receipt: MediaGenerationProviderReceipt): number {
  const usage = receipt.usage;
  if (usage === undefined) return MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD;
  const inputImageTokens = usage.inputImageTokens ?? 0;
  const inputTextTokens = usage.inputTextTokens ?? Math.max(0, usage.inputTokens - inputImageTokens);
  const outputImageTokens = usage.outputImageTokens ?? usage.outputTokens;
  return roundUsd((inputTextTokens * 5 + inputImageTokens * 8 + outputImageTokens * 30) / 1_000_000);
}

function classifyHttpFailure(status: number | undefined): ImageRecoveryReasonCode {
  if (status === 400 || status === 422) return "IMAGE_PROVIDER_INVALID_REQUEST";
  if (status === 401) return "IMAGE_PROVIDER_AUTHENTICATION";
  if (status === 403 || status === 404) return "IMAGE_PROVIDER_PROJECT_OR_PERMISSION";
  if (status === 408 || status === 429) return "IMAGE_PROVIDER_RATE_OR_BUDGET";
  return "IMAGE_PROVIDER_HTTP_TRANSPORT";
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function roundUsd(value: number): number { return Math.round(value * 1_000_000_000) / 1_000_000_000; }
