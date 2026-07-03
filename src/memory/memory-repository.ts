import type { MemoryCategory, MemoryRecord } from "./memory-record.js";

export interface MemoryRepositorySearch {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly categories: readonly MemoryCategory[];
  readonly permissionTags: readonly string[];
  readonly taskId?: string;
  readonly sessionId?: string;
  readonly text?: string;
  readonly activeAt: string;
  readonly limit: number;
}

export interface MemoryUpdateExpectation {
  readonly updatedAt: string;
}

export interface MemoryRepository {
  getById(memoryId: string): Promise<MemoryRecord | undefined>;
  insert(record: MemoryRecord): Promise<void>;
  update(
    record: MemoryRecord,
    expectation: MemoryUpdateExpectation,
  ): Promise<void>;
  search(
    query: MemoryRepositorySearch,
  ): Promise<readonly MemoryRecord[]>;
}
