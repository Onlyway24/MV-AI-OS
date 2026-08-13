import { describe, expect, it } from "vitest";

import { TelegramInboundUpdateValidator, TelegramOperatorConfigValidator } from "../../src/index.js";

const config = { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "MV_AI_OS_TELEGRAM_BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } } as const;

describe("Telegram operator contracts", () => {
  it("accepts only strict configuration with a SecretReference", () => {
    expect(new TelegramOperatorConfigValidator().validate(config).ok).toBe(true);
    expect(new TelegramOperatorConfigValidator().validate({ ...config, token: "unsafe" }).ok).toBe(false);
  });
  it("accepts a bounded private text message and rejects unknown fields", () => {
    const validator = new TelegramInboundUpdateValidator();
    const message = { contractVersion: "1", message: { chatId: "200", contractVersion: "1", messageId: "7", text: "/start", updateId: "1", userId: "100" }, type: "message" } as const;
    expect(validator.validate(message).ok).toBe(true);
    expect(validator.validate({ ...message, unexpected: true }).ok).toBe(false);
  });
});
