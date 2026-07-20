import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";

export type ReferenceVaultErrorCode =
  | "reference_vault_conflict"
  | "reference_vault_corrupt"
  | "reference_vault_identity_mismatch"
  | "reference_vault_import_blocked"
  | "reference_vault_invalid"
  | "reference_vault_not_found"
  | "reference_vault_privacy_blocked"
  | "reference_vault_quota_exceeded"
  | "reference_vault_confidence_exceeds_evidence"
  | "reference_vault_retention_active"
  | "reference_vault_rights_blocked"
  | "reference_vault_stale";

export class ReferenceVaultError extends CoreError {
  public constructor(code: ReferenceVaultErrorCode, message: string, details?: JsonObject) {
    super({
      category: code === "reference_vault_not_found" ? "not_found" : code === "reference_vault_invalid" || code === "reference_vault_corrupt" ? "validation" : ["reference_vault_confidence_exceeds_evidence", "reference_vault_privacy_blocked", "reference_vault_quota_exceeded", "reference_vault_rights_blocked"].includes(code) ? "policy" : "conflict",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "reference_vault",
    });
  }
}
