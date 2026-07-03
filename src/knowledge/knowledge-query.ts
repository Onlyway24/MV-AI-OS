import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { KnowledgeSourceType } from "./knowledge-source.js";
import type { KnowledgeScope } from "./knowledge-scope.js";

export const MAX_KNOWLEDGE_RESULTS = 100;

export interface KnowledgeQuery {
  readonly contractVersion: RequestContractVersion;
  readonly queryId: string;
  readonly scope: KnowledgeScope;
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly sourceTypes?: readonly KnowledgeSourceType[];
  readonly freshAfter?: string;
  readonly limit: number;
}
