import type { EffectivePermission } from "../policy/effective-permissions.js";

export type ToolAccessPermission = Extract<
  EffectivePermission,
  `tool:${string}`
>;

export interface ToolPermission {
  readonly permission: ToolAccessPermission;
  readonly approvalRequired: boolean;
}
