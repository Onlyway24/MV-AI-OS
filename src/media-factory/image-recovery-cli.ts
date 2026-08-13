#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import { ImageRecovery, recoveredValidatedDirection } from "./image-recovery.js";
import {
  IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD,
  IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
  ImageRecoverySessionLedger,
} from "./image-recovery-session-ledger.js";
import {
  MEDIA_QUALITY_IMAGE_MODEL,
  MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD,
  MEDIA_QUALITY_IMAGE_SNAPSHOT,
} from "./media-quality-closure.js";
import { OpenAIImageGenerationProvider } from "./openai-image-generation-provider.js";

const DEFAULT_OUTPUT = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/", import.meta.url));
const PREVIOUS_LIVE_RESULT = fileURLToPath(new URL("../../assets/metodo-veloce/media-factory-quality-closure-v1/live-result.json", import.meta.url));
const SESSION_DURATION_MS = 10 * 60 * 1_000;
const PRICING_ATTESTATION_MAX_AGE_MS = 15 * 60 * 1_000;

interface Arguments {
  readonly apiKeyFile: string;
  readonly ledger: string;
  readonly output: string;
  readonly pricingConfirmedAt: string;
}

async function main(arguments_: readonly string[]): Promise<void> {
  const input = parseArguments(arguments_);
  assertPricingAttestation(input.pricingConfirmedAt);
  const previous = await previousReconciliation();
  const direction = recoveredValidatedDirection();
  const directionFingerprint = sha(stable(direction));
  const secret = await new LocalSecretResolver().resolve({
    contractVersion: "1",
    encoding: "utf8",
    path: input.apiKeyFile,
    secretId: "openai-api-key",
    source: "local-file",
  });
  await mkdir(input.output, { recursive: true });
  await mkdir(dirname(input.ledger), { recursive: true });
  await writeFile(resolve(input.output, "previous-image-reconciliation.json"), `${JSON.stringify(previous, null, 2)}\n`, "utf8");
  await writeFile(resolve(input.output, "content-direction-recovered.json"), `${JSON.stringify({
    contractVersion: "1",
    direction,
    fingerprint: directionFingerprint,
    provenance: {
      classification: "CONSTRAINT_PRESERVING_RECOVERY_NOT_RAW_PROVIDER_OUTPUT",
      rawProviderOutputAvailable: false,
      sourceOperationId: previous.operationId,
      sourceStructuredOutputStatus: "VALIDATED",
      sourceValidationReceipt: "LEDGER_SETTLEMENT_PRESENT_OUTPUT_RECEIPT_NOT_PERSISTED",
      textCallsAdded: 0,
    },
  }, null, 2)}\n`, "utf8");

  const sessionId = `image-recovery-${randomUUID()}`;
  const operationId = `${sessionId}:GPT_IMAGE_2_MASTER_RECOVERY`;
  const clientRequestId = `mv-ai-os-${randomUUID()}`;
  const idempotencyKey = sha(operationId);
  const clock = { now: (): Date => new Date() };
  const priorLiveCallsToday = sameRomeDay(previous.completedAt, clock.now()) ? 1 : 0;
  const ledger = new ImageRecoverySessionLedger({
    clock,
    path: input.ledger,
    priorLiveCallsToday,
    priorPendingExposureUsd: previous.pendingExposureUsd,
  });
  try {
    ledger.createDisabled({
      expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString(),
      sessionId,
    });
    ledger.activate(sessionId);
    const recovery = new ImageRecovery({
      ledger,
      provider: new OpenAIImageGenerationProvider({
        config: { apiKey: secret.value, baseUrl: "https://api.openai.com/v1" },
      }),
    });
    const preflight = recovery.preflight(sessionId);
    if (preflight.status !== "ready") throw new Error("Image recovery preflight blocked the session");
    process.stdout.write(`${JSON.stringify({
      preflight,
      pricing: pricingCatalog(input.pricingConfirmedAt),
      reconciliation: previous.classification,
      sessionId,
    })}\n`);
    const result = await recovery.run({ clientRequestId, direction, idempotencyKey, operationId, sessionId });
    if (result.status === "READY_FOR_LOCAL_RENDER") {
      await writeFile(resolve(input.output, "master-openai.png"), result.master.bytes);
    }
    const recoveryReceipt = result.status === "READY_FOR_LOCAL_RENDER"
      ? {
          callCount: result.callCount,
          estimatedCostUsd: result.estimatedCostUsd,
          ledger: result.ledger,
          ledgerReceipt: result.ledgerReceipt,
          receipt: result.receipt,
          status: result.status,
        }
      : result;
    const status = {
      contractVersion: "1",
      contentDirection: {
        fingerprint: directionFingerprint,
        provenance: "CONSTRAINT_PRESERVING_RECOVERY_NOT_RAW_PROVIDER_OUTPUT",
        textCallsAdded: 0,
      },
      externalEffects: {
        completedImageGenerationsThisSession: result.status === "READY_FOR_LOCAL_RENDER" ? 1 : 0,
        imageRequestsThisSession: 1,
        instagramPosts: 0,
        messages: 0,
        purchases: 0,
        serverSpendUsd: 0,
        tiktokPosts: 0,
      },
      previousImage: previous,
      pricing: pricingCatalog(input.pricingConfirmedAt),
      publication: "LOCKED",
      recovery: recoveryReceipt,
      review: "INTERNAL_PACKAGE_ONLY",
      result: {
        ...(result.status === "BLOCKED" ? { reasonCode: result.reasonCode } : {}),
        status: result.status,
      },
      session: {
        dailyHardLimitUsd: IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD,
        maxCalls: 1,
        maxImages: 1,
        maxRetries: 0,
        sessionHardLimitUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
        status: result.ledger.status,
      },
      ...(result.status === "READY_FOR_LOCAL_RENDER" ? {
        master: {
          height: result.master.height,
          mimeType: result.master.mimeType,
          model: MEDIA_QUALITY_IMAGE_MODEL,
          modelSnapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
          path: "assets/metodo-veloce/media-factory-quality-closure-v1/master-openai.png",
          sha256: result.master.sha256,
          width: result.master.width,
        },
      } : {}),
    };
    const fingerprint = sha(stable(status));
    await writeFile(resolve(input.output, "image-recovery-result.json"), `${JSON.stringify({ ...status, fingerprint }, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      callCount: result.callCount,
      reasonCode: result.status === "BLOCKED" ? result.reasonCode : undefined,
      sessionStatus: result.ledger.status,
      status: result.status,
    })}\n`);
    if (result.status === "BLOCKED") process.exitCode = 2;
  } finally {
    ledger.closeDatabase();
  }
}

async function previousReconciliation(): Promise<Readonly<Record<string, unknown>> & {
  readonly classification: "UNCERTAIN_RECONCILIATION_PENDING";
  readonly completedAt: string;
  readonly operationId: string;
  readonly pendingExposureUsd: number;
}> {
  const source = JSON.parse(await readFile(PREVIOUS_LIVE_RESULT, "utf8")) as unknown;
  if (!record(source) || !record(source.session) || !record(source.image) || !record(source.cost)) {
    throw new Error("Previous image result is invalid");
  }
  const sessionId = string(source.session.sessionId);
  const completedAt = string(source.image.operationCompletedAt);
  const pendingExposureUsd = number(source.image.reservedCostUsd);
  if (source.image.reasonCode !== "IMAGE_PROVIDER_TRANSPORT_TIMEOUT" || source.image.costClassification !== "RECONCILIATION_PENDING" || pendingExposureUsd !== 0.2) {
    throw new Error("Previous image reconciliation is not safe");
  }
  const operationId = `${sessionId}:GPT_IMAGE_2_MASTER`;
  return {
    classification: "UNCERTAIN_RECONCILIATION_PENDING",
    completedAt,
    idempotency: {
      header: "Idempotency-Key",
      keyFingerprint: sha(sha(operationId)),
      status: "SENT",
    },
    operationId,
    pendingExposureUsd,
    providerCostUsd: null,
    providerUsage: null,
    receipt: "CLIENT_LEDGER_ONLY",
    startedAt: string(source.image.operationStartedAt),
    xClientRequestId: { status: "NOT_SENT_BY_PREVIOUS_CLIENT" },
    xRequestId: { status: "UNAVAILABLE_AFTER_CLIENT_TIMEOUT" },
  };
}

function pricingCatalog(confirmedAt: string): Readonly<Record<string, unknown>> {
  return {
    checkedAt: confirmedAt,
    image: {
      inputImagePerMillionTokensUsd: 8,
      inputTextPerMillionTokensUsd: 5,
      model: MEDIA_QUALITY_IMAGE_MODEL,
      outputImagePerMillionTokensUsd: 30,
      prudentHigh1024x1536EstimateUsd: MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD,
      reservationUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
      snapshot: MEDIA_QUALITY_IMAGE_SNAPSHOT,
    },
    sources: [
      "https://developers.openai.com/api/docs/models/gpt-image-2",
      "https://developers.openai.com/api/docs/pricing",
      "https://developers.openai.com/api/reference/resources/images/methods/generate",
    ],
  };
}

function assertPricingAttestation(value: string): void {
  const confirmedAt = Date.parse(value);
  const age = Date.now() - confirmedAt;
  if (!Number.isFinite(confirmedAt) || age < 0 || age > PRICING_ATTESTATION_MAX_AGE_MS) {
    throw new Error("GPT Image 2 pricing attestation is missing or stale");
  }
  assertCostEnvelope(MEDIA_QUALITY_IMAGE_OUTPUT_ESTIMATE_USD, IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD);
}

function assertCostEnvelope(estimateUsd: number, hardLimitUsd: number): void {
  if (!Number.isFinite(estimateUsd) || !Number.isFinite(hardLimitUsd) || estimateUsd < 0 || estimateUsd > hardLimitUsd) {
    throw new Error("GPT Image 2 cannot fit the recovery session cap");
  }
}

function parseArguments(arguments_: readonly string[]): Arguments {
  const values = new Map<string, string>();
  let authorized = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const item = arguments_[index];
    if (item === "--authorize-image-recovery") { authorized = true; continue; }
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
    ledger: resolve(ledger),
    output: resolve(values.get("--output") ?? DEFAULT_OUTPUT),
    pricingConfirmedAt,
  };
}

function usage(): Error {
  return new Error("Usage: image-recovery --authorize-image-recovery --pricing-confirmed-at <ISO> --api-key-file <0600 path> --ledger <outside-repo path> [--output <path>]");
}
function sameRomeDay(value: string, now: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome", year: "numeric" });
  return formatter.format(new Date(value)) === formatter.format(now);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function string(value: unknown): string { if (typeof value !== "string" || value.length === 0) throw new Error("Required reconciliation string is missing"); return value; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Required reconciliation cost is missing"); return value; }

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

if (isMainModule()) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Image recovery failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export { main as runImageRecoveryCli };
