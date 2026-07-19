import { describe, expect, it } from "vitest";

import { TelegramBotApiClient, type TelegramBotApiTransport, type TelegramOperatorConfig } from "../../src/index.js";

const config: TelegramOperatorConfig = { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "MV_AI_OS_TELEGRAM_BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } };
const transport: TelegramBotApiTransport = { request: () => Promise.resolve({ ok: true, result: [] }) };

describe("Telegram Bot API authorization", () => {
  it("normalizes only the exact private user/chat pair", () => {
    const client = new TelegramBotApiClient(config, "token-not-logged", transport);
    expect(client.normalize(message())).toMatchObject({ action: { kind: "START" } });
    expect(client.normalize(message({ chatId: 201 }))).toEqual({ rejection: "UNAUTHORIZED" });
    expect(client.normalize(message({ userId: 101 }))).toEqual({ rejection: "UNAUTHORIZED" });
  });
  it("keeps Workflow creation, content approvals, reports, and callbacks on the exact private command surface", async () => {
    const calls: { readonly method: string; readonly body: Readonly<Record<string, unknown>> }[] = [];
    const client = new TelegramBotApiClient(config, "token-not-logged", { request: ({ method, body }) => { calls.push({ body, method }); return Promise.resolve({ ok: true, result: [] }); } });
    expect(client.normalize(message({ text: "/workflow mission-draft-1" }))).toMatchObject({ action: { kind: "WORKFLOW", payload: "/workflow mission-draft-1" } });
    expect(client.normalize(message({ text: "/report mission-draft-1" }))).toMatchObject({ action: { kind: "REPORT", payload: "/report mission-draft-1" } });
    expect(client.normalize(message({ text: "/workflows" }))).toMatchObject({ action: { kind: "WORKFLOWS" } });
    expect(client.normalize(message({ text: "/productions" }))).toMatchObject({ action: { kind: "CONTENT_QUEUE" } });
    expect(client.normalize(message({ text: "/production mv-content-001" }))).toMatchObject({ action: { kind: "CONTENT_PRODUCTION", payload: "/production mv-content-001" } });
    await client.setCommands();
    expect(JSON.stringify(calls[0]?.body)).toContain("workflow");
    expect(JSON.stringify(calls[0]?.body)).toContain("report");
    expect(JSON.stringify(calls[0]?.body)).toContain("productions");
  });
  it.each([
    { chat: { id: 200, type: "group" } },
    { forward_origin: { type: "user" } },
    { contact: { phone_number: "private" } },
    { photo: [{ file_id: "never-read" }] },
    { business_connection_id: "forbidden" },
  ])("rejects unsupported or private message metadata", (extra) => {
    const client = new TelegramBotApiClient(config, "token-not-logged", transport);
    expect(client.normalize(message(extra))).toEqual({ rejection: "UNSUPPORTED" });
  });
  it("uses only the allowlisted update types and outbound chat", async () => {
    const calls: string[] = [];
    const client = new TelegramBotApiClient(config, "token-not-logged", { request: ({ method, body }) => { calls.push(method); if (method === "getUpdates") expect(body.allowed_updates).toEqual(["message", "callback_query"]); return Promise.resolve({ ok: true, result: [] }); } });
    expect(await client.bootstrap()).toBe("0"); await client.poll("0");
    await expect(client.deliver({ chatId: "201", contractVersion: "1", text: "no" })).rejects.toThrow(/OUTBOUND_DELIVERY_FAILED/u);
    expect(calls).toEqual(["deleteWebhook", "getUpdates"]);
  });
  it("accepts the public risk-review template identifier while rejecting token-shaped output", async () => {
    const client = new TelegramBotApiClient(config, "token-not-logged", transport);
    await expect(client.deliver({ chatId: "200", contractVersion: "1", text: "mv-ai-os-risk-review" })).resolves.toBeUndefined();
    await expect(client.deliver({ chatId: "200", contractVersion: "1", text: "sk-abcdefghijklmnop" })).rejects.toThrow(/OUTBOUND_DELIVERY_FAILED/u);
    await expect(client.deliver({ chatId: "200", contractVersion: "1", text: "sk-abcdefghijk_" })).rejects.toThrow(/OUTBOUND_DELIVERY_FAILED/u);
  });
});

function message(extra: Record<string, unknown> = {}) { const base = { update_id: 1, message: { chat: { id: extra.chatId ?? 200, type: "private" }, from: { id: extra.userId ?? 100, is_bot: false }, message_id: 2, text: "/start" } }; const messageExtra = Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "chatId" && key !== "userId")); return { ...base, message: { ...base.message, ...messageExtra, ...(messageExtra.chat === undefined ? {} : { chat: messageExtra.chat }) } }; }
