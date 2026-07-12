import { readFile } from "node:fs/promises";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import type { Clock } from "../ports/clock.js";
import { createLocalRuntime } from "../runtime/create-local-runtime.js";
import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";
import { LocalRuntimeConfigValidator } from "../runtime/local-runtime-config-validator.js";
import { TelegramBotApiClient, FetchTelegramBotApiTransport, type TelegramBotApiTransport } from "./telegram-bot-api.js";
import { TelegramOperatorConfigValidator, type TelegramOperatorConfig } from "./telegram-contracts.js";
import { ControlledTelegramOperatorConsole } from "./telegram-operator-console.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";

export interface TelegramApplicationConfig { readonly contractVersion: "1"; readonly runtime: LocalRuntimeConfig; readonly telegram: TelegramOperatorConfig; }
export class TelegramApplicationConfigValidator {
  public validate(value: unknown): { readonly ok: true; readonly value: TelegramApplicationConfig } | { readonly ok: false } {
    if (!record(value) || Object.keys(value).sort().join(",") !== "contractVersion,runtime,telegram" || value.contractVersion !== "1") return { ok: false };
    const runtime = new LocalRuntimeConfigValidator().validate(value.runtime); const telegram = new TelegramOperatorConfigValidator().validate(value.telegram);
    return runtime.ok && telegram.ok ? { ok: true, value: freeze({ contractVersion: "1", runtime: runtime.value, telegram: telegram.value }) } : { ok: false };
  }
}
export interface TelegramRuntimeOverrides { readonly clock?: Clock; readonly transport?: TelegramBotApiTransport; readonly secretResolver?: LocalSecretResolver; }
export async function createTelegramOperatorConsole(candidate: unknown, overrides: TelegramRuntimeOverrides = {}): Promise<ControlledTelegramOperatorConsole> {
  const validated = new TelegramApplicationConfigValidator().validate(candidate); if (!validated.ok) throw new Error("Telegram configuration is invalid");
  const clock = overrides.clock ?? new TelegramSystemClock(); const resolver = overrides.secretResolver ?? new LocalSecretResolver({ environment: process.env });
  const resolved = await resolver.resolve(validated.value.telegram.botToken);
  const runtime = await createLocalRuntime(validated.value.runtime);
  try { const state = new TelegramSqliteStateStore(validated.value.runtime.sqlite, clock); const api = new TelegramBotApiClient(validated.value.telegram, resolved.value.value, overrides.transport ?? new FetchTelegramBotApiTransport()); return new ControlledTelegramOperatorConsole({ actorId: validated.value.runtime.actorId, api, clock, config: validated.value.telegram, runtime, state, workspaceId: validated.value.runtime.workspaceId }); }
  catch (error) { await runtime.close(); throw error; }
}
export async function readTelegramApplicationConfig(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")) as unknown; }
class TelegramSystemClock implements Clock { now(): Date { return new Date(); } }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
