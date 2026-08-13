import { createHash } from "node:crypto";

import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";
import type { AuthorizedResearchMission, AuthorizedResearchMissionInput, ResearchAcquisitionSnapshot } from "./authorized-research.js";

const ID = /^[a-zA-Z0-9@._:-]{1,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const CONTENT_TYPES = ["application/json", "text/csv", "text/html", "text/plain", "text/xml"] as const;
const RISK_DOMAINS = ["FINANCE", "GENERAL", "HEALTH", "LEGAL"] as const;

export class AuthorizedResearchMissionInputValidator implements Validator<AuthorizedResearchMissionInput> {
  public validate(value: unknown): ValidationResult<AuthorizedResearchMissionInput> {
    if (!record(value) || !exactKeys(value, ["claims", "maxBytesPerSource", "maxRedirects", "missionId", "packs", "targets", "timeoutMs"]) || !id(value.missionId) || !integer(value.maxBytesPerSource, 1_024, 1_048_576) || !integer(value.maxRedirects, 0, 3) || !integer(value.timeoutMs, 500, 30_000) || !Array.isArray(value.claims) || value.claims.length < 1 || value.claims.length > 24 || !value.claims.every(claim) || !Array.isArray(value.targets) || value.targets.length < 1 || value.targets.length > 18 || !value.targets.every(target) || !Array.isArray(value.packs) || value.packs.length < 1 || value.packs.length > 6 || !value.packs.every(pack)) return invalid("Authorized Research Mission input is invalid");
    const claimIds = value.claims.map((item) => (item as { readonly claimId: string }).claimId);
    const evidenceIds = value.targets.map((item) => (item as { readonly evidenceId: string }).evidenceId);
    const packIds = value.packs.map((item) => (item as { readonly packId: string }).packId);
    if (new Set(claimIds).size !== claimIds.length || new Set(evidenceIds).size !== evidenceIds.length || new Set(packIds).size !== packIds.length) return invalid("Authorized Research identifiers must be unique");
    const knownClaims = new Set(claimIds);
    const knownEvidence = new Set(evidenceIds);
    if (!value.targets.every((item) => (item as { readonly claimIds: readonly string[] }).claimIds.every((claimId) => knownClaims.has(claimId))) || !value.packs.every((item) => (item as { readonly evidenceIds: readonly string[] }).evidenceIds.every((evidenceId) => knownEvidence.has(evidenceId)))) return invalid("Authorized Research references are invalid");
    const packed = new Set(value.packs.flatMap((item) => (item as { readonly evidenceIds: readonly string[] }).evidenceIds));
    if (packed.size !== evidenceIds.length || !evidenceIds.every((evidenceId) => packed.has(evidenceId))) return invalid("Every acquired evidence target must belong to an Evidence Pack plan");
    return valid(value as unknown as AuthorizedResearchMissionInput);
  }
}

export class ResearchAcquisitionSnapshotValidator implements Validator<ResearchAcquisitionSnapshot> {
  public validate(value: unknown): ValidationResult<ResearchAcquisitionSnapshot> {
    const expected = record(value) && value.contentPublishedAt === undefined
      ? ["acquiredAt", "actorId", "attribution", "byteLength", "contentText", "contentType", "evidenceId", "extractedFacts", "extractedTables", "finalUrl", "fingerprint", "limitations", "missionId", "redirectChain", "requestedUrl", "snapshotId", "sourceId", "title", "workspaceId"]
      : ["acquiredAt", "actorId", "attribution", "byteLength", "contentPublishedAt", "contentText", "contentType", "evidenceId", "extractedFacts", "extractedTables", "finalUrl", "fingerprint", "limitations", "missionId", "redirectChain", "requestedUrl", "snapshotId", "sourceId", "title", "workspaceId"];
    if (!record(value) || !exactKeys(value, expected) || !id(value.actorId) || !id(value.workspaceId) || !id(value.missionId) || !id(value.snapshotId) || !id(value.sourceId) || !id(value.evidenceId) || !timestamp(value.acquiredAt) || (value.contentPublishedAt !== undefined && !timestamp(value.contentPublishedAt)) || !httpsUrl(value.requestedUrl) || !httpsUrl(value.finalUrl) || !CONTENT_TYPES.includes(value.contentType as never) || !integer(value.byteLength, 1, 1_048_576) || !text(value.contentText, 1, 1_048_576) || !text(value.title, 1, 500) || !HASH.test(String(value.fingerprint)) || sha256(value.contentText) !== value.fingerprint || !Array.isArray(value.redirectChain) || value.redirectChain.length > 3 || !value.redirectChain.every(httpsUrl) || !attribution(value.attribution) || !facts(value.extractedFacts) || !tables(value.extractedTables) || !strings(value.limitations, 1, 12, 500)) return invalid("Authorized Research snapshot is invalid");
    return valid(value as unknown as ResearchAcquisitionSnapshot);
  }
}

export class AuthorizedResearchMissionValidator implements Validator<AuthorizedResearchMission> {
  readonly #input = new AuthorizedResearchMissionInputValidator();
  public validate(value: unknown): ValidationResult<AuthorizedResearchMission> {
    if (!record(value) || !exactKeys(value, ["actorId", "blockers", "claimResults", "contractVersion", "createdAt", "evidenceIds", "input", "inputFingerprint", "packIds", "snapshotIds", "status", "updatedAt", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !["BLOCKED", "READY", "RUNNING"].includes(String(value.status)) || !this.#input.validate(value.input).ok || !HASH.test(String(value.inputFingerprint)) || researchInputFingerprint(value.input as AuthorizedResearchMissionInput) !== value.inputFingerprint || !ids(value.snapshotIds, 0, 18) || !ids(value.evidenceIds, 0, 18) || !ids(value.packIds, 0, 6) || !strings(value.blockers, 0, 24, 500) || !claimResults(value.claimResults)) return invalid("Authorized Research Mission is invalid");
    if (value.status === "READY" && ((value.blockers as readonly unknown[]).length !== 0 || (value.packIds as readonly unknown[]).length !== (value.input as AuthorizedResearchMissionInput).packs.length)) return invalid("Ready Authorized Research Mission is incomplete");
    if (value.status === "BLOCKED" && (value.blockers as readonly unknown[]).length === 0) return invalid("Blocked Authorized Research Mission has no blocker");
    return valid(value as unknown as AuthorizedResearchMission);
  }
}

export function researchInputFingerprint(input: AuthorizedResearchMissionInput): string { return sha256(JSON.stringify(input)); }
export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

function claim(value: unknown): boolean { return record(value) && exactKeys(value, ["claimId", "contradictionPhrases", "requiredPhrases", "riskDomain", "statement"]) && id(value.claimId) && text(value.statement, 8, 500) && strings(value.requiredPhrases, 1, 8, 180) && strings(value.contradictionPhrases, 0, 8, 180) && RISK_DOMAINS.includes(value.riskDomain as never); }
function target(value: unknown): boolean { return record(value) && exactKeys(value, ["claimIds", "evidenceId", "limitations", "sourceId", "url"]) && ids(value.claimIds, 1, 8) && id(value.evidenceId) && id(value.sourceId) && httpsUrl(value.url) && strings(value.limitations, 1, 8, 320); }
function pack(value: unknown): boolean { return record(value) && exactKeys(value, ["evidenceIds", "opportunityId", "packId"]) && ids(value.evidenceIds, 1, 8) && id(value.opportunityId) && id(value.packId); }
function attribution(value: unknown): boolean { return record(value) && exactKeys(value, ["authorOrPublisher", "origin"]) && text(value.authorOrPublisher, 2, 300) && ["PAGE_METADATA", "SOURCE_REGISTRY"].includes(String(value.origin)); }
function facts(value: unknown): boolean { return Array.isArray(value) && value.length <= 24 && value.every((item) => record(item) && exactKeys(item, ["claimId", "excerpt", "statement", "status"]) && id(item.claimId) && text(item.statement, 8, 500) && text(item.excerpt, 1, 1_200) && ["CONTESTED", "INSUFFICIENT", "SUPPORTED"].includes(String(item.status))); }
function tables(value: unknown): boolean { return Array.isArray(value) && value.length <= 10 && value.every((table) => Array.isArray(table) && table.length <= 30 && table.every((row) => Array.isArray(row) && row.length <= 16 && row.every((cell) => text(cell, 0, 300)))); }
function claimResults(value: unknown): boolean { return Array.isArray(value) && value.length <= 24 && value.every((item) => record(item) && exactKeys(item, ["claimId", "evidenceIds", "independentSourceCount", "requiredSourceCount", "statement", "status"]) && id(item.claimId) && text(item.statement, 8, 500) && ids(item.evidenceIds, 0, 18) && integer(item.independentSourceCount, 0, 18) && [1, 2].includes(item.requiredSourceCount as number) && ["CONTESTED", "INSUFFICIENT", "STALE", "VERIFIED"].includes(String(item.status))); }
function ids(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every(id) && new Set(value).size === value.length; }
function strings(value: unknown, min: number, max: number, maxLength: number): boolean { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => text(item, 1, maxLength)); }
function httpsUrl(value: unknown): value is string { if (typeof value !== "string" || value.length > 1_000) return false; try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === ""; } catch { return false; } }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === expected.length && actual.every((key) => expected.includes(key)); }
function valid<T>(value: T): ValidationResult<T> { return validationSuccess(deepFreeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
