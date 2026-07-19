import { lstat, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1_000;
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
  readonly uid: number;
}

interface FileIdentity { readonly device: number; readonly inode: number; }

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
      const candidate = Object.freeze({ createdAtMs, device: stats.dev, inode: stats.ino, name, path, uid: stats.uid });
      if (path === sourcePath || path === justVerifiedPath || sameIdentity(candidate, sourceIdentity) || sameIdentity(candidate, justVerifiedIdentity)) continue;
      candidates.push(candidate);
    }
  } catch (error) {
    throw new OperationsBackupRetentionError("OPERATIONS_BACKUP_RETENTION_SCAN_FAILED", "Backup retention could not inspect candidate files", error);
  }

  candidates.sort((left, right) => right.createdAtMs - left.createdAtMs || right.name.localeCompare(left.name));
  const newest = candidates[0];
  const deletionCandidates = candidates
    .slice(policy.minimumRecentBackups)
    .filter((candidate) => candidate !== newest && nowMs - candidate.createdAtMs > policy.maxAgeMs)
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.name.localeCompare(right.name))
    .slice(0, policy.maxDeletions);

  let deletedCount = 0;
  for (const candidate of deletionCandidates) {
    try {
      const current = await lstat(candidate.path);
      if (!current.isFile() || current.uid !== currentUserId || current.dev !== candidate.device || current.ino !== candidate.inode) {
        throw new Error("candidate ownership or identity changed");
      }
      await unlink(candidate.path);
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
