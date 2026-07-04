import type { SqliteConnectionConfig } from "../persistence/sqlite/sqlite-connection-config.js";
import type { EffectivePermission } from "../policy/effective-permissions.js";

export const LOCAL_RUNTIME_CONTRACT_VERSION = "1" as const;

export type LocalContentAgentMode =
  | "deterministic"
  | "model-backed-deterministic";

export interface LocalRuntimePermissionConfig {
  readonly actorGrants: readonly EffectivePermission[];
  readonly policyGrants: readonly EffectivePermission[];
  readonly taskGrants: readonly EffectivePermission[];
}

export interface LocalRuntimeConfig {
  readonly actorId: string;
  readonly contractVersion: typeof LOCAL_RUNTIME_CONTRACT_VERSION;
  readonly contentAgentMode: LocalContentAgentMode;
  readonly permissions: LocalRuntimePermissionConfig;
  readonly sqlite: SqliteConnectionConfig;
  readonly workspaceId: string;
}
