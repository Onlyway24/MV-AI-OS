#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import {
  OfficialInstagramConnector,
  OfficialTikTokConnector,
} from "./official-social-connectors.js";
import {
  FetchInstagramConnectorTransport,
  FetchTikTokConnectorTransport,
} from "./official-social-http-transports.js";
import { EncryptedFileOAuthSecureStore } from "./oauth-connector-foundation.js";
import {
  LocalSocialConnectorServer,
  SocialConnectorConfigValidator,
  preflightSocialConnectors,
  type LocalSocialConnectorConfig,
} from "./social-connector-runtime.js";

export async function runSocialConnectorCli(arguments_: readonly string[]): Promise<void> {
  const parsed = parseArguments(arguments_);
  const candidate = JSON.parse(await readFile(parsed.configPath, "utf8")) as unknown;
  const preflight = await preflightSocialConnectors(candidate);
  if (parsed.action === "preflight") {
    process.stdout.write(`${JSON.stringify(preflight)}\n`);
    return;
  }
  if (preflight.status !== "READY") throw new Error("Social connector preflight blocked startup; inspect only the redacted preflight report");
  const config = validConfiguration(candidate);
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
  const server = new LocalSocialConnectorServer({
    initialStatuses: { instagram: await instagram.verify(), tiktok: await tiktok.verify() },
    instagram,
    statusPath: config.statusPath,
    tiktok,
  });
  const started = await server.start();
  process.stdout.write(`Connector social ufficiali: ${started.url}\n`);
  const stop = (): void => { void server.close().finally(() => { process.exitCode = 0; }); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function validConfiguration(candidate: unknown): LocalSocialConnectorConfig {
  const validation = new SocialConnectorConfigValidator().validate(candidate);
  if (!validation.ok) throw new Error(validation.reasonCode);
  return validation.value;
}

function parseArguments(arguments_: readonly string[]): { readonly action: "preflight" | "start"; readonly configPath: string } {
  if (arguments_.length === 2 && arguments_[0] === "--config" && arguments_[1] !== undefined) return { action: "start", configPath: resolve(arguments_[1]) };
  if (arguments_.length === 3 && (arguments_[0] === "preflight" || arguments_[0] === "start") && arguments_[1] === "--config" && arguments_[2] !== undefined) return { action: arguments_[0], configPath: resolve(arguments_[2]) };
  throw new Error("Uso: social-connectors [preflight|start] --config <path>");
}

function isMainModule(): boolean { const entryPath = process.argv[1]; return entryPath !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPath); }
if (isMainModule()) void runSocialConnectorCli(process.argv.slice(2)).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Connector non avviato"}\n`); process.exitCode = 1; });
