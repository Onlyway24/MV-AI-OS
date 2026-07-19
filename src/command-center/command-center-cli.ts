#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { OperationsControlService } from "../operations-control/operations-control-service.js";
import { SupervisedProcessLock } from "../operations-runtime/supervised-process-lock.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalWorkflowCommandBoundary } from "../runtime/create-local-workflow-command-boundary.js";
import { CommandCenterActionService } from "./command-center-action-service.js";
import { RepositoryBackedCommandCenterEventSource } from "./command-center-event-source.js";
import { CommandCenterQueryService } from "./command-center-query-service.js";
import { PrivateCommandCenterServer, type StartedCommandCenter } from "./command-center-server.js";
import { FileSocialVisualApprovalGate } from "./visual-approval-gate.js";

export interface StartedCommandCenterRuntime extends StartedCommandCenter {
  readonly bootstrapPath: string;
  readonly lockPath: string;
}

export async function runCommandCenterCli(arguments_: readonly string[]): Promise<void> {
  const configPath = parseArguments(arguments_);
  const runtime = await startCommandCenterRuntime(configPath);
  process.stdout.write(commandCenterReadinessLine(runtime));
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    shutdownPromise = runtime.close();
    return shutdownPromise;
  };
  const onSignal = (): void => {
    void shutdown().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

export async function startCommandCenterRuntime(configPath: string): Promise<StartedCommandCenterRuntime> {
  const config = parseConfig(await readBoundedFile(configPath));
  const paths = commandCenterRuntimePaths(config.runtime.sqlite.path);
  const lock = await SupervisedProcessLock.acquire({ instanceId: `command-center-${randomUUID()}`, path: paths.lockPath, role: "api" });
  let repositories: SqliteRepositoryTransactionRunner | undefined;
  let started: StartedCommandCenter | undefined;
  try {
    repositories = new SqliteRepositoryTransactionRunner(config.runtime.sqlite);
    const server = new PrivateCommandCenterServer({
      actionService: new CommandCenterActionService({
        actorId: config.runtime.actorId,
        commands: createLocalWorkflowCommandBoundary({
          actorId: config.runtime.actorId,
          clock: systemClock,
          repositories,
          workspaceId: config.runtime.workspaceId,
        }),
        contentApprovalGate: new FileSocialVisualApprovalGate(),
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      eventPlane: {
        source: new RepositoryBackedCommandCenterEventSource(
          repositories,
          config.runtime.workspaceId,
        ),
      },
      operationsControlService: new OperationsControlService({
        actorId: config.runtime.actorId,
        clock: systemClock,
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      queryService: new CommandCenterQueryService({
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
    });
    started = await server.start();
    await writeBootstrapFile(paths.bootstrapPath, started.accessUrl);
  } catch (error) {
    await Promise.allSettled([
      started === undefined ? Promise.resolve() : removeOwnedBootstrapFile(paths.bootstrapPath, started.accessUrl),
      started?.close(),
      repositories?.close(),
      lock.close(),
    ]);
    throw error;
  }
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= closeRuntime(started, repositories, lock, paths.bootstrapPath);
    return closePromise;
  };
  return Object.freeze({ ...started, bootstrapPath: paths.bootstrapPath, close, lockPath: paths.lockPath });
}

export function commandCenterRuntimePaths(sqlitePath: string): Readonly<{ readonly bootstrapPath: string; readonly lockPath: string }> {
  const databasePath = resolve(sqlitePath);
  return Object.freeze({ bootstrapPath: `${databasePath}.command-center-bootstrap.json`, lockPath: `${databasePath}.command-center.lock` });
}

export function commandCenterReadinessLine(runtime: Pick<StartedCommandCenterRuntime, "address">): string {
  return `Centro di Comando Onlyway: READY su http://${runtime.address.host}:${String(runtime.address.port)}/; accesso bootstrap disponibile nel canale locale owner-only.\n`;
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

async function closeRuntime(started: StartedCommandCenter, repositories: SqliteRepositoryTransactionRunner, lock: SupervisedProcessLock, bootstrapPath: string): Promise<void> {
  const failures: unknown[] = [];
  try { await removeOwnedBootstrapFile(bootstrapPath, started.accessUrl); } catch (error) { failures.push(error); }
  try { await started.close(); } catch (error) { failures.push(error); }
  try { await repositories.close(); } catch (error) { failures.push(error); }
  try { await lock.close(); } catch (error) { failures.push(error); }
  if (failures.length > 0) throw new Error("Arresto del Centro di Comando non riuscito");
}

async function writeBootstrapFile(path: string, accessUrl: string): Promise<void> {
  const temporary = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try {
      await handle.writeFile(`${JSON.stringify({ accessUrl, contractVersion: "1", createdAt: new Date().toISOString(), pid: process.pid })}\n`, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    created = false;
    await chmod(path, 0o600);
  } finally {
    if (created) await unlink(temporary).catch(() => undefined);
  }
}

async function removeOwnedBootstrapFile(path: string, accessUrl: string): Promise<void> {
  let value: unknown;
  try { value = JSON.parse(await readFile(path, "utf8")) as unknown; }
  catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  if (!record(value) || value.accessUrl !== accessUrl || value.pid !== process.pid) throw new Error("Il canale bootstrap non appartiene al processo corrente");
  await unlink(path);
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasCode(error: unknown, code: string): boolean { return record(error) && error.code === code; }

if (isMainModule()) {
  void runCommandCenterCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Avvio del Centro di Comando non riuscito";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
