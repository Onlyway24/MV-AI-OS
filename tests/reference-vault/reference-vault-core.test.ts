import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { DeterministicMetodoVeloceContentProductionLine } from "../../src/content-production/deterministic-metodo-veloce-content-production-line.js";
import type { MetodoVeloceContentProductionRecord } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type { Clock } from "../../src/ports/clock.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SqliteReferenceVaultTransactionRunner } from "../../src/persistence/sqlite/sqlite-reference-vault-transaction-runner.js";
import { ReferenceVaultCommandBoundary } from "../../src/reference-vault/reference-vault-command-boundary.js";
import { evaluateReferenceEligibility } from "../../src/reference-vault/reference-vault-eligibility.js";
import { ReferenceVaultQueryAgent } from "../../src/reference-vault/reference-vault-query-agent.js";
import type {
  ReferenceAsset,
  ReferenceImportCandidate,
  ReferenceImportRequest,
  ReferenceVaultCommand,
  ReferenceVaultOperation,
} from "../../src/reference-vault/reference-vault.js";
import { AudienceSignalValidator, referenceConfidence, referenceFingerprint, referenceInputFingerprint, ReferenceImportRequestValidator } from "../../src/reference-vault/reference-vault-validator.js";

const NOW = "2026-07-02T10:00:01.000Z";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n9\n%%EOF\n", "ascii");

describe("Onlyway Creative & Business Intelligence Reference Vault", () => {
  it("validates strict import contracts and detects corrupt, stale, and MIME-mismatched previews without writes", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const validRequest = request("batch-preview", [candidate("reference-preview", PNG)]);
      expect(new ReferenceImportRequestValidator().validate(validRequest).ok).toBe(true);
      expect(new ReferenceImportRequestValidator().validate({ ...validRequest, unknown: true }).ok).toBe(false);

      const corrupt = candidate("reference-corrupt", withSuffix(PNG, 1), { declaredSha256: sha(PNG) });
      const stale = candidate("reference-stale", withSuffix(PNG, 2), { freshness: { freshUntil: "2026-01-02T00:00:00.000Z", observedAt: "2025-01-01T00:00:00.000Z" } });
      const mismatch = candidate("reference-mime", withSuffix(PNG, 3), { mimeType: "image/jpeg", originalFilename: "reference-mime.jpg" });
      const input = { request: request("batch-blocked", [corrupt, stale, mismatch]) };
      const response = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-blocked", input, "batch-blocked", "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(response.result).toMatchObject({ status: "BLOCKED" });
      expect(JSON.stringify(response.result)).toContain("REFERENCE_CONTENT_CORRUPT");
      expect(JSON.stringify(response.result)).toContain("REFERENCE_STALE");
      expect(JSON.stringify(response.result)).toContain("REFERENCE_MIME_MISMATCH");
      const state = await runtime.runner.transaction(async (repository) => ({
        assets: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, corrupt.declaredSha256),
      }));
      expect(state.assets).toEqual([]);
      expect(state.blob).toBeUndefined();
      await runtime.runner.close();
    });
  });

  it("imports immutable originals atomically, replays durably after restart, and isolates actor plus workspace", async () => {
    await withDatabase(async (path) => {
      const first = createRuntime(path);
      const importRequest = request("batch-primary", [candidate("reference-primary", PNG)]);
      const input = { request: importRequest };
      const preview = await first.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-primary", input, importRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(preview.result).toMatchObject({ blockerCodes: [], status: "READY" });
      const importCommand = command("IMPORT_REFERENCE_ASSET", "import-primary", input, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE");
      const imported = await first.boundary.execute(importCommand);
      expect(imported).toMatchObject({ replayed: false, unauthorizedExternalEffectOccurred: false });
      const durable = await first.runner.transaction(async (repository) => ({
        assets: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        audits: await repository.listAudit({ actorId: "fabio", workspaceId: "onlyway" }, 50),
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, sha(PNG)),
      }));
      expect(durable.assets).toHaveLength(1);
      expect(durable.assets[0]).toMatchObject({ referenceId: "reference-primary", storage: { durability: "DURABLE", immutable: true, kind: "SQLITE_PRIVATE_CAS" } });
      expect(durable.blob?.bytes).toEqual(Uint8Array.from(PNG));
      expect(durable.audits).toHaveLength(2);
      await first.runner.close();

      const restarted = createRuntime(path);
      const replay = await restarted.boundary.execute(importCommand);
      expect(replay.replayed).toBe(true);
      const changedInput = { request: { ...importRequest, assets: [{ ...importRequest.assets[0], title: "Conflicting replay" }] } };
      await expect(restarted.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-primary", changedInput, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "repository_conflict" });
      const counts = await restarted.runner.transaction(async (repository) => ({
        assets: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        audits: await repository.listAudit({ actorId: "fabio", workspaceId: "onlyway" }, 50),
        otherActorAsset: await repository.findAssetBySha256({ actorId: "other", workspaceId: "onlyway" }, sha(PNG)),
      }));
      expect(counts.assets).toHaveLength(1);
      expect(counts.audits).toHaveLength(2);
      expect(counts.otherActorAsset).toBeUndefined();
      await restarted.runner.close();

      const other = createRuntime(path, "other");
      const otherBase = candidate("reference-other", PNG);
      const otherRequest = request("batch-other", [candidate("reference-other", PNG, { rights: { ...otherBase.rights, verifiedBy: "other" } })]);
      await other.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-other", { request: otherRequest }, otherRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE", "other"));
      const otherAssets = await other.runner.transaction((repository) => repository.listRecords({ actorId: "other", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
      expect(otherAssets).toHaveLength(1);
      await other.runner.close();
    });
  });

  it("deduplicates the same SHA only within the exact actor/workspace identity", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const first = request("batch-dedup-first", [candidate("reference-dedup-first", PNG)]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-dedup-first", { request: first }, first.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const duplicate = request("batch-dedup-second", [candidate("reference-dedup-second", PNG)]);
      const preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-dedup-second", { request: duplicate }, duplicate.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(preview.result).toMatchObject({ duplicateCount: 1, importableCount: 0, items: [{ disposition: "DUPLICATE" }], status: "READY" });
      const imported = await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-dedup-second", { request: duplicate }, duplicate.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      expect(imported.result).toMatchObject({ duplicateCount: 1, importedCount: 0 });
      const assets = await runtime.runner.transaction((repository) => repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
      expect(assets).toHaveLength(1);
      expect(assets[0]?.referenceId).toBe("reference-dedup-first");
      await runtime.runner.close();
    });
  });

  it("rolls back the complete batch when one candidate is blocked", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const valid = candidate("reference-atomic-valid", withSuffix(PNG, 10));
      const invalid = candidate("reference-atomic-invalid", withSuffix(PNG, 11), { declaredSha256: sha(PNG) });
      const importRequest = request("batch-atomic", [valid, invalid]);
      await expect(runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-atomic", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_import_blocked" });
      const state = await runtime.runner.transaction(async (repository) => ({
        assets: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, valid.declaredSha256),
      }));
      expect(state.assets).toEqual([]);
      expect(state.blob).toBeUndefined();
      await runtime.runner.close();
    });
  });

  it("blocks UNKNOWN rights, unsupported MIME, oversized declarations, and missing source fail-closed", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const unknownRights = candidate("reference-unknown-rights", withSuffix(PNG, 20), { rights: { allowedUse: [], owner: "Unknown", rightsId: "rights-unknown", status: "UNKNOWN" } });
      const unsupported = candidate("reference-unsupported", Uint8Array.from([0, 1, 2, 3]), { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "application/octet-stream", originalFilename: "reference-unsupported.bin" });
      const blockedRequest = request("batch-policy-blockers", [unknownRights, unsupported]);
      const preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-policy-blockers", { request: blockedRequest }, blockedRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(JSON.stringify(preview.result)).toContain("REFERENCE_RIGHTS_UNAVAILABLE");
      expect(JSON.stringify(preview.result)).toContain("REFERENCE_MIME_UNSUPPORTED");

      const oversized = candidate("reference-oversized", PNG, { declaredByteLength: 52_428_801 });
      expect(new ReferenceImportRequestValidator().validate(request("batch-oversized", [oversized])).ok).toBe(false);
      const missingSource: unknown = { ...candidate("reference-missing-source", PNG), source: undefined };
      expect(new ReferenceImportRequestValidator().validate({ assets: [missingSource], batchId: "batch-missing-source" }).ok).toBe(false);
      const assets = await runtime.runner.transaction((repository) => repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
      expect(assets).toEqual([]);
      await runtime.runner.close();
    });
  });

  it("reviews then rejects by exact version/fingerprint and keeps both append-only review receipts", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const importRequest = request("batch-review-reject", [candidate("reference-review-reject", PNG)]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-review-reject", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const imported = await asset(runtime.runner, "reference-review-reject");
      const reviewedResponse = await runtime.boundary.execute(command("REVIEW_REFERENCE_ASSET", "review-reference", { assetId: imported.assetId, findings: ["Hierarchy requires revision"], reason: "Fabio requested a first-draft review." }, imported.assetId, imported.version, imported.fingerprint));
      expect(reviewedResponse.result).toMatchObject({ status: "PENDING_FABIO_REVIEW", version: 1 });
      const reviewed = await asset(runtime.runner, imported.assetId);
      const rejectedResponse = await runtime.boundary.execute(command("REJECT_REFERENCE_ASSET", "reject-reference", { assetId: reviewed.assetId, findings: ["First draft rejected"], reason: "Fabio rejected the first draft." }, reviewed.assetId, reviewed.version, reviewed.fingerprint));
      expect(rejectedResponse.result).toMatchObject({ fabioApproval: { status: "REJECTED" }, status: "REJECTED", version: 2 });
      const history = await runtime.runner.transaction(async (repository) => ({
        reviews: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_REVIEW", workspaceId: "onlyway" }),
        versions: await repository.listRecords({ actorId: "fabio", limit: 50, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
      }));
      expect(history.reviews.map((item) => item.decision).sort()).toEqual(["PENDING_FABIO_REVIEW", "REJECTED"]);
      expect(history.versions.map((item) => item.version).sort()).toEqual([0, 1, 2]);
      await runtime.runner.close();
    });
  });

  it("versions reviews, records decision memory, exposes all fingerprint dimensions, and preserves unknown business data", async () => {
    await withDatabase(async (path) => {
      const firstPackage = await seedContentPackage(path, "package-first-draft");
      const secondPackage = await seedContentPackage(path, "package-second-draft");
      const runtime = createRuntime(path);
      const ownRequest = request("batch-approved", [candidate("reference-approved", PNG)]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-approved", { request: ownRequest }, ownRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const initial = await asset(runtime.runner, "reference-approved");
      const approvedResponse = await runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-reference", { assetId: initial.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "Fabio approved this owned reference." }, initial.assetId, initial.version, initial.fingerprint));
      expect(approvedResponse.result).toMatchObject({ status: "APPROVED", version: 1 });
      const approved = await asset(runtime.runner, "reference-approved");

      const decisionInput = { affectedElement: "cover hierarchy", assetRefs: [ref(approved)], audience: ["founders"], businessObjective: "Improve evidence-backed content", confidence: "LOW", decidedAt: NOW, decision: "REQUEST_REVISION", decisionId: "decision-one", expiresAt: "NOT_AVAILABLE", links: { missionIds: [], outcomeIds: [], packageIds: [firstPackage.packageId] }, packageRefs: [firstPackage], rationale: "Fabio rejected the first draft and requested clearer hierarchy.", resultingRevision: { ...secondPackage, status: "AVAILABLE" }, reusableRule: "Keep one focal promise above every supporting element.", scope: "GLOBAL" };
      await runtime.boundary.execute(command("RECORD_CREATIVE_DECISION", "decision-command", decisionInput, "decision-one", "NOT_EXISTS", "NOT_AVAILABLE"));

      const visual = { preferenceId: "visual-one", sampleAssetRefs: [ref(approved)], realism: ["editorial-realism"], lighting: ["soft-directional"], contrast: ["controlled"], depth: ["layered"], objectDensity: ["low"], focalHierarchy: ["single-focus"], luxuryLevel: ["quiet-premium"], textDensity: ["low"], colorUsage: ["brand-restrained"], composition: ["asymmetric-grid"], negativeSpace: ["generous"], forbiddenElements: ["fake-logo"] };
      const writing = { preferenceId: "writing-one", sampleAssetRefs: [ref(approved)], titleLength: ["short"], sentenceLength: ["short-medium"], vocabulary: ["plain"], directness: ["high"], urgency: ["measured"], practicalDensity: ["high"], guruRisk: ["zero"], ctaStyle: ["specific"], evidenceLanguage: ["qualified"], forbiddenExpressions: ["guaranteed-results"] };
      await runtime.boundary.execute(command("UPDATE_CREATIVE_FINGERPRINT", "fingerprint-command", { creativeFingerprintId: "fingerprint-one", negativeReferences: [], visual, writing }, "fingerprint-one", "NOT_EXISTS", "NOT_AVAILABLE"));

      const unknown = { reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" } as const;
      const businessInput = { activeExperiments: unknown, audience: unknown, audienceSignals: [], availableTime: unknown, budget: unknown, businessContextId: "business-one", channels: unknown, commercialExclusions: unknown, currentAssets: unknown, customerJourney: unknown, customerLanguageReferences: [], deliveryCapacity: unknown, founderConstraints: unknown, notAvailableReasons: ["Fabio has not supplied verified business numbers."], offerReferences: [], offers: unknown, pricing: unknown, revenueTargets: unknown, riskTolerance: unknown, status: "NOT_AVAILABLE", successMetrics: unknown, unitEconomics: unknown };
      await runtime.boundary.execute(command("UPDATE_BUSINESS_CONTEXT", "business-command", businessInput, "business-one", "NOT_EXISTS", "NOT_AVAILABLE"));

      const outcomeInput = { assetRefs: [ref(approved)], links: { missionIds: ["mission-one"], outcomeIds: ["outcome-one"], packageIds: [] }, metrics: {}, observedAt: NOW, outcomeLinkId: "outcome-link-one", result: "NOT_AVAILABLE" };
      await runtime.boundary.execute(command("LINK_REFERENCE_OUTCOME", "outcome-command", outcomeInput, "outcome-link-one", "NOT_EXISTS", "NOT_AVAILABLE"));
      const brief = await runtime.query.getBrief({ purpose: "CREATIVE_DIRECTION" });
      expect(brief.assets.map((item) => item.referenceId)).toEqual(["reference-approved"]);
      expect(brief.creativeFingerprint?.visual).toMatchObject({ confidence: "LOW", realism: ["editorial-realism"], forbiddenElements: ["fake-logo"] });
      expect(brief.creativeFingerprint?.writing).toMatchObject({ evidenceLanguage: ["qualified"], forbiddenExpressions: ["guaranteed-results"] });
      expect(brief.businessContext).toMatchObject({ budget: unknown, revenueTargets: unknown, status: "NOT_AVAILABLE" });
      expect(brief.decisions).toHaveLength(1);
      expect(brief.decisions[0]).toMatchObject({ decision: "REQUEST_REVISION", reusableRule: "Keep one focal promise above every supporting element.", resultingRevision: { packageId: "package-second-draft", version: 1 } });
      expect(brief.outcomes).toHaveLength(1);
      await runtime.runner.close();

      const restarted = createRuntime(path);
      const recovered = await restarted.query.getBrief({ purpose: "CREATIVE_DIRECTION" });
      expect(recovered.decisions).toEqual(brief.decisions);
      expect(recovered.creativeFingerprint).toEqual(brief.creativeFingerprint);
      expect(recovered.businessContext).toEqual(brief.businessContext);
      await restarted.runner.close();
    });
  });

  it("blocks competitor bytes without an authoritative retention grant before CAS persistence", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const own = request("batch-own", [candidate("reference-own", PNG)]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-own", { request: own }, own.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const ownInitial = await asset(runtime.runner, "reference-own");
      await runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-own", { assetId: ownInitial.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "Fabio approved this owned reference." }, ownInitial.assetId, ownInitial.version, ownInitial.fingerprint));

      const competitorBytes = withSuffix(PNG, 77);
      const competitor = candidate("reference-competitor", competitorBytes, {
        roles: ["COMPETITOR_REFERENCE"],
        source: { capturedAt: "2026-07-01T00:00:00.000Z", owner: "Public competitor", sourceId: "source-competitor", type: "COMPETITOR_PUBLIC_URL", url: "https://example.com/public-reference" },
        rights: { allowedUse: ["INTERNAL_ANALYSIS"], owner: "Public competitor", rightsId: "rights-competitor", status: "PUBLIC_ANALYSIS_ONLY" },
        whatNotToCopy: ["All protected expression"],
      });
      const competitorRequest = request("batch-competitor", [competitor]);
      const preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-competitor", { request: competitorRequest }, competitorRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(preview.result).toMatchObject({ blockerCodes: ["REFERENCE_RIGHTS_STORAGE_UNAUTHORIZED"], status: "BLOCKED" });
      await expect(runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-competitor", { request: competitorRequest }, competitorRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_import_blocked" });
      expect(() => runtime.query.getBrief({ purpose: "CREATIVE_DIRECTION", roles: ["COMPETITOR_REFERENCE"] })).toThrow(/query is invalid/iu);
      const brief = await runtime.query.getBrief({ purpose: "CREATIVE_DIRECTION" });
      expect(brief.assets.map((item) => item.referenceId)).toEqual(["reference-own"]);
      expect(JSON.stringify(brief)).not.toContain("reference-competitor");
      const persisted = await runtime.runner.transaction(async (repository) => ({
        asset: await repository.getRecord({ actorId: "fabio", entityId: competitor.assetId, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, competitor.declaredSha256),
      }));
      expect(persisted).toEqual({ asset: undefined, blob: undefined });
      await runtime.runner.close();
    });
  });

  it("rejects command actor/workspace mismatches and stores only redacted receipt/audit metadata with zero external effects", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const privateFilename = "fabio-private-original.png";
      const privateCandidate = candidate("reference-redaction", PNG, { originalFilename: privateFilename });
      const importRequest = request("batch-redaction", [privateCandidate]);
      const valid = command("IMPORT_REFERENCE_ASSET", "import-redaction", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE");
      expect(() => runtime.boundary.execute({ ...valid, actorId: "intruder" })).toThrow(/identity is unauthorized/iu);
      expect(() => runtime.boundary.execute({ ...valid, workspaceId: "other-workspace" })).toThrow(/identity is unauthorized/iu);
      const response = await runtime.boundary.execute(valid);
      expect(response.unauthorizedExternalEffectOccurred).toBe(false);
      const evidence = await runtime.runner.transaction(async (repository) => ({
        audit: await repository.listAudit({ actorId: "fabio", workspaceId: "onlyway" }, 10),
        receipt: await repository.getCommandReceipt({ actorId: "fabio", workspaceId: "onlyway" }, valid.idempotencyKey),
      }));
      expect(evidence.audit).toHaveLength(1);
      expect(evidence.audit[0]).toMatchObject({ externalEffectsExecuted: false, operation: "IMPORT_REFERENCE_ASSET" });
      expect(evidence.receipt?.unauthorizedExternalEffectOccurred).toBe(false);
      const serializedControlEvidence = JSON.stringify(evidence);
      expect(serializedControlEvidence).not.toContain(privateCandidate.contentBase64);
      expect(serializedControlEvidence).not.toContain(privateFilename);
      expect(serializedControlEvidence).not.toMatch(/prompt|secret|token|image_generation/iu);
      expect(evidence.receipt).toMatchObject({ entityRefs: [{ entityType: "REFERENCE_IMPORT_RECEIPT" }], reasonCode: "REFERENCE_COMMAND_COMPLETED" });
      const replayEnvelope = await runtime.runner.transaction((repository) => repository.getRecord({ actorId: "fabio", entityId: evidence.receipt?.resultRecordId ?? "missing", type: "REFERENCE_COMMAND_RESULT", workspaceId: "onlyway" }));
      expect(replayEnvelope?.replay).toMatchObject({ mode: "AUTHORITATIVE_ENTITY" });
      expect(JSON.stringify(replayEnvelope)).not.toContain(privateFilename);
      await runtime.runner.close();
    });
  });

  it("uses deterministic creative confidence thresholds at 0, 1, 3, and 6 samples", () => {
    expect([referenceConfidence(0), referenceConfidence(1), referenceConfidence(3), referenceConfidence(6)]).toEqual(["NONE", "LOW", "MEDIUM", "HIGH"]);
  });

  it("keeps FABIO_SUPPLIED provenance-only but blocks incomplete privacy before CAS persistence", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const provenanceOnly = candidate("reference-provenance-only", withSuffix(PNG, 31), {
        rights: { allowedUse: [], owner: "Fabio", rightsId: "rights-provenance-only", status: "FABIO_SUPPLIED" },
      });
      const incompleteBase = candidate("reference-privacy-review", withSuffix(PNG, 32));
      const privacyReview = candidate("reference-privacy-review", withSuffix(PNG, 32), {
        privacy: {
          ...incompleteBase.privacy,
          consentEvidence: { reasonCode: "NOT_VERIFIED", status: "NOT_VERIFIED" },
          releaseEvidence: { reasonCode: "NOT_VERIFIED", status: "NOT_VERIFIED" },
          status: "REVIEW_REQUIRED",
        },
      });
      const provenanceRequest = request("batch-provenance", [provenanceOnly]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-provenance", { request: provenanceRequest }, provenanceRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const provenanceAsset = await asset(runtime.runner, provenanceOnly.assetId);

      const provenanceEligibility = evaluateReferenceEligibility({ ...provenanceAsset, status: "APPROVED" }, { now: Date.parse(NOW), purpose: "CREATIVE_DIRECTION" });
      expect(provenanceEligibility.eligible).toBe(false);
      expect(provenanceEligibility.reasonCodes).toContain("REFERENCE_RIGHTS_PROVENANCE_ONLY");
      await expect(runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-provenance-only", { assetId: provenanceAsset.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "Must remain provenance-only." }, provenanceAsset.assetId, provenanceAsset.version, provenanceAsset.fingerprint))).rejects.toMatchObject({ code: "reference_vault_rights_blocked" });
      const privacyRequest = request("batch-privacy-review", [privacyReview]);
      const preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-privacy-review", { request: privacyRequest }, privacyRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(preview.result).toMatchObject({ blockerCodes: ["REFERENCE_PRIVACY_NOT_CLEARED"], status: "BLOCKED" });
      await expect(runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-privacy-review", { request: privacyRequest }, privacyRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_import_blocked" });
      const privacyState = await runtime.runner.transaction(async (repository) => ({
        asset: await repository.getRecord({ actorId: "fabio", entityId: privacyReview.assetId, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, privacyReview.declaredSha256),
      }));
      expect(privacyState).toEqual({ asset: undefined, blob: undefined });
      const brief = await runtime.query.getBrief({ purpose: "CREATIVE_DIRECTION" });
      expect(brief.assets).toEqual([]);
      await runtime.runner.close();
    });
  });

  it("applies exact purpose/platform grants through one evaluator and rejects inflated decision confidence", async () => {
    await withDatabase(async (path) => {
      const realPackage = await seedContentPackage(path, "package-confidence-real");
      const otherActorPackage = await seedContentPackage(path, "package-other-actor", "other");
      const runtime = createRuntime(path);
      const internalBase = candidate("reference-internal-only", withSuffix(PNG, 41));
      const internalOnly = candidate("reference-internal-only", withSuffix(PNG, 41), {
        platforms: ["INSTAGRAM"],
        privacy: { ...internalBase.privacy, purpose: "INTERNAL_ANALYSIS" },
        rights: { allowedUse: ["INTERNAL_ANALYSIS"], evidenceFingerprint: sha(Buffer.from("rights-proof-internal", "utf8")), evidenceReference: "rights-proof-internal", owner: "Fabio", rightsId: "rights-internal", status: "OWNED", verifiedAt: "2026-07-01T00:00:00.000Z", verifiedBy: "fabio" },
      });
      const importRequest = request("batch-internal-only", [internalOnly]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-internal-only", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const initial = await asset(runtime.runner, internalOnly.assetId);
      await expect(runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-wrong-platform", { assetId: initial.assetId, findings: [], platform: "TIKTOK", purpose: "INTERNAL_ANALYSIS", reason: "Wrong platform must fail." }, initial.assetId, initial.version, initial.fingerprint))).rejects.toMatchObject({ code: "reference_vault_rights_blocked" });
      await runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-internal", { assetId: initial.assetId, findings: [], platform: "INSTAGRAM", purpose: "INTERNAL_ANALYSIS", reason: "Exact internal-analysis grant." }, initial.assetId, initial.version, initial.fingerprint));
      const approved = await asset(runtime.runner, internalOnly.assetId);
      expect((await runtime.query.getBrief({ platform: "INSTAGRAM", purpose: "INTERNAL_ANALYSIS" })).assets).toHaveLength(1);
      expect((await runtime.query.getBrief({ platform: "INSTAGRAM", purpose: "CREATIVE_DIRECTION" })).assets).toHaveLength(0);

      const inflated = { affectedElement: "cover", assetRefs: [ref(approved)], audience: ["founders"], businessObjective: "Evidence-backed analysis", confidence: "HIGH", decidedAt: NOW, decision: "REQUEST_REVISION", decisionId: "decision-inflated", expiresAt: "NOT_AVAILABLE", links: links(), packageRefs: [], rationale: "One sample cannot justify high confidence.", resultingRevision: { status: "NOT_AVAILABLE" }, reusableRule: "Use evidence proportionally.", scope: "GLOBAL" };
      await expect(runtime.boundary.execute(command("RECORD_CREATIVE_DECISION", "decision-inflated-command", inflated, "decision-inflated", "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_confidence_exceeds_evidence" });

      const forgedPackages = Array.from({ length: 5 }, (_, index) => ({ fingerprint: sha(Buffer.from(`forged-package-${String(index)}`, "utf8")), packageId: `package-forged-${String(index)}`, version: 1 }));
      const forged = { ...inflated, decisionId: "decision-forged-packages", links: { ...links(), packageIds: forgedPackages.map(({ packageId }) => packageId) }, packageRefs: forgedPackages };
      await expect(runtime.boundary.execute(command("RECORD_CREATIVE_DECISION", "decision-forged-packages-command", forged, forged.decisionId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_not_found" });
      const wrongFingerprint = { ...inflated, confidence: "LOW", decisionId: "decision-package-wrong-hash", links: { ...links(), packageIds: [realPackage.packageId] }, packageRefs: [{ ...realPackage, fingerprint: "0".repeat(64) }] };
      await expect(runtime.boundary.execute(command("RECORD_CREATIVE_DECISION", "decision-package-wrong-hash-command", wrongFingerprint, wrongFingerprint.decisionId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_not_found" });
      const crossActor = { ...inflated, confidence: "LOW", decisionId: "decision-package-cross-actor", links: { ...links(), packageIds: [otherActorPackage.packageId] }, packageRefs: [otherActorPackage] };
      await expect(runtime.boundary.execute(command("RECORD_CREATIVE_DECISION", "decision-package-cross-actor-command", crossActor, crossActor.decisionId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_not_found" });
      expect(await runtime.runner.transaction((repository) => repository.listRecords({ actorId: "fabio", limit: 50, type: "CREATIVE_DECISION", workspaceId: "onlyway" }))).toEqual([]);
      await runtime.runner.close();
    });
  });

  it("requires explicit Fabio authority for approval-memory operations", async () => {
    await withDatabase(async (path) => {
      const clock = new FixedClock();
      const runner = new SqliteReferenceVaultTransactionRunner({ path, timeoutMs: 1_000 });
      const baseCandidate = candidate("reference-operator", withSuffix(PNG, 51));
      const importRequest = request("batch-operator", [candidate("reference-operator", withSuffix(PNG, 51), { rights: { ...baseCandidate.rights, verifiedBy: "operator" } })]);
      const unconfirmedOperator = new ReferenceVaultCommandBoundary({ actorId: "operator", clock, repositories: runner, workspaceId: "onlyway" });
      expect(() => unconfirmedOperator.execute(command("IMPORT_REFERENCE_ASSET", "import-operator-unconfirmed", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE", "operator"))).toThrow(/explicit configured Fabio approval authority confirmation/iu);
      const importer = new ReferenceVaultCommandBoundary({ actorId: "operator", approvalAuthority: approvalAuthority("operator"), clock, repositories: runner, workspaceId: "onlyway" });
      await importer.execute(command("IMPORT_REFERENCE_ASSET", "import-operator", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE", "operator"));
      const stored = await runner.transaction((repository) => repository.getRecord({ actorId: "operator", entityId: "reference-operator", type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
      expect(stored).toBeDefined();
      const boundary = new ReferenceVaultCommandBoundary({ actorId: "operator", approvalAuthority: approvalAuthority("fabio"), clock, repositories: runner, workspaceId: "onlyway" });
      expect(() => boundary.execute(command("REVIEW_REFERENCE_ASSET", "review-by-operator", { assetId: stored?.assetId, findings: [], reason: "Operator cannot impersonate Fabio." }, stored?.assetId ?? "missing", stored?.version ?? 0, stored?.fingerprint ?? "0".repeat(64), "operator"))).toThrow(/configured Fabio approval authority/iu);
      const unconfirmedFabio = new ReferenceVaultCommandBoundary({ actorId: "fabio", clock, repositories: runner, workspaceId: "onlyway" });
      expect(() => unconfirmedFabio.execute(command("REVIEW_REFERENCE_ASSET", "review-without-confirmation", { assetId: stored?.assetId, findings: [], reason: "Runtime identity alone cannot grant Fabio authority." }, stored?.assetId ?? "missing", stored?.version ?? 0, stored?.fingerprint ?? "0".repeat(64)))).toThrow(/explicit configured Fabio approval authority confirmation/iu);
      const versions = await runner.transaction((repository) => repository.listRecords({ actorId: "operator", limit: 10, type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
      expect(versions).toHaveLength(1);
      await runner.close();
    });
  });

  it("purges only expired CAS bytes under Fabio authority while retaining metadata, tombstone, and deterministic replay", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const expiringBase = candidate("reference-retention-expiring", withSuffix(PNG, 55));
      const expiringCandidate = candidate("reference-retention-expiring", withSuffix(PNG, 55), {
        privacy: { ...expiringBase.privacy, retentionExpiresAt: "2026-07-02T11:00:00.000Z" },
      });
      const activeRequest = request("batch-retention-active", [expiringCandidate]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-retention-active", { request: activeRequest }, activeRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const active = await asset(runtime.runner, expiringCandidate.assetId);
      await expect(runtime.boundary.execute(command("PURGE_EXPIRED_REFERENCE_CONTENT", "purge-retention-active", { assetId: active.assetId, reason: "Retention is still active." }, active.assetId, active.version, active.fingerprint))).rejects.toMatchObject({ code: "reference_vault_retention_active" });
      expect(await runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, active.sha256))).toBeDefined();
      const bypass = new DatabaseSync(path);
      expect(() => bypass.prepare("DELETE FROM reference_vault_blobs WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run("onlyway", "fabio", active.sha256)).toThrow(/tombstone is missing/iu);
      bypass.close();

      const alreadyExpiredBase = candidate("reference-retention-expired", withSuffix(PNG, 56));
      const alreadyExpired = candidate("reference-retention-expired", withSuffix(PNG, 56), {
        privacy: { ...alreadyExpiredBase.privacy, retentionExpiresAt: "2026-07-02T09:00:00.000Z" },
      });
      const expiredRequest = request("batch-retention-expired", [alreadyExpired]);
      const expiredPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-retention-expired", { request: expiredRequest }, expiredRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(expiredPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_RETENTION_EXPIRED"], status: "BLOCKED" });
      await expect(runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-retention-expired", { request: expiredRequest }, expiredRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_import_blocked" });

      const corrupted = new DatabaseSync(path);
      corrupted.prepare("UPDATE reference_vault_blobs SET content = ? WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run(Buffer.alloc(active.byteLength, 127), "onlyway", "fabio", active.sha256);
      corrupted.close();
      await expect(runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, active.sha256))).rejects.toMatchObject({ code: "repository_record_invalid" });

      const purgeCommand = command("PURGE_EXPIRED_REFERENCE_CONTENT", "purge-retention-expired", { assetId: active.assetId, reason: "Policy retention expired; remove even corrupted CAS bytes." }, active.assetId, active.version, active.fingerprint);
      const expiredClock = new FixedClock("2026-07-02T12:00:00.000Z");
      const wrongAuthority = new ReferenceVaultCommandBoundary({ actorId: "fabio", approvalAuthority: approvalAuthority("other-authority"), clock: expiredClock, repositories: runtime.runner, workspaceId: "onlyway" });
      expect(() => wrongAuthority.execute(purgeCommand)).toThrow(/configured Fabio approval authority/iu);

      const expiredAuthority = new ReferenceVaultCommandBoundary({ actorId: "fabio", approvalAuthority: approvalAuthority("fabio"), clock: expiredClock, repositories: runtime.runner, workspaceId: "onlyway" });
      const purged = await expiredAuthority.execute(purgeCommand);
      expect(purged.result).toMatchObject({ byteContentStatus: "PURGED", metadataStatus: "IMMUTABLE_RETAINED" });
      const durable = await runtime.runner.transaction(async (repository) => ({
        blob: await repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, active.sha256),
        current: await repository.getRecord({ actorId: "fabio", entityId: active.assetId, type: "REFERENCE_ASSET", workspaceId: "onlyway" }),
        original: await repository.getRecord({ actorId: "fabio", entityId: active.assetId, type: "REFERENCE_ASSET", version: 0, workspaceId: "onlyway" }),
        tombstone: await repository.getRecord({ actorId: "fabio", entityId: "reference-blob-tombstone-purge-retention-expired", type: "REFERENCE_BLOB_TOMBSTONE", workspaceId: "onlyway" }),
      }));
      expect(durable.blob).toBeUndefined();
      expect(durable.current).toMatchObject({ status: "EXPIRED", version: 1 });
      expect(durable.original).toMatchObject({ sha256: active.sha256, version: 0 });
      expect(durable.tombstone).toMatchObject({ assetRef: { version: 1 }, contentSha256: active.sha256 });
      expect((await runtime.query.getBrief({ purpose: "CREATIVE_DIRECTION" })).assets.map((item) => item.referenceId)).not.toContain(active.assetId);
      await runtime.runner.close();

      const restarted = createRuntime(path, "fabio", expiredClock);
      const replay = await restarted.boundary.execute(purgeCommand);
      expect(replay).toMatchObject({ replayed: true, result: { fingerprint: durable.tombstone?.fingerprint, tombstoneId: durable.tombstone?.tombstoneId } });
      await restarted.runner.close();
    });
  });

  it("resolves collection members to the exact current approved version and preserves deterministic replay", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const importRequest: ReferenceImportRequest = {
        assets: [candidate("reference-collection-item", withSuffix(PNG, 61))],
        batchId: "batch-collection",
        collection: { collectionId: "collection-current", description: "Resolve stable asset IDs to current approved versions.", roles: ["BRAND_REFERENCE"], title: "Current references" },
      };
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-collection", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const initial = await asset(runtime.runner, "reference-collection-item");
      expect((await runtime.query.getCollectionProjection("collection-current", { purpose: "CREATIVE_DIRECTION" })).items[0]).toMatchObject({ eligibility: "BLOCKED", requestedAssetRef: { version: 0 } });
      const approveCommand = command("APPROVE_REFERENCE_ASSET", "approve-collection-item", { assetId: initial.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "Fabio approved the current collection member." }, initial.assetId, initial.version, initial.fingerprint);
      await runtime.boundary.execute(approveCommand);
      const approved = await asset(runtime.runner, initial.assetId);
      expect((await runtime.query.getCollectionProjection("collection-current", { purpose: "CREATIVE_DIRECTION" })).items[0]).toMatchObject({ currentAssetRef: { fingerprint: approved.fingerprint, version: 1 }, eligibility: "ELIGIBLE", requestedAssetRef: { version: 0 } });
      await runtime.boundary.execute(command("REJECT_REFERENCE_ASSET", "reject-collection-item", { assetId: approved.assetId, findings: [], reason: "Fabio superseded the approval." }, approved.assetId, approved.version, approved.fingerprint));
      const rejectedProjection = await runtime.query.getCollectionProjection("collection-current", { purpose: "CREATIVE_DIRECTION" });
      expect(rejectedProjection.items[0]).toMatchObject({ currentAssetRef: { version: 2 }, eligibility: "BLOCKED" });
      expect(rejectedProjection.items[0]?.reasonCodes).toContain("REFERENCE_STATUS_NOT_APPROVED");
      const replay = await runtime.boundary.execute(approveCommand);
      expect(replay).toMatchObject({ replayed: true, result: { fingerprint: approved.fingerprint, status: "APPROVED", version: 1 } });
      await runtime.runner.close();
    });
  });

  it("enforces bounded dimensions, aggregate quota, CAS reconciliation, URL hygiene, and credential scanning", async () => {
    expect(new ReferenceImportRequestValidator().validate(request("batch-dimensions", [candidate("reference-dimensions", PNG, { dimensions: { height: 1, status: "AVAILABLE", width: 16_385 } })])).ok).toBe(false);
    expect(new ReferenceImportRequestValidator().validate(request("batch-url-query", [candidate("reference-url-query", PNG, { source: { capturedAt: "2026-07-01T00:00:00.000Z", owner: "Fabio", sourceId: "source-url-query", type: "PUBLIC_URL", url: "https://example.com/reference?token=redacted" } })])).ok).toBe(false);
    expect(new ReferenceImportRequestValidator().validate(request("batch-url-fragment", [candidate("reference-url-fragment", PNG, { source: { capturedAt: "2026-07-01T00:00:00.000Z", owner: "Fabio", sourceId: "source-url-fragment", type: "PUBLIC_URL", url: "https://example.com/reference#private" } })])).ok).toBe(false);
    expect(new ReferenceImportRequestValidator().validate(request("batch-rights-proof-missing", [candidate("reference-rights-proof-missing", PNG, { rights: { allowedUse: ["CREATIVE_DIRECTION"], owner: "Fabio", rightsId: "rights-proof-missing", status: "OWNED" } })])).ok).toBe(false);
    expect(new ReferenceImportRequestValidator().validate(request("batch-rights-fingerprint-missing", [candidate("reference-rights-fingerprint-missing", PNG, { rights: { allowedUse: ["CREATIVE_DIRECTION"], evidenceReference: "rights-proof-without-hash", owner: "Fabio", rightsId: "rights-fingerprint-missing", status: "OWNED", verifiedAt: "2026-07-01T00:00:00.000Z", verifiedBy: "fabio" } })])).ok).toBe(false);
    const invalidPrivacyBase = candidate("reference-invalid-privacy", PNG);
    expect(new ReferenceImportRequestValidator().validate(request("batch-invalid-privacy", [candidate("reference-invalid-privacy", PNG, { privacy: { ...invalidPrivacyBase.privacy, consentEvidence: { reasonCode: "NOT_VERIFIED", status: "NOT_VERIFIED" } } })])).ok).toBe(false);
    const syntheticCredential = ["sk", "not-a-real-secret-value-123456"].join("-");
    expect(new ReferenceImportRequestValidator().validate(request("batch-secret", [candidate("reference-secret", PNG, { title: syntheticCredential })])).ok).toBe(false);
    const audienceSignalBase = { actorId: "fabio", audience: "founders", audienceSignalId: "audience-confidence", confidence: "HIGH" as const, contractVersion: "1" as const, createdAt: NOW, evidenceAssetRefs: [{ assetId: "reference-evidence", fingerprint: "a".repeat(64), version: 0 }], freshness: { freshUntil: "2027-01-01T00:00:00.000Z", observedAt: "2026-07-01T00:00:00.000Z" }, signal: "Evidence-bounded audience language.", version: 0 as const, workspaceId: "onlyway" };
    expect(new AudienceSignalValidator().validate({ ...audienceSignalBase, fingerprint: referenceFingerprint(audienceSignalBase) }).ok).toBe(false);
    const lowConfidenceSignal = { ...audienceSignalBase, confidence: "LOW" as const };
    expect(new AudienceSignalValidator().validate({ ...lowConfidenceSignal, fingerprint: referenceFingerprint(lowConfidenceSignal) }).ok).toBe(true);

    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const wrongVerifierBase = candidate("reference-wrong-rights-verifier", withSuffix(PNG, 72));
      const wrongVerifier = candidate("reference-wrong-rights-verifier", withSuffix(PNG, 72), { rights: { ...wrongVerifierBase.rights, verifiedBy: "operator" } });
      const wrongVerifierPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-wrong-rights-verifier", { request: request("batch-wrong-rights-verifier", [wrongVerifier]) }, "batch-wrong-rights-verifier", "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(JSON.stringify(wrongVerifierPreview.result)).toContain("REFERENCE_RIGHTS_VERIFIER_UNCONFIRMED");
      expect(await runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, wrongVerifier.declaredSha256))).toBeUndefined();

      const futureRightsBase = candidate("reference-future-rights-proof", withSuffix(PNG, 73));
      const futureRights = candidate("reference-future-rights-proof", withSuffix(PNG, 73), { rights: { ...futureRightsBase.rights, verifiedAt: "2026-07-03T00:00:00.000Z" } });
      const futurePrivacyBase = candidate("reference-future-privacy-proof", withSuffix(PNG, 74));
      const futurePrivacy = candidate("reference-future-privacy-proof", withSuffix(PNG, 74), { privacy: {
        ...futurePrivacyBase.privacy,
        consentEvidence: { attestationFingerprint: "4".repeat(64), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-03T00:00:00.000Z" },
        releaseEvidence: { attestationFingerprint: "5".repeat(64), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-03T00:00:00.000Z" },
        verifiedAt: "2026-07-03T00:00:00.000Z",
      } });
      const futureProofRequest = request("batch-future-proof", [futureRights, futurePrivacy]);
      const futureProofPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-future-proof", { request: futureProofRequest }, futureProofRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(futureProofPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_PRIVACY_EVIDENCE_NOT_YET_VALID", "REFERENCE_RIGHTS_EVIDENCE_NOT_YET_VALID"], status: "BLOCKED" });
      for (const futureCandidate of futureProofRequest.assets) expect(await runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, futureCandidate.declaredSha256))).toBeUndefined();

      const unsafeBusinessInput = { businessContextId: "business-secret", founderConstraints: { status: "AVAILABLE", value: { apiKey: "non-empty-credential-value" } } };
      expect(() => runtime.boundary.execute(command("UPDATE_BUSINESS_CONTEXT", "business-secret-command", unsafeBusinessInput, "business-secret", "NOT_EXISTS", "NOT_AVAILABLE"))).toThrow(/command is invalid/iu);
      const nestedEncodedSecret = { businessContextId: "business-nested-secret", founderConstraints: { status: "AVAILABLE", value: { contentBase64: syntheticCredential } } };
      expect(() => runtime.boundary.execute(command("UPDATE_BUSINESS_CONTEXT", "business-nested-secret-command", nestedEncodedSecret, "business-nested-secret", "NOT_EXISTS", "NOT_AVAILABLE"))).toThrow(/command is invalid/iu);

      const payloadCredentialValue = ["synthetic", "credential", "value", "123456"].join("-");
      const textCredential = Buffer.from(`password=${payloadCredentialValue}`, "utf8");
      const jsonCredential = Buffer.from(JSON.stringify({ contentBase64: syntheticCredential }), "utf8");
      const pngCredential = withPngText(PNG, `comment\0password=${payloadCredentialValue}`);
      const credentialRequest = request("batch-secret-content", [
        candidate("reference-secret-text", textCredential, { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "text/plain", originalFilename: "reference-secret-text.txt" }),
        candidate("reference-secret-json", jsonCredential, { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "application/json", originalFilename: "reference-secret-json.json" }),
        candidate("reference-secret-png", pngCredential),
      ]);
      const credentialPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-secret-content", { request: credentialRequest }, credentialRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(credentialPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_CREDENTIAL_MATERIAL_DETECTED"], status: "BLOCKED" });
      expect(JSON.stringify(credentialPreview)).not.toContain(payloadCredentialValue);
      expect(JSON.stringify(credentialPreview)).not.toContain(syntheticCredential);
      await expect(runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-secret-content", { request: credentialRequest }, credentialRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"))).rejects.toMatchObject({ code: "reference_vault_import_blocked" });
      for (const importedCandidate of credentialRequest.assets) {
        expect(await runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, importedCandidate.declaredSha256))).toBeUndefined();
      }

      const utf16Credential = Buffer.from(`password=${payloadCredentialValue}`, "utf16le");
      const utf16Request = request("batch-utf16-content", [candidate("reference-utf16-content", utf16Credential, { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "text/plain", originalFilename: "reference-utf16-content.txt" })]);
      const utf16Preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-utf16-content", { request: utf16Request }, utf16Request.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(utf16Preview.result).toMatchObject({ blockerCodes: ["REFERENCE_MIME_UNSUPPORTED"], status: "BLOCKED" });
      expect(await runtime.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, utf16Request.assets[0]?.declaredSha256 ?? "0".repeat(64)))).toBeUndefined();

      const validPng = candidate("reference-valid-png", PNG);
      const validPngRequest = request("batch-valid-png", [validPng]);
      const validPngPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-valid-png", { request: validPngRequest }, validPngRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(validPngPreview.result).toMatchObject({ blockerCodes: [], status: "READY" });

      const malformedPng = candidate("reference-malformed-png", withInvalidPngRaster(PNG));
      const malformedPngRequest = request("batch-malformed-png", [malformedPng]);
      const malformedPngPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-malformed-png", { request: malformedPngRequest }, malformedPngRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(malformedPngPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_BINARY_VALIDATION_FAILED"], status: "BLOCKED" });

      const suffixedRasterPng = candidate("reference-suffixed-raster-png", withPngIdatSuffix(PNG, Buffer.from("polyglot", "utf8")));
      const suffixedRasterRequest = request("batch-suffixed-raster-png", [suffixedRasterPng]);
      const suffixedRasterPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-suffixed-raster-png", { request: suffixedRasterRequest }, suffixedRasterRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(suffixedRasterPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_BINARY_VALIDATION_FAILED"], status: "BLOCKED" });

      const trailingPngBytes = Uint8Array.from([...PNG, ...Buffer.from("trailing-polyglot", "utf8")]);
      const trailingPng = candidate("reference-trailing-png", trailingPngBytes);
      const trailingPngRequest = request("batch-trailing-png", [trailingPng]);
      const trailingPngPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-trailing-png", { request: trailingPngRequest }, trailingPngRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(trailingPngPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_BINARY_VALIDATION_FAILED"], status: "BLOCKED" });

      const decoderUnavailableFixtures = [
        { bytes: JPEG, dimensions: { height: 1, status: "AVAILABLE", width: 1 } as const, extension: "jpg", mimeType: "image/jpeg" },
        { bytes: GIF, dimensions: { height: 1, status: "AVAILABLE", width: 1 } as const, extension: "gif", mimeType: "image/gif" },
        { bytes: PDF, dimensions: { status: "NOT_AVAILABLE" } as const, extension: "pdf", mimeType: "application/pdf" },
      ];
      for (const fixture of decoderUnavailableFixtures) {
        const blocked = candidate(`reference-blocked-${fixture.extension}`, fixture.bytes, { dimensions: fixture.dimensions, mimeType: fixture.mimeType, originalFilename: `reference-blocked.${fixture.extension}` });
        const blockedRequest = request(`batch-blocked-${fixture.extension}`, [blocked]);
        const blockedPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", `preview-blocked-${fixture.extension}`, { request: blockedRequest }, blockedRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
        expect(blockedPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1"], status: "BLOCKED" });
      }

      const disguisedPdf = candidate("reference-disguised-pdf", PDF, { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "text/plain", originalFilename: "reference-disguised-pdf.txt" });
      const disguisedPdfRequest = request("batch-disguised-pdf", [disguisedPdf]);
      const disguisedPdfPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-disguised-pdf", { request: disguisedPdfRequest }, disguisedPdfRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(disguisedPdfPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1"], status: "BLOCKED" });

      const prefixedPdfBytes = Buffer.concat([Buffer.from("harmless-prefix\n", "utf8"), PDF]);
      const prefixedPdf = candidate("reference-prefixed-pdf", prefixedPdfBytes, { dimensions: { status: "NOT_AVAILABLE" }, mimeType: "text/plain", originalFilename: "reference-prefixed-pdf.txt" });
      const prefixedPdfRequest = request("batch-prefixed-pdf", [prefixedPdf]);
      const prefixedPdfPreview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-prefixed-pdf", { request: prefixedPdfRequest }, prefixedPdfRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(prefixedPdfPreview.result).toMatchObject({ blockerCodes: ["REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1"], status: "BLOCKED" });

      const casRequest = request("batch-cas-before-output", [candidate("reference-cas-before-output", withSuffix(PNG, 71))]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-cas-before-output", { request: casRequest }, casRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const initial = await asset(runtime.runner, "reference-cas-before-output");
      const direct = new DatabaseSync(path);
      direct.prepare("UPDATE reference_vault_blobs SET content = ? WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run(Buffer.alloc(initial.byteLength), "onlyway", "fabio", initial.sha256);
      direct.close();
      await expect(runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-corrupt-cas", { assetId: initial.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "CAS must reconcile before output." }, initial.assetId, initial.version, initial.fingerprint))).rejects.toMatchObject({ code: "repository_record_invalid" });
      await runtime.runner.close();
    });

    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const direct = new DatabaseSync(path);
      direct.exec("BEGIN IMMEDIATE");
      const insert = direct.prepare("INSERT INTO reference_vault_blobs (workspace_id, actor_id, sha256, byte_length, mime_type, stored_at, content) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (let index = 0; index < 1_000; index += 1) {
        const bytes = Buffer.from(`quota-${String(index)}`, "utf8");
        insert.run("onlyway", "fabio", sha(bytes), bytes.byteLength, "text/plain", NOW, bytes);
      }
      direct.exec("COMMIT");
      direct.close();
      const quotaRequest = request("batch-quota", [candidate("reference-over-quota", withSuffix(PNG, 72))]);
      const preview = await runtime.boundary.execute(command("PREVIEW_REFERENCE_IMPORT", "preview-over-quota", { request: quotaRequest }, quotaRequest.batchId, "NOT_APPLICABLE", "NOT_AVAILABLE"));
      expect(preview.result).toMatchObject({ status: "BLOCKED" });
      expect(JSON.stringify(preview.result)).toContain("REFERENCE_QUOTA_EXCEEDED");
      expect(await runtime.runner.transaction((repository) => repository.getStorageUsage({ actorId: "fabio", workspaceId: "onlyway" }))).toMatchObject({ blobCount: 1_000 });
      await runtime.runner.close();
    });
  });

  it("fails closed on stale target controls and detects durable JSON corruption", async () => {
    await withDatabase(async (path) => {
      const runtime = createRuntime(path);
      const importRequest = request("batch-corruption", [candidate("reference-corruption", PNG)]);
      await runtime.boundary.execute(command("IMPORT_REFERENCE_ASSET", "import-corruption", { request: importRequest }, importRequest.batchId, "NOT_EXISTS", "NOT_AVAILABLE"));
      const initial = await asset(runtime.runner, "reference-corruption");
      await expect(runtime.boundary.execute(command("APPROVE_REFERENCE_ASSET", "approve-stale", { assetId: initial.assetId, findings: [], purpose: "CREATIVE_DIRECTION", reason: "This control fingerprint is stale." }, initial.assetId, initial.version, "0".repeat(64)))).rejects.toMatchObject({ code: "reference_vault_conflict" });
      await runtime.runner.close();

      const direct = new DatabaseSync(path);
      direct.prepare("UPDATE reference_vault_blobs SET content = ? WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run(Buffer.alloc(PNG.byteLength), "onlyway", "fabio", sha(PNG));
      const version = direct.prepare("PRAGMA user_version").get();
      expect(version?.user_version).toBe(31);
      direct.close();

      const restarted = createRuntime(path);
      await expect(restarted.runner.transaction((repository) => repository.getBlob({ actorId: "fabio", workspaceId: "onlyway" }, sha(PNG)))).rejects.toMatchObject({ code: "repository_record_invalid" });
      await restarted.runner.close();

      const corruptRecord = new DatabaseSync(path);
      corruptRecord.prepare("UPDATE reference_vault_blobs SET content = ? WHERE workspace_id = ? AND actor_id = ? AND sha256 = ?").run(PNG, "onlyway", "fabio", sha(PNG));
      corruptRecord.prepare("UPDATE reference_vault_records SET record_json = '{}' WHERE workspace_id = ? AND actor_id = ? AND entity_id = ?").run("onlyway", "fabio", initial.assetId);
      corruptRecord.close();
      const recordReader = createRuntime(path);
      await expect(recordReader.runner.transaction((repository) => repository.getRecord({ actorId: "fabio", entityId: initial.assetId, type: "REFERENCE_ASSET", workspaceId: "onlyway" }))).rejects.toMatchObject({ code: "repository_record_invalid" });
      await recordReader.runner.close();
    });
  });

  it("migrates an exact version-30 database and recovers the Vault on restart", async () => {
    await withDatabase(async (path) => {
      const initial = createRuntime(path);
      await initial.runner.close();
      const legacy = new DatabaseSync(path);
      legacy.exec(`
        DROP TABLE reference_vault_audit_events;
        DROP TABLE reference_vault_command_receipts;
        DROP TABLE reference_vault_records;
        DROP TABLE reference_vault_blobs;
        DELETE FROM schema_migrations WHERE version = 31;
        PRAGMA user_version = 30;
      `);
      legacy.close();

      const migrated = createRuntime(path);
      const empty = await migrated.query.getBrief({ purpose: "CREATIVE_DIRECTION" });
      expect(empty).toMatchObject({ assets: [], businessContext: { status: "NOT_AVAILABLE" }, competitorOutputPolicy: "BLOCKED" });
      await migrated.runner.close();
      const inspected = new DatabaseSync(path);
      expect(inspected.prepare("PRAGMA user_version").get()?.user_version).toBe(31);
      expect(inspected.prepare("SELECT name FROM schema_migrations WHERE version = 31").get()?.name).toBe("creative_business_intelligence_reference_vault");
      inspected.close();
    });
  });
});

function createRuntime(path: string, actorId = "fabio", clock: Clock = new FixedClock()) {
  const runner = new SqliteReferenceVaultTransactionRunner({ path, timeoutMs: 1_000 });
  return {
    boundary: new ReferenceVaultCommandBoundary({ actorId, approvalAuthority: approvalAuthority(actorId), clock, repositories: runner, workspaceId: "onlyway" }),
    query: new ReferenceVaultQueryAgent({ actorId, clock, repositories: runner, workspaceId: "onlyway" }),
    runner,
  };
}

function approvalAuthority(authorityId: string) {
  return {
    authorityId,
    confirmedByFabio: true as const,
    contractVersion: "1" as const,
    scope: "REFERENCE_VAULT_AUTHORITY_OPERATIONS" as const,
    workspaceId: "onlyway",
  };
}

function command(operation: ReferenceVaultOperation, commandId: string, input: Readonly<Record<string, unknown>>, targetId: string, expectedVersion: ReferenceVaultCommand["expectedVersion"], targetFingerprint: string, actorId = "fabio"): ReferenceVaultCommand {
  return { actorId, commandId, contractVersion: "1", expectedVersion, idempotencyKey: `idem-${commandId}`, input, inputFingerprint: referenceInputFingerprint(input), operation, targetFingerprint, targetId, workspaceId: "onlyway" };
}

function request(batchId: string, assets: readonly ReferenceImportCandidate[]): ReferenceImportRequest { return { assets, batchId }; }

async function seedContentPackage(path: string, productionId: string, actorId = "fabio", workspaceId = "onlyway"): Promise<{ readonly fingerprint: string; readonly packageId: string; readonly version: number }> {
  const line = new DeterministicMetodoVeloceContentProductionLine(new FixedClock());
  const contentPackage = line.produce({
    audience: "founders",
    callToAction: "Salva la checklist.",
    contractVersion: "1",
    evidence: [{ evidenceId: `evidence-${productionId}`, sourceRef: "authorized-test-source", statement: "Il brief contiene una fonte dichiarata e verificabile." }],
    language: "it",
    missionReference: "reference-vault-test",
    objective: "educate",
    offer: "Metodo Veloce",
    productionId,
    topic: "gerarchia editoriale",
  });
  const record: MetodoVeloceContentProductionRecord = { actorId, contractVersion: "1", createdAt: contentPackage.generatedAt, package: contentPackage, productionId, status: "PENDING_FABIO_APPROVAL", updatedAt: contentPackage.generatedAt, version: 0, workspaceId };
  const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
  await repositories.transaction(({ contentProductions }) => contentProductions.insert(record));
  await repositories.close();
  return { fingerprint: canonicalSha256(contentPackage), packageId: productionId, version: contentPackage.version };
}

function candidate(assetId: string, bytes: Uint8Array, overrides: Partial<ReferenceImportCandidate> = {}): ReferenceImportCandidate {
  return {
    aspectRatio: "1:1",
    assetId,
    audience: ["Metodo Veloce audience"],
    businessObjective: "Build an evidence-backed reference system",
    contentBase64: Buffer.from(bytes).toString("base64"),
    declaredByteLength: bytes.byteLength,
    declaredSha256: sha(bytes),
    dimensions: { height: 1, status: "AVAILABLE", width: 1 },
    fabioApprovalReason: "Imported pending Fabio review.",
    freshness: { freshUntil: "2027-07-01T00:00:00.000Z", observedAt: "2026-07-01T00:00:00.000Z" },
    links: links(),
    mimeType: "image/png",
    originalFilename: `${assetId}.png`,
    platforms: ["GENERAL"],
    referenceId: assetId,
    privacy: {
      consentEvidence: { attestationFingerprint: sha(Buffer.from(`consent-na-${assetId}`, "utf8")), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-01T00:00:00.000Z" },
      dataClasses: ["NONE"],
      policyFingerprint: sha(Buffer.from("reference-privacy-policy-v1", "utf8")),
      privacyId: `privacy-${assetId}`,
      purpose: "CREATIVE_DIRECTION",
      releaseEvidence: { attestationFingerprint: sha(Buffer.from(`release-na-${assetId}`, "utf8")), reasonCode: "SAFE_NON_PERSONAL_ASSET", status: "NOT_APPLICABLE", verifiedAt: "2026-07-01T00:00:00.000Z" },
      retentionExpiresAt: "2030-07-01T00:00:00.000Z",
      status: "CLEARED",
      verifiedAt: "2026-07-01T00:00:00.000Z",
    },
    rights: { allowedUse: ["CREATIVE_DIRECTION"], evidenceFingerprint: sha(Buffer.from(`rights-proof-${assetId}`, "utf8")), evidenceReference: `rights-proof-${assetId}`, owner: "Fabio", rightsId: `rights-${assetId}`, status: "OWNED", verifiedAt: "2026-07-01T00:00:00.000Z", verifiedBy: "fabio" },
    roles: ["BRAND_REFERENCE"],
    source: { capturedAt: "2026-07-01T00:00:00.000Z", owner: "Fabio", sourceId: `source-${assetId}`, type: "FABIO_SUPPLIED_FILE" },
    title: assetId,
    whatNotToCopy: ["No unapproved derivative"],
    whatToLearn: ["Approved brand direction"],
    ...overrides,
  };
}

async function asset(runner: SqliteReferenceVaultTransactionRunner, assetId: string): Promise<ReferenceAsset> {
  const value = await runner.transaction((repository) => repository.getRecord({ actorId: "fabio", entityId: assetId, type: "REFERENCE_ASSET", workspaceId: "onlyway" }));
  if (value === undefined) throw new Error("Test reference asset is missing");
  return value;
}

function ref(value: ReferenceAsset) { return { assetId: value.assetId, fingerprint: value.fingerprint, version: value.version }; }
function links() { return { missionIds: [] as readonly string[], outcomeIds: [] as readonly string[], packageIds: [] as readonly string[] }; }
function sha(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function withSuffix(value: Uint8Array, suffix: number): Uint8Array {
  return withPngText(value, `variant\0${String(suffix)}`);
}

function withPngText(value: Uint8Array, content: string): Uint8Array {
  const source = Buffer.from(value);
  const iendOffset = source.length - 12;
  const type = Buffer.from("tEXt", "ascii");
  const data = Buffer.from(content, "utf8");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(testCrc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return Uint8Array.from(Buffer.concat([source.subarray(0, iendOffset), chunk, source.subarray(iendOffset)]));
}

function withInvalidPngRaster(value: Uint8Array): Uint8Array {
  const result = Buffer.from(value);
  let offset = 8;
  while (offset + 12 <= result.length) {
    const length = result.readUInt32BE(offset);
    const type = result.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT" && length > 2) {
      result[offset + 10] = (result[offset + 10] ?? 0) ^ 0xff;
      result.writeUInt32BE(testCrc32(result.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
      return Uint8Array.from(result);
    }
    offset += length + 12;
  }
  throw new Error("PNG test fixture does not contain IDAT");
}

function withPngIdatSuffix(value: Uint8Array, suffix: Uint8Array): Uint8Array {
  const source = Buffer.from(value);
  let offset = 8;
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    if (source.subarray(offset + 4, offset + 8).toString("ascii") === "IDAT") {
      const typeAndData = Buffer.concat([source.subarray(offset + 4, offset + 8 + length), Buffer.from(suffix)]);
      const chunk = Buffer.alloc(typeAndData.length + 8);
      chunk.writeUInt32BE(length + suffix.byteLength, 0);
      typeAndData.copy(chunk, 4);
      chunk.writeUInt32BE(testCrc32(typeAndData), typeAndData.length + 4);
      return Uint8Array.from(Buffer.concat([source.subarray(0, offset), chunk, source.subarray(offset + length + 12)]));
    }
    offset += length + 12;
  }
  throw new Error("PNG test fixture does not contain IDAT");
}

function testCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class FixedClock implements Clock {
  public constructor(private readonly value = NOW) {}
  public now(): Date { return new Date(this.value); }
}

async function withDatabase(run: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-reference-vault-"));
  try { await run(join(directory, "runtime.sqlite")); }
  finally { await rm(directory, { force: true, recursive: true }); }
}
