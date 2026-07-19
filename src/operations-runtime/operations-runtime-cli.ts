#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdir, open, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { FounderWorkdayService } from "../agent-company/founder-workday-service.js";
import { RepositoryBackedFounderWorkdayStateSource } from "../agent-company/repository-backed-founder-workday-state-source.js";
import { DailyOperatingBriefService } from "../daily-brief/daily-operating-brief-service.js";
import { RepositoryBackedDailyOperatingBriefSource } from "../daily-brief/repository-backed-daily-operating-brief-source.js";
import { createSqliteBackup, restoreSqliteBackup } from "../persistence/sqlite/sqlite-backup.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalWorkflowCommandBoundary } from "../runtime/create-local-workflow-command-boundary.js";
import { createLocalOperationsJobHandlerRegistry } from "./operations-handler-registry.js";
import { enforceOperationsBackupRetention } from "./operations-backup-retention.js";
import { createOperationsLocalWorkflowCallbacks } from "./operations-local-workflow-callbacks.js";
import { OperationsRuntimeControlService } from "./operations-runtime-control-service.js";
import type { OperationsSchedulerTickResult, OperationsWorkerRunResult } from "./operations-runtime.js";
import { createDefaultOperationsScheduleCatalog, registerDefaultOperationsScheduleCatalog } from "./operations-schedule-catalog.js";
import { OperationsSchedulerService, randomOperationsInstanceId } from "./operations-scheduler-service.js";
import { OperationsWorkerService } from "./operations-worker-service.js";
import { SupervisedProcessLock } from "./supervised-process-lock.js";

type RuntimeRole = "backup-verifier" | "health-monitor" | "scheduler" | "smoke" | "worker";
interface Arguments { readonly backupDirectory?: string; readonly configPath: string; readonly role: RuntimeRole; }

const clock = Object.freeze({ now: () => new Date() });

export async function runOperationsRuntimeCli(arguments_: readonly string[]): Promise<void> {
  const parsed = parseArguments(arguments_);
  const config = parseConfig(await readBoundedFile(parsed.configPath));
  const instanceId = randomOperationsInstanceId(parsed.role === "scheduler" ? "scheduler" : "worker");
  const lock = await SupervisedProcessLock.acquire({ instanceId, path: `${config.runtime.sqlite.path}.operations-${parsed.role}.lock`, role: parsed.role });
  const repositories = new SqliteRepositoryTransactionRunner(config.runtime.sqlite);
  const stop = new AbortController();
  const onSignal = (): void => { stop.abort(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  let serviceClose: (() => Promise<void>) | undefined;
  try {
    if (parsed.role === "backup-verifier") {
      const receipt = await verifyBackupRestore(config.runtime.sqlite.path, requiredBackupDirectory(parsed), stop.signal);
      writeStatus({ receiptRef: receipt.receiptRef, role: parsed.role, status: "COMPLETED" });
      return;
    }
    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: config.runtime.workspaceId });
    if (parsed.role === "health-monitor") {
      await monitorHealth(controls, stop.signal);
      return;
    }
    if (parsed.role === "smoke") {
      writeStatus({ health: await controls.health(), role: parsed.role, status: "COMPLETED" });
      return;
    }
    if (parsed.role === "scheduler") {
      const scheduler = new OperationsSchedulerService({ actorId: config.runtime.actorId, clock, instanceId, repositories, workspaceId: config.runtime.workspaceId });
      serviceClose = () => scheduler.close();
      await registerDefaultOperationsScheduleCatalog(scheduler, createDefaultOperationsScheduleCatalog({ actorId: config.runtime.actorId, backupPolicyId: "local-sqlite-backup", clock, workspaceId: config.runtime.workspaceId }));
      await runScheduler(scheduler, stop.signal);
      return;
    }
    const boundary = createLocalWorkflowCommandBoundary({ actorId: config.runtime.actorId, clock, repositories, workspaceId: config.runtime.workspaceId });
    const localWorkflows = createOperationsLocalWorkflowCallbacks({
      actorId: config.runtime.actorId,
      commandBoundary: boundary,
      dailyOperatingReport: new DailyOperatingBriefService({ actorId: config.runtime.actorId, clock, repositories, source: new RepositoryBackedDailyOperatingBriefSource(), workspaceId: config.runtime.workspaceId }),
      founderWorkday: new FounderWorkdayService({ actorId: config.runtime.actorId, clock, repositories, state: new RepositoryBackedFounderWorkdayStateSource(), workspaceId: config.runtime.workspaceId }),
      workspaceId: config.runtime.workspaceId,
    });
    const backupDirectory = parsed.backupDirectory;
    const handlers = createLocalOperationsJobHandlerRegistry({
      commandBoundary: boundary,
      localWorkflows,
      repositories,
      ...(backupDirectory === undefined ? {} : { verifyBackupAndRestore: (_policyId: string, signal: AbortSignal) => verifyBackupRestore(config.runtime.sqlite.path, backupDirectory, signal) }),
    });
    const worker = new OperationsWorkerService({ clock, handlers, instanceId, repositories, workerId: "primary", workspaceId: config.runtime.workspaceId });
    serviceClose = () => worker.close();
      await runOperationsWorkerLoop(worker, stop.signal);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await closeOperationsRuntimeResources({
      closeLock: () => lock.close(),
      closeRepositories: () => repositories.close(),
      ...(serviceClose === undefined ? {} : { closeService: serviceClose }),
    });
  }
}

export async function closeOperationsRuntimeResources(input: Readonly<{
  readonly closeLock: () => Promise<void>;
  readonly closeRepositories: () => Promise<void>;
  readonly closeService?: () => Promise<void>;
}>): Promise<void> {
  const failures: unknown[] = [];
  const closeInOrder: readonly (() => Promise<void>)[] = [
    ...(input.closeService === undefined ? [] : [input.closeService]),
    input.closeRepositories,
    input.closeLock,
  ];
  for (const close of closeInOrder) {
    try { await close(); }
    catch (error) { failures.push(error); }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Operations runtime teardown failed");
}

async function runScheduler(service: OperationsSchedulerService, signal: AbortSignal): Promise<void> {
  let previousStatus: OperationsSchedulerTickResult["status"] | undefined;
  while (!signal.aborted) {
    const result = await service.tick();
    if (shouldWriteOperationsLoopStatus(previousStatus, result.status)) writeStatus({ role: "scheduler", ...result });
    previousStatus = result.status;
    await delay(operationsLoopDelayMs("scheduler", result.status), signal);
  }
}

export async function runOperationsWorkerLoop(
  service: Pick<OperationsWorkerService, "close" | "recoverExpiredClaims" | "runOnce">,
  signal: AbortSignal,
): Promise<void> {
  let closePromise: Promise<void> | undefined;
  const beginClose = (): Promise<void> => {
    closePromise ??= service.close();
    return closePromise;
  };
  const onAbort = (): void => { void beginClose().catch(() => undefined); };
  signal.addEventListener("abort", onAbort, { once: true });
  let previousStatus: OperationsWorkerRunResult["status"] | undefined;
  try {
    if (isAborted(signal)) return;
    await service.recoverExpiredClaims();
    for (;;) {
      if (isAborted(signal)) break;
      const result = await service.runOnce();
      if (shouldWriteOperationsLoopStatus(previousStatus, result.status)) writeStatus(operationsWorkerLogProjection(result));
      previousStatus = result.status;
      await delay(operationsLoopDelayMs("worker", result.status), signal);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (signal.aborted) await beginClose();
  }
}

/** Allowlisted process telemetry: never serialize a durable job payload to logs. */
export function operationsWorkerLogProjection(result: OperationsWorkerRunResult): Readonly<Record<string, unknown>> {
  const job = result.job;
  return Object.freeze({
    contractVersion: result.contractVersion,
    ...(job === undefined ? {} : {
      job: Object.freeze({
        attempt: job.attempt,
        ...(job.block === undefined ? {} : { blockCode: job.block.code }),
        ...(job.lastFailure === undefined ? {} : { failureCode: job.lastFailure.code }),
        jobId: job.jobId,
        jobType: job.jobType,
        status: job.status,
        version: job.version,
      }),
    }),
    recoveredExpiredClaims: result.recoveredExpiredClaims,
    role: "worker",
    status: result.status,
    unauthorizedExternalEffectOccurred: result.unauthorizedExternalEffectOccurred,
  });
}

type OperationsLoopStatus = OperationsSchedulerTickResult["status"] | OperationsWorkerRunResult["status"];

export function operationsLoopDelayMs(role: "scheduler" | "worker", status: OperationsLoopStatus): number {
  if (status === "LEASE_HELD" || status === "STOPPED") return 30_000;
  if (role === "scheduler") return 5_000;
  return status === "IDLE" ? 2_000 : 50;
}

export function shouldWriteOperationsLoopStatus(previousStatus: OperationsLoopStatus | undefined, status: OperationsLoopStatus): boolean {
  if (status === "IDLE") return false;
  return status !== "LEASE_HELD" && status !== "STOPPED" ? true : previousStatus !== status;
}

async function monitorHealth(service: OperationsRuntimeControlService, signal: AbortSignal): Promise<void> {
  let cleanupCounter = 0;
  while (!signal.aborted) {
    const health = await service.monitorHealth();
    writeStatus({ health, role: "health-monitor", status: health.status });
    cleanupCounter += 1;
    if (cleanupCounter >= 120) {
      cleanupCounter = 0;
      const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
      await service.enforceRetention({ terminalBefore: before });
    }
    await delay(30_000, signal);
  }
}

async function verifyBackupRestore(sourcePath: string, directory: string, signal: AbortSignal): Promise<Readonly<{ readonly receiptRef: string }>> {
  signal.throwIfAborted();
  const backupDirectory = resolve(directory);
  await mkdir(backupDirectory, { mode: 0o700, recursive: true });
  await chmod(backupDirectory, 0o700);
  const identity = `${new Date().toISOString().replaceAll(":", "-")}--${randomUUID()}`;
  const backupPath = join(backupDirectory, `mv-ai-os--${identity}.sqlite`);
  const restoreProbe = join(backupDirectory, `.restore-probe--${identity}.sqlite`);
  await createSqliteBackup({ contractVersion: "1", destinationPath: backupPath, overwriteDestination: false, sourcePath, timeoutMs: 60_000 });
  try {
    signal.throwIfAborted();
    await restoreSqliteBackup({ backupPath, contractVersion: "1", destinationPath: restoreProbe, overwriteDestination: false, timeoutMs: 60_000 });
  } finally {
    await rm(restoreProbe, { force: true });
  }
  await enforceOperationsBackupRetention({
    directory: backupDirectory,
    justVerifiedPath: backupPath,
    sourcePath,
  });
  return Object.freeze({ receiptRef: `backup-${digest(backupPath).slice(0, 48)}` });
}

function parseArguments(arguments_: readonly string[]): Arguments {
  let configPath: string | undefined;
  let role: RuntimeRole | undefined;
  let backupDirectory: string | undefined;
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (value === undefined || value.trim().length === 0) throw new Error("Operations runtime arguments are invalid");
    if (key === "--config") configPath = value;
    else if (key === "--role" && isRole(value)) role = value;
    else if (key === "--backup-directory") backupDirectory = value;
    else throw new Error("Usage: mv-ai-os-operations --config <path> --role <scheduler|worker|health-monitor|backup-verifier|smoke> [--backup-directory <path>]");
  }
  if (configPath === undefined || role === undefined) throw new Error("Operations runtime config and role are required");
  return Object.freeze({ ...(backupDirectory === undefined ? {} : { backupDirectory }), configPath, role });
}

function parseConfig(bytes: Uint8Array): LocalCliConfig {
  let candidate: unknown;
  try { candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Operations runtime configuration must be valid UTF-8 JSON"); }
  const checked = new LocalCliConfigValidator().validate(candidate);
  if (!checked.ok) throw new Error("Operations runtime configuration is invalid");
  return checked.value;
}

async function readBoundedFile(path: string): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try { const buffer = Buffer.alloc(MAX_LOCAL_CLI_CONFIG_BYTES + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0); if (bytesRead > MAX_LOCAL_CLI_CONFIG_BYTES) throw new Error("Operations runtime configuration is too large"); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolveDelay(); }, { once: true });
  });
}

function requiredBackupDirectory(input: Arguments): string { if (input.backupDirectory === undefined) throw new Error("Backup verifier requires --backup-directory"); return input.backupDirectory; }
function isRole(value: string): value is RuntimeRole { return ["backup-verifier", "health-monitor", "scheduler", "smoke", "worker"].includes(value); }
function isAborted(signal: AbortSignal): boolean { return signal.aborted; }
function writeStatus(value: unknown): void { process.stdout.write(`${JSON.stringify(value)}\n`); }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function isMainModule(): boolean { const entry = process.argv[1]; return entry !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entry); }

if (isMainModule()) void runOperationsRuntimeCli(process.argv.slice(2)).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Operations runtime failed"}\n`); process.exitCode = 1; });
