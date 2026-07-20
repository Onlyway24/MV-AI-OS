import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve("assets/reference-vault");
const INCOMING = resolve(ROOT, "incoming");
const EXPECTED_FOLDERS = [
  "analytics",
  "audience-language",
  "competitor-carousels",
  "competitor-covers",
  "offers",
  "own-approved",
  "own-rejected",
  "photography",
  "products",
  "typography",
] as const;

describe("Fabio Reference Vault Input Pack", () => {
  it("keeps exactly the requested empty intake categories and no generated asset", async () => {
    expect(await readdir(INCOMING)).toEqual(EXPECTED_FOLDERS);
    for (const folder of EXPECTED_FOLDERS) {
      expect(await readdir(resolve(INCOMING, folder))).toEqual([".gitkeep"]);
    }
  });

  it("uses unambiguous metadata columns aligned with ReferenceImportCandidate", async () => {
    const header = (await readFile(resolve(ROOT, "metadata-template.csv"), "utf8")).trim().split(",");
    expect(header).toEqual([
      "reference_id", "asset_id", "title", "original_filename", "declared_byte_length", "declared_sha256", "mime_type", "dimensions_status", "width", "height", "source_id", "source_type", "source_url", "source_owner", "source_captured_at", "rights_id", "rights_status", "rights_owner", "allowed_use", "evidence_reference", "evidence_fingerprint", "rights_verified_by", "rights_verified_at", "rights_expires_at", "privacy_id", "privacy_status", "privacy_data_classes", "privacy_consent_evidence_status", "privacy_consent_evidence_reference", "privacy_consent_evidence_fingerprint", "privacy_consent_evidence_reason_code", "privacy_consent_attestation_fingerprint", "privacy_consent_verified_at", "privacy_release_evidence_status", "privacy_release_evidence_reference", "privacy_release_evidence_fingerprint", "privacy_release_evidence_reason_code", "privacy_release_attestation_fingerprint", "privacy_release_verified_at", "privacy_purpose", "privacy_verified_at", "privacy_retention_expires_at", "privacy_policy_fingerprint", "reference_roles", "platforms", "aspect_ratio", "business_objective", "audience", "what_to_learn", "what_not_to_copy", "fabio_approval_reason", "freshness_observed_at", "fresh_until", "freshness_expires_at", "mission_ids", "package_ids", "outcome_ids",
    ]);
  });

  it("marks the JSON request example as non-executing without fake approvals", async () => {
    const example = JSON.parse(await readFile(resolve(ROOT, "import-example.json"), "utf8")) as {
      readonly assets: readonly {
        readonly contentBase64: string;
        readonly fabioApprovalReason: string;
        readonly referenceId: string;
        readonly rights: { readonly status: string };
      }[];
      readonly batchId: string;
    };
    expect(example.batchId).toBe("replace-with-unique-batch-id");
    expect(example.assets).toHaveLength(1);
    expect(example.assets[0]).toMatchObject({
      contentBase64: "REPLACE_MECHANICALLY_WITH_VERIFIED_LOCAL_BYTES_BASE64",
      referenceId: "metodo-veloce-logo-overlay-technical",
      rights: { status: "FABIO_SUPPLIED" },
    });
    expect(example.assets[0]?.fabioApprovalReason).toContain("in attesa di review Fabio");
    expect(JSON.stringify(example)).not.toContain('"approvalStatus":"APPROVED"');
  });

  it("ships a fingerprinted non-executing blueprint with 10 opportunities and 60 slides", async () => {
    const path = resolve(ROOT, "metodo-veloce-content-blueprint-v1.md");
    const bytes = await readFile(path);
    const blueprint = bytes.toString("utf8");
    const sidecar = (await readFile(resolve(ROOT, "metodo-veloce-content-blueprint-v1.sha256"), "utf8")).trim();
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(blueprint.match(/^## OP-\d{2} /gmu)).toHaveLength(10);
    expect(blueprint.match(/^  [1-6]\. /gmu)).toHaveLength(60);
    expect(blueprint).toContain("**Pubblicazione:** `LOCKED`");
    expect(blueprint).toContain("**Azioni esterne:** `0`");
    expect(sidecar).toBe(`${digest}  assets/reference-vault/metodo-veloce-content-blueprint-v1.md`);
  });
});
