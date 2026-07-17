import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalConfigurationLoader } from "../config/local-configuration-loader.js";
import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import {
  OpenAiResponsesPlainConformanceProvider,
} from "../models/providers/openai-responses-conformance-provider.js";
import {
  buildOpenAiResponsesPlainTextRequest,
} from "../models/providers/openai-responses-request-builder.js";
import {
  OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
  OpenAiResponsesPlainConformanceCheck,
} from "./openai-responses-plain-conformance.js";
import {
  OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD,
  OPENAI_RESPONSES_CONFORMANCE_OPERATION,
  OpenAiResponsesConformanceSessionLedger,
} from "./openai-responses-conformance-session-ledger.js";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../../assets/metodo-veloce/openai-responses-conformance-v1/", import.meta.url),
);
const PRIOR_PILOT_STATUS = fileURLToPath(
  new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/pilot-status.json", import.meta.url),
);
const PRIOR_DIAGNOSIS_STATUS = fileURLToPath(
  new URL("../../assets/metodo-veloce/openai-text-failure-diagnosis-v1/diagnosis-status.json", import.meta.url),
);
const SESSION_DURATION_MS = 10 * 60 * 1_000;
const AVAILABILITY_MAX_AGE_MS = 10 * 60 * 1_000;
let phase = "local-preflight";

interface Arguments {
  readonly availabilityConfirmedAt: string;
  readonly authorizeResponsesConformance: true;
  readonly config: string;
  readonly output: string;
}

async function main(arguments_: readonly string[]): Promise<void> {
  const input = parseArguments(arguments_);
  phase = "availability-attestation";
  assertAvailabilityAttestation(input.availabilityConfirmedAt);

  phase = "configuration";
  const configuration = new LocalConfigurationLoader().load(
    await readFile(input.config),
  );
  const provider = configuration.runtime.modelProvider;
  if (
    configuration.runtime.actorId !== "Fabio" ||
    provider?.providerId !== "openai" ||
    provider.modelId !== OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL ||
    provider.baseUrl !== "https://api.openai.com/v1"
  ) {
    throw new Error("The conformance configuration does not select the approved provider and model");
  }
  const reference = configuration.secretReferences.find(
    (candidate) => candidate.secretId === provider.apiKeySecretId,
  );
  if (reference?.source !== "local-file") {
    throw new Error("The conformance configuration does not contain the approved local secret reference");
  }

  phase = "secret-resolution";
  const secret = await new LocalSecretResolver({ environment: process.env }).resolve(reference);
  const canonicalRequest = buildOpenAiResponsesPlainTextRequest({
    input: "Reply exactly with ONLYWAY_PROVIDER_OK",
    model: OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
  });
  const clock = { now: (): Date => new Date() };
  const sessionId = `openai-responses-conformance-${randomUUID()}`;
  const operationId = `${sessionId}:${OPENAI_RESPONSES_CONFORMANCE_OPERATION}`;
  const idempotencyKey = createHash("sha256").update(operationId).digest("hex");
  const historical = await priorExposure();

  phase = "session-ledger";
  await mkdir(input.output, { recursive: true });
  await mkdir(dirname(configuration.runtime.sqlite.path), { recursive: true });
  const ledger = new OpenAiResponsesConformanceSessionLedger({
    clock,
    path: configuration.runtime.sqlite.path,
    priorLiveCallsToday: historical.priorLiveCalls,
  });
  try {
    ledger.createDisabled({
      expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString(),
      sessionId,
    });
    ledger.activate(sessionId);
    const preflight = ledger.preflight(
      sessionId,
      OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
      OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD,
    );
    if (preflight.status !== "ready") throw new Error("The one-use conformance preflight blocked the request");
    process.stdout.write(JSON.stringify({
      preflight: {
        endpoint: canonicalRequest.manifest.endpoint,
        fieldNames: canonicalRequest.manifest.fieldNames,
        maxCostUsd: preflight.maxCostUsd,
        model: preflight.model,
        residualBudgetUsd: preflight.residualBudgetUsd,
        status: preflight.status,
      },
    }) + "\n");

    phase = "provider-operation";
    const result = await new OpenAiResponsesPlainConformanceCheck({
      authorization: ledger,
      provider: new OpenAiResponsesPlainConformanceProvider({
        apiKey: secret.value,
        baseUrl: "https://api.openai.com/v1",
      }),
    }).run({
      idempotencyKey,
      operationId,
      request: canonicalRequest,
      sessionId,
    });
    const status = createSafeStatus({ historical, result, sessionId });
    const fingerprint = createHash("sha256").update(JSON.stringify(status)).digest("hex");
    await writeFile(
      resolve(input.output, "conformance-status.json"),
      `${JSON.stringify({ ...status, fingerprint }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(JSON.stringify({
      calls: result.ledger.liveCalls,
      providerStatus: result.providerStatus,
      status: result.status,
    }) + "\n");
  } finally {
    ledger.closeDatabase();
  }
}

function createSafeStatus(input: {
  readonly historical: { readonly priorLiveCalls: number; readonly priorReservedExposureUsd: number };
  readonly result: Awaited<ReturnType<OpenAiResponsesPlainConformanceCheck["run"]>>;
  readonly sessionId: string;
}): Readonly<Record<string, unknown>> {
  const result = input.result;
  const actualProviderCostUsd = null;
  const estimatedCostUsd = result.ledger.estimatedCostUsd;
  const reservedCostUsd = result.ledger.reservedCostUsd;
  const reconciliationPendingCostUsd = result.ledger.reconciliationPendingCostUsd;
  return {
    canonicalRequestShape: result.requestShape,
    conformanceGate: { status: result.conformanceGate },
    contractVersion: "1",
    cost: {
      actualProviderCostUsd,
      estimatedCostUsd,
      priorReservedExposureUsd: input.historical.priorReservedExposureUsd,
      reconciliation: estimatedCostUsd > 0
        ? "ESTIMATED_USAGE_PENDING_BILLING_RECONCILIATION"
        : "RESERVED_PENDING_RECONCILIATION",
      reconciliationPendingCostUsd,
      reservedCostUsd,
      totalReservedExposureUsd: input.historical.priorReservedExposureUsd + reservedCostUsd,
    },
    externalEffects: {
      cumulativeOpenAiProviderCalls: input.historical.priorLiveCalls + result.ledger.liveCalls,
      imageGenerations: 0,
      openAiProviderCallsThisSession: result.ledger.liveCalls,
      serverSpendUsd: 0,
      socialPublications: 0,
    },
    imageGeneration: {
      model: "gpt-image-1-mini",
      status: "DISABLED_DEPRECATED_PENDING_SEPARATE_AUTHORIZATION",
    },
    milestone: "RESPONSES REQUEST CONFORMANCE FIX V1",
    models: {
      image: "DISABLED_DEPRECATED_PENDING_SEPARATE_AUTHORIZATION",
      text: OPENAI_RESPONSES_PLAIN_CONFORMANCE_MODEL,
    },
    noAutomaticRetries: true,
    operation: OPENAI_RESPONSES_CONFORMANCE_OPERATION,
    preflight: {
      endpoint: result.requestShape.endpoint,
      fieldNames: result.requestShape.fieldNames,
      maxCostUsd: result.preflight.maxCostUsd,
      model: result.preflight.model,
      residualBudgetUsd: result.preflight.residualBudgetUsd,
      status: result.preflight.status,
    },
    previousRequestShape: {
      endpoint: "/v1/responses",
      legacyPayloadFieldNames: ["input", "max_output_tokens", "metadata", "model", "store", "text"],
      legacySourceTransform: "ModelRequest.messages was transformed into input array; generic limits, correlation metadata and output settings were added.",
      rootCause: "The generic translation did not build the canonical Responses contract and polluted the plain request with internal wrapper fields.",
    },
    provider: {
      ...(result.providerDiagnostic === undefined ? {} : { diagnostic: result.providerDiagnostic }),
      status: result.providerStatus,
    },
    result: {
      ...(result.reasonCode === undefined ? {} : { reasonCode: result.reasonCode }),
      status: result.status,
      ...(result.usage === undefined
        ? {}
        : { usage: {
          estimatedCostUsd: result.usage.estimatedCostUsd,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        } }),
    },
    session: {
      ...result.ledger,
      actor: "Fabio",
      idempotency: "REQUIRED_AND_CONSUMED",
      killSwitch: "TEMPORARILY_AUTHORIZED_FOR_THIS_ONE_OPERATION",
      maxCalls: 1,
      maxImages: 0,
      maxRetries: 0,
      operationIdFingerprint: createHash("sha256").update(input.sessionId).digest("hex"),
      operationType: OPENAI_RESPONSES_CONFORMANCE_OPERATION,
    },
    visualGate: { status: "BLOCKED_NO_IMAGE_AUTHORIZATION" },
  };
}

async function priorExposure(): Promise<{
  readonly priorLiveCalls: number;
  readonly priorReservedExposureUsd: number;
}> {
  const [pilot, diagnosis] = await Promise.all([
    readStatus(PRIOR_PILOT_STATUS),
    readStatus(PRIOR_DIAGNOSIS_STATUS),
  ]);
  const pilotCalls = integer(record(pilot.externalEffects) ? pilot.externalEffects.openAiProviderCalls : undefined);
  const diagnosisCalls = integer(record(diagnosis.externalEffects) ? diagnosis.externalEffects.openAiProviderCalls : undefined);
  const pilotReserved = number(record(pilot.costGate) ? pilot.costGate.conservativeBookedUsd : undefined);
  const diagnosisReserved = number(record(diagnosis.cost) ? diagnosis.cost.reconciliationPendingCostUsd : undefined);
  const priorLiveCalls = pilotCalls + diagnosisCalls;
  const priorReservedExposureUsd = pilotReserved + diagnosisReserved;
  if (priorLiveCalls !== 2 || priorReservedExposureUsd !== 0.015) {
    throw new Error("Historical closed-session exposure cannot be reconciled safely");
  }
  return { priorLiveCalls, priorReservedExposureUsd };
}

async function readStatus(path: string): Promise<Readonly<Record<string, unknown>>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!record(value)) throw new Error("Historical status is invalid");
  return value;
}

function parseArguments(arguments_: readonly string[]): Arguments {
  let availabilityConfirmedAt: string | undefined;
  let authorizeResponsesConformance = false;
  let config: string | undefined;
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (flag === "--authorize-responses-conformance") {
      authorizeResponsesConformance = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined) throw new Error("Conformance arguments are invalid");
    index += 1;
    if (flag === "--availability-confirmed-at") availabilityConfirmedAt = value;
    else if (flag === "--config") config = value;
    else if (flag === "--output") output = value;
    else throw new Error("Conformance arguments are invalid");
  }
  const resolvedOutput = resolve(output);
  if (!authorizeResponsesConformance || availabilityConfirmedAt === undefined || config === undefined || !resolvedOutput.startsWith(`${ROOT}/`)) {
    throw new Error("Conformance arguments are invalid");
  }
  return {
    availabilityConfirmedAt,
    authorizeResponsesConformance: true,
    config: resolve(config),
    output: resolvedOutput,
  };
}

function assertAvailabilityAttestation(value: string): void {
  const confirmedAt = Date.parse(value);
  if (!Number.isFinite(confirmedAt) || Math.abs(Date.now() - confirmedAt) > AVAILABILITY_MAX_AGE_MS) {
    throw new Error("OpenAI text-model availability must be confirmed immediately before the conformance session");
  }
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch {
    process.stderr.write(`OpenAI Responses conformance stopped safely during ${phase}.\n`);
    process.exitCode = 1;
  }
}
