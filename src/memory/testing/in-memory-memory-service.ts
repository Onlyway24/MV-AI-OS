import {
  MemoryConflictError,
  MemoryPermissionError,
  MemoryValidationError,
} from "../memory-error.js";
import type {
  MemoryExcerpt,
  MemoryQuery,
  MemoryRetrievalResult,
} from "../memory-query.js";
import { MemoryQueryValidator } from "../memory-query-validator.js";
import type { MemoryRecord } from "../memory-record.js";
import { MemoryRecordValidator } from "../memory-record-validator.js";
import type {
  MemoryDeleteRequest,
  MemoryService,
  MemoryWriteRequest,
} from "../memory-service.js";
import type { MemoryScope } from "../memory-scope.js";
import { MemoryScopeValidator } from "../memory-scope-validator.js";
import type { Clock } from "../../ports/clock.js";
import { isRfc3339Timestamp } from "../../validation/primitives.js";

export class InMemoryMemoryService implements MemoryService {
  readonly #clock: Clock;
  readonly #queryValidator = new MemoryQueryValidator();
  readonly #recordValidator = new MemoryRecordValidator();
  readonly #scopeValidator = new MemoryScopeValidator();
  readonly #records = new Map<string, MemoryRecord>();

  public constructor(initialRecords: readonly unknown[], clock: Clock) {
    this.#clock = clock;
    for (const candidate of initialRecords) {
      const validation = this.#recordValidator.validate(candidate);
      if (!validation.ok) {
        throw validationError(
          "Initial memory record failed validation",
          validation.issues,
        );
      }
      if (this.#records.has(validation.value.memoryId)) {
        throw new MemoryConflictError("Memory ID is registered more than once", {
          memoryId: validation.value.memoryId,
        });
      }
      this.#records.set(
        validation.value.memoryId,
        freezeRecord(validation.value),
      );
    }
  }

  public retrieve(query: MemoryQuery): Promise<MemoryRetrievalResult> {
    return Promise.resolve().then(() => {
      const validation = this.#queryValidator.validate(query);
      if (!validation.ok) {
        throw validationError(
          "Memory query failed validation",
          validation.issues,
        );
      }

      const validQuery = validation.value;
      this.#assertReadPermissions(validQuery);
      const normalizedText = validQuery.text?.toLowerCase();
      const now = this.#now();
      const records = [...this.#records.values()]
        .filter((record) =>
          this.#isVisible(record, validQuery, normalizedText, now),
        )
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            left.memoryId.localeCompare(right.memoryId),
        )
        .slice(0, validQuery.limit)
        .map(toExcerpt);

      return Object.freeze({
        queryId: validQuery.queryId,
        records: Object.freeze(records),
      });
    });
  }

  public write(request: MemoryWriteRequest): Promise<MemoryRecord> {
    return Promise.resolve().then(() => {
      const scopeValidation = this.#scopeValidator.validate(request.scope);
      const recordValidation = this.#recordValidator.validate(request.record);
      if (!scopeValidation.ok) {
        throw validationError(
          "Memory write scope failed validation",
          scopeValidation.issues,
        );
      }
      if (!recordValidation.ok) {
        throw validationError(
          "Memory write record failed validation",
          recordValidation.issues,
        );
      }

      const scope = scopeValidation.value;
      const record = recordValidation.value;
      this.#assertWriteScope(scope, record);
      if (this.#records.has(record.memoryId)) {
        throw new MemoryConflictError("Memory ID already exists", {
          memoryId: record.memoryId,
        });
      }

      const frozen = freezeRecord(record);
      this.#records.set(record.memoryId, frozen);
      return frozen;
    });
  }

  public delete(request: MemoryDeleteRequest): Promise<boolean> {
    return Promise.resolve().then(() => {
      const scopeValidation = this.#scopeValidator.validate(request.scope);
      if (!scopeValidation.ok || !isRfc3339Timestamp(request.deletedAt)) {
        throw new MemoryValidationError("Memory deletion request is invalid");
      }

      const existing = this.#records.get(request.memoryId);
      if (existing === undefined) {
        return false;
      }
      this.#assertWriteScope(scopeValidation.value, existing);
      const candidate = {
        ...existing,
        deletedAt: request.deletedAt,
        updatedAt: request.deletedAt,
      };
      const validation = this.#recordValidator.validate(candidate);
      if (!validation.ok) {
        throw validationError(
          "Deleted memory record failed validation",
          validation.issues,
        );
      }

      this.#records.set(request.memoryId, freezeRecord(validation.value));
      return true;
    });
  }

  #assertReadPermissions(query: MemoryQuery): void {
    for (const category of query.categories) {
      const permission = `memory:read:${category}` as const;
      if (!query.scope.permissions.includes(permission)) {
        throw new MemoryPermissionError(
          "Memory read permission is not granted",
          { category, permission },
        );
      }
    }
  }

  #assertWriteScope(scope: MemoryScope, record: MemoryRecord): void {
    if (
      scope.workspaceId !== record.workspaceId ||
      (record.visibility === "owner" && scope.actorId !== record.ownerId) ||
      (record.category === "working" && scope.taskId !== record.taskId) ||
      (record.category === "conversation" &&
        scope.sessionId !== record.sessionId)
    ) {
      throw new MemoryPermissionError(
        "Memory write is outside the active scope",
        { memoryId: record.memoryId },
      );
    }
  }

  #isVisible(
    record: MemoryRecord,
    query: MemoryQuery,
    normalizedText: string | undefined,
    now: number,
  ): boolean {
    if (
      record.workspaceId !== query.scope.workspaceId ||
      !query.categories.includes(record.category) ||
      record.deletedAt !== undefined ||
      (record.expiresAt !== undefined &&
        Date.parse(record.expiresAt) <= now) ||
      (record.visibility === "owner" &&
        record.ownerId !== query.scope.actorId) ||
      !record.permissionTags.every((tag) =>
        query.scope.permissionTags.includes(tag),
      )
    ) {
      return false;
    }

    if (
      (record.category === "working" &&
        record.taskId !== query.scope.taskId) ||
      (record.category === "conversation" &&
        record.sessionId !== query.scope.sessionId) ||
      (record.category === "user" &&
        record.ownerId !== query.scope.actorId)
    ) {
      return false;
    }

    if (normalizedText === undefined) {
      return true;
    }
    return `${record.searchableText ?? ""} ${JSON.stringify(record.content)}`
      .toLowerCase()
      .includes(normalizedText);
  }

  #now(): number {
    const value = this.#clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new MemoryValidationError("Clock returned an invalid date");
    }
    return value.getTime();
  }
}

function toExcerpt(record: MemoryRecord): MemoryExcerpt {
  return Object.freeze({
    category: record.category,
    content: record.content,
    createdAt: record.createdAt,
    memoryId: record.memoryId,
    provenance: Object.freeze({ ...record.provenance }),
    sensitivity: record.sensitivity,
  });
}

function freezeRecord(record: MemoryRecord): MemoryRecord {
  return Object.freeze({
    ...record,
    content: Object.freeze({ ...record.content }),
    permissionTags: Object.freeze([...record.permissionTags]),
    provenance: Object.freeze({ ...record.provenance }),
  });
}

function validationError(
  message: string,
  issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }[],
): MemoryValidationError {
  return new MemoryValidationError(message, {
    issues: issues.map(({ code, message: detail, path }) => ({
      code,
      message: detail,
      path,
    })),
  });
}
