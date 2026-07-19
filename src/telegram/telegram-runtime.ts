import { access, chmod, open, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { LocalSecretResolver } from "../config/local-secret-resolver.js";
import { DailyOperatingBriefService } from "../daily-brief/daily-operating-brief-service.js";
import { RepositoryBackedDailyOperatingBriefSource } from "../daily-brief/repository-backed-daily-operating-brief-source.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import type { Clock } from "../ports/clock.js";
import { createLocalRuntime } from "../runtime/create-local-runtime.js";
import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";
import { LocalRuntimeConfigValidator } from "../runtime/local-runtime-config-validator.js";
import { TelegramBotApiClient, FetchTelegramBotApiTransport, type TelegramBotApiTransport } from "./telegram-bot-api.js";
import { TelegramOperatorConfigValidator, type TelegramOperatorConfig } from "./telegram-contracts.js";
import { ControlledTelegramOperatorConsole } from "./telegram-operator-console.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";
import { TelegramMissionDraftSessionCoordinator } from "./telegram-mission-draft-session-coordinator.js";
import { TelegramOperatorProcessLock } from "./telegram-operator-lock.js";
import { TelegramOperatorError } from "./telegram-operator-errors.js";
import { TelegramDailyBriefConsole } from "./telegram-daily-brief-console.js";

export interface TelegramApplicationConfig { readonly contractVersion: "1"; readonly runtime: LocalRuntimeConfig; readonly telegram: TelegramOperatorConfig; }
export class TelegramApplicationConfigValidator {
  public validate(value: unknown): { readonly ok: true; readonly value: TelegramApplicationConfig } | { readonly ok: false } {
    if (!record(value) || Object.keys(value).sort().join(",") !== "contractVersion,runtime,telegram" || value.contractVersion !== "1") return { ok: false };
    const runtime = new LocalRuntimeConfigValidator().validate(value.runtime); const telegram = new TelegramOperatorConfigValidator().validate(value.telegram);
    return runtime.ok && telegram.ok ? { ok: true, value: freeze({ contractVersion: "1", runtime: runtime.value, telegram: telegram.value }) } : { ok: false };
  }
}
export interface TelegramRuntimeOverrides { readonly clock?: Clock; readonly transport?: TelegramBotApiTransport; readonly secretResolver?: LocalSecretResolver; }
export interface TelegramOperatorPreflightReport { readonly contractVersion: "1"; readonly checks: readonly "APPLICATION_COMPOSITION_READY"[]; readonly secretReferenceId: string; readonly status: "READY"; }

export async function preflightTelegramOperator(candidate: unknown, overrides: TelegramRuntimeOverrides = {}): Promise<TelegramOperatorPreflightReport> {
  const validated = validConfiguration(candidate);
  const resolver = overrides.secretResolver ?? new LocalSecretResolver({ environment: process.env });
  try { await resolver.resolve(validated.telegram.botToken); }
  catch { throw new TelegramOperatorError("SECRET_REFERENCE_UNAVAILABLE", "CONFIGURATION", false); }
  await preparePrivateDatabasePath(validated.runtime.sqlite.path);
  let runtime: Awaited<ReturnType<typeof createLocalRuntime>> | undefined;
  let state: TelegramSqliteStateStore | undefined;
  try { runtime = await createLocalRuntime(validated.runtime); state = new TelegramSqliteStateStore(validated.runtime.sqlite, overrides.clock ?? new TelegramSystemClock()); await chmod(validated.runtime.sqlite.path, 0o600); }
  catch (error) { if (error instanceof TelegramOperatorError) throw error; throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false); }
  finally { await Promise.allSettled([runtime?.close(), state?.close()]); }
  return Object.freeze({ checks: Object.freeze(["APPLICATION_COMPOSITION_READY" as const]), contractVersion: "1" as const, secretReferenceId: validated.telegram.botToken.secretId, status: "READY" as const });
}
export async function createTelegramOperatorConsole(candidate: unknown, overrides: TelegramRuntimeOverrides = {}): Promise<ControlledTelegramOperatorConsole> {
  const validated = validConfiguration(candidate);
  const clock = overrides.clock ?? new TelegramSystemClock(); const resolver = overrides.secretResolver ?? new LocalSecretResolver({ environment: process.env });
  let resolved: Awaited<ReturnType<LocalSecretResolver["resolve"]>>;
  try { resolved = await resolver.resolve(validated.telegram.botToken); }
  catch { throw new TelegramOperatorError("SECRET_REFERENCE_UNAVAILABLE", "CONFIGURATION", false); }
  await preparePrivateDatabasePath(validated.runtime.sqlite.path);
  const lock = await TelegramOperatorProcessLock.acquire(validated.runtime.sqlite.path);
  let runtime: Awaited<ReturnType<typeof createLocalRuntime>> | undefined;
  let state: TelegramSqliteStateStore | undefined;
  let dailyBriefRepositories: SqliteRepositoryTransactionRunner | undefined;
  try {
    runtime = await createLocalRuntime(validated.runtime);
    state = new TelegramSqliteStateStore(validated.runtime.sqlite, clock);
    dailyBriefRepositories = new SqliteRepositoryTransactionRunner(validated.runtime.sqlite);
    await chmod(validated.runtime.sqlite.path, 0o600);
    const api = new TelegramBotApiClient(validated.telegram, resolved.value.value, overrides.transport ?? new FetchTelegramBotApiTransport());
    const dailyBrief = new TelegramDailyBriefConsole({
      chatId: validated.telegram.allowedChatId,
      clock,
      service: new DailyOperatingBriefService({ actorId: validated.runtime.actorId, clock, repositories: dailyBriefRepositories, source: new RepositoryBackedDailyOperatingBriefSource(), workspaceId: validated.runtime.workspaceId }),
    });
    return new ControlledTelegramOperatorConsole({ actorId: validated.runtime.actorId, api, clock, config: validated.telegram, dailyBrief, dailyBriefResource: dailyBriefRepositories, lock, missionDrafts: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: validated.runtime.workspaceId });
  }
  catch (error) { await Promise.allSettled([runtime?.close(), state?.close(), dailyBriefRepositories?.close(), lock.close()]); if (error instanceof TelegramOperatorError) throw error; throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false); }
}
export async function readTelegramApplicationConfig(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")) as unknown; }
class TelegramSystemClock implements Clock { now(): Date { return new Date(); } }
function validConfiguration(candidate: unknown): TelegramApplicationConfig { const validated = new TelegramApplicationConfigValidator().validate(candidate); if (!validated.ok) throw new TelegramOperatorError("CONFIGURATION_UNAVAILABLE", "CONFIGURATION", false); return validated.value; }
async function preparePrivateDatabasePath(path: string): Promise<void> {
  try { const directory = await stat(dirname(path)); if (!directory.isDirectory() || (directory.mode & 0o077) !== 0) throw new Error("not directory"); await access(dirname(path)); }
  catch { throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false); }
  try { const handle = await open(path, "a", 0o600); await handle.close(); await chmod(path, 0o600); const database = await stat(path); if (!database.isFile() || (database.mode & 0o077) !== 0) throw new Error("unsafe"); }
  catch { throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false); }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
