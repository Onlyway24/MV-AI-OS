import type { SecretReferenceSource } from "./secret-reference.js";

export const SECRET_VALUE_CONTRACT_VERSION = "1" as const;
export const MAX_SECRET_VALUE_BYTES = 65_536;

export interface SecretValue {
  readonly contractVersion: typeof SECRET_VALUE_CONTRACT_VERSION;
  readonly secretId: string;
  readonly value: string;
}

export interface SecretResolutionResult {
  readonly contractVersion: typeof SECRET_VALUE_CONTRACT_VERSION;
  readonly secretId: string;
  readonly source: SecretReferenceSource;
  readonly value: SecretValue;
}
