import type { EffectivePermission } from "../policy/effective-permissions.js";

export interface KnowledgeScope {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly taskId: string;
  readonly agentId?: string;
  readonly allowedScopes: readonly string[];
  readonly permissionTags: readonly string[];
  readonly effectivePermissions: readonly EffectivePermission[];
}
