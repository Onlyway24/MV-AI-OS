import type { DatabaseSync } from "node:sqlite";

import type { TaskResponse } from "../../contracts/task-response.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
  RequestIdConflictError,
} from "../../errors/core-error.js";
import { isRfc3339Timestamp } from "../../validation/primitives.js";
import type {
  RequestRepository,
  StoredRequest,
} from "../request-repository.js";
import {
  isSqliteConstraintError,
  SqliteRepositoryError,
  withSqliteErrors,
} from "./sqlite-error.js";
import {
  readTextColumn,
  SqliteRecordCodec,
} from "./sqlite-record-codec.js";
import {
  assertActiveTransaction,
  type SqliteTransactionScope,
} from "./sqlite-transaction-scope.js";

export class SqliteRequestRepository implements RequestRepository {
  readonly #codec: SqliteRecordCodec;
  readonly #database: DatabaseSync;
  readonly #scope: SqliteTransactionScope;

  public constructor(
    database: DatabaseSync,
    scope: SqliteTransactionScope,
    codec: SqliteRecordCodec,
  ) {
    this.#codec = codec;
    this.#database = database;
    this.#scope = scope;
  }

  public getById(
    requestId: string,
  ): Promise<StoredRequest | undefined> {
    assertActiveTransaction(this.#scope);
    return Promise.resolve(
      withSqliteErrors("request.get_by_id", () => {
        const row = this.#selectByRequestId(requestId);
        return row === undefined ? undefined : this.#decodeRow(row);
      }),
    );
  }

  public insert(request: StoredRequest): Promise<void> {
    assertActiveTransaction(this.#scope);
    const encoded = this.#codec.encodeRequest(request);
    if (encoded.value.response !== undefined) {
      throw new RepositoryValidationError(
        "New stored requests must not contain a response",
        { requestId: encoded.value.requestId },
      );
    }
    withSqliteErrors("request.insert", () => {
      const existing = this.#selectByRequestId(encoded.value.requestId);
      if (existing !== undefined) {
        throw new RequestIdConflictError(
          encoded.value.requestId,
          readTextColumn(existing, "task_id"),
        );
      }
      if (this.#selectByTaskId(encoded.value.taskId) !== undefined) {
        throw new RepositoryConflictError(
          "A request already exists for the task ID",
          { taskId: encoded.value.taskId },
        );
      }
      try {
        this.#database
          .prepare(
            "INSERT INTO requests (request_id, task_id, request_fingerprint, has_response, updated_at, record_json) VALUES (?, ?, ?, 0, ?, ?)",
          )
          .run(
            encoded.value.requestId,
            encoded.value.taskId,
            encoded.value.requestFingerprint,
            encoded.value.updatedAt,
            encoded.json,
          );
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          throw new RequestIdConflictError(
            encoded.value.requestId,
            encoded.value.taskId,
          );
        }
        throw new SqliteRepositoryError(
          "SQLite request insertion failed",
          "request.insert",
        );
      }
    });
    return Promise.resolve();
  }

  public saveResponse(
    requestId: string,
    taskId: string,
    response: TaskResponse,
    updatedAt: string,
  ): Promise<void> {
    assertActiveTransaction(this.#scope);
    const validResponse = this.#codec.validateResponse(response);
    if (
      !isRfc3339Timestamp(updatedAt) ||
      validResponse.updatedAt !== updatedAt
    ) {
      throw new RepositoryValidationError(
        "Stored request response timestamp failed validation",
        { requestId, taskId },
      );
    }
    withSqliteErrors("request.save_response", () => {
      const row = this.#selectByRequestId(requestId);
      if (row === undefined) {
        throw new RepositoryConflictError("Request does not exist", {
          requestId,
        });
      }
      const existing = this.#decodeRow(row);
      if (
        existing.taskId !== taskId ||
        validResponse.taskId !== taskId ||
        validResponse.requestId !== requestId
      ) {
        throw new RepositoryConflictError(
          "Response ownership does not match the stored request",
          { requestId, taskId },
        );
      }
      if (existing.response !== undefined) {
        throw new RepositoryConflictError(
          "Request response is already stored",
          { requestId, taskId },
        );
      }
      const updated = this.#codec.encodeRequest({
        ...existing,
        response: validResponse,
        updatedAt,
      });
      const result = this.#database
        .prepare(
          "UPDATE requests SET has_response = 1, updated_at = ?, record_json = ? WHERE request_id = ? AND task_id = ? AND has_response = 0",
        )
        .run(updatedAt, updated.json, requestId, taskId);
      if (!isSingleChange(result.changes)) {
        throw new RepositoryConflictError(
          "Request response changed during update",
          { requestId, taskId },
        );
      }
    });
    return Promise.resolve();
  }

  #selectByRequestId(
    requestId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT request_id, task_id, request_fingerprint, has_response, updated_at, record_json FROM requests WHERE request_id = ?",
      )
      .get(requestId);
  }

  #selectByTaskId(
    taskId: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.#database
      .prepare(
        "SELECT request_id, task_id, request_fingerprint, has_response, updated_at, record_json FROM requests WHERE task_id = ?",
      )
      .get(taskId);
  }

  #decodeRow(row: Readonly<Record<string, unknown>>): StoredRequest {
    const request = this.#codec.decodeRequest(
      readTextColumn(row, "record_json"),
    );
    const hasResponse = row.has_response;
    if (
      readTextColumn(row, "request_id") !== request.requestId ||
      readTextColumn(row, "task_id") !== request.taskId ||
      readTextColumn(row, "request_fingerprint") !==
        request.requestFingerprint ||
      readTextColumn(row, "updated_at") !== request.updatedAt ||
      (hasResponse !== 0 && hasResponse !== 1) ||
      (hasResponse === 1) !== (request.response !== undefined)
    ) {
      throw new RepositoryValidationError(
        "SQLite request columns do not match the stored record",
        { requestId: request.requestId },
      );
    }
    return request;
  }
}

function isSingleChange(value: number | bigint): boolean {
  return value === 1 || value === 1n;
}
