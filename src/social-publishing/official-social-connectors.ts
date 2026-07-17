import { createHash } from "node:crypto";

import type {
  MediaDeliveryState,
  OAuthCredentialRecord,
  OAuthSecureStore,
} from "./oauth-connector-foundation.js";
import {
  createOAuthPendingSession,
  generateOAuthState,
  generatePkceVerifier,
  INSTAGRAM_REDIRECT_URI,
  MediaDeliveryBoundary,
  redactedIdentifier,
  TIKTOK_REDIRECT_URI,
  tiktokPkceChallenge,
} from "./oauth-connector-foundation.js";

export const INSTAGRAM_EXPECTED_USERNAME = "mr.metodo.veloce_official" as const;
export const TIKTOK_EXPECTED_USERNAME = "metodo_veloce.official" as const;
export const INSTAGRAM_REQUIRED_SCOPES = Object.freeze([
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const);
/** user.info.profile is required solely for exact username/account binding. */
export const TIKTOK_REQUIRED_SCOPES = Object.freeze([
  "user.info.basic",
  "user.info.profile",
  "video.publish",
] as const);

export type InstagramConnectionState =
  | "ACCOUNT_TYPE_ACTION_REQUIRED"
  | "APP_CONFIGURATION_REQUIRED"
  | "CONNECTED_READ_ONLY"
  | "CONTENT_PERMISSION_READY"
  | "INSIGHTS_READY"
  | "MEDIA_HOSTING_REQUIRED"
  | "NOT_CONFIGURED"
  | "OAUTH_REQUIRED"
  | "PUBLICATION_LOCKED"
  | "REAUTHORIZATION_REQUIRED"
  | "TOKEN_EXPIRED"
  | "UNCERTAIN"
  | "WRONG_ACCOUNT";
export type TikTokConnectionState =
  | "APP_CONFIGURATION_REQUIRED"
  | "AUDIT_REQUIRED"
  | "CONNECTED_READ_ONLY"
  | "CREATOR_INFO_READY"
  | "DOMAIN_VERIFICATION_REQUIRED"
  | "NOT_CONFIGURED"
  | "OAUTH_REQUIRED"
  | "PRIVATE_POST_READY"
  | "PUBLIC_POST_LOCKED"
  | "REAUTHORIZATION_REQUIRED"
  | "SCOPE_APPROVAL_REQUIRED"
  | "TOKEN_EXPIRED"
  | "UNCERTAIN"
  | "WRONG_ACCOUNT";

export interface SocialTokenExchangeResult {
  readonly accessToken: string;
  readonly accountId: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
  readonly pkceVerified?: boolean;
  readonly refreshToken?: string;
}
export interface InstagramIdentity {
  readonly accountId: string;
  readonly accountType: "BUSINESS" | "CREATOR" | "PERSONAL" | "UNKNOWN";
  readonly username: string;
}
export interface TikTokIdentity {
  readonly accountId: string;
  readonly displayName: string;
  readonly username?: string;
}
export interface TikTokCreatorInfo {
  readonly commentDisabled: boolean;
  readonly duetDisabled: boolean;
  readonly maxVideoPostDurationSec: number;
  readonly privacyLevelOptions: readonly string[];
  readonly stitchDisabled: boolean;
}

export interface InstagramConnectorTransport {
  exchangeCode(input: { readonly authorizationCode: string; readonly redirectUri: string }): Promise<SocialTokenExchangeResult>;
  identity(accessToken: string): Promise<InstagramIdentity>;
  insightsPreflight(input: { readonly accessToken: string; readonly accountId: string }): Promise<{ readonly available: boolean; readonly missingValuesPreserved: true }>;
  inspectPermissions(accessToken: string): Promise<readonly string[]>;
  refresh(refreshToken: string): Promise<SocialTokenExchangeResult>;
  revoke(accessToken: string): Promise<void>;
}
export interface TikTokConnectorTransport {
  creatorInfo(accessToken: string): Promise<TikTokCreatorInfo>;
  exchangeCode(input: { readonly authorizationCode: string; readonly codeVerifier: string; readonly redirectUri: string }): Promise<SocialTokenExchangeResult>;
  identity(accessToken: string): Promise<TikTokIdentity>;
  refresh(refreshToken: string): Promise<SocialTokenExchangeResult>;
  revoke(accessToken: string): Promise<void>;
}

export interface SocialConnectorReceipt {
  readonly accountIdRedacted?: string;
  readonly externalPublicationOccurred: false;
  readonly operation: "CONNECT" | "DISCONNECT" | "VERIFY";
  readonly platform: "instagram" | "tiktok";
  readonly receiptFingerprint: string;
  readonly status: "BLOCKED" | "SUCCEEDED" | "UNCERTAIN";
}

export interface InstagramConnectorStatus {
  readonly accountIdRedacted?: string;
  readonly accountType?: InstagramIdentity["accountType"];
  readonly contentPermission: "CONTENT_PERMISSION_READY" | "SCOPE_APPROVAL_REQUIRED";
  readonly expectedAccount: "@mr.metodo.veloce_official";
  readonly grantedScopes: readonly string[];
  readonly insights: "INSIGHTS_READY" | "INSIGHTS_UNAVAILABLE" | "NOT_CHECKED";
  readonly mediaHosting: MediaDeliveryState;
  readonly publication: "LOCKED";
  readonly receipt: SocialConnectorReceipt;
  readonly state: InstagramConnectionState;
  readonly tokenExpiresAt?: string;
  readonly username?: string;
}
export interface TikTokConnectorStatus {
  readonly accountIdRedacted?: string;
  readonly audit: "AUDIT_REQUIRED";
  readonly creatorInfo?: TikTokCreatorInfo;
  readonly domainVerification: MediaDeliveryState;
  readonly expectedAccount: "@metodo_veloce.official";
  readonly grantedScopes: readonly string[];
  readonly privacyRestriction: "UNAUDITED_PRIVATE_ONLY";
  readonly publication: "LOCKED";
  readonly receipt: SocialConnectorReceipt;
  readonly state: TikTokConnectionState;
  readonly tokenExpiresAt?: string;
  readonly username?: string;
}

interface ConnectorDependencies<Transport> {
  readonly clientId: string;
  readonly clock?: { now(): Date };
  readonly randomId?: () => string;
  readonly store: OAuthSecureStore;
  readonly transport: Transport;
}

export class OfficialInstagramConnector {
  readonly #clientId: string;
  readonly #clock: { now(): Date };
  readonly #randomId: () => string;
  readonly #store: OAuthSecureStore;
  readonly #transport: InstagramConnectorTransport;
  public constructor(input: ConnectorDependencies<InstagramConnectorTransport>) {
    this.#clientId = input.clientId;
    this.#clock = input.clock ?? { now: () => new Date() };
    this.#randomId = input.randomId ?? generateOAuthState;
    this.#store = input.store;
    this.#transport = input.transport;
  }

  public async authorizationUrl(): Promise<string> {
    if ((await this.#store.loadPending("instagram")) !== undefined) throw new Error("DUPLICATE_CONNECT_BLOCKED");
    const state = this.#randomId();
    await this.#store.savePending("instagram", createOAuthPendingSession({
      authorizationRequestId: this.#randomId(),
      now: this.#clock.now(),
      redirectUri: INSTAGRAM_REDIRECT_URI,
      state,
    }));
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", this.#clientId);
    url.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", INSTAGRAM_REQUIRED_SCOPES.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    return url.toString();
  }

  public async callback(input: { readonly authorizationCode: string; readonly callbackUrl: string; readonly state: string }): Promise<InstagramConnectorStatus> {
    assertCallbackUrl(input.callbackUrl, INSTAGRAM_REDIRECT_URI);
    const pending = await this.#store.consumePending({ authorizationCode: input.authorizationCode, now: this.#clock.now(), platform: "instagram", state: input.state });
    let token: SocialTokenExchangeResult;
    try { token = await this.#transport.exchangeCode({ authorizationCode: input.authorizationCode, redirectUri: pending.redirectUri }); }
    catch { return this.#instagramUncertain(); }
    const credential: OAuthCredentialRecord = {
      accessToken: token.accessToken,
      accountId: token.accountId,
      expiresAt: token.expiresAt,
      grantedScopes: token.grantedScopes,
      ...(token.refreshToken === undefined ? {} : { refreshToken: token.refreshToken }),
    };
    await this.#store.saveCredential("instagram", credential);
    return this.#verifyCredential(credential, "CONNECT");
  }

  public async verify(): Promise<InstagramConnectorStatus> {
    const credential = await this.#store.loadCredential("instagram");
    if (credential === undefined) return instagramDisconnected("OAUTH_REQUIRED");
    const current = await this.#refreshIfNeeded(credential);
    if (current === undefined) return instagramDisconnected("REAUTHORIZATION_REQUIRED");
    try { return await this.#verifyCredential(current, "VERIFY"); }
    catch { return instagramDisconnected("REAUTHORIZATION_REQUIRED"); }
  }

  public async disconnect(): Promise<InstagramConnectorStatus> {
    const credential = await this.#store.loadCredential("instagram");
    if (credential !== undefined) await this.#transport.revoke(credential.accessToken);
    await this.#store.deleteCredential("instagram");
    return instagramDisconnected("OAUTH_REQUIRED", socialReceipt("instagram", "DISCONNECT", "SUCCEEDED"));
  }

  public publicationContainerDryRun(): { readonly externalCalls: 0; readonly state: "PUBLICATION_LOCKED" } {
    return { externalCalls: 0, state: "PUBLICATION_LOCKED" };
  }

  async #refreshIfNeeded(credential: OAuthCredentialRecord): Promise<OAuthCredentialRecord | undefined> {
    if (Date.parse(credential.expiresAt) > this.#clock.now().getTime() + 60_000) return credential;
    if (credential.refreshToken === undefined) return undefined;
    try {
      const refreshed = await this.#transport.refresh(credential.refreshToken);
      const value: OAuthCredentialRecord = { accessToken: refreshed.accessToken, accountId: refreshed.accountId, expiresAt: refreshed.expiresAt, grantedScopes: refreshed.grantedScopes, ...(refreshed.refreshToken === undefined ? { refreshToken: credential.refreshToken } : { refreshToken: refreshed.refreshToken }) };
      await this.#store.saveCredential("instagram", value);
      return value;
    } catch { return undefined; }
  }

  async #verifyCredential(credential: OAuthCredentialRecord, operation: SocialConnectorReceipt["operation"]): Promise<InstagramConnectorStatus> {
    const identity = await this.#transport.identity(credential.accessToken);
    if (normalizeUsername(identity.username) !== INSTAGRAM_EXPECTED_USERNAME) {
      await this.#transport.revoke(credential.accessToken);
      await this.#store.deleteCredential("instagram");
      return instagramDisconnected("WRONG_ACCOUNT", socialReceipt("instagram", operation, "BLOCKED", identity.accountId));
    }
    if (identity.accountType === "PERSONAL" || identity.accountType === "UNKNOWN") {
      await this.#transport.revoke(credential.accessToken);
      await this.#store.deleteCredential("instagram");
      return {
        ...instagramDisconnected("ACCOUNT_TYPE_ACTION_REQUIRED", socialReceipt("instagram", operation, "BLOCKED", identity.accountId)),
        accountType: identity.accountType,
        username: `@${identity.username}`,
      };
    }
    const inspected = unique(await this.#transport.inspectPermissions(credential.accessToken));
    const grantedScopes = unique([...credential.grantedScopes, ...inspected]);
    const missing = INSTAGRAM_REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    const insights = await this.#transport.insightsPreflight({ accessToken: credential.accessToken, accountId: identity.accountId });
    const state: InstagramConnectionState = insights.available ? "INSIGHTS_READY" : "CONNECTED_READ_ONLY";
    return {
      accountIdRedacted: redactedIdentifier(identity.accountId),
      accountType: identity.accountType,
      contentPermission: missing.length === 0 ? "CONTENT_PERMISSION_READY" : "SCOPE_APPROVAL_REQUIRED",
      expectedAccount: "@mr.metodo.veloce_official",
      grantedScopes,
      insights: insights.available ? "INSIGHTS_READY" : "INSIGHTS_UNAVAILABLE",
      mediaHosting: new MediaDeliveryBoundary().evaluate({ localPath: "review-package-local", now: this.#clock.now() }).state,
      publication: "LOCKED",
      receipt: socialReceipt("instagram", operation, "SUCCEEDED", identity.accountId),
      state,
      tokenExpiresAt: credential.expiresAt,
      username: `@${identity.username}`,
    };
  }

  #instagramUncertain(): InstagramConnectorStatus {
    return instagramDisconnected("UNCERTAIN", socialReceipt("instagram", "CONNECT", "UNCERTAIN"));
  }
}

export class OfficialTikTokConnector {
  readonly #clientId: string;
  readonly #clock: { now(): Date };
  readonly #randomId: () => string;
  readonly #store: OAuthSecureStore;
  readonly #transport: TikTokConnectorTransport;
  public constructor(input: ConnectorDependencies<TikTokConnectorTransport>) {
    this.#clientId = input.clientId;
    this.#clock = input.clock ?? { now: () => new Date() };
    this.#randomId = input.randomId ?? generateOAuthState;
    this.#store = input.store;
    this.#transport = input.transport;
  }

  public async authorizationUrl(): Promise<string> {
    if ((await this.#store.loadPending("tiktok")) !== undefined) throw new Error("DUPLICATE_CONNECT_BLOCKED");
    const state = this.#randomId();
    const verifier = generatePkceVerifier();
    await this.#store.savePending("tiktok", createOAuthPendingSession({ authorizationRequestId: this.#randomId(), codeVerifier: verifier, now: this.#clock.now(), redirectUri: TIKTOK_REDIRECT_URI, state }));
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", this.#clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", TIKTOK_REQUIRED_SCOPES.join(","));
    url.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", tiktokPkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  public async callback(input: { readonly authorizationCode: string; readonly callbackUrl: string; readonly state: string }): Promise<TikTokConnectorStatus> {
    assertCallbackUrl(input.callbackUrl, TIKTOK_REDIRECT_URI);
    const pending = await this.#store.consumePending({ authorizationCode: input.authorizationCode, now: this.#clock.now(), platform: "tiktok", state: input.state });
    if (pending.codeVerifier === undefined) return tiktokDisconnected("REAUTHORIZATION_REQUIRED");
    let token: SocialTokenExchangeResult;
    try { token = await this.#transport.exchangeCode({ authorizationCode: input.authorizationCode, codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri }); }
    catch { return tiktokDisconnected("UNCERTAIN", socialReceipt("tiktok", "CONNECT", "UNCERTAIN")); }
    if (token.pkceVerified !== true) return tiktokDisconnected("REAUTHORIZATION_REQUIRED", socialReceipt("tiktok", "CONNECT", "BLOCKED"));
    const credential: OAuthCredentialRecord = { accessToken: token.accessToken, accountId: token.accountId, expiresAt: token.expiresAt, grantedScopes: token.grantedScopes, ...(token.refreshToken === undefined ? {} : { refreshToken: token.refreshToken }) };
    await this.#store.saveCredential("tiktok", credential);
    return this.#verifyCredential(credential, "CONNECT");
  }

  public async verify(): Promise<TikTokConnectorStatus> {
    const credential = await this.#store.loadCredential("tiktok");
    if (credential === undefined) return tiktokDisconnected("OAUTH_REQUIRED");
    const current = await this.#refreshIfNeeded(credential);
    if (current === undefined) return tiktokDisconnected("REAUTHORIZATION_REQUIRED");
    try { return await this.#verifyCredential(current, "VERIFY"); }
    catch { return tiktokDisconnected("REAUTHORIZATION_REQUIRED"); }
  }

  public async disconnect(): Promise<TikTokConnectorStatus> {
    const credential = await this.#store.loadCredential("tiktok");
    if (credential !== undefined) await this.#transport.revoke(credential.accessToken);
    await this.#store.deleteCredential("tiktok");
    return tiktokDisconnected("OAUTH_REQUIRED", socialReceipt("tiktok", "DISCONNECT", "SUCCEEDED"));
  }

  public directPostDryRun(): { readonly externalCalls: 0; readonly state: "PUBLIC_POST_LOCKED" } { return { externalCalls: 0, state: "PUBLIC_POST_LOCKED" }; }
  public photoPostDryRun(): { readonly externalCalls: 0; readonly state: "PUBLIC_POST_LOCKED" } { return { externalCalls: 0, state: "PUBLIC_POST_LOCKED" }; }

  async #refreshIfNeeded(credential: OAuthCredentialRecord): Promise<OAuthCredentialRecord | undefined> {
    if (Date.parse(credential.expiresAt) > this.#clock.now().getTime() + 60_000) return credential;
    if (credential.refreshToken === undefined) return undefined;
    try {
      const refreshed = await this.#transport.refresh(credential.refreshToken);
      const value: OAuthCredentialRecord = { accessToken: refreshed.accessToken, accountId: refreshed.accountId, expiresAt: refreshed.expiresAt, grantedScopes: refreshed.grantedScopes, ...(refreshed.refreshToken === undefined ? { refreshToken: credential.refreshToken } : { refreshToken: refreshed.refreshToken }) };
      await this.#store.saveCredential("tiktok", value);
      return value;
    } catch { return undefined; }
  }

  async #verifyCredential(credential: OAuthCredentialRecord, operation: SocialConnectorReceipt["operation"]): Promise<TikTokConnectorStatus> {
    const identity = await this.#transport.identity(credential.accessToken);
    if (identity.username === undefined || normalizeUsername(identity.username) !== TIKTOK_EXPECTED_USERNAME) {
      await this.#transport.revoke(credential.accessToken);
      await this.#store.deleteCredential("tiktok");
      return tiktokDisconnected("WRONG_ACCOUNT", socialReceipt("tiktok", operation, "BLOCKED", identity.accountId));
    }
    const missing = TIKTOK_REQUIRED_SCOPES.filter((scope) => !credential.grantedScopes.includes(scope));
    if (missing.length > 0) {
      return {
        ...tiktokDisconnected("SCOPE_APPROVAL_REQUIRED", socialReceipt("tiktok", operation, "BLOCKED", identity.accountId)),
        accountIdRedacted: redactedIdentifier(identity.accountId),
        grantedScopes: credential.grantedScopes,
        tokenExpiresAt: credential.expiresAt,
        username: `@${identity.username}`,
      };
    }
    const creatorInfo = await this.#transport.creatorInfo(credential.accessToken);
    return {
      accountIdRedacted: redactedIdentifier(identity.accountId),
      audit: "AUDIT_REQUIRED",
      creatorInfo,
      domainVerification: new MediaDeliveryBoundary().evaluate({ localPath: "review-package-local", now: this.#clock.now() }).state,
      expectedAccount: "@metodo_veloce.official",
      grantedScopes: credential.grantedScopes,
      privacyRestriction: "UNAUDITED_PRIVATE_ONLY",
      publication: "LOCKED",
      receipt: socialReceipt("tiktok", operation, "SUCCEEDED", identity.accountId),
      state: "CREATOR_INFO_READY",
      tokenExpiresAt: credential.expiresAt,
      username: `@${identity.username}`,
    };
  }
}

function instagramDisconnected(state: InstagramConnectionState, receipt = socialReceipt("instagram", "VERIFY", "BLOCKED")): InstagramConnectorStatus {
  return { contentPermission: "SCOPE_APPROVAL_REQUIRED", expectedAccount: "@mr.metodo.veloce_official", grantedScopes: [], insights: "NOT_CHECKED", mediaHosting: "LOCAL_ONLY", publication: "LOCKED", receipt, state };
}
function tiktokDisconnected(state: TikTokConnectionState, receipt = socialReceipt("tiktok", "VERIFY", "BLOCKED")): TikTokConnectorStatus {
  return { audit: "AUDIT_REQUIRED", domainVerification: "LOCAL_ONLY", expectedAccount: "@metodo_veloce.official", grantedScopes: [], privacyRestriction: "UNAUDITED_PRIVATE_ONLY", publication: "LOCKED", receipt, state };
}
function socialReceipt(platform: "instagram" | "tiktok", operation: SocialConnectorReceipt["operation"], status: SocialConnectorReceipt["status"], accountId?: string): SocialConnectorReceipt {
  const material = `${platform}:${operation}:${status}:${accountId ?? "none"}`;
  return { ...(accountId === undefined ? {} : { accountIdRedacted: redactedIdentifier(accountId) }), externalPublicationOccurred: false, operation, platform, receiptFingerprint: createHash("sha256").update(material).digest("hex"), status };
}
function assertCallbackUrl(value: string, expected: string): void {
  const url = new URL(value);
  const actual = `${url.origin}${url.pathname}`;
  if (actual !== expected) throw new Error("WRONG_REDIRECT_URI");
}
function normalizeUsername(value: string): string { return value.replace(/^@/u, "").trim().toLowerCase(); }
function unique(values: readonly string[]): readonly string[] { return Object.freeze([...new Set(values)].sort()); }
