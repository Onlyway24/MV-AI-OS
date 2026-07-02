import type { MemoryCategory } from "./memory-record.js";

export type MemoryReadPermission = `memory:read:${MemoryCategory}`;

export interface MemoryScope {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly taskId?: string;
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly permissions: readonly MemoryReadPermission[];
  readonly permissionTags: readonly string[];
}
