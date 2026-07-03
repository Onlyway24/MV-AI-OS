import type { KnowledgeRecord } from "./knowledge-record.js";
import type { KnowledgeSourceType } from "./knowledge-source.js";

export interface KnowledgeRepositorySearch {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly allowedScopes: readonly string[];
  readonly permissionTags: readonly string[];
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly sourceTypes?: readonly KnowledgeSourceType[];
  readonly freshAfter?: string;
  readonly activeAt: string;
  readonly limit: number;
}

export interface KnowledgeRepository {
  getById(knowledgeId: string): Promise<KnowledgeRecord | undefined>;
  insert(record: KnowledgeRecord): Promise<void>;
  search(
    query: KnowledgeRepositorySearch,
  ): Promise<readonly KnowledgeRecord[]>;
}
