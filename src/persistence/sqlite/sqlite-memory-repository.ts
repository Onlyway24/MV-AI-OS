import type { DatabaseSync } from "node:sqlite";

import type {
  MemoryRepository,
  MemoryRepositorySearch,
  MemoryUpdateExpectation,
} from "../../memory/memory-repository.js";
import {
  validateMemoryOwnership,
  validateMemoryRepositorySearch,
  validateMemoryUpdateExpectation,
} from "../../memory/memory-repository-validation.js";
import type { MemoryRecord } from "../../memory/memory-record.js";
import {
  compareMemoryRecords,
  matchesMemorySearch,
} from "../../memory/memory-retrieval.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { SqliteConnectionConfig } from "./sqlite-connection-config.js";
import { openSqliteDatabase } from "./sqlite-database.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import {
  readNullableTextColumn,
  readTextColumn,
  SqliteRecordCodec,
} from "./sqlite-record-codec.js";

export class SqliteMemoryRepository implements MemoryRepository {
  public readonly config: Readonly<SqliteConnectionConfig>;

  readonly #codec = new SqliteRecordCodec();
  readonly #database: DatabaseSync;
  #tail: Promise<void> = Promise.resolve();
  #acceptingOperations = true;
  #closePromise: Promise<void> | undefined;

  public constructor(config: unknown) {
    const opened = openSqliteDatabase(config);
    this.config = opened.config;
    this.#database = opened.database;
  }

  public getById(
    memoryId: string,
  ): Promise<MemoryRecord | undefined> {
    return this.#enqueue(() =>
      withSqliteErrors("memory.get_by_id", () => {
        const row = this.#selectById(memoryId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(record: MemoryRecord): Promise<void> {
    return this.#enqueue(() => {
      this.#transaction("memory.insert", () => {
        const encoded = this.#codec.encodeMemory(record);
        if (this.#selectById(encoded.value.memoryId) !== undefined) {
          throw new RepositoryConflictError(
            "Memory ID already exists",
            { memoryId: encoded.value.memoryId },
          );
        }
        try {
          this.#database
            .prepare(
              "INSERT INTO memory_records (memory_id, workspace_id, owner_id, category, visibility, task_id, session_id, created_at, updated_at, expires_at, deleted_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              encoded.value.memoryId,
              encoded.value.workspaceId,
              encoded.value.ownerId,
              encoded.value.category,
              encoded.value.visibility,
              taskIdOf(encoded.value) ?? null,
              sessionIdOf(encoded.value) ?? null,
              encoded.value.createdAt,
              encoded.value.updatedAt,
              encoded.value.expiresAt ?? null,
              encoded.value.deletedAt ?? null,
              encoded.json,
            );
        } catch (error) {
          if (isSqliteConstraintError(error)) {
            throw new RepositoryConflictError(
              "Memory ID already exists",
              { memoryId: encoded.value.memoryId },
            );
          }
          throw new SqliteRepositoryError(
            "SQLite memory insertion failed",
            "memory.insert",
          );
        }
      });
    });
  }

  public update(
    record: MemoryRecord,
    expectation: MemoryUpdateExpectation,
  ): Promise<void> {
    return this.#enqueue(() => {
      this.#transaction("memory.update", () => {
        validateMemoryUpdateExpectation(expectation);
        const encoded = this.#codec.encodeMemory(record);
        const existingRow = this.#selectById(encoded.value.memoryId);
        if (existingRow === undefined) {
          throw new RepositoryConflictError("Memory does not exist", {
            memoryId: encoded.value.memoryId,
          });
        }
        const existing = this.#decodeRow(existingRow);
        if (existing.updatedAt !== expectation.updatedAt) {
          throw new RepositoryConflictError(
            "Memory changed after it was read",
            { memoryId: encoded.value.memoryId },
          );
        }
        validateMemoryOwnership(existing, encoded.value);

        const result = this.#database
          .prepare(
            "UPDATE memory_records SET updated_at = ?, expires_at = ?, deleted_at = ?, record_json = ? WHERE memory_id = ? AND updated_at = ?",
          )
          .run(
            encoded.value.updatedAt,
            encoded.value.expiresAt ?? null,
            encoded.value.deletedAt ?? null,
            encoded.json,
            encoded.value.memoryId,
            expectation.updatedAt,
          );
        if (!isSingleChange(result.changes)) {
          throw new RepositoryConflictError(
            "Memory changed during update",
            { memoryId: encoded.value.memoryId },
          );
        }
      });
    });
  }

  public search(
    query: MemoryRepositorySearch,
  ): Promise<readonly MemoryRecord[]> {
    return this.#enqueue(() =>
      withSqliteErrors("memory.search", () => {
        validateMemoryRepositorySearch(query);
        const placeholders = query.categories.map(() => "?").join(", ");
        const rows = this.#database
          .prepare(
            `SELECT memory_id, workspace_id, owner_id, category, visibility, task_id, session_id, created_at, updated_at, expires_at, deleted_at, record_json FROM memory_records WHERE workspace_id = ? AND category IN (${placeholders})`,
          )
          .all(query.workspaceId, ...query.categories);
        return Object.freeze(
          rows
            .map((row) => this.#decodeRow(row))
            .filter((record) => matchesMemorySearch(record, query))
            .sort(compareMemoryRecords)
            .slice(0, query.limit),
        );
      }),
    );
  }

  public close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return this.#closePromise;
    }

    this.#acceptingOperations = false;
    this.#closePromise = this.#tail.then(() => {
      withSqliteErrors("connection.close", () => {
        this.#database.close();
      });
    });
    this.#tail = this.#closePromise;
    return this.#closePromise;
  }

  #selectById(
    memoryId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT memory_id, workspace_id, owner_id, category, visibility, task_id, session_id, created_at, updated_at, expires_at, deleted_at, record_json FROM memory_records WHERE memory_id = ?",
      )
      .get(memoryId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): MemoryRecord {
    const record = this.#codec.decodeMemory(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "memory_id") !== record.memoryId ||
      readTextColumn(row, "workspace_id") !== record.workspaceId ||
      readTextColumn(row, "owner_id") !== record.ownerId ||
      readTextColumn(row, "category") !== record.category ||
      readTextColumn(row, "visibility") !== record.visibility ||
      readNullableTextColumn(row, "task_id") !== taskIdOf(record) ||
      readNullableTextColumn(row, "session_id") !== sessionIdOf(record) ||
      readTextColumn(row, "created_at") !== record.createdAt ||
      readTextColumn(row, "updated_at") !== record.updatedAt ||
      readNullableTextColumn(row, "expires_at") !== record.expiresAt ||
      readNullableTextColumn(row, "deleted_at") !== record.deletedAt
    ) {
      throw new RepositoryValidationError(
        "SQLite memory columns do not match the stored record",
        { memoryId: record.memoryId },
      );
    }
    return record;
  }

  #transaction<T>(operation: string, action: () => T): T {
    return withSqliteErrors(operation, () => {
      this.#database.exec("BEGIN IMMEDIATE");
      try {
        const result = action();
        this.#database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.#database.exec("ROLLBACK");
        } catch {
          throw new SqliteRepositoryError(
            "The SQLite memory operation could not be rolled back",
            `${operation}.rollback`,
          );
        }
        throw error;
      }
    });
  }

  #enqueue<T>(operation: () => T): Promise<T> {
    if (!this.#acceptingOperations) {
      return Promise.reject(
        new SqliteRepositoryError(
          "The SQLite memory repository is closed",
          "memory.operation",
        ),
      );
    }

    const execution = this.#tail.then(operation);
    this.#tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }
}

function taskIdOf(record: MemoryRecord): string | undefined {
  return record.category === "working" || record.category === "operational"
    ? record.taskId
    : undefined;
}

function sessionIdOf(record: MemoryRecord): string | undefined {
  return record.category === "conversation"
    ? record.sessionId
    : undefined;
}

function isSingleChange(value: number | bigint): boolean {
  return value === 1 || value === 1n;
}
