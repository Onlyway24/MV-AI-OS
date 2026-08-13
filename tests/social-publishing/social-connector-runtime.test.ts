import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { SecretReference } from "../../src/config/secret-reference.js";
import type { SecretResolver } from "../../src/config/secret-resolver.js";
import {
  OfficialInstagramConnector,
  OfficialTikTokConnector,
  type InstagramConnectorStatus,
  type InstagramConnectorTransport,
  type TikTokConnectorTransport,
  type TikTokConnectorStatus,
} from "../../src/social-publishing/official-social-connectors.js";
import {
  EncryptedFileOAuthSecureStore,
  INSTAGRAM_REDIRECT_URI,
  TIKTOK_REDIRECT_URI,
} from "../../src/social-publishing/oauth-connector-foundation.js";
import {
  LocalSocialConnectorServer,
  META_APP_DASHBOARD_URL,
  SocialConnectorConfigValidator,
  TIKTOK_APP_DASHBOARD_URL,
  TIKTOK_USERNAME_BINDING_RATIONALE,
  persistSocialConnectorStatusAtomically,
  preflightSocialConnectors,
  type SocialConnectorClient,
  type SocialConnectorStatusArtifact,
  type SocialConnectorStatuses,
} from "../../src/social-publishing/social-connector-runtime.js";

const NOW = new Date("2026-07-19T08:00:00.000Z");

describe("official social connector offline runtime closure", () => {
  it("strictly validates every public field, exact SecretReference and private path boundary", () => withDirectory((directory) => {
    const candidate = config(directory);
    expect(new SocialConnectorConfigValidator().validate(candidate)).toMatchObject({ ok: true });
    expect(new SocialConnectorConfigValidator().validate({ ...candidate, unexpected: true })).toEqual({ ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" });
    expect(new SocialConnectorConfigValidator().validate({ ...candidate, instagram: { ...candidate.instagram, redirectUri: `${INSTAGRAM_REDIRECT_URI}/wrong` } })).toEqual({ ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" });
    expect(new SocialConnectorConfigValidator().validate({ ...candidate, tiktok: { ...candidate.tiktok, scopes: ["user.info.basic", "video.publish"] } })).toEqual({ ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" });
    expect(new SocialConnectorConfigValidator().validate({ ...candidate, instagram: { ...candidate.instagram, clientId: { ...candidate.instagram.clientId, secretId: "wrong-reference" } } })).toEqual({ ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" });
    expect(new SocialConnectorConfigValidator().validate({ ...candidate, oauthVault: { ...candidate.oauthVault, path: join(candidate.repositoryRoot, "vault.json") } })).toEqual({ ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" });
  }));

  it("returns a complete redacted preflight without network calls or secret values", () => withDirectory(async (directory) => {
    const candidate = config(directory);
    const resolvedIds: string[] = [];
    const secretResolver: SecretResolver = {
      resolve: (reference: SecretReference) => {
        resolvedIds.push(reference.secretId);
        return Promise.resolve({ contractVersion: "1" as const, secretId: reference.secretId, source: reference.source, value: { contractVersion: "1" as const, secretId: reference.secretId, value: `sensitive-value-${reference.secretId}` } });
      },
    };
    const report = await preflightSocialConnectors(candidate, { clock: { now: () => NOW }, secretResolver });
    expect(report).toMatchObject({ externalCalls: 0, publication: "LOCKED", status: "READY" });
    expect(resolvedIds).toHaveLength(5);
    expect(report.checks.filter(({ code }) => code === "SECRET_REFERENCE_AVAILABLE")).toHaveLength(5);
    expect(report.browserCheckpoint).toMatchObject({ status: "BROWSER_ACTION_REQUIRED", instagram: { dashboardUrl: META_APP_DASHBOARD_URL }, tiktok: { dashboardUrl: TIKTOK_APP_DASHBOARD_URL } });
    expect(JSON.stringify(report)).not.toContain("sensitive-value");
    expect(JSON.stringify(report)).not.toContain(join(directory, "private"));

    const blocked = await preflightSocialConnectors(candidate, { secretResolver: { resolve: (reference) => reference.secretId === "tiktok-client-secret" ? Promise.reject(new Error("raw secret path must not escape")) : secretResolver.resolve(reference) } });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.checks).toContainEqual({ code: "SECRET_REFERENCE_AVAILABLE", secretReferenceId: "tiktok-client-secret", status: "BLOCKED" });
    expect(JSON.stringify(blocked)).not.toContain("raw secret path");
  }));

  it("clears only expired pending OAuth state after a genuine encrypted-store restart", () => withDirectory(async (directory) => {
    const path = join(directory, "private", "oauth-vault.json");
    const first = encryptedStore(path, join(directory, "repository"));
    await first.savePending("instagram", { authorizationRequestId: "old-request", createdAt: "2026-07-19T07:40:00.000Z", expiresAt: "2026-07-19T07:50:00.000Z", redirectUri: INSTAGRAM_REDIRECT_URI, state: "expired-state" });
    const restarted = encryptedStore(path, join(directory, "repository"));
    const connector = new OfficialInstagramConnector({ clientId: "opaque-client-id", clock: { now: () => NOW }, randomId: sequence(), store: restarted, transport: unusedInstagramTransport() });
    const authorization = new URL(await connector.authorizationUrl());
    expect(authorization.searchParams.get("state")).not.toBe("expired-state");
    await expect(connector.authorizationUrl()).rejects.toThrow("DUPLICATE_CONNECT_BLOCKED");

    const beforeTikTokRestart = encryptedStore(path, join(directory, "repository"));
    await beforeTikTokRestart.savePending("tiktok", { authorizationRequestId: "old-tiktok-request", codeVerifier: "v".repeat(64), createdAt: "2026-07-19T07:40:00.000Z", expiresAt: "2026-07-19T07:50:00.000Z", redirectUri: TIKTOK_REDIRECT_URI, state: "expired-tiktok-state" });
    const restartedTikTok = encryptedStore(path, join(directory, "repository"));
    const tiktok = new OfficialTikTokConnector({ clientId: "opaque-client-key", clock: { now: () => NOW }, randomId: sequence(), store: restartedTikTok, transport: unusedTikTokTransport() });
    const tiktokAuthorization = new URL(await tiktok.authorizationUrl());
    expect(tiktokAuthorization.searchParams.get("state")).not.toBe("expired-tiktok-state");
    expect(tiktokAuthorization.searchParams.get("code_challenge_method")).toBe("S256");
  }));

  it("serves health, status, checkpoint and fake OAuth routes on loopback with atomic safe state", () => withDirectory(async (directory) => {
    const statusPath = join(directory, "status", "social.json");
    const instagram = new FakeConnector(instagramReady(), "https://provider.invalid/instagram-authorize");
    const tiktok = new FakeConnector(tiktokReady(), "https://provider.invalid/tiktok-authorize");
    const server = new LocalSocialConnectorServer({ clock: { now: () => NOW }, csrfToken: "c".repeat(64), initialStatuses: disconnectedStatuses(), instagram, port: 0, statusPath, tiktok });
    const started = await server.start();
    try {
      const health = await fetch(new URL("health", started.url));
      expect(health.status).toBe(200);
      expect(health.headers.get("cache-control")).toBe("no-store");
      expect(await health.json()).toEqual({ contractVersion: "1", publication: "LOCKED", status: "READY" });

      const checkpoint = await fetch(new URL("api/checkpoint", started.url)).then(async (response) => response.json() as Promise<Record<string, unknown>>);
      expect(checkpoint).toMatchObject({ publication: "LOCKED", status: "BROWSER_ACTION_REQUIRED" });
      expect(JSON.stringify(checkpoint)).toContain(META_APP_DASHBOARD_URL);
      expect(JSON.stringify(checkpoint)).toContain(TIKTOK_APP_DASHBOARD_URL);

      expect(await statusWithHost(new URL("health", started.url), "localhost.invalid")).toBe(400);

      const crossSiteStart = await fetch(new URL("oauth/instagram/start", started.url), { redirect: "manual" });
      expect(crossSiteStart.status).toBe(404);
      const rejectedStart = await fetch(new URL(`oauth/instagram/start?csrf=${"c".repeat(64)}`, started.url), { method: "POST", redirect: "manual" });
      expect(rejectedStart.status).toBe(403);
      const start = await fetch(new URL(`oauth/instagram/start?csrf=${"c".repeat(64)}`, started.url), { headers: { Origin: started.url.slice(0, -1) }, method: "POST", redirect: "manual" });
      expect(start.status).toBe(303);
      expect(start.headers.get("location")).toBe("https://provider.invalid/instagram-authorize");

      const callback = await fetch(new URL("oauth/instagram/callback?code=raw-one-shot-code&state=state-ok", started.url), { redirect: "manual" });
      expect(callback.status).toBe(303);
      expect(instagram.callbackCalls).toBe(1);

      const rejectedPost = await fetch(new URL("instagram/verify?csrf=wrong", started.url), { method: "POST" });
      expect(rejectedPost.status).toBe(403);
      const verified = await fetch(new URL(`instagram/verify?csrf=${"c".repeat(64)}`, started.url), { headers: { Origin: started.url.slice(0, -1) }, method: "POST", redirect: "manual" });
      expect(verified.status).toBe(303);
      expect(instagram.verifyCalls).toBe(1);

      const persisted = await readFile(statusPath, "utf8");
      expect(JSON.parse(persisted)).toMatchObject({ browserCheckpoint: { instagram: { currentState: "INSIGHTS_READY" } }, publication: "LOCKED" });
      expect(persisted).not.toContain("raw-one-shot-code");
      expect(persisted).not.toContain("state-ok");
      expect((await stat(statusPath)).mode & 0o777).toBe(0o600);
      expect((await readdir(join(directory, "status"))).filter((name) => name.includes(".tmp"))).toEqual([]);
    } finally {
      await server.close();
    }
  }));

  it("refuses secret-bearing status artifacts and replaces valid artifacts atomically", () => withDirectory(async (directory) => {
    const statusPath = join(directory, "status.json");
    const statuses = disconnectedStatuses();
    const valid: SocialConnectorStatusArtifact = {
      browserCheckpoint: {
        appName: "Onlyway Social Operator",
        contractVersion: "1",
        instagram: platformCheckpoint("instagram"),
        publication: "LOCKED",
        status: "BROWSER_ACTION_REQUIRED",
        tiktok: platformCheckpoint("tiktok"),
      },
      checkedAt: NOW.toISOString(),
      contractVersion: "1",
      externalEffects: { drafts: 0, instagramPosts: 0, messages: 0, tiktokPosts: 0, uploads: 0 },
      instagram: statuses.instagram,
      publication: "LOCKED",
      tiktok: statuses.tiktok,
    };
    await persistSocialConnectorStatusAtomically(statusPath, valid);
    await persistSocialConnectorStatusAtomically(statusPath, { ...valid, checkedAt: "2026-07-19T09:00:00.000Z" });
    expect(JSON.parse(await readFile(statusPath, "utf8"))).toMatchObject({ checkedAt: "2026-07-19T09:00:00.000Z" });
    await expect(persistSocialConnectorStatusAtomically(statusPath, { ...valid, instagram: { ...valid.instagram, accessToken: "must-not-persist" } } as SocialConnectorStatusArtifact)).rejects.toThrow("SOCIAL_CONNECTOR_STATUS_CONTAINS_SECRET");
  }));
});

class FakeConnector<Status> implements SocialConnectorClient<Status> {
  public callbackCalls = 0;
  public verifyCalls = 0;
  public constructor(private readonly status: Status, private readonly providerUrl: string) {}
  public authorizationUrl(): Promise<string> { return Promise.resolve(this.providerUrl); }
  public callback(): Promise<Status> { this.callbackCalls += 1; return Promise.resolve(this.status); }
  public disconnect(): Promise<Status> { return Promise.resolve(this.status); }
  public verify(): Promise<Status> { this.verifyCalls += 1; return Promise.resolve(this.status); }
}

function config(directory: string) {
  const repositoryRoot = join(directory, "repository");
  const privateRoot = join(directory, "private");
  const reference = (secretId: string, name: string) => ({ contractVersion: "1", encoding: "utf8", path: join(privateRoot, name), secretId, source: "local-file" });
  return {
    contractVersion: "1",
    instagram: { clientId: reference("instagram-app-id", "instagram-app-id"), clientSecret: reference("instagram-client-secret", "instagram-secret"), expectedAccount: "@mr.metodo.veloce_official", redirectUri: INSTAGRAM_REDIRECT_URI, scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"] },
    oauthVault: { encryptionKey: reference("social-oauth-vault-key", "vault-key"), path: join(privateRoot, "oauth-vault.json") },
    repositoryRoot,
    statusPath: join(repositoryRoot, "status.json"),
    tiktok: { clientId: reference("tiktok-client-key", "tiktok-client-key"), clientSecret: reference("tiktok-client-secret", "tiktok-secret"), expectedAccount: "@metodo_veloce.official", redirectUri: TIKTOK_REDIRECT_URI, scopes: ["user.info.basic", "user.info.profile", "video.publish"], usernameBindingScopeRationale: TIKTOK_USERNAME_BINDING_RATIONALE },
  };
}

function disconnectedStatuses(): SocialConnectorStatuses { return { instagram: instagramDisconnected(), tiktok: tiktokDisconnected() }; }
function instagramDisconnected(): InstagramConnectorStatus { return { contentPermission: "SCOPE_APPROVAL_REQUIRED", expectedAccount: "@mr.metodo.veloce_official", grantedScopes: [], insights: "NOT_CHECKED", mediaHosting: "LOCAL_ONLY", publication: "LOCKED", receipt: receipt("instagram", "VERIFY", "BLOCKED", "a"), state: "OAUTH_REQUIRED" }; }
function tiktokDisconnected(): TikTokConnectorStatus { return { audit: "AUDIT_REQUIRED", domainVerification: "LOCAL_ONLY", expectedAccount: "@metodo_veloce.official", grantedScopes: [], privacyRestriction: "UNAUDITED_PRIVATE_ONLY", publication: "LOCKED", receipt: receipt("tiktok", "VERIFY", "BLOCKED", "b"), state: "OAUTH_REQUIRED" }; }
function instagramReady(): InstagramConnectorStatus { return { ...instagramDisconnected(), accountType: "BUSINESS", contentPermission: "CONTENT_PERMISSION_READY", grantedScopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"], insights: "INSIGHTS_READY", receipt: receipt("instagram", "CONNECT", "SUCCEEDED", "c"), state: "INSIGHTS_READY", tokenExpiresAt: "2026-08-19T08:00:00.000Z", username: "@mr.metodo.veloce_official" }; }
function tiktokReady(): TikTokConnectorStatus { return { ...tiktokDisconnected(), creatorInfo: { commentDisabled: false, duetDisabled: true, maxVideoPostDurationSec: 60, privacyLevelOptions: ["SELF_ONLY"], stitchDisabled: true }, grantedScopes: ["user.info.basic", "user.info.profile", "video.publish"], receipt: receipt("tiktok", "CONNECT", "SUCCEEDED", "d"), state: "CREATOR_INFO_READY", tokenExpiresAt: "2026-08-19T08:00:00.000Z", username: "@metodo_veloce.official" }; }
function receipt(platform: "instagram" | "tiktok", operation: "CONNECT" | "VERIFY", status: "BLOCKED" | "SUCCEEDED", fingerprint: string) { return { externalPublicationOccurred: false as const, operation, platform, receiptFingerprint: fingerprint.repeat(64), status }; }

function encryptedStore(path: string, repositoryRoot: string): EncryptedFileOAuthSecureStore { return new EncryptedFileOAuthSecureStore({ encryptionKey: { contractVersion: "1", secretId: "social-oauth-vault-key", value: "offline-test-encryption-key" }, path, repositoryRoot }); }
function sequence(): () => string { let value = 0; return () => `offline-sequence-${String(value += 1)}-abcdefghijklmnopqrstuvwxyz`; }
function unusedInstagramTransport(): InstagramConnectorTransport { const unavailable = (): never => { throw new Error("transport must remain offline"); }; return { exchangeCode: unavailable, identity: unavailable, insightsPreflight: unavailable, inspectPermissions: unavailable, refresh: unavailable, revoke: unavailable }; }
function unusedTikTokTransport(): TikTokConnectorTransport { const unavailable = (): never => { throw new Error("transport must remain offline"); }; return { creatorInfo: unavailable, exchangeCode: unavailable, identity: unavailable, refresh: unavailable, revoke: unavailable }; }

function platformCheckpoint(platform: "instagram" | "tiktok") {
  const instagram = platform === "instagram";
  return { appType: instagram ? "Business" as const : "Desktop" as const, browserActionRequired: true, connectUrl: "http://127.0.0.1:43123/", credentialScript: `./scripts/save-${platform}-connector-credentials.sh`, currentState: "OAUTH_REQUIRED", dashboardUrl: instagram ? META_APP_DASHBOARD_URL : TIKTOK_APP_DASHBOARD_URL, expectedAccount: instagram ? "@mr.metodo.veloce_official" : "@metodo_veloce.official", expectedFinalState: instagram ? "INSIGHTS_READY" as const : "CREATOR_INFO_READY" as const, products: instagram ? ["Instagram API with Instagram Login"] : ["Login Kit", "Content Posting API"], redirectUri: instagram ? INSTAGRAM_REDIRECT_URI : TIKTOK_REDIRECT_URI, scopes: instagram ? ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"] : ["user.info.basic", "user.info.profile", "video.publish"] };
}

async function withDirectory(test: (directory: string) => Promise<void> | void): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-social-runtime-")); try { await test(directory); } finally { await rm(directory, { force: true, recursive: true }); } }
function statusWithHost(url: URL, host: string): Promise<number> { return new Promise((resolve_, reject) => { const request = httpRequest(url, { headers: { Host: host } }, (response) => { response.resume(); resolve_(response.statusCode ?? 0); }); request.once("error", reject); request.end(); }); }
