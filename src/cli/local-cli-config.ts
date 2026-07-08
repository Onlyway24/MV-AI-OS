import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";

export const LOCAL_CLI_CONTRACT_VERSION = "1" as const;
export const MAX_LOCAL_CLI_CONFIG_BYTES = 65_536;
export const MAX_LOCAL_CLI_REQUEST_BYTES = 1_048_576;

export interface LocalCliConfig {
  readonly contractVersion: typeof LOCAL_CLI_CONTRACT_VERSION;
  readonly maxRequestBytes: number;
  readonly runtime: LocalRuntimeConfig;
}
