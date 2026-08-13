#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import { OpenAiResponsesPlainConformanceProvider } from "../models/providers/openai-responses-conformance-provider.js";
import { OpenAIImageGenerationProvider } from "./openai-image-generation-provider.js";
import {
  MediaQualityClosure,
  MEDIA_QUALITY_IMAGE_MODEL,
  MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD,
  MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD,
  MEDIA_QUALITY_IMAGE_RESERVATION_USD,
  MEDIA_QUALITY_IMAGE_SNAPSHOT,
  MEDIA_QUALITY_TEXT_MODEL,
} from "./media-quality-closure.js";
import { MediaQualitySessionLedger } from "./media-quality-session-ledger.js";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_OUTPUT = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/", import.meta.url));
const CONFORMANCE_STATUS = fileURLToPath(new URL("../../assets/metodo-veloce/openai-responses-conformance-v1/conformance-status.json", import.meta.url));
const LOGO_MANIFEST = fileURLToPath(new URL("../../assets/brand/metodo-veloce-logo-original.json", import.meta.url));
const TECHNICAL_LOGO_MANIFEST = fileURLToPath(new URL("../../assets/brand/derived/metodo-veloce-logo-overlay-technical.json", import.meta.url));
const SESSION_DURATION_MS = 10 * 60 * 1_000;
const PRICING_ATTESTATION_MAX_AGE_MS = 15 * 60 * 1_000;

interface Arguments {
  readonly apiKeyFile: string;
  readonly authorizeMediaQualityClosure: true;
  readonly ledger: string;
  readonly output: string;
  readonly pricingConfirmedAt: string;
}

async function main(arguments_: readonly string[]): Promise<void> {
  const input = parseArguments(arguments_);
  assertPricingAndAvailability(input.pricingConfirmedAt);
  const historical = await historicalExposure();
  const secret = await new LocalSecretResolver().resolve({
    contractVersion: "1",
    encoding: "utf8",
    path: input.apiKeyFile,
    secretId: "openai-api-key",
    source: "local-file",
  });
  await mkdir(input.output, { recursive: true });
  await mkdir(dirname(input.ledger), { recursive: true });

  const sessionId = `media-quality-${randomUUID()}`;
  const textOperationId = `${sessionId}:STRUCTURED_CONTENT_DIRECTION`;
  const imageOperationId = `${sessionId}:GPT_IMAGE_2_MASTER`;
  const clock = { now: (): Date => new Date() };
  const ledger = new MediaQualitySessionLedger({
    clock,
    path: input.ledger,
    priorLiveCallsToday: historical.priorLiveCalls,
    priorReservedExposureUsd: historical.priorReservedExposureUsd,
  });
  try {
    ledger.createDisabled({
      expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString(),
      sessionId,
    });
    ledger.activate(sessionId);
    const closure = new MediaQualityClosure({
      authorization: ledger,
      directionProvider: new OpenAiResponsesPlainConformanceProvider({
        apiKey: secret.value,
        baseUrl: "https://api.openai.com/v1",
      }),
      imageProvider: new OpenAIImageGenerationProvider({
        config: { apiKey: secret.value, baseUrl: "https://api.openai.com/v1" },
      }),
    });
    const [textPreflight] = closure.preflight(sessionId);
    if (textPreflight.status !== "ready") throw new Error("The media quality text preflight blocked the session");
    process.stdout.write(`${JSON.stringify({
      pricing: pricingCatalog(),
      session: {
        maxCalls: 2,
        maxImages: 1,
        maxRetries: 0,
        sessionHardLimitUsd: 1,
      },
      textPreflight,
    })}\n`);

    const result = await closure.run({
      imageIdempotencyKey: idempotencyKey(imageOperationId),
      imageOperationId,
      sessionId,
      textIdempotencyKey: idempotencyKey(textOperationId),
      textOperationId,
    });
    const structuredOutput = result.status === "READY_FOR_LOCAL_RENDER"
      ? {
          direction: result.direction,
          estimatedCostUsd: result.cost.textEstimatedCostUsd,
          receipt: result.receipts[0],
          requestShape: result.requestShape,
          usage: result.usage,
        }
      : result.structuredOutput;
    if (structuredOutput !== undefined) {
      await writeFile(
        resolve(input.output, "content-direction.json"),
        `${JSON.stringify({
          contractVersion: "1",
          direction: structuredOutput.direction,
          estimatedCostUsd: structuredOutput.estimatedCostUsd,
          fingerprint: structuredOutput.receipt.outputFingerprint,
          receipt: structuredOutput.receipt,
          requestShape: structuredOutput.requestShape,
          sourcePolicy: {
            evidenceReference: "assets/metodo-veloce/social-pack-five-items-v3/manifest.json",
            liveResearchUsed: false,
            privateDataUsed: false,
            toolsUsed: [],
          },
          usage: structuredOutput.usage,
        }, null, 2)}\n`,
        "utf8",
      );
    }
    if (result.status === "READY_FOR_LOCAL_RENDER") {
      await writeFile(resolve(input.output, "master-openai.png"), result.master.bytes);
    }
    const status = await safeStatus({ historical, result, sessionId });
    const fingerprint = createHash("sha256").update(JSON.stringify(status)).digest("hex");
    await writeFile(resolve(input.output, "live-result.json"), `${JSON.stringify({ ...status, fingerprint }, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      imageCalls: result.imageCalls,
      liveCalls: result.ledger.liveCalls,
      reasonCode: result.status === "BLOCKED" ? result.reasonCode : undefined,
      status: result.status,
      textCalls: result.textCalls,
    })}\n`);
    if (result.status === "BLOCKED") process.exitCode = 2;
  } finally {
    ledger.closeDatabase();
  }
}

async function safeStatus(input: {
  readonly historical: { readonly priorLiveCalls: number; readonly priorReservedExposureUsd: number };
  readonly result: Awaited<ReturnType<MediaQualityClosure["run"]>>;
  readonly sessionId: string;
}): Promise<Readonly<Record<string, unknown>>> {
  const [logo, technicalLogo] = await Promise.all([
    readJsonRecord(LOGO_MANIFEST),
    readJsonRecord(TECHNICAL_LOGO_MANIFEST),
  ]);
  const result = input.result;
  const common = {
    contractVersion: "1",
    externalEffects: {
      completedImageGenerationsThisSession: result.status === "READY_FOR_LOCAL_RENDER" ? 1 : 0,
      cumulativeOpenAiProviderCalls: input.historical.priorLiveCalls + result.ledger.liveCalls,
      imageRequestsThisSession: result.imageCalls,
      instagramPosts: 0,
      messages: 0,
      purchases: 0,
      serverSpendUsd: 0,
      tiktokPosts: 0,
    },
    gates: {
      cost: result.status === "READY_FOR_LOCAL_RENDER" ? "PASS" : "PASS_BUDGET_WITH_RECONCILIATION_PENDING",
      evidence: result.textCalls === 1 ? "PASS" : "BLOCKED",
      quality: result.status === "READY_FOR_LOCAL_RENDER" ? "LOCAL_RENDER_PENDING" : "BLOCKED_NO_MASTER_IMAGE",
      risk: result.status === "READY_FOR_LOCAL_RENDER" ? "LOCAL_RENDER_PENDING" : "BLOCKED_NO_MASTER_IMAGE",
      visual: result.status === "READY_FOR_LOCAL_RENDER" ? "LOCAL_RENDER_PENDING" : "BLOCKED_NO_MASTER_IMAGE",
    },
    logo: {
      originalSha256: logo.sha256,
      overlayTechnicalSha256: technicalLogo.sha256,
      policy: "ORIGINAL_ONLY_LOCAL_RENDERER_OVERLAY",
    },
    milestone: "MEDIA FACTORY QUALITY CLOSURE V1",
    pricing: pricingCatalog(),
    publication: "LOCKED",
    review: "INTERNAL_PACKAGE_ONLY",
    session: {
      ...result.ledger,
      actor: "Fabio",
      dailyHardLimitUsd: 4,
      maxCalls: 2,
      maxImages: 1,
      maxRetries: 0,
      operationIdFingerprint: createHash("sha256").update(input.sessionId).digest("hex"),
      sessionHardLimitUsd: 1,
    },
  };
  if (result.status === "BLOCKED") {
    return {
      ...common,
      ...(result.structuredOutput === undefined ? {} : { structuredOutput: result.structuredOutput }),
      result: { reasonCode: result.reasonCode, status: result.status },
    };
  }
  return {
    ...common,
    contentDirection: result.direction,
    cost: {
      actualProviderCostUsd: null,
      ...result.cost,
      priorReservedExposureUsd: input.historical.priorReservedExposureUsd,
      reconciliation: "ESTIMATED_USAGE_PENDING_BILLING_RECONCILIATION",
      reservedCostUsd: result.ledger.reservedCostUsd,
      totalReservedExposureUsd: input.historical.priorReservedExposureUsd + result.ledger.reservedCostUsd,
    },
    master: {
      height: result.master.height,
      mimeType: result.master.mimeType,
      model: MEDIA_QUALITY_IMAGE_MODEL,
      modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
      path: "assets/metodo-veloce/media-factory-quality-closure-v1/master-openai.png",
      quality: "high",
      sha256: result.master.sha256,
      width: result.master.width,
    },
    receipts: result.receipts,
    requestShape: result.requestShape,
    result: { status: result.status },
    usage: result.usage,
  };
}

function pricingCatalog(): Readonly<Record<string, unknown>> {
  return {
    checkedOn: "2026-07-17",
    image: {
      inputTextPerMillionTokensUsd: 5,
      model: MEDIA_QUALITY_IMAGE_MODEL,
      officialHigh1024x1536OutputEstimateUsd: MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD,
      prudentEstimateUsd: MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD,
      reservationUsd: MEDIA_QUALITY_IMAGE_RESERVATION_USD,
      snapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
    },
    sources: [
      "https://developers.openai.com/api/docs/models/gpt-image-2",
      "https://developers.openai.com/api/docs/guides/image-generation",
      "https://developers.openai.com/api/docs/pricing",
    ],
    text: { inputPerMillionTokensUsd: 0.15, model: MEDIA_QUALITY_TEXT_MODEL, outputPerMillionTokensUsd: 0.6 },
  };
}

function assertPricingAndAvailability(value: string): void {
  const confirmedAt = Date.parse(value);
  const age = Date.now() - confirmedAt;
  if (!Number.isFinite(confirmedAt) || age < 0 || age > PRICING_ATTESTATION_MAX_AGE_MS) throw new Error("GPT Image 2 availability and pricing attestation is missing or stale");
  assertImageCostEnvelope(MEDIA_QUALITY_IMAGE_PRUDENT_ESTIMATE_USD, MEDIA_QUALITY_IMAGE_RESERVATION_USD);
}

function assertImageCostEnvelope(prudentEstimateUsd: number, reservationUsd: number): void {
  if (prudentEstimateUsd > reservationUsd || reservationUsd >= 1) throw new Error("GPT Image 2 prudent cost cannot fit the session budget");
}

async function historicalExposure(): Promise<{ readonly priorLiveCalls: number; readonly priorReservedExposureUsd: number }> {
  const status = await readJsonRecord(CONFORMANCE_STATUS);
  const effects = record(status.externalEffects) ? status.externalEffects : {};
  const cost = record(status.cost) ? status.cost : {};
  const priorLiveCalls = integer(effects.cumulativeOpenAiProviderCalls);
  const priorReservedExposureUsd = number(cost.totalReservedExposureUsd);
  if (priorLiveCalls !== 3 || priorReservedExposureUsd !== 0.025) throw new Error("Historical provider exposure cannot be reconciled safely");
  return { priorLiveCalls, priorReservedExposureUsd };
}

function parseArguments(arguments_: readonly string[]): Arguments {
  const values = new Map<string, string>();
  let authorized = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const item = arguments_[index];
    if (item === "--authorize-media-quality-closure") { authorized = true; continue; }
    if (!item?.startsWith("--")) throw usage();
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw usage();
    values.set(item, value);
    index += 1;
  }
  const apiKeyFile = values.get("--api-key-file");
  const ledger = values.get("--ledger");
  const pricingConfirmedAt = values.get("--pricing-confirmed-at");
  if (!authorized || apiKeyFile === undefined || ledger === undefined || pricingConfirmedAt === undefined) throw usage();
  return {
    apiKeyFile: resolve(apiKeyFile),
    authorizeMediaQualityClosure: true,
    ledger: resolve(ledger),
    output: resolve(values.get("--output") ?? DEFAULT_OUTPUT),
    pricingConfirmedAt,
  };
}

function usage(): Error {
  return new Error("Usage: media-quality-closure --authorize-media-quality-closure --pricing-confirmed-at <ISO> --api-key-file <0600 path> --ledger <outside-repo path> [--output <path>]");
}
async function readJsonRecord(path: string): Promise<Readonly<Record<string, unknown>>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!record(value)) throw new Error("A required manifest is invalid");
  return value;
}
function idempotencyKey(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : -1; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : -1; }

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

if (isMainModule()) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Media quality closure failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export { ROOT, main as runMediaQualityClosureCli };
