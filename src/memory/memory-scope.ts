import type { MemoryCategory } from "./memory-record.js";

export type MemoryReadPermission = `memory:read:${MemoryCategory}`;

const MEMORY_READ_PERMISSIONS = new Set<MemoryReadPermission>([
  "memory:read:conversation",
  "memory:read:operational",
  "memory:read:semantic",
  "memory:read:user",
  "memory:read:working",
]);

export function isMemoryReadPermission(
  value: string,
): value is MemoryReadPermission {
  return MEMORY_READ_PERMISSIONS.has(value as MemoryReadPermission);
}

export interface MemoryScope {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly taskId?: string;
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly permissions: readonly MemoryReadPermission[];
  readonly permissionTags: readonly string[];
}
