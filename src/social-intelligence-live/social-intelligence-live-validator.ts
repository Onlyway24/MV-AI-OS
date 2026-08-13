import { createHash } from "node:crypto";
import type { SocialLiveRecord } from "./social-intelligence-live.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

const ID = /^[a-zA-Z0-9@._:-]{1,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export class SocialLiveRecordValidator implements Validator<SocialLiveRecord> {
  public validate(value: unknown): ValidationResult<SocialLiveRecord> {
    if (!isRecord(value) || value.contractVersion !== "1" || !ID.test(String(value.recordId)) || !ID.test(String(value.workspaceId)) || !ID.test(String(value.actorId)) || !HASH.test(String(value.fingerprint)) || !timestamp(value.importedAt) || !kindShape(value)) return validationFailure([{ code: "invalid_value", message: "Social Intelligence Live record is invalid", path: "$" }]);
    const immutable = freeze(structuredClone(value)) as unknown as SocialLiveRecord;
    if (socialLiveFingerprint(payloadForFingerprint(immutable)) !== immutable.fingerprint) return validationFailure([{ code: "fingerprint_mismatch", message: "Social Intelligence Live fingerprint is invalid", path: "$.fingerprint" }]);
    return validationSuccess(immutable);
  }
}

export function socialLiveFingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
export function payloadForFingerprint(record: Omit<SocialLiveRecord, "fingerprint"> | SocialLiveRecord): unknown { const payload = { ...record } as Record<string, unknown>; delete payload.fingerprint; return payload; }

function kindShape(value: Record<string, unknown>): boolean {
  switch (value.kind) {
    case "ACCOUNT": return id(value.accountRef) && text(value.country) && ["INSTAGRAM", "TIKTOK"].includes(String(value.platform)) && value.ownership === "OWNED" && optionalCount(value.publicFollowers) && optionalCount(value.publicVisibleContentCount) && (value.publicObservedAt === undefined || timestamp(value.publicObservedAt));
    case "TREND": return text(value.keyword) && text(value.territory) && text(value.audience) && id(value.sourceId) && timestamp(value.observedAt) && timestamp(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.observedAt) && ["INSTAGRAM", "TIKTOK", "GOOGLE_TRENDS"].includes(String(value.platform)) && ["UNCLASSIFIED", "EMERGING", "DECLINING", "GROWING", "PEAK", "SATURATED"].includes(String(value.phase)) && optionalScore(value.velocity) && optionalScore(value.saturation) && optionalText(value.approximateTraffic) && (value.publishedAt === undefined || timestamp(value.publishedAt)) && (value.sourceByteLength === undefined || positiveCount(value.sourceByteLength)) && (value.sourceContentHash === undefined || typeof value.sourceContentHash === "string" && HASH.test(value.sourceContentHash)) && (value.sourceFinalUrl === undefined || httpsUrl(value.sourceFinalUrl)) && trendClassification(value);
    case "ANALYTICS": return id(value.accountRecordId) && id(value.contentId) && id(value.sourceId) && text(value.format) && timestamp(value.capturedAt) && timestamp(value.publishedAt) && Date.parse(value.capturedAt) >= Date.parse(value.publishedAt) && ["INSTAGRAM", "TIKTOK"].includes(String(value.platform)) && metrics(value.metrics) && (value.correctionOfRecordId === undefined || id(value.correctionOfRecordId));
    case "COMPETITOR": return id(value.accountRef) && id(value.authorizedBy) && timestamp(value.authorizedAt) && ["INSTAGRAM", "TIKTOK"].includes(String(value.platform)) && ["AUTHORIZED", "REVOKED"].includes(String(value.status)) && value.publicObservationOnly === true && texts(value.categories) && (value.replacesCompetitorRecordId === undefined || id(value.replacesCompetitorRecordId)) && optionalText(value.replacementReason);
    case "COMPETITOR_OBSERVATION": return id(value.competitorRecordId) && id(value.sourceId) && timestamp(value.observedAt) && ["format", "frequency", "hook", "coverPattern", "callToAction", "editorialGap"].every((key) => text(value[key])) && texts(value.hashtags) && texts(value.topics) && texts(value.repetitions) && (value.audio === undefined || text(value.audio)) && optionalCount(value.visibleEngagement) && (value.sourceContentHash === undefined || typeof value.sourceContentHash === "string" && HASH.test(value.sourceContentHash)) && optionalText(value.sourceExcerpt) && (value.sourceUrl === undefined || httpsUrl(value.sourceUrl));
    case "COMPETITOR_PACK": return competitorPack(value.pack);
    case "AUDIO_RIGHTS": return id(value.accountRef) && id(value.audioId) && id(value.sourceId) && text(value.title) && text(value.country) && text(value.mood) && typeof value.available === "boolean" && ["INSTAGRAM", "TIKTOK"].includes(String(value.platform)) && ["AVAILABLE", "NOT_AVAILABLE", "UNKNOWN"].includes(String(value.accountCompatibility)) && ["ALLOWED", "NOT_AUTHORIZED", "UNKNOWN"].includes(String(value.commercialUse)) && timestamp(value.observedAt) && timestamp(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.observedAt) && optionalScore(value.saturation);
    case "EXPERIMENT": return text(value.contentTheme) && text(value.hypothesis) && value.primaryVariable === "PUBLICATION_WINDOW" && ["AWAITING_FABIO_PARAMETERS", "READY_FOR_INTERNAL_SCHEDULING"].includes(String(value.status)) && Array.isArray(value.arms) && value.arms.length === 2 && isRecord(value.arms[0]) && isRecord(value.arms[1]) && value.arms[0].label === "FASCIA_SERALE" && value.arms[1].label === "FASCIA_PRANZO" && [value.arms[0].publicationAt, value.arms[1].publicationAt].every((entry) => entry === undefined || timestamp(entry)) && JSON.stringify(value.invariants) === JSON.stringify(["FORMAT", "STYLE", "CTA", "QUALITY"]) && JSON.stringify(value.metrics) === JSON.stringify(["SAVES_PER_REACH", "SHARES_PER_REACH", "PROFILE_VISITS_PER_REACH", "CAROUSEL_COMPLETION"]);
    default: return false;
  }
}
function competitorPack(value: unknown): boolean {
  if (!isRecord(value) || value.contractVersion !== "1" || !id(value.packId) || !positiveCount(value.version) || !timestamp(value.generatedAt) || !HASH.test(String(value.fingerprint)) || (value.supersedesFingerprint !== undefined && (typeof value.supersedesFingerprint !== "string" || !HASH.test(value.supersedesFingerprint))) || !["BLOCKED", "PARTIAL", "READY"].includes(String(value.status)) || value.copyingAllowed !== false || value.externalActionsAllowed !== false || !Array.isArray(value.findings) || !Array.isArray(value.sourceRecordIds) || !Array.isArray(value.opportunityGaps) || !Array.isArray(value.risks)) return false;
  const payload = structuredClone(value);
  delete payload.fingerprint;
  return socialLiveFingerprint(payload) === value.fingerprint;
}
function metrics(value: unknown): boolean { if (!isRecord(value) || Object.keys(value).length < 1) return false; const allowed = new Set(["carouselCompletions", "comments", "followersGained", "profileVisits", "reach", "saves", "shares", "slideDropOff", "views"]); return Object.entries(value).every(([key, entry]) => allowed.has(key) && (key === "slideDropOff" ? Array.isArray(entry) && entry.length > 0 && entry.every((item) => score(item)) : count(entry))); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 500; }
function optionalText(value: unknown): boolean { return value === undefined || text(value); }
function texts(value: unknown): boolean { return Array.isArray(value) && value.length <= 50 && value.every(text); }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function count(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0; }
function optionalCount(value: unknown): boolean { return value === undefined || count(value); }
function positiveCount(value: unknown): boolean { return count(value) && (value as number) > 0; }
function score(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100; }
function optionalScore(value: unknown): boolean { return value === undefined || score(value); }
function trendClassification(value: Record<string, unknown>): boolean {
  if (value.compatibility === undefined) return value.classificationEvidenceRecordIds === undefined && value.classificationRationale === undefined && value.classifiedAt === undefined && value.classifiedBy === undefined;
  if (typeof value.compatibility !== "string" || !["COMPATIBLE", "INCOMPATIBLE", "UNCLASSIFIED"].includes(value.compatibility)) return false;
  if (value.compatibility === "UNCLASSIFIED") return value.classificationEvidenceRecordIds === undefined && value.classificationRationale === undefined && value.classifiedAt === undefined && value.classifiedBy === undefined;
  return Array.isArray(value.classificationEvidenceRecordIds) && value.classificationEvidenceRecordIds.length >= 2 && value.classificationEvidenceRecordIds.length <= 20 && new Set(value.classificationEvidenceRecordIds).size === value.classificationEvidenceRecordIds.length && value.classificationEvidenceRecordIds.every(id) && text(value.classificationRationale) && timestamp(value.classifiedAt) && id(value.classifiedBy);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function httpsUrl(value: unknown): boolean { if (typeof value !== "string" || value.length > 1_000) return false; try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === ""; } catch { return false; } }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
