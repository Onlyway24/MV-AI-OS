export const SECRET_REFERENCE_CONTRACT_VERSION = "1" as const;
export const MAX_SECRET_REFERENCES = 32;
export const MAX_SECRET_REFERENCE_LENGTH = 512;

export type SecretReferenceSource = "environment" | "local-file";

export interface EnvironmentSecretReference {
  readonly contractVersion: typeof SECRET_REFERENCE_CONTRACT_VERSION;
  readonly secretId: string;
  readonly source: "environment";
  readonly variableName: string;
}

export interface LocalFileSecretReference {
  readonly contractVersion: typeof SECRET_REFERENCE_CONTRACT_VERSION;
  readonly encoding: "utf8";
  readonly path: string;
  readonly secretId: string;
  readonly source: "local-file";
}

export type SecretReference =
  | EnvironmentSecretReference
  | LocalFileSecretReference;
