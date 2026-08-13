import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalConfigurationLoader } from "../config/local-configuration-loader.js";
import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import { ModelProfileValidator } from "../validation/model-profile-validator.js";
import { ModelRequestValidator } from "../validation/model-request-validator.js";
import { ModelResponseValidator } from "../validation/model-response-validator.js";
import { OpenAIModelProvider } from "../models/providers/openai-model-provider.js";
import { ValidatedLlmGateway } from "../models/validated-llm-gateway.js";
import {
  OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL,
  OpenAiTextFailureDiagnosis,
} from "./openai-text-failure-diagnosis.js";
import { OpenAiTextDiagnosticSessionLedger } from "./openai-text-diagnostic-session-ledger.js";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../../assets/metodo-veloce/openai-text-failure-diagnosis-v1/", import.meta.url),
);
const PRIOR_PILOT_STATUS = fileURLToPath(
  new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/pilot-status.json", import.meta.url),
);
const SESSION_DURATION_MS = 10 * 60 * 1_000;
const AVAILABILITY_MAX_AGE_MS = 10 * 60 * 1_000;
let phase = "local-preflight";

interface Arguments {
  readonly availabilityConfirmedAt: string;
  readonly authorizeTextDiagnosis: true;
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
    provider?.providerId !== "openai" ||
    provider.modelId !== OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL ||
    provider.baseUrl !== "https://api.openai.com/v1"
  ) {
    throw new Error("The text diagnosis configuration does not select the approved text model");
  }
  const reference = configuration.secretReferences.find(
    (candidate) => candidate.secretId === provider.apiKeySecretId,
  );
  if (reference?.source !== "local-file") {
    throw new Error("The text diagnosis configuration does not contain the approved local secret reference");
  }

  phase = "secret-resolution";
  const resolved = await new LocalSecretResolver({ environment: process.env }).resolve(reference);
  const clock = { now: (): Date => new Date() };
  phase = "provider-setup";
  const textProvider = new OpenAIModelProvider({
    clock,
    config: {
      apiKey: resolved.value,
      baseUrl: provider.baseUrl,
      contractVersion: "1",
      providerId: "openai",
    },
  });
  const textProfile = {
    contractVersion: "1" as const,
    limits: {
      maxCostUsd: 0.01,
      maxInputCharacters: 1_000,
      maxOutputTokens: 32,
      timeoutMs: 20_000,
    },
    modelId: OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL,
    profileId: "openai-text-failure-diagnosis-v1",
    providerId: "openai",
    supportedOutputFormats: ["json", "text"] as const,
  };
  const gateway = new ValidatedLlmGateway({
    budgetConfig: {
      contractVersion: "1",
      required: true,
      rules: [{
        contractVersion: "1",
        maxEstimatedCostUsd: 0.01,
        maxRequestedCostUsd: 0.01,
        modelId: textProfile.modelId,
        profileId: textProfile.profileId,
        providerId: textProfile.providerId,
        requireEstimatedCost: true,
        requireRequestCost: true,
      }],
    },
    clock,
    operationLimits: {
      contractVersion: "1",
      maxCostUsd: 0.01,
      maxInputCharacters: 1_000,
      maxOutputTokens: 32,
      maxProviderCalls: 1,
      maxTotalTokens: 1_000,
      timeoutMs: 20_000,
    },
    profileValidator: new ModelProfileValidator(),
    providerRegistry: {
      get: (providerId) => providerId === textProvider.providerId ? textProvider : undefined,
    },
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: { select: () => Promise.resolve(textProfile) },
    usageAccountingConfig: {
      contractVersion: "1",
      pricing: [{
        contractVersion: "1",
        currency: "USD",
        inputTokenUsdPerMillion: 0.15,
        modelId: textProfile.modelId,
        outputTokenUsdPerMillion: 0.6,
        profileId: textProfile.profileId,
        providerId: textProfile.providerId,
      }],
      required: true,
    },
  });

  phase = "session-ledger";
  await mkdir(input.output, { recursive: true });
  await mkdir(dirname(configuration.runtime.sqlite.path), { recursive: true });
  const sessionId = `openai-text-diagnosis-${randomUUID()}`;
  const ledger = new OpenAiTextDiagnosticSessionLedger({
    clock,
    path: configuration.runtime.sqlite.path,
    priorLiveCallsToday: await priorLiveCallsToday(),
  });
  try {
    ledger.createDisabled({
      expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString(),
      sessionId,
    });
    ledger.activate(sessionId);
    phase = "provider-operations";
    const result = await new OpenAiTextFailureDiagnosis({ authorization: ledger, gateway }).run({
      correlationId: sessionId,
      invocationId: sessionId,
      requestId: sessionId,
      sessionId,
      taskId: "openai-text-failure-diagnosis-v1",
      textProfileId: textProfile.profileId,
    });
    const closedLedger = ledger.snapshot(sessionId);
    const status = {
      contractVersion: "1",
      cost: {
        capUsd: 0.02,
        classification: closedLedger.reconciliationPendingCostUsd > 0
          ? "RECONCILIATION_PENDING"
          : "ESTIMATED",
        estimatedCostUsd: closedLedger.estimatedCostUsd,
        reconciliationPendingCostUsd: closedLedger.reconciliationPendingCostUsd,
        reservedCostUsd: closedLedger.reservedCostUsd,
      },
      externalEffects: {
        imageGenerations: 0,
        openAiProviderCalls: closedLedger.liveCalls,
        socialPublications: 0,
        serverSpendUsd: 0,
      },
      milestone: "OPENAI TEXT FAILURE DIAGNOSIS AND RECOVERY V1",
      models: { image: "DISABLED_DEPRECATED_PENDING_NEW_AUTHORIZATION", text: OPENAI_TEXT_FAILURE_DIAGNOSIS_MODEL },
      noAutomaticRetries: true,
      previousClosure: {
        costClassification: "RESERVED_PENDING_RECONCILIATION",
        conservativeBookedUsd: 0.005,
        effectiveCostUsd: null,
        observedReasonCode: "text_transport_failed_unpriced",
        observedStage: "provider_invocation",
        rootCause: "The previous gateway flattened the adapter-safe failure into model_provider_failed; transport and response extraction were not separately observable.",
      },
      providerStatus: result.providerStatus,
      session: closedLedger,
      status: result.status,
      ...(result.status === "BLOCKED"
        ? { reasonCode: result.reasonCode, stage: result.stage }
        : {}),
      tests: {
        images: 0,
        maxCalls: 2,
        retryAttempts: 0,
        sessionDurationMinutes: 10,
      },
      text: {
        plainText: result.plainText,
        structuredOutput: result.structuredOutput,
      },
    } as const;
    const fingerprint = createHash("sha256").update(JSON.stringify(status)).digest("hex");
    await writeFile(
      resolve(input.output, "diagnosis-status.json"),
      `${JSON.stringify({ ...status, fingerprint }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify({ calls: closedLedger.liveCalls, providerStatus: result.providerStatus, status: result.status })}\n`);
  } finally {
    ledger.closeDatabase();
  }
}

function parseArguments(arguments_: readonly string[]): Arguments {
  let availabilityConfirmedAt: string | undefined;
  let config: string | undefined;
  let output = DEFAULT_OUTPUT;
  let authorizeTextDiagnosis = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (flag === "--authorize-text-diagnosis") {
      authorizeTextDiagnosis = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined) throw new Error("Text diagnosis arguments are invalid");
    index += 1;
    if (flag === "--availability-confirmed-at") availabilityConfirmedAt = value;
    else if (flag === "--config") config = value;
    else if (flag === "--output") output = value;
    else throw new Error("Text diagnosis arguments are invalid");
  }
  const resolvedOutput = resolve(output);
  if (!authorizeTextDiagnosis || availabilityConfirmedAt === undefined || config === undefined || !resolvedOutput.startsWith(`${ROOT}/`)) {
    throw new Error("Text diagnosis arguments are invalid");
  }
  return {
    availabilityConfirmedAt,
    authorizeTextDiagnosis: true,
    config: resolve(config),
    output: resolvedOutput,
  };
}

function assertAvailabilityAttestation(value: string): void {
  const confirmedAt = Date.parse(value);
  if (!Number.isFinite(confirmedAt) || Math.abs(Date.now() - confirmedAt) > AVAILABILITY_MAX_AGE_MS) {
    throw new Error("OpenAI text-model availability must be confirmed immediately before the diagnostic session");
  }
}

async function priorLiveCallsToday(): Promise<number> {
  const value = JSON.parse(await readFile(PRIOR_PILOT_STATUS, "utf8")) as unknown;
  if (!record(value) || !record(value.externalEffects)) {
    throw new Error("The closed pilot call count is unavailable for diagnostic preflight");
  }
  const calls = value.externalEffects.openAiProviderCalls;
  if (typeof calls !== "number" || !Number.isSafeInteger(calls)) {
    throw new Error("The closed pilot call count is unavailable for diagnostic preflight");
  }
  if (calls < 0 || calls > 8) throw new Error("The closed pilot call count is invalid");
  return calls;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch {
    process.stderr.write(`OpenAI text diagnosis stopped safely during ${phase}.\n`);
    process.exitCode = 1;
  }
}
