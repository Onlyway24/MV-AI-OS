import { RepositoryValidationError } from "../errors/core-error.js";
import type { SocialAnalyticsSnapshot, SocialLivePlatform, SocialLiveRecord } from "./social-intelligence-live.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

const HEADERS = Object.freeze(["snapshot_id", "content_id", "published_at", "captured_at", "format", "reach", "views", "saves", "shares", "comments", "profile_visits", "followers_gained", "carousel_completions"] as const);

export function parseSocialAnalyticsCsv(input: {
  readonly accountRecordId: string;
  readonly csv: string;
  readonly platform: SocialLivePlatform;
  readonly service: SocialIntelligenceLiveService;
  readonly sourceId: string;
}): readonly SocialLiveRecord[] {
  if (input.csv.length < 1 || input.csv.length > 2_000_000 || input.csv.includes("\u0000")) throw new RepositoryValidationError("Social analytics CSV size or encoding is invalid");
  const rows = parseBoundedSocialCsv(input.csv);
  const header = rows[0];
  if (header?.length !== HEADERS.length || header.some((value, index) => value !== HEADERS[index])) throw new RepositoryValidationError("Social analytics CSV header is invalid");
  if (rows.length < 2 || rows.length > 501) throw new RepositoryValidationError("Social analytics CSV must contain between 1 and 500 data rows");
  const identifiers = new Set<string>();
  return Object.freeze(rows.slice(1).map((row, index) => {
    if (row.length !== HEADERS.length) throw new RepositoryValidationError("Social analytics CSV row has an invalid column count", { row: index + 2 });
    const [snapshotId, contentId, publishedAt, capturedAt, format, reach, views, saves, shares, comments, profileVisits, followersGained, carouselCompletions] = row;
    if (snapshotId === undefined || identifiers.has(snapshotId)) throw new RepositoryValidationError("Social analytics CSV snapshot IDs must be unique");
    identifiers.add(snapshotId);
    const metrics = compactMetrics({ carouselCompletions, comments, followersGained, profileVisits, reach, saves, shares, views });
    return input.service.createRecord({ accountRecordId: input.accountRecordId, capturedAt, contentId, format, kind: "ANALYTICS", metrics, platform: input.platform, publishedAt, recordId: snapshotId, sourceId: input.sourceId }) as SocialAnalyticsSnapshot;
  }));
}

function compactMetrics(input: Readonly<Record<string, string | undefined>>): SocialAnalyticsSnapshot["metrics"] {
  const entries = Object.entries(input).flatMap(([key, value]) => value === undefined || value === "" ? [] : [[key, integer(value, key)] as const]);
  if (entries.length < 1) throw new RepositoryValidationError("Each social analytics row requires at least one real metric");
  return Object.freeze(Object.fromEntries(entries));
}
function integer(value: string, field: string): number { if (!/^\d+$/u.test(value)) throw new RepositoryValidationError("Social analytics metric must be a non-negative integer", { field }); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new RepositoryValidationError("Social analytics metric is outside the safe range", { field }); return parsed; }

export function parseBoundedSocialCsv(value: string): readonly (readonly string[])[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') { if (quoted && value[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; continue; }
    if (!quoted && character === ",") { row.push(field); field = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && value[index + 1] === "\n") index += 1; row.push(field); field = ""; if (row.some((entry) => entry !== "")) rows.push(row); row = []; continue; }
    field += character ?? "";
  }
  if (quoted) throw new RepositoryValidationError("Social analytics CSV contains an unterminated quoted field");
  row.push(field); if (row.some((entry) => entry !== "")) rows.push(row);
  return Object.freeze(rows.map((entry) => Object.freeze(entry)));
}

export function socialAnalyticsCsvTemplate(): string { return `${HEADERS.join(",")}\n`; }
