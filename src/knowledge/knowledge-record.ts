import type { JsonObject } from "../contracts/json.js";
import type { KnowledgeSource } from "./knowledge-source.js";

export const KNOWLEDGE_SCHEMA_VERSION = "1" as const;

export type KnowledgeVisibility = "actor" | "workspace";

export interface KnowledgeRecord {
  readonly schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION;
  readonly knowledgeId: string;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly visibility: KnowledgeVisibility;
  readonly requiredScopes: readonly string[];
  readonly permissionTags: readonly string[];
  readonly source: KnowledgeSource;
  readonly title: string;
  readonly content: JsonObject;
  readonly searchableText?: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly verifiedAt: string;
  readonly expiresAt?: string;
  readonly deletedAt?: string;
}
