import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";

interface ProcessLockRecord {
  readonly contractVersion: "1";
  readonly createdAt: string;
  readonly instanceId: string;
  readonly pid: number;
  readonly role: string;
  readonly token: string;
}

interface RecoveryClaimRecord {
  readonly contractVersion: "1";
  readonly createdAt: string;
  readonly expectedDevice: number;
  readonly expectedInode: number;
  readonly expectedToken: string;
  readonly ownerPid: number;
  readonly token: string;
}

interface FileIdentity {
  readonly device: number;
  readonly inode: number;
}

interface FileSnapshot<T> {
  readonly identity: FileIdentity;
  readonly record: T;
}

interface PreparedFile {
  readonly identity: FileIdentity;
  readonly path: string;
}

interface RecoveryClaim {
  readonly identity: FileIdentity;
  readonly path: string;
  readonly record: RecoveryClaimRecord;
}

/** Exclusive file lock with atomic publication and conservative, bounded stale-PID recovery. */
export class SupervisedProcessLock {
  #closed = false;
  private constructor(private readonly path: string, private readonly owned: ProcessLockRecord) {}

  public static async acquire(input: Readonly<{ readonly instanceId: string; readonly path: string; readonly role: string; readonly now?: Date }>): Promise<SupervisedProcessLock> {
    assertSafeId(input.instanceId, "Process lock instance ID");
    assertSafeId(input.role, "Process lock role");
    if (!input.path.startsWith("/") || input.path.includes("\0")) throw new RepositoryValidationError("Process lock path must be absolute");
    const directory = dirname(input.path);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const record: ProcessLockRecord = Object.freeze({ contractVersion: "1", createdAt: (input.now ?? new Date()).toISOString(), instanceId: input.instanceId, pid: process.pid, role: input.role, token: `lock-${randomUUID()}` });
    const prepared = await prepareFile(input.path, `${JSON.stringify(record)}\n`);
    let published = false;
    let recoveryClaim: RecoveryClaim | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await publishPreparedFile(prepared, input.path);
          published = true;
          break;
        } catch (error) {
          if (!hasCode(error, "EEXIST")) throw error;
          const existing = await readProcessLock(input.path).catch((readError: unknown) => {
            if (hasCode(readError, "ENOENT")) return undefined;
            throw readError;
          });
          if (existing === undefined) continue;
          if (isPidAlive(existing.record.pid)) throw new RepositoryConflictError("Supervised process lock is held by an active process", { pid: existing.record.pid, role: existing.record.role });
          if (attempt > 0) throw new RepositoryConflictError("Supervised process lock stale recovery raced with another process");
          recoveryClaim = await acquireRecoveryClaim(input.path, existing, input.now ?? new Date());
          await removeStaleLock(input.path, existing);
        }
      }
      if (!published) throw new RepositoryConflictError("Supervised process lock could not be acquired");
      await removeOwnedFile(prepared.path, prepared.identity);
      await releaseRecoveryClaim(recoveryClaim);
      await syncDirectory(directory);
      return new SupervisedProcessLock(input.path, record);
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (published) await collectCleanupFailure(cleanupFailures, () => removeOwnedFile(input.path, prepared.identity));
      await collectCleanupFailure(cleanupFailures, () => removeOwnedFile(prepared.path, prepared.identity));
      await collectCleanupFailure(cleanupFailures, () => releaseRecoveryClaim(recoveryClaim));
      await collectCleanupFailure(cleanupFailures, () => syncDirectory(directory));
      if (cleanupFailures.length > 0) throw new RepositoryConflictError("Supervised process lock cleanup failed", { cleanupFailures: cleanupFailures.length });
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    const current = await readProcessLock(this.path).catch((error: unknown) => {
      if (hasCode(error, "ENOENT")) return undefined;
      throw error;
    });
    if (current === undefined) {
      this.#closed = true;
      return;
    }
    if (current.record.token !== this.owned.token || current.record.instanceId !== this.owned.instanceId || current.record.pid !== this.owned.pid) throw new RepositoryConflictError("Supervised process lock ownership changed before release");
    await removeOwnedFile(this.path, current.identity);
    await syncDirectory(dirname(this.path));
    this.#closed = true;
  }
}

async function prepareFile(targetPath: string, text: string): Promise<PreparedFile> {
  const path = `${targetPath}.candidate.${String(process.pid)}.${randomUUID()}`;
  const handle = await open(path, "wx", 0o600);
  const stats = await handle.stat().catch(async (error: unknown) => {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  });
  if (!stats.isFile()) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw new RepositoryConflictError("Supervised process lock candidate is not a regular file");
  }
  const identity: FileIdentity = Object.freeze({ device: stats.dev, inode: stats.ino });
  try {
    await handle.chmod(0o600);
    await handle.writeFile(text, { encoding: "utf8" });
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await removeOwnedFile(path, identity).catch(() => undefined);
    throw error;
  }
  try {
    await handle.close();
  } catch (error) {
    await removeOwnedFile(path, identity).catch(() => undefined);
    throw error;
  }
  return Object.freeze({ identity, path });
}

async function publishPreparedFile(prepared: PreparedFile, targetPath: string): Promise<void> {
  await link(prepared.path, targetPath);
  try {
    await syncDirectory(dirname(targetPath));
  } catch (error) {
    try {
      await removeOwnedFile(targetPath, prepared.identity);
      await syncDirectory(dirname(targetPath));
    } catch {
      throw new RepositoryConflictError("Supervised process lock atomic publication rollback failed");
    }
    throw error;
  }
}

async function acquireRecoveryClaim(targetPath: string, expected: FileSnapshot<ProcessLockRecord>, now: Date): Promise<RecoveryClaim> {
  const path = `${targetPath}.recovery`;
  const record: RecoveryClaimRecord = Object.freeze({
    contractVersion: "1",
    createdAt: now.toISOString(),
    expectedDevice: expected.identity.device,
    expectedInode: expected.identity.inode,
    expectedToken: expected.record.token,
    ownerPid: process.pid,
    token: `recovery-${randomUUID()}`,
  });
  const prepared = await prepareFile(path, `${JSON.stringify(record)}\n`);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await publishPreparedFile(prepared, path);
        await removeOwnedFile(prepared.path, prepared.identity);
        await syncDirectory(dirname(path));
        return Object.freeze({ identity: prepared.identity, path, record });
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
        const existing = await readRecoveryClaim(path).catch((readError: unknown) => {
          if (hasCode(readError, "ENOENT")) return undefined;
          throw readError;
        });
        if (existing === undefined) continue;
        if (isPidAlive(existing.record.ownerPid)) throw new RepositoryConflictError("Supervised process lock stale recovery is held by an active process", { ownerPid: existing.record.ownerPid });
        if (attempt > 0) throw new RepositoryConflictError("Supervised process lock orphan recovery raced with another process", { ownerPid: existing.record.ownerPid });
        const currentTarget = await readProcessLock(targetPath).catch((readError: unknown) => {
          if (hasCode(readError, "ENOENT")) return undefined;
          throw readError;
        });
        if (currentTarget === undefined || !sameIdentity(currentTarget.identity, expected.identity) || currentTarget.record.token !== expected.record.token) throw new RepositoryConflictError("Supervised process lock ownership changed before orphan recovery-claim reclaim");
        await removeOwnedFile(path, existing.identity);
        await syncDirectory(dirname(path));
      }
    }
    throw new RepositoryConflictError("Supervised process lock recovery claim could not be acquired");
  } catch (error) {
    await removeOwnedFile(prepared.path, prepared.identity).catch(() => undefined);
    throw error;
  }
}

async function removeStaleLock(path: string, expected: FileSnapshot<ProcessLockRecord>): Promise<void> {
  const current = await readProcessLock(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (current === undefined) return;
  if (!sameIdentity(current.identity, expected.identity) || current.record.token !== expected.record.token) throw new RepositoryConflictError("Supervised process lock ownership changed during stale recovery");
  await removeOwnedFile(path, expected.identity);
  await syncDirectory(dirname(path));
}

async function releaseRecoveryClaim(claim: RecoveryClaim | undefined): Promise<void> {
  if (claim === undefined) return;
  const current = await readRecoveryClaim(claim.path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (current === undefined) return;
  if (!sameIdentity(current.identity, claim.identity) || current.record.token !== claim.record.token || current.record.ownerPid !== claim.record.ownerPid) throw new RepositoryConflictError("Supervised process lock recovery ownership changed before release");
  await removeOwnedFile(claim.path, claim.identity);
}

async function readProcessLock(path: string): Promise<FileSnapshot<ProcessLockRecord>> {
  const snapshot = await readJsonFile(path, "Supervised process lock record is invalid");
  const parsed = snapshot.record;
  if (!record(parsed) || parsed.contractVersion !== "1" || typeof parsed.pid !== "number" || !Number.isSafeInteger(parsed.pid) || parsed.pid < 1 || !safeId(parsed.instanceId) || !safeId(parsed.role) || !safeId(parsed.token) || typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) throw new RepositoryConflictError("Supervised process lock record is invalid");
  return Object.freeze({ identity: snapshot.identity, record: parsed as unknown as ProcessLockRecord });
}

async function readRecoveryClaim(path: string): Promise<FileSnapshot<RecoveryClaimRecord>> {
  const snapshot = await readJsonFile(path, "Supervised process lock recovery claim is invalid");
  const parsed = snapshot.record;
  if (!record(parsed) || parsed.contractVersion !== "1" || typeof parsed.ownerPid !== "number" || !Number.isSafeInteger(parsed.ownerPid) || parsed.ownerPid < 1 || !safeId(parsed.token) || !safeId(parsed.expectedToken) || !safeNonNegativeInteger(parsed.expectedDevice) || !safeNonNegativeInteger(parsed.expectedInode) || typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) throw new RepositoryConflictError("Supervised process lock recovery claim is invalid");
  return Object.freeze({ identity: snapshot.identity, record: parsed as unknown as RecoveryClaimRecord });
}

async function readJsonFile(path: string, invalidMessage: string): Promise<FileSnapshot<unknown>> {
  const handle = await open(path, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > 4_096) throw new RepositoryConflictError(invalidMessage);
    const text = await handle.readFile({ encoding: "utf8" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new RepositoryConflictError(invalidMessage);
    }
    return Object.freeze({ identity: Object.freeze({ device: stats.dev, inode: stats.ino }), record: parsed });
  } finally {
    await handle.close();
  }
}

async function removeOwnedFile(path: string, expected: FileIdentity): Promise<void> {
  const current = await lstat(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (current === undefined) return;
  if (!current.isFile() || current.dev !== expected.device || current.ino !== expected.inode) throw new RepositoryConflictError("Supervised process lock cleanup refused to remove an unowned file");
  await unlink(path).catch((error: unknown) => {
    if (!hasCode(error, "ENOENT")) throw error;
  });
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (!hasCode(error, "EINVAL") && !hasCode(error, "ENOTSUP")) throw error;
  } finally {
    await handle.close();
  }
}

async function collectCleanupFailure(failures: unknown[], cleanup: () => Promise<void>): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    failures.push(error);
  }
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return hasCode(error, "EPERM"); }
}
function sameIdentity(left: FileIdentity, right: FileIdentity): boolean { return left.device === right.device && left.inode === right.inode; }
function hasCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === code; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function safeNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function assertSafeId(value: unknown, label: string): asserts value is string { if (!safeId(value)) throw new RepositoryValidationError(`${label} is invalid`); }
