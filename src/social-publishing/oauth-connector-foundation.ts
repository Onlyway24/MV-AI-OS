import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { SecretReference } from "../config/secret-reference.js";
import type { SecretValue } from "../config/secret-value.js";

export const OFFICIAL_SOCIAL_CONNECTOR_CONTRACT_VERSION = "1" as const;
export const SOCIAL_CONNECTOR_LOCAL_PORT = 43_123;
export const INSTAGRAM_REDIRECT_URI = "http://127.0.0.1:43123/oauth/instagram/callback" as const;
export const TIKTOK_REDIRECT_URI = "http://127.0.0.1:43123/oauth/tiktok/callback/" as const;

export type OfficialSocialPlatform = "instagram" | "tiktok";
export type MediaDeliveryState =
  | "DOMAIN_VERIFICATION_REQUIRED"
  | "EXPIRED"
  | "HTTPS_STORAGE_REQUIRED"
  | "LOCAL_ONLY"
  | "READY"
  | "REVOKED";

export interface OfficialSocialAppConfiguration {
  readonly clientId: SecretReference;
  readonly clientSecret: SecretReference;
  readonly expectedUsername: string;
  readonly platform: OfficialSocialPlatform;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

export interface OAuthPendingSession {
  readonly authorizationRequestId: string;
  readonly codeVerifier?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly redirectUri: string;
  readonly state: string;
}

export interface OAuthCredentialRecord {
  readonly accessToken: string;
  readonly accountId: string;
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
  readonly refreshToken?: string;
  readonly username?: string;
}

export interface OAuthSecureStore {
  consumePending(input: {
    readonly authorizationCode: string;
    readonly now: Date;
    readonly platform: OfficialSocialPlatform;
    readonly state: string;
  }): Promise<OAuthPendingSession>;
  deleteCredential(platform: OfficialSocialPlatform): Promise<void>;
  deletePending(platform: OfficialSocialPlatform): Promise<void>;
  loadCredential(platform: OfficialSocialPlatform): Promise<OAuthCredentialRecord | undefined>;
  loadPending(platform: OfficialSocialPlatform): Promise<OAuthPendingSession | undefined>;
  saveCredential(platform: OfficialSocialPlatform, credential: OAuthCredentialRecord): Promise<void>;
  savePending(platform: OfficialSocialPlatform, pending: OAuthPendingSession): Promise<void>;
}

export class OAuthSecurityError extends Error {
  public readonly code:
    | "AUTHORIZATION_CODE_REPLAY"
    | "CALLBACK_EXPIRED"
    | "CALLBACK_REPLAY"
    | "OAUTH_STATE_MISMATCH"
    | "SECURE_STORE_INVALID";
  public constructor(code: OAuthSecurityError["code"]) {
    super("OAuth callback was blocked safely");
    this.code = code;
  }
}

interface StoredPlatformState {
  readonly credential?: OAuthCredentialRecord;
  readonly pending?: OAuthPendingSession;
  readonly usedAuthorizationCodeFingerprints: readonly string[];
}

/** Test store with exactly the same one-shot state and code rules as disk. */
export class InMemoryOAuthSecureStore implements OAuthSecureStore {
  readonly #states = new Map<OfficialSocialPlatform, StoredPlatformState>();

  public consumePending(input: {
    readonly authorizationCode: string;
    readonly now: Date;
    readonly platform: OfficialSocialPlatform;
    readonly state: string;
  }): Promise<OAuthPendingSession> {
    const stored = this.#states.get(input.platform) ?? emptyState();
    const pending = stored.pending;
    if (pending === undefined) throw new OAuthSecurityError("CALLBACK_REPLAY");
    if (!safeEqual(pending.state, input.state)) throw new OAuthSecurityError("OAUTH_STATE_MISMATCH");
    if (Date.parse(pending.expiresAt) <= input.now.getTime()) throw new OAuthSecurityError("CALLBACK_EXPIRED");
    const codeFingerprint = fingerprint(input.authorizationCode);
    if (stored.usedAuthorizationCodeFingerprints.includes(codeFingerprint)) throw new OAuthSecurityError("AUTHORIZATION_CODE_REPLAY");
    this.#states.set(input.platform, {
      ...(stored.credential === undefined ? {} : { credential: stored.credential }),
      usedAuthorizationCodeFingerprints: [...stored.usedAuthorizationCodeFingerprints, codeFingerprint],
    });
    return Promise.resolve(pending);
  }

  public deleteCredential(platform: OfficialSocialPlatform): Promise<void> {
    const stored = this.#states.get(platform) ?? emptyState();
    this.#states.set(platform, {
      ...(stored.pending === undefined ? {} : { pending: stored.pending }),
      usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints,
    });
    return Promise.resolve();
  }
  public deletePending(platform: OfficialSocialPlatform): Promise<void> {
    const stored = this.#states.get(platform) ?? emptyState();
    this.#states.set(platform, {
      ...(stored.credential === undefined ? {} : { credential: stored.credential }),
      usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints,
    });
    return Promise.resolve();
  }
  public loadCredential(platform: OfficialSocialPlatform): Promise<OAuthCredentialRecord | undefined> {
    return Promise.resolve(this.#states.get(platform)?.credential);
  }
  public loadPending(platform: OfficialSocialPlatform): Promise<OAuthPendingSession | undefined> {
    return Promise.resolve(this.#states.get(platform)?.pending);
  }
  public saveCredential(platform: OfficialSocialPlatform, credential: OAuthCredentialRecord): Promise<void> {
    const stored = this.#states.get(platform) ?? emptyState();
    this.#states.set(platform, { credential, ...(stored.pending === undefined ? {} : { pending: stored.pending }), usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints });
    return Promise.resolve();
  }
  public savePending(platform: OfficialSocialPlatform, pending: OAuthPendingSession): Promise<void> {
    const stored = this.#states.get(platform) ?? emptyState();
    if (stored.pending !== undefined) throw new OAuthSecurityError("SECURE_STORE_INVALID");
    this.#states.set(platform, { ...(stored.credential === undefined ? {} : { credential: stored.credential }), pending, usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints });
    return Promise.resolve();
  }
}

/** AES-256-GCM encrypted, owner-only, outside-repository OAuth state store. */
export class EncryptedFileOAuthSecureStore implements OAuthSecureStore {
  readonly #key: Buffer;
  readonly #path: string;

  public constructor(input: { readonly encryptionKey: SecretValue; readonly path: string; readonly repositoryRoot: string }) {
    this.#path = resolve(input.path);
    const root = `${resolve(input.repositoryRoot)}/`;
    if (`${this.#path}/`.startsWith(root)) throw new OAuthSecurityError("SECURE_STORE_INVALID");
    this.#key = createHash("sha256").update(input.encryptionKey.value).digest();
  }

  public async consumePending(input: {
    readonly authorizationCode: string;
    readonly now: Date;
    readonly platform: OfficialSocialPlatform;
    readonly state: string;
  }): Promise<OAuthPendingSession> {
    return withOAuthStoreMutationLock(this.#path, async () => {
      const all = await this.#loadAll();
      const stored = all[input.platform] ?? emptyState();
      const pending = stored.pending;
      if (pending === undefined) throw new OAuthSecurityError("CALLBACK_REPLAY");
      if (!safeEqual(pending.state, input.state)) throw new OAuthSecurityError("OAUTH_STATE_MISMATCH");
      if (Date.parse(pending.expiresAt) <= input.now.getTime()) throw new OAuthSecurityError("CALLBACK_EXPIRED");
      const codeFingerprint = fingerprint(input.authorizationCode);
      if (stored.usedAuthorizationCodeFingerprints.includes(codeFingerprint)) throw new OAuthSecurityError("AUTHORIZATION_CODE_REPLAY");
      all[input.platform] = {
        ...(stored.credential === undefined ? {} : { credential: stored.credential }),
        usedAuthorizationCodeFingerprints: [...stored.usedAuthorizationCodeFingerprints, codeFingerprint],
      };
      await this.#saveAll(all);
      return pending;
    });
  }

  public async deleteCredential(platform: OfficialSocialPlatform): Promise<void> {
    await withOAuthStoreMutationLock(this.#path, async () => {
      const all = await this.#loadAll();
      const stored = all[platform] ?? emptyState();
      all[platform] = { ...(stored.pending === undefined ? {} : { pending: stored.pending }), usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints };
      await this.#saveAll(all);
    });
  }
  public async deletePending(platform: OfficialSocialPlatform): Promise<void> {
    await withOAuthStoreMutationLock(this.#path, async () => {
      const all = await this.#loadAll();
      const stored = all[platform] ?? emptyState();
      all[platform] = { ...(stored.credential === undefined ? {} : { credential: stored.credential }), usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints };
      await this.#saveAll(all);
    });
  }
  public async loadCredential(platform: OfficialSocialPlatform): Promise<OAuthCredentialRecord | undefined> { return (await this.#loadAll())[platform]?.credential; }
  public async loadPending(platform: OfficialSocialPlatform): Promise<OAuthPendingSession | undefined> { return (await this.#loadAll())[platform]?.pending; }
  public async saveCredential(platform: OfficialSocialPlatform, credential: OAuthCredentialRecord): Promise<void> {
    await withOAuthStoreMutationLock(this.#path, async () => {
      const all = await this.#loadAll();
      const stored = all[platform] ?? emptyState();
      all[platform] = { credential, ...(stored.pending === undefined ? {} : { pending: stored.pending }), usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints };
      await this.#saveAll(all);
    });
  }
  public async savePending(platform: OfficialSocialPlatform, pending: OAuthPendingSession): Promise<void> {
    await withOAuthStoreMutationLock(this.#path, async () => {
      const all = await this.#loadAll();
      const stored = all[platform] ?? emptyState();
      if (stored.pending !== undefined) throw new OAuthSecurityError("SECURE_STORE_INVALID");
      all[platform] = { ...(stored.credential === undefined ? {} : { credential: stored.credential }), pending, usedAuthorizationCodeFingerprints: stored.usedAuthorizationCodeFingerprints };
      await this.#saveAll(all);
    });
  }

  async #loadAll(): Promise<Partial<Record<OfficialSocialPlatform, StoredPlatformState>>> {
    let bytes: Buffer;
    try {
      const details = await stat(this.#path);
      if (!details.isFile() || (details.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && details.uid !== process.getuid())) throw new OAuthSecurityError("SECURE_STORE_INVALID");
      bytes = await readFile(this.#path);
    } catch (error) {
      if (record(error) && error.code === "ENOENT") return {};
      if (error instanceof OAuthSecurityError) throw error;
      throw new OAuthSecurityError("SECURE_STORE_INVALID");
    }
    try {
      const envelope = JSON.parse(bytes.toString("utf8")) as unknown;
      if (!record(envelope) || typeof envelope.iv !== "string" || typeof envelope.tag !== "string" || typeof envelope.ciphertext !== "string") throw new Error("invalid");
      const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
      const value = JSON.parse(plaintext.toString("utf8")) as unknown;
      if (!record(value)) throw new Error("invalid");
      return value;
    } catch {
      throw new OAuthSecurityError("SECURE_STORE_INVALID");
    }
  }

  async #saveAll(value: Partial<Record<OfficialSocialPlatform, StoredPlatformState>>): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const envelope = JSON.stringify({ ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), version: 1 });
    await mkdir(dirname(this.#path), { mode: 0o700, recursive: true });
    await chmod(dirname(this.#path), 0o700);
    const temporary = `${this.#path}.${process.pid.toString()}.${randomBytes(12).toString("hex")}.tmp`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(envelope, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await chmod(temporary, 0o600);
      await rename(temporary, this.#path);
      await chmod(this.#path, 0o600);
    } catch (error) {
      try { await unlink(temporary); }
      catch (cleanupError) { if (!record(cleanupError) || cleanupError.code !== "ENOENT") throw cleanupError; }
      throw error;
    }
  }
}

const oauthStoreMutationTails = new Map<string, Promise<void>>();

async function withOAuthStoreMutationLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const predecessor = oauthStoreMutationTails.get(path) ?? Promise.resolve();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const tail = predecessor.catch(() => undefined).then(() => gate);
  oauthStoreMutationTails.set(path, tail);
  await predecessor.catch(() => undefined);
  try { return await operation(); }
  finally {
    release();
    if (oauthStoreMutationTails.get(path) === tail) oauthStoreMutationTails.delete(path);
  }
}

export class MediaDeliveryBoundary {
  public evaluate(input: {
    readonly domainVerified?: boolean;
    readonly expiresAt?: string;
    readonly localPath?: string;
    readonly now: Date;
    readonly revoked?: boolean;
    readonly signedUrl?: string;
  }): { readonly blocker?: "DOMAIN_VERIFICATION_REQUIRED" | "HTTPS_STORAGE_REQUIRED"; readonly state: MediaDeliveryState } {
    if (input.revoked === true) return { state: "REVOKED" };
    if (input.signedUrl === undefined) {
      return input.localPath === undefined
        ? { blocker: "HTTPS_STORAGE_REQUIRED", state: "HTTPS_STORAGE_REQUIRED" }
        : { blocker: "HTTPS_STORAGE_REQUIRED", state: "LOCAL_ONLY" };
    }
    let url: URL;
    try { url = new URL(input.signedUrl); }
    catch { return { blocker: "HTTPS_STORAGE_REQUIRED", state: "HTTPS_STORAGE_REQUIRED" }; }
    if (url.protocol !== "https:") return { blocker: "HTTPS_STORAGE_REQUIRED", state: "HTTPS_STORAGE_REQUIRED" };
    if (input.expiresAt === undefined || Date.parse(input.expiresAt) <= input.now.getTime()) return { state: "EXPIRED" };
    if (input.domainVerified !== true) return { blocker: "DOMAIN_VERIFICATION_REQUIRED", state: "DOMAIN_VERIFICATION_REQUIRED" };
    return { state: "READY" };
  }
}

export function createOAuthPendingSession(input: {
  readonly authorizationRequestId: string;
  readonly codeVerifier?: string;
  readonly now: Date;
  readonly redirectUri: string;
  readonly state: string;
}): OAuthPendingSession {
  return {
    authorizationRequestId: input.authorizationRequestId,
    ...(input.codeVerifier === undefined ? {} : { codeVerifier: input.codeVerifier }),
    createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + 10 * 60 * 1_000).toISOString(),
    redirectUri: input.redirectUri,
    state: input.state,
  };
}

export function generateOAuthState(): string { return randomBytes(32).toString("base64url"); }
export function generatePkceVerifier(): string { return randomBytes(48).toString("base64url"); }
/** TikTok Desktop explicitly requires the hex-encoded SHA-256 challenge. */
export function tiktokPkceChallenge(verifier: string): string { return createHash("sha256").update(verifier).digest("hex"); }
export function redactedIdentifier(value: string): string { return `${fingerprint(value).slice(0, 12)}…`; }
export async function deleteSecureStore(path: string): Promise<void> { try { await unlink(path); } catch (error) { if (!record(error) || error.code !== "ENOENT") throw error; } }

function emptyState(): StoredPlatformState { return { usedAuthorizationCodeFingerprints: [] }; }
function fingerprint(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
