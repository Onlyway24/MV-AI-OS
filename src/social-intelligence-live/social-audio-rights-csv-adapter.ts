import { RepositoryValidationError } from "../errors/core-error.js";
import type { SocialAudioRightsObservation, SocialLiveRecord } from "./social-intelligence-live.js";
import { parseBoundedSocialCsv } from "./social-analytics-csv-adapter.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

const HEADERS = Object.freeze(["observation_id", "audio_id", "title", "platform", "account_ref", "country", "available", "account_compatibility", "commercial_use", "mood", "observed_at", "expires_at", "saturation"] as const);

export function parseAudioRightsCsv(input: { readonly csv: string; readonly service: SocialIntelligenceLiveService; readonly sourceId: string }): readonly SocialLiveRecord[] {
  if (input.csv.length < 1 || input.csv.length > 2_000_000 || input.csv.includes("\u0000")) throw new RepositoryValidationError("Audio rights CSV size or encoding is invalid");
  const rows = parseBoundedSocialCsv(input.csv);
  const header = rows[0];
  if (header?.length !== HEADERS.length || header.some((value, index) => value !== HEADERS[index])) throw new RepositoryValidationError("Audio rights CSV header is invalid");
  if (rows.length < 2 || rows.length > 501) throw new RepositoryValidationError("Audio rights CSV must contain between 1 and 500 data rows");
  const identifiers = new Set<string>();
  return Object.freeze(rows.slice(1).map((row, index) => {
    if (row.length !== HEADERS.length) throw new RepositoryValidationError("Audio rights CSV row has an invalid column count", { row: index + 2 });
    const [recordId, audioId, title, platform, accountRef, country, rawAvailable, accountCompatibility, commercialUse, mood, observedAt, expiresAt, rawSaturation] = row;
    if (!safeId(recordId) || identifiers.has(recordId) || !safeId(audioId) || !safeId(accountRef)) throw new RepositoryValidationError("Audio rights identifiers are invalid", { row: index + 2 });
    identifiers.add(recordId);
    if (platform !== "TIKTOK" || !text(title) || !countryCode(country) || !text(mood) || !timestamp(observedAt) || !timestamp(expiresAt) || Date.parse(expiresAt) <= Date.parse(observedAt) || !["AVAILABLE", "NOT_AVAILABLE", "UNKNOWN"].includes(accountCompatibility ?? "") || !["ALLOWED", "NOT_AUTHORIZED", "UNKNOWN"].includes(commercialUse ?? "")) throw new RepositoryValidationError("Audio rights CSV row is incomplete or inconsistent", { row: index + 2 });
    const available = boolean(rawAvailable, "available");
    if (commercialUse === "ALLOWED" && (!available || accountCompatibility !== "AVAILABLE") || !available && commercialUse === "ALLOWED") throw new RepositoryValidationError("Authorized commercial audio must be available for the exact account", { row: index + 2 });
    return input.service.createRecord({
      accountCompatibility,
      accountRef,
      audioId,
      available,
      commercialUse,
      country,
      expiresAt,
      kind: "AUDIO_RIGHTS",
      mood,
      observedAt,
      platform,
      recordId,
      ...(rawSaturation === undefined || rawSaturation === "" ? {} : { saturation: score(rawSaturation, "saturation") }),
      sourceId: input.sourceId,
      title,
    }) as SocialAudioRightsObservation;
  }));
}

export function audioRightsCsvTemplate(): string { return `${HEADERS.join(",")}\n`; }

function boolean(value: string | undefined, field: string): boolean { if (value === "true") return true; if (value === "false") return false; throw new RepositoryValidationError("Audio rights boolean is invalid", { field }); }
function score(value: string, field: string): number { if (!/^\d+$/u.test(value)) throw new RepositoryValidationError("Audio rights score is invalid", { field }); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed > 100) throw new RepositoryValidationError("Audio rights score is outside 0-100", { field }); return parsed; }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9@._:-]{1,128}$/u.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 500; }
function countryCode(value: unknown): value is string { return typeof value === "string" && /^[A-Z]{2}$/u.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
