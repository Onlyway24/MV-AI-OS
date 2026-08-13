import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { isAbsolute, basename, dirname, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { RepositoryConflictError } from "../errors/core-error.js";
import { SupervisedProcessLock } from "../operations-runtime/supervised-process-lock.js";
import {
  ADMIN_CAPABILITIES,
  ADMIN_ROLES,
  ADMIN_SECURITY_CONTRACT_VERSION,
  ADMIN_SECURITY_EVENT_TYPES,
  ADMIN_SECURITY_STATE_VERSION,
  SERVICE_PRINCIPAL_PROFILES,
  AdminSecurityError,
  emptyAdminSecurityState,
  type AdminChallengeKind,
  type AdminRateLimitScope,
  type AdminRole,
  type AdminSecurityState,
} from "./admin-security-contracts.js";
import type { AdminSecurityRepository } from "./admin-security-repository.js";

const MAX_STATE_BYTES = 5 * 1024 * 1024;
const LOCK_RETRY_LIMIT = 100;
const LOCK_RETRY_MS = 10;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_COMMAND_LENGTH = 512;

const CHALLENGE_KINDS = Object.freeze([
  "AUTHENTICATION",
  "FOUNDER_REGISTRATION",
  "STEP_UP",
] as const satisfies readonly AdminChallengeKind[]);
const RATE_LIMIT_SCOPES = Object.freeze([
  "AUTHENTICATION",
  "BOOTSTRAP",
  "REGISTRATION",
  "STEP_UP",
] as const satisfies readonly AdminRateLimitScope[]);
const EVENT_OUTCOMES = Object.freeze(["DENIED", "SUCCEEDED"] as const);
const PRINCIPAL_STATUSES = Object.freeze(["ACTIVE", "DISABLED"] as const);
const DEVICE_TYPES = Object.freeze(["multiDevice", "singleDevice"] as const);

export interface FileAdminSecurityRepositoryOptions {
  readonly lockRetryLimit?: number;
  readonly lockRetryMs?: number;
  readonly path: string;
}

export class FileAdminSecurityRepository
implements AdminSecurityRepository {
  readonly #lockRetryLimit: number;
  readonly #lockRetryMs: number;
  readonly #path: string;

  public constructor(options: FileAdminSecurityRepositoryOptions) {
    if (!isAbsolute(options.path)) {
      throw new AdminSecurityError(
        "REPOSITORY_INVALID",
        "Admin security state path must be absolute.",
      );
    }
    this.#path = options.path;
    this.#lockRetryLimit = options.lockRetryLimit ?? LOCK_RETRY_LIMIT;
    this.#lockRetryMs = options.lockRetryMs ?? LOCK_RETRY_MS;
  }

  public async read(): Promise<AdminSecurityState> {
    await this.#prepareDirectory();
    return this.#readUnsafe();
  }

  public async compareAndSet(
    expectedRevision: number,
    nextState: AdminSecurityState,
  ): Promise<boolean> {
    if (nextState.revision !== expectedRevision + 1) {
      throw new AdminSecurityError(
        "REPOSITORY_INVALID",
        "Admin security state revision is invalid.",
      );
    }
    validateState(nextState);
    await this.#prepareDirectory();
    const lockPath = `${this.#path}.lock`;
    const lock = await this.#acquireLock(lockPath);
    try {
      const current = await this.#readUnsafe();
      if (current.revision !== expectedRevision) return false;
      await this.#writeUnsafe(nextState);
      return true;
    } finally {
      await this.#releaseLock(lock);
    }
  }

  async #acquireLock(path: string): Promise<SupervisedProcessLock> {
    const instanceId = `admin-${randomUUID()}`;
    for (let attempt = 0; attempt < this.#lockRetryLimit; attempt += 1) {
      try {
        return await SupervisedProcessLock.acquire({
          instanceId,
          path,
          role: "admin-security",
        });
      } catch (error) {
        if (!(error instanceof RepositoryConflictError)) throw error;
        if (attempt + 1 >= this.#lockRetryLimit) break;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.#lockRetryMs);
        });
      }
    }
    throw new AdminSecurityError(
      "REPOSITORY_CONFLICT",
      "Admin security repository is busy.",
    );
  }

  async #releaseLock(lock: SupervisedProcessLock): Promise<void> {
    try {
      await lock.close();
    } catch (error) {
      if (error instanceof RepositoryConflictError) {
        throw new AdminSecurityError(
          "REPOSITORY_CONFLICT",
          "Admin security repository lock ownership changed.",
        );
      }
      throw error;
    }
  }

  async #prepareDirectory(): Promise<void> {
    const directory = dirname(this.#path);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700);
  }

  async #readUnsafe(): Promise<AdminSecurityState> {
    try {
      const metadata = await lstat(this.#path, { bigint: true });
      if (
        !metadata.isFile()
        || metadata.isSymbolicLink()
        || (metadata.mode & 0o077n) !== 0n
        || (typeof process.getuid === "function"
          && metadata.uid !== BigInt(process.getuid()))
      ) {
        throw new AdminSecurityError(
          "REPOSITORY_INVALID",
          "Admin security state permissions are unsafe.",
        );
      }
      if (metadata.size > BigInt(MAX_STATE_BYTES)) {
        throw new AdminSecurityError(
          "REPOSITORY_INVALID",
          "Admin security state exceeds its size limit.",
        );
      }
      const handle = await open(this.#path, "r");
      try {
        const openedMetadata = await handle.stat({ bigint: true });
        if (
          !openedMetadata.isFile()
          || !sameFileSnapshot(openedMetadata, metadata)
        ) {
          throw new AdminSecurityError(
            "REPOSITORY_INVALID",
            "Admin security state identity changed while being opened.",
          );
        }
        const text = await handle.readFile({ encoding: "utf8" });
        const finalMetadata = await handle.stat({ bigint: true });
        if (
          !sameFileSnapshot(finalMetadata, openedMetadata)
          || BigInt(Buffer.byteLength(text, "utf8")) !== openedMetadata.size
        ) {
          throw new AdminSecurityError(
            "REPOSITORY_INVALID",
            "Admin security state changed while being read.",
          );
        }
        const parsed: unknown = JSON.parse(text);
        return validateState(parsed);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return emptyAdminSecurityState();
      }
      if (error instanceof AdminSecurityError) throw error;
      throw new AdminSecurityError(
        "REPOSITORY_INVALID",
        "Admin security state could not be read.",
      );
    }
  }

  async #writeUnsafe(state: AdminSecurityState): Promise<void> {
    const directory = dirname(this.#path);
    const serialized = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) {
      throw new AdminSecurityError(
        "REPOSITORY_INVALID",
        "Admin security state exceeds its size limit.",
      );
    }
    const temporaryPath = join(
      directory,
      `.${basename(this.#path)}.${String(process.pid)}.${randomBytes(8).toString("hex")}.tmp`,
    );
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.chmod(0o600);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await removeTemporaryFile(temporaryPath, directory);
      throw error;
    }
    try {
      await handle.close();
    } catch (error) {
      await removeTemporaryFile(temporaryPath, directory);
      throw error;
    }
    try {
      await rename(temporaryPath, this.#path);
      await syncDirectory(directory);
    } catch (error) {
      await removeTemporaryFile(temporaryPath, directory);
      throw error;
    }
  }
}

const validateState = (value: unknown): AdminSecurityState => {
  if (!isRecord(value)) return invalidState();
  if (
    !hasOnlyKeys(value, [
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
    || !isNonNegativeInteger(value.revision)
    || !isBoundedArray(value.principals, 1_024, isPrincipal)
    || !isBoundedArray(value.credentials, 2_048, isCredential)
    || !isBoundedArray(value.challenges, 4_096, isChallenge)
    || !isBoundedArray(value.sessions, 4_096, isSession)
    || !isBoundedArray(value.stepUpReceipts, 4_096, isStepUpReceipt)
    || !isBoundedArray(value.rateLimits, 8_192, isRateLimit)
    || !isBoundedArray(value.securityEvents, 20_000, isSecurityEvent)
    || !(value.bootstrap === null || isBootstrap(value.bootstrap))
    || !hasUniqueValues(value.principals, "principalId")
    || !hasUniqueValues(value.credentials, "credentialId")
    || !hasUniqueValues(value.challenges, "flowId")
    || !hasUniqueValues(value.sessions, "sessionId")
    || !hasUniqueValues(value.stepUpReceipts, "receiptId")
    || !hasUniqueValues(value.securityEvents, "eventId")
  ) {
    invalidState();
  }
  return structuredClone(value) as unknown as AdminSecurityState;
};

const isPrincipal = (value: unknown): boolean => {
  if (
    !isRecord(value)
    || !hasOnlyKeys(
      value,
      value.kind === "SERVICE"
        ? [
          "capabilities",
          "createdAt",
          "displayName",
          "kind",
          "principalId",
          "profile",
          "roles",
          "status",
        ]
        : [
          "capabilities",
          "createdAt",
          "displayName",
          "kind",
          "principalId",
          "roles",
          "status",
        ],
    )
    || !isBoundedString(value.displayName, 1, MAX_DISPLAY_NAME_LENGTH)
    || !isSafeIdentifier(value.principalId)
    || !isTimestamp(value.createdAt)
    || !isOneOf(value.status, PRINCIPAL_STATUSES)
    || !isUniqueEnumArray(value.capabilities, ADMIN_CAPABILITIES)
  ) return false;

  if (value.kind === "SERVICE") {
    return isOneOf(value.profile, SERVICE_PRINCIPAL_PROFILES)
      && Array.isArray(value.roles)
      && value.roles.length === 1
      && value.roles[0] === "SERVICE";
  }
  return value.kind === "HUMAN"
    && isUniqueEnumArray(value.roles, ADMIN_ROLES.filter(
      (role): role is Exclude<AdminRole, "SERVICE"> => role !== "SERVICE",
    ));
};

const isCredential = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
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
  && isNonNegativeSafeInteger(value.counter)
  && isTimestamp(value.createdAt)
  && isOpaqueString(value.credentialId, 8, 2_048)
  && isOneOf(value.deviceType, DEVICE_TYPES)
  && isSafeIdentifier(value.principalId)
  && isBase64Url(value.publicKey, 16, 8_192)
  && isBoundedArray(
    value.transports,
    16,
    (transport) => isBoundedString(transport, 1, 64),
  );

const isBootstrap = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
    "consumedAt",
    "createdAt",
    "expiresAt",
    "tokenHash",
  ])
  && isNullableTimestamp(value.consumedAt)
  && isTimestamp(value.createdAt)
  && isTimestamp(value.expiresAt)
  && isSha256(value.tokenHash);

const isChallenge = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
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
  && isNullableSha256(value.bootstrapTokenHash)
  && (value.capability === null || isOneOf(value.capability, ADMIN_CAPABILITIES))
  && isOpaqueString(value.challenge, 1, 2_048)
  && isNullableBoundedString(value.command, 1, MAX_COMMAND_LENGTH)
  && isNullableSha256(value.commandFingerprint)
  && isTimestamp(value.createdAt)
  && isTimestamp(value.expiresAt)
  && isOpaqueIdentifier(value.flowId, "flow")
  && isOneOf(value.kind, CHALLENGE_KINDS)
  && (value.principalId === null || isSafeIdentifier(value.principalId))
  && (
    value.sessionId === null
    || isOpaqueIdentifier(value.sessionId, "session")
  )
  && isSha256(value.sourceKeyHash)
  && isNullableTimestamp(value.usedAt);

const isSession = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
    "absoluteExpiresAt",
    "createdAt",
    "idleExpiresAt",
    "lastSeenAt",
    "principalId",
    "revokedAt",
    "sessionId",
    "tokenHash",
  ])
  && isTimestamp(value.absoluteExpiresAt)
  && isTimestamp(value.createdAt)
  && isTimestamp(value.idleExpiresAt)
  && isTimestamp(value.lastSeenAt)
  && isSafeIdentifier(value.principalId)
  && isNullableTimestamp(value.revokedAt)
  && isOpaqueIdentifier(value.sessionId, "session")
  && isSha256(value.tokenHash);

const isStepUpReceipt = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
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
  && isOneOf(value.capability, ADMIN_CAPABILITIES)
  && isBoundedString(value.command, 1, MAX_COMMAND_LENGTH)
  && isSha256(value.commandFingerprint)
  && isNullableTimestamp(value.consumedAt)
  && isTimestamp(value.createdAt)
  && isTimestamp(value.expiresAt)
  && isSafeIdentifier(value.principalId)
  && isOpaqueIdentifier(value.receiptId, "stepup")
  && isOpaqueIdentifier(value.sessionId, "session")
  && isSha256(value.tokenHash);

const isRateLimit = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
    "attempts",
    "failures",
    "keyHash",
    "lockedUntil",
    "scope",
    "updatedAt",
    "windowStartedAt",
  ])
  && isNonNegativeSafeInteger(value.attempts)
  && isNonNegativeSafeInteger(value.failures)
  && isSha256(value.keyHash)
  && isNullableTimestamp(value.lockedUntil)
  && isOneOf(value.scope, RATE_LIMIT_SCOPES)
  && isTimestamp(value.updatedAt)
  && isTimestamp(value.windowStartedAt);

const isSecurityEvent = (value: unknown): boolean =>
  isRecord(value)
  && hasOnlyKeys(value, [
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
  && isOpaqueIdentifier(value.eventId, "event")
  && isOneOf(value.eventType, ADMIN_SECURITY_EVENT_TYPES)
  && isTimestamp(value.occurredAt)
  && isOneOf(value.outcome, EVENT_OUTCOMES)
  && (value.principalId === null || isSafeIdentifier(value.principalId))
  && isBoundedString(value.reasonCode, 1, 128)
  && (value.sourceKeyHash === null || isSha256(value.sourceKeyHash))
  && (
    value.subjectId === null
    || isBoundedString(value.subjectId, 1, MAX_IDENTIFIER_LENGTH)
  );

const invalidState = (): never => {
  throw new AdminSecurityError(
    "REPOSITORY_INVALID",
    "Admin security state is invalid.",
  );
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  isNonNegativeInteger(value) && Number.isSafeInteger(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBoundedArray = (
  value: unknown,
  maximumLength: number,
  validator: (entry: unknown) => boolean,
): value is readonly unknown[] =>
  Array.isArray(value)
  && value.length <= maximumLength
  && value.every(validator);

const isBoundedString = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string =>
  typeof value === "string"
  && value.length >= minimumLength
  && value.length <= maximumLength
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isNullableBoundedString = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): boolean =>
  value === null || isBoundedString(value, minimumLength, maximumLength);

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string"
  && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);

const isOpaqueString = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string =>
  isBoundedString(value, minimumLength, maximumLength)
  && /^[A-Za-z0-9+/_=-]+$/u.test(value);

const isBase64Url = (
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string =>
  isBoundedString(value, minimumLength, maximumLength)
  && /^[A-Za-z0-9_-]+={0,2}$/u.test(value);

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

const isNullableSha256 = (value: unknown): boolean =>
  value === null || isSha256(value);

const isOpaqueIdentifier = (
  value: unknown,
  prefix: string,
): value is string =>
  typeof value === "string"
  && value.startsWith(`${prefix}_`)
  && /^[A-Za-z0-9_-]{16,128}$/u.test(value.slice(prefix.length + 1));

const isTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const isNullableTimestamp = (value: unknown): boolean =>
  value === null || isTimestamp(value);

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === "string" && allowed.includes(value as T);

const isUniqueEnumArray = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is readonly T[] =>
  Array.isArray(value)
  && value.length <= allowed.length
  && value.every((entry) => isOneOf(entry, allowed))
  && new Set(value).size === value.length;

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key))
  && allowed.every((key) => key in value);

const hasUniqueValues = (
  value: unknown,
  key: string,
): boolean => {
  if (!Array.isArray(value)) return false;
  const entries = value.map((entry) =>
    isRecord(entry) && typeof entry[key] === "string" ? entry[key] : null,
  );
  return !entries.includes(null) && new Set(entries).size === entries.length;
};

const sameFileSnapshot = (
  left: BigIntStats,
  right: BigIntStats,
): boolean =>
  left.dev === right.dev
  && left.ino === right.ino
  && left.mode === right.mode
  && left.uid === right.uid
  && left.size === right.size
  && left.mtimeNs === right.mtimeNs
  && left.ctimeNs === right.ctimeNs;

const syncDirectory = async (path: string): Promise<void> => {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (
      !isNodeError(error)
      || (error.code !== "EINVAL" && error.code !== "ENOTSUP")
    ) {
      throw error;
    }
  } finally {
    await handle.close();
  }
};

const removeTemporaryFile = async (
  path: string,
  directory: string,
): Promise<void> => {
  try {
    await unlink(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
  await syncDirectory(directory);
};

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && "code" in value;
