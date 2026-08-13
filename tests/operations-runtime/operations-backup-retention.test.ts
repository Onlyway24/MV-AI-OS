import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { chmod, link, lstat, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { enforceOperationsBackupRetention } from "../../src/operations-runtime/operations-backup-retention.js";

const SIGNING_KEYS = generateKeyPairSync("ed25519");
const SIGNING_PUBLIC_DER = SIGNING_KEYS.publicKey.export({
  format: "der",
  type: "spki",
});
const SIGNING_PUBLIC_PEM = SIGNING_KEYS.publicKey.export({
  format: "pem",
  type: "spki",
});
const SIGNING_PUBLIC_FINGERPRINT = createHash("sha256")
  .update(SIGNING_PUBLIC_DER)
  .digest("hex");

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
    await Promise.all(oldPaths.map((path) => createSignedSidecars(path)));
    const nonCanonical = join(directory, "manual.sqlite");
    const symlinkPath = backupPath(directory, "2025-01-01T00-00-00.000Z", 8);
    await writeFile(nonCanonical, "manual", { mode: 0o600 });
    await symlink(oldPaths[0], symlinkPath);
    const trustedSignaturePublicKeyPath = await createPublicKeyFile(directory);

    const result = await enforceOperationsBackupRetention({
      directory,
      justVerifiedPath,
      now: new Date("2026-07-19T12:00:00.000Z"),
      policy: { maxAgeMs: 30 * 24 * 60 * 60 * 1_000, maxDeletions: 2, maxScannedEntries: 100, minimumRecentBackups: 2 },
      sourcePath,
      trustedSignatureOwnerId: currentUserId(),
      trustedSignaturePublicKeyPath,
    });

    expect(result).toMatchObject({ code: "OPERATIONS_BACKUP_RETENTION_COMPLETED", deletedCount: 1, eligibleCount: 5, retainedCount: 4 });
    await expect(lstat(sourcePath)).resolves.toBeDefined();
    await expect(lstat(sourceAlias)).resolves.toBeDefined();
    await expect(lstat(justVerifiedPath)).resolves.toBeDefined();
    await expect(lstat(newestPath)).resolves.toBeDefined();
    await expect(lstat(recentPath)).resolves.toBeDefined();
    await expect(lstat(oldPaths[0])).resolves.toBeDefined();
    await expect(lstat(oldPaths[1])).resolves.toBeDefined();
    await expect(lstat(oldPaths[2])).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${oldPaths[1]}.manifest.json`)).resolves.toBeDefined();
    await expect(lstat(`${oldPaths[2]}.manifest.json`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${oldPaths[1]}.admin-security.json`)).resolves.toBeDefined();
    await expect(lstat(`${oldPaths[2]}.admin-security.json`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${oldPaths[1]}.manifest.json.sig`)).resolves.toBeDefined();
    await expect(lstat(`${oldPaths[2]}.manifest.json.sig`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(`${oldPaths[0]}.manifest.json.sig`)).resolves.toBeDefined();
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

  it("fails closed without deleting a bundle when its signature is a symlink", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const justVerifiedPath = await createBackup(
      directory,
      "2026-07-19T10-00-00.000Z",
      13,
    );
    await createBackup(directory, "2026-07-18T10-00-00.000Z", 14);
    const oldPath = await createBackup(
      directory,
      "2026-01-01T00-00-00.000Z",
      15,
    );
    await writeFile(`${oldPath}.manifest.json`, "{}", { mode: 0o600 });
    const target = join(directory, "untrusted-signature.json");
    await writeFile(target, "{}", { mode: 0o640 });
    await symlink(target, `${oldPath}.manifest.json.sig`);

    await expect(enforceOperationsBackupRetention({
      directory,
      justVerifiedPath,
      now: new Date("2026-07-19T12:00:00.000Z"),
      policy: {
        maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
        maxDeletions: 1,
        minimumRecentBackups: 1,
      },
      sourcePath,
    })).rejects.toMatchObject({
      code: "OPERATIONS_BACKUP_RETENTION_SCAN_FAILED",
    });
    await expect(lstat(oldPath)).resolves.toBeDefined();
    await expect(lstat(justVerifiedPath)).resolves.toBeDefined();
  });

  it("fails closed when a signed bundle manifest was tampered", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const justVerifiedPath = await createBackup(
      directory,
      "2026-07-19T10-00-00.000Z",
      16,
    );
    await createBackup(directory, "2026-07-18T10-00-00.000Z", 17);
    const oldPath = await createBackup(
      directory,
      "2026-01-01T00-00-00.000Z",
      18,
    );
    await createSignedSidecars(oldPath);
    const trustedSignaturePublicKeyPath = await createPublicKeyFile(directory);
    await writeFile(
      `${oldPath}.manifest.json`,
      "{\"tampered\":true}",
      { mode: 0o600 },
    );

    await expect(enforceOperationsBackupRetention({
      directory,
      justVerifiedPath,
      now: new Date("2026-07-19T12:00:00.000Z"),
      policy: {
        maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
        maxDeletions: 1,
        minimumRecentBackups: 1,
      },
      sourcePath,
      trustedSignatureOwnerId: currentUserId(),
      trustedSignaturePublicKeyPath,
    })).rejects.toMatchObject({
      code: "OPERATIONS_BACKUP_RETENTION_SCAN_FAILED",
    });
    await expect(lstat(oldPath)).resolves.toBeDefined();
    await expect(lstat(`${oldPath}.manifest.json.sig`)).resolves.toBeDefined();
  });

  it("does not count a signed bundle whose database no longer matches its manifest", async () => {
    const directory = await tempRoot();
    const sourcePath = join(directory, "runtime.sqlite");
    await writeFile(sourcePath, "source", { mode: 0o600 });
    const justVerifiedPath = await createBackup(
      directory,
      "2026-07-19T10-00-00.000Z",
      19,
    );
    const oldPath = await createBackup(
      directory,
      "2026-01-01T00-00-00.000Z",
      21,
    );
    await createSignedSidecars(oldPath);
    const trustedSignaturePublicKeyPath = await createPublicKeyFile(directory);
    await writeFile(oldPath, "tampered-backup", { mode: 0o600 });

    await expect(enforceOperationsBackupRetention({
      directory,
      justVerifiedPath,
      now: new Date("2026-07-19T12:00:00.000Z"),
      policy: {
        maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
        maxDeletions: 1,
        minimumRecentBackups: 1,
      },
      sourcePath,
      trustedSignatureOwnerId: currentUserId(),
      trustedSignaturePublicKeyPath,
    })).rejects.toMatchObject({
      code: "OPERATIONS_BACKUP_RETENTION_SCAN_FAILED",
    });
    await expect(lstat(oldPath)).resolves.toBeDefined();
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

async function createSignedSidecars(path: string): Promise<void> {
  const adminSecurityState = "{}";
  const database = await readFile(path);
  const body = Object.freeze({
    backupFile: basename(path),
    adminSecurityState: Object.freeze({
      contractVersion: "1",
      file: `${basename(path)}.admin-security.json`,
      revision: 0,
      sha256: createHash("sha256")
        .update(adminSecurityState)
        .digest("hex"),
      sizeBytes: Buffer.byteLength(adminSecurityState),
      stateVersion: 1,
    }),
    contractVersion: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    encryptionState: "BACKUP_AT_REST_ENCRYPTION_REQUIRED",
    integrityCheck: "ok",
    releaseCommit: "a".repeat(40),
    restoreProbe: "PASSED",
    rawBootstrapIncluded: false,
    schemaVersion: 1,
    secretsIncluded: false,
    sha256: createHash("sha256").update(database).digest("hex"),
    sizeBytes: database.byteLength,
  });
  const manifest = JSON.stringify({
    ...body,
    manifestFingerprint: createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
  });
  await Promise.all([
    writeFile(`${path}.admin-security.json`, adminSecurityState, { mode: 0o600 }),
    writeFile(`${path}.manifest.json`, manifest, { mode: 0o600 }),
  ]);
  await writeFile(
    `${path}.manifest.json.sig`,
    `${JSON.stringify({
      contractVersion: "1",
      kind: "BACKUP_MANIFEST_SIGNATURE",
      manifestFile: `${basename(path)}.manifest.json`,
      manifestSha256: createHash("sha256").update(manifest).digest("hex"),
      publicKeySha256: SIGNING_PUBLIC_FINGERPRINT,
      signature: sign(
        null,
        Buffer.from(manifest),
        SIGNING_KEYS.privateKey,
      ).toString("base64"),
      signatureAlgorithm: "ED25519",
    })}\n`,
    { mode: 0o640 },
  );
}

async function createPublicKeyFile(directory: string): Promise<string> {
  const path = join(directory, "release-acceptance-ed25519.pub.pem");
  await writeFile(path, SIGNING_PUBLIC_PEM, { mode: 0o644 });
  return path;
}

function currentUserId(): number {
  const value = process.getuid?.();
  if (value === undefined) throw new Error("test requires a local user identity");
  return value;
}
