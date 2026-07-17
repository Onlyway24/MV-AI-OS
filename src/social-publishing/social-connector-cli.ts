#!/usr/bin/env node

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import type { LocalFileSecretReference } from "../config/secret-reference.js";
import {
  OfficialInstagramConnector,
  OfficialTikTokConnector,
  type InstagramConnectorStatus,
  type TikTokConnectorStatus,
} from "./official-social-connectors.js";
import {
  FetchInstagramConnectorTransport,
  FetchTikTokConnectorTransport,
} from "./official-social-http-transports.js";
import {
  EncryptedFileOAuthSecureStore,
  SOCIAL_CONNECTOR_LOCAL_PORT,
} from "./oauth-connector-foundation.js";
import { SocialExternalActionPlane, type SocialExternalActionOperation } from "./social-external-action-plane.js";

interface LocalConnectorConfig {
  readonly instagram: { readonly clientId: LocalFileSecretReference; readonly clientSecret: LocalFileSecretReference };
  readonly oauthVault: { readonly encryptionKey: LocalFileSecretReference; readonly path: string };
  readonly repositoryRoot: string;
  readonly statusPath: string;
  readonly tiktok: { readonly clientId: LocalFileSecretReference; readonly clientSecret: LocalFileSecretReference };
}

export async function runSocialConnectorCli(arguments_: readonly string[]): Promise<void> {
  const configPath = parseArguments(arguments_);
  const config = parseConfig(JSON.parse(await readFile(configPath, "utf8")) as unknown);
  const resolver = new LocalSecretResolver();
  const [instagramId, instagramSecret, tiktokId, tiktokSecret, vaultKey] = await Promise.all([
    resolver.resolve(config.instagram.clientId),
    resolver.resolve(config.instagram.clientSecret),
    resolver.resolve(config.tiktok.clientId),
    resolver.resolve(config.tiktok.clientSecret),
    resolver.resolve(config.oauthVault.encryptionKey),
  ]);
  const store = new EncryptedFileOAuthSecureStore({ encryptionKey: vaultKey.value, path: config.oauthVault.path, repositoryRoot: config.repositoryRoot });
  const instagram = new OfficialInstagramConnector({ clientId: instagramId.value.value, store, transport: new FetchInstagramConnectorTransport({ clientId: instagramId.value.value, clientSecret: instagramSecret.value.value }) });
  const tiktok = new OfficialTikTokConnector({ clientId: tiktokId.value.value, store, transport: new FetchTikTokConnectorTransport({ clientId: tiktokId.value.value, clientSecret: tiktokSecret.value.value }) });
  const plane = new SocialExternalActionPlane();
  const csrf = randomBytes(32).toString("hex");
  let statuses = { instagram: await instagram.verify(), tiktok: await tiktok.verify() };
  await persistStatus(config.statusPath, statuses);

  const server = createServer((request, response) => {
    void handle(request, response).catch(() => { send(response, 400, "Operazione OAuth bloccata in sicurezza"); });
  });
  await new Promise<void>((resolve_, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: SOCIAL_CONNECTOR_LOCAL_PORT }, () => { server.off("error", reject); resolve_(); });
  });
  process.stdout.write(`Connector social ufficiali: http://127.0.0.1:${String(SOCIAL_CONNECTOR_LOCAL_PORT)}/\n`);

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.host !== `127.0.0.1:${String(SOCIAL_CONNECTOR_LOCAL_PORT)}`) { send(response, 400, "Host locale non valido"); return; }
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${String(SOCIAL_CONNECTOR_LOCAL_PORT)}`);
    if (request.method === "GET" && url.pathname === "/") { sendHtml(response, page(statuses, csrf)); return; }
    if (request.method === "GET" && url.pathname === "/api/status") { sendJson(response, statuses); return; }
    if (request.method === "GET" && url.pathname === "/oauth/instagram/start") {
      authorize(plane, "OAUTH_START");
      redirect(response, await instagram.authorizationUrl()); return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/tiktok/start") {
      authorize(plane, "OAUTH_START");
      redirect(response, await tiktok.authorizationUrl()); return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/instagram/callback") {
      authorize(plane, "OAUTH_CALLBACK");
      statuses = { ...statuses, instagram: await instagram.callback({ authorizationCode: required(url.searchParams.get("code")), callbackUrl: url.toString(), state: required(url.searchParams.get("state")) }) };
      await persistStatus(config.statusPath, statuses);
      redirect(response, "/"); return;
    }
    if (request.method === "GET" && url.pathname === "/oauth/tiktok/callback/") {
      authorize(plane, "OAUTH_CALLBACK");
      statuses = { ...statuses, tiktok: await tiktok.callback({ authorizationCode: required(url.searchParams.get("code")), callbackUrl: url.toString(), state: required(url.searchParams.get("state")) }) };
      await persistStatus(config.statusPath, statuses);
      redirect(response, "/"); return;
    }
    if (request.method === "POST" && safeEqual(csrf, url.searchParams.get("csrf") ?? "")) {
      if (url.pathname === "/instagram/verify") { authorize(plane, "IDENTITY_READ"); statuses = { ...statuses, instagram: await instagram.verify() }; }
      else if (url.pathname === "/instagram/disconnect") { authorize(plane, "DISCONNECT"); statuses = { ...statuses, instagram: await instagram.disconnect() }; }
      else if (url.pathname === "/tiktok/verify") { authorize(plane, "IDENTITY_READ"); statuses = { ...statuses, tiktok: await tiktok.verify() }; }
      else if (url.pathname === "/tiktok/disconnect") { authorize(plane, "DISCONNECT"); statuses = { ...statuses, tiktok: await tiktok.disconnect() }; }
      else { send(response, 404, "Operazione non disponibile"); return; }
      await persistStatus(config.statusPath, statuses);
      redirect(response, "/"); return;
    }
    send(response, 404, "Risorsa non trovata");
  }
}

function page(statuses: { readonly instagram: InstagramConnectorStatus; readonly tiktok: TikTokConnectorStatus }, csrf: string): string {
  const card = (platform: "instagram" | "tiktok", label: string, state: string, account: string): string => `
    <section><h2>${label}</h2><p class="account">${account}</p><p class="state">${state}</p>
    <a class="button" href="/oauth/${platform}/start">Connetti / Riconnetti</a>
    <form method="post" action="/${platform}/verify?csrf=${csrf}"><button>Verifica stato</button></form>
    <form method="post" action="/${platform}/disconnect?csrf=${csrf}"><button class="secondary">Disconnetti</button></form>
    <p class="lock">PUBBLICAZIONE LOCKED</p></section>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Onlyway Social Operator</title><style>body{margin:0;background:#090b0e;color:#f8f8f6;font:16px Arial,sans-serif}main{max-width:920px;margin:0 auto;padding:48px 20px}h1{font-size:42px;margin-bottom:8px}header p{color:#ffcf00}section{background:#14171c;border:1px solid #2d323a;border-radius:20px;padding:28px;margin:24px 0}.account{font-weight:700}.state{color:#ffcf00;font-family:monospace}.button,button{display:inline-block;background:#ffcf00;color:#08090b;border:0;border-radius:999px;padding:13px 20px;margin:6px 8px 6px 0;font-weight:700;text-decoration:none;cursor:pointer}.secondary{background:#2c3138;color:#fff}form{display:inline}.lock{margin-top:20px;color:#aeb5bf;font-size:13px;letter-spacing:.12em}@media(max-width:390px){main{padding:24px 14px}h1{font-size:31px}section{padding:20px}.button,button{width:100%;box-sizing:border-box;margin:6px 0}}</style></head><body><main><header><h1>Onlyway Social Operator</h1><p>Connessione ufficiale in sola lettura • nessun pulsante Pubblica</p></header>${card("instagram", "Instagram", statuses.instagram.state, statuses.instagram.username ?? statuses.instagram.expectedAccount)}${card("tiktok", "TikTok", statuses.tiktok.state, statuses.tiktok.username ?? statuses.tiktok.expectedAccount)}</main></body></html>`;
}

async function persistStatus(path: string, statuses: { readonly instagram: InstagramConnectorStatus; readonly tiktok: TikTokConnectorStatus }): Promise<void> {
  const value = {
    contractVersion: "1",
    externalEffects: { instagramPosts: 0, messages: 0, tiktokPosts: 0 },
    instagram: statuses.instagram,
    publication: "LOCKED",
    tiktok: statuses.tiktok,
  };
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function parseArguments(arguments_: readonly string[]): string {
  if (arguments_.length !== 2 || arguments_[0] !== "--config" || arguments_[1] === undefined) throw new Error("Uso: social-connectors --config <path>");
  return resolve(arguments_[1]);
}
function parseConfig(value: unknown): LocalConnectorConfig {
  if (!record(value) || !record(value.instagram) || !record(value.tiktok) || !record(value.oauthVault) || typeof value.repositoryRoot !== "string" || typeof value.statusPath !== "string") throw new Error("Configurazione connector non valida");
  const instagramId = reference(value.instagram.clientId);
  const instagramSecret = reference(value.instagram.clientSecret);
  const tiktokId = reference(value.tiktok.clientId);
  const tiktokSecret = reference(value.tiktok.clientSecret);
  const encryptionKey = reference(value.oauthVault.encryptionKey);
  if (instagramId === undefined || instagramSecret === undefined || tiktokId === undefined || tiktokSecret === undefined || encryptionKey === undefined || typeof value.oauthVault.path !== "string") throw new Error("Riferimenti secret connector non validi");
  return { instagram: { clientId: instagramId, clientSecret: instagramSecret }, oauthVault: { encryptionKey, path: value.oauthVault.path }, repositoryRoot: value.repositoryRoot, statusPath: value.statusPath, tiktok: { clientId: tiktokId, clientSecret: tiktokSecret } };
}
function reference(value: unknown): LocalFileSecretReference | undefined {
  if (!record(value) || value.contractVersion !== "1" || value.source !== "local-file" || value.encoding !== "utf8" || typeof value.path !== "string" || typeof value.secretId !== "string") return undefined;
  return { contractVersion: "1", encoding: "utf8", path: value.path, secretId: value.secretId, source: "local-file" };
}
function authorize(plane: SocialExternalActionPlane, operation: SocialExternalActionOperation): void { plane.authorize({ operation, operationId: `${operation}:${randomUUID()}` }); }
function required(value: string | null): string { if (value === null || value.length === 0) throw new Error("Callback OAuth incompleto"); return value; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function send(response: ServerResponse, status: number, body: string): void { response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }); response.end(body); }
function sendHtml(response: ServerResponse, body: string): void { response.writeHead(200, { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); response.end(body); }
function sendJson(response: ServerResponse, value: unknown): void { response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" }); response.end(JSON.stringify(value)); }
function redirect(response: ServerResponse, location: string): void { response.writeHead(303, { "Cache-Control": "no-store", Location: location, "Referrer-Policy": "no-referrer" }); response.end(); }

function isMainModule(): boolean { const entryPath = process.argv[1]; return entryPath !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPath); }
if (isMainModule()) void runSocialConnectorCli(process.argv.slice(2)).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Connector non avviato"}\n`); process.exitCode = 1; });
