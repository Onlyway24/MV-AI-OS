import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { LocalConfigurationLoader } from "../config/local-configuration-loader.js";
import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import { ModelProfileValidator } from "../validation/model-profile-validator.js";
import { ModelRequestValidator } from "../validation/model-request-validator.js";
import { ModelResponseValidator } from "../validation/model-response-validator.js";
import { OpenAIModelProvider } from "../models/providers/openai-model-provider.js";
import { ValidatedLlmGateway } from "../models/validated-llm-gateway.js";
import { LiveAiBrandMediaPilot } from "./live-ai-brand-media-pilot.js";
import {
  LivePilotSessionLedger,
} from "./live-pilot-session-ledger.js";
import { OpenAIImageGenerationProvider } from "./openai-image-generation-provider.js";

const executeFile = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const RENDERER = fileURLToPath(
  new URL("../../scripts/render_live_ai_brand_media_factory.py", import.meta.url),
);
const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../../assets/metodo-veloce/live-ai-brand-media-pilot-v1/", import.meta.url),
);
const SESSION_DURATION_MS = 15 * 60 * 1_000;
const AVAILABILITY_MAX_AGE_MS = 15 * 60 * 1_000;
const IMAGE_GENERATION_DISABLED_REASON = "The Closure Run image stage is disabled because its historical image model is deprecated; a separately authorized catalog and cost preflight are required.";
let closureRunPhase = "local-preflight";

interface Arguments {
  readonly availabilityConfirmedAt: string;
  readonly authorizeClosure: true;
  readonly config: string;
  readonly output: string;
  readonly rendererPython: string;
  readonly topic: string;
}

async function main(arguments_: readonly string[]): Promise<void> {
  const input = parseArguments(arguments_);
  closureRunPhase = "availability-attestation";
  assertAvailabilityAttestation(input.availabilityConfirmedAt);
  closureRunPhase = "renderer-check";
  await executeFile(input.rendererPython, [RENDERER, "--prepare-logo"]);

  closureRunPhase = "configuration";
  const configuration = new LocalConfigurationLoader().load(
    await readFile(input.config),
  );
  const provider = configuration.runtime.modelProvider;
  if (
    provider?.providerId !== "openai" ||
    provider.modelId !== "gpt-4o-mini" ||
    provider.baseUrl !== "https://api.openai.com/v1"
  ) {
    throw new Error("Closure configuration does not select the approved text model");
  }
  if (imageGenerationDisabled()) throw new Error(IMAGE_GENERATION_DISABLED_REASON);
  const reference = configuration.secretReferences.find(
    (candidate) => candidate.secretId === provider.apiKeySecretId,
  );
  if (reference?.source !== "local-file") {
    throw new Error("Closure configuration does not contain the approved local secret reference");
  }
  closureRunPhase = "secret-resolution";
  const resolved = await new LocalSecretResolver({ environment: process.env }).resolve(reference);
  const clock = { now: (): Date => new Date() };
  closureRunPhase = "provider-setup";
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
      maxCostUsd: 0.005,
      maxInputCharacters: 2_000,
      maxOutputTokens: 90,
      timeoutMs: 20_000,
    },
    modelId: "gpt-4o-mini",
    profileId: "openai-live-media-text",
    providerId: "openai",
    supportedOutputFormats: ["json"] as const,
  };
  const textGateway = new ValidatedLlmGateway({
    budgetConfig: {
      contractVersion: "1",
      required: true,
      rules: [{
        contractVersion: "1",
        maxEstimatedCostUsd: 0.005,
        maxRequestedCostUsd: 0.005,
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
      maxCostUsd: 0.005,
      maxInputCharacters: 2_000,
      maxOutputTokens: 90,
      maxProviderCalls: 1,
      maxTotalTokens: 2_000,
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
  const imageProvider = new OpenAIImageGenerationProvider({
    config: { apiKey: resolved.value, baseUrl: provider.baseUrl },
  });

  closureRunPhase = "session-ledger";
  await mkdir(input.output, { recursive: true });
  await mkdir(dirname(configuration.runtime.sqlite.path), { recursive: true });
  const sessionId = `live-ai-closure-${randomUUID()}`;
  const ledger = new LivePilotSessionLedger({
    clock,
    path: configuration.runtime.sqlite.path,
  });
  try {
    ledger.createDisabled({
      actorId: "Fabio",
      expiresAt: new Date(clock.now().getTime() + SESSION_DURATION_MS).toISOString(),
      sessionId,
      workspaceId: configuration.runtime.workspaceId,
    });
    // The session is disabled until all offline work and renderer checks above pass.
    ledger.activate(sessionId);
    const pilot = new LiveAiBrandMediaPilot({
      authorization: ledger,
      imageProvider,
      textGateway,
    });
    const preflight = pilot.preflight(sessionId);
    if (preflight.some((entry) => entry.status !== "ready")) {
      const blocked = {
        preflight,
        reason: "preflight_blocked",
        status: "BLOCKED",
      } as const;
      await writeSafeResult(input.output, blocked);
      await writeBlockedStatus(input.output, blocked);
      process.stdout.write(`${JSON.stringify({ preflight, status: "BLOCKED" })}\n`);
      return;
    }

    closureRunPhase = "provider-operations";
    const result = await pilot.run({
      correlationId: sessionId,
      invocationId: sessionId,
      requestId: sessionId,
      sessionId,
      taskId: "live-ai-brand-media-pilot",
      textProfileId: textProfile.profileId,
      topic: input.topic,
    });
    if (result.status !== "READY_FOR_LOCAL_RENDER") {
      const blocked = {
        costLedger: result.costLedger,
        preflight,
        reason: result.reason,
        status: result.status,
      } as const;
      await writeSafeResult(input.output, blocked);
      await writeBlockedStatus(input.output, blocked);
      process.stdout.write(`${JSON.stringify({ estimatedCostUsd: result.costLedger.estimatedCumulativeCostUsd, liveCalls: result.costLedger.liveCalls, status: result.status })}\n`);
      return;
    }

    const temporaryDirectory = await mkdtemp(`${tmpdir()}/mv-ai-media-`);
    try {
      closureRunPhase = "local-render";
      const master = resolve(temporaryDirectory, "master-openai-response.png");
      const metadata = resolve(temporaryDirectory, "safe-render-metadata.json");
      await writeFile(master, result.master.bytes);
      await writeFile(metadata, JSON.stringify({
        contentBrief: result.brief,
        costLedger: result.costLedger,
        masterReceipt: {
          dimensions: { height: result.master.height, width: result.master.width },
          estimatedCostUsd: 0.006,
          model: "gpt-image-1-mini",
          provider: "openai",
          quality: "low",
          sha256: result.master.sha256,
          size: "1024x1536",
        },
        models: { image: "gpt-image-1-mini", text: "gpt-4o-mini" },
        providerCalls: result.costLedger.liveCalls,
      }), "utf8");
      await executeFile(input.rendererPython, [
        RENDERER,
        "--master", master,
        "--metadata", metadata,
        "--output", input.output,
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
    await writeSafeResult(input.output, {
      contentBrief: result.brief,
      costLedger: result.costLedger,
      externalEffects: {
        openAiProviderCalls: result.costLedger.liveCalls,
        socialPublications: 0,
        serverSpendUsd: 0,
      },
      imageModel: "gpt-image-1-mini",
      master: {
        height: result.master.height,
        sha256: result.master.sha256,
        width: result.master.width,
      },
      preflight,
      status: result.status,
      textModel: "gpt-4o-mini",
    });
    process.stdout.write(`${JSON.stringify({ estimatedCostUsd: result.costLedger.estimatedCumulativeCostUsd, imageGenerations: result.costLedger.imageGenerations, liveCalls: result.costLedger.liveCalls, status: result.status })}\n`);
  } finally {
    ledger.closeDatabase();
  }
}

function parseArguments(arguments_: readonly string[]): Arguments {
  let availabilityConfirmedAt: string | undefined;
  let config: string | undefined;
  let output = DEFAULT_OUTPUT;
  let rendererPython: string | undefined;
  let topic = "5 oggetti in casa che puoi vendere subito";
  let authorizeClosure = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (flag === "--authorize-closure") {
      authorizeClosure = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined) throw new Error("Pilot arguments are invalid");
    index += 1;
    if (flag === "--availability-confirmed-at") availabilityConfirmedAt = value;
    else if (flag === "--config") config = value;
    else if (flag === "--output") output = value;
    else if (flag === "--renderer-python") rendererPython = value;
    else if (flag === "--topic") topic = value;
    else throw new Error("Pilot arguments are invalid");
  }
  if (!authorizeClosure || availabilityConfirmedAt === undefined || config === undefined || rendererPython === undefined || topic.trim().length === 0) {
    throw new Error("Pilot arguments are invalid");
  }
  const resolvedOutput = resolve(output);
  if (!resolvedOutput.startsWith(`${ROOT}/`)) {
    throw new Error("Pilot output must remain inside the workspace");
  }
  return {
    availabilityConfirmedAt,
    authorizeClosure: true,
    config: resolve(config),
    output: resolvedOutput,
    rendererPython: resolve(rendererPython),
    topic,
  };
}

function assertAvailabilityAttestation(value: string): void {
  const confirmedAt = Date.parse(value);
  if (!Number.isFinite(confirmedAt) || Math.abs(Date.now() - confirmedAt) > AVAILABILITY_MAX_AGE_MS) {
    throw new Error("OpenAI model availability must be confirmed immediately before the Closure Run");
  }
}

function imageGenerationDisabled(): boolean {
  return true;
}

async function writeSafeResult(output: string, value: unknown): Promise<void> {
  await writeFile(resolve(output, "pilot-result.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBlockedStatus(
  output: string,
  value: {
    readonly costLedger?: {
      readonly apiBudgetEur: number;
      readonly estimatedCumulativeCostUsd: number;
      readonly hardStopUsd: number;
      readonly imageGenerations: number;
      readonly liveCalls: number;
      readonly preflightReservedCostUsd: number;
      readonly serverSpendUsd: 0;
    };
    readonly reason: string;
    readonly status: "BLOCKED";
  },
): Promise<void> {
  const ledger = value.costLedger;
  const status = {
    approvalScope: "INTERNAL_PACKAGE_ONLY",
    brandAssets: {
      originalLogoSha256: "9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121",
      technicalOverlaySha256: "3f4f433853dc467e03eb56b5451928e6cb908f8187b123ccce542e841737f681",
    },
    costGate: {
      ...(ledger === undefined
        ? {
            apiBudgetEur: 5,
            estimatedCumulativeCostUsd: 0,
            hardStopUsd: 4,
            preflightReservedCostUsd: 0.011,
            serverSpendUsd: 0,
          }
        : {
            apiBudgetEur: ledger.apiBudgetEur,
            estimatedCumulativeCostUsd: ledger.estimatedCumulativeCostUsd,
            hardStopUsd: ledger.hardStopUsd,
            preflightReservedCostUsd: ledger.preflightReservedCostUsd,
            serverSpendUsd: ledger.serverSpendUsd,
          }),
      status: "PASS_BUDGET_PREFLIGHT",
    },
    externalActionsAllowed: false,
    externalEffects: {
      openAiProviderCalls: ledger?.liveCalls ?? 0,
      socialPublications: 0,
      serverSpendUsd: 0,
    },
    imageModel: "gpt-image-1-mini",
    liveCalls: ledger?.liveCalls ?? 0,
    models: { image: "gpt-image-1-mini", text: "gpt-4o-mini" },
    publicationAuthorized: false,
    provider: "openai",
    qualityGate: { status: "BLOCKED_NO_MASTER_IMAGE" },
    reason: value.reason,
    riskGate: { status: "PASS_NO_SOCIAL_OR_SERVER_EFFECTS" },
    social: { instagram: "BROWSER_CONNECTION_REQUIRED", tiktok: "BROWSER_CONNECTION_REQUIRED" },
    status: value.status,
    textModel: "gpt-4o-mini",
    visualGate: { status: "BLOCKED_NO_MASTER_IMAGE" },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(status)).digest("hex");
  await writeFile(resolve(output, "pilot-status.json"), `${JSON.stringify({ ...status, fingerprint }, null, 2)}\n`, "utf8");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch {
    process.stderr.write(`Live AI media pilot stopped safely during ${closureRunPhase}.\n`);
    process.exitCode = 1;
  }
}
