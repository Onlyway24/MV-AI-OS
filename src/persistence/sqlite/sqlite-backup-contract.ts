import type { JsonObject } from "../../contracts/json.js";
import { CoreError } from "../../errors/core-error.js";
import type { ValidationIssue } from "../../validation/validation.js";
import type { SQLITE_SCHEMA_VERSION } from "./sqlite-schema.js";

export const SQLITE_BACKUP_CONTRACT_VERSION = "1" as const;
export const MAX_SQLITE_BACKUP_PATH_LENGTH = 4096;
export const MAX_SQLITE_BACKUP_TIMEOUT_MS = 60_000;

export interface SqliteBackupConfig {
  readonly contractVersion: typeof SQLITE_BACKUP_CONTRACT_VERSION;
  readonly destinationPath: string;
  readonly overwriteDestination: boolean;
  readonly sourcePath: string;
  readonly timeoutMs: number;
}

export interface SqliteRestoreConfig {
  readonly backupPath: string;
  readonly contractVersion: typeof SQLITE_BACKUP_CONTRACT_VERSION;
  readonly destinationPath: string;
  readonly overwriteDestination: boolean;
  readonly timeoutMs: number;
}

export interface SqliteBackupResult {
  readonly backupPath: string;
  readonly contractVersion: typeof SQLITE_BACKUP_CONTRACT_VERSION;
  readonly pageCount: number;
  readonly schemaVersion: typeof SQLITE_SCHEMA_VERSION;
  readonly sourcePath: string;
}

export interface SqliteRestoreResult {
  readonly backupPath: string;
  readonly contractVersion: typeof SQLITE_BACKUP_CONTRACT_VERSION;
  readonly destinationPath: string;
  readonly schemaVersion: typeof SQLITE_SCHEMA_VERSION;
}

export class SqliteBackupConfigurationError extends CoreError {
  public constructor(issues: readonly ValidationIssue[]) {
    super({
      category: "validation",
      code: "sqlite_backup_configuration_invalid",
      details: {
        issues: issues.map(({ code, message, path }) => ({
          code,
          message,
          path,
        })),
      },
      message: "SQLite backup or restore configuration is invalid",
      stage: "sqlite_backup_configuration",
    });
  }
}

export type SqliteBackupRestoreErrorCode =
  | "sqlite_backup_failed"
  | "sqlite_restore_failed"
  | "sqlite_backup_path_invalid"
  | "sqlite_restore_path_invalid";

export class SqliteBackupRestoreError extends CoreError {
  public constructor(
    code: SqliteBackupRestoreErrorCode,
    message: string,
    operation: string,
    details: JsonObject = {},
  ) {
    super({
      category: "persistence",
      code,
      details: {
        operation,
        ...details,
      },
      message,
      stage: "sqlite_backup_restore",
    });
  }
}
