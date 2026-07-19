import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import type { LocalFileSecretReference } from "../config/secret-reference.js";
import { SecretReferenceValidator } from "../config/secret-reference-validator.js";
import type { SecretResolver } from "../config/secret-resolver.js";
import {
  INSTAGRAM_EXPECTED_USERNAME,
  INSTAGRAM_REQUIRED_SCOPES,
  TIKTOK_EXPECTED_USERNAME,
  TIKTOK_REQUIRED_SCOPES,
  type InstagramConnectorStatus,
  type TikTokConnectorStatus,
} from "./official-social-connectors.js";
import {
  INSTAGRAM_REDIRECT_URI,
  SOCIAL_CONNECTOR_LOCAL_PORT,
  TIKTOK_REDIRECT_URI,
} from "./oauth-connector-foundation.js";
import { SocialExternalActionPlane, type SocialExternalActionOperation } from "./social-external-action-plane.js";

export const SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION = "1" as const;
export const META_APP_DASHBOARD_URL = "https://developers.facebook.com/apps/" as const;
export const TIKTOK_APP_DASHBOARD_URL = "https://developers.tiktok.com/apps/" as const;
export const SOCIAL_CONNECTOR_APP_NAME = "Onlyway Social Operator" as const;
export const TIKTOK_USERNAME_BINDING_RATIONALE = "TikTok documents username under user.info.profile; it is required only to reject a wrong account deterministically. video.list is not requested." as const;

const INSTAGRAM_APP_ID_REFERENCE = "instagram-app-id" as const;
const INSTAGRAM_CLIENT_SECRET_REFERENCE = "instagram-client-secret" as const;
const TIKTOK_CLIENT_KEY_REFERENCE = "tiktok-client-key" as const;
const TIKTOK_CLIENT_SECRET_REFERENCE = "tiktok-client-secret" as const;
const OAUTH_VAULT_KEY_REFERENCE = "social-oauth-vault-key" as const;

export interface LocalSocialConnectorConfig {
  readonly contractVersion: typeof SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION;
  readonly instagram: {
    readonly clientId: LocalFileSecretReference;
    readonly clientSecret: LocalFileSecretReference;
    readonly expectedAccount: "@mr.metodo.veloce_official";
    readonly redirectUri: typeof INSTAGRAM_REDIRECT_URI;
    readonly scopes: readonly string[];
  };
  readonly oauthVault: {
    readonly encryptionKey: LocalFileSecretReference;
    readonly path: string;
  };
  readonly repositoryRoot: string;
  readonly statusPath: string;
  readonly tiktok: {
    readonly clientId: LocalFileSecretReference;
    readonly clientSecret: LocalFileSecretReference;
    readonly expectedAccount: "@metodo_veloce.official";
    readonly redirectUri: typeof TIKTOK_REDIRECT_URI;
    readonly scopes: readonly string[];
    readonly usernameBindingScopeRationale: typeof TIKTOK_USERNAME_BINDING_RATIONALE;
  };
}

export type SocialConnectorConfigurationValidation =
  | { readonly ok: false; readonly reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" }
  | { readonly ok: true; readonly value: LocalSocialConnectorConfig };

/** Strictly validates every configured public value and every opaque SecretReference. */
export class SocialConnectorConfigValidator {
  readonly #secretReference = new SecretReferenceValidator();

  public validate(candidate: unknown): SocialConnectorConfigurationValidation {
    if (!record(candidate) || !exactKeys(candidate, ["contractVersion", "instagram", "oauthVault", "repositoryRoot", "statusPath", "tiktok"]) || candidate.contractVersion !== SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION || !absolutePath(candidate.repositoryRoot) || !absolutePath(candidate.statusPath) || !record(candidate.instagram) || !record(candidate.tiktok) || !record(candidate.oauthVault)) return invalidConfig();
    if (!exactKeys(candidate.instagram, ["clientId", "clientSecret", "expectedAccount", "redirectUri", "scopes"]) || !exactKeys(candidate.tiktok, ["clientId", "clientSecret", "expectedAccount", "redirectUri", "scopes", "usernameBindingScopeRationale"]) || !exactKeys(candidate.oauthVault, ["encryptionKey", "path"])) return invalidConfig();
    if (candidate.instagram.redirectUri !== INSTAGRAM_REDIRECT_URI || candidate.instagram.expectedAccount !== `@${INSTAGRAM_EXPECTED_USERNAME}` || !sameStrings(candidate.instagram.scopes, INSTAGRAM_REQUIRED_SCOPES)) return invalidConfig();
    if (candidate.tiktok.redirectUri !== TIKTOK_REDIRECT_URI || candidate.tiktok.expectedAccount !== `@${TIKTOK_EXPECTED_USERNAME}` || !sameStrings(candidate.tiktok.scopes, TIKTOK_REQUIRED_SCOPES) || candidate.tiktok.usernameBindingScopeRationale !== TIKTOK_USERNAME_BINDING_RATIONALE) return invalidConfig();
    if (!absolutePath(candidate.oauthVault.path)) return invalidConfig();

    const instagramId = this.#reference(candidate.instagram.clientId, INSTAGRAM_APP_ID_REFERENCE);
    const instagramSecret = this.#reference(candidate.instagram.clientSecret, INSTAGRAM_CLIENT_SECRET_REFERENCE);
    const tiktokId = this.#reference(candidate.tiktok.clientId, TIKTOK_CLIENT_KEY_REFERENCE);
    const tiktokSecret = this.#reference(candidate.tiktok.clientSecret, TIKTOK_CLIENT_SECRET_REFERENCE);
    const encryptionKey = this.#reference(candidate.oauthVault.encryptionKey, OAUTH_VAULT_KEY_REFERENCE);
    if (instagramId === undefined || instagramSecret === undefined || tiktokId === undefined || tiktokSecret === undefined || encryptionKey === undefined) return invalidConfig();

    const repositoryRoot = resolve(candidate.repositoryRoot);
    const oauthVaultPath = candidate.oauthVault.path;
    const statusPath = candidate.statusPath;
    const privatePaths = [instagramId.path, instagramSecret.path, tiktokId.path, tiktokSecret.path, encryptionKey.path, oauthVaultPath];
    if (privatePaths.some((path) => inside(repositoryRoot, path)) || new Set(privatePaths.map((path) => resolve(path))).size !== privatePaths.length || privatePaths.some((path) => resolve(path) === resolve(statusPath))) return invalidConfig();

    return {
      ok: true,
      value: deepFreeze({
        contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION,
        instagram: { clientId: instagramId, clientSecret: instagramSecret, expectedAccount: `@${INSTAGRAM_EXPECTED_USERNAME}`, redirectUri: INSTAGRAM_REDIRECT_URI, scopes: [...INSTAGRAM_REQUIRED_SCOPES] },
        oauthVault: { encryptionKey, path: resolve(oauthVaultPath) },
        repositoryRoot,
        statusPath: resolve(statusPath),
        tiktok: { clientId: tiktokId, clientSecret: tiktokSecret, expectedAccount: `@${TIKTOK_EXPECTED_USERNAME}`, redirectUri: TIKTOK_REDIRECT_URI, scopes: [...TIKTOK_REQUIRED_SCOPES], usernameBindingScopeRationale: TIKTOK_USERNAME_BINDING_RATIONALE },
      }),
    };
  }

  #reference(candidate: unknown, secretId: string): LocalFileSecretReference | undefined {
    const checked = this.#secretReference.validate(candidate);
    return checked.ok && checked.value.source === "local-file" && checked.value.secretId === secretId ? checked.value : undefined;
  }
}

export interface SocialConnectorPreflightCheck {
  readonly code: "CONFIGURATION_VALID" | "PUBLICATION_CAPABILITY_ABSENT" | "SECRET_REFERENCE_AVAILABLE";
  readonly secretReferenceId?: string;
  readonly status: "BLOCKED" | "PASS";
}

export interface SocialConnectorPreflightReport {
  readonly browserCheckpoint: SocialConnectorBrowserCheckpoint;
  readonly checks: readonly SocialConnectorPreflightCheck[];
  readonly contractVersion: typeof SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION;
  readonly externalCalls: 0;
  readonly generatedAt: string;
  readonly publication: "LOCKED";
  readonly status: "BLOCKED" | "READY";
}

export async function preflightSocialConnectors(candidate: unknown, dependencies: {
  readonly clock?: { now(): Date };
  readonly secretResolver?: SecretResolver;
} = {}): Promise<SocialConnectorPreflightReport> {
  const validation = new SocialConnectorConfigValidator().validate(candidate);
  const generatedAt = (dependencies.clock?.now() ?? new Date()).toISOString();
  if (!validation.ok) {
    return deepFreeze({
      browserCheckpoint: buildSocialConnectorBrowserCheckpoint({ instagramState: "APP_CONFIGURATION_REQUIRED", tiktokState: "APP_CONFIGURATION_REQUIRED" }),
      checks: [{ code: "CONFIGURATION_VALID", status: "BLOCKED" }],
      contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION,
      externalCalls: 0,
      generatedAt,
      publication: "LOCKED",
      status: "BLOCKED",
    });
  }
  const resolver = dependencies.secretResolver ?? new LocalSecretResolver();
  const references = [
    validation.value.instagram.clientId,
    validation.value.instagram.clientSecret,
    validation.value.tiktok.clientId,
    validation.value.tiktok.clientSecret,
    validation.value.oauthVault.encryptionKey,
  ];
  const referenceChecks = await Promise.all(references.map(async (reference): Promise<SocialConnectorPreflightCheck> => {
    try {
      const resolved = await resolver.resolve(reference);
      return { code: "SECRET_REFERENCE_AVAILABLE", secretReferenceId: reference.secretId, status: resolved.secretId === reference.secretId ? "PASS" : "BLOCKED" };
    } catch {
      return { code: "SECRET_REFERENCE_AVAILABLE", secretReferenceId: reference.secretId, status: "BLOCKED" };
    }
  }));
  const checks: readonly SocialConnectorPreflightCheck[] = deepFreeze([
    { code: "CONFIGURATION_VALID", status: "PASS" },
    ...referenceChecks,
    { code: "PUBLICATION_CAPABILITY_ABSENT", status: "PASS" },
  ]);
  const ready = checks.every(({ status }) => status === "PASS");
  return deepFreeze({
    browserCheckpoint: buildSocialConnectorBrowserCheckpoint({ instagramState: ready ? "OAUTH_REQUIRED" : "APP_CONFIGURATION_REQUIRED", tiktokState: ready ? "OAUTH_REQUIRED" : "APP_CONFIGURATION_REQUIRED" }),
    checks,
    contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION,
    externalCalls: 0,
    generatedAt,
    publication: "LOCKED",
    status: ready ? "READY" : "BLOCKED",
  });
}

export interface SocialConnectorBrowserCheckpoint {
  readonly appName: typeof SOCIAL_CONNECTOR_APP_NAME;
  readonly contractVersion: typeof SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION;
  readonly instagram: SocialConnectorPlatformCheckpoint;
  readonly publication: "LOCKED";
  readonly status: "BROWSER_ACTION_REQUIRED" | "CONNECTORS_VERIFIED";
  readonly tiktok: SocialConnectorPlatformCheckpoint;
}

export interface SocialConnectorPlatformCheckpoint {
  readonly appType: "Business" | "Desktop";
  readonly browserActionRequired: boolean;
  readonly connectUrl: string;
  readonly credentialScript: string;
  readonly currentState: string;
  readonly dashboardUrl: string;
  readonly expectedAccount: string;
  readonly expectedFinalState: "CREATOR_INFO_READY" | "INSIGHTS_READY";
  readonly products: readonly string[];
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

export function buildSocialConnectorBrowserCheckpoint(input: {
  readonly baseUrl?: string;
  readonly instagramState: string;
  readonly tiktokState: string;
}): SocialConnectorBrowserCheckpoint {
  const baseUrl = canonicalLocalBase(input.baseUrl ?? `http://127.0.0.1:${String(SOCIAL_CONNECTOR_LOCAL_PORT)}/`);
  const instagramReady = input.instagramState === "INSIGHTS_READY";
  const tiktokReady = input.tiktokState === "CREATOR_INFO_READY";
  return deepFreeze({
    appName: SOCIAL_CONNECTOR_APP_NAME,
    contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION,
    instagram: {
      appType: "Business",
      browserActionRequired: !instagramReady,
      connectUrl: baseUrl,
      credentialScript: "./scripts/save-instagram-connector-credentials.sh",
      currentState: input.instagramState,
      dashboardUrl: META_APP_DASHBOARD_URL,
      expectedAccount: `@${INSTAGRAM_EXPECTED_USERNAME}`,
      expectedFinalState: "INSIGHTS_READY",
      products: ["Instagram API with Instagram Login"],
      redirectUri: INSTAGRAM_REDIRECT_URI,
      scopes: [...INSTAGRAM_REQUIRED_SCOPES],
    },
    publication: "LOCKED",
    status: instagramReady && tiktokReady ? "CONNECTORS_VERIFIED" : "BROWSER_ACTION_REQUIRED",
    tiktok: {
      appType: "Desktop",
      browserActionRequired: !tiktokReady,
      connectUrl: baseUrl,
      credentialScript: "./scripts/save-tiktok-connector-credentials.sh",
      currentState: input.tiktokState,
      dashboardUrl: TIKTOK_APP_DASHBOARD_URL,
      expectedAccount: `@${TIKTOK_EXPECTED_USERNAME}`,
      expectedFinalState: "CREATOR_INFO_READY",
      products: ["Login Kit", "Content Posting API"],
      redirectUri: TIKTOK_REDIRECT_URI,
      scopes: [...TIKTOK_REQUIRED_SCOPES],
    },
  });
}

export interface SocialConnectorStatusArtifact {
  readonly browserCheckpoint: SocialConnectorBrowserCheckpoint;
  readonly checkedAt: string;
  readonly contractVersion: typeof SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION;
  readonly externalEffects: {
    readonly drafts: 0;
    readonly instagramPosts: 0;
    readonly messages: 0;
    readonly tiktokPosts: 0;
    readonly uploads: 0;
  };
  readonly instagram: InstagramConnectorStatus;
  readonly publication: "LOCKED";
  readonly tiktok: TikTokConnectorStatus;
}

export function createSocialConnectorStatusArtifact(statuses: SocialConnectorStatuses, now: Date, baseUrl?: string): SocialConnectorStatusArtifact {
  const artifact = deepFreeze({
    browserCheckpoint: buildSocialConnectorBrowserCheckpoint({ ...(baseUrl === undefined ? {} : { baseUrl }), instagramState: statuses.instagram.state, tiktokState: statuses.tiktok.state }),
    checkedAt: now.toISOString(),
    contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION,
    externalEffects: { drafts: 0, instagramPosts: 0, messages: 0, tiktokPosts: 0, uploads: 0 } as const,
    instagram: statuses.instagram,
    publication: "LOCKED" as const,
    tiktok: statuses.tiktok,
  });
  assertNoSecretMaterial(artifact);
  return artifact;
}

export async function persistSocialConnectorStatusAtomically(path: string, artifact: SocialConnectorStatusArtifact): Promise<void> {
  if (!absolutePath(path)) throw new Error("SOCIAL_CONNECTOR_STATUS_PATH_INVALID");
  assertNoSecretMaterial(artifact);
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporary = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try { await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    created = false;
    await chmod(path, 0o600);
  } finally {
    if (created) await unlink(temporary).catch(() => undefined);
  }
}

export interface SocialConnectorStatuses {
  readonly instagram: InstagramConnectorStatus;
  readonly tiktok: TikTokConnectorStatus;
}

export interface SocialConnectorClient<Status> {
  authorizationUrl(): Promise<string>;
  callback(input: { readonly authorizationCode: string; readonly callbackUrl: string; readonly state: string }): Promise<Status>;
  disconnect(): Promise<Status>;
  verify(): Promise<Status>;
}

export class LocalSocialConnectorServer {
  readonly #actionPlane: SocialExternalActionPlane;
  readonly #clock: { now(): Date };
  readonly #csrf: string;
  readonly #host = "127.0.0.1" as const;
  readonly #instagram: SocialConnectorClient<InstagramConnectorStatus>;
  readonly #requestedPort: number;
  readonly #statusPath: string;
  readonly #tiktok: SocialConnectorClient<TikTokConnectorStatus>;
  #baseUrl: string | undefined;
  #server: Server | undefined;
  #statuses: SocialConnectorStatuses;

  public constructor(input: {
    readonly actionPlane?: SocialExternalActionPlane;
    readonly clock?: { now(): Date };
    readonly csrfToken?: string;
    readonly initialStatuses: SocialConnectorStatuses;
    readonly instagram: SocialConnectorClient<InstagramConnectorStatus>;
    readonly port?: number;
    readonly statusPath: string;
    readonly tiktok: SocialConnectorClient<TikTokConnectorStatus>;
  }) {
    this.#actionPlane = input.actionPlane ?? new SocialExternalActionPlane();
    this.#clock = input.clock ?? { now: () => new Date() };
    this.#csrf = input.csrfToken ?? randomBytes(32).toString("hex");
    this.#instagram = input.instagram;
    this.#requestedPort = input.port ?? SOCIAL_CONNECTOR_LOCAL_PORT;
    this.#statuses = input.initialStatuses;
    this.#statusPath = input.statusPath;
    this.#tiktok = input.tiktok;
  }

  public get statuses(): SocialConnectorStatuses { return deepFreeze(structuredClone(this.#statuses)); }

  public async start(): Promise<{ readonly port: number; readonly url: string }> {
    if (this.#server !== undefined && this.#baseUrl !== undefined) return { port: Number(new URL(this.#baseUrl).port), url: this.#baseUrl };
    const server = createServer((request, response) => { void this.#handle(request, response).catch(() => { send(response, 400, "Operazione OAuth bloccata in sicurezza"); }); });
    await new Promise<void>((resolve_, reject) => {
      server.once("error", reject);
      server.listen({ host: this.#host, port: this.#requestedPort }, () => { server.off("error", reject); resolve_(); });
    });
    const address = server.address() as AddressInfo | null;
    if (address === null) { await closeServer(server); throw new Error("SOCIAL_CONNECTOR_SERVER_START_FAILED"); }
    this.#server = server;
    this.#baseUrl = `http://${this.#host}:${String(address.port)}/`;
    try { await this.#persist(); }
    catch (error) { await this.close(); throw error; }
    return { port: address.port, url: this.#baseUrl };
  }

  public async close(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    this.#baseUrl = undefined;
    if (server !== undefined) await closeServer(server);
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const baseUrl = this.#baseUrl;
    if (baseUrl === undefined || request.headers.host !== new URL(baseUrl).host) { send(response, 400, "Host locale non valido"); return; }
    const url = new URL(request.url ?? "/", baseUrl);
    if (request.method === "GET" && url.pathname === "/") { sendHtml(response, page(this.#statuses, this.#csrf)); return; }
    if (request.method === "GET" && url.pathname === "/health") { sendJson(response, { contractVersion: SOCIAL_CONNECTOR_RUNTIME_CONTRACT_VERSION, publication: "LOCKED", status: "READY" }); return; }
    if (request.method === "GET" && url.pathname === "/api/status") { sendJson(response, createSocialConnectorStatusArtifact(this.#statuses, this.#clock.now(), baseUrl)); return; }
    if (request.method === "GET" && url.pathname === "/api/checkpoint") { sendJson(response, buildSocialConnectorBrowserCheckpoint({ baseUrl, instagramState: this.#statuses.instagram.state, tiktokState: this.#statuses.tiktok.state })); return; }
    if (request.method === "GET" && url.pathname === "/oauth/instagram/callback") {
      this.#authorize("OAUTH_CALLBACK");
      this.#statuses = { ...this.#statuses, instagram: await this.#instagram.callback({ authorizationCode: required(url.searchParams.get("code")), callbackUrl: url.toString(), state: required(url.searchParams.get("state")) }) };
      await this.#persist(); redirect(response, "/"); return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/tiktok/callback/") {
      this.#authorize("OAUTH_CALLBACK");
      this.#statuses = { ...this.#statuses, tiktok: await this.#tiktok.callback({ authorizationCode: required(url.searchParams.get("code")), callbackUrl: url.toString(), state: required(url.searchParams.get("state")) }) };
      await this.#persist(); redirect(response, "/"); return;
    }
    if (request.method === "POST") {
      if (!safeEqual(this.#csrf, url.searchParams.get("csrf") ?? "") || request.headers.origin !== baseUrl.slice(0, -1)) { send(response, 403, "Conferma locale non valida"); return; }
      if (url.pathname === "/oauth/instagram/start") { this.#authorize("OAUTH_START"); redirect(response, await this.#instagram.authorizationUrl()); return; }
      if (url.pathname === "/oauth/tiktok/start") { this.#authorize("OAUTH_START"); redirect(response, await this.#tiktok.authorizationUrl()); return; }
      if (url.pathname === "/instagram/verify") { this.#authorize("IDENTITY_READ"); this.#statuses = { ...this.#statuses, instagram: await this.#instagram.verify() }; }
      else if (url.pathname === "/instagram/disconnect") { this.#authorize("DISCONNECT"); this.#statuses = { ...this.#statuses, instagram: await this.#instagram.disconnect() }; }
      else if (url.pathname === "/tiktok/verify") { this.#authorize("TIKTOK_CREATOR_INFO_READ"); this.#statuses = { ...this.#statuses, tiktok: await this.#tiktok.verify() }; }
      else if (url.pathname === "/tiktok/disconnect") { this.#authorize("DISCONNECT"); this.#statuses = { ...this.#statuses, tiktok: await this.#tiktok.disconnect() }; }
      else { send(response, 404, "Operazione non disponibile"); return; }
      await this.#persist(); redirect(response, "/"); return;
    }
    send(response, 404, "Risorsa non trovata");
  }

  #authorize(operation: SocialExternalActionOperation): void { this.#actionPlane.authorize({ operation, operationId: `${operation}:${randomUUID()}` }); }
  #persist(): Promise<void> { return persistSocialConnectorStatusAtomically(this.#statusPath, createSocialConnectorStatusArtifact(this.#statuses, this.#clock.now(), this.#baseUrl)); }
}

function page(statuses: SocialConnectorStatuses, csrf: string): string {
  const card = (platform: "instagram" | "tiktok", label: string, state: string, account: string): string => `
    <section><h2>${html(label)}</h2><p class="account">${html(account)}</p><p class="state">${html(state)}</p>
    <form method="post" action="/oauth/${platform}/start?csrf=${csrf}"><button>Connetti / Riconnetti</button></form>
    <form method="post" action="/${platform}/verify?csrf=${csrf}"><button>Verifica stato</button></form>
    <form method="post" action="/${platform}/disconnect?csrf=${csrf}"><button class="secondary">Disconnetti</button></form>
    <p class="lock">PUBBLICAZIONE LOCKED</p></section>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Onlyway Social Operator</title><style>body{margin:0;background:#090b0e;color:#f8f8f6;font:16px Arial,sans-serif}main{max-width:920px;margin:0 auto;padding:48px 20px}h1{font-size:42px;margin-bottom:8px}header p{color:#ffcf00}section{background:#14171c;border:1px solid #2d323a;border-radius:20px;padding:28px;margin:24px 0}.account{font-weight:700}.state{color:#ffcf00;font-family:monospace}.button,button{display:inline-block;background:#ffcf00;color:#08090b;border:0;border-radius:999px;padding:13px 20px;margin:6px 8px 6px 0;font-weight:700;text-decoration:none;cursor:pointer}.secondary{background:#2c3138;color:#fff}form{display:inline}.lock{margin-top:20px;color:#aeb5bf;font-size:13px;letter-spacing:.12em}@media(max-width:390px){main{padding:24px 14px}h1{font-size:31px}section{padding:20px}.button,button{width:100%;box-sizing:border-box;margin:6px 0}}</style></head><body><main><header><h1>Onlyway Social Operator</h1><p>Connessione ufficiale in sola lettura • nessun pulsante Pubblica</p></header>${card("instagram", "Instagram", statuses.instagram.state, statuses.instagram.username ?? statuses.instagram.expectedAccount)}${card("tiktok", "TikTok", statuses.tiktok.state, statuses.tiktok.username ?? statuses.tiktok.expectedAccount)}</main></body></html>`;
}

function assertNoSecretMaterial(value: unknown): void {
  const forbidden = new Set(["accessToken", "authorizationCode", "clientSecret", "codeVerifier", "refreshToken"]);
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string" && /\bsk-[A-Za-z0-9_-]{8,}\b/u.test(candidate)) throw new Error("SOCIAL_CONNECTOR_STATUS_CONTAINS_SECRET");
    if (Array.isArray(candidate)) { for (const item of candidate) visit(item); return; }
    if (!record(candidate)) return;
    for (const [key, child] of Object.entries(candidate)) { if (forbidden.has(key)) throw new Error("SOCIAL_CONNECTOR_STATUS_CONTAINS_SECRET"); visit(child); }
  };
  visit(value);
}

function invalidConfig(): SocialConnectorConfigurationValidation { return { ok: false, reasonCode: "SOCIAL_CONNECTOR_CONFIGURATION_INVALID" }; }
function absolutePath(value: unknown): value is string { return typeof value === "string" && value.length > 0 && !value.includes("\0") && isAbsolute(value); }
function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function sameStrings(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry) => typeof entry === "string") && [...value].sort().every((entry, index) => entry === [...expected].sort()[index]); }
function inside(root: string, path: string): boolean { const pathFromRoot = relative(resolve(root), resolve(path)); return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot)); }
function canonicalLocalBase(value: string): string { const url = new URL(value); if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new Error("SOCIAL_CONNECTOR_LOCAL_URL_INVALID"); url.pathname = "/"; return url.toString(); }
function required(value: string | null): string { if (value === null || value.length === 0) throw new Error("Callback OAuth incompleto"); return value; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function html(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function closeServer(server: Server): Promise<void> { return new Promise((resolve_, reject) => { server.close((error) => { if (error === undefined) resolve_(); else reject(error); }); }); }
function send(response: ServerResponse, status: number, body: string): void { response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(body); }
function sendHtml(response: ServerResponse, body: string): void { response.writeHead(200, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(body); }
function sendJson(response: ServerResponse, value: unknown): void { response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(JSON.stringify(value)); }
function redirect(response: ServerResponse, location: string): void { response.writeHead(303, { "Cache-Control": "no-store", Location: location, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(); }
