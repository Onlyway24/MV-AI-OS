import type {
  MemoryRepository,
  MemoryRepositorySearch,
  MemoryUpdateExpectation,
} from "../memory-repository.js";
import {
  validateMemoryOwnership,
  validateMemoryRepositorySearch,
  validateMemoryUpdateExpectation,
} from "../memory-repository-validation.js";
import type { MemoryRecord } from "../memory-record.js";
import { MemoryRecordValidator } from "../memory-record-validator.js";
import {
  compareMemoryRecords,
  matchesMemorySearch,
} from "../memory-retrieval.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";

export class InMemoryMemoryRepository implements MemoryRepository {
  readonly #records = new Map<string, MemoryRecord>();
  readonly #validator = new MemoryRecordValidator();

  public constructor(initialRecords: readonly unknown[] = []) {
    for (const candidate of initialRecords) {
      const record = this.#validatedRecord(candidate);
      if (this.#records.has(record.memoryId)) {
        throw new RepositoryConflictError(
          "Memory ID is registered more than once",
          { memoryId: record.memoryId },
        );
      }
      this.#records.set(record.memoryId, cloneFrozen(record));
    }
  }

  public getById(
    memoryId: string,
  ): Promise<MemoryRecord | undefined> {
    const record = this.#records.get(memoryId);
    return Promise.resolve(
      record === undefined ? undefined : cloneFrozen(record),
    );
  }

  public insert(record: MemoryRecord): Promise<void> {
    return Promise.resolve().then(() => {
      const validRecord = this.#validatedRecord(record);
      if (this.#records.has(validRecord.memoryId)) {
        throw new RepositoryConflictError("Memory ID already exists", {
          memoryId: validRecord.memoryId,
        });
      }
      this.#records.set(
        validRecord.memoryId,
        cloneFrozen(validRecord),
      );
    });
  }

  public update(
    record: MemoryRecord,
    expectation: MemoryUpdateExpectation,
  ): Promise<void> {
    return Promise.resolve().then(() => {
      const validRecord = this.#validatedRecord(record);
      validateMemoryUpdateExpectation(expectation);
      const existing = this.#records.get(validRecord.memoryId);
      if (existing === undefined) {
        throw new RepositoryConflictError("Memory does not exist", {
          memoryId: validRecord.memoryId,
        });
      }
      if (existing.updatedAt !== expectation.updatedAt) {
        throw new RepositoryConflictError(
          "Memory changed after it was read",
          { memoryId: validRecord.memoryId },
        );
      }
      validateMemoryOwnership(existing, validRecord);
      this.#records.set(
        validRecord.memoryId,
        cloneFrozen(validRecord),
      );
    });
  }

  public search(
    query: MemoryRepositorySearch,
  ): Promise<readonly MemoryRecord[]> {
    return Promise.resolve().then(() => {
      validateMemoryRepositorySearch(query);
      return Object.freeze(
        [...this.#records.values()]
          .filter((record) => matchesMemorySearch(record, query))
          .sort(compareMemoryRecords)
          .slice(0, query.limit)
          .map(cloneFrozen),
      );
    });
  }

  #validatedRecord(value: unknown): MemoryRecord {
    const validation = this.#validator.validate(value);
    if (!validation.ok) {
      throw new RepositoryValidationError(
        "Memory record failed validation",
        {
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }
    return validation.value;
  }
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
