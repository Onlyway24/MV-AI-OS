import { createHash } from "node:crypto";

import { RepositoryValidationError } from "../errors/core-error.js";
import type { CompetitorObservation, SocialLiveRecord } from "./social-intelligence-live.js";
import { parseBoundedSocialCsv } from "./social-analytics-csv-adapter.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

const HEADERS = Object.freeze(["observation_id", "competitor_record_id", "observed_at", "source_url", "source_excerpt", "format", "frequency", "hook", "cover_pattern", "call_to_action", "audio", "hashtags", "topics", "repetitions", "visible_engagement", "editorial_gap"] as const);

export function parseCompetitorObservationsCsv(input: { readonly csv: string; readonly service: SocialIntelligenceLiveService; readonly sourceId: string }): readonly SocialLiveRecord[] {
  if (input.csv.length < 1 || input.csv.length > 2_000_000 || input.csv.includes("\u0000")) throw new RepositoryValidationError("Competitor observation CSV size or encoding is invalid");
  const rows = parseBoundedSocialCsv(input.csv);
  const header = rows[0];
  if (header?.length !== HEADERS.length || header.some((value, index) => value !== HEADERS[index])) throw new RepositoryValidationError("Competitor observation CSV header is invalid");
  if (rows.length < 2 || rows.length > 501) throw new RepositoryValidationError("Competitor observation CSV must contain between 1 and 500 data rows");
  const identifiers = new Set<string>();
  return Object.freeze(rows.slice(1).map((row, index) => {
    if (row.length !== HEADERS.length) throw new RepositoryValidationError("Competitor observation CSV row has an invalid column count", { row: index + 2 });
    const [recordId, competitorRecordId, observedAt, sourceUrl, sourceExcerpt, format, frequency, hook, coverPattern, callToAction, audio, hashtags, topics, repetitions, visibleEngagement, editorialGap] = row;
    if (!safeId(recordId) || identifiers.has(recordId)) throw new RepositoryValidationError("Competitor observation IDs must be unique and safe", { row: index + 2 });
    identifiers.add(recordId);
    if (!safeId(competitorRecordId) || !timestamp(observedAt) || !httpsUrl(sourceUrl) || !text(sourceExcerpt) || !text(format) || !text(frequency) || !text(hook) || !text(coverPattern) || !text(callToAction) || !text(editorialGap)) throw new RepositoryValidationError("Competitor observation CSV row is incomplete", { row: index + 2 });
    const parsedTopics = list(topics, "topics");
    if (parsedTopics.length < 1) throw new RepositoryValidationError("Competitor observation requires at least one topic", { row: index + 2 });
    return input.service.createRecord({
      ...(audio === undefined || audio === "" ? {} : { audio }),
      callToAction,
      competitorRecordId,
      coverPattern,
      editorialGap,
      format,
      frequency,
      hashtags: list(hashtags, "hashtags"),
      hook,
      kind: "COMPETITOR_OBSERVATION",
      observedAt,
      recordId,
      repetitions: list(repetitions, "repetitions"),
      sourceContentHash: createHash("sha256").update(sourceExcerpt, "utf8").digest("hex"),
      sourceExcerpt,
      sourceId: input.sourceId,
      sourceUrl,
      topics: parsedTopics,
      ...(visibleEngagement === undefined || visibleEngagement === "" ? {} : { visibleEngagement: count(visibleEngagement, "visible_engagement") }),
    }) as CompetitorObservation;
  }));
}

export function competitorObservationsCsvTemplate(): string { return `${HEADERS.join(",")}\n`; }

function list(value: string | undefined, field: string): readonly string[] { if (value === undefined || value === "") return Object.freeze([]); const values = value.split("|").map((entry) => entry.trim()); if (values.length > 50 || values.some((entry) => !text(entry))) throw new RepositoryValidationError("Competitor observation list is invalid", { field }); return Object.freeze(values); }
function count(value: string, field: string): number { if (!/^\d+$/u.test(value)) throw new RepositoryValidationError("Competitor observation count is invalid", { field }); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new RepositoryValidationError("Competitor observation count is outside the safe range", { field }); return parsed; }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9@._:-]{1,128}$/u.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 500; }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function httpsUrl(value: unknown): value is string { if (typeof value !== "string" || value.length > 1_000) return false; try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === ""; } catch { return false; } }
