export const REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION = "1" as const;
export const REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE =
  "REFERENCE_VAULT_AUTHORITY_OPERATIONS" as const;

/**
 * Explicit local root-of-trust declaration for Fabio-only Reference Vault
 * operations. This value must come from validated configuration; it must never
 * be inferred from the runtime actor identity.
 */
export interface ReferenceVaultApprovalAuthority {
  readonly authorityId: string;
  readonly confirmedByFabio: true;
  readonly contractVersion: typeof REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION;
  readonly scope: typeof REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE;
  readonly workspaceId: string;
}
