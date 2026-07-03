import type { KnowledgeQuery } from "./knowledge-query.js";
import type { KnowledgeSearchResult } from "./knowledge-search-result.js";

export interface KnowledgeService {
  search(query: KnowledgeQuery): Promise<KnowledgeSearchResult>;
}
