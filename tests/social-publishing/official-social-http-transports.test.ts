import { describe, expect, it } from "vitest";

import {
  FetchInstagramConnectorTransport,
  FetchTikTokConnectorTransport,
} from "../../src/index.js";

describe("official social HTTP transports", () => {
  it("uses current Instagram Login endpoints and returns no raw provider body on failure", async () => {
    const calls: string[] = [];
    const fetch = (input: string | URL | Request): Promise<Response> => {
      calls.push(requestUrl(input));
      if (calls.length === 1) return Promise.resolve(json({ access_token: "short-secret", permissions: ["instagram_business_basic"], user_id: "123" }));
      if (calls.length === 2) return Promise.resolve(json({ access_token: "long-secret", expires_in: 5_184_000 }));
      return Promise.resolve(json({ account_type: "BUSINESS", id: "123", username: "mr.metodo.veloce_official" }));
    };
    const transport = new FetchInstagramConnectorTransport({ clientId: "client-id", clientSecret: "client-secret", fetch });
    const token = await transport.exchangeCode({ authorizationCode: "one-shot-code", redirectUri: "http://127.0.0.1:43123/oauth/instagram/callback" });
    expect(calls[0]).toBe("https://api.instagram.com/oauth/access_token");
    expect(calls[1]).toContain("https://graph.instagram.com/access_token");
    expect(token.grantedScopes).toEqual(["instagram_business_basic"]);
    expect(JSON.stringify(token)).toContain("long-secret");

    const failing = new FetchInstagramConnectorTransport({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: () => Promise.resolve(json({ error: { message: "raw client-secret should not escape" } }, 401)),
    });
    await expect(failing.identity("access-secret")).rejects.not.toThrow("raw client-secret");
  });

  it("uses TikTok OAuth v2, user info, creator info, refresh and revoke endpoints", async () => {
    const calls: { readonly body?: RequestInit["body"]; readonly url: string }[] = [];
    const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = requestUrl(input);
      calls.push({ body: init?.body, url });
      if (url.endsWith("/v2/oauth/token/")) return Promise.resolve(json({ access_token: "access-secret", expires_in: 86_400, open_id: "open-1", refresh_token: "refresh-secret", scope: "user.info.basic,user.info.profile,video.publish" }));
      if (url.includes("/v2/user/info/")) return Promise.resolve(json({ data: { user: { display_name: "Metodo Veloce", open_id: "open-1", username: "metodo_veloce.official" } }, error: { code: "ok" } }));
      if (url.includes("creator_info")) return Promise.resolve(json({ data: { comment_disabled: false, duet_disabled: true, max_video_post_duration_sec: 60, privacy_level_options: ["SELF_ONLY"], stitch_disabled: true }, error: { code: "ok" } }));
      return Promise.resolve(json({ data: {}, error: { code: "ok" } }));
    };
    const transport = new FetchTikTokConnectorTransport({ clientId: "client-key", clientSecret: "client-secret", fetch });
    const token = await transport.exchangeCode({ authorizationCode: "code", codeVerifier: "verifier", redirectUri: "http://127.0.0.1:43123/oauth/tiktok/callback/" });
    expect(token.pkceVerified).toBe(true);
    expect(await transport.identity(token.accessToken)).toMatchObject({ username: "metodo_veloce.official" });
    expect((await transport.creatorInfo(token.accessToken)).privacyLevelOptions).toEqual(["SELF_ONLY"]);
    await transport.refresh("refresh-secret");
    await transport.revoke("access-secret");
    expect(calls.map(({ url }) => url)).toEqual(expect.arrayContaining([
      "https://open.tiktokapis.com/v2/oauth/token/",
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      "https://open.tiktokapis.com/v2/oauth/revoke/",
    ]));
    const firstBody = calls[0]?.body;
    expect(firstBody instanceof URLSearchParams ? firstBody.toString() : "").toContain("code_verifier=verifier");
  });
});

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" }, status });
}
