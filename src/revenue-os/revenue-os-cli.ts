#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DeterministicRevenuePlanningService } from "./revenue-planning-service.js";
import { RevenueMissionValidator } from "./revenue-os-validator.js";
import type { RevenueScorecard } from "./revenue-os.js";

const MAX_REVENUE_INPUT_BYTES = 2_000_000;

export async function runRevenueOsCli(arguments_: readonly string[]): Promise<void> {
  const inputPath = parseArguments(arguments_);
  const candidate = parseJson(await readBoundedFile(inputPath));
  const validated = new RevenueMissionValidator().validate(candidate);
  if (!validated.ok) throw new Error("Revenue Mission non valida: controlla contratto, unknown, riferimenti e approval state");
  const scorecard = new DeterministicRevenuePlanningService().evaluate(validated.value);
  process.stdout.write(`${JSON.stringify(redactedOutput(scorecard), null, 2)}\n`);
}

function parseArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--input") throw new Error("Uso: mv-ai-os-revenue --input <revenue-mission.json>");
  const path = arguments_[1];
  if (path === undefined || path.trim().length === 0) throw new Error("È richiesto un file Revenue Mission locale");
  return resolve(path);
}

function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new Error("Il Revenue Input Pack deve essere JSON UTF-8 valido"); }
}

async function readBoundedFile(path: string): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(MAX_REVENUE_INPUT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    if (bytesRead > MAX_REVENUE_INPUT_BYTES) throw new Error("Il Revenue Input Pack supera il limite consentito");
    return buffer.subarray(0, bytesRead);
  } finally { await handle?.close(); }
}

function redactedOutput(scorecard: RevenueScorecard): Readonly<{
  readonly blockingReasonCodes: RevenueScorecard["blockingReasonCodes"];
  readonly contractVersion: "1";
  readonly externalActionsExecuted: false;
  readonly missionId: string;
  readonly readiness: RevenueScorecard["readiness"];
  readonly scorecard: RevenueScorecard;
}> {
  return Object.freeze({
    blockingReasonCodes: scorecard.blockingReasonCodes,
    contractVersion: "1",
    externalActionsExecuted: false,
    missionId: scorecard.missionId,
    readiness: scorecard.readiness,
    scorecard,
  });
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

if (isMainModule()) {
  void runRevenueOsCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Revenue OS non disponibile"}\n`);
    process.exitCode = 1;
  });
}
