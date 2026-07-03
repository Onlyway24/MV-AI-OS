import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { KnowledgeRecord } from "./knowledge-record.js";

export interface KnowledgeSearchResult {
  readonly contractVersion: RequestContractVersion;
  readonly queryId: string;
  readonly records: readonly KnowledgeRecord[];
  readonly searchedAt: string;
}
