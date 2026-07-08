import { isAbsolute } from "node:path";

import {
  MAX_SQLITE_BACKUP_PATH_LENGTH,
  MAX_SQLITE_BACKUP_TIMEOUT_MS,
  SQLITE_BACKUP_CONTRACT_VERSION,
  type SqliteBackupConfig,
  type SqliteRestoreConfig,
} from "./sqlite-backup-contract.js";
import {
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
} from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

const BACKUP_KEYS = new Set([
  "contractVersion",
  "destinationPath",
  "overwriteDestination",
  "sourcePath",
  "timeoutMs",
]);
const RESTORE_KEYS = new Set([
  "backupPath",
  "contractVersion",
  "destinationPath",
  "overwriteDestination",
  "timeoutMs",
]);

export class SqliteBackupConfigValidator
  implements Validator<SqliteBackupConfig>
{
  public validate(value: unknown): ValidationResult<SqliteBackupConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "SQLite backup configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, BACKUP_KEYS, issues);
    const contractVersion = readContractVersion(record, issues);
    const sourcePath = readLocalPath(record, "sourcePath", issues);
    const destinationPath = readLocalPath(
      record,
      "destinationPath",
      issues,
    );
    const overwriteDestination = readRequiredBoolean(
      record,
      "overwriteDestination",
      issues,
    );
    const timeoutMs = readTimeout(record, issues);

    if (
      sourcePath !== undefined &&
      destinationPath !== undefined &&
      sourcePath === destinationPath
    ) {
      issues.push({
        code: "invalid_value",
        message: "sourcePath and destinationPath must be different",
        path: "destinationPath",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== SQLITE_BACKUP_CONTRACT_VERSION ||
      sourcePath === undefined ||
      destinationPath === undefined ||
      overwriteDestination === undefined ||
      timeoutMs === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      destinationPath,
      overwriteDestination,
      sourcePath,
      timeoutMs,
    });
  }
}

export class SqliteRestoreConfigValidator
  implements Validator<SqliteRestoreConfig>
{
  public validate(value: unknown): ValidationResult<SqliteRestoreConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "SQLite restore configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, RESTORE_KEYS, issues);
    const contractVersion = readContractVersion(record, issues);
    const backupPath = readLocalPath(record, "backupPath", issues);
    const destinationPath = readLocalPath(
      record,
      "destinationPath",
      issues,
    );
    const overwriteDestination = readRequiredBoolean(
      record,
      "overwriteDestination",
      issues,
    );
    const timeoutMs = readTimeout(record, issues);

    if (
      backupPath !== undefined &&
      destinationPath !== undefined &&
      backupPath === destinationPath
    ) {
      issues.push({
        code: "invalid_value",
        message: "backupPath and destinationPath must be different",
        path: "destinationPath",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== SQLITE_BACKUP_CONTRACT_VERSION ||
      backupPath === undefined ||
      destinationPath === undefined ||
      overwriteDestination === undefined ||
      timeoutMs === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      backupPath,
      contractVersion,
      destinationPath,
      overwriteDestination,
      timeoutMs,
    });
  }
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unexpected",
        message: `${key} is not a supported configuration field`,
        path: key,
      });
    }
  }
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof SQLITE_BACKUP_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== SQLITE_BACKUP_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${SQLITE_BACKUP_CONTRACT_VERSION}`,
      path: "contractVersion",
    });
  }
  return contractVersion === SQLITE_BACKUP_CONTRACT_VERSION
    ? contractVersion
    : undefined;
}

function readLocalPath(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): string | undefined {
  const path = readRequiredString(record, key, issues, "", {
    maxLength: MAX_SQLITE_BACKUP_PATH_LENGTH,
  });
  if (path === undefined) {
    return undefined;
  }
  if (path.includes("\0")) {
    issues.push({
      code: "invalid_value",
      message: `${key} must not contain NUL bytes`,
      path: key,
    });
    return undefined;
  }
  if (path === ":memory:" || !isAbsolute(path)) {
    issues.push({
      code: "invalid_value",
      message: `${key} must be an absolute local filesystem path`,
      path: key,
    });
    return undefined;
  }
  return path;
}

function readTimeout(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): number | undefined {
  const timeoutMs = readRequiredInteger(record, "timeoutMs", issues, "", 1);
  if (
    timeoutMs !== undefined &&
    timeoutMs > MAX_SQLITE_BACKUP_TIMEOUT_MS
  ) {
    issues.push({
      code: "too_large",
      message: `timeoutMs must not exceed ${String(MAX_SQLITE_BACKUP_TIMEOUT_MS)}`,
      path: "timeoutMs",
    });
    return undefined;
  }
  return timeoutMs;
}
