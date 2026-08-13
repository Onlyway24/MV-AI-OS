import { describe, expect, it } from "vitest";

import { buildCommandCenterReferenceVaultView } from "../../src/command-center/reference-vault-view.js";
import type { ReferenceAsset, ReferenceCollection } from "../../src/reference-vault/reference-vault.js";

describe("Command Center Reference Vault view", () => {
  it("maps only the current actor/workspace version into a redaction-safe UI contract", () => {
    const view = buildCommandCenterReferenceVaultView({
      actorId: "fabio",
      assets: [
        asset({ version: 0, rightsStatus: "UNKNOWN", status: "IMPORTED" }),
        asset({ version: 1, rightsStatus: "AUTHORIZED", status: "APPROVED" }),
        asset({ actorId: "other-actor", referenceId: "private-other-actor", version: 0 }),
        asset({ referenceId: "competitor-pattern", rightsStatus: "PUBLIC_ANALYSIS_ONLY", roles: ["COMPETITOR_REFERENCE"], status: "APPROVED", version: 0 }),
      ],
      businessContexts: [],
      collections: [collection(), collection({ actorId: "other-actor", collectionId: "private-sequence" })],
      decisions: [],
      fingerprints: [],
      now: new Date("2026-07-20T09:00:00.000Z"),
      outcomes: [],
      workspaceId: "onlyway",
    });

    expect(view.assets).toHaveLength(2);
    expect(view.assets.find(({ referenceId }) => referenceId === "reference-001")).toMatchObject({
      current: true,
      eligible: true,
      referenceId: "reference-001",
      referenceRoles: ["BRAND_REFERENCE"],
      rights: { status: "AUTHORIZED" },
      rightsBlocked: false,
      status: "APPROVED",
      version: 1,
    });
    expect(view.assets.find(({ referenceId }) => referenceId === "competitor-pattern")).toMatchObject({ rightsBlocked: true });
    expect(view.assets.some(({ referenceId }) => referenceId === "private-other-actor")).toBe(false);
    expect(view.rightsBlockers).toEqual([
      { reasonCode: "REFERENCE_COMPETITOR_OUTPUT_BLOCKED", referenceId: "competitor-pattern" },
      { reasonCode: "REFERENCE_RIGHTS_UNAVAILABLE", referenceId: "competitor-pattern" },
      { reasonCode: "REFERENCE_PURPOSE_NOT_AUTHORIZED", referenceId: "competitor-pattern" },
    ]);
    expect(view.sequences).toEqual([{
      collectionId: "carousel-001",
      description: "Sequenza reale registrata",
      items: [
        { available: true, currentVersion: 1, eligibilityReasonCodes: [], referenceId: "reference-001", requestedVersion: 1, version: 1 },
        { available: false, eligibilityReasonCodes: ["REFERENCE_CURRENT_ASSET_MISSING"], referenceId: "missing-asset", requestedVersion: 0, version: 0 },
      ],
      roles: ["CAROUSEL_STRUCTURE"],
      title: "Carosello Fabio",
      version: 0,
    }]);
    expect(view.businessContext).toBeNull();
    expect(view.visualFingerprint).toBeNull();
    expect(view.writingFingerprint).toBeNull();
    expect(view.missingInputs).toEqual([
      "Creative Fingerprint non disponibile: servono decisioni esplicite di Fabio.",
      "Business Context non disponibile: i valori mancanti non vengono stimati.",
    ]);
  });

  it("keeps an empty Vault explicit instead of fabricating references", () => {
    const view = buildCommandCenterReferenceVaultView({
      actorId: "fabio",
      assets: [],
      businessContexts: [],
      collections: [],
      decisions: [],
      fingerprints: [],
      now: new Date("2026-07-20T09:00:00.000Z"),
      outcomes: [],
      workspaceId: "onlyway",
    });

    expect(view.assets).toEqual([]);
    expect(view.decisions).toEqual([]);
    expect(view.outcomeLinks).toEqual([]);
    expect(view.rightsBlockers).toEqual([]);
    expect(view.sequences).toEqual([]);
    expect(view.missingInputs[0]).toBe("Nessun riferimento importato.");
  });

  it("fails closed when the current private CAS object cannot be reconciled", () => {
    const current = asset({ rightsStatus: "AUTHORIZED", status: "APPROVED", version: 1 });
    const view = buildCommandCenterReferenceVaultView({
      actorId: "fabio",
      assets: [current],
      businessContexts: [],
      casUnavailableAssetKeys: new Set([`${current.assetId}:${String(current.version)}:${current.fingerprint}`]),
      collections: [collection()],
      coverage: "LIMIT_REACHED",
      decisions: [],
      fingerprints: [],
      now: new Date("2026-07-20T09:00:00.000Z"),
      outcomes: [],
      workspaceId: "onlyway",
    });

    expect(view.coverage).toBe("LIMIT_REACHED");
    expect(view.assets[0]).toMatchObject({ eligible: false, eligibilityReasonCodes: ["REFERENCE_CAS_MISSING"], rightsBlocked: true });
    expect(view.sequences[0]?.items[0]).toMatchObject({ available: false, eligibilityReasonCodes: ["REFERENCE_CAS_MISSING"] });
    expect(view.rightsBlockers).toEqual([{ reasonCode: "REFERENCE_CAS_MISSING", referenceId: "reference-001" }]);
  });
});

function collection(input: { readonly actorId?: string; readonly collectionId?: string } = {}): ReferenceCollection {
  const collectionId = input.collectionId ?? "carousel-001";
  return {
    actorId: input.actorId ?? "fabio",
    assets: [
      { assetId: "reference-001", fingerprint: "a".repeat(64), version: 1 },
      { assetId: "missing-asset", fingerprint: "f".repeat(64), version: 0 },
    ],
    collectionId,
    contractVersion: "1",
    createdAt: "2026-07-19T08:00:00.000Z",
    description: "Sequenza reale registrata",
    fingerprint: "e".repeat(64),
    roles: ["CAROUSEL_STRUCTURE"],
    title: "Carosello Fabio",
    updatedAt: "2026-07-19T08:00:00.000Z",
    version: 0,
    workspaceId: "onlyway",
  };
}

function asset(input: {
  readonly actorId?: string;
  readonly referenceId?: string;
  readonly rightsStatus?: ReferenceAsset["rights"]["status"];
  readonly roles?: ReferenceAsset["roles"];
  readonly status?: ReferenceAsset["status"];
  readonly version: number;
}): ReferenceAsset {
  const referenceId = input.referenceId ?? "reference-001";
  return {
    actorId: input.actorId ?? "fabio",
    aspectRatio: "1:1",
    assetId: referenceId,
    audience: ["Founder italiani"],
    businessObjective: "Chiarezza del brand",
    byteLength: 128,
    contractVersion: "1",
    createdAt: "2026-07-19T08:00:00.000Z",
    dimensions: { height: 100, status: "AVAILABLE", width: 100 },
    fabioApproval: { reason: "Fixture deterministica di mapping", status: input.status === "APPROVED" ? "APPROVED" : "PENDING" },
    fingerprint: "a".repeat(64),
    freshness: { freshUntil: "2027-07-20T09:00:00.000Z", observedAt: "2026-07-19T08:00:00.000Z" },
    links: { missionIds: [], outcomeIds: [], packageIds: [] },
    mimeType: "image/png",
    originalFilename: "reference.png",
    platforms: ["GENERAL"],
    referenceId,
    privacy: {
      consentEvidence: { attestationFingerprint: "e".repeat(64), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-19T08:00:00.000Z" },
      contractVersion: "1",
      dataClasses: ["NONE"],
      fingerprint: "f".repeat(64),
      policyFingerprint: "1".repeat(64),
      privacyId: `${referenceId}-privacy`,
      purpose: "CREATIVE_DIRECTION",
      releaseEvidence: { attestationFingerprint: "2".repeat(64), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-19T08:00:00.000Z" },
      retentionExpiresAt: "2027-07-20T09:00:00.000Z",
      status: "CLEARED",
      verifiedAt: "2026-07-19T08:00:00.000Z",
      version: 0,
    },
    rights: {
      allowedUse: input.rightsStatus === "PUBLIC_ANALYSIS_ONLY" ? ["INTERNAL_ANALYSIS"] : input.rightsStatus === "UNKNOWN" ? [] : ["CREATIVE_DIRECTION"],
      contractVersion: "1",
      ...(input.rightsStatus === "AUTHORIZED" || input.rightsStatus === undefined ? {
        evidenceFingerprint: "3".repeat(64),
        evidenceReference: "rights-ledger-entry",
        verifiedAt: "2026-07-19T08:00:00.000Z",
        verifiedBy: "fabio",
      } : {}),
      fingerprint: "b".repeat(64),
      owner: "Fabio",
      rightsId: `${referenceId}-rights`,
      status: input.rightsStatus ?? "AUTHORIZED",
      version: 0,
    },
    roles: input.roles ?? ["BRAND_REFERENCE"],
    sha256: "c".repeat(64),
    source: {
      capturedAt: "2026-07-19T08:00:00.000Z",
      contractVersion: "1",
      fingerprint: "d".repeat(64),
      owner: "Fabio",
      sourceId: `${referenceId}-source`,
      type: "FABIO_SUPPLIED_FILE",
      version: 0,
    },
    status: input.status ?? "IMPORTED",
    storage: { contentSha256: "c".repeat(64), durability: "DURABLE", immutable: true, kind: "SQLITE_PRIVATE_CAS" },
    title: "Riferimento verificabile",
    updatedAt: "2026-07-19T08:00:00.000Z",
    version: input.version,
    whatNotToCopy: ["Nessun elemento protetto"],
    whatToLearn: ["Gerarchia"],
    workspaceId: "onlyway",
  };
}
