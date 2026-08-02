#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, realpathSync } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm, stat, statfs } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { FounderWorkdayService } from "../agent-company/founder-workday-service.js";
import { RepositoryBackedFounderWorkdayStateSource } from "../agent-company/repository-backed-founder-workday-state-source.js";
import {
  ADMIN_CAPABILITIES,
  ADMIN_ROLES,
  ADMIN_SECURITY_CONTRACT_VERSION,
  ADMIN_SECURITY_EVENT_TYPES,
  ADMIN_SECURITY_STATE_VERSION,
  SERVICE_PRINCIPAL_PROFILES,
} from "../admin-security/admin-security-contracts.js";
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
const DEFAULT_ADMIN_SECURITY_STATE_PATH =
  "/var/lib/onlyway-admin/admin-security.json";
const MAX_ADMIN_SECURITY_STATE_BYTES = 5 * 1024 * 1024;
const DEFAULT_BACKUP_FREE_SPACE_RESERVE_BYTES = 512 * 1024 * 1024;
const MAX_BACKUP_FREE_SPACE_RESERVE_BYTES = 1_000_000_000_000_000;

export interface OperationsBackupDiskSpaceBudget {
  readonly availableBytes: number;
  readonly requiredBytes: number;
  readonly sufficient: boolean;
}

export function operationsBackupDiskSpaceBudget(input: Readonly<{
  readonly adminSecurityStateBytes: number;
  readonly availableBytes: number;
  readonly databaseBytes: number;
  readonly reserveBytes?: number;
}>): OperationsBackupDiskSpaceBudget {
  const reserveBytes = input.reserveBytes
    ?? DEFAULT_BACKUP_FREE_SPACE_RESERVE_BYTES;
  for (const [label, value] of Object.entries({
    adminSecurityStateBytes: input.adminSecurityStateBytes,
    availableBytes: input.availableBytes,
    databaseBytes: input.databaseBytes,
    reserveBytes,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Backup disk-space ${label} is invalid`);
    }
  }
  if (reserveBytes < DEFAULT_BACKUP_FREE_SPACE_RESERVE_BYTES) {
    throw new Error("Backup disk-space reserve is below the production floor");
  }
  const required =
    BigInt(input.databaseBytes) * 3n
    + BigInt(input.adminSecurityStateBytes) * 2n
    + BigInt(reserveBytes);
  if (required > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Backup disk-space requirement exceeds the safe range");
  }
  const requiredBytes = Number(required);
  return Object.freeze({
    availableBytes: input.availableBytes,
    requiredBytes,
    sufficient: input.availableBytes >= requiredBytes,
  });
}

export async function runOperationsRuntimeCli(arguments_: readonly string[]): Promise<void> {
  process.umask(0o077);
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
      const scheduler = new OperationsSchedulerService({
        actorId: config.runtime.actorId,
        clock,
        instanceId,
        maxQueueDepth: environmentInteger("ONLYWAY_MAX_QUEUE_DEPTH", 1_000, 1, 1_000_000),
        repositories,
        workspaceId: config.runtime.workspaceId,
      });
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
  if (status === "BACKPRESSURE" || status === "LEASE_HELD" || status === "STOPPED") return 30_000;
  if (role === "scheduler") return 5_000;
  return status === "IDLE" ? 2_000 : 50;
}

export function shouldWriteOperationsLoopStatus(previousStatus: OperationsLoopStatus | undefined, status: OperationsLoopStatus): boolean {
  if (status === "IDLE") return false;
  return status !== "BACKPRESSURE" && status !== "LEASE_HELD" && status !== "STOPPED" ? true : previousStatus !== status;
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
  await assertOperationsBackupDiskSpace({
    adminSecurityStatePath: adminSecurityStatePath(),
    backupDirectory,
    databasePath: sourcePath,
  });
  const identity = `${new Date().toISOString().replaceAll(":", "-")}--${randomUUID()}`;
  const backupPath = join(backupDirectory, `mv-ai-os--${identity}.sqlite`);
  const adminSecurityBackupPath = `${backupPath}.admin-security.json`;
  const restoreProbe = join(backupDirectory, `.restore-probe--${identity}.sqlite`);
  await createSqliteBackup({ contractVersion: "1", destinationPath: backupPath, overwriteDestination: false, sourcePath, timeoutMs: 60_000 });
  let verified = false;
  try {
    signal.throwIfAborted();
    await restoreSqliteBackup({ backupPath, contractVersion: "1", destinationPath: restoreProbe, overwriteDestination: false, timeoutMs: 60_000 });
    const adminSecurityState = await snapshotAdminSecurityState(
      adminSecurityStatePath(),
      adminSecurityBackupPath,
    );
    await writeBackupManifest(backupPath, adminSecurityState);
    await enforceOperationsBackupRetention({
      directory: backupDirectory,
      justVerifiedPath: backupPath,
      sourcePath,
    });
    verified = true;
  } finally {
    await rm(restoreProbe, { force: true });
    if (!verified) {
      await Promise.all([
        rm(backupPath, { force: true }),
        rm(adminSecurityBackupPath, { force: true }),
        rm(`${backupPath}.manifest.json`, { force: true }),
        rm(`${backupPath}.manifest.json.sig`, { force: true }),
      ]);
    }
  }
  return Object.freeze({ receiptRef: `backup-${digest(backupPath).slice(0, 48)}` });
}

async function assertOperationsBackupDiskSpace(input: Readonly<{
  readonly adminSecurityStatePath: string;
  readonly backupDirectory: string;
  readonly databasePath: string;
}>): Promise<void> {
  const [adminSecurityState, database, filesystem] = await Promise.all([
    lstat(input.adminSecurityStatePath),
    lstat(input.databasePath),
    statfs(input.backupDirectory),
  ]);
  const currentUserId = process.getuid?.();
  if (
    !adminSecurityState.isFile()
    || adminSecurityState.isSymbolicLink()
    || adminSecurityState.size < 1
    || adminSecurityState.size > MAX_ADMIN_SECURITY_STATE_BYTES
    || (adminSecurityState.mode & 0o777) !== 0o600
    || (currentUserId !== undefined
      && adminSecurityState.uid !== currentUserId)
    || !database.isFile()
    || database.isSymbolicLink()
    || database.size < 1
    || (database.mode & 0o777) !== 0o600
    || (currentUserId !== undefined && database.uid !== currentUserId)
  ) {
    throw new Error("Backup disk-space sources are unavailable or unsafe");
  }
  const availableBytes = safeFilesystemAvailableBytes(
    filesystem.bavail,
    filesystem.bsize,
  );
  const budget = operationsBackupDiskSpaceBudget({
    adminSecurityStateBytes: adminSecurityState.size,
    availableBytes,
    databaseBytes: database.size,
    reserveBytes: environmentInteger(
      "ONLYWAY_BACKUP_RESERVE_BYTES",
      DEFAULT_BACKUP_FREE_SPACE_RESERVE_BYTES,
      DEFAULT_BACKUP_FREE_SPACE_RESERVE_BYTES,
      MAX_BACKUP_FREE_SPACE_RESERVE_BYTES,
    ),
  });
  if (!budget.sufficient) {
    throw new Error(
      `Insufficient disk space for verified backup bundle: `
      + `${String(budget.availableBytes)} available, `
      + `${String(budget.requiredBytes)} required`,
    );
  }
}

function safeFilesystemAvailableBytes(
  availableBlocks: number,
  blockSize: number,
): number {
  if (
    !Number.isSafeInteger(availableBlocks)
    || availableBlocks < 0
    || !Number.isSafeInteger(blockSize)
    || blockSize < 1
  ) {
    throw new Error("Backup filesystem capacity is invalid");
  }
  const available = BigInt(availableBlocks) * BigInt(blockSize);
  if (available > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Backup filesystem capacity exceeds the safe range");
  }
  return Number(available);
}

interface AdminSecurityBackupMetadata {
  readonly contractVersion: typeof ADMIN_SECURITY_CONTRACT_VERSION;
  readonly file: string;
  readonly revision: number;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly stateVersion: typeof ADMIN_SECURITY_STATE_VERSION;
}

async function writeBackupManifest(
  backupPath: string,
  adminSecurityState: AdminSecurityBackupMetadata,
): Promise<void> {
  const metadata = await stat(backupPath);
  const database = new DatabaseSync(backupPath, { readOnly: true });
  let schemaVersion: number;
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get();
    if (integrity === undefined || !Object.values(integrity).includes("ok")) {
      throw new Error("Verified backup failed its manifest integrity check");
    }
    const version = database.prepare("PRAGMA user_version").get();
    const candidate = version === undefined
      ? undefined
      : Object.values(version)[0];
    if (
      typeof candidate !== "number" ||
      !Number.isSafeInteger(candidate) ||
      candidate < 1
    ) {
      throw new Error("Verified backup schema version is invalid");
    }
    schemaVersion = candidate;
  } finally {
    database.close();
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(backupPath)) {
    hash.update(chunk as Buffer);
  }
  const commit = process.env.ONLYWAY_RELEASE_COMMIT;
  const body = Object.freeze({
    backupFile: basename(backupPath),
    adminSecurityState,
    contractVersion: "1",
    createdAt: new Date().toISOString(),
    encryptionState: "BACKUP_AT_REST_ENCRYPTION_REQUIRED",
    integrityCheck: "ok",
    releaseCommit:
      typeof commit === "string" && /^[a-f0-9]{40}$/u.test(commit)
        ? commit
        : null,
    restoreProbe: "PASSED",
    rawBootstrapIncluded: false,
    schemaVersion,
    secretsIncluded: false,
    sha256: hash.digest("hex"),
    sizeBytes: metadata.size,
  });
  const manifest = Object.freeze({
    ...body,
    manifestFingerprint: digest(JSON.stringify(body)),
  });
  const manifestPath = `${backupPath}.manifest.json`;
  const temporary = `${manifestPath}.${String(process.pid)}.${randomUUID()}.tmp`;
  let published = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(manifest)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, manifestPath);
    await chmod(manifestPath, 0o600);
    published = true;
  } finally {
    if (!published) await rm(temporary, { force: true });
  }
}

async function snapshotAdminSecurityState(
  sourcePath: string,
  destinationPath: string,
): Promise<AdminSecurityBackupMetadata> {
  const source = await lstat(sourcePath);
  const currentUserId = process.getuid?.();
  if (
    !source.isFile()
    || source.isSymbolicLink()
    || (source.mode & 0o777) !== 0o600
    || source.size < 1
    || source.size > MAX_ADMIN_SECURITY_STATE_BYTES
    || (currentUserId !== undefined && source.uid !== currentUserId)
  ) {
    throw new Error("Admin security state is unavailable or unsafe");
  }
  const sourceHandle = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let bytes: Buffer;
  try {
    const opened = await sourceHandle.stat();
    if (
      !opened.isFile()
      || opened.dev !== source.dev
      || opened.ino !== source.ino
      || opened.uid !== source.uid
      || (opened.mode & 0o777) !== 0o600
      || opened.size !== source.size
    ) {
      throw new Error("Admin security state identity changed before backup");
    }
    bytes = await sourceHandle.readFile();
    const completed = await sourceHandle.stat();
    if (
      completed.dev !== opened.dev
      || completed.ino !== opened.ino
      || completed.size !== opened.size
      || completed.mtimeMs !== opened.mtimeMs
      || bytes.byteLength !== opened.size
    ) {
      throw new Error("Admin security state changed during backup");
    }
  } finally {
    await sourceHandle.close();
  }
  const state = validateAdminSecurityBackupState(bytes);
  const temporary = `${destinationPath}.${String(process.pid)}.${randomUUID()}.tmp`;
  let published = false;
  try {
    const destination = await open(temporary, "wx", 0o600);
    try {
      await destination.writeFile(bytes);
      await destination.sync();
    } finally {
      await destination.close();
    }
    await rename(temporary, destinationPath);
    await chmod(destinationPath, 0o600);
    published = true;
  } finally {
    if (!published) await rm(temporary, { force: true });
  }
  return Object.freeze({
    contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
    file: basename(destinationPath),
    revision: state.revision,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    stateVersion: ADMIN_SECURITY_STATE_VERSION,
  });
}

function adminSecurityStatePath(): string {
  const configured = process.env.ONLYWAY_ADMIN_SECURITY_STATE_PATH
    ?? DEFAULT_ADMIN_SECURITY_STATE_PATH;
  if (!isAbsolute(configured)) {
    throw new Error("ONLYWAY_ADMIN_SECURITY_STATE_PATH must be absolute");
  }
  return configured;
}

function validateAdminSecurityBackupState(
  bytes: Buffer,
): Readonly<{ readonly revision: number }> {
  if (bytes.byteLength > MAX_ADMIN_SECURITY_STATE_BYTES) {
    throw new Error("Admin security state exceeds its backup size limit");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Admin security state must be valid UTF-8 JSON");
  }
  if (
    !recordWithKeys(value, [
      "bootstrap",
      "challenges",
      "contractVersion",
      "credentials",
      "principals",
      "rateLimits",
      "revision",
      "securityEvents",
      "sessions",
      "stateVersion",
      "stepUpReceipts",
    ])
    || value.contractVersion !== ADMIN_SECURITY_CONTRACT_VERSION
    || value.stateVersion !== ADMIN_SECURITY_STATE_VERSION
    || !integer(value.revision)
    || !validBootstrap(value.bootstrap)
    || !arrayOf(value.principals, validPrincipal)
    || !arrayOf(value.credentials, validCredential)
    || !arrayOf(value.challenges, validChallenge)
    || !arrayOf(value.sessions, validSession)
    || !arrayOf(value.stepUpReceipts, validStepUpReceipt)
    || !arrayOf(value.rateLimits, validRateLimit)
    || !arrayOf(value.securityEvents, validSecurityEvent)
  ) {
    throw new Error("Admin security state schema is invalid");
  }
  return Object.freeze({ revision: value.revision });
}

function validBootstrap(value: unknown): boolean {
  return value === null || (
    recordWithKeys(value, [
      "consumedAt",
      "createdAt",
      "expiresAt",
      "tokenHash",
    ])
    && nullableTimestamp(value.consumedAt)
    && timestamp(value.createdAt)
    && timestamp(value.expiresAt)
    && hash(value.tokenHash)
  );
}

function validPrincipal(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const common =
    string(value.principalId)
    && string(value.displayName)
    && timestamp(value.createdAt)
    && ["ACTIVE", "DISABLED"].includes(String(value.status))
    && arrayOf(value.roles, (entry) => ADMIN_ROLES.includes(entry as never))
    && arrayOf(value.capabilities, (entry) =>
      ADMIN_CAPABILITIES.includes(entry as never));
  if (!common) return false;
  return value.kind === "HUMAN"
    ? recordWithKeys(value, [
      "capabilities",
      "createdAt",
      "displayName",
      "kind",
      "principalId",
      "roles",
      "status",
    ])
    : value.kind === "SERVICE"
      && recordWithKeys(value, [
        "capabilities",
        "createdAt",
        "displayName",
        "kind",
        "principalId",
        "profile",
        "roles",
        "status",
      ])
      && SERVICE_PRINCIPAL_PROFILES.includes(value.profile as never);
}

function validCredential(value: unknown): boolean {
  return recordWithKeys(value, [
    "backedUp",
    "counter",
    "createdAt",
    "credentialId",
    "deviceType",
    "principalId",
    "publicKey",
    "transports",
  ])
    && typeof value.backedUp === "boolean"
    && integer(value.counter)
    && timestamp(value.createdAt)
    && string(value.credentialId)
    && ["multiDevice", "singleDevice"].includes(String(value.deviceType))
    && string(value.principalId)
    && string(value.publicKey)
    && arrayOf(value.transports, string);
}

function validChallenge(value: unknown): boolean {
  return recordWithKeys(value, [
    "bootstrapTokenHash",
    "capability",
    "challenge",
    "command",
    "commandFingerprint",
    "createdAt",
    "expiresAt",
    "flowId",
    "kind",
    "principalId",
    "sessionId",
    "sourceKeyHash",
    "usedAt",
  ])
    && nullableHash(value.bootstrapTokenHash)
    && (value.capability === null
      || ADMIN_CAPABILITIES.includes(value.capability as never))
    && string(value.challenge)
    && nullableString(value.command)
    && nullableHash(value.commandFingerprint)
    && timestamp(value.createdAt)
    && timestamp(value.expiresAt)
    && string(value.flowId)
    && ["AUTHENTICATION", "FOUNDER_REGISTRATION", "STEP_UP"].includes(
      String(value.kind),
    )
    && nullableString(value.principalId)
    && nullableString(value.sessionId)
    && hash(value.sourceKeyHash)
    && nullableTimestamp(value.usedAt);
}

function validSession(value: unknown): boolean {
  return recordWithKeys(value, [
    "absoluteExpiresAt",
    "createdAt",
    "idleExpiresAt",
    "lastSeenAt",
    "principalId",
    "revokedAt",
    "sessionId",
    "tokenHash",
  ])
    && timestamp(value.absoluteExpiresAt)
    && timestamp(value.createdAt)
    && timestamp(value.idleExpiresAt)
    && timestamp(value.lastSeenAt)
    && string(value.principalId)
    && nullableTimestamp(value.revokedAt)
    && string(value.sessionId)
    && hash(value.tokenHash);
}

function validStepUpReceipt(value: unknown): boolean {
  return recordWithKeys(value, [
    "capability",
    "command",
    "commandFingerprint",
    "consumedAt",
    "createdAt",
    "expiresAt",
    "principalId",
    "receiptId",
    "sessionId",
    "tokenHash",
  ])
    && ADMIN_CAPABILITIES.includes(value.capability as never)
    && string(value.command)
    && hash(value.commandFingerprint)
    && nullableTimestamp(value.consumedAt)
    && timestamp(value.createdAt)
    && timestamp(value.expiresAt)
    && string(value.principalId)
    && string(value.receiptId)
    && string(value.sessionId)
    && hash(value.tokenHash);
}

function validRateLimit(value: unknown): boolean {
  return recordWithKeys(value, [
    "attempts",
    "failures",
    "keyHash",
    "lockedUntil",
    "scope",
    "updatedAt",
    "windowStartedAt",
  ])
    && integer(value.attempts)
    && integer(value.failures)
    && hash(value.keyHash)
    && nullableTimestamp(value.lockedUntil)
    && ["AUTHENTICATION", "BOOTSTRAP", "REGISTRATION", "STEP_UP"].includes(
      String(value.scope),
    )
    && timestamp(value.updatedAt)
    && timestamp(value.windowStartedAt);
}

function validSecurityEvent(value: unknown): boolean {
  return recordWithKeys(value, [
    "contractVersion",
    "eventId",
    "eventType",
    "occurredAt",
    "outcome",
    "principalId",
    "reasonCode",
    "sourceKeyHash",
    "subjectId",
  ])
    && value.contractVersion === ADMIN_SECURITY_CONTRACT_VERSION
    && string(value.eventId)
    && ADMIN_SECURITY_EVENT_TYPES.includes(value.eventType as never)
    && timestamp(value.occurredAt)
    && ["DENIED", "SUCCEEDED"].includes(String(value.outcome))
    && nullableString(value.principalId)
    && string(value.reasonCode)
    && nullableHash(value.sourceKeyHash)
    && nullableString(value.subjectId);
}

function arrayOf(
  value: unknown,
  predicate: (entry: unknown) => boolean,
): value is readonly unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

function recordWithKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nullableString(value: unknown): boolean {
  return value === null || string(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function nullableHash(value: unknown): boolean {
  return value === null || hash(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): boolean {
  return value === null || timestamp(value);
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
function environmentInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) return fallback;
  if (!/^[1-9]\d*$/u.test(raw)) throw new Error(`${name} is invalid`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
  return value;
}
function isMainModule(): boolean { const entry = process.argv[1]; return entry !== undefined && realpathSync(fileURLToPath(import.meta.url)) === resolve(entry); }

if (isMainModule()) void runOperationsRuntimeCli(process.argv.slice(2)).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Operations runtime failed"}\n`); process.exitCode = 1; });
