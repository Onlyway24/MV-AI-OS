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
    await client.bootstrap(); await client.poll("0");
    await expect(client.deliver({ chatId: "201", contractVersion: "1", text: "no" })).rejects.toThrow(/unauthorized/iu);
    expect(calls).toEqual(["deleteWebhook", "getUpdates", "getUpdates"]);
  });
});

function message(extra: Record<string, unknown> = {}) { const base = { update_id: 1, message: { chat: { id: extra.chatId ?? 200, type: "private" }, from: { id: extra.userId ?? 100, is_bot: false }, message_id: 2, text: "/start" } }; const messageExtra = Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "chatId" && key !== "userId")); return { ...base, message: { ...base.message, ...messageExtra, ...(messageExtra.chat === undefined ? {} : { chat: messageExtra.chat }) } }; }
