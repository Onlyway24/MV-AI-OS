import type { DatabaseSync } from "node:sqlite";

import type {
  KnowledgeRepository,
  KnowledgeRepositorySearch,
} from "../../knowledge/knowledge-repository.js";
import { validateKnowledgeRepositorySearch } from "../../knowledge/knowledge-repository-validation.js";
import type { KnowledgeRecord } from "../../knowledge/knowledge-record.js";
import {
  compareKnowledgeRecords,
  matchesKnowledgeSearch,
} from "../../knowledge/knowledge-retrieval.js";
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

export class SqliteKnowledgeRepository implements KnowledgeRepository {
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
    knowledgeId: string,
  ): Promise<KnowledgeRecord | undefined> {
    return this.#enqueue(() =>
      withSqliteErrors("knowledge.get_by_id", () => {
        const row = this.#selectById(knowledgeId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(record: KnowledgeRecord): Promise<void> {
    return this.#enqueue(() => {
      this.#transaction("knowledge.insert", () => {
        const encoded = this.#codec.encodeKnowledge(record);
        if (this.#selectById(encoded.value.knowledgeId) !== undefined) {
          throw new RepositoryConflictError(
            "Knowledge ID already exists",
            { knowledgeId: encoded.value.knowledgeId },
          );
        }
        try {
          this.#database
            .prepare(
              "INSERT INTO knowledge_records (knowledge_id, workspace_id, owner_id, visibility, source_type, verified_at, expires_at, deleted_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              encoded.value.knowledgeId,
              encoded.value.workspaceId,
              encoded.value.ownerId,
              encoded.value.visibility,
              encoded.value.source.sourceType,
              encoded.value.verifiedAt,
              encoded.value.expiresAt ?? null,
              encoded.value.deletedAt ?? null,
              encoded.json,
            );
        } catch (error) {
          if (isSqliteConstraintError(error)) {
            throw new RepositoryConflictError(
              "Knowledge ID already exists",
              { knowledgeId: encoded.value.knowledgeId },
            );
          }
          throw new SqliteRepositoryError(
            "SQLite knowledge insertion failed",
            "knowledge.insert",
          );
        }
      });
    });
  }

  public search(
    query: KnowledgeRepositorySearch,
  ): Promise<readonly KnowledgeRecord[]> {
    return this.#enqueue(() =>
      withSqliteErrors("knowledge.search", () => {
        validateKnowledgeRepositorySearch(query);
        const rows = this.#database
          .prepare(
            "SELECT knowledge_id, workspace_id, owner_id, visibility, source_type, verified_at, expires_at, deleted_at, record_json FROM knowledge_records WHERE workspace_id = ?",
          )
          .all(query.workspaceId);
        return Object.freeze(
          rows
            .map((row) => this.#decodeRow(row))
            .filter((record) => matchesKnowledgeSearch(record, query))
            .sort(compareKnowledgeRecords)
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
    knowledgeId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT knowledge_id, workspace_id, owner_id, visibility, source_type, verified_at, expires_at, deleted_at, record_json FROM knowledge_records WHERE knowledge_id = ?",
      )
      .get(knowledgeId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): KnowledgeRecord {
    const record = this.#codec.decodeKnowledge(
      readTextColumn(row, "record_json"),
    );
    if (
      readTextColumn(row, "knowledge_id") !== record.knowledgeId ||
      readTextColumn(row, "workspace_id") !== record.workspaceId ||
      readTextColumn(row, "owner_id") !== record.ownerId ||
      readTextColumn(row, "visibility") !== record.visibility ||
      readTextColumn(row, "source_type") !== record.source.sourceType ||
      readTextColumn(row, "verified_at") !== record.verifiedAt ||
      readNullableTextColumn(row, "expires_at") !== record.expiresAt ||
      readNullableTextColumn(row, "deleted_at") !== record.deletedAt
    ) {
      throw new RepositoryValidationError(
        "SQLite knowledge columns do not match the stored record",
        { knowledgeId: record.knowledgeId },
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
            "The SQLite knowledge operation could not be rolled back",
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
          "The SQLite knowledge repository is closed",
          "knowledge.operation",
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
