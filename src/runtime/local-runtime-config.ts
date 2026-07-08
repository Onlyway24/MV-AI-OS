import type { SqliteConnectionConfig } from "../persistence/sqlite/sqlite-connection-config.js";
import type { EffectivePermission } from "../policy/effective-permissions.js";

export const LOCAL_RUNTIME_CONTRACT_VERSION = "1" as const;

export type LocalContentAgentMode =
  | "deterministic"
  | "model-backed-deterministic"
  | "model-backed-openai";

export type LocalModelProviderId = "openai";

export interface LocalOpenAIModelProviderConfig {
  readonly apiKeySecretId: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly providerId: "openai";
}

export type LocalModelProviderConfig = LocalOpenAIModelProviderConfig;

export interface LocalRuntimePermissionConfig {
  readonly actorGrants: readonly EffectivePermission[];
  readonly policyGrants: readonly EffectivePermission[];
  readonly taskGrants: readonly EffectivePermission[];
}

export interface LocalRuntimeConfig {
  readonly actorId: string;
  readonly contractVersion: typeof LOCAL_RUNTIME_CONTRACT_VERSION;
  readonly contentAgentMode: LocalContentAgentMode;
  readonly modelProvider?: LocalModelProviderConfig;
  readonly permissions: LocalRuntimePermissionConfig;
  readonly sqlite: SqliteConnectionConfig;
  readonly workspaceId: string;
}
