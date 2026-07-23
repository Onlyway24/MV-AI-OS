import { describe, expect, it } from "vitest";

import { TelegramBotApiClient, type TelegramBotApiRequest, type TelegramBotApiTransport } from "../../src/telegram/telegram-bot-api.js";
import type { TelegramOperatorConfig } from "../../src/telegram/telegram-contracts.js";
import { TelegramVentureBriefConsole } from "../../src/telegram/telegram-venture-brief-console.js";
import type { FounderPortfolioBrief } from "../../src/venture-holding/venture-domain.js";

const config: TelegramOperatorConfig = { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "MV_AI_OS_TELEGRAM_BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } };

describe("Telegram Venture Brief", () => {
  it("normalizes, advertises and delivers the read-only command only through fake transport", async () => {
    const calls: Pick<TelegramBotApiRequest, "body" | "method">[] = [];
    const transport: TelegramBotApiTransport = { request: ({ body, method }) => { calls.push({ body, method }); return Promise.resolve({ ok: true, result: [] }); } };
    const api = new TelegramBotApiClient(config, "credential-not-sent", transport);
    const brief = record();
    const console = new TelegramVentureBriefConsole({ chatId: "200", service: { readLatest: () => Promise.resolve(brief), inspect: () => Promise.resolve(brief) } });

    expect(api.normalize(message("/venture_brief", 1))).toMatchObject({ action: { kind: "VENTURE_BRIEF", payload: "/venture_brief" } });
    const summary = await console.handle("/venture_brief");
    await api.deliver(summary);
    await api.setCommands();
    expect(summary.text).toContain("Onlyway Venture Brief — DAILY");
    expect(summary.text).toContain("Capitale [NOT_AVAILABLE]");
    expect(summary.text).toContain("PUBLICATION_LOCKED");
    expect(calls.some(({ body, method }) => method === "setMyCommands" && JSON.stringify(body).includes("venture_brief"))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("credential-not-sent");
  });

  it("shows bounded redacted detail without starting jobs, spending or publication", async () => {
    const brief = record();
    const console = new TelegramVentureBriefConsole({ chatId: "200", service: { readLatest: () => Promise.resolve(brief), inspect: () => Promise.resolve(brief) } });
    const detail = await console.handle(`/venture_brief ${brief.briefId}`);
    expect(detail.text.length).toBeLessThanOrEqual(3_800);
    expect(detail.text).toContain("EXTERNAL_ACTION_LOCKED");
    expect(detail.text).toContain("questo comando non avvia job, spese o pubblicazioni");
    expect(detail.text).not.toContain("Fabio approva il budget segreto");
  });
});

function record(): FounderPortfolioBrief {
  return {
    actorId: "fabio", blockerCodes: ["FOUNDER_INPUT_REQUIRED"], briefId: "venture-daily-2026-07-23-v0", contractVersion: "1", costStatus: "NOT_AVAILABLE", createdAt: "2026-07-23T08:00:00.000Z", experimentIds: ["experiment-1"], externalEffects: "ZERO", fingerprint: "a".repeat(64), founderDecisionIds: ["decision-1"], kind: "DAILY", nextActions: ["Fabio approva il budget segreto"], opportunityIds: ["opportunity-1"], portfolioId: "portfolio-1", riskCount: 1, updatedAt: "2026-07-23T08:00:00.000Z", ventureReportIds: ["report-1"], version: 0, workspaceId: "workspace",
  };
}

function message(text: string, updateId: number): unknown { return { message: { chat: { id: 200, type: "private" }, from: { id: 100, is_bot: false }, message_id: updateId + 10, text }, update_id: updateId }; }
