import { createHash } from "node:crypto";

import type { EvidencePack } from "./operational-plane.js";

export type EvidencePackFingerprintInput = Pick<EvidencePack, "evidence" | "evidenceIds" | "packId">;

/**
 * Canonical fingerprint used both when an immutable Evidence Pack is created
 * and whenever a downstream boundary verifies that its payload was not altered.
 */
export function evidencePackFingerprint(input: EvidencePackFingerprintInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ evidence: input.evidence, evidenceIds: input.evidenceIds, packId: input.packId }), "utf8")
    .digest("hex");
}
