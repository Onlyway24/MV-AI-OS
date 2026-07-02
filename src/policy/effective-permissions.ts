import type { AgentManifest } from "../agents/agent-manifest.js";
import type { MemoryReadPermission } from "../memory/memory-scope.js";
import { isMemoryReadPermission } from "../memory/memory-scope.js";

export type EffectivePermission =
  | MemoryReadPermission
  | "knowledge:search"
  | "memory:write:proposal"
  | `model:invoke:${string}`
  | `tool:execute:${string}`
  | `tool:read:${string}`
  | `workflow:execute:${string}`
  | `workflow:propose:${string}`;

export interface PermissionGrantSet {
  readonly actorGrants?: readonly EffectivePermission[];
  readonly taskGrants?: readonly EffectivePermission[];
  readonly policyGrants?: readonly EffectivePermission[];
  readonly approvalGrants?: readonly EffectivePermission[];
}

const EXACT_PERMISSIONS = new Set<EffectivePermission>([
  "knowledge:search",
  "memory:write:proposal",
]);
const RESOURCE_PERMISSION_PATTERN =
  /^(?:model:invoke|tool:execute|tool:read|workflow:execute|workflow:propose):[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export function isEffectivePermission(
  value: string,
): value is EffectivePermission {
  return (
    EXACT_PERMISSIONS.has(value as EffectivePermission) ||
    isMemoryReadPermission(value) ||
    RESOURCE_PERMISSION_PATTERN.test(value)
  );
}

export function permissionsDeclaredByAgent(
  manifest: AgentManifest,
): readonly EffectivePermission[] {
  const permissions: EffectivePermission[] = [
    ...manifest.memoryAccess.read.map(
      (category) => `memory:read:${category}` as const,
    ),
    `model:invoke:${manifest.modelProfile}`,
    ...manifest.tools.flatMap(
      (tool): readonly EffectivePermission[] => [
        `tool:execute:${tool}`,
        `tool:read:${tool}`,
      ],
    ),
    ...manifest.workflowProposals.map(
      (workflow) => `workflow:propose:${workflow}` as const,
    ),
  ];

  if (manifest.memoryAccess.proposeWrites) {
    permissions.push("memory:write:proposal");
  }
  if (manifest.knowledgeAccess.some((scope) => scope !== "none")) {
    permissions.push("knowledge:search");
  }

  return normalizedPermissions(permissions);
}

export function calculateEffectivePermissions(
  requestedPermissions: readonly EffectivePermission[],
  grants: PermissionGrantSet,
): readonly EffectivePermission[] {
  const requiredGrantSets = [
    grants.actorGrants ?? [],
    grants.taskGrants ?? [],
    grants.policyGrants ?? [],
    ...(grants.approvalGrants === undefined
      ? []
      : [grants.approvalGrants]),
  ].map((entries) => new Set(entries.filter(isEffectivePermission)));

  return normalizedPermissions(
    requestedPermissions.filter((permission) =>
      requiredGrantSets.every((grantSet) => grantSet.has(permission)),
    ),
  );
}

export function normalizedPermissions(
  permissions: readonly EffectivePermission[],
): readonly EffectivePermission[] {
  return Object.freeze(
    [...new Set(permissions)].sort(comparePermissions),
  );
}

function comparePermissions(
  left: EffectivePermission,
  right: EffectivePermission,
): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
