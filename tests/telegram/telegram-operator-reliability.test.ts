import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ControlledTelegramOperatorConsole,
  createLocalRuntime,
  createTelegramOperatorConsole,
  LocalSecretResolver,
  safeTelegramOperatorDiagnostic,
  TelegramBotApiClient,
  TelegramMissionDraftSessionCoordinator,
  TelegramMissionPlanningConsole,
  TelegramOperatorError,
  TelegramOperatorLifecycle,
  TelegramOperatorProcessLock,
  TelegramSqliteStateStore,
  TELEGRAM_MISSION_TEMPLATE_REGISTRY,
  type LocalRuntimeConfig,
  type TelegramBotApiTransport,
  type TelegramMissionTemplate,
} from "../../src/index.js";
import type { TelegramBotApiRequest } from "../../src/telegram/telegram-bot-api.js";
import type { TelegramPollingConsole } from "../../src/telegram/telegram-operator-lifecycle.js";
import { FixedClock } from "../support/fixtures.js";

const identity = "d0e6e6c1b23da7a181b04b62212a5b2018d9c2b77ebd1c2a1152a4534b1ed8fb";

describe("Telegram operator lifecycle reliability", () => {
  it("closes exactly once after successful startup and a graceful stop", async () => {
    const console = new FakePollingConsole(() => { console.stopped = true; });
    await new TelegramOperatorLifecycle(console).run();
    expect(console.bootstrapCalls).toBe(1);
    expect(console.pollCalls).toBe(1);
    expect(console.closeCalls).toBe(1);
  });

  it("releases the console after bootstrap failure and classifies cleanup failure safely", async () => {
    const bootstrapFailure = new FakePollingConsole(() => undefined, new TelegramOperatorError("TELEGRAM_BOOTSTRAP_FAILED", "BOOTSTRAP", false));
    await expect(new TelegramOperatorLifecycle(bootstrapFailure).run()).rejects.toMatchObject({ code: "TELEGRAM_BOOTSTRAP_FAILED" });
    expect(bootstrapFailure.closeCalls).toBe(1);

    const cleanupFailure = new FakePollingConsole(() => { cleanupFailure.stopped = true; }, undefined, true);
    await expect(new TelegramOperatorLifecycle(cleanupFailure).run()).rejects.toMatchObject({ code: "OPERATOR_SHUTDOWN_FAILED" });
    expect(cleanupFailure.closeCalls).toBe(1);
  });

  it("retries a transient polling failure with bounded deterministic delays, then recovers", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const console = new FakePollingConsole(() => {
      attempts += 1;
      if (attempts === 1) throw new TelegramOperatorError("POLLING_TRANSIENT_FAILURE", "POLLING", true);
      console.stopped = true;
    });
    await new TelegramOperatorLifecycle(console, { delay: (milliseconds) => { delays.push(milliseconds); return Promise.resolve(); } }).run();
    expect(console.pollCalls).toBe(2);
    expect(delays).toEqual([100]);
    expect(console.closeCalls).toBe(1);
  });

  it("caps polling retries without a tight loop and closes after exhaustion", async () => {
    const delays: number[] = [];
    const console = new FakePollingConsole(() => { throw new TelegramOperatorError("POLLING_TRANSIENT_FAILURE", "POLLING", true); });
    await expect(new TelegramOperatorLifecycle(console, { delay: (milliseconds) => { delays.push(milliseconds); return Promise.resolve(); }, maxPollingRetries: 2 }).run()).rejects.toMatchObject({ code: "POLLING_TRANSIENT_FAILURE" });
    expect(console.pollCalls).toBe(3);
    expect(delays).toEqual([100, 250]);
    expect(console.closeCalls).toBe(1);
  });

  it("holds the exclusive lock and removes it on explicit close", async () => withDatabase(async (path) => {
    const lock = await TelegramOperatorProcessLock.acquire(path);
    await expect(TelegramOperatorProcessLock.acquire(path)).rejects.toMatchObject({ code: "OPERATOR_LOCK_HELD" });
    await lock.close();
    await expect(access(`${path}.telegram-operator.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  }));

  it("releases the lock after bootstrap and polling failures", async () => withDatabase(async (path) => {
    const bootstrapTransport = new ScriptedTransport();
    bootstrapTransport.failIdentity = true;
    const bootstrapConsole = await application(path, bootstrapTransport);
    await expect(new TelegramOperatorLifecycle(bootstrapConsole).run()).rejects.toMatchObject({ code: "TELEGRAM_IDENTITY_FAILED" });
    await expect(access(`${path}.telegram-operator.lock`)).rejects.toMatchObject({ code: "ENOENT" });

    const pollingTransport = new ScriptedTransport();
    pollingTransport.failPolling = true;
    const pollingConsole = await application(path, pollingTransport);
    await expect(new TelegramOperatorLifecycle(pollingConsole, { delay: () => Promise.resolve(), maxPollingRetries: 0 }).run()).rejects.toMatchObject({ code: "POLLING_TRANSIENT_FAILURE" });
    await expect(access(`${path}.telegram-operator.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  }));
});

describe("Telegram update isolation and Mission quick", () => {
  it("keeps the offset and later updates when a template-list delivery fails", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(1, "/mission quick"), message(2, "/status")]);
    transport.failNextDelivery = true;
    const console = await application(path, transport);
    await console.bootstrap();
    await console.pollOnce();

    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(state.offset()?.offset).toBe("3");
      expect(state.receiptState("1")).toBe("REJECTED");
      expect(state.receiptState("2")).toBe("COMPLETED");
    } finally { await state.close(); }
    expect(transport.calls.filter((entry) => entry.method === "sendMessage")).toHaveLength(3);
    await console.close();
  }));

  it("does not leak the process lock when a delivery failure is isolated", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(1, "/mission quick"), message(2, "/status")]);
    transport.failNextDelivery = true;
    const console = await application(path, transport);
    await new TelegramOperatorLifecycle(console, { stopping: () => transport.pollRequests >= 1 }).run();
    await expect(access(`${path}.telegram-operator.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  }));

  it("isolates outbound validation failure and processes the next claimed update once", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(1, "/mission quick"), message(2, "/status")]);
    const runtime = await createLocalRuntime(runtimeConfig(path), { clock: new FixedClock() });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    const api = new InvalidFirstDeliveryApi(telegramConfig(), "test-token", transport);
    const console = new ControlledTelegramOperatorConsole({ actorId: "actor-local", api, clock: new FixedClock(), config: telegramConfig(), missionDrafts: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    await console.bootstrap();
    await console.pollOnce();
    expect(state.receiptState("1")).toBe("REJECTED");
    expect(state.receiptState("2")).toBe("COMPLETED");
    expect(transport.calls.filter((entry) => entry.method === "sendMessage")).toHaveLength(2);
    await console.close();
  }));

  it("lists templates after /mission, repeatedly, and after restart without creating a draft", async () => withDatabase(async (path) => {
    const first = new ScriptedTransport([message(1, "/mission"), message(2, "/mission quick"), message(3, "/mission quick")]);
    const firstConsole = await application(path, first);
    await firstConsole.bootstrap();
    await firstConsole.pollOnce();
    await firstConsole.close();
    expect(first.calls.filter((entry) => entry.method === "sendMessage" && String(entry.body.text).includes("template espliciti"))).toHaveLength(2);

    const restarted = new ScriptedTransport([message(4, "/mission quick")]);
    const restartedConsole = await application(path, restarted);
    await restartedConsole.bootstrap();
    await restartedConsole.pollOnce();
    await restartedConsole.close();
    expect(restarted.calls.some((entry) => entry.method === "sendMessage" && String(entry.body.text).includes("Avvio rapido"))).toBe(true);

    const runtime = await createLocalRuntime(runtimeConfig(path), { clock: new FixedClock() });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    const mission = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock: new FixedClock(), coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    await mission.handle(identity, "5", "/mission quick");
    expect(state.getSession(identity)).toBeUndefined();
    await runtime.close(); await state.close();
  }));

  it("fails closed on a corrupted template registry without retaining text or creating a session", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(runtimeConfig(path), { clock: new FixedClock() });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    const corrupt = [{ ...TELEGRAM_MISSION_TEMPLATE_REGISTRY[0], label: "altered" }] as unknown as readonly TelegramMissionTemplate[];
    const mission = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock: new FixedClock(), coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, templates: corrupt, workspaceId: "workspace-local" });
    const response = await mission.handle(identity, "1", "/mission quick");
    expect(response.text).toContain("non integro");
    expect(state.getSession(identity)).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain("/mission quick");
    await runtime.close(); await state.close();
  }));
});

describe("Telegram safe diagnostics", () => {
  it("renders only stable reason metadata even when the underlying failure contains private data", () => {
    const failure = new Error("token https://example.invalid/bot/123 raw update /mission quick cb_private SQL record");
    const normal = safeTelegramOperatorDiagnostic(failure, false);
    const diagnostic = safeTelegramOperatorDiagnostic(failure, true);
    expect(normal).toBe("Telegram operator: INTERNAL_OPERATOR_FAILURE\n");
    for (const value of [normal, diagnostic]) {
      expect(value).not.toMatch(/token|https?:|123|raw update|\/mission|cb_|sql|record|stack/iu);
    }
    expect(diagnostic).toContain("stage: POLLING");
    expect(diagnostic).toContain("retryable: no");
  });
});

class FakePollingConsole implements TelegramPollingConsole {
  public bootstrapCalls = 0;
  public closeCalls = 0;
  public pollCalls = 0;
  public stopped = false;
  public constructor(private readonly poll: () => void, private readonly bootstrapFailure?: Error, private readonly closeFailure = false) {}
  public get isStopped(): boolean { return this.stopped; }
  public bootstrap(): Promise<void> { this.bootstrapCalls += 1; if (this.bootstrapFailure !== undefined) return Promise.reject(this.bootstrapFailure); return Promise.resolve(); }
  public close(): Promise<void> { this.closeCalls += 1; if (this.closeFailure) return Promise.reject(new Error("cleanup")); return Promise.resolve(); }
  public pollOnce(): Promise<void> { this.pollCalls += 1; try { this.poll(); return Promise.resolve(); } catch (error) { return Promise.reject(error instanceof Error ? error : new Error("poll failure")); } }
}

class ScriptedTransport implements TelegramBotApiTransport {
  public readonly calls: TelegramBotApiRequest[] = [];
  public failIdentity = false;
  public failNextDelivery = false;
  public failPolling = false;
  public pollRequests = 0;
  public constructor(private readonly updates: unknown[] = []) {}
  public request(request: TelegramBotApiRequest): Promise<unknown> {
    this.calls.push(request);
    if (request.method === "getMe") return this.failIdentity ? Promise.reject(new Error("identity unavailable")) : Promise.resolve({ ok: true, result: { id: 1, is_bot: true } });
    if (request.method === "getUpdates") {
      if (Number(request.body.offset) === -1) return Promise.resolve({ ok: true, result: [] });
      this.pollRequests += 1;
      if (this.failPolling) return Promise.reject(new Error("temporary network failure"));
      return Promise.resolve({ ok: true, result: this.updates.splice(0) });
    }
    if (request.method === "sendMessage" && this.failNextDelivery) { this.failNextDelivery = false; return Promise.reject(new Error("delivery unavailable")); }
    return Promise.resolve({ ok: true, result: true });
  }
}

class InvalidFirstDeliveryApi extends TelegramBotApiClient {
  #invalid = true;
  public override async deliver(intent: { readonly chatId: string; readonly contractVersion: "1"; readonly text: string }): Promise<void> {
    if (this.#invalid) {
      this.#invalid = false;
      return super.deliver({ ...intent, text: "token" });
    }
    return super.deliver(intent);
  }
}

async function application(path: string, transport: TelegramBotApiTransport): Promise<ControlledTelegramOperatorConsole> {
  return createTelegramOperatorConsole(applicationConfig(path), { clock: new FixedClock(), secretResolver: new LocalSecretResolver({ environment: { BOT_TOKEN: "test-token" } }), transport });
}
function applicationConfig(path: string): unknown { return { contractVersion: "1", runtime: runtimeConfig(path), telegram: telegramConfig() }; }
function runtimeConfig(path: string): LocalRuntimeConfig { return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }; }
function telegramConfig() { return { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1" as const, secretId: "telegram-bot", source: "environment" as const, variableName: "BOT_TOKEN" }, contractVersion: "1" as const, polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 3_600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } }; }
function message(updateId: number, text: string): unknown { return { update_id: updateId, message: { chat: { id: 200, type: "private" }, from: { id: 100, is_bot: false }, message_id: updateId, text } }; }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-reliability-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
