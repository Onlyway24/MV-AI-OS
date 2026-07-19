import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryConflictError } from "../errors/core-error.js";

const HASH = /^[a-f0-9]{64}$/u;
const MAX_VISUAL_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_VISUAL_ASSETS = 100;

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const VISUAL_ASSET_ROOT = fileURLToPath(new URL("../../assets/", import.meta.url));

export const SOCIAL_VISUAL_PACK_MANIFEST_PATH = fileURLToPath(new URL(
  "../../assets/metodo-veloce/social-pack-five-items-v3/manifest.json",
  import.meta.url,
));

export interface CommandCenterContentApprovalGate {
  verify(input: Readonly<{
    readonly production: MetodoVeloceContentProductionRecord;
    readonly stage: "CONFIRM" | "PROPOSE";
  }>): Promise<VisualApprovalBindingReceipt>;
}

export interface VisualApprovalBindingReceipt {
  readonly assetSetFingerprint: string;
  readonly bindingFingerprint: string;
  readonly contentPackageFingerprint: string;
  readonly manifestFingerprint: string;
  readonly masterContentPackFingerprint: string;
  readonly productionId: string;
  readonly productionVersion: number;
  readonly socialPublishingPackFingerprint: string;
  readonly workspaceId: string;
}

/**
 * Path-only configuration for the file-backed gate. It intentionally exposes
 * no verifier injection: callers can relocate the same exact-byte checks, but
 * cannot replace them with an accepting implementation.
 */
export interface FileSocialVisualApprovalGateConfig {
  readonly assetRoot?: string;
  readonly manifestPath?: string;
  readonly repositoryRoot?: string;
}

/** File-backed, fail-closed Visual Gate used by the private Command Center. */
export class FileSocialVisualApprovalGate implements CommandCenterContentApprovalGate {
  readonly #assetRoot: string;
  readonly #manifestPath: string;
  readonly #repositoryRoot: string;

  public constructor(input: Readonly<FileSocialVisualApprovalGateConfig> = {}) {
    this.#assetRoot = resolve(input.assetRoot ?? VISUAL_ASSET_ROOT);
    this.#manifestPath = resolve(input.manifestPath ?? SOCIAL_VISUAL_PACK_MANIFEST_PATH);
    this.#repositoryRoot = resolve(input.repositoryRoot ?? REPOSITORY_ROOT);
  }

  public async verify(input: Readonly<{
    readonly production: MetodoVeloceContentProductionRecord;
    readonly stage: "CONFIRM" | "PROPOSE";
  }>): Promise<VisualApprovalBindingReceipt> {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(this.#manifestPath, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw blocked("VISUAL_MANIFEST_MISSING");
      }
      if (error instanceof SyntaxError) throw blocked("VISUAL_MANIFEST_INVALID_JSON");
      throw error;
    }
    const receipt = verifyVisualApprovalBinding(manifest, input.production);
    await verifyVisualAssetFiles(manifest, {
      assetRoot: this.#assetRoot,
      manifestPath: this.#manifestPath,
      repositoryRoot: this.#repositoryRoot,
    });
    return receipt;
  }
}

/**
 * Validates that one immutable visual manifest belongs to this exact production
 * snapshot. A global, cross-workspace, cross-production, or stale manifest can
 * never authorize an approval.
 */
export function verifyVisualApprovalBinding(
  candidate: unknown,
  production: MetodoVeloceContentProductionRecord,
): VisualApprovalBindingReceipt {
  if (!record(candidate) || !record(candidate.visualReview) || candidate.visualReview.status !== "READY_FOR_HUMAN_DECISION") {
    throw blocked("VISUAL_GATE_NOT_READY");
  }
  if (!record(candidate.approvalBinding)) throw blocked("VISUAL_BINDING_MISSING");
  if (!record(candidate.assets) || !validAssetTree(candidate.assets)) throw blocked("VISUAL_ASSET_FINGERPRINTS_INVALID");

  const social = production.package.socialPublishingPack;
  if (social === undefined) throw blocked("SOCIAL_PACK_MISSING");
  const binding = candidate.approvalBinding;
  const expected = Object.freeze({
    assetSetFingerprint: canonicalSha256(candidate.assets),
    contentPackageFingerprint: canonicalSha256(production.package),
    masterContentPackFingerprint: social.masterContentPack.fingerprint,
    productionId: production.productionId,
    productionVersion: production.version,
    socialPublishingPackFingerprint: social.fingerprint,
    workspaceId: production.workspaceId,
  });
  const orderedBindingFields = [
    "workspaceId",
    "productionId",
    "productionVersion",
    "socialPublishingPackFingerprint",
    "masterContentPackFingerprint",
    "contentPackageFingerprint",
    "assetSetFingerprint",
  ] as const;
  for (const field of orderedBindingFields) {
    const value = expected[field];
    if (binding[field] !== value) throw blocked(`VISUAL_BINDING_${field.replaceAll(/([A-Z])/gu, "_$1").toUpperCase()}_MISMATCH`);
  }
  if (!HASH.test(String(candidate.fingerprint))) throw blocked("VISUAL_MANIFEST_FINGERPRINT_INVALID");
  const payload: Record<string, unknown> = structuredClone(candidate);
  delete payload.fingerprint;
  const manifestFingerprint = canonicalSha256(payload);
  if (candidate.fingerprint !== manifestFingerprint) throw blocked("VISUAL_MANIFEST_FINGERPRINT_MISMATCH");
  const bindingFingerprint = canonicalSha256({
    ...expected,
    manifestFingerprint,
  });
  return Object.freeze({ ...expected, bindingFingerprint, manifestFingerprint });
}

export function visualApprovalManifestFingerprint(value: Readonly<Record<string, unknown>>): string {
  const payload: Record<string, unknown> = structuredClone(value);
  delete payload.fingerprint;
  return canonicalSha256(payload);
}

function validAssetTree(value: Record<string, unknown>): boolean {
  let fingerprintCount = 0;
  const visit = (entry: unknown): boolean => {
    if (Array.isArray(entry)) return entry.length > 0 && entry.every(visit);
    if (!record(entry)) return true;
    if (Object.hasOwn(entry, "sha256")) {
      if (!HASH.test(String(entry.sha256))) return false;
      fingerprintCount += 1;
    }
    return Object.values(entry).every(visit);
  };
  return visit(value) && fingerprintCount > 0;
}

async function verifyVisualAssetFiles(
  manifest: unknown,
  roots: Readonly<{ readonly assetRoot: string; readonly manifestPath: string; readonly repositoryRoot: string }>,
): Promise<void> {
  if (!record(manifest) || !record(manifest.assets)) throw blocked("VISUAL_ASSET_FINGERPRINTS_INVALID");
  const realAssetRoot = await realpathOrBlocked(roots.assetRoot, "VISUAL_ASSET_ROOT_UNAVAILABLE");
  const realManifestPath = await realpathOrBlocked(roots.manifestPath, "VISUAL_MANIFEST_PATH_UNAVAILABLE");
  if (!within(realAssetRoot, realManifestPath)) throw blocked("VISUAL_MANIFEST_PATH_OUTSIDE_ASSET_ROOT");
  const manifestStat = await lstat(realManifestPath);
  if (!manifestStat.isFile()) throw blocked("VISUAL_MANIFEST_NOT_REGULAR_FILE");
  const entries = collectAssetEntries(manifest.assets);
  if (entries.length === 0 || entries.length > MAX_VISUAL_ASSETS) throw blocked("VISUAL_ASSET_COUNT_INVALID");
  const seen = new Set<string>();
  for (const entry of entries) {
    if (isAbsolute(entry.path) || entry.path.includes("\0")) throw blocked("VISUAL_ASSET_PATH_INVALID");
    const candidate = resolve(roots.repositoryRoot, entry.path);
    if (!within(roots.assetRoot, candidate)) throw blocked("VISUAL_ASSET_PATH_OUTSIDE_ROOT");
    const realCandidate = await realpathOrBlocked(candidate, "VISUAL_ASSET_MISSING");
    if (!within(realAssetRoot, realCandidate)) throw blocked("VISUAL_ASSET_SYMLINK_ESCAPE");
    if (seen.has(realCandidate)) throw blocked("VISUAL_ASSET_PATH_DUPLICATED");
    seen.add(realCandidate);
    const fileStat = await lstat(realCandidate);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_VISUAL_ASSET_BYTES) throw blocked("VISUAL_ASSET_FILE_INVALID");
    const bytes = await readFile(realCandidate);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== entry.sha256) throw blocked("VISUAL_ASSET_BYTE_FINGERPRINT_MISMATCH");
    if (entry.width !== undefined || entry.height !== undefined) {
      if (!positiveInteger(entry.width) || !positiveInteger(entry.height)) throw blocked("VISUAL_ASSET_DIMENSIONS_INVALID");
      const dimensions = imageDimensions(bytes);
      if (dimensions?.width !== entry.width || dimensions.height !== entry.height) throw blocked("VISUAL_ASSET_DIMENSIONS_MISMATCH");
    }
  }
}

function collectAssetEntries(value: Record<string, unknown>): readonly Readonly<{
  readonly height?: number;
  readonly path: string;
  readonly sha256: string;
  readonly width?: number;
}>[] {
  const entries: Readonly<{ readonly height?: number; readonly path: string; readonly sha256: string; readonly width?: number }>[] = [];
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) { for (const item of entry) visit(item); return; }
    if (!record(entry)) return;
    if (Object.hasOwn(entry, "sha256")) {
      if (typeof entry.path !== "string" || !HASH.test(String(entry.sha256))) throw blocked("VISUAL_ASSET_ENTRY_INVALID");
      entries.push(Object.freeze({
        ...(entry.height === undefined ? {} : { height: Number(entry.height) }),
        path: entry.path,
        sha256: String(entry.sha256),
        ...(entry.width === undefined ? {} : { width: Number(entry.width) }),
      }));
      return;
    }
    for (const nested of Object.values(entry)) visit(nested);
  };
  visit(value);
  return Object.freeze(entries);
}

function imageDimensions(bytes: Buffer): Readonly<{ readonly height: number; readonly width: number }> | undefined {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") {
    return Object.freeze({ height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) });
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === undefined || marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return undefined;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return Object.freeze({ height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) });
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

async function realpathOrBlocked(path: string, code: string): Promise<string> {
  try { return await realpath(path); } catch { throw blocked(code); }
}

function within(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function blocked(code: string): RepositoryConflictError {
  return new RepositoryConflictError(`Visual Gate bloccato: ${code}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
