import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
import type { TelegramOutboundMessageIntent } from "../../src/telegram/telegram-contracts.js";
import type { TelegramPollingConsole } from "../../src/telegram/telegram-operator-lifecycle.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
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

  it("recovers a stale PID owner while preserving active-owner exclusion", async () => withDatabase(async (path) => {
    const lockPath = `${path}.telegram-operator.lock`;
    await writeFile(lockPath, `${JSON.stringify({ contractVersion: "1", createdAt: "2026-07-01T00:00:00.000Z", instanceId: "telegram-stale", pid: 2_147_483_647, role: "telegram", token: "lock-stale-owner" })}\n`, { encoding: "utf8", mode: 0o600 });

    const recovered = await TelegramOperatorProcessLock.acquire(path);
    const record = JSON.parse(await readFile(lockPath, "utf8")) as { readonly pid: number; readonly role: string; readonly token: string };
    expect(record).toMatchObject({ pid: process.pid, role: "telegram" });
    expect(record.token).not.toBe("lock-stale-owner");
    await expect(TelegramOperatorProcessLock.acquire(path)).rejects.toMatchObject({ code: "OPERATOR_LOCK_HELD" });
    await recovered.close();
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
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
  it("processes pending updates from offset zero on first boot instead of discarding them", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(7, "/status")]);
    const console = await application(path, transport);
    await console.bootstrap();
    await console.pollOnce();
    await console.close();

    const pollingCalls = transport.calls.filter(({ method }) => method === "getUpdates");
    expect(pollingCalls).toHaveLength(1);
    expect(pollingCalls[0]?.body.offset).toBe(0);
    expect(transport.calls.filter(({ method }) => method === "sendMessage")).toHaveLength(1);

    const verifier = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(verifier.receiptState("7")).toBe("COMPLETED");
      expect(verifier.offset()?.offset).toBe("8");
    } finally { await verifier.close(); }
  }));

  it("reprocesses a durably claimed update after a crash and advances only with its terminal receipt", async () => withDatabase(async (path) => {
    const crashState = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    const api = new TelegramBotApiClient(telegramConfig(), "test-token", new ScriptedTransport());
    const action = api.normalize(message(1, "/status")).action;
    if (action === undefined) throw new Error("Expected a normalized test action");
    crashState.saveOffset("1");
    expect(crashState.claim(action, telegramConfig().polling.updateReceiptRetentionSeconds)).toBe("CLAIMED");
    expect(crashState.receiptState("1")).toBe("RECEIVED");
    expect(crashState.offset()?.offset).toBe("1");
    await crashState.close();

    const restartedTransport = new ScriptedTransport([message(1, "/status")]);
    const restartedConsole = await application(path, restartedTransport);
    await restartedConsole.bootstrap();
    await restartedConsole.pollOnce();
    expect(restartedTransport.calls.filter(({ method }) => method === "sendMessage")).toHaveLength(1);
    await restartedConsole.close();

    const verifier = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(verifier.receiptState("1")).toBe("COMPLETED");
      expect(verifier.offset()?.offset).toBe("2");
    } finally { await verifier.close(); }
  }));

  it("never redelivers after send succeeds but durable finalization crashes", async () => withDatabase(async (path) => {
    const firstTransport = new ScriptedTransport([message(1, "/status")]);
    const runtime = await createLocalRuntime(runtimeConfig(path), { clock: new FixedClock() });
    const state = new CrashAfterDeliveryStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    const firstConsole = new ControlledTelegramOperatorConsole({
      actorId: "actor-local",
      api: new TelegramBotApiClient(telegramConfig(), "test-token", firstTransport),
      clock: new FixedClock(),
      config: telegramConfig(),
      missionDrafts: new TelegramMissionDraftSessionCoordinator(state),
      runtime,
      state,
      workspaceId: "workspace-local",
    });
    await firstConsole.bootstrap();
    await expect(firstConsole.pollOnce()).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    expect(firstTransport.calls.filter(({ method }) => method === "sendMessage")).toHaveLength(1);
    await firstConsole.close();

    const afterCrash = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(afterCrash.receiptState("1")).toBe("DELIVERY_UNCERTAIN");
      expect(afterCrash.deliveryState("1")).toBe("UNCERTAIN");
      expect(afterCrash.offset()?.offset).toBe("0");
    } finally { await afterCrash.close(); }

    const restartedTransport = new ScriptedTransport([message(1, "/status")]);
    const restartedConsole = await application(path, restartedTransport);
    await restartedConsole.bootstrap();
    await expect(restartedConsole.pollOnce()).rejects.toMatchObject({ code: "DELIVERY_RECONCILIATION_REQUIRED" });
    expect(restartedTransport.calls.filter(({ method }) => method === "sendMessage")).toHaveLength(0);
    await restartedConsole.close();

    const reconciled = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(reconciled.receiptState("1")).toBe("DELIVERY_UNCERTAIN");
      expect(reconciled.deliveryState("1")).toBe("UNCERTAIN");
      expect(reconciled.offset()?.offset).toBe("2");
    } finally { await reconciled.close(); }
  }));

  it("migrates v29 receipts with an outbound intent to delivery-uncertain without losing their binding", async () => withDatabase(async (path) => {
    const current = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    await current.close();

    const legacy = new DatabaseSync(path);
    legacy.exec(`
      DROP TABLE reference_vault_audit_events;
      DROP TABLE reference_vault_command_receipts;
      DROP TABLE reference_vault_records;
      DROP TABLE reference_vault_blobs;
      DROP TABLE venture_audit_events;
      DROP TABLE venture_command_receipts;
      DROP TABLE venture_events;
      DROP TABLE venture_records;
      DROP TABLE venture_runtime_controls;
      DROP INDEX telegram_inbound_receipts_expiry;
      DROP INDEX telegram_outbound_deliveries_update;
      ALTER TABLE telegram_inbound_receipts RENAME TO telegram_inbound_receipts_v30;
      CREATE TABLE telegram_inbound_receipts (
        update_id TEXT PRIMARY KEY,
        action_fingerprint TEXT NOT NULL,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        processing_state TEXT NOT NULL CHECK (processing_state IN ('RECEIVED', 'COMPLETED', 'REJECTED')),
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        command_id TEXT
      ) STRICT;
      DROP TABLE telegram_inbound_receipts_v30;
      CREATE INDEX telegram_inbound_receipts_expiry ON telegram_inbound_receipts (expires_at, update_id);
    `);
    legacy.prepare("INSERT INTO telegram_inbound_receipts (update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id) VALUES (?, ?, ?, 'STATUS', 'RECEIVED', ?, ?, NULL)")
      .run("29", "a".repeat(64), "b".repeat(64), "2026-07-02T10:00:00.000Z", "2026-07-02T11:00:00.000Z");
    legacy.prepare("INSERT INTO telegram_outbound_deliveries (delivery_id, update_id, state, occurred_at) VALUES (?, ?, 'UNCERTAIN', ?)")
      .run("delivery-v29-reconciliation", "29", "2026-07-02T10:00:00.000Z");
    legacy.exec("DELETE FROM schema_migrations WHERE version IN (30, 31, 32); PRAGMA user_version = 29;");
    legacy.close();

    const migrated = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(migrated.receiptState("29")).toBe("DELIVERY_UNCERTAIN");
      expect(migrated.deliveryState("29")).toBe("UNCERTAIN");
    } finally { await migrated.close(); }
  }));

  it("composes /daily_brief with durable SQLite state and replays it after runtime restart", async () => withDatabase(async (path) => {
    const firstTransport = new ScriptedTransport([message(1, "/daily_brief")]);
    const firstConsole = await application(path, firstTransport);
    await firstConsole.bootstrap();
    await firstConsole.pollOnce();
    await firstConsole.close();
    const firstMessage = firstTransport.calls.find((entry) => entry.method === "sendMessage");
    expect(firstMessage?.body.text).toContain("Daily Operating Brief — 2026-07-02");
    expect(firstMessage?.body.text).toContain("INTERNAL_ONLY");

    const restartedTransport = new ScriptedTransport([message(2, "/daily_brief")]);
    const restartedConsole = await application(path, restartedTransport);
    await restartedConsole.bootstrap();
    await restartedConsole.pollOnce();
    await restartedConsole.close();
    expect(restartedTransport.calls.find((entry) => entry.method === "sendMessage")?.body.text).toBe(firstMessage?.body.text);

    const verifier = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const durable = await verifier.transaction(async ({ dailyOperatingBriefs, operationalEvents }) => ({
      briefs: await dailyOperatingBriefs.listByWorkspaceId("workspace-local", 10),
      events: await operationalEvents.listAfter("workspace-local", 0, 10),
    }));
    expect(durable.briefs).toHaveLength(1);
    expect(durable.events.filter(({ eventType }) => eventType === "DAILY_BRIEF_GENERATED")).toHaveLength(1);
    await verifier.close();
  }));

  it("advances past an ambiguous delivery without processing later updates or retrying it", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(1, "/mission quick"), message(2, "/status")]);
    transport.failNextDelivery = true;
    const console = await application(path, transport);
    await console.bootstrap();
    await expect(console.pollOnce()).rejects.toMatchObject({ code: "DELIVERY_RECONCILIATION_REQUIRED" });

    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(state.offset()?.offset).toBe("2");
      expect(state.receiptState("1")).toBe("DELIVERY_UNCERTAIN");
      expect(state.deliveryState("1")).toBe("UNCERTAIN");
      expect(state.receiptState("2")).toBeUndefined();
    } finally { await state.close(); }
    expect(transport.calls.filter((entry) => entry.method === "sendMessage")).toHaveLength(1);
    await console.close();

    const restartedTransport = new ScriptedTransport([message(2, "/status")]);
    const restartedConsole = await application(path, restartedTransport);
    await restartedConsole.bootstrap();
    await restartedConsole.pollOnce();
    await restartedConsole.close();
    expect(restartedTransport.calls.filter((entry) => entry.method === "sendMessage")).toHaveLength(1);

    const restartedState = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock());
    try {
      expect(restartedState.offset()?.offset).toBe("3");
      expect(restartedState.receiptState("1")).toBe("DELIVERY_UNCERTAIN");
      expect(restartedState.receiptState("2")).toBe("COMPLETED");
    } finally { await restartedState.close(); }
  }));

  it("does not leak the process lock when an ambiguous delivery stops the lifecycle", async () => withDatabase(async (path) => {
    const transport = new ScriptedTransport([message(1, "/mission quick"), message(2, "/status")]);
    transport.failNextDelivery = true;
    const console = await application(path, transport);
    await expect(new TelegramOperatorLifecycle(console, { stopping: () => transport.pollRequests >= 1 }).run()).rejects.toMatchObject({ code: "DELIVERY_RECONCILIATION_REQUIRED" });
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
  public override validateDeliveryIntent(intent: TelegramOutboundMessageIntent): TelegramOutboundMessageIntent {
    if (this.#invalid) {
      this.#invalid = false;
      return super.validateDeliveryIntent({ ...intent, text: "token" });
    }
    return super.validateDeliveryIntent(intent);
  }
}

class CrashAfterDeliveryStateStore extends TelegramSqliteStateStore {
  #crash = true;
  public override completeDeliveryAndAdvanceOffset(updateId: string, deliveryId: string, offset: string, processingState: "COMPLETED" | "REJECTED", commandId?: string): void {
    if (this.#crash) {
      this.#crash = false;
      throw new Error("simulated durable finalization crash");
    }
    super.completeDeliveryAndAdvanceOffset(updateId, deliveryId, offset, processingState, commandId);
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
