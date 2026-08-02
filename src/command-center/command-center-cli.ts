#!/usr/bin/env node

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import {
  chmod,
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AdminSecurityError,
  createAdminSecurityProfile,
  type ReadyAdminSecurityProfile,
} from "../admin-security/admin-security-contracts.js";
import {
  AdminSecurityService,
  type FounderBootstrapSecret,
} from "../admin-security/admin-security-service.js";
import { FileAdminSecurityRepository } from "../admin-security/file-admin-security-repository.js";
import { RedactingJsonLogger } from "../admin-security/redacting-json-logger.js";
import { MAX_LOCAL_CLI_CONFIG_BYTES, type LocalCliConfig } from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { OperationsControlService } from "../operations-control/operations-control-service.js";
import { OracleCreativePromptService } from "../oracle-creative/oracle-creative-prompt-service.js";
import { OperationsRuntimeControlService } from "../operations-runtime/operations-runtime-control-service.js";
import { SupervisedProcessLock } from "../operations-runtime/supervised-process-lock.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SqliteReferenceVaultTransactionRunner } from "../persistence/sqlite/sqlite-reference-vault-transaction-runner.js";
import { SqliteVentureHoldingTransactionRunner } from "../persistence/sqlite/sqlite-venture-holding-transaction-runner.js";
import { ProductionDiagnosticsService } from "../production/production-diagnostics.js";
import { ensureProductionSafetyState } from "../production/production-safety-state.js";
import { ReferenceVaultQueryAgent } from "../reference-vault/reference-vault-query-agent.js";
import { createLocalWorkflowCommandBoundary } from "../runtime/create-local-workflow-command-boundary.js";
import { CommandCenterActionService } from "./command-center-action-service.js";
import { RepositoryBackedCommandCenterEventSource } from "./command-center-event-source.js";
import { CommandCenterQueryService } from "./command-center-query-service.js";
import { PrivateCommandCenterServer, type StartedCommandCenter } from "./command-center-server.js";
import { FileSocialVisualApprovalGate } from "./visual-approval-gate.js";
import { ReferenceVaultCommandCenterQuery } from "./reference-vault-query.js";
import { RepositoryBackedCommandCenterVentureQuery } from "./repository-backed-venture-query.js";

export interface StartedCommandCenterRuntime extends StartedCommandCenter {
  readonly bootstrapPath: string;
  readonly lockPath: string;
}

export interface CommandCenterRuntimeAdminSecurityOptions {
  readonly bootstrapPath?: string;
  readonly sourceKeyPepperPath?: string;
  readonly statePath?: string;
}

export interface CommandCenterRuntimeOptions {
  readonly adminSecurity?: CommandCenterRuntimeAdminSecurityOptions;
  readonly externalOrigin?: string;
  readonly host?: "127.0.0.1";
  readonly port?: number;
}

export interface CommandCenterCliArguments extends CommandCenterRuntimeOptions {
  readonly configPath: string;
}

export const DEFAULT_ADMIN_SOURCE_KEY_PEPPER_PATH =
  "/run/secrets/onlyway/admin-source-key-pepper";
export const DEFAULT_ADMIN_SECURITY_STATE_PATH =
  "/var/lib/onlyway-admin/admin-security.json";
export const DEFAULT_FOUNDER_BOOTSTRAP_PATH =
  "/run/secrets/onlyway-bootstrap/founder-bootstrap.json";

export async function runCommandCenterCli(arguments_: readonly string[]): Promise<void> {
  process.umask(0o077);
  const parsed = parseCommandCenterArguments(arguments_);
  const runtime = await startCommandCenterRuntime(
    parsed.configPath,
    parsed,
  );
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

export async function startCommandCenterRuntime(
  configPath: string,
  options: CommandCenterRuntimeOptions = {},
): Promise<StartedCommandCenterRuntime> {
  const config = parseConfig(await readBoundedFile(configPath));
  const paths = resolveCommandCenterRuntimePaths(
    config.runtime.sqlite.path,
    options,
  );
  const lock = await SupervisedProcessLock.acquire({ instanceId: `command-center-${randomUUID()}`, path: paths.lockPath, role: "api" });
  let repositories: SqliteRepositoryTransactionRunner | undefined;
  let referenceVaultRepositories: SqliteReferenceVaultTransactionRunner | undefined;
  let ventureRepositories: SqliteVentureHoldingTransactionRunner | undefined;
  let started: StartedCommandCenter | undefined;
  let adminSecurityRuntime: PreparedCommandCenterAdminSecurity | undefined;
  try {
    repositories = new SqliteRepositoryTransactionRunner(config.runtime.sqlite);
    referenceVaultRepositories = new SqliteReferenceVaultTransactionRunner(config.runtime.sqlite);
    ventureRepositories = new SqliteVentureHoldingTransactionRunner(config.runtime.sqlite);
    if (options.externalOrigin !== undefined) {
      await ensureProductionSafetyState({
        actorId: config.runtime.actorId,
        clock: systemClock,
        repositories,
        workspaceId: config.runtime.workspaceId,
      });
    }
    const diagnostics = new ProductionDiagnosticsService({
      clock: systemClock,
      databasePath: config.runtime.sqlite.path,
      ...(process.env.ONLYWAY_RELEASE_COMMIT === undefined
        ? {}
        : { releaseCommit: process.env.ONLYWAY_RELEASE_COMMIT }),
      repositories,
      runtime: config.runtime,
      secretAvailable: providerSecretAvailable,
    });
    const referenceVault = new ReferenceVaultQueryAgent({
      actorId: config.runtime.actorId,
      clock: systemClock,
      repositories: referenceVaultRepositories,
      workspaceId: config.runtime.workspaceId,
    });
    const commands = createLocalWorkflowCommandBoundary({
      actorId: config.runtime.actorId,
      clock: systemClock,
      referenceVault,
      repositories,
      workspaceId: config.runtime.workspaceId,
    });
    adminSecurityRuntime = await prepareCommandCenterAdminSecurity(
      options,
      paths,
    );
    const server = new PrivateCommandCenterServer({
      ...(adminSecurityRuntime === undefined
        ? {}
        : {
            adminSecurity: {
              cookieName: adminSecurityRuntime.profile.cookieName,
              onFounderRegistered: async () => {
                if (started === undefined) {
                  throw new Error(
                    "Il bootstrap Founder non può essere chiuso prima dell'avvio",
                  );
                }
                await removeOwnedAdminBootstrapFile(
                  paths.bootstrapPath,
                  started.accessUrl,
                );
              },
              service: adminSecurityRuntime.service,
            },
          }),
      actionService: new CommandCenterActionService({
        actorId: config.runtime.actorId,
        commands,
        contentApprovalGate: new FileSocialVisualApprovalGate(),
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      oracleCreativePromptService: new OracleCreativePromptService({
        actorId: config.runtime.actorId,
        clock: systemClock,
        commands,
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      eventPlane: {
        source: new RepositoryBackedCommandCenterEventSource(
          repositories,
          config.runtime.workspaceId,
        ),
      },
      diagnostics,
      ...(options.externalOrigin === undefined
        ? {}
        : { externalOrigin: options.externalOrigin }),
      ...(options.host === undefined ? {} : { host: options.host }),
      operationsControlService: new OperationsControlService({
        actorId: config.runtime.actorId,
        clock: systemClock,
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      operationsRuntimeControlService: new OperationsRuntimeControlService({
        clock: systemClock,
        repositories,
        workspaceId: config.runtime.workspaceId,
      }),
      ...(options.port === undefined ? {} : { port: options.port }),
      queryService: new CommandCenterQueryService({
        actorId: config.runtime.actorId,
        referenceVault: new ReferenceVaultCommandCenterQuery({
          actorId: config.runtime.actorId,
          clock: systemClock,
          repositories: referenceVaultRepositories,
          workspaceId: config.runtime.workspaceId,
        }),
        repositories,
        venture: new RepositoryBackedCommandCenterVentureQuery({
          actorId: config.runtime.actorId,
          repositories: ventureRepositories,
          workspaceId: config.runtime.workspaceId,
        }),
        workspaceId: config.runtime.workspaceId,
      }),
    });
    started = await server.start();
    if (adminSecurityRuntime === undefined) {
      await writeBootstrapFile(paths.bootstrapPath, started.accessUrl);
    } else if (adminSecurityRuntime.bootstrapSecret !== undefined) {
      await writeAdminBootstrapFile(
        paths.bootstrapPath,
        started.accessUrl,
        adminSecurityRuntime.bootstrapSecret,
      );
    } else {
      await removeCompletedAdminBootstrapFile(paths.bootstrapPath);
    }
  } catch (error) {
    await Promise.allSettled([
      started === undefined || adminSecurityRuntime !== undefined
        ? Promise.resolve()
        : removeOwnedBootstrapFile(paths.bootstrapPath, started.accessUrl),
      started?.close(),
      referenceVaultRepositories?.close(),
      ventureRepositories?.close(),
      repositories?.close(),
      lock.close(),
    ]);
    throw error;
  }
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= closeRuntime(
      started,
      repositories,
      referenceVaultRepositories,
      ventureRepositories,
      lock,
      paths.bootstrapPath,
      adminSecurityRuntime !== undefined,
    );
    return closePromise;
  };
  return Object.freeze({ ...started, bootstrapPath: paths.bootstrapPath, close, lockPath: paths.lockPath });
}

export function commandCenterRuntimePaths(sqlitePath: string): Readonly<{
  readonly adminSecurityStatePath: string;
  readonly bootstrapPath: string;
  readonly lockPath: string;
}> {
  const databasePath = resolve(sqlitePath);
  return Object.freeze({
    adminSecurityStatePath: `${databasePath}.admin-security.json`,
    bootstrapPath: `${databasePath}.command-center-bootstrap.json`,
    lockPath: `${databasePath}.command-center.lock`,
  });
}

function resolveCommandCenterRuntimePaths(
  sqlitePath: string,
  options: CommandCenterRuntimeOptions,
): ReturnType<typeof commandCenterRuntimePaths> {
  const legacy = commandCenterRuntimePaths(sqlitePath);
  if (
    options.adminSecurity === undefined &&
    options.externalOrigin === undefined
  ) {
    return legacy;
  }
  const statePath = requiredAbsoluteProductionPath(
    options.adminSecurity?.statePath ??
      nonEmptyEnvironmentPath("ONLYWAY_ADMIN_SECURITY_STATE_PATH") ??
      DEFAULT_ADMIN_SECURITY_STATE_PATH,
    "Admin Security state",
  );
  const bootstrapPath = requiredAbsoluteProductionPath(
    options.adminSecurity?.bootstrapPath ??
      nonEmptyEnvironmentPath("ONLYWAY_FOUNDER_BOOTSTRAP_PATH") ??
      DEFAULT_FOUNDER_BOOTSTRAP_PATH,
    "Founder bootstrap",
  );
  return Object.freeze({
    adminSecurityStatePath: statePath,
    bootstrapPath,
    lockPath: legacy.lockPath,
  });
}

function nonEmptyEnvironmentPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function requiredAbsoluteProductionPath(
  value: string,
  label: string,
): string {
  if (!isAbsolute(value)) {
    throw new AdminSecurityError(
      "CONFIGURATION_REQUIRED",
      `${label} path must be absolute.`,
    );
  }
  return resolve(value);
}

export function commandCenterReadinessLine(
  runtime: Pick<StartedCommandCenterRuntime, "accessUrl" | "address">,
): string {
  const origin = new URL(runtime.accessUrl).origin;
  return `Centro di Comando Onlyway: READY su ${origin}/; accesso bootstrap disponibile nel canale locale owner-only.\n`;
}

const systemClock = Object.freeze({ now: () => new Date() });
const OPENAI_SECRET_REFERENCE_PATH =
  "/run/secrets/onlyway/openai-api-key";

function providerSecretAvailable(): boolean {
  if (
    typeof process.env.MV_AI_OS_OPENAI_API_KEY === "string" &&
    process.env.MV_AI_OS_OPENAI_API_KEY.trim().length > 0
  ) {
    return true;
  }
  try {
    lstatSync(OPENAI_SECRET_REFERENCE_PATH);
    return true;
  } catch (error) {
    return hasCode(error, "ENOENT") ? false : true;
  }
}

interface PreparedCommandCenterAdminSecurity {
  readonly bootstrapSecret?: FounderBootstrapSecret;
  readonly profile: ReadyAdminSecurityProfile;
  readonly service: AdminSecurityService;
}

export function parseCommandCenterArguments(
  arguments_: readonly string[],
): CommandCenterCliArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      value.trim().length === 0 ||
      ![
        "--admin-bootstrap",
        "--admin-pepper",
        "--admin-state",
        "--config",
        "--external-origin",
        "--host",
        "--port",
      ].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Uso: mv-ai-os-command-center --config <percorso> [--host 127.0.0.1] [--port <1-65535>] [--external-origin <origine>] [--admin-state <percorso assoluto>] [--admin-bootstrap <percorso assoluto>] [--admin-pepper <percorso assoluto>]",
      );
    }
    values.set(flag, value);
  }
  const configPath = values.get("--config");
  if (configPath === undefined) {
    throw new Error(
      "È richiesto il percorso della configurazione del Centro di Comando",
    );
  }
  const host = values.get("--host");
  if (host !== undefined && host !== "127.0.0.1") {
    throw new Error(
      "Il Centro di Comando accetta solo --host 127.0.0.1",
    );
  }
  const portValue = values.get("--port");
  const port =
    portValue === undefined || !/^[1-9]\d{0,4}$/u.test(portValue)
      ? undefined
      : Number(portValue);
  if (
    portValue !== undefined &&
    (port === undefined || !Number.isSafeInteger(port) || port > 65_535)
  ) {
    throw new Error("--port deve essere un intero tra 1 e 65535");
  }
  const externalOrigin = values.get("--external-origin");
  const adminStatePath = values.get("--admin-state");
  const adminBootstrapPath = values.get("--admin-bootstrap");
  const adminPepperPath = values.get("--admin-pepper");
  const adminSecurity =
    adminStatePath === undefined &&
    adminBootstrapPath === undefined &&
    adminPepperPath === undefined
      ? undefined
      : Object.freeze({
          ...(adminBootstrapPath === undefined
            ? {}
            : {
                bootstrapPath: requiredAbsoluteProductionPath(
                  adminBootstrapPath,
                  "Founder bootstrap",
                ),
              }),
          ...(adminPepperPath === undefined
            ? {}
            : {
                sourceKeyPepperPath: requiredAbsoluteProductionPath(
                  adminPepperPath,
                  "Admin source-key pepper",
                ),
              }),
          ...(adminStatePath === undefined
            ? {}
            : {
                statePath: requiredAbsoluteProductionPath(
                  adminStatePath,
                  "Admin Security state",
                ),
              }),
        });
  return Object.freeze({
    ...(adminSecurity === undefined ? {} : { adminSecurity }),
    configPath,
    ...(externalOrigin === undefined ? {} : { externalOrigin }),
    ...(host === undefined ? {} : { host }),
    ...(port === undefined ? {} : { port }),
  });
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

async function prepareCommandCenterAdminSecurity(
  options: CommandCenterRuntimeOptions,
  paths: ReturnType<typeof commandCenterRuntimePaths>,
): Promise<PreparedCommandCenterAdminSecurity | undefined> {
  const enabled =
    options.adminSecurity !== undefined || options.externalOrigin !== undefined;
  if (!enabled) return undefined;
  const externalOrigin = options.externalOrigin;
  if (externalOrigin === undefined) {
    throw new AdminSecurityError(
      "CONFIGURATION_REQUIRED",
      "Admin Security requires an explicit external origin.",
    );
  }
  const origin = new URL(externalOrigin);
  const privateTunnel =
    origin.hostname === "localhost" ||
    origin.hostname === "127.0.0.1" ||
    origin.hostname === "::1";
  const profile = createAdminSecurityProfile({
    mode: privateTunnel ? "PRIVATE_TUNNEL" : "PRODUCTION_DOMAIN",
    origin: origin.origin,
    relyingPartyId: origin.hostname,
  });
  if (profile.readiness !== "READY") {
    throw new AdminSecurityError(
      "CONFIGURATION_REQUIRED",
      "Admin Security origin and relying-party configuration is incomplete.",
    );
  }
  const pepper = await readAdminSourceKeyPepper(
    requiredAbsoluteProductionPath(
      options.adminSecurity?.sourceKeyPepperPath ??
        nonEmptyEnvironmentPath("ONLYWAY_ADMIN_SOURCE_KEY_PEPPER_PATH") ??
        DEFAULT_ADMIN_SOURCE_KEY_PEPPER_PATH,
      "Admin source-key pepper",
    ),
  );
  const repository = new FileAdminSecurityRepository({
    path: paths.adminSecurityStatePath,
  });
  const service = new AdminSecurityService({
    logger: new RedactingJsonLogger(),
    profile,
    repository,
    sourceKeyPepper: pepper,
  });
  const state = await repository.read();
  if (
    state.principals.some(
      (principal) =>
        principal.principalId === "founder" &&
        principal.status === "ACTIVE",
    )
  ) {
    return Object.freeze({ profile, service });
  }
  const activeBootstrap =
    state.bootstrap !== null &&
    state.bootstrap.consumedAt === null &&
    Date.parse(state.bootstrap.expiresAt) > Date.now()
      ? state.bootstrap
      : undefined;
  const bootstrapSecret =
    activeBootstrap === undefined
      ? await service.createFounderBootstrap({
          connectionAddress: "127.0.0.1",
          origin: profile.origin,
          sourceKey: "command-center-runtime-bootstrap",
        })
      : await readReusableAdminBootstrapFile(
          paths.bootstrapPath,
          `${profile.origin}/admin-auth`,
          activeBootstrap.tokenHash,
          activeBootstrap.expiresAt,
        );
  return Object.freeze({ bootstrapSecret, profile, service });
}

async function readAdminSourceKeyPepper(path: string): Promise<Uint8Array> {
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" &&
      metadata.uid !== process.getuid()) ||
    metadata.size < 32 ||
    metadata.size > 4_096
  ) {
    throw new AdminSecurityError(
      "CONFIGURATION_REQUIRED",
      "Admin source-key pepper file permissions or size are invalid.",
    );
  }
  const pepper = await readFile(path);
  if (pepper.byteLength < 32 || pepper.byteLength > 4_096) {
    throw new AdminSecurityError(
      "CONFIGURATION_REQUIRED",
      "Admin source-key pepper is not available.",
    );
  }
  return new Uint8Array(pepper);
}

async function readReusableAdminBootstrapFile(
  path: string,
  accessUrl: string,
  expectedTokenHash: string,
  expectedExpiresAt: string,
): Promise<FounderBootstrapSecret> {
  let document: unknown;
  try {
    document = JSON.parse(await readOwnerOnlyFile(path, 16_384)) as unknown;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      throw new AdminSecurityError(
        "BOOTSTRAP_INVALID",
        "An active Founder bootstrap exists but its owner-only channel is unavailable.",
      );
    }
    throw error;
  }
  if (
    !record(document) ||
    document.authentication !== "PASSKEY" ||
    document.accessUrl !== accessUrl ||
    document.expiresAt !== expectedExpiresAt ||
    typeof document.bootstrapToken !== "string"
  ) {
    throw new AdminSecurityError(
      "BOOTSTRAP_INVALID",
      "The owner-only Founder bootstrap channel is invalid.",
    );
  }
  const actualHash = createHash("sha256")
    .update(document.bootstrapToken, "utf8")
    .digest("hex");
  if (!sameHash(actualHash, expectedTokenHash)) {
    throw new AdminSecurityError(
      "BOOTSTRAP_INVALID",
      "The owner-only Founder bootstrap channel does not match durable state.",
    );
  }
  return Object.freeze({
    bootstrapToken: document.bootstrapToken,
    expiresAt: expectedExpiresAt,
  });
}

async function readOwnerOnlyFile(
  path: string,
  maxBytes: number,
): Promise<string> {
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" &&
      metadata.uid !== process.getuid()) ||
    metadata.size > maxBytes
  ) {
    throw new AdminSecurityError(
      "REPOSITORY_INVALID",
      "Owner-only bootstrap channel permissions are invalid.",
    );
  }
  return readFile(path, "utf8");
}

function sameHash(left: string, right: string): boolean {
  if (
    !/^[a-f0-9]{64}$/u.test(left) ||
    !/^[a-f0-9]{64}$/u.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
}

async function closeRuntime(started: StartedCommandCenter, repositories: SqliteRepositoryTransactionRunner, referenceVaultRepositories: SqliteReferenceVaultTransactionRunner, ventureRepositories: SqliteVentureHoldingTransactionRunner, lock: SupervisedProcessLock, bootstrapPath: string, preservePasskeyBootstrap: boolean): Promise<void> {
  const failures: unknown[] = [];
  if (!preservePasskeyBootstrap) {
    try { await removeOwnedBootstrapFile(bootstrapPath, started.accessUrl); } catch (error) { failures.push(error); }
  }
  try { await started.close(); } catch (error) { failures.push(error); }
  try { await referenceVaultRepositories.close(); } catch (error) { failures.push(error); }
  try { await ventureRepositories.close(); } catch (error) { failures.push(error); }
  try { await repositories.close(); } catch (error) { failures.push(error); }
  try { await lock.close(); } catch (error) { failures.push(error); }
  if (failures.length > 0) throw new Error("Arresto del Centro di Comando non riuscito");
}

async function writeAdminBootstrapFile(
  path: string,
  accessUrl: string,
  secret: FounderBootstrapSecret,
): Promise<void> {
  const temporary = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try {
      await handle.writeFile(
        `${JSON.stringify({
          accessUrl,
          authentication: "PASSKEY",
          bootstrapToken: secret.bootstrapToken,
          contractVersion: "1",
          createdAt: new Date().toISOString(),
          expiresAt: secret.expiresAt,
          pid: process.pid,
        })}\n`,
        "utf8",
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    created = false;
    await chmod(path, 0o600);
  } finally {
    if (created) await unlink(temporary).catch(() => undefined);
  }
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

async function removeOwnedAdminBootstrapFile(
  path: string,
  accessUrl: string,
): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(await readOwnerOnlyFile(path, 16_384)) as unknown;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  if (
    !record(value) ||
    value.accessUrl !== accessUrl ||
    value.authentication !== "PASSKEY" ||
    value.pid !== process.pid
  ) {
    throw new Error(
      "Il canale bootstrap Founder non appartiene al processo corrente",
    );
  }
  await unlink(path);
}

async function removeCompletedAdminBootstrapFile(path: string): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(await readOwnerOnlyFile(path, 16_384)) as unknown;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  if (record(value) && value.authentication === "PASSKEY") {
    await unlink(path);
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
