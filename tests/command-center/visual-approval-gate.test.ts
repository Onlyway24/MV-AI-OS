import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CommandCenterActionService } from "../../src/command-center/command-center-action-service.js";
import {
  type VisualApprovalBindingReceipt,
  FileSocialVisualApprovalGate,
  verifyVisualApprovalBinding,
  visualApprovalManifestFingerprint,
} from "../../src/command-center/visual-approval-gate.js";
import type { MetodoVeloceContentProductionRecord } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type { RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import type { LocalWorkflowCommandBoundary } from "../../src/runtime/local-workflow-command.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

describe("production-bound Visual Gate", () => {
  it("accepts a manifest bound to the exact workspace, production, version, package, social/master packs, and asset set", () => {
    const production = productionFixture();
    const manifest = manifestFor(production);
    expect(verifyVisualApprovalBinding(manifest, production)).toMatchObject({
      assetSetFingerprint: canonicalSha256(manifest.assets),
      contentPackageFingerprint: canonicalSha256(production.package),
      manifestFingerprint: manifest.fingerprint,
      masterContentPackFingerprint: HASH_B,
      productionId: "production-visual-001",
      productionVersion: 4,
      socialPublishingPackFingerprint: HASH_A,
      workspaceId: "onlyway",
    });
  });

  it("rejects a global manifest, another production, and every stale binding dimension", () => {
    const production = productionFixture();
    const manifest = manifestFor(production);
    const globalManifest = signedManifest({ ...manifest, approvalBinding: undefined });
    expect(() => verifyVisualApprovalBinding(globalManifest, production)).toThrow("VISUAL_BINDING_MISSING");

    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ productionId: "production-visual-002" }))).toThrow("PRODUCTION_ID_MISMATCH");
    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ workspaceId: "another-workspace" }))).toThrow("WORKSPACE_ID_MISMATCH");
    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ version: 5 }))).toThrow("PRODUCTION_VERSION_MISMATCH");
    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ packageMarker: "changed-after-review" }))).toThrow("CONTENT_PACKAGE_FINGERPRINT_MISMATCH");
    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ socialFingerprint: HASH_C }))).toThrow("SOCIAL_PUBLISHING_PACK_FINGERPRINT_MISMATCH");
    expect(() => verifyVisualApprovalBinding(manifest, productionFixture({ masterFingerprint: HASH_D }))).toThrow("MASTER_CONTENT_PACK_FINGERPRINT_MISMATCH");
  });

  it("rejects a stale asset set and a manifest whose signed payload was modified", () => {
    const production = productionFixture();
    const manifest = manifestFor(production);
    const staleAssetBinding = signedManifest({
      ...manifest,
      approvalBinding: { ...manifest.approvalBinding, assetSetFingerprint: HASH_D },
    });
    expect(() => verifyVisualApprovalBinding(staleAssetBinding, production)).toThrow("ASSET_SET_FINGERPRINT_MISMATCH");
    expect(() => verifyVisualApprovalBinding({ ...manifest, topic: "payload modificato dopo la firma" }, production)).toThrow("VISUAL_MANIFEST_FINGERPRINT_MISMATCH");
  });

  it("checks real asset bytes and rejects path traversal before approval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "onlyway-visual-gate-"));
    try {
      const assetRoot = join(directory, "assets");
      const manifestPath = join(assetRoot, "manifest.json");
      const imagePath = join(assetRoot, "visual.png");
      await mkdir(assetRoot, { recursive: true });
      const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      await writeFile(imagePath, image);
      const production = productionFixture();
      const assets = { instagram: [{ height: 1, path: "assets/visual.png", sha256: createHash("sha256").update(image).digest("hex"), width: 1 }] };
      await writeFile(manifestPath, JSON.stringify(manifestForAssets(production, assets)));
      const gate = new FileSocialVisualApprovalGate({ assetRoot, manifestPath, repositoryRoot: directory });
      await expect(gate.verify({ production, stage: "PROPOSE" })).resolves.toMatchObject({ productionId: production.productionId });

      await writeFile(imagePath, Buffer.concat([image, Buffer.from("tampered", "utf8")]));
      await expect(gate.verify({ production, stage: "CONFIRM" })).rejects.toThrow("VISUAL_ASSET_BYTE_FINGERPRINT_MISMATCH");

      const traversalAssets = { instagram: [{ height: 1, path: "../outside.png", sha256: HASH_C, width: 1 }] };
      await writeFile(manifestPath, JSON.stringify(manifestForAssets(production, traversalAssets)));
      await expect(gate.verify({ production, stage: "PROPOSE" })).rejects.toThrow("VISUAL_ASSET_PATH_OUTSIDE_ROOT");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("revalidates the exact binding at propose and confirm before executing approval", async () => {
    const production = productionFixture();
    const binding = verifyVisualApprovalBinding(manifestFor(production), production);
    const stages: string[] = [];
    const execute = vi.fn().mockResolvedValue({ externalActionsExecuted: false, operation: "REVIEW_METODO_VELOCE_CONTENT", replayed: false, result: { status: "APPROVED_FOR_SCHEDULING" }, unauthorizedExternalEffectOccurred: false });
    const service = actionService(production, execute, ({ stage }) => { stages.push(stage); return Promise.resolve(binding); });

    const proposal = await service.proposeContentReview({ action: "APPROVE_CONTENT", productionId: production.productionId });
    expect(proposal.summary.visualApprovalBindingFingerprint).toBe(binding.bindingFingerprint);
    await expect(service.confirmContentReview({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint })).resolves.toMatchObject({ action: "APPROVE_CONTENT" });
    expect(stages).toEqual(["PROPOSE", "CONFIRM"]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("invalidates a pending approval when the manifest binding changes before confirm", async () => {
    const production = productionFixture();
    const first = verifyVisualApprovalBinding(manifestFor(production), production);
    const second: VisualApprovalBindingReceipt = Object.freeze({ ...first, bindingFingerprint: HASH_D });
    let calls = 0;
    const execute = vi.fn();
    const service = actionService(production, execute, () => Promise.resolve(calls++ === 0 ? first : second));
    const proposal = await service.proposeContentReview({ action: "APPROVE_CONTENT", productionId: production.productionId });

    await expect(service.confirmContentReview({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint })).rejects.toThrow("binding del Visual Gate è cambiato");
    await expect(service.confirmContentReview({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint })).rejects.toThrow(/scaduta|utilizzata/iu);
    expect(execute).not.toHaveBeenCalled();
  });
});

function actionService(
  production: MetodoVeloceContentProductionRecord,
  execute: ReturnType<typeof vi.fn>,
  verify: (input: Readonly<{ readonly production: MetodoVeloceContentProductionRecord; readonly stage: "CONFIRM" | "PROPOSE" }>) => Promise<VisualApprovalBindingReceipt>,
): CommandCenterActionService {
  const repositories = {
    transaction: async <T>(operation: (repositories: unknown) => Promise<T>): Promise<T> => operation({
      contentProductions: { getById: (productionId: string) => Promise.resolve(productionId === production.productionId ? production : undefined) },
      operationsControls: { getProductionControl: () => Promise.resolve(undefined) },
    }),
  } as unknown as RepositoryTransactionRunner;
  return new CommandCenterActionService({
    actorId: production.actorId,
    commands: { execute } as unknown as LocalWorkflowCommandBoundary,
    contentApprovalGate: { verify },
    repositories,
    workspaceId: production.workspaceId,
  });
}

function productionFixture(overrides: Readonly<{
  readonly masterFingerprint?: string;
  readonly packageMarker?: string;
  readonly productionId?: string;
  readonly socialFingerprint?: string;
  readonly version?: number;
  readonly workspaceId?: string;
}> = {}): MetodoVeloceContentProductionRecord {
  const productionId = overrides.productionId ?? "production-visual-001";
  const socialPublishingPack = {
    fingerprint: overrides.socialFingerprint ?? HASH_A,
    masterContentPack: { fingerprint: overrides.masterFingerprint ?? HASH_B },
    productionId,
  };
  return {
    actorId: "fabio",
    contractVersion: "1",
    createdAt: "2026-07-19T08:00:00.000Z",
    evidencePack: { fingerprint: HASH_C, minFreshnessExpiresAt: "2026-08-01T00:00:00.000Z", packId: "visual-evidence-pack", verifiedAt: "2026-07-19T08:00:00.000Z" },
    package: {
      approval: { required: true, status: "PENDING_FABIO" },
      contractVersion: "1",
      editorialPlan: { angle: "checklist", audience: "founder", objective: "educate", selectedIdea: "review visuale" },
      evidence: { items: [], limitations: [] },
      externalActionsAllowed: false,
      generatedAt: "2026-07-19T08:00:00.000Z",
      metrics: { measures: [], reviewCadence: "weekly" },
      missionReference: overrides.packageMarker ?? "visual-mission-001",
      productionId,
      quality: { readinessScore: 100, report: {} as never },
      risk: { findings: [], status: "CLEAR" },
      socialPublishingPack: socialPublishingPack as never,
      status: "READY_FOR_FABIO_APPROVAL",
      version: 1,
    },
    productionId,
    status: "PENDING_FABIO_APPROVAL",
    updatedAt: "2026-07-19T08:00:00.000Z",
    version: overrides.version ?? 4,
    workspaceId: overrides.workspaceId ?? "onlyway",
  };
}

function manifestFor(production: MetodoVeloceContentProductionRecord) {
  return manifestForAssets(production, {
    instagram: [{ height: 1350, path: "assets/instagram.png", sha256: HASH_C, width: 1080 }],
    tiktok: [{ height: 1920, path: "assets/tiktok.png", sha256: HASH_D, width: 1080 }],
  });
}

function manifestForAssets(production: MetodoVeloceContentProductionRecord, assets: Readonly<Record<string, unknown>>) {
  const social = production.package.socialPublishingPack;
  if (social === undefined) throw new Error("Expected social pack fixture");
  return signedManifest({
    approvalBinding: {
      assetSetFingerprint: canonicalSha256(assets),
      contentPackageFingerprint: canonicalSha256(production.package),
      masterContentPackFingerprint: social.masterContentPack.fingerprint,
      productionId: production.productionId,
      productionVersion: production.version,
      socialPublishingPackFingerprint: social.fingerprint,
      workspaceId: production.workspaceId,
    },
    assets,
    externalActionsAllowed: false,
    publicationAuthorized: false,
    schemaVersion: 2,
    visualReview: { status: "READY_FOR_HUMAN_DECISION" },
  });
}

function signedManifest<T extends Readonly<Record<string, unknown>>>(payload: T): T & { readonly fingerprint: string } {
  const withoutUndefined = JSON.parse(JSON.stringify(payload)) as T;
  return Object.freeze({ ...withoutUndefined, fingerprint: visualApprovalManifestFingerprint(withoutUndefined) });
}
