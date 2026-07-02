import type { MemoryQuery, MemoryRetrievalResult } from "./memory-query.js";
import type { MemoryRecord } from "./memory-record.js";
import type { MemoryScope } from "./memory-scope.js";

export interface MemoryWriteRequest {
  readonly scope: MemoryScope;
  readonly record: MemoryRecord;
}

export interface MemoryDeleteRequest {
  readonly scope: MemoryScope;
  readonly memoryId: string;
  readonly deletedAt: string;
}

export interface MemoryReader {
  retrieve(query: MemoryQuery): Promise<MemoryRetrievalResult>;
}

export interface MemoryWriter {
  write(request: MemoryWriteRequest): Promise<MemoryRecord>;
  delete(request: MemoryDeleteRequest): Promise<boolean>;
}

export interface MemoryService extends MemoryReader, MemoryWriter {}
