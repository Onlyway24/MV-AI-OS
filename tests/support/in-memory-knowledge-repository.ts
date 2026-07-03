import type {
  KnowledgeRecord,
  KnowledgeRepository,
  KnowledgeRepositorySearch,
} from "../../src/index.js";
import {
  KnowledgeRecordValidator,
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../src/index.js";
import { validateKnowledgeRepositorySearch } from "../../src/knowledge/knowledge-repository-validation.js";
import {
  compareKnowledgeRecords,
  matchesKnowledgeSearch,
} from "../../src/knowledge/knowledge-retrieval.js";

export class InMemoryKnowledgeRepository
  implements KnowledgeRepository
{
  readonly #records = new Map<string, KnowledgeRecord>();
  readonly #validator = new KnowledgeRecordValidator();

  public constructor(initialRecords: readonly unknown[] = []) {
    for (const candidate of initialRecords) {
      const record = this.#validatedRecord(candidate);
      if (this.#records.has(record.knowledgeId)) {
        throw new RepositoryConflictError(
          "Knowledge ID is registered more than once",
          { knowledgeId: record.knowledgeId },
        );
      }
      this.#records.set(record.knowledgeId, cloneFrozen(record));
    }
  }

  public getById(
    knowledgeId: string,
  ): Promise<KnowledgeRecord | undefined> {
    const record = this.#records.get(knowledgeId);
    return Promise.resolve(
      record === undefined ? undefined : cloneFrozen(record),
    );
  }

  public insert(record: KnowledgeRecord): Promise<void> {
    return Promise.resolve().then(() => {
      const validRecord = this.#validatedRecord(record);
      if (this.#records.has(validRecord.knowledgeId)) {
        throw new RepositoryConflictError("Knowledge ID already exists", {
          knowledgeId: validRecord.knowledgeId,
        });
      }
      this.#records.set(
        validRecord.knowledgeId,
        cloneFrozen(validRecord),
      );
    });
  }

  public search(
    query: KnowledgeRepositorySearch,
  ): Promise<readonly KnowledgeRecord[]> {
    return Promise.resolve().then(() => {
      validateKnowledgeRepositorySearch(query);
      const records = [...this.#records.values()]
        .filter((record) => matchesKnowledgeSearch(record, query))
        .sort(compareKnowledgeRecords)
        .slice(0, query.limit)
        .map(cloneFrozen);
      return Object.freeze(records);
    });
  }

  #validatedRecord(value: unknown): KnowledgeRecord {
    const validation = this.#validator.validate(value);
    if (!validation.ok) {
      throw new RepositoryValidationError(
        "Knowledge record failed validation",
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
