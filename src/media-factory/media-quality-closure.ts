import { createHash } from "node:crypto";

import type {
  OpenAiResponsesPlainConformanceResponse,
} from "../models/providers/openai-responses-conformance-provider.js";
import {
  buildOpenAiResponsesMediaDirectionRequest,
  type OpenAiResponsesCanonicalRequest,
  type OpenAiResponsesRequestShapeManifest,
} from "../models/providers/openai-responses-request-builder.js";
import type {
  MediaGenerationProvider,
  GeneratedMasterImage,
} from "./media-generation-provider.js";
import { MediaGenerationProviderError } from "./media-generation-provider.js";
import type {
  MediaQualityLedgerSnapshot,
  MediaQualityPreflight,
  MediaQualitySessionLedger,
} from "./media-quality-session-ledger.js";

export const MEDIA_QUALITY_CLOSURE_CONTRACT_VERSION = "1" as const;
export const MEDIA_QUALITY_TEXT_MODEL = "gpt-4o-mini" as const;
export const MEDIA_QUALITY_TEXT_SNAPSHOT = "gpt-4o-mini-2024-07-18" as const;
export const MEDIA_QUALITY_IMAGE_MODEL = "gpt-image-2" as const;
export const MEDIA_QUALITY_IMAGE_SNAPSHOT = "gpt-image-2-2026-04-21" as const;
export const MEDIA_QUALITY_TEXT_RESERVATION_USD = 0.01;
export const MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD = 0.165;
export const MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD = 0.17;
export const MEDIA_QUALITY_IMAGE_RESERVATION_USD = 0.2;

export interface MediaContentDirection {
  readonly editorialAngle: string;
  readonly hook: string;
  readonly negativeRules: readonly string[];
  readonly requiredObjects: readonly string[];
  readonly title: string;
  readonly visualMood: string;
  readonly visualScene: string;
}

export interface MediaQualityDirectionProvider {
  execute(input: {
    readonly idempotencyKey: string;
    readonly request: OpenAiResponsesCanonicalRequest;
    readonly timeoutMs: number;
  }): Promise<OpenAiResponsesPlainConformanceResponse>;
}

export type MediaQualityClosureReasonCode =
  | "BUDGET_PREFLIGHT_BLOCKED"
  | "IMAGE_PROVIDER_AUTHENTICATION"
  | "IMAGE_PROVIDER_HTTP_TRANSPORT"
  | "IMAGE_PROVIDER_INVALID_REQUEST"
  | "IMAGE_PROVIDER_PROJECT_OR_PERMISSION"
  | "IMAGE_PROVIDER_RATE_OR_BUDGET"
  | "IMAGE_PROVIDER_TRANSPORT_TIMEOUT"
  | "IMAGE_RESPONSE_INVALID"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_HTTP_TRANSPORT"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_PROJECT_OR_PERMISSION"
  | "PROVIDER_RESPONSE_EXTRACTION"
  | "STRUCTURED_OUTPUT_VALIDATION"
  | "USAGE_RECONCILIATION";

export interface MediaQualityOperationReceipt {
  readonly costClassification: "ESTIMATED";
  readonly estimatedCostUsd: number;
  readonly idempotencyKeyFingerprint: string;
  readonly model: string;
  readonly modelSnapshot: string;
  readonly operation: "GPT_IMAGE_2_MASTER" | "STRUCTURED_CONTENT_DIRECTION";
  readonly operationIdFingerprint: string;
  readonly outputFingerprint: string;
  readonly requestFingerprint: string;
  readonly status: "SUCCEEDED";
}

export interface MediaQualityValidatedStructuredOutput {
  readonly direction: MediaContentDirection;
  readonly estimatedCostUsd: number;
  readonly receipt: MediaQualityOperationReceipt;
  readonly requestShape: OpenAiResponsesRequestShapeManifest;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

export type MediaQualityClosureResult =
  | {
      readonly imageCalls: 0 | 1;
      readonly ledger: MediaQualityLedgerSnapshot;
      readonly reasonCode: MediaQualityClosureReasonCode;
      readonly status: "BLOCKED";
      readonly structuredOutput?: MediaQualityValidatedStructuredOutput;
      readonly textCalls: 0 | 1;
    }
  | {
      readonly cost: {
        readonly imageEstimatedCostUsd: number;
        readonly textEstimatedCostUsd: number;
        readonly totalEstimatedCostUsd: number;
      };
      readonly direction: MediaContentDirection;
      readonly imageCalls: 1;
      readonly imagePrompt: string;
      readonly ledger: MediaQualityLedgerSnapshot;
      readonly master: GeneratedMasterImage;
      readonly receipts: readonly [MediaQualityOperationReceipt, MediaQualityOperationReceipt];
      readonly requestShape: OpenAiResponsesRequestShapeManifest;
      readonly status: "READY_FOR_LOCAL_RENDER";
      readonly textCalls: 1;
      readonly usage: {
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly totalTokens: number;
      };
    };

/** Two operations, no retry and no fallback. */
export class MediaQualityClosure {
  readonly #authorization: MediaQualitySessionLedger;
  readonly #directionProvider: MediaQualityDirectionProvider;
  readonly #imageProvider: MediaGenerationProvider;

  public constructor(input: {
    readonly authorization: MediaQualitySessionLedger;
    readonly directionProvider: MediaQualityDirectionProvider;
    readonly imageProvider: MediaGenerationProvider;
  }) {
    this.#authorization = input.authorization;
    this.#directionProvider = input.directionProvider;
    this.#imageProvider = input.imageProvider;
  }

  public preflight(sessionId: string): readonly [MediaQualityPreflight, MediaQualityPreflight] {
    return [
      this.#authorization.preflight({
        maxCostUsd: MEDIA_QUALITY_TEXT_RESERVATION_USD,
        model: MEDIA_QUALITY_TEXT_MODEL,
        operation: "STRUCTURED_CONTENT_DIRECTION",
        sessionId,
      }),
      this.#authorization.preflight({
        maxCostUsd: MEDIA_QUALITY_IMAGE_RESERVATION_USD,
        model: MEDIA_QUALITY_IMAGE_MODEL,
        operation: "GPT_IMAGE_2_MASTER",
        sessionId,
      }),
    ];
  }

  public async run(input: {
    readonly imageIdempotencyKey: string;
    readonly imageOperationId: string;
    readonly sessionId: string;
    readonly textIdempotencyKey: string;
    readonly textOperationId: string;
  }): Promise<MediaQualityClosureResult> {
    const canonicalRequest = buildOpenAiResponsesMediaDirectionRequest({
      input: contentDirectionPrompt(),
      model: MEDIA_QUALITY_TEXT_MODEL,
    });
    const textPreflight = this.#authorization.preflight({
      maxCostUsd: MEDIA_QUALITY_TEXT_RESERVATION_USD,
      model: MEDIA_QUALITY_TEXT_MODEL,
      operation: "STRUCTURED_CONTENT_DIRECTION",
      sessionId: input.sessionId,
    });
    if (textPreflight.status !== "ready") return this.#blocked(input.sessionId, "BUDGET_PREFLIGHT_BLOCKED");
    try {
      this.#authorization.reserve({
        maxCostUsd: MEDIA_QUALITY_TEXT_RESERVATION_USD,
        model: MEDIA_QUALITY_TEXT_MODEL,
        operation: "STRUCTURED_CONTENT_DIRECTION",
        operationId: input.textOperationId,
        sessionId: input.sessionId,
      });
    } catch {
      return this.#blocked(input.sessionId, "BUDGET_PREFLIGHT_BLOCKED");
    }

    let response: OpenAiResponsesPlainConformanceResponse;
    try {
      response = await this.#directionProvider.execute({
        idempotencyKey: input.textIdempotencyKey,
        request: canonicalRequest,
        timeoutMs: 20_000,
      });
    } catch {
      return this.#settleTextFailure(input, "PROVIDER_HTTP_TRANSPORT");
    }
    if (response.status === "failure") return this.#settleTextFailure(input, classifyTextFailure(response.diagnostic.httpStatus));
    if (response.outputText === undefined) return this.#settleTextFailure(input, "PROVIDER_RESPONSE_EXTRACTION");
    const direction = parseDirection(response.outputText);
    if (direction === undefined) return this.#settleTextFailure(input, "STRUCTURED_OUTPUT_VALIDATION");
    if (response.usage === undefined) return this.#settleTextFailure(input, "USAGE_RECONCILIATION");
    const textCost = estimateTextCost(response.usage);
    try {
      this.#authorization.reconcile({
        costClassification: "ESTIMATED",
        costUsd: textCost,
        operationId: input.textOperationId,
        sessionId: input.sessionId,
        status: "succeeded",
      });
    } catch {
      this.#authorization.close(input.sessionId);
      return this.#blocked(input.sessionId, "USAGE_RECONCILIATION");
    }
    const directionFingerprint = sha(stableDirection(direction));
    const textReceipt = receipt({
      cost: textCost,
      idempotencyKey: input.textIdempotencyKey,
      model: MEDIA_QUALITY_TEXT_MODEL,
      modelSnapshot: MEDIA_QUALITY_TEXT_SNAPSHOT,
      operation: "STRUCTURED_CONTENT_DIRECTION",
      operationId: input.textOperationId,
      outputFingerprint: directionFingerprint,
      requestFingerprint: canonicalRequest.manifest.fingerprint,
    });
    const structuredOutput: MediaQualityValidatedStructuredOutput = {
      direction,
      estimatedCostUsd: textCost,
      receipt: textReceipt,
      requestShape: canonicalRequest.manifest,
      usage: response.usage,
    };

    const imagePrompt = masterImagePrompt(direction);
    const imagePreflight = this.#authorization.preflight({
      maxCostUsd: MEDIA_QUALITY_IMAGE_RESERVATION_USD,
      model: MEDIA_QUALITY_IMAGE_MODEL,
      operation: "GPT_IMAGE_2_MASTER",
      sessionId: input.sessionId,
    });
    if (imagePreflight.status !== "ready") {
      this.#authorization.close(input.sessionId);
      return this.#blocked(input.sessionId, "BUDGET_PREFLIGHT_BLOCKED", structuredOutput);
    }
    try {
      this.#authorization.reserve({
        maxCostUsd: MEDIA_QUALITY_IMAGE_RESERVATION_USD,
        model: MEDIA_QUALITY_IMAGE_MODEL,
        operation: "GPT_IMAGE_2_MASTER",
        operationId: input.imageOperationId,
        sessionId: input.sessionId,
      });
    } catch {
      this.#authorization.close(input.sessionId);
      return this.#blocked(input.sessionId, "BUDGET_PREFLIGHT_BLOCKED", structuredOutput);
    }
    let imageResponse;
    try {
      imageResponse = await this.#imageProvider.generate({
        contractVersion: "1",
        maxEstimatedCostUsd: MEDIA_QUALITY_IMAGE_RESERVATION_USD,
        modelId: MEDIA_QUALITY_IMAGE_MODEL,
        outputFormat: "png",
        prompt: imagePrompt,
        quality: "high",
        requestId: input.imageIdempotencyKey,
        size: "1024x1536",
      });
    } catch (error) {
      return this.#settleImageFailure(
        input,
        error instanceof MediaGenerationProviderError && error.code === "image_transport_timeout"
          ? "IMAGE_PROVIDER_TRANSPORT_TIMEOUT"
          : "IMAGE_PROVIDER_HTTP_TRANSPORT",
        structuredOutput,
      );
    }
    if (imageResponse.status === "failed") return this.#settleImageFailure(input, classifyImageFailure(imageResponse.error.status), structuredOutput);
    if (imageResponse.image.width !== 1024 || imageResponse.image.height !== 1536) return this.#settleImageFailure(input, "IMAGE_RESPONSE_INVALID", structuredOutput);
    try {
      this.#authorization.reconcile({
        costClassification: "ESTIMATED",
        costUsd: MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD,
        operationId: input.imageOperationId,
        sessionId: input.sessionId,
        status: "succeeded",
      });
      this.#authorization.close(input.sessionId);
    } catch {
      return this.#blocked(input.sessionId, "USAGE_RECONCILIATION", structuredOutput);
    }
    const imageReceipt = receipt({
      cost: MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD,
      idempotencyKey: input.imageIdempotencyKey,
      model: MEDIA_QUALITY_IMAGE_MODEL,
      modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
      operation: "GPT_IMAGE_2_MASTER",
      operationId: input.imageOperationId,
      outputFingerprint: imageResponse.image.sha256,
      requestFingerprint: sha(JSON.stringify({
        model: MEDIA_QUALITY_IMAGE_MODEL,
        promptFingerprint: sha(imagePrompt),
        quality: "high",
        size: "1024x1536",
      })),
    });
    return {
      cost: {
        imageEstimatedCostUsd: MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD,
        textEstimatedCostUsd: textCost,
        totalEstimatedCostUsd: roundUsd(textCost + MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD),
      },
      direction,
      imageCalls: 1,
      imagePrompt,
      ledger: this.#authorization.snapshot(input.sessionId),
      master: imageResponse.image,
      receipts: [textReceipt, imageReceipt],
      requestShape: canonicalRequest.manifest,
      status: "READY_FOR_LOCAL_RENDER",
      textCalls: 1,
      usage: response.usage,
    };
  }

  #settleTextFailure(input: { readonly sessionId: string; readonly textOperationId: string }, reasonCode: MediaQualityClosureReasonCode): MediaQualityClosureResult {
    try {
      this.#authorization.reconcile({ costClassification: "RECONCILIATION_PENDING", operationId: input.textOperationId, reasonCode, sessionId: input.sessionId, status: "failed" });
    } catch { reasonCode = "USAGE_RECONCILIATION"; }
    this.#authorization.close(input.sessionId);
    return this.#blocked(input.sessionId, reasonCode);
  }

  #settleImageFailure(
    input: { readonly imageOperationId: string; readonly sessionId: string },
    reasonCode: MediaQualityClosureReasonCode,
    structuredOutput: MediaQualityValidatedStructuredOutput,
  ): MediaQualityClosureResult {
    try {
      this.#authorization.reconcile({ costClassification: "RECONCILIATION_PENDING", operationId: input.imageOperationId, reasonCode, sessionId: input.sessionId, status: "failed" });
    } catch { reasonCode = "USAGE_RECONCILIATION"; }
    this.#authorization.close(input.sessionId);
    return this.#blocked(input.sessionId, reasonCode, structuredOutput);
  }

  #blocked(
    sessionId: string,
    reasonCode: MediaQualityClosureReasonCode,
    structuredOutput?: MediaQualityValidatedStructuredOutput,
  ): MediaQualityClosureResult {
    const ledger = this.#authorization.snapshot(sessionId);
    return {
      imageCalls: ledger.imageCalls === 0 ? 0 : 1,
      ledger,
      reasonCode,
      status: "BLOCKED",
      ...(structuredOutput === undefined ? {} : { structuredOutput }),
      textCalls: ledger.textCalls === 0 ? 0 : 1,
    };
  }
}

function contentDirectionPrompt(): string {
  return [
    "Create a concise Italian content direction for the topic: 5 oggetti in casa che puoi vendere subito.",
    "Use only the authorized existing package topic and these five user-authorized object categories: smartphone usato, cuffie, sneakers, accessorio streetwear, piccolo oggetto di valore.",
    "Do not promise sales, income, price, speed, demand, or guaranteed results. Do not add private data, sources, tools, or live research.",
    "The direction must support a premium dark-luxury cinematic still with black, yellow and white atmosphere, negative headline space, realistic materials and safe 4:5 plus 9:16 crops.",
    "requiredObjects must contain exactly the five categories. negativeRules must explicitly prohibit generated text, logos, watermarks, duplicate objects, obvious deformation, invented brands and earnings claims.",
    "Return only the strict JSON object requested by the response schema.",
  ].join("\n");
}

export function masterImagePrompt(direction: MediaContentDirection): string {
  return [
    "Create one photorealistic professional advertising still, dark luxury cinematic mood, premium composition and realistic materials, shadows and lighting.",
    "Scene: a curated resale-ready arrangement containing exactly one used unbranded smartphone, one pair of unbranded over-ear headphones, one pair of unbranded sneakers, one unbranded streetwear accessory, and one small valuable unbranded household object.",
    "Atmosphere: deep black surfaces, controlled yellow accent light and clean white highlights. Keep generous clean negative space in the upper-left and center-top for a headline added later by a local renderer.",
    "Compose the subjects inside a central crop-safe zone that remains coherent in both 4:5 and 9:16 crops. Every object must be distinct, plausible, undamaged enough to photograph, and visible without duplication.",
    `Editorial intent fingerprint: ${sha(direction.editorialAngle).slice(0, 16)}. Visual direction fingerprint: ${sha(`${direction.visualScene}|${direction.visualMood}`).slice(0, 16)}.`,
    "NO TEXT OR LETTERS anywhere. NO logo. NO watermark. NO signature. NO brand marks. NO invented marks. NO price tags. NO currency. NO people. NO duplicate objects. NO extra phone, headphone, shoe pair, accessory or small object. NO obvious deformation, fused geometry or impossible reflections.",
  ].join("\n");
}

function parseDirection(value: string): MediaContentDirection | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return undefined; }
  if (!record(parsed) || !exactKeys(parsed, ["editorialAngle", "hook", "negativeRules", "requiredObjects", "title", "visualMood", "visualScene"])) return undefined;
  const strings = [parsed.editorialAngle, parsed.hook, parsed.title, parsed.visualMood, parsed.visualScene];
  if (strings.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 600)) return undefined;
  if (!stringArray(parsed.requiredObjects, 5, 5) || !stringArray(parsed.negativeRules, 3, 12)) return undefined;
  return {
    editorialAngle: parsed.editorialAngle as string,
    hook: parsed.hook as string,
    negativeRules: Object.freeze([...(parsed.negativeRules)]),
    requiredObjects: Object.freeze([...(parsed.requiredObjects)]),
    title: parsed.title as string,
    visualMood: parsed.visualMood as string,
    visualScene: parsed.visualScene as string,
  };
}

function stringArray(value: unknown, minimum: number, maximum: number): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200);
}
function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function stableDirection(value: MediaContentDirection): string {
  return JSON.stringify({
    editorialAngle: value.editorialAngle,
    hook: value.hook,
    negativeRules: value.negativeRules,
    requiredObjects: value.requiredObjects,
    title: value.title,
    visualMood: value.visualMood,
    visualScene: value.visualScene,
  });
}
function estimateTextCost(usage: { readonly inputTokens: number; readonly outputTokens: number }): number {
  return roundUsd((usage.inputTokens * 0.15 + usage.outputTokens * 0.6) / 1_000_000);
}
function classifyTextFailure(status: number): MediaQualityClosureReasonCode {
  if (status === 0) return "PROVIDER_HTTP_TRANSPORT";
  if (status === 401) return "PROVIDER_AUTHENTICATION";
  if (status === 403) return "PROVIDER_PROJECT_OR_PERMISSION";
  if (status === 400 || status === 422) return "PROVIDER_INVALID_REQUEST";
  return "PROVIDER_RESPONSE_EXTRACTION";
}
function classifyImageFailure(status: number | undefined): MediaQualityClosureReasonCode {
  if (status === 401) return "IMAGE_PROVIDER_AUTHENTICATION";
  if (status === 403) return "IMAGE_PROVIDER_PROJECT_OR_PERMISSION";
  if (status === 400 || status === 422) return "IMAGE_PROVIDER_INVALID_REQUEST";
  if (status === 402 || status === 429) return "IMAGE_PROVIDER_RATE_OR_BUDGET";
  return "IMAGE_PROVIDER_HTTP_TRANSPORT";
}
function receipt(input: {
  readonly cost: number;
  readonly idempotencyKey: string;
  readonly model: string;
  readonly modelSnapshot: string;
  readonly operation: MediaQualityOperationReceipt["operation"];
  readonly operationId: string;
  readonly outputFingerprint: string;
  readonly requestFingerprint: string;
}): MediaQualityOperationReceipt {
  return {
    costClassification: "ESTIMATED",
    estimatedCostUsd: input.cost,
    idempotencyKeyFingerprint: sha(input.idempotencyKey),
    model: input.model,
    modelSnapshot: input.modelSnapshot,
    operation: input.operation,
    operationIdFingerprint: sha(input.operationId),
    outputFingerprint: input.outputFingerprint,
    requestFingerprint: input.requestFingerprint,
    status: "SUCCEEDED",
  };
}
function roundUsd(value: number): number { return Math.round(value * 1_000_000_000) / 1_000_000_000; }
function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
