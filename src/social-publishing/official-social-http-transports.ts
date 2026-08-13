import type {
  InstagramConnectorTransport,
  InstagramIdentity,
  SocialTokenExchangeResult,
  TikTokConnectorTransport,
  TikTokCreatorInfo,
  TikTokIdentity,
} from "./official-social-connectors.js";

export class SocialProviderHttpError extends Error {
  public readonly code: "PROVIDER_HTTP_ERROR" | "PROVIDER_RESPONSE_INVALID" | "PROVIDER_TRANSPORT_ERROR";
  public readonly httpStatus?: number;
  public constructor(code: SocialProviderHttpError["code"], httpStatus?: number) {
    super("Official social provider request failed safely");
    this.code = code;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}

type FetchPort = (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response>;

export class FetchInstagramConnectorTransport implements InstagramConnectorTransport {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #fetch: FetchPort;
  public constructor(input: { readonly clientId: string; readonly clientSecret: string; readonly fetch?: FetchPort }) {
    this.#clientId = input.clientId;
    this.#clientSecret = input.clientSecret;
    this.#fetch = input.fetch ?? fetch;
  }

  public async exchangeCode(input: { readonly authorizationCode: string; readonly redirectUri: string }): Promise<SocialTokenExchangeResult> {
    const form = new URLSearchParams({ client_id: this.#clientId, client_secret: this.#clientSecret, code: input.authorizationCode, grant_type: "authorization_code", redirect_uri: input.redirectUri });
    const short = await this.#request("https://api.instagram.com/oauth/access_token", { body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" });
    const shortToken = requiredString(short.access_token);
    const accountId = identifier(short.user_id);
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", this.#clientSecret);
    longUrl.searchParams.set("access_token", shortToken);
    const long = await this.#request(longUrl, { method: "GET" });
    const accessToken = requiredString(long.access_token);
    const identity = await this.identity(accessToken);
    return {
      accessToken,
      accountId: accountId ?? identity.accountId,
      expiresAt: expiry(long.expires_in),
      grantedScopes: scopes(short.permissions),
      refreshToken: accessToken,
    };
  }

  public async identity(accessToken: string): Promise<InstagramIdentity> {
    const url = graphUrl("/me", accessToken);
    url.searchParams.set("fields", "id,user_id,username,account_type");
    const body = await this.#request(url, { method: "GET" });
    const accountType = body.account_type;
    return {
      accountId: identifier(body.id) ?? identifier(body.user_id) ?? invalid(),
      accountType: accountType === "BUSINESS" || accountType === "CREATOR" || accountType === "PERSONAL" ? accountType : "UNKNOWN",
      username: requiredString(body.username),
    };
  }

  public async insightsPreflight(input: { readonly accessToken: string; readonly accountId: string }): Promise<{ readonly available: boolean; readonly missingValuesPreserved: true }> {
    const url = graphUrl(`/${encodeURIComponent(input.accountId)}/insights`, input.accessToken);
    url.searchParams.set("metric", "views,reach");
    url.searchParams.set("period", "day");
    try {
      const body = await this.#request(url, { method: "GET" });
      return { available: Array.isArray(body.data), missingValuesPreserved: true };
    } catch (error) {
      if (error instanceof SocialProviderHttpError && (error.httpStatus === 400 || error.httpStatus === 403)) return { available: false, missingValuesPreserved: true };
      throw error;
    }
  }

  public async inspectPermissions(accessToken: string): Promise<readonly string[]> {
    const body = await this.#request(graphUrl("/me/permissions", accessToken), { method: "GET" });
    if (!Array.isArray(body.data)) return [];
    return body.data.flatMap((item): string[] => {
      const value = record(item);
      return value?.status === "granted" && typeof value.permission === "string" ? [value.permission] : [];
    });
  }

  public async refresh(refreshToken: string): Promise<SocialTokenExchangeResult> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", refreshToken);
    const body = await this.#request(url, { method: "GET" });
    const accessToken = requiredString(body.access_token);
    const identity = await this.identity(accessToken);
    const grantedScopes = await this.inspectPermissions(accessToken);
    return { accessToken, accountId: identity.accountId, expiresAt: expiry(body.expires_in), grantedScopes, refreshToken: accessToken };
  }

  public async revoke(accessToken: string): Promise<void> {
    await this.#request(graphUrl("/me/permissions", accessToken), { method: "DELETE" });
  }

  async #request(input: string | URL, init: RequestInit): Promise<Readonly<Record<string, unknown>>> {
    let response: Response;
    try { response = await this.#fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) }); }
    catch { throw new SocialProviderHttpError("PROVIDER_TRANSPORT_ERROR"); }
    let body: unknown;
    try { body = await response.json(); } catch { throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID", response.status); }
    const value = record(body);
    if (!response.ok || value === undefined || record(value.error) !== undefined) throw new SocialProviderHttpError("PROVIDER_HTTP_ERROR", response.status);
    return value;
  }
}

export class FetchTikTokConnectorTransport implements TikTokConnectorTransport {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #fetch: FetchPort;
  public constructor(input: { readonly clientId: string; readonly clientSecret: string; readonly fetch?: FetchPort }) {
    this.#clientId = input.clientId;
    this.#clientSecret = input.clientSecret;
    this.#fetch = input.fetch ?? fetch;
  }

  public async exchangeCode(input: { readonly authorizationCode: string; readonly codeVerifier: string; readonly redirectUri: string }): Promise<SocialTokenExchangeResult> {
    const body = await this.#tokenRequest(new URLSearchParams({ client_key: this.#clientId, client_secret: this.#clientSecret, code: input.authorizationCode, code_verifier: input.codeVerifier, grant_type: "authorization_code", redirect_uri: input.redirectUri }));
    return this.#token(body, true);
  }
  public async refresh(refreshToken: string): Promise<SocialTokenExchangeResult> {
    const body = await this.#tokenRequest(new URLSearchParams({ client_key: this.#clientId, client_secret: this.#clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }));
    return this.#token(body, true);
  }
  public async identity(accessToken: string): Promise<TikTokIdentity> {
    const url = new URL("https://open.tiktokapis.com/v2/user/info/");
    url.searchParams.set("fields", "open_id,display_name,username");
    const body = await this.#request(url, { headers: bearer(accessToken), method: "GET" });
    const user = record(record(body.data)?.user);
    if (user === undefined) throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID");
    return { accountId: requiredString(user.open_id), displayName: requiredString(user.display_name), ...(typeof user.username === "string" && user.username.length > 0 ? { username: user.username } : {}) };
  }
  public async creatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const body = await this.#request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { body: "{}", headers: { ...bearer(accessToken), "Content-Type": "application/json; charset=UTF-8" }, method: "POST" });
    const data = record(body.data);
    if (data === undefined || !stringArray(data.privacy_level_options)) throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID");
    return {
      commentDisabled: boolean(data.comment_disabled),
      duetDisabled: boolean(data.duet_disabled),
      maxVideoPostDurationSec: positiveInteger(data.max_video_post_duration_sec),
      privacyLevelOptions: data.privacy_level_options,
      stitchDisabled: boolean(data.stitch_disabled),
    };
  }
  public async revoke(accessToken: string): Promise<void> {
    await this.#request("https://open.tiktokapis.com/v2/oauth/revoke/", { body: new URLSearchParams({ client_key: this.#clientId, client_secret: this.#clientSecret, token: accessToken }), headers: { "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" });
  }

  async #tokenRequest(body: URLSearchParams): Promise<Readonly<Record<string, unknown>>> {
    return this.#request("https://open.tiktokapis.com/v2/oauth/token/", { body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" });
  }
  #token(body: Readonly<Record<string, unknown>>, pkceVerified: boolean): SocialTokenExchangeResult {
    const accessToken = requiredString(body.access_token);
    const refreshToken = requiredString(body.refresh_token);
    return { accessToken, accountId: requiredString(body.open_id), expiresAt: expiry(body.expires_in), grantedScopes: commaScopes(body.scope), pkceVerified, refreshToken };
  }
  async #request(input: string | URL, init: RequestInit): Promise<Readonly<Record<string, unknown>>> {
    let response: Response;
    try { response = await this.#fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) }); }
    catch { throw new SocialProviderHttpError("PROVIDER_TRANSPORT_ERROR"); }
    let body: unknown;
    try { body = await response.json(); } catch { throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID", response.status); }
    const value = record(body);
    const error = record(value?.error);
    if (!response.ok || value === undefined || (typeof error?.code === "string" && error.code !== "ok")) throw new SocialProviderHttpError("PROVIDER_HTTP_ERROR", response.status);
    return value;
  }
}

function graphUrl(path: string, accessToken: string): URL { const url = new URL(`https://graph.instagram.com${path}`); url.searchParams.set("access_token", accessToken); return url; }
function bearer(token: string): Readonly<Record<string, string>> { return { Authorization: `Bearer ${token}` }; }
function expiry(value: unknown): string { const seconds = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 3600; return new Date(Date.now() + seconds * 1000).toISOString(); }
function scopes(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : commaScopes(value); }
function commaScopes(value: unknown): readonly string[] { return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter((item) => item.length > 0) : []; }
function identifier(value: unknown): string | undefined { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function requiredString(value: unknown): string { if (typeof value !== "string" || value.length === 0) throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID"); return value; }
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID"); return value; }
function positiveInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID"); return value; }
function invalid(): never { throw new SocialProviderHttpError("PROVIDER_RESPONSE_INVALID"); }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
