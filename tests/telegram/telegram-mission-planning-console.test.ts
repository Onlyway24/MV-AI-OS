import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalRuntime, createTelegramMissionReport, createTelegramOperatorConsole, LocalSecretResolver, serializeTelegramMissionReport, TelegramMissionDraftSessionCoordinator, TelegramMissionPlanningConsole, TelegramSqliteStateStore, type LocalRuntimeConfig, type TelegramBotApiTransport } from "../../src/index.js";
import type { TelegramBotApiRequest } from "../../src/telegram/telegram-bot-api.js";
import { FixedClock } from "../support/fixtures.js";

const clock = new FixedClock("2026-07-12T10:05:00.000Z");
const identity = createHash("sha256").update("100:200", "utf8").digest("hex");

describe("Telegram Mission Planning Console", () => {
  it("activates /mission through real Telegram application composition with an injected offline transport", async () => withDatabase(async (path) => {
    const transport = new FakeTelegramTransport([message(1, "/mission")]);
    const app = await createTelegramOperatorConsole({ contractVersion: "1", runtime: config(path), telegram: { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 3_600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } } }, { clock, secretResolver: new LocalSecretResolver({ environment: { BOT_TOKEN: "test-token" } }), transport });
    await app.bootstrap(); await app.pollOnce();
    expect(transport.calls.some((request) => request.method === "sendMessage" && String(request.body.text).includes("Missione — obiettivo"))).toBe(true);
    expect(transport.calls.some((request) => request.method === "setMyCommands" && JSON.stringify(request.body).includes("mission"))).toBe(true);
    await app.close();
  }));

  it("routes the private Workflow guide through the real Telegram composition without creating a Workflow", async () => withDatabase(async (path) => {
    const transport = new FakeTelegramTransport([message(1, "/workflows"), message(2, "/workflow unknown-mission")]);
    const app = await createTelegramOperatorConsole({ contractVersion: "1", runtime: config(path), telegram: { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 3_600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } } }, { clock, secretResolver: new LocalSecretResolver({ environment: { BOT_TOKEN: "test-token" } }), transport });
    await app.bootstrap(); await app.pollOnce();
    const delivered = transport.calls.filter((request) => request.method === "sendMessage").map((request) => String(request.body.text));
    expect(delivered.some((text) => text.includes("Workflow Operator"))).toBe(true);
    expect(delivered.some((text) => text.includes("Nessun Workflow è stato creato"))).toBe(true);
    await app.close();
  }));

  it("supports back, cancellation with minimization, and explicit restart", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const console = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock, coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    await console.handle(identity, "1", "/mission");
    await console.handle(identity, "2", '{"statement":"Obiettivo riservato.","purpose":"Scopo.","desiredOutcome":"Esito.","businessValues":["reduce_risk"]}');
    expect((await console.handle(identity, "3", "indietro")).text).toContain("Tornato al campo precedente");
    expect(console.cancel(identity, "4").text).toContain("annullata");
    const session = state.getSession(identity); expect(session).toBeDefined();
    expect(state.getMissionDraft(session?.sessionId ?? "")).toMatchObject({ assumptions: [], constraints: [], status: "CANCELLED" });
    expect((await console.handle(identity, "5", "/mission restart")).text).toContain("Nuova Missione avviata");
    await runtime.close(); await state.close();
  }));

  it("shows explicit versioned quick-start templates without material hidden defaults", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const console = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock, coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    expect((await console.handle(identity, "1", "/mission quick")).text).toContain("metodo-veloce-content-plan@1.0.0");
    expect((await console.handle(identity, "2", "/mission template metodo-veloce-content-plan details")).text).toContain("Non è un valore predefinito nascosto");
    const applied = await console.handle(identity, "3", "/mission template metodo-veloce-content-plan");
    expect(applied.text).toContain("Nessun valore materiale è stato inserito");
    const draft = state.getMissionDraft(state.getSession(identity)?.sessionId ?? "");
    expect(draft).toMatchObject({ missionType: "content_strategy", profileSelection: { brandProfileId: "metodo-veloce@1.0.0" } });
    expect(draft?.objective).toBeUndefined();
    await runtime.close(); await state.close();
  }));

  it("runs the complete two-confirmation Mission planning slice and replays the durable result", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const console = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock, coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    await console.handle(identity, "1", "/mission");
    await console.handle(identity, "2", '{"statement":"Preparare una proposta commerciale.","purpose":"Generare domanda qualificata.","desiredOutcome":"Una proposta pronta per la revisione.","businessValues":["help_fabio_make_money"]}');
    await console.handle(identity, "3", "business_opportunity");
    await console.handle(identity, "4", '{"description":"Titolari di PMI","market":"Italia","segments":["PMI"]}');
    await console.handle(identity, "5", '[{"deliverableId":"offer-1","title":"Proposta","description":"Proposta commerciale","format":"markdown","acceptanceCriteria":["Chiara"]}]');
    await console.handle(identity, "6", '{"status":"unknown","timezone":"Europe/Rome"}');
    await console.handle(identity, "7", '{"status":"unknown"}');
    await console.handle(identity, "8", '[{"metricId":"metric-1","measurement":"risposte","target":"10","evidenceRequired":"registro"}]');
    await console.handle(identity, "9", '[{"factId":"fact-1","statement":"Il pubblico richiede chiarezza."}]');
    const review = await console.handle(identity, "10", '{"founderProfileId":"only-way-founder-preferences@1.0.0","founderProfileVersion":"1.0.0","brandProfileId":"metodo-veloce@1.0.0","brandProfileVersion":"1.0.0"}');
    expect(review.buttons?.[0]?.text).toBe("Conferma dati Missione");
    const confirmed = await console.handleCallback(identity, review.buttons?.[0]?.callbackData ?? "");
    expect(confirmed.text).toContain("Dati Missione confermati");
    expect(confirmed.buttons?.[0]?.text).toBe("Genera piano Missione");
    const planned = await console.handleCallback(identity, confirmed.buttons?.[0]?.callbackData ?? "");
    expect(planned.text).toContain("Mission status:");
    expect(planned.text).toContain("Quality Gate:");
    expect(planned.text).toContain("Nessun Workflow è stato creato e nessuna azione esterna è stata eseguita.");
    const result = state.readMissionResult("mission-draft-1");
    expect(result).toBeDefined();
    if (result === undefined) throw new Error("Mission result was not persisted");
    const exported = serializeTelegramMissionReport(createTelegramMissionReport(result.draft, result.response), "json");
    expect(exported).toContain('"contractVersion": "1"');
    expect(exported).not.toMatch(/telegram|identity|callback|token|database|transcript/iu);
    await expect(console.handleCallback(identity, confirmed.buttons?.[0]?.callbackData ?? "")).rejects.toThrow(/consumed|stale/iu);
    const reopened = await console.handle(identity, "11", "/mission");
    expect(reopened.text).toContain("Mission status:");
    await runtime.close(); await state.close();
  }));
});

function config(path: string): LocalRuntimeConfig { return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }; }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-planning-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
function message(updateId: number, text: string): unknown { return { update_id: updateId, message: { chat: { id: 200, type: "private" }, from: { id: 100, is_bot: false }, message_id: updateId, text } }; }
class FakeTelegramTransport implements TelegramBotApiTransport {
  public readonly calls: TelegramBotApiRequest[] = [];
  public constructor(private readonly updates: unknown[]) {}
  public request(request: TelegramBotApiRequest): Promise<unknown> { this.calls.push(request); if (request.method === "getMe") return Promise.resolve({ ok: true, result: { id: 1, is_bot: true } }); if (request.method === "getUpdates") return Promise.resolve({ ok: true, result: Number(request.body.offset) === -1 ? [] : this.updates.splice(0) }); return Promise.resolve({ ok: true, result: true }); }
}
