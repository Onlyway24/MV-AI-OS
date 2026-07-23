#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SqliteVentureHoldingTransactionRunner } from "../persistence/sqlite/sqlite-venture-holding-transaction-runner.js";
import { VentureHoldingService, type Venture001RunResult } from "./venture-holding-service.js";

export async function runVentureHoldingCli(arguments_: readonly string[]): Promise<Venture001RunResult> {
  const config = parseConfig(await readFile(parseArguments(arguments_)));
  const core = new SqliteRepositoryTransactionRunner(config.runtime.sqlite);
  const venture = new SqliteVentureHoldingTransactionRunner(config.runtime.sqlite);
  try {
    return await new VentureHoldingService({ actorId: config.runtime.actorId, clock: systemClock, coreRepositories: core, repositories: venture, workspaceId: config.runtime.workspaceId }).runOnlywayVenture001();
  } finally {
    await Promise.allSettled([venture.close(), core.close()]);
  }
}

function parseArguments(arguments_: readonly string[]): string { if (arguments_.length !== 2 || arguments_[0] !== "--config" || arguments_[1] === undefined || arguments_[1].trim().length === 0) throw new Error("Uso: mv-ai-os-venture --config <percorso>"); return arguments_[1]; }
function parseConfig(bytes: Uint8Array): LocalCliConfig { if (bytes.byteLength > MAX_LOCAL_CLI_CONFIG_BYTES) throw new Error("La configurazione Venture supera il limite consentito"); let candidate: unknown; try { candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; } catch { throw new Error("La configurazione Venture deve essere JSON UTF-8 valido"); } const result = new LocalCliConfigValidator().validate(candidate); if (!result.ok) throw new Error("La configurazione Venture non è valida"); return result.value; }
function isMainModule(): boolean { const entry = process.argv[1]; return entry !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entry); }
const systemClock = Object.freeze({ now: () => new Date() });

if (isMainModule()) {
  void runVentureHoldingCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify({ blockerCodes: result.package.blockerCodes, commandReceiptFingerprint: result.command.receipt.fingerprint, evidencePackCount: result.evidencePackCount, externalEffects: result.externalEffects, opportunityCount: result.package.opportunities.length, state: result.package.state, ventureId: result.package.venture.ventureId })}\n`);
  }).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Venture Holding run failed"}\n`); process.exitCode = 1; });
}
