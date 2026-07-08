import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";
import type { SecretReference } from "./secret-reference.js";

export const LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION = "1" as const;
export const MAX_LOCAL_APPLICATION_CONFIG_BYTES = 262_144;

export interface LocalApplicationCliConfig {
  readonly maxRequestBytes: number;
}

export interface LocalApplicationConfig {
  readonly cli: LocalApplicationCliConfig;
  readonly contractVersion: typeof LOCAL_APPLICATION_CONFIG_CONTRACT_VERSION;
  readonly runtime: LocalRuntimeConfig;
  readonly secretReferences: readonly SecretReference[];
}
