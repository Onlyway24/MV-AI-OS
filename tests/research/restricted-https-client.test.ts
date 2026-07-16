import { describe, expect, it } from "vitest";

import type { SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import { NodeRestrictedHttpsClient, type RestrictedHttpsRequestDriver, type RestrictedHttpsResolver } from "../../src/research/restricted-https-client.js";

const encoder = new TextEncoder();

describe("NodeRestrictedHttpsClient", () => {
  it("acquires only bounded UTF-8 documents from the exact authorized HTTPS boundary", async () => {
    const requests: string[] = [];
    const client = new NodeRestrictedHttpsClient({
      request: driver((url) => {
        requests.push(url.toString());
        return response(200, "<html><title>Rapporto</title><body>Contenuto verificabile sufficientemente lungo per la ricerca autorizzata.</body></html>", { "content-type": "text/html; charset=utf-8", "last-modified": "Tue, 14 Jul 2026 09:00:00 GMT" });
      }),
      resolver: publicResolver,
    });

    const acquired = await client.acquire({ maxBytes: 20_000, maxRedirects: 1, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/report" });

    expect(acquired).toMatchObject({ contentType: "text/html", finalUrl: "https://research.example/allowed/report", lastModified: "2026-07-14T09:00:00.000Z", redirectChain: [] });
    expect(requests).toEqual(["https://research.example/allowed/report"]);
  });

  it("rejects redirects to another domain before performing the redirected request", async () => {
    let calls = 0;
    const client = new NodeRestrictedHttpsClient({
      request: driver(() => { calls += 1; return response(302, "redirect", { location: "https://attacker.example/collect" }); }),
      resolver: publicResolver,
    });

    await expect(client.acquire({ maxBytes: 20_000, maxRedirects: 2, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/start" })).rejects.toThrow(/domain is not authorized/iu);
    expect(calls).toBe(1);
  });

  it("rejects deceptive URLs, credentials, private DNS, unsupported MIME and excessive content", async () => {
    const okDriver = driver(() => response(200, "documento", { "content-type": "text/plain" }));
    const client = new NodeRestrictedHttpsClient({ request: okDriver, resolver: publicResolver });
    await expect(client.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example.evil/allowed/report" })).rejects.toThrow(/domain is not authorized/iu);
    await expect(client.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://user:secret@research.example/allowed/report" })).rejects.toThrow(/HTTPS-only policy/iu);
    await expect(client.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/report?access_token=secret" })).rejects.toThrow(/secret-bearing/iu);

    const privateClient = new NodeRestrictedHttpsClient({ request: okDriver, resolver: Object.freeze({ resolve() { return Promise.resolve([{ address: "127.0.0.1", family: 4 as const }]); } }) });
    await expect(privateClient.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/report" })).rejects.toThrow(/public addresses/iu);

    const mimeClient = new NodeRestrictedHttpsClient({ request: driver(() => response(200, "%PDF", { "content-type": "application/pdf" })), resolver: publicResolver });
    await expect(mimeClient.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/report" })).rejects.toThrow(/MIME type is not allowed/iu);

    const largeClient = new NodeRestrictedHttpsClient({ request: driver(() => response(200, "small", { "content-length": "50000", "content-type": "text/plain" })), resolver: publicResolver });
    await expect(largeClient.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/report" })).rejects.toThrow(/byte limit/iu);
  });

  it("accepts bounded official XML feeds", async () => {
    const client = new NodeRestrictedHttpsClient({ request: driver(() => response(200, "<rss><channel /></rss>", { "content-type": "text/xml; charset=utf-8" })), resolver: publicResolver });
    await expect(client.acquire({ maxBytes: 20_000, maxRedirects: 0, source: source(), timeoutMs: 1_000, url: "https://research.example/allowed/feed" })).resolves.toMatchObject({ contentType: "text/xml" });
  });
});

const publicResolver: RestrictedHttpsResolver = Object.freeze({ resolve() { return Promise.resolve([{ address: "93.184.216.34", family: 4 as const }]); } });

function source(): SourceRegistryEntry {
  return Object.freeze({ actorId: "actor-local", canonicalReference: "https://research.example/allowed/", category: "OFFICIAL_SITE", createdAt: "2026-07-15T08:00:00.000Z", maxFreshnessDays: 30, name: "Research Example", permittedRiskDomains: ["GENERAL"] as const, publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: true, sourceId: "research-source", status: "AUTHORIZED", version: 0, workspaceId: "workspace-local" });
}

function driver(get: (url: URL) => { readonly body: Uint8Array; readonly headers: Readonly<Record<string, string | undefined>>; readonly statusCode: number }): RestrictedHttpsRequestDriver {
  return Object.freeze({ get(input: Parameters<RestrictedHttpsRequestDriver["get"]>[0]) { return Promise.resolve(get(input.url)); } });
}

function response(statusCode: number, body: string, headers: Readonly<Record<string, string | undefined>>) {
  return Object.freeze({ body: encoder.encode(body), headers: Object.freeze(headers), statusCode });
}
