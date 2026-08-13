import { createHash } from "node:crypto";

import { RepositoryValidationError } from "../errors/core-error.js";
import type { SocialLiveRecord, SocialTrendObservation } from "./social-intelligence-live.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

export interface GoogleTrendsRssImport {
  readonly contentHash: string;
  readonly items: readonly SocialTrendObservation[];
}

export function parseGoogleTrendsRss(input: {
  readonly acquiredAt: string;
  readonly byteLength: number;
  readonly finalUrl: string;
  readonly maxItems?: number;
  readonly service: SocialIntelligenceLiveService;
  readonly sourceId: string;
  readonly territory: "IT";
  readonly xml: string;
}): GoogleTrendsRssImport {
  if (input.xml.length < 1 || input.xml.length > 1_048_576 || input.byteLength < 1 || input.byteLength > 1_048_576 || !input.xml.includes("<rss") || !input.xml.includes("https://trends.google.com/trending/rss")) throw new RepositoryValidationError("Google Trends RSS payload is invalid");
  const maxItems = input.maxItems ?? 25;
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 50) throw new RepositoryValidationError("Google Trends RSS item limit is invalid");
  const contentHash = createHash("sha256").update(input.xml, "utf8").digest("hex");
  const blocks = [...input.xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)].slice(0, maxItems);
  if (blocks.length < 1) throw new RepositoryValidationError("Google Trends RSS contains no attributable items");
  const identifiers = new Set<string>();
  const items = blocks.map((match, index): SocialTrendObservation => {
    const block = match[1] ?? "";
    const keyword = requiredElement(block, "title");
    const approximateTraffic = requiredElement(block, "ht:approx_traffic");
    const publishedAt = httpDate(requiredElement(block, "pubDate"));
    const suffix = createHash("sha256").update(`${publishedAt}\n${keyword}`, "utf8").digest("hex").slice(0, 16);
    const recordId = `google-trends-it-${contentHash.slice(0, 12)}-${suffix}`;
    if (identifiers.has(recordId)) throw new RepositoryValidationError("Google Trends RSS contains duplicate items", { index });
    identifiers.add(recordId);
    return input.service.createRecord({
      approximateTraffic,
      audience: "Pubblico Google Trends Italia; compatibilità Metodo Veloce non ancora classificata",
      expiresAt: new Date(Date.parse(input.acquiredAt) + 86_400_000).toISOString(),
      keyword,
      kind: "TREND",
      observedAt: input.acquiredAt,
      phase: "UNCLASSIFIED",
      platform: "GOOGLE_TRENDS",
      publishedAt,
      recordId,
      sourceByteLength: input.byteLength,
      sourceContentHash: contentHash,
      sourceFinalUrl: input.finalUrl,
      sourceId: input.sourceId,
      territory: input.territory,
    }) as SocialTrendObservation;
  });
  return Object.freeze({ contentHash, items: Object.freeze(items) });
}

export function googleTrendsBatchRecords(value: GoogleTrendsRssImport): readonly SocialLiveRecord[] { return value.items; }

function requiredElement(block: string, name: string): string {
  const match = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "u").exec(block);
  const value = match?.[1] === undefined ? "" : decodeXml(match[1]).trim();
  if (value.length < 1 || value.length > 500) throw new RepositoryValidationError("Google Trends RSS item is missing a required field", { name });
  return value;
}

function httpDate(value: string): string { const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new RepositoryValidationError("Google Trends RSS publication date is invalid"); return new Date(parsed).toISOString(); }
function decodeXml(value: string): string { return value.replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code))).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">"); }
