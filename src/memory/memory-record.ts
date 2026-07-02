import type { JsonObject } from "../contracts/json.js";

export const MEMORY_SCHEMA_VERSION = "1" as const;

export type MemoryCategory =
  | "conversation"
  | "operational"
  | "semantic"
  | "user"
  | "working";

export type MemorySensitivity = "internal" | "public" | "sensitive";
export type MemoryVisibility = "owner" | "workspace";

export interface MemoryProvenance {
  readonly source:
    | "agent_proposal"
    | "import"
    | "system"
    | "user"
    | "workflow_result";
  readonly referenceId?: string;
}

export interface BaseMemoryRecord {
  readonly memoryId: string;
  readonly schemaVersion: typeof MEMORY_SCHEMA_VERSION;
  readonly category: MemoryCategory;
  readonly content: JsonObject;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly visibility: MemoryVisibility;
  readonly provenance: MemoryProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly deletedAt?: string;
  readonly sensitivity: MemorySensitivity;
  readonly permissionTags: readonly string[];
  readonly searchableText?: string;
}

export interface WorkingMemoryRecord extends BaseMemoryRecord {
  readonly category: "working";
  readonly taskId: string;
}

export interface ConversationMemoryRecord extends BaseMemoryRecord {
  readonly category: "conversation";
  readonly sessionId: string;
}

export interface UserMemoryRecord extends BaseMemoryRecord {
  readonly category: "user";
  readonly approval: {
    readonly approvedBy: string;
    readonly approvedAt: string;
  };
}

export interface SemanticMemoryRecord extends BaseMemoryRecord {
  readonly category: "semantic";
  readonly confidence: number;
  readonly verification: "disputed" | "unverified" | "verified";
}

export interface OperationalMemoryRecord extends BaseMemoryRecord {
  readonly category: "operational";
  readonly taskId?: string;
}

export type MemoryRecord =
  | ConversationMemoryRecord
  | OperationalMemoryRecord
  | SemanticMemoryRecord
  | UserMemoryRecord
  | WorkingMemoryRecord;
