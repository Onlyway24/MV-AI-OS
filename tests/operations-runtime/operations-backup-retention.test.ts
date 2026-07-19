import { chmod, link, lstat, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { enforceOperationsBackupRetention } from "../../src/operations-runtime/operations-backup-retention.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true }))); });

describe("Operations backup retention", () => {
  it("keeps protected identities and recent backups while deleting only an old bounded owner batch", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const sourceAlias = backupPath(directory, "2026-01-01T00-00-00.000Z", 1);
    await link(sourcePath, sourceAlias);
    const justVerifiedPath = await createBackup(directory, "2026-07-19T09-00-00.000Z", 2);
    const newestPath = await createBackup(directory, "2026-07-19T10-00-00.000Z", 3);
    const recentPath = await createBackup(directory, "2026-07-18T10-00-00.000Z", 4);
    const oldPaths = await Promise.all([
      createBackup(directory, "2026-01-05T00-00-00.000Z", 5),
      createBackup(directory, "2026-01-04T00-00-00.000Z", 6),
      createBackup(directory, "2026-01-03T00-00-00.000Z", 7),
    ]);
    const nonCanonical = join(directory, "manual.sqlite");
    const symlinkPath = backupPath(directory, "2025-01-01T00-00-00.000Z", 8);
    await writeFile(nonCanonical, "manual", { mode: 0o600 });
    await symlink(oldPaths[0], symlinkPath);

    const result = await enforceOperationsBackupRetention({
      directory,
      justVerifiedPath,
      now: new Date("2026-07-19T12:00:00.000Z"),
      policy: { maxAgeMs: 30 * 24 * 60 * 60 * 1_000, maxDeletions: 2, maxScannedEntries: 100, minimumRecentBackups: 2 },
      sourcePath,
    });

    expect(result).toMatchObject({ code: "OPERATIONS_BACKUP_RETENTION_COMPLETED", deletedCount: 2, eligibleCount: 5, retainedCount: 3 });
    await expect(lstat(sourcePath)).resolves.toBeDefined();
    await expect(lstat(sourceAlias)).resolves.toBeDefined();
    await expect(lstat(justVerifiedPath)).resolves.toBeDefined();
    await expect(lstat(newestPath)).resolves.toBeDefined();
    await expect(lstat(recentPath)).resolves.toBeDefined();
    await expect(lstat(oldPaths[0])).resolves.toBeDefined();
    await expect(lstat(oldPaths[1])).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(oldPaths[2])).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(nonCanonical)).resolves.toBeDefined();
    expect((await lstat(symlinkPath)).isSymbolicLink()).toBe(true);
  });

  it("reports cleanup failure explicitly instead of claiming retention success", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const justVerifiedPath = await createBackup(directory, "2026-07-19T10-00-00.000Z", 10);
    await createBackup(directory, "2026-07-18T10-00-00.000Z", 11);
    const oldPath = await createBackup(directory, "2026-01-01T00-00-00.000Z", 12);
    await chmod(directory, 0o500);
    try {
      await expect(enforceOperationsBackupRetention({
        directory,
        justVerifiedPath,
        now: new Date("2026-07-19T12:00:00.000Z"),
        policy: { maxAgeMs: 30 * 24 * 60 * 60 * 1_000, maxDeletions: 1, minimumRecentBackups: 1 },
        sourcePath,
      })).rejects.toMatchObject({ code: "OPERATIONS_BACKUP_RETENTION_CLEANUP_FAILED" });
    } finally {
      await chmod(directory, 0o700);
    }
    await expect(lstat(oldPath)).resolves.toBeDefined();
    await expect(lstat(justVerifiedPath)).resolves.toBeDefined();
  });

  it("fails closed on invalid or unbounded policy input", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const justVerifiedPath = await createBackup(directory, "2026-07-19T10-00-00.000Z", 20);
    await expect(enforceOperationsBackupRetention({ directory, justVerifiedPath, policy: { maxAgeMs: 1, maxDeletions: 257, minimumRecentBackups: 1 }, sourcePath })).rejects.toMatchObject({ code: "OPERATIONS_BACKUP_RETENTION_POLICY_INVALID" });
  });
});

async function tempRoot(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "mv-ai-os-backup-retention-")); roots.push(path); return path; }

async function createBackup(directory: string, timestamp: string, sequence: number): Promise<string> {
  const path = backupPath(directory, timestamp, sequence);
  await writeFile(path, `backup-${String(sequence)}`, { mode: 0o600 });
  const time = new Date(timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})\./u, "T$1:$2:$3."));
  await utimes(path, time, time);
  return path;
}

function backupPath(directory: string, timestamp: string, sequence: number): string {
  return join(directory, `mv-ai-os--${timestamp}--00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}.sqlite`);
}
