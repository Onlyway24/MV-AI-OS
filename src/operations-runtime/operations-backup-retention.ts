import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, rename, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_ADMIN_SECURITY_STATE_BYTES = 5 * 1024 * 1024;
const MAX_BACKUP_MANIFEST_BYTES = 1024 * 1024;
const BACKUP_NAME = /^mv-ai-os--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)--[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.sqlite$/iu;

export const DEFAULT_OPERATIONS_BACKUP_RETENTION_POLICY = Object.freeze({
  maxAgeMs: 30 * DAY_MS,
  maxDeletions: 32,
  maxScannedEntries: 10_000,
  minimumRecentBackups: 14,
});

export interface OperationsBackupRetentionInput {
  readonly directory: string;
  readonly justVerifiedPath: string;
  readonly now?: Date;
  readonly policy?: Readonly<{
    readonly maxAgeMs: number;
    readonly maxDeletions: number;
    readonly maxScannedEntries?: number;
    readonly minimumRecentBackups: number;
  }>;
  readonly sourcePath: string;
  readonly trustedSignatureOwnerId?: number;
  readonly trustedSignaturePublicKeyPath?: string;
}

export interface OperationsBackupRetentionResult {
  readonly code: "OPERATIONS_BACKUP_RETENTION_COMPLETED";
  readonly deletedCount: number;
  readonly eligibleCount: number;
  readonly retainedCount: number;
  readonly scannedCount: number;
}

export type OperationsBackupRetentionErrorCode =
  | "OPERATIONS_BACKUP_RETENTION_CLEANUP_FAILED"
  | "OPERATIONS_BACKUP_RETENTION_POLICY_INVALID"
  | "OPERATIONS_BACKUP_RETENTION_SCAN_FAILED";

export class OperationsBackupRetentionError extends Error {
  public readonly code: OperationsBackupRetentionErrorCode;

  public constructor(code: OperationsBackupRetentionErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OperationsBackupRetentionError";
    this.code = code;
  }
}

interface Candidate {
  readonly createdAtMs: number;
  readonly device: number;
  readonly inode: number;
  readonly name: string;
  readonly path: string;
  readonly adminSecurityState?: ArtifactIdentity;
  readonly manifest?: ArtifactIdentity;
  readonly signature?: ArtifactIdentity;
  readonly uid: number;
}

interface FileIdentity { readonly device: number; readonly inode: number; }
interface ArtifactIdentity extends FileIdentity {
  readonly ctimeMs: number;
  readonly gid: number;
  readonly mode: number;
  readonly mtimeMs: number;
  readonly path: string;
  readonly size: number;
  readonly uid: number;
}

interface TrustedSignaturePublicKey {
  readonly fingerprint: string;
  readonly identity: ArtifactIdentity;
  readonly key: KeyObject;
}

/**
 * Deletes only old, canonically named backups owned by the current OS user.
 * Source/verified identities, the newest verified backup, and a recent floor are
 * immutable during each bounded cleanup pass.
 */
export async function enforceOperationsBackupRetention(input: OperationsBackupRetentionInput): Promise<OperationsBackupRetentionResult> {
  const policy = normalizePolicy(input.policy);
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(nowMs)) throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_POLICY_INVALID", "Backup retention clock is invalid");
  const currentUserId = process.getuid?.();
  if (currentUserId === undefined) throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_POLICY_INVALID", "Backup retention requires a local user identity");
  const currentGroupId = process.getgid?.();
  if (currentGroupId === undefined) throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_POLICY_INVALID", "Backup retention requires a local group identity");
  const trustedSignatureOwnerId = input.trustedSignatureOwnerId ?? 0;
  if (!Number.isSafeInteger(trustedSignatureOwnerId) || trustedSignatureOwnerId < 0) {
    throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_POLICY_INVALID", "Backup signature owner identity is invalid");
  }
  const trustedSignaturePublicKeyPath =
    input.trustedSignaturePublicKeyPath
    ?? process.env.ONLYWAY_ACCEPTANCE_PUBLIC_KEY_PATH;
  let trustedSignaturePublicKey: TrustedSignaturePublicKey | undefined;
  if (trustedSignaturePublicKeyPath !== undefined) {
    try {
      trustedSignaturePublicKey = await loadTrustedSignaturePublicKey(
        trustedSignaturePublicKeyPath,
        trustedSignatureOwnerId,
      );
    } catch (error) {
      throw new OperationsBackupRetentionError(
        "OPERATIONS_BACKUP_RETENTION_SCAN_FAILED",
        "Backup retention could not validate its signature trust anchor",
        error,
      );
    }
  }

  const directory = resolve(input.directory);
  const sourcePath = resolve(input.sourcePath);
  const justVerifiedPath = resolve(input.justVerifiedPath);
  let sourceIdentity: FileIdentity;
  let justVerifiedIdentity: FileIdentity;
  let names: readonly string[];
  try {
    const [source, justVerified, entries] = await Promise.all([lstat(sourcePath), lstat(justVerifiedPath), readdir(directory)]);
    if (!source.isFile() || !justVerified.isFile()) throw new Error("protected backup identity is not a regular file");
    sourceIdentity = identity(source);
    justVerifiedIdentity = identity(justVerified);
    names = entries;
  } catch (error) {
    throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_SCAN_FAILED", "Backup retention could not verify protected files", error);
  }
  if (names.length > policy.maxScannedEntries) throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_SCAN_FAILED", "Backup retention scan limit was exceeded");

  const candidates: Candidate[] = [];
  try {
    for (const name of names) {
      const createdAtMs = backupCreatedAt(name);
      if (createdAtMs === undefined) continue;
      const path = join(directory, name);
      const stats = await lstat(path);
      if (!stats.isFile() || stats.uid !== currentUserId) continue;
      const database = artifactIdentityFromStats(path, stats);
      const [adminSecurityState, manifest] = await Promise.all([
        artifactIdentity(
          `${path}.admin-security.json`,
          currentUserId,
          MAX_ADMIN_SECURITY_STATE_BYTES,
        ),
        artifactIdentity(
          `${path}.manifest.json`,
          currentUserId,
          MAX_BACKUP_MANIFEST_BYTES,
        ),
      ]);
      const signature = await signatureArtifactIdentity({
        ...(adminSecurityState === undefined ? {} : { adminSecurityState }),
        database,
        expectedManifestFile: `${name}.manifest.json`,
        path: `${path}.manifest.json.sig`,
        trustedGroupId: currentGroupId,
        trustedOwnerId: trustedSignatureOwnerId,
        ...(manifest === undefined ? {} : { manifest }),
        ...(trustedSignaturePublicKey === undefined
          ? {}
          : { publicKey: trustedSignaturePublicKey }),
      });
      const candidate = Object.freeze({
        createdAtMs,
        device: stats.dev,
        inode: stats.ino,
        ...(adminSecurityState === undefined ? {} : { adminSecurityState }),
        ...(manifest === undefined ? {} : { manifest }),
        ...(signature === undefined ? {} : { signature }),
        name,
        path,
        uid: stats.uid,
      });
      if (path === sourcePath || path === justVerifiedPath || sameIdentity(candidate, sourceIdentity) || sameIdentity(candidate, justVerifiedIdentity)) continue;
      candidates.push(candidate);
    }
  } catch (error) {
    throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_SCAN_FAILED", "Backup retention could not inspect candidate files", error);
  }

  const recoveryGradeCandidates = candidates
    .filter(isRecoveryGradeCandidate)
    .sort((left, right) =>
      right.createdAtMs - left.createdAtMs
      || right.name.localeCompare(left.name));
  const protectedRecoveryGrade = new Set(
    recoveryGradeCandidates
      .slice(0, policy.minimumRecentBackups)
      .map(({ path }) => path),
  );
  const deletionCandidates = candidates
    .filter((candidate) =>
      !protectedRecoveryGrade.has(candidate.path)
      && nowMs - candidate.createdAtMs > policy.maxAgeMs)
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.name.localeCompare(right.name))
    .slice(0, policy.maxDeletions);

  let deletedCount = 0;
  for (const candidate of deletionCandidates) {
    try {
      const current = await lstat(candidate.path);
      if (!current.isFile() || current.uid !== currentUserId || current.dev !== candidate.device || current.ino !== candidate.inode) {
        throw new Error("candidate ownership or identity changed");
      }
      if (candidate.manifest !== undefined) {
        await verifyArtifactIdentity(candidate.manifest);
      }
      if (candidate.adminSecurityState !== undefined) {
        await verifyArtifactIdentity(candidate.adminSecurityState);
      }
      if (candidate.signature !== undefined) {
        await verifyArtifactIdentity(candidate.signature);
      }
      await removeBundle(candidate);
      deletedCount += 1;
    } catch (error) {
      throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_CLEANUP_FAILED", "Backup retention cleanup failed", error);
    }
  }

  return Object.freeze({
    code: "OPERATIONS_BACKUP_RETENTION_COMPLETED",
    deletedCount,
    eligibleCount: candidates.length,
    retainedCount: candidates.length - deletedCount,
    scannedCount: names.length,
  });
}

function normalizePolicy(input: OperationsBackupRetentionInput["policy"]): Readonly<{ readonly maxAgeMs: number; readonly maxDeletions: number; readonly maxScannedEntries: number; readonly minimumRecentBackups: number }> {
  const policy = input ?? DEFAULT_OPERATIONS_BACKUP_RETENTION_POLICY;
  const maxScannedEntries = policy.maxScannedEntries ?? DEFAULT_OPERATIONS_BACKUP_RETENTION_POLICY.maxScannedEntries;
  if (!positiveInteger(policy.maxAgeMs) || !positiveInteger(policy.maxDeletions) || !positiveInteger(maxScannedEntries) || !positiveInteger(policy.minimumRecentBackups) || policy.maxDeletions > 256 || maxScannedEntries > 100_000 || policy.minimumRecentBackups > maxScannedEntries) {
    throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_POLICY_INVALID", "Backup retention policy is invalid");
  }
  return Object.freeze({ maxAgeMs: policy.maxAgeMs, maxDeletions: policy.maxDeletions, maxScannedEntries, minimumRecentBackups: policy.minimumRecentBackups });
}

function backupCreatedAt(name: string): number | undefined {
  const match = BACKUP_NAME.exec(name);
  const encoded = match?.[1];
  if (encoded === undefined) return undefined;
  const canonical = encoded.replace(/T(\d{2})-(\d{2})-(\d{2})\./u, "T$1:$2:$3.");
  const value = Date.parse(canonical);
  return Number.isFinite(value) ? value : undefined;
}

function identity(value: Readonly<{ readonly dev: number; readonly ino: number }>): FileIdentity { return Object.freeze({ device: value.dev, inode: value.ino }); }
function sameIdentity(value: Readonly<{ readonly device: number; readonly inode: number }>, protectedIdentity: FileIdentity): boolean { return value.device === protectedIdentity.device && value.inode === protectedIdentity.inode; }
function positiveInteger(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function isRecoveryGradeCandidate(candidate: Candidate): boolean {
  return candidate.adminSecurityState !== undefined
    && candidate.manifest !== undefined
    && candidate.signature !== undefined;
}

async function artifactIdentity(
  path: string,
  currentUserId: number,
  maximumBytes: number,
): Promise<ArtifactIdentity | undefined> {
  try {
    const value = await lstat(path);
    if (
      !value.isFile() ||
      value.isSymbolicLink() ||
      value.uid !== currentUserId ||
      (value.mode & 0o777) !== 0o600 ||
      value.size < 1 ||
      value.size > maximumBytes
    ) {
      throw new Error("backup bundle artifact ownership, mode or type is invalid");
    }
    return artifactIdentityFromStats(path, value);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function verifyArtifactIdentity(
  expected: ArtifactIdentity,
): Promise<void> {
  const current = await lstat(expected.path);
  if (
    !current.isFile()
    || current.isSymbolicLink()
    || current.uid !== expected.uid
    || current.gid !== expected.gid
    || (current.mode & 0o777) !== expected.mode
    || current.dev !== expected.device
    || current.ino !== expected.inode
    || current.size !== expected.size
    || current.mtimeMs !== expected.mtimeMs
    || current.ctimeMs !== expected.ctimeMs
  ) {
    throw new Error("candidate artifact ownership or identity changed");
  }
}

async function signatureArtifactIdentity(input: Readonly<{
  readonly adminSecurityState?: ArtifactIdentity;
  readonly database: ArtifactIdentity;
  readonly expectedManifestFile: string;
  readonly manifest?: ArtifactIdentity;
  readonly path: string;
  readonly publicKey?: TrustedSignaturePublicKey;
  readonly trustedGroupId: number;
  readonly trustedOwnerId: number;
}>): Promise<ArtifactIdentity | undefined> {
  let value: Awaited<ReturnType<typeof lstat>>;
  try {
    value = await lstat(input.path);
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
  if (
    !value.isFile()
    || value.isSymbolicLink()
    || value.uid !== input.trustedOwnerId
    || value.gid !== input.trustedGroupId
    || (value.mode & 0o777) !== 0o640
    || value.size < 1
    || value.size > 16_384
  ) {
    throw new Error("backup signature ownership, mode, size or type is invalid");
  }
  if (input.manifest === undefined) {
    throw new Error("signed backup manifest is unavailable");
  }
  if (input.publicKey === undefined) {
    throw new Error("backup signature trust anchor is unavailable");
  }
  if (input.adminSecurityState === undefined) {
    throw new Error("signed backup bundle is incomplete");
  }
  if (
    input.database.mode !== 0o600
    || input.database.size < 1
    || input.database.uid !== process.getuid?.()
  ) {
    throw new Error("signed backup database metadata is invalid");
  }
  const signature = artifactIdentityFromStats(input.path, value);
  const [signatureBytes, manifestBytes] = await Promise.all([
    readStableArtifact(signature),
    readStableArtifact(input.manifest),
  ]);
  let envelope: unknown;
  try {
    envelope = JSON.parse(signatureBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("backup signature is not valid JSON");
  }
  if (
    !isSignatureEnvelope(envelope)
    || envelope.manifestFile !== input.expectedManifestFile
    || envelope.manifestSha256 !== createHash("sha256")
      .update(manifestBytes)
      .digest("hex")
    || envelope.publicKeySha256 !== input.publicKey.fingerprint
  ) {
    throw new Error("backup signature contract or manifest binding is invalid");
  }
  const rawSignature = Buffer.from(envelope.signature, "base64");
  if (!verifySignature(null, manifestBytes, input.publicKey.key, rawSignature)) {
    throw new Error("backup signature cryptographic verification failed");
  }
  await validateSignedRecoveryBundle({
    adminSecurityState: input.adminSecurityState,
    database: input.database,
    manifestBytes,
  });
  await verifyArtifactIdentity(input.publicKey.identity);
  return signature;
}

async function validateSignedRecoveryBundle(input: Readonly<{
  readonly adminSecurityState: ArtifactIdentity;
  readonly database: ArtifactIdentity;
  readonly manifestBytes: Buffer;
}>): Promise<void> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(input.manifestBytes.toString("utf8")) as unknown;
  } catch {
    throw new Error("signed backup manifest is not valid JSON");
  }
  if (!isRecordWithExactKeys(manifest, [
    "adminSecurityState",
    "backupFile",
    "contractVersion",
    "createdAt",
    "encryptionState",
    "integrityCheck",
    "manifestFingerprint",
    "rawBootstrapIncluded",
    "releaseCommit",
    "restoreProbe",
    "schemaVersion",
    "secretsIncluded",
    "sha256",
    "sizeBytes",
  ])) {
    throw new Error("signed backup manifest schema is invalid");
  }
  const adminSecurityState = manifest.adminSecurityState;
  if (
    manifest.contractVersion !== "1"
    || manifest.backupFile !== basename(input.database.path)
    || typeof manifest.createdAt !== "string"
    || !Number.isFinite(Date.parse(manifest.createdAt))
    || manifest.encryptionState !== "BACKUP_AT_REST_ENCRYPTION_REQUIRED"
    || manifest.integrityCheck !== "ok"
    || manifest.restoreProbe !== "PASSED"
    || manifest.rawBootstrapIncluded !== false
    || manifest.secretsIncluded !== false
    || typeof manifest.releaseCommit !== "string"
    || !/^[a-f0-9]{40}$/u.test(manifest.releaseCommit)
    || !positiveIntegerValue(manifest.schemaVersion)
    || typeof manifest.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(manifest.sha256)
    || manifest.sizeBytes !== input.database.size
    || typeof manifest.manifestFingerprint !== "string"
    || !/^[a-f0-9]{64}$/u.test(manifest.manifestFingerprint)
    || !isRecordWithExactKeys(adminSecurityState, [
      "contractVersion",
      "file",
      "revision",
      "sha256",
      "sizeBytes",
      "stateVersion",
    ])
    || adminSecurityState.contractVersion !== "1"
    || adminSecurityState.file !== basename(input.adminSecurityState.path)
    || !nonNegativeIntegerValue(adminSecurityState.revision)
    || typeof adminSecurityState.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(adminSecurityState.sha256)
    || adminSecurityState.sizeBytes !== input.adminSecurityState.size
    || adminSecurityState.stateVersion !== 1
  ) {
    throw new Error("signed backup manifest policy or artifact binding is invalid");
  }
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (key !== "manifestFingerprint") body[key] = value;
  }
  if (
    createHash("sha256").update(JSON.stringify(body)).digest("hex")
    !== manifest.manifestFingerprint
  ) {
    throw new Error("signed backup manifest self-fingerprint is invalid");
  }
  const [databaseSha256, adminSecurityStateBytes] = await Promise.all([
    hashStableArtifact(input.database),
    readStableArtifact(input.adminSecurityState),
  ]);
  if (
    databaseSha256 !== manifest.sha256
    || createHash("sha256").update(adminSecurityStateBytes).digest("hex")
      !== adminSecurityState.sha256
  ) {
    throw new Error("signed backup artifact fingerprint is invalid");
  }
}

async function loadTrustedSignaturePublicKey(
  path: string,
  trustedOwnerId: number,
): Promise<TrustedSignaturePublicKey> {
  if (!isAbsolute(path)) {
    throw new Error("backup signature public key path must be absolute");
  }
  const resolved = resolve(path);
  const value = await lstat(resolved);
  const mode = value.mode & 0o777;
  if (
    !value.isFile()
    || value.isSymbolicLink()
    || value.uid !== trustedOwnerId
    || (mode !== 0o600 && mode !== 0o644)
    || value.size < 1
    || value.size > 16_384
  ) {
    throw new Error("backup signature public key metadata is invalid");
  }
  const identity = artifactIdentityFromStats(resolved, value);
  const bytes = await readStableArtifact(identity);
  const key = createPublicKey(bytes);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("backup signature public key is not Ed25519");
  }
  const der = key.export({ format: "der", type: "spki" });
  return Object.freeze({
    fingerprint: createHash("sha256").update(der).digest("hex"),
    identity,
    key,
  });
}

async function readStableArtifact(
  expected: ArtifactIdentity,
): Promise<Buffer> {
  const handle = await open(
    expected.path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    if (!sameArtifactIdentity(opened, expected)) {
      throw new Error("backup artifact identity changed before inspection");
    }
    const bytes = await handle.readFile();
    const completed = await handle.stat();
    if (
      !sameArtifactIdentity(completed, expected)
      || bytes.length !== expected.size
    ) {
      throw new Error("backup artifact changed during inspection");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function hashStableArtifact(
  expected: ArtifactIdentity,
): Promise<string> {
  const handle = await open(
    expected.path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    if (!sameArtifactIdentity(opened, expected)) {
      throw new Error("backup artifact identity changed before hashing");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < expected.size) {
      const length = Math.min(buffer.length, expected.size - position);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        length,
        position,
      );
      if (bytesRead < 1) {
        throw new Error("backup artifact ended before its declared size");
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const completed = await handle.stat();
    if (!sameArtifactIdentity(completed, expected)) {
      throw new Error("backup artifact changed while it was hashed");
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

function artifactIdentityFromStats(
  path: string,
  value: Readonly<{
    readonly ctimeMs: number;
    readonly dev: number;
    readonly gid: number;
    readonly ino: number;
    readonly mode: number;
    readonly mtimeMs: number;
    readonly size: number;
    readonly uid: number;
  }>,
): ArtifactIdentity {
  return Object.freeze({
    ctimeMs: value.ctimeMs,
    device: value.dev,
    gid: value.gid,
    inode: value.ino,
    mode: value.mode & 0o777,
    mtimeMs: value.mtimeMs,
    path,
    size: value.size,
    uid: value.uid,
  });
}

function sameArtifactIdentity(
  value: Readonly<{
    readonly ctimeMs: number;
    readonly dev: number;
    readonly gid: number;
    readonly ino: number;
    readonly mode: number;
    readonly mtimeMs: number;
    readonly size: number;
    readonly uid: number;
  }>,
  expected: ArtifactIdentity,
): boolean {
  return value.dev === expected.device
    && value.ino === expected.inode
    && value.uid === expected.uid
    && value.gid === expected.gid
    && (value.mode & 0o777) === expected.mode
    && value.size === expected.size
    && value.mtimeMs === expected.mtimeMs
    && value.ctimeMs === expected.ctimeMs;
}

function isSignatureEnvelope(value: unknown): value is Readonly<{
  readonly contractVersion: "1";
  readonly kind: "BACKUP_MANIFEST_SIGNATURE";
  readonly manifestFile: string;
  readonly manifestSha256: string;
  readonly publicKeySha256: string;
  readonly signature: string;
  readonly signatureAlgorithm: "ED25519";
}> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("\n") !== [
      "contractVersion",
      "kind",
      "manifestFile",
      "manifestSha256",
      "publicKeySha256",
      "signature",
      "signatureAlgorithm",
    ].sort().join("\n")
  ) {
    return false;
  }
  if (
    record.contractVersion !== "1"
    || record.kind !== "BACKUP_MANIFEST_SIGNATURE"
    || typeof record.manifestFile !== "string"
    || !/^[a-f0-9]{64}$/u.test(String(record.manifestSha256))
    || !/^[a-f0-9]{64}$/u.test(String(record.publicKeySha256))
    || record.signatureAlgorithm !== "ED25519"
    || typeof record.signature !== "string"
  ) {
    return false;
  }
  const decoded = Buffer.from(record.signature, "base64");
  return decoded.length === 64 && decoded.toString("base64") === record.signature;
}

function isRecordWithExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n")
      === [...expectedKeys].sort().join("\n");
}

function positiveIntegerValue(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0;
}

function nonNegativeIntegerValue(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

async function removeBundle(candidate: Candidate): Promise<void> {
  const token = `${String(process.pid)}-${randomUUID()}`;
  const sources = [
    candidate.path,
    ...(candidate.manifest === undefined ? [] : [candidate.manifest.path]),
    ...(candidate.adminSecurityState === undefined
      ? []
      : [candidate.adminSecurityState.path]),
    ...(candidate.signature === undefined ? [] : [candidate.signature.path]),
  ];
  const moved: Readonly<{ readonly from: string; readonly to: string }>[] = [];
  try {
    for (const from of sources) {
      const to = `${from}.retention-${token}`;
      await rename(from, to);
      moved.push(Object.freeze({ from, to }));
    }
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    for (const entry of moved.reverse()) {
      try {
        await rename(entry.to, entry.from);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      throw new AggregateError(
        [error, ...rollbackFailures],
        "Backup retention bundle quarantine failed and rollback was incomplete",
      );
    }
    throw error;
  }
  await Promise.all(moved.map(({ to }) => unlink(to)));
}
