import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { SourceRegistryEntry } from "../operational-planes/operational-plane.js";
import type { RestrictedHttpsAcquisition } from "./authorized-research.js";

const ALLOWED_CONTENT_TYPES = Object.freeze(["application/json", "text/csv", "text/html", "text/plain", "text/xml"] as const);

export interface RestrictedHttpsClient {
  acquire(input: {
    readonly maxBytes: number;
    readonly maxRedirects: number;
    readonly source: SourceRegistryEntry;
    readonly timeoutMs: number;
    readonly url: string;
  }): Promise<RestrictedHttpsAcquisition>;
}

export interface RestrictedHttpsResolver {
  resolve(hostname: string): Promise<readonly { readonly address: string; readonly family: 4 | 6 }[]>;
}

export interface RestrictedHttpsRequestDriver {
  get(input: {
    readonly address: string;
    readonly family: 4 | 6;
    readonly maxBytes: number;
    readonly timeoutMs: number;
    readonly url: URL;
  }): Promise<{
    readonly body: Uint8Array;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly statusCode: number;
  }>;
}

export class NodeRestrictedHttpsClient implements RestrictedHttpsClient {
  public constructor(private readonly dependencies: {
    readonly request?: RestrictedHttpsRequestDriver;
    readonly resolver?: RestrictedHttpsResolver;
  } = {}) {}

  public async acquire(input: {
    readonly maxBytes: number;
    readonly maxRedirects: number;
    readonly source: SourceRegistryEntry;
    readonly timeoutMs: number;
    readonly url: string;
  }): Promise<RestrictedHttpsAcquisition> {
    if (input.source.status !== "AUTHORIZED" || input.source.category === "FORBIDDEN") throw new RepositoryConflictError("Research source is not authorized");
    let current = authorizedUrl(input.url, input.source);
    const redirects: string[] = [];
    const resolver = this.dependencies.resolver ?? systemResolver;
    const driver = this.dependencies.request ?? systemRequestDriver;

    for (let redirectCount = 0; redirectCount <= input.maxRedirects; redirectCount += 1) {
      const addresses = await resolver.resolve(current.hostname);
      const approved = addresses.filter(({ address, family }) => family === isIP(address) && publicAddress(address));
      if (approved.length === 0 || approved.length !== addresses.length) throw new RepositoryValidationError("Research destination does not resolve exclusively to public addresses");
      const endpoint = approved[0];
      if (endpoint === undefined) throw new RepositoryValidationError("Research destination has no approved address");
      const response = await driver.get({ address: endpoint.address, family: endpoint.family, maxBytes: input.maxBytes, timeoutMs: input.timeoutMs, url: current });
      if (redirect(response.statusCode)) {
        if (redirectCount >= input.maxRedirects) throw new RepositoryConflictError("Research redirect limit exceeded");
        const location = response.headers.location;
        if (location === undefined) throw new RepositoryValidationError("Research redirect is missing a location");
        const next = authorizedUrl(new URL(location, current).toString(), input.source);
        redirects.push(next.toString());
        current = next;
        continue;
      }
      if (response.statusCode !== 200) throw new RepositoryConflictError("Research source returned a non-success status", { statusCode: response.statusCode });
      const declaredLength = numberHeader(response.headers["content-length"]);
      if (declaredLength !== undefined && declaredLength > input.maxBytes) throw new RepositoryValidationError("Research content exceeds the configured byte limit");
      if (response.body.byteLength < 1 || response.body.byteLength > input.maxBytes) throw new RepositoryValidationError("Research response size is outside the configured limit");
      const contentType = normalizedContentType(response.headers["content-type"]);
      const body = decodeUtf8(response.body);
      const lastModified = validHttpDate(response.headers["last-modified"]);
      return Object.freeze({
        body,
        byteLength: response.body.byteLength,
        contentType,
        finalUrl: current.toString(),
        ...(lastModified === undefined ? {} : { lastModified }),
        redirectChain: Object.freeze([...redirects]),
      });
    }
    throw new RepositoryConflictError("Research acquisition did not reach a terminal response");
  }
}

function authorizedUrl(value: string, source: SourceRegistryEntry): URL {
  let candidate: URL;
  let canonical: URL;
  try { candidate = new URL(value); canonical = new URL(source.canonicalReference); }
  catch { throw new RepositoryValidationError("Research URL is invalid"); }
  if (candidate.protocol !== "https:" || canonical.protocol !== "https:" || candidate.username !== "" || candidate.password !== "" || candidate.hash !== "" || candidate.port !== "" && candidate.port !== "443") throw new RepositoryValidationError("Research URL violates the HTTPS-only policy");
  if (canonical.username !== "" || canonical.password !== "" || canonical.hash !== "" || canonical.port !== "" && canonical.port !== "443") throw new RepositoryValidationError("Source Registry canonical URL violates the HTTPS-only policy");
  if (containsCredentialParameter(candidate) || containsCredentialParameter(canonical)) throw new RepositoryValidationError("Research URL must not contain credentials or secret-bearing query parameters");
  if (candidate.hostname !== canonical.hostname || candidate.port !== canonical.port) throw new RepositoryValidationError("Research URL domain is not authorized");
  const basePath = canonical.pathname.endsWith("/") ? canonical.pathname : `${canonical.pathname}/`;
  if (canonical.pathname !== "/" && candidate.pathname !== canonical.pathname && !candidate.pathname.startsWith(basePath)) throw new RepositoryValidationError("Research URL path is outside the authorized source boundary");
  return candidate;
}

function containsCredentialParameter(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) => /^(?:access[-_]?token|api[-_]?key|auth(?:orization)?|password|passwd|secret|signature|sig|token)$/iu.test(key));
}

function normalizedContentType(value: string | undefined): RestrictedHttpsAcquisition["contentType"] {
  if (value === undefined) throw new RepositoryValidationError("Research response has no declared MIME type");
  const [rawType, ...parameters] = value.toLowerCase().split(";").map((item) => item.trim());
  if (!ALLOWED_CONTENT_TYPES.includes(rawType as never)) throw new RepositoryValidationError("Research response MIME type is not allowed");
  const charset = parameters.find((item) => item.startsWith("charset="))?.slice("charset=".length).replaceAll('"', "");
  if (charset !== undefined && charset !== "utf-8" && charset !== "utf8") throw new RepositoryValidationError("Research response charset is not supported");
  return rawType as RestrictedHttpsAcquisition["contentType"];
}

function decodeUtf8(value: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(value); }
  catch { throw new RepositoryValidationError("Research response is not valid UTF-8 text"); }
}

function redirect(statusCode: number): boolean { return [301, 302, 303, 307, 308].includes(statusCode); }
function numberHeader(value: string | undefined): number | undefined { if (value === undefined || !/^\d+$/u.test(value)) return undefined; const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : undefined; }
function validHttpDate(value: string | undefined): string | undefined { if (value === undefined) return undefined; const parsed = Date.parse(value); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined; }

function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a = -1, b = -1] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 2, 168].includes(b) || a === 198 && [18, 19, 51].includes(b) || a === 203 && b === 0 || a === 100 && b >= 64 && b <= 127);
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/u.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return false;
    if (normalized.startsWith("::ffff:")) return publicAddress(normalized.slice("::ffff:".length));
    return true;
  }
  return false;
}

const systemResolver: RestrictedHttpsResolver = Object.freeze({
  async resolve(hostname: string) {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return Object.freeze(results.map(({ address, family }) => Object.freeze({ address, family: family as 4 | 6 })));
  },
});

const systemRequestDriver: RestrictedHttpsRequestDriver = Object.freeze({
  get(input: { readonly address: string; readonly family: 4 | 6; readonly maxBytes: number; readonly timeoutMs: number; readonly url: URL }) {
    return new Promise<{ readonly body: Uint8Array; readonly headers: Readonly<Record<string, string | undefined>>; readonly statusCode: number }>((resolve, reject) => {
      const request = httpsRequest(input.url, {
        headers: Object.freeze({ Accept: ALLOWED_CONTENT_TYPES.join(", "), "User-Agent": "MV-AI-OS-AuthorizedResearch/1.0" }),
        lookup: (_hostname, options, callback) => {
          if (options.all === true) callback(null, [{ address: input.address, family: input.family }]);
          else callback(null, input.address, input.family);
        },
        method: "GET",
        rejectUnauthorized: true,
        servername: input.url.hostname,
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > input.maxBytes) { request.destroy(new RepositoryValidationError("Research content exceeds the configured byte limit")); return; }
          chunks.push(chunk);
        });
        response.on("end", () => { resolve(Object.freeze({ body: Buffer.concat(chunks), headers: safeHeaders(response.headers), statusCode: response.statusCode ?? 0 })); });
      });
      request.setTimeout(input.timeoutMs, () => request.destroy(new RepositoryConflictError("Research HTTPS request timed out")));
      request.on("error", reject);
      request.end();
    });
  },
});

function safeHeaders(value: Readonly<Record<string, string | readonly string[] | undefined>>): Readonly<Record<string, string | undefined>> {
  const allowed = ["content-length", "content-type", "last-modified", "location"] as const;
  return Object.freeze(Object.fromEntries(allowed.map((name) => { const raw = value[name]; return [name, Array.isArray(raw) ? raw[0] : raw]; })));
}
