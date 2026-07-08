import { randomUUID } from "node:crypto";
import {
  constants as fileConstants,
  copyFile,
  lstat,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { CoreError } from "../../errors/core-error.js";
import {
  SQLITE_BACKUP_CONTRACT_VERSION,
  SqliteBackupConfigurationError,
  SqliteBackupRestoreError,
  type SqliteBackupConfig,
  type SqliteBackupResult,
  type SqliteRestoreConfig,
  type SqliteRestoreResult,
} from "./sqlite-backup-contract.js";
import {
  SqliteBackupConfigValidator,
  SqliteRestoreConfigValidator,
} from "./sqlite-backup-validator.js";
import {
  SQLITE_SCHEMA_VERSION,
  verifyCurrentSqliteSchema,
} from "./sqlite-schema.js";

export async function createSqliteBackup(
  candidate: unknown,
): Promise<SqliteBackupResult> {
  const config = validateBackupConfig(candidate);
  const sourcePath = resolve(config.sourcePath);
  const destinationPath = resolve(config.destinationPath);
  ensureDifferentPaths(sourcePath, destinationPath, "sqlite_backup");
  await assertReadableFile(sourcePath, "sqlite_backup.source");
  await assertDestinationAvailable(
    destinationPath,
    config.overwriteDestination,
    "sqlite_backup.destination",
  );

  const temporaryPath = createTemporarySiblingPath(destinationPath, "backup");
  let database: DatabaseSync | undefined;
  try {
    database = openReadOnlyDatabase(sourcePath, config.timeoutMs);
    verifyCurrentSqliteSchema(database);
    const pageCount = await backup(database, temporaryPath);
    database.close();
    database = undefined;

    const temporaryDatabase = openReadOnlyDatabase(
      temporaryPath,
      config.timeoutMs,
    );
    try {
      verifyCurrentSqliteSchema(temporaryDatabase);
    } finally {
      temporaryDatabase.close();
    }

    await installTemporaryFile(temporaryPath, destinationPath);
    return Object.freeze({
      backupPath: destinationPath,
      contractVersion: SQLITE_BACKUP_CONTRACT_VERSION,
      pageCount,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      sourcePath,
    });
  } catch (error) {
    return normalizeBackupRestoreError(
      error,
      "sqlite_backup_failed",
      "SQLite backup failed",
      "sqlite_backup",
    );
  } finally {
    database?.close();
    await removeTemporaryFile(temporaryPath);
  }
}

export async function restoreSqliteBackup(
  candidate: unknown,
): Promise<SqliteRestoreResult> {
  const config = validateRestoreConfig(candidate);
  const backupPath = resolve(config.backupPath);
  const destinationPath = resolve(config.destinationPath);
  ensureDifferentPaths(backupPath, destinationPath, "sqlite_restore");
  await assertReadableFile(backupPath, "sqlite_restore.backup");
  await assertDestinationAvailable(
    destinationPath,
    config.overwriteDestination,
    "sqlite_restore.destination",
  );

  const temporaryPath = createTemporarySiblingPath(destinationPath, "restore");
  try {
    const backupDatabase = openReadOnlyDatabase(backupPath, config.timeoutMs);
    try {
      verifyCurrentSqliteSchema(backupDatabase);
    } finally {
      backupDatabase.close();
    }

    await copyFile(
      backupPath,
      temporaryPath,
      fileConstants.COPYFILE_EXCL,
    );
    const temporaryDatabase = openReadOnlyDatabase(
      temporaryPath,
      config.timeoutMs,
    );
    try {
      verifyCurrentSqliteSchema(temporaryDatabase);
    } finally {
      temporaryDatabase.close();
    }

    await installTemporaryFile(temporaryPath, destinationPath);
    return Object.freeze({
      backupPath,
      contractVersion: SQLITE_BACKUP_CONTRACT_VERSION,
      destinationPath,
      schemaVersion: SQLITE_SCHEMA_VERSION,
    });
  } catch (error) {
    return normalizeBackupRestoreError(
      error,
      "sqlite_restore_failed",
      "SQLite restore failed",
      "sqlite_restore",
    );
  } finally {
    await removeTemporaryFile(temporaryPath);
  }
}

function validateBackupConfig(
  candidate: unknown,
): SqliteBackupConfig {
  const validation = new SqliteBackupConfigValidator().validate(candidate);
  if (!validation.ok) {
    throw new SqliteBackupConfigurationError(validation.issues);
  }
  return validation.value;
}

function validateRestoreConfig(
  candidate: unknown,
): SqliteRestoreConfig {
  const validation = new SqliteRestoreConfigValidator().validate(candidate);
  if (!validation.ok) {
    throw new SqliteBackupConfigurationError(validation.issues);
  }
  return validation.value;
}

function openReadOnlyDatabase(path: string, timeoutMs: number): DatabaseSync {
  return new DatabaseSync(path, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    readOnly: true,
    timeout: timeoutMs,
  });
}

async function assertReadableFile(
  path: string,
  operation: string,
): Promise<void> {
  try {
    const file = await stat(path);
    if (!file.isFile()) {
      throw new SqliteBackupRestoreError(
        operation.startsWith("sqlite_restore")
          ? "sqlite_restore_path_invalid"
          : "sqlite_backup_path_invalid",
        "SQLite backup source must be a regular file",
        operation,
      );
    }
  } catch (error) {
    if (error instanceof SqliteBackupRestoreError) {
      throw error;
    }
    throw new SqliteBackupRestoreError(
      operation.startsWith("sqlite_restore")
        ? "sqlite_restore_path_invalid"
        : "sqlite_backup_path_invalid",
      "SQLite backup source is not readable",
      operation,
    );
  }
}

async function assertDestinationAvailable(
  path: string,
  overwriteDestination: boolean,
  operation: string,
): Promise<void> {
  await assertParentDirectory(dirname(path), operation);
  try {
    const entry = await lstat(path);
    if (!entry.isFile()) {
      throw new SqliteBackupRestoreError(
        operation.startsWith("sqlite_restore")
          ? "sqlite_restore_path_invalid"
          : "sqlite_backup_path_invalid",
        "SQLite backup destination must be a regular file when it exists",
        operation,
      );
    }
    if (!overwriteDestination) {
      throw new SqliteBackupRestoreError(
        operation.startsWith("sqlite_restore")
          ? "sqlite_restore_path_invalid"
          : "sqlite_backup_path_invalid",
        "SQLite backup destination already exists",
        operation,
      );
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }
}

async function assertParentDirectory(
  parentPath: string,
  operation: string,
): Promise<void> {
  try {
    const parent = await stat(parentPath);
    if (!parent.isDirectory()) {
      throw new SqliteBackupRestoreError(
        operation.startsWith("sqlite_restore")
          ? "sqlite_restore_path_invalid"
          : "sqlite_backup_path_invalid",
        "SQLite backup destination parent must be a directory",
        operation,
      );
    }
  } catch (error) {
    if (error instanceof SqliteBackupRestoreError) {
      throw error;
    }
    throw new SqliteBackupRestoreError(
      operation.startsWith("sqlite_restore")
        ? "sqlite_restore_path_invalid"
        : "sqlite_backup_path_invalid",
      "SQLite backup destination parent is not available",
      operation,
    );
  }
}

function ensureDifferentPaths(
  leftPath: string,
  rightPath: string,
  operation: string,
): void {
  if (leftPath === rightPath) {
    throw new SqliteBackupRestoreError(
      operation === "sqlite_restore"
        ? "sqlite_restore_path_invalid"
        : "sqlite_backup_path_invalid",
      "SQLite backup and destination paths must be different",
      operation,
    );
  }
}

function createTemporarySiblingPath(
  destinationPath: string,
  purpose: "backup" | "restore",
): string {
  return resolve(
    dirname(destinationPath),
    `.${basename(destinationPath)}.${purpose}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
}

async function installTemporaryFile(
  temporaryPath: string,
  destinationPath: string,
): Promise<void> {
  await rename(temporaryPath, destinationPath);
}

async function removeTemporaryFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

function normalizeBackupRestoreError(
  error: unknown,
  code: "sqlite_backup_failed" | "sqlite_restore_failed",
  message: string,
  operation: string,
): never {
  if (error instanceof SqliteBackupConfigurationError) {
    throw error;
  }
  if (error instanceof SqliteBackupRestoreError) {
    throw error;
  }
  if (error instanceof CoreError) {
    throw error;
  }
  throw new SqliteBackupRestoreError(code, message, operation);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
