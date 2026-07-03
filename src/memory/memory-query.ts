import type { JsonObject } from "../contracts/json.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { MemoryCategory } from "./memory-record.js";
import type { MemoryScope } from "./memory-scope.js";

export const MAX_MEMORY_RESULTS = 100;

export interface MemoryQuery {
  readonly contractVersion: RequestContractVersion;
  readonly queryId: string;
  readonly scope: MemoryScope;
  readonly categories: readonly MemoryCategory[];
  readonly text?: string;
  readonly limit: number;
}

export interface MemoryExcerpt {
  readonly memoryId: string;
  readonly category: MemoryCategory;
  readonly content: JsonObject;
  readonly provenance: {
    readonly source: string;
    readonly referenceId?: string;
  };
  readonly sensitivity: "internal" | "public" | "sensitive";
  readonly createdAt: string;
}

export interface MemoryRetrievalResult {
  readonly queryId: string;
  readonly records: readonly MemoryExcerpt[];
}
