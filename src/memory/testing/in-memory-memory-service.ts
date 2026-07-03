import {
  MemoryConflictError,
  MemoryValidationError,
} from "../memory-error.js";
import type {
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
import { RepositoryBackedMemoryService } from "../repository-backed-memory-service.js";
import { MemoryScopeValidator } from "../memory-scope-validator.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { Clock } from "../../ports/clock.js";
import { InMemoryMemoryRepository } from "./in-memory-memory-repository.js";

export class InMemoryMemoryService implements MemoryService {
  readonly #service: RepositoryBackedMemoryService;

  public constructor(initialRecords: readonly unknown[], clock: Clock) {
    let repository: InMemoryMemoryRepository;
    try {
      repository = new InMemoryMemoryRepository(initialRecords);
    } catch (error) {
      if (error instanceof RepositoryConflictError) {
        throw new MemoryConflictError(
          "Memory ID is registered more than once",
          error.details,
        );
      }
      if (error instanceof RepositoryValidationError) {
        throw new MemoryValidationError(
          "Initial memory record failed validation",
          error.details,
        );
      }
      throw error;
    }
    this.#service = new RepositoryBackedMemoryService({
      clock,
      queryValidator: new MemoryQueryValidator(),
      recordValidator: new MemoryRecordValidator(),
      repository,
      scopeValidator: new MemoryScopeValidator(),
    });
  }

  public retrieve(query: MemoryQuery): Promise<MemoryRetrievalResult> {
    return this.#service.retrieve(query);
  }

  public write(request: MemoryWriteRequest): Promise<MemoryRecord> {
    return this.#service.write(request);
  }

  public delete(request: MemoryDeleteRequest): Promise<boolean> {
    return this.#service.delete(request);
  }
}
