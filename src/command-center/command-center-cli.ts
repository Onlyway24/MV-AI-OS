#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalWorkflowCommandBoundary } from "../runtime/create-local-workflow-command-boundary.js";
import { CommandCenterActionService } from "./command-center-action-service.js";
import { CommandCenterQueryService } from "./command-center-query-service.js";
import { PrivateCommandCenterServer } from "./command-center-server.js";

export async function runCommandCenterCli(arguments_: readonly string[]): Promise<void> {
  const configPath = parseArguments(arguments_);
  const config = parseConfig(await readBoundedFile(configPath));
  const repositories = new SqliteRepositoryTransactionRunner(config.runtime.sqlite);
  const server = new PrivateCommandCenterServer({
    actionService: new CommandCenterActionService({
      actorId: config.runtime.actorId,
      commands: createLocalWorkflowCommandBoundary({
        actorId: config.runtime.actorId,
        clock: systemClock,
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      repositories,
      workspaceId: config.runtime.workspaceId,
    }),
    queryService: new CommandCenterQueryService({
      repositories,
      workspaceId: config.runtime.workspaceId,
    }),
  });
  let started;
  try {
    started = await server.start();
  } catch (error) {
    await repositories.close();
    throw error;
  }
  process.stdout.write(`Centro di Comando Onlyway: ${started.accessUrl}\n`);
  const shutdown = async (): Promise<void> => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await started.close();
    await repositories.close();
  };
  const onSignal = (): void => {
    void shutdown().finally(() => process.exit(0));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

const systemClock = Object.freeze({ now: () => new Date() });

function parseArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--config") {
    throw new Error("Uso: mv-ai-os-command-center --config <percorso>");
  }
  const path = arguments_[1];
  if (path === undefined || path.trim().length === 0) {
    throw new Error("È richiesto il percorso della configurazione del Centro di Comando");
  }
  return path;
}

function parseConfig(bytes: Uint8Array): LocalCliConfig {
  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("La configurazione del Centro di Comando deve essere JSON UTF-8 valido");
  }
  const result = new LocalCliConfigValidator().validate(candidate);
  if (!result.ok) throw new Error("La configurazione del Centro di Comando non è valida");
  return result.value;
}

async function readBoundedFile(path: string): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(MAX_LOCAL_CLI_CONFIG_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    if (bytesRead > MAX_LOCAL_CLI_CONFIG_BYTES) {
      throw new Error("La configurazione del Centro di Comando supera la dimensione massima consentita");
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle?.close();
  }
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

if (isMainModule()) {
  void runCommandCenterCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Avvio del Centro di Comando non riuscito";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
