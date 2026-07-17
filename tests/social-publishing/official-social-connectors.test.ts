import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  InstagramConnectorTransport,
  SocialTokenExchangeResult,
  TikTokConnectorTransport,
  TikTokCreatorInfo,
} from "../../src/index.js";
import {
  EncryptedFileOAuthSecureStore,
  InMemoryOAuthSecureStore,
  INSTAGRAM_REDIRECT_URI,
  instagramContainerDryRun,
  MediaDeliveryBoundary,
  OAuthSecurityError,
  OfficialInstagramConnector,
  OfficialTikTokConnector,
  SocialExternalActionPlane,
  TIKTOK_REDIRECT_URI,
  tiktokDirectPostDryRun,
  tiktokPhotoPostDryRun,
} from "../../src/index.js";

const NOW = new Date("2026-07-17T14:00:00.000Z");
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const operation of cleanup.splice(0)) await operation(); });

describe("official Instagram connector", () => {
  it("blocks OAuth state mismatch, callback replay and authorization-code replay", async () => {
    const store = new InMemoryOAuthSecureStore();
    const connector = instagram(store);
    const first = new URL(await connector.authorizationUrl());
    const firstState = required(first.searchParams.get("state"));
    await expect(connector.callback({ authorizationCode: "code-a", callbackUrl: `${INSTAGRAM_REDIRECT_URI}?code=code-a`, state: "wrong" })).rejects.toMatchObject({ code: "OAUTH_STATE_MISMATCH" });
    await connector.callback({ authorizationCode: "code-a", callbackUrl: `${INSTAGRAM_REDIRECT_URI}?code=code-a`, state: firstState });
    await expect(connector.callback({ authorizationCode: "code-b", callbackUrl: `${INSTAGRAM_REDIRECT_URI}?code=code-b`, state: firstState })).rejects.toMatchObject({ code: "CALLBACK_REPLAY" });
    const second = new URL(await connector.authorizationUrl());
    await expect(connector.callback({ authorizationCode: "code-a", callbackUrl: `${INSTAGRAM_REDIRECT_URI}?code=code-a`, state: required(second.searchParams.get("state")) })).rejects.toMatchObject({ code: "AUTHORIZATION_CODE_REPLAY" });
  });

  it("blocks a wrong redirect URI before exchanging a code", async () => {
    const transport = new FakeInstagramTransport();
    const connector = instagram(new InMemoryOAuthSecureStore(), transport);
    const url = new URL(await connector.authorizationUrl());
    await expect(connector.callback({ authorizationCode: "code", callbackUrl: "http://127.0.0.1:43123/wrong", state: required(url.searchParams.get("state")) })).rejects.toThrow("WRONG_REDIRECT_URI");
    expect(transport.exchangeCalls).toBe(0);
  });

  it("revokes a wrong account and a personal account without binding either", async () => {
    const wrongTransport = new FakeInstagramTransport({ username: "different.account" });
    const wrong = await connectInstagram(wrongTransport);
    expect(wrong.status.state).toBe("WRONG_ACCOUNT");
    expect(wrongTransport.revokeCalls).toBe(1);
    expect(await wrong.store.loadCredential("instagram")).toBeUndefined();

    const personalTransport = new FakeInstagramTransport({ accountType: "PERSONAL" });
    const personal = await connectInstagram(personalTransport);
    expect(personal.status.state).toBe("ACCOUNT_TYPE_ACTION_REQUIRED");
    expect(personalTransport.revokeCalls).toBe(1);
  });

  it("preserves denied or missing scopes and never invents Insights values", async () => {
    const transport = new FakeInstagramTransport({ grantedScopes: ["instagram_business_basic"], insights: false });
    const { status } = await connectInstagram(transport);
    expect(status).toMatchObject({ contentPermission: "SCOPE_APPROVAL_REQUIRED", insights: "INSIGHTS_UNAVAILABLE", state: "CONNECTED_READ_ONLY" });
    expect(status.grantedScopes).toEqual(["instagram_business_basic"]);
  });

  it("refreshes an expired token, blocks refresh failure and treats revoked tokens as reauthorization", async () => {
    const store = new InMemoryOAuthSecureStore();
    await store.saveCredential("instagram", expiredCredential());
    const successTransport = new FakeInstagramTransport();
    const refreshed = await instagram(store, successTransport).verify();
    expect(refreshed.state).toBe("INSIGHTS_READY");
    expect(successTransport.refreshCalls).toBe(1);

    const failedStore = new InMemoryOAuthSecureStore();
    await failedStore.saveCredential("instagram", expiredCredential());
    expect((await instagram(failedStore, new FakeInstagramTransport({ refreshFailure: true })).verify()).state).toBe("REAUTHORIZATION_REQUIRED");

    const revokedStore = new InMemoryOAuthSecureStore();
    await revokedStore.saveCredential("instagram", futureCredential());
    expect((await instagram(revokedStore, new FakeInstagramTransport({ identityFailure: true })).verify()).state).toBe("REAUTHORIZATION_REQUIRED");
  });

  it("records UNCERTAIN after a consumed callback with an unknown exchange outcome", async () => {
    const transport = new FakeInstagramTransport({ exchangeFailure: true });
    const { status } = await connectInstagram(transport);
    expect(status.state).toBe("UNCERTAIN");
    expect(status.receipt.status).toBe("UNCERTAIN");
    expect(transport.exchangeCalls).toBe(1);
  });

  it("disconnects with revocation and keeps every publication path locked", async () => {
    const transport = new FakeInstagramTransport();
    const { connector } = await connectInstagram(transport);
    expect((await connector.disconnect()).state).toBe("OAUTH_REQUIRED");
    expect(transport.revokeCalls).toBe(1);
    expect(connector.publicationContainerDryRun()).toEqual({ externalCalls: 0, state: "PUBLICATION_LOCKED" });
    expect(instagramContainerDryRun({ contentApproved: true, hasHttpsMediaUrl: true })).toEqual({ externalCalls: 0, state: "PUBLICATION_LOCKED" });
  });
});

describe("official TikTok connector", () => {
  it("builds Desktop OAuth v2 with hex S256 PKCE and blocks a PKCE mismatch", async () => {
    const store = new InMemoryOAuthSecureStore();
    const transport = new FakeTikTokTransport({ pkceVerified: false });
    const connector = tiktok(store, transport);
    const url = new URL(await connector.authorizationUrl());
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[a-f0-9]{64}$/u);
    const status = await connector.callback({ authorizationCode: "tt-code", callbackUrl: `${TIKTOK_REDIRECT_URI}?code=tt-code`, state: required(url.searchParams.get("state")) });
    expect(status.state).toBe("REAUTHORIZATION_REQUIRED");
  });

  it("revokes a wrong account immediately", async () => {
    const transport = new FakeTikTokTransport({ username: "wrong.account" });
    const result = await connectTikTok(transport);
    expect(result.status.state).toBe("WRONG_ACCOUNT");
    expect(transport.revokeCalls).toBe(1);
    expect(await result.store.loadCredential("tiktok")).toBeUndefined();
  });

  it("requires the exact minimal posting and username-binding scopes", async () => {
    const transport = new FakeTikTokTransport({ grantedScopes: ["user.info.basic"] });
    const { status } = await connectTikTok(transport);
    expect(status.state).toBe("SCOPE_APPROVAL_REQUIRED");
    expect(status.grantedScopes).toEqual(["user.info.basic"]);
  });

  it("records creator info but keeps unaudited and domain-limited posting locked", async () => {
    const { status } = await connectTikTok(new FakeTikTokTransport());
    expect(status).toMatchObject({ audit: "AUDIT_REQUIRED", domainVerification: "LOCAL_ONLY", privacyRestriction: "UNAUDITED_PRIVATE_ONLY", publication: "LOCKED", state: "CREATOR_INFO_READY" });
    expect(status.creatorInfo?.privacyLevelOptions).toEqual(["SELF_ONLY"]);
  });

  it("does not post video or photo after OAuth or after content approval", async () => {
    const transport = new FakeTikTokTransport();
    const { connector } = await connectTikTok(transport);
    expect(connector.directPostDryRun()).toEqual({ externalCalls: 0, state: "PUBLIC_POST_LOCKED" });
    expect(connector.photoPostDryRun()).toEqual({ externalCalls: 0, state: "PUBLIC_POST_LOCKED" });
    expect(tiktokDirectPostDryRun({ audited: true, contentApproved: true, creatorInfoAvailable: true, domainVerified: true })).toEqual({ externalCalls: 0, state: "PUBLIC_POST_LOCKED" });
    expect(tiktokPhotoPostDryRun({ audited: true, contentApproved: true, creatorInfoAvailable: true, domainVerified: true })).toEqual({ externalCalls: 0, state: "PUBLIC_POST_LOCKED" });
    expect(transport.postCalls).toBe(0);
  });
});

describe("common OAuth, media and External Action Plane controls", () => {
  it("blocks duplicate connect and raw-token leakage", async () => {
    const connector = instagram(new InMemoryOAuthSecureStore());
    await connector.authorizationUrl();
    await expect(connector.authorizationUrl()).rejects.toThrow("DUPLICATE_CONNECT_BLOCKED");
    const result = await connectInstagram(new FakeInstagramTransport());
    expect(JSON.stringify(result.status)).not.toContain("raw-access-token");
    expect(JSON.stringify(result.status)).not.toContain("raw-refresh-token");
  });

  it("encrypts OAuth state, enforces 0600 and recovers after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-social-vault-"));
    cleanup.push(async () => rm(directory, { force: true, recursive: true }));
    const path = join(directory, "secure", "oauth.json");
    const first = encryptedStore(path);
    await first.saveCredential("instagram", futureCredential());
    const disk = await readFile(path, "utf8");
    expect(disk).not.toContain("raw-access-token");
    await expect((await import("node:fs/promises")).stat(path).then((details) => details.mode & 0o777)).resolves.toBe(0o600);
    const restarted = encryptedStore(path);
    expect((await restarted.loadCredential("instagram"))?.accountId).toBe("account-123");
    await chmod(path, 0o644);
    await expect(restarted.loadCredential("instagram")).rejects.toBeInstanceOf(OAuthSecurityError);
  });

  it("reports local-only, no URL, insecure URL, unverified domain, expiry and readiness", () => {
    const boundary = new MediaDeliveryBoundary();
    expect(boundary.evaluate({ localPath: "asset.png", now: NOW }).state).toBe("LOCAL_ONLY");
    expect(boundary.evaluate({ now: NOW }).state).toBe("HTTPS_STORAGE_REQUIRED");
    expect(boundary.evaluate({ now: NOW, signedUrl: "http://example.test/asset.png" }).state).toBe("HTTPS_STORAGE_REQUIRED");
    expect(boundary.evaluate({ expiresAt: "2026-07-17T15:00:00.000Z", now: NOW, signedUrl: "https://example.test/asset.png" }).state).toBe("DOMAIN_VERIFICATION_REQUIRED");
    expect(boundary.evaluate({ domainVerified: true, expiresAt: "2026-07-17T13:00:00.000Z", now: NOW, signedUrl: "https://example.test/asset.png" }).state).toBe("EXPIRED");
    expect(boundary.evaluate({ domainVerified: true, expiresAt: "2026-07-17T15:00:00.000Z", now: NOW, signedUrl: "https://example.test/asset.png" }).state).toBe("READY");
  });

  it("permits only connection/read/revoke operations and denies all publication classes", () => {
    const plane = new SocialExternalActionPlane();
    expect(plane.authorize({ operation: "IDENTITY_READ", operationId: "identity-1" })).toMatchObject({ publication: "LOCKED", status: "AUTHORIZED" });
    for (const operation of ["PUBLIC_POST", "PRIVATE_POST", "DRAFT_UPLOAD", "SCHEDULE", "MESSAGE", "COMMENT"] as const) {
      expect(plane.denyPublication(operation)).toMatchObject({ reasonCode: "PUBLICATION_LOCKED", status: "DENIED" });
    }
    expect(() => plane.authorize({ operation: "IDENTITY_READ", operationId: "identity-1" })).toThrow("DUPLICATE_EXTERNAL_ACTION");
  });
});

interface FakeInstagramOptions { accountType?: "BUSINESS" | "CREATOR" | "PERSONAL" | "UNKNOWN"; exchangeFailure?: boolean; grantedScopes?: readonly string[]; identityFailure?: boolean; insights?: boolean; refreshFailure?: boolean; username?: string }

class FakeInstagramTransport implements InstagramConnectorTransport {
  public exchangeCalls = 0;
  public refreshCalls = 0;
  public revokeCalls = 0;
  readonly #options: FakeInstagramOptions;
  public constructor(options: FakeInstagramOptions = {}) { this.#options = options; }
  public exchangeCode(): Promise<SocialTokenExchangeResult> {
    this.exchangeCalls += 1;
    if (this.#options.exchangeFailure === true) return Promise.reject(new Error("uncertain"));
    return Promise.resolve(token(this.#options.grantedScopes));
  }
  public identity() {
    if (this.#options.identityFailure === true) return Promise.reject(new Error("revoked"));
    return Promise.resolve({ accountId: "account-123", accountType: this.#options.accountType ?? "BUSINESS", username: this.#options.username ?? "mr.metodo.veloce_official" });
  }
  public insightsPreflight() { return Promise.resolve({ available: this.#options.insights ?? true, missingValuesPreserved: true as const }); }
  public inspectPermissions() { return Promise.resolve(this.#options.grantedScopes ?? ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]); }
  public refresh(): Promise<SocialTokenExchangeResult> { this.refreshCalls += 1; return this.#options.refreshFailure === true ? Promise.reject(new Error("refresh")) : Promise.resolve(token()); }
  public revoke(): Promise<void> { this.revokeCalls += 1; return Promise.resolve(); }
}

interface FakeTikTokOptions { grantedScopes?: readonly string[]; pkceVerified?: boolean; username?: string }

class FakeTikTokTransport implements TikTokConnectorTransport {
  public postCalls = 0;
  public revokeCalls = 0;
  readonly #options: FakeTikTokOptions;
  public constructor(options: FakeTikTokOptions = {}) { this.#options = options; }
  public creatorInfo(): Promise<TikTokCreatorInfo> { return Promise.resolve({ commentDisabled: false, duetDisabled: true, maxVideoPostDurationSec: 60, privacyLevelOptions: ["SELF_ONLY"], stitchDisabled: true }); }
  public exchangeCode(): Promise<SocialTokenExchangeResult> { return Promise.resolve({ ...token(this.#options.grantedScopes ?? ["user.info.basic", "user.info.profile", "video.publish"]), pkceVerified: this.#options.pkceVerified ?? true }); }
  public identity() { return Promise.resolve({ accountId: "tt-account-123", displayName: "Metodo Veloce", username: this.#options.username ?? "metodo_veloce.official" }); }
  public refresh(): Promise<SocialTokenExchangeResult> { return Promise.resolve({ ...token(["user.info.basic", "user.info.profile", "video.publish"]), pkceVerified: true }); }
  public revoke(): Promise<void> { this.revokeCalls += 1; return Promise.resolve(); }
}

function instagram(store: InMemoryOAuthSecureStore, transport = new FakeInstagramTransport()) {
  let counter = 0;
  return new OfficialInstagramConnector({ clientId: "client-id", clock: { now: () => NOW }, randomId: () => `random-${String(counter += 1).padStart(2, "0")}-abcdefghijklmnopqrstuvwxyz123456`, store, transport });
}
function tiktok(store: InMemoryOAuthSecureStore, transport = new FakeTikTokTransport()) {
  let counter = 0;
  return new OfficialTikTokConnector({ clientId: "client-key", clock: { now: () => NOW }, randomId: () => `random-${String(counter += 1).padStart(2, "0")}-abcdefghijklmnopqrstuvwxyz123456`, store, transport });
}
async function connectInstagram(transport: FakeInstagramTransport) {
  const store = new InMemoryOAuthSecureStore();
  const connector = instagram(store, transport);
  const url = new URL(await connector.authorizationUrl());
  const status = await connector.callback({ authorizationCode: "ig-code", callbackUrl: `${INSTAGRAM_REDIRECT_URI}?code=ig-code`, state: required(url.searchParams.get("state")) });
  return { connector, status, store };
}
async function connectTikTok(transport: FakeTikTokTransport) {
  const store = new InMemoryOAuthSecureStore();
  const connector = tiktok(store, transport);
  const url = new URL(await connector.authorizationUrl());
  const status = await connector.callback({ authorizationCode: "tt-code", callbackUrl: `${TIKTOK_REDIRECT_URI}?code=tt-code`, state: required(url.searchParams.get("state")) });
  return { connector, status, store };
}
function token(scopes: readonly string[] = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]): SocialTokenExchangeResult {
  return { accessToken: "raw-access-token", accountId: "account-123", expiresAt: "2026-08-17T14:00:00.000Z", grantedScopes: scopes, refreshToken: "raw-refresh-token" };
}
function expiredCredential() { return { accessToken: "raw-access-token", accountId: "account-123", expiresAt: "2026-07-17T13:00:00.000Z", grantedScopes: ["instagram_business_basic"], refreshToken: "raw-refresh-token" }; }
function futureCredential() { return { accessToken: "raw-access-token", accountId: "account-123", expiresAt: "2026-08-17T14:00:00.000Z", grantedScopes: ["instagram_business_basic"], refreshToken: "raw-refresh-token" }; }
function encryptedStore(path: string) { return new EncryptedFileOAuthSecureStore({ encryptionKey: { contractVersion: "1", secretId: "social-vault-key", value: "a sufficiently long local encryption key" }, path, repositoryRoot: "/private/nonmatching-repository" }); }
function required(value: string | null): string { if (value === null) throw new Error("missing test value"); return value; }
