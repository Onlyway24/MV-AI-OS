import {
  MemoryConflictError,
  MemoryPermissionError,
  MemoryValidationError,
} from "./memory-error.js";
import type {
  MemoryExcerpt,
  MemoryQuery,
  MemoryRetrievalResult,
} from "./memory-query.js";
import type {
  MemoryRepository,
  MemoryRepositorySearch,
} from "./memory-repository.js";
import type { MemoryRecord } from "./memory-record.js";
import {
  compareMemoryRecords,
  matchesMemorySearch,
} from "./memory-retrieval.js";
import type {
  MemoryDeleteRequest,
  MemoryService,
  MemoryWriteRequest,
} from "./memory-service.js";
import type { MemoryScope } from "./memory-scope.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import { isRfc3339Timestamp } from "../validation/primitives.js";
import type {
  ValidationIssue,
  Validator,
} from "../validation/validation.js";

export interface RepositoryBackedMemoryServiceDependencies {
  readonly clock: Clock;
  readonly queryValidator: Validator<MemoryQuery>;
  readonly recordValidator: Validator<MemoryRecord>;
  readonly repository: MemoryRepository;
  readonly scopeValidator: Validator<MemoryScope>;
}

export class RepositoryBackedMemoryService implements MemoryService {
  readonly #dependencies: RepositoryBackedMemoryServiceDependencies;

  public constructor(
    dependencies: RepositoryBackedMemoryServiceDependencies,
  ) {
    this.#dependencies = dependencies;
  }

  public async retrieve(
    query: MemoryQuery,
  ): Promise<MemoryRetrievalResult> {
    const validation = this.#dependencies.queryValidator.validate(query);
    if (!validation.ok) {
      throw validationError(
        "Memory query failed validation",
        validation.issues,
      );
    }

    const validQuery = validation.value;
    assertReadPermissions(validQuery);
    const repositoryQuery = toRepositorySearch(
      validQuery,
      this.#timestamp(),
    );
    const candidates =
      await this.#dependencies.repository.search(repositoryQuery);
    if (candidates.length > validQuery.limit) {
      throw new MemoryValidationError(
        "Memory repository exceeded the requested result limit",
        {
          actual: candidates.length,
          limit: validQuery.limit,
          queryId: validQuery.queryId,
        },
      );
    }

    const records: MemoryRecord[] = [];
    for (const candidate of candidates) {
      const recordValidation =
        this.#dependencies.recordValidator.validate(candidate);
      if (!recordValidation.ok) {
        throw validationError(
          "Memory repository returned an invalid record",
          recordValidation.issues,
        );
      }
      if (!matchesMemorySearch(recordValidation.value, repositoryQuery)) {
        throw new MemoryValidationError(
          "Memory repository returned a record outside the authorized query",
          {
            memoryId: recordValidation.value.memoryId,
            queryId: validQuery.queryId,
          },
        );
      }
      records.push(recordValidation.value);
    }
    records.sort(compareMemoryRecords);

    return Object.freeze({
      queryId: validQuery.queryId,
      records: Object.freeze(records.map(toExcerpt)),
    });
  }

  public async write(request: MemoryWriteRequest): Promise<MemoryRecord> {
    const scopeValidation =
      this.#dependencies.scopeValidator.validate(request.scope);
    if (!scopeValidation.ok) {
      throw validationError(
        "Memory write scope failed validation",
        scopeValidation.issues,
      );
    }
    const recordValidation =
      this.#dependencies.recordValidator.validate(request.record);
    if (!recordValidation.ok) {
      throw validationError(
        "Memory write record failed validation",
        recordValidation.issues,
      );
    }

    const record = recordValidation.value;
    assertWriteScope(scopeValidation.value, record);
    try {
      await this.#dependencies.repository.insert(record);
    } catch (error) {
      if (error instanceof RepositoryConflictError) {
        throw new MemoryConflictError("Memory ID already exists", {
          memoryId: record.memoryId,
        });
      }
      throw error;
    }
    return cloneFrozen(record);
  }

  public async delete(request: MemoryDeleteRequest): Promise<boolean> {
    const scopeValidation =
      this.#dependencies.scopeValidator.validate(request.scope);
    if (!scopeValidation.ok || !isRfc3339Timestamp(request.deletedAt)) {
      throw new MemoryValidationError("Memory deletion request is invalid");
    }

    const existing =
      await this.#dependencies.repository.getById(request.memoryId);
    if (existing === undefined) {
      return false;
    }
    const existingValidation =
      this.#dependencies.recordValidator.validate(existing);
    if (!existingValidation.ok) {
      throw validationError(
        "Memory repository returned an invalid record",
        existingValidation.issues,
      );
    }
    assertWriteScope(scopeValidation.value, existingValidation.value);

    const candidateValidation = this.#dependencies.recordValidator.validate({
      ...existingValidation.value,
      deletedAt: request.deletedAt,
      updatedAt: request.deletedAt,
    });
    if (!candidateValidation.ok) {
      throw validationError(
        "Deleted memory record failed validation",
        candidateValidation.issues,
      );
    }

    try {
      await this.#dependencies.repository.update(
        candidateValidation.value,
        { updatedAt: existingValidation.value.updatedAt },
      );
    } catch (error) {
      if (error instanceof RepositoryConflictError) {
        throw new MemoryConflictError(
          "Memory changed during deletion",
          { memoryId: request.memoryId },
        );
      }
      throw error;
    }
    return true;
  }

  #timestamp(): string {
    const value = this.#dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new MemoryValidationError("Clock returned an invalid date");
    }
    return value.toISOString();
  }
}

function toRepositorySearch(
  query: MemoryQuery,
  activeAt: string,
): MemoryRepositorySearch {
  return Object.freeze({
    activeAt,
    actorId: query.scope.actorId,
    categories: Object.freeze([...query.categories]),
    limit: query.limit,
    permissionTags: Object.freeze([...query.scope.permissionTags]),
    ...(query.scope.sessionId === undefined
      ? {}
      : { sessionId: query.scope.sessionId }),
    ...(query.scope.taskId === undefined
      ? {}
      : { taskId: query.scope.taskId }),
    ...(query.text === undefined ? {} : { text: query.text }),
    workspaceId: query.scope.workspaceId,
  });
}

function assertReadPermissions(query: MemoryQuery): void {
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

function assertWriteScope(
  scope: MemoryScope,
  record: MemoryRecord,
): void {
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

function toExcerpt(record: MemoryRecord): MemoryExcerpt {
  return Object.freeze({
    category: record.category,
    content: cloneFrozen(record.content),
    createdAt: record.createdAt,
    memoryId: record.memoryId,
    provenance: cloneFrozen(record.provenance),
    sensitivity: record.sensitivity,
  });
}

function validationError(
  message: string,
  issues: readonly ValidationIssue[],
): MemoryValidationError {
  return new MemoryValidationError(message, {
    issues: issues.map(({ code, message: detail, path }) => ({
      code,
      message: detail,
      path,
    })),
  });
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
