import { RepositoryValidationError } from "../errors/core-error.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import type { AuthorizedResearchClaimRequest, ExtractedResearchFact, RestrictedHttpsAcquisition } from "./authorized-research.js";

export interface AuthorizedDocumentExtraction {
  readonly attribution: { readonly authorOrPublisher: string; readonly origin: "PAGE_METADATA" | "SOURCE_REGISTRY" };
  readonly contentPublishedAt?: string;
  readonly facts: readonly ExtractedResearchFact[];
  readonly limitations: readonly string[];
  readonly tables: readonly (readonly (readonly string[])[])[];
  readonly text: string;
  readonly title: string;
}

export function extractAuthorizedDocument(input: {
  readonly acquiredAt: string;
  readonly acquisition: RestrictedHttpsAcquisition;
  readonly claims: readonly AuthorizedResearchClaimRequest[];
  readonly source: SourceRegistryEntry;
}): AuthorizedDocumentExtraction {
  const parsed = parse(input.acquisition.contentType, input.acquisition.body, input.acquisition.finalUrl);
  const contentPublishedAt = publishedAt(parsed.metadata, input.acquisition.lastModified, input.acquiredAt);
  const pageAttribution = parsed.metadata.author ?? parsed.metadata.publisher;
  const official = ["AUTHORIZED_DATASET", "OFFICIAL_DOCUMENTATION", "OFFICIAL_SITE"].includes(input.source.category);
  if (pageAttribution === undefined && !official) throw new RepositoryValidationError("Research page does not provide sufficient author or publisher attribution");
  const limitations = [
    ...(contentPublishedAt === undefined ? ["La data originale del contenuto non è disponibile; la freshness parte dall'acquisizione."] : []),
    ...(pageAttribution === undefined ? ["L'editore è attestato dal Source Registry autorizzato, non dai metadati della pagina."] : []),
  ];
  const facts = input.claims.map((claim) => fact(claim, parsed.text));
  return deepFreeze({
    attribution: pageAttribution === undefined
      ? { authorOrPublisher: input.source.name, origin: "SOURCE_REGISTRY" as const }
      : { authorOrPublisher: pageAttribution, origin: "PAGE_METADATA" as const },
    ...(contentPublishedAt === undefined ? {} : { contentPublishedAt }),
    facts,
    limitations,
    tables: parsed.tables,
    text: parsed.text,
    title: parsed.title || input.source.name,
  });
}

function parse(contentType: RestrictedHttpsAcquisition["contentType"], body: string, finalUrl: string): { readonly metadata: Metadata; readonly tables: readonly (readonly (readonly string[])[])[]; readonly text: string; readonly title: string } {
  if (contentType === "text/html") return parseHtml(body);
  if (contentType === "application/json") return parseJson(body, finalUrl);
  if (contentType === "text/csv") return parseCsv(body, finalUrl);
  const text = normalize(body);
  if (text.length < 40) throw new RepositoryValidationError("Research document has insufficient attributable content");
  return { metadata: {}, tables: [], text, title: titleFromUrl(finalUrl) };
}

function parseHtml(body: string): { readonly metadata: Metadata; readonly tables: readonly (readonly (readonly string[])[])[]; readonly text: string; readonly title: string } {
  const withoutActive = body.replace(/<!--[\s\S]*?-->/gu, " ").replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/giu, " ");
  const metadata = htmlMetadata(withoutActive);
  const title = clean(matchTag(withoutActive, "title") ?? metadata.title ?? "");
  const tables = [...withoutActive.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)].slice(0, 10).map((match) => parseHtmlTable(match[1] ?? "")).filter((table) => table.length > 0);
  const text = normalize(decodeEntities(withoutActive.replace(/<br\s*\/?\s*>/giu, "\n").replace(/<\/(p|li|h[1-6]|tr|section|article)>/giu, "\n").replace(/<[^>]+>/gu, " ")));
  if (title.length < 1 || text.length < 80) throw new RepositoryValidationError("Research HTML page has insufficient title or attributable content");
  return { metadata, tables, text, title };
}

function parseJson(body: string, finalUrl: string): { readonly metadata: Metadata; readonly tables: readonly (readonly (readonly string[])[])[]; readonly text: string; readonly title: string } {
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new RepositoryValidationError("Research JSON document is malformed"); }
  const text = normalize(flattenJson(value).join("\n"));
  if (text.length < 20) throw new RepositoryValidationError("Research JSON document has insufficient content");
  const root = record(value) ? value : {};
  return { metadata: metadata({ author: scalar(root.author), publisher: scalar(root.publisher), publishedAt: scalar(root.datePublished ?? root.publishedAt), title: scalar(root.title ?? root.name) }), tables: jsonTables(value), text, title: scalar(root.title ?? root.name) ?? titleFromUrl(finalUrl) };
}

function parseCsv(body: string, finalUrl: string): { readonly metadata: Metadata; readonly tables: readonly (readonly (readonly string[])[])[]; readonly text: string; readonly title: string } {
  const rows = body.split(/\r?\n/u).filter((row) => row.trim().length > 0).slice(0, 30).map(csvRow);
  if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) throw new RepositoryValidationError("Research CSV document has insufficient tabular content");
  const table = Object.freeze(rows.map((row) => Object.freeze(row.slice(0, 16).map((cell) => clean(cell).slice(0, 300)))));
  return { metadata: {}, tables: [table], text: normalize(table.map((row) => row.join(" | ")).join("\n")), title: titleFromUrl(finalUrl) };
}

function fact(claim: AuthorizedResearchClaimRequest, text: string): ExtractedResearchFact {
  const normalized = text.toLocaleLowerCase("it-IT");
  const support = claim.requiredPhrases.every((phrase) => normalized.includes(phrase.toLocaleLowerCase("it-IT")));
  const contradiction = claim.contradictionPhrases.some((phrase) => normalized.includes(phrase.toLocaleLowerCase("it-IT")));
  const anchor = claim.requiredPhrases.find((phrase) => normalized.includes(phrase.toLocaleLowerCase("it-IT"))) ?? claim.contradictionPhrases.find((phrase) => normalized.includes(phrase.toLocaleLowerCase("it-IT")));
  return Object.freeze({
    claimId: claim.claimId,
    excerpt: excerpt(text, anchor),
    statement: claim.statement,
    status: contradiction ? "CONTESTED" : support ? "SUPPORTED" : "INSUFFICIENT",
  });
}

function htmlMetadata(html: string): Metadata {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b([^>]+)>/giu)) {
    const attributes = attrs(match[1] ?? "");
    const key = (attributes.get("name") ?? attributes.get("property") ?? attributes.get("itemprop"))?.toLowerCase();
    const content = attributes.get("content");
    if (key !== undefined && content !== undefined) values.set(key, clean(decodeEntities(content)));
  }
  return metadata({
    author: first(values, ["author", "article:author", "byl"]),
    publisher: first(values, ["publisher", "og:site_name", "article:publisher"]),
    publishedAt: first(values, ["article:published_time", "datepublished", "date", "dc.date"]),
    title: first(values, ["og:title", "twitter:title", "headline"]),
  });
}

interface Metadata { readonly author?: string; readonly publisher?: string; readonly publishedAt?: string; readonly title?: string; }
function metadata(value: { readonly author: string | undefined; readonly publisher: string | undefined; readonly publishedAt: string | undefined; readonly title: string | undefined }): Metadata { return { ...(value.author === undefined ? {} : { author: value.author }), ...(value.publisher === undefined ? {} : { publisher: value.publisher }), ...(value.publishedAt === undefined ? {} : { publishedAt: value.publishedAt }), ...(value.title === undefined ? {} : { title: value.title }) }; }
function first(values: ReadonlyMap<string, string>, keys: readonly string[]): string | undefined { return keys.map((key) => values.get(key)).find((value) => value !== undefined && value.length > 1); }
function publishedAt(metadata: Metadata, lastModified: string | undefined, acquiredAt: string): string | undefined { const candidate = metadata.publishedAt ?? lastModified; if (candidate === undefined) return undefined; const parsed = Date.parse(candidate); if (!Number.isFinite(parsed) || parsed > Date.parse(acquiredAt)) return undefined; return new Date(parsed).toISOString(); }
function matchTag(html: string, tag: string): string | undefined { return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu").exec(html)?.[1]; }
function parseHtmlTable(value: string): readonly (readonly string[])[] { return Object.freeze([...value.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].slice(0, 30).map((row) => Object.freeze([...(row[1] ?? "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/giu)].slice(0, 16).map((cell) => clean(decodeEntities((cell[1] ?? "").replace(/<[^>]+>/gu, " "))).slice(0, 300)))).filter((row) => row.length > 0)); }
function attrs(value: string): Map<string, string> { const result = new Map<string, string>(); for (const match of value.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu)) result.set(match[1]?.toLowerCase() ?? "", match[2] ?? match[3] ?? match[4] ?? ""); return result; }
function decodeEntities(value: string): string { return value.replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code))); }
function normalize(value: string): string { return value.replaceAll("\u0000", "").replace(/[\t ]+/gu, " ").replace(/\n\s+/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim(); }
function clean(value: string): string { return normalize(value).replace(/\s+/gu, " "); }
function excerpt(text: string, anchor: string | undefined): string { if (anchor === undefined) return text.slice(0, 600); const index = text.toLocaleLowerCase("it-IT").indexOf(anchor.toLocaleLowerCase("it-IT")); const start = Math.max(0, index - 180); return text.slice(start, Math.min(text.length, start + 900)).trim(); }
function titleFromUrl(value: string): string { const url = new URL(value); const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname; return decodeURIComponent(segment).replace(/[-_]+/gu, " ").slice(0, 500) || url.hostname; }
function scalar(value: unknown): string | undefined { return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 500) : undefined; }
function flattenJson(value: unknown, path = "$", output: string[] = []): string[] { if (output.length >= 500) return output; if (value === null || ["string", "number", "boolean"].includes(typeof value)) { output.push(`${path}: ${String(value)}`); return output; } if (Array.isArray(value)) { value.slice(0, 100).forEach((item, index) => flattenJson(item, `${path}[${String(index)}]`, output)); return output; } if (record(value)) Object.entries(value).slice(0, 100).forEach(([key, item]) => flattenJson(item, `${path}.${key}`, output)); return output; }
function jsonTables(value: unknown): readonly (readonly (readonly string[])[])[] { if (!Array.isArray(value) || value.length < 1 || !value.every(record)) return []; const keys = [...new Set(value.flatMap((item) => Object.keys(item)))].slice(0, 16); return [Object.freeze([Object.freeze(keys), ...value.slice(0, 29).map((item) => Object.freeze(keys.map((key) => displayScalar(item[key]).slice(0, 300))))])]; }
function displayScalar(value: unknown): string { if (value === undefined || value === null) return ""; if (typeof value === "string") return value; if (typeof value === "number" || typeof value === "boolean") return String(value); return JSON.stringify(value); }
function csvRow(value: string): string[] { const cells: string[] = []; let current = ""; let quoted = false; for (let index = 0; index < value.length; index += 1) { const char = value[index] ?? ""; if (char === '"' && quoted && value[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { cells.push(current); current = ""; } else current += char; } cells.push(current); return cells; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
