#!/usr/bin/env node

import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import {
  constants as filesystemConstants,
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  lstat,
  open,
} from "node:fs/promises";
import {
  isAbsolute,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_LOCAL_CLI_CONFIG_BYTES,
  type LocalCliConfig,
} from "../cli/local-cli-config.js";
import { LocalCliConfigValidator } from "../cli/local-cli-config-validator.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalWorkflowCommandBoundary } from "../runtime/create-local-workflow-command-boundary.js";
import {
  runOfflineProductionRehearsal,
  type OfflineProductionRehearsalConfig,
} from "./offline-production-rehearsal.js";
import {
  evaluatePaymentReadiness,
} from "./payment-readiness.js";
import { ProductionDiagnosticsService } from "./production-diagnostics.js";
import {
  evaluateSecurityReadiness,
} from "./security-readiness.js";
import {
  MAX_PRIVATE_PRODUCTION_INTAKE_BYTES,
  PrivateProductionStartService,
} from "./private-production-start.js";

export type ProductionClosureAction =
  | "payment-readiness"
  | "private-production-start"
  | "readiness"
  | "rehearsal"
  | "security-readiness";

export interface ProductionClosureCommandResult {
  readonly contractVersion: "1";
  readonly kind: string;
  readonly status: "NOT_READY" | "READY";
  readonly [key: string]: unknown;
}

const MAX_ATTESTATION_BYTES = 65_536;
const MAX_ACCEPTANCE_PUBLIC_KEY_BYTES = 4_096;
const ED25519_SIGNATURE_BYTES = 64;
const MAX_REHEARSAL_RECEIPT_BYTES = 1_048_576;
const RELEASE_ACCEPTANCE_PUBLIC_KEY_PATH =
  "/run/onlyway/release-acceptance-ed25519.pub.pem";

interface ReleaseAcceptanceTrustAnchor {
  readonly expectedOwnerUid: number;
  readonly publicKeyPath: string;
}

export interface ProductionClosureTestTrustAnchor {
  readonly expectedOwnerUid: number;
  readonly publicKeyPath: string;
}

const PRODUCTION_TRUST_ANCHOR = Object.freeze({
  expectedOwnerUid: 0,
  publicKeyPath: RELEASE_ACCEPTANCE_PUBLIC_KEY_PATH,
} satisfies ReleaseAcceptanceTrustAnchor);

export async function runProductionClosureCli(
  arguments_: readonly string[],
): Promise<void> {
  process.umask(0o077);
  const result = await executeProductionClosureCommand(arguments_);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "READY") process.exitCode = 1;
}

export async function executeProductionClosureCommand(
  arguments_: readonly string[],
): Promise<ProductionClosureCommandResult> {
  return executeProductionClosureCommandWithTrust(
    arguments_,
    PRODUCTION_TRUST_ANCHOR,
  );
}

export async function executeProductionClosureCommandForTest(
  arguments_: readonly string[],
  trustAnchor: ProductionClosureTestTrustAnchor,
): Promise<ProductionClosureCommandResult> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Production Closure test trust override is unavailable",
    );
  }
  if (
    !Number.isSafeInteger(trustAnchor.expectedOwnerUid) ||
    trustAnchor.expectedOwnerUid < 0 ||
    !isAbsolute(trustAnchor.publicKeyPath)
  ) {
    throw new Error("Production Closure test trust override is invalid");
  }
  return executeProductionClosureCommandWithTrust(
    arguments_,
    trustAnchor,
  );
}

async function executeProductionClosureCommandWithTrust(
  arguments_: readonly string[],
  trustAnchor: ReleaseAcceptanceTrustAnchor,
): Promise<ProductionClosureCommandResult> {
  const action = arguments_[0];
  if (
    action !== "rehearsal" &&
    action !== "readiness" &&
    action !== "private-production-start" &&
    action !== "security-readiness" &&
    action !== "payment-readiness"
  ) {
    throw new Error("Production Closure action is invalid");
  }
  const flags = parseFlags(arguments_.slice(1));
  if (action === "rehearsal") return executeRehearsal(flags);
  if (action === "private-production-start") {
    return executePrivateProductionStart(flags);
  }
  if (action === "security-readiness") {
    return executeSecurityReadiness(flags, trustAnchor);
  }
  if (action === "payment-readiness") {
    return executePaymentReadiness(flags, trustAnchor);
  }
  assertOnlyFlags(flags, new Set(["--config"]));
  const config = await loadCliConfig(requiredFlag(flags, "--config"));
  return runtimeReadiness(config);
}

async function executePrivateProductionStart(
  flags: ReadonlyMap<string, string>,
): Promise<ProductionClosureCommandResult> {
  assertOnlyFlags(flags, new Set(["--config", "--intake"]));
  const [config, intake] = await Promise.all([
    loadCliConfig(requiredFlag(flags, "--config")),
    readBoundedJson(
      requiredFlag(flags, "--intake"),
      MAX_PRIVATE_PRODUCTION_INTAKE_BYTES,
    ),
  ]);
  const repositories = new SqliteRepositoryTransactionRunner(
    config.runtime.sqlite,
  );
  try {
    const commands = createLocalWorkflowCommandBoundary({
      actorId: config.runtime.actorId,
      clock: systemClock,
      repositories,
      workspaceId: config.runtime.workspaceId,
    });
    return await new PrivateProductionStartService({
      actorId: config.runtime.actorId,
      commands,
      repositories,
      workspaceId: config.runtime.workspaceId,
    }).run(intake);
  } finally {
    await repositories.close();
  }
}

async function executeRehearsal(
  flags: ReadonlyMap<string, string>,
): Promise<ProductionClosureCommandResult> {
  assertOnlyFlags(
    flags,
    new Set([
      "--backup",
      "--database",
      "--receipt",
      "--restore",
      "--run-id",
      "--started-at",
    ]),
  );
  const startedAt = flags.get("--started-at") ?? new Date().toISOString();
  const runId = flags.get("--run-id") ?? defaultRunId(startedAt);
  const config: OfflineProductionRehearsalConfig = {
    backupPath: requiredFlag(flags, "--backup"),
    databasePath: requiredFlag(flags, "--database"),
    receiptPath: requiredFlag(flags, "--receipt"),
    restoredDatabasePath: requiredFlag(flags, "--restore"),
    runId,
    startedAt,
  };
  const receipt = await runOfflineProductionRehearsal(config);
  return Object.freeze({
    backupFingerprint: receipt.backup.contentFingerprint,
    contractVersion: "1",
    kind: "PRODUCTION_REHEARSAL",
    providerMode: receipt.providerMode,
    receiptFingerprint: receipt.receiptFingerprint,
    recoveryVerified: receipt.recovery.fullDatabaseReopenVerified,
    status: "READY",
    unauthorizedExternalEffectOccurred:
      receipt.externalEffectsExecuted,
  });
}

async function runtimeReadiness(
  config: LocalCliConfig,
): Promise<ProductionClosureCommandResult> {
  const repositories = new SqliteRepositoryTransactionRunner(
    config.runtime.sqlite,
  );
  try {
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
    const report = await diagnostics.readiness();
    return Object.freeze({
      ...report,
      kind: "PRODUCTION_READINESS",
    });
  } finally {
    await repositories.close();
  }
}

async function executePaymentReadiness(
  flags: ReadonlyMap<string, string>,
  trustAnchor: ReleaseAcceptanceTrustAnchor,
): Promise<ProductionClosureCommandResult> {
  assertOnlyFlags(
    flags,
    new Set([
      "--config",
      "--deployment-attestation",
      "--rehearsal-receipt",
    ]),
  );
  const [config, rehearsalReceipt, deploymentAttestation] = await Promise.all([
    loadCliConfig(requiredFlag(flags, "--config")),
    readBoundedJson(
      requiredFlag(flags, "--rehearsal-receipt"),
      MAX_REHEARSAL_RECEIPT_BYTES,
    ),
    readVerifiedReleaseAcceptanceJson(
      requiredFlag(flags, "--deployment-attestation"),
      MAX_ATTESTATION_BYTES,
      trustAnchor,
    ),
  ]);
  const repositories = new SqliteRepositoryTransactionRunner(
    config.runtime.sqlite,
  );
  try {
    const publicationKillSwitchEnabled = await repositories.transaction(
      async ({ operationalPlanes }) =>
        (await operationalPlanes.getPublicationKillSwitch(
          config.runtime.workspaceId,
        ))?.enabled,
    );
    return Object.freeze({
      ...evaluatePaymentReadiness({
        config,
        deploymentAttestation: deploymentAttestation.value,
        deploymentAttestationSignatureVerified: true,
        now: systemClock.now(),
        providerSecretConfigured: providerSecretAvailable(),
        publicationKillSwitchEnabled:
          publicationKillSwitchEnabled === true,
        rehearsalReceipt,
      }),
    });
  } finally {
    await repositories.close();
  }
}

async function executeSecurityReadiness(
  flags: ReadonlyMap<string, string>,
  trustAnchor: ReleaseAcceptanceTrustAnchor,
): Promise<ProductionClosureCommandResult> {
  assertOnlyFlags(flags, new Set(["--attestation"]));
  const candidate = await readVerifiedReleaseAcceptanceJson(
    requiredFlag(flags, "--attestation"),
    MAX_ATTESTATION_BYTES,
    trustAnchor,
  );
  return Object.freeze({
    ...evaluateSecurityReadiness(candidate.value, {
      attestationSignatureVerified: true,
    }),
  });
}

async function loadCliConfig(path: string): Promise<LocalCliConfig> {
  const candidate = await readBoundedJson(path, MAX_LOCAL_CLI_CONFIG_BYTES);
  const validation = new LocalCliConfigValidator().validate(candidate);
  if (!validation.ok) {
    throw new Error("Production Closure configuration is invalid");
  }
  return validation.value;
}

async function readBoundedJson(path: string, maximumBytes: number) {
  const bytes = await readBoundedSecureFile(path, maximumBytes);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error("Production Closure input must be valid UTF-8 JSON");
  }
}

async function readVerifiedReleaseAcceptanceJson(
  path: string,
  maximumBytes: number,
  trustAnchor: ReleaseAcceptanceTrustAnchor,
): Promise<Readonly<{ readonly value: unknown }>> {
  const attestation = await readBoundedSecureFile(path, maximumBytes);
  const [signature, publicKeyBytes] = await Promise.all([
    readBoundedSecureFile(
      `${path}.sig`,
      ED25519_SIGNATURE_BYTES,
      ED25519_SIGNATURE_BYTES,
    ),
    readBoundedSecureFile(
      trustAnchor.publicKeyPath,
      MAX_ACCEPTANCE_PUBLIC_KEY_BYTES,
      undefined,
      trustAnchor.expectedOwnerUid,
      0o644,
    ),
  ]);
  let publicKey;
  try {
    publicKey = createPublicKey({
      format: "pem",
      key: publicKeyBytes,
      type: "spki",
    });
  } catch {
    throw new Error(
      "Production Closure release-acceptance trust anchor is invalid",
    );
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !verifySignature(null, attestation, publicKey, signature)
  ) {
    throw new Error(
      "Production Closure signed attestation failed verification",
    );
  }
  try {
    return Object.freeze({
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(attestation),
      ) as unknown,
    });
  } catch {
    throw new Error("Production Closure input must be valid UTF-8 JSON");
  }
}

async function readBoundedSecureFile(
  path: string,
  maximumBytes: number,
  exactBytes?: number,
  expectedOwnerUid?: number,
  expectedMode?: number,
): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(
      "Production Closure input must be a regular non-symlink file",
    );
  }
  if (
    before.size <= 0 ||
    before.size > maximumBytes ||
    (exactBytes !== undefined && before.size !== exactBytes)
  ) {
    throw new Error("Production Closure input exceeds its bounded size");
  }
  const permissions = before.mode & 0o777;
  if (
    (permissions & 0o022) !== 0 ||
    (expectedOwnerUid !== undefined && before.uid !== expectedOwnerUid) ||
    (expectedMode !== undefined && permissions !== expectedMode)
  ) {
    throw new Error("Production Closure input metadata is unsafe");
  }
  const handle = await open(
    path,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.uid !== before.uid ||
      opened.gid !== before.gid ||
      opened.mode !== before.mode
    ) {
      throw new Error("Production Closure input identity changed");
    }
    const buffer = Buffer.alloc(maximumBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.byteLength) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.byteLength - bytesRead,
        bytesRead,
      );
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    const after = await handle.stat();
    if (
      bytesRead <= 0 ||
      bytesRead > maximumBytes ||
      bytesRead !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.uid !== before.uid ||
      after.gid !== before.gid ||
      after.mode !== before.mode
    ) {
      throw new Error("Production Closure input exceeds its bounded size");
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function parseFlags(arguments_: readonly string[]): ReadonlyMap<string, string> {
  if (arguments_.length % 2 !== 0) {
    throw new Error("Production Closure flags require values");
  }
  const result = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      flag === undefined ||
      !/^--[a-z][a-z-]*$/u.test(flag) ||
      value === undefined ||
      value.trim().length === 0 ||
      result.has(flag)
    ) {
      throw new Error("Production Closure flags are invalid");
    }
    result.set(flag, value);
  }
  return result;
}

function assertOnlyFlags(
  flags: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string>,
): void {
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) {
      throw new Error("Production Closure flag is not supported");
    }
  }
}

function requiredFlag(
  flags: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = flags.get(name);
  if (value === undefined) {
    throw new Error("Production Closure required flag is missing");
  }
  return value;
}

function providerSecretAvailable(): boolean {
  if (
    typeof process.env.MV_AI_OS_OPENAI_API_KEY === "string" &&
    process.env.MV_AI_OS_OPENAI_API_KEY.trim().length > 0
  ) {
    return true;
  }
  try {
    lstatSync("/run/secrets/onlyway/openai-api-key");
    return true;
  } catch (error) {
    return hasCode(error, "ENOENT") ? false : true;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function defaultRunId(timestamp: string): string {
  return `rehearsal-${timestamp.replace(/\D/gu, "").slice(0, 14)}`;
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined &&
    realpathSync(fileURLToPath(import.meta.url)) === resolve(entryPath);
}

const systemClock = Object.freeze({ now: () => new Date() });

if (isMainModule()) {
  void runProductionClosureCli(process.argv.slice(2)).catch(() => {
    process.stderr.write(`${JSON.stringify({
      contractVersion: "1",
      reasonCode: "PRODUCTION_CLOSURE_COMMAND_FAILED",
      status: "ERROR",
    })}\n`);
    process.exitCode = 1;
  });
}
