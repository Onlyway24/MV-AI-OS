import type { JsonObject } from "../contracts/json.js";

export const KNOWLEDGE_SOURCE_SCHEMA_VERSION = "1" as const;

export type KnowledgeSourceType =
  | "dataset"
  | "document"
  | "file"
  | "manual"
  | "web";

const KNOWLEDGE_SOURCE_TYPES = new Set<KnowledgeSourceType>([
  "dataset",
  "document",
  "file",
  "manual",
  "web",
]);

export function isKnowledgeSourceType(
  value: string,
): value is KnowledgeSourceType {
  return KNOWLEDGE_SOURCE_TYPES.has(value as KnowledgeSourceType);
}

export interface KnowledgeSource {
  readonly schemaVersion: typeof KNOWLEDGE_SOURCE_SCHEMA_VERSION;
  readonly sourceId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly locator?: string;
  readonly publisher?: string;
  readonly capturedAt: string;
  readonly metadata?: JsonObject;
}
