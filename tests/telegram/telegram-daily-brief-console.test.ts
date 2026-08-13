import { describe, expect, it } from "vitest";

import type { DailyOperatingBriefRepository } from "../../src/daily-brief/daily-operating-brief-repository.js";
import { DailyOperatingBriefService, type DailyOperatingBriefSourceSnapshot } from "../../src/daily-brief/daily-operating-brief-service.js";
import type { DailyOperatingBriefRecord } from "../../src/daily-brief/daily-operating-brief.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import { TelegramBotApiClient, type TelegramBotApiRequest, type TelegramBotApiTransport } from "../../src/telegram/telegram-bot-api.js";
import type { TelegramOperatorConfig } from "../../src/telegram/telegram-contracts.js";
import { TelegramOutboundMessageIntentValidator } from "../../src/telegram/telegram-contracts.js";
import { TelegramDailyBriefConsole } from "../../src/telegram/telegram-daily-brief-console.js";

const config: TelegramOperatorConfig = { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "MV_AI_OS_TELEGRAM_BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } };
const snapshot: DailyOperatingBriefSourceSnapshot = {
  approvals: [{ entityId: "production-001", entityType: "CONTENT_PRODUCTION", status: "PENDING_FABIO_APPROVAL" }],
  blockedTasks: [{ owner: "FABIO", reasonCode: "EVIDENCE_PACKS_MISSING", taskId: "research-workday-001" }],
  businessMissions: [],
  evidence: [{ evidenceId: "evidence-001", freshnessExpiresAt: "2026-07-22T00:00:00.000Z" }],
  production: { active: 0, deadLetter: 0, pendingFabio: 1 },
  social: { analyticsRecords: 0, records: 42 },
  workCompleted: [{ completedAt: "2026-07-19T07:59:00.000Z", identity: "receipt-001", kind: "AGENT_TASK" }],
  workInProgress: [],
};

describe("Telegram Daily Operating Brief", () => {
  it("normalizes both disclosure levels, advertises the command, and delivers only through fake transport", async () => {
    const repository = new MemoryRepository();
    const console = dailyBriefConsole(repository);
    const calls: TelegramBotApiRequest[] = [];
    const transport: TelegramBotApiTransport = { request: (request) => { calls.push(request); return Promise.resolve({ ok: true, result: [] }); } };
    const api = new TelegramBotApiClient(config, "credential-not-sent", transport);

    expect(api.normalize(message("/daily_brief", 1))).toMatchObject({ action: { kind: "DAILY_BRIEF", payload: "/daily_brief" } });
    expect(api.normalize(message("/daily_brief daily-brief-2026-07-19", 2))).toMatchObject({ action: { kind: "DAILY_BRIEF", payload: "/daily_brief daily-brief-2026-07-19" } });
    const summary = await console.handle("/daily_brief");
    await api.deliver(summary);
    await api.setCommands();

    expect(summary.text).toContain("Daily Operating Brief — 2026-07-19");
    expect(summary.text).toContain("Dettaglio: /daily_brief daily-brief-2026-07-19");
    expect(summary.text).toContain("Sezioni non disponibili: 5");
    expect(summary.text).toContain("Approvazioni [MEASURED]: 1");
    expect(summary.text).toContain("Produzione [MEASURED]");
    expect(summary.text).toContain("copertura azioni esterne non disponibile; questo comando non avvia azioni");
    expect(calls.map(({ method }) => method)).toEqual(["sendMessage", "setMyCommands"]);
    expect(calls[0]?.body).toMatchObject({ chat_id: "200", text: summary.text });
    expect(JSON.stringify(calls[1]?.body)).toContain('"command":"daily_brief","description":"Daily Operating Brief"');
    expect(repository.inserts).toBe(1);
  });

  it("renders a bounded, redacted detail and never presents unavailable zeroes as measured", async () => {
    const repository = new MemoryRepository();
    const console = dailyBriefConsole(repository);
    const summary = await console.handle("/daily_brief");
    const briefId = /ID: ([a-z0-9@._-]+)/u.exec(summary.text)?.[1];
    expect(briefId).toBeDefined();

    const detail = await console.handle(`/daily_brief ${briefId ?? "missing"}`);
    expect(detail.text).toContain("Costi [UNAVAILABLE]: dato non disponibile; gli zeri mostrati non sono misurati");
    expect(detail.text).toContain("Azioni esterne [UNAVAILABLE]: dato non disponibile; gli zeri mostrati non sono misurati");
    expect(detail.text).toContain("Decisioni Fabio [MEASURED]: 2 aperte");
    expect(detail.text).not.toContain("operations cost ledger");
    expect(detail.text.length).toBeLessThanOrEqual(4_000);
    expect(new TelegramOutboundMessageIntentValidator().validate(detail).ok).toBe(true);
    expect((await console.handle("/daily_brief bad/id")).text).toBe("Uso: /daily_brief oppure /daily_brief <id>.");
    expect(repository.inserts).toBe(1);
  });

  it("reports measured non-zero external effects without claiming that none occurred", async () => {
    const repository = new MemoryRepository();
    const console = dailyBriefConsole(repository, {
      ...snapshot,
      externalEffects: { deployments: 0, messages: 1, paidCalls: 2, publications: 1, purchases: 0 },
    });
    const summary = await console.handle("/daily_brief");
    expect(summary.text).toContain("4 azione/i esterna/e registrata/e; questo comando non ne avvia");
    expect(summary.text).not.toContain("nessuna azione esterna avviata");
  });
});

function dailyBriefConsole(repository: MemoryRepository, source: DailyOperatingBriefSourceSnapshot = snapshot): TelegramDailyBriefConsole {
  const clock = { now: (): Date => new Date("2026-07-19T08:00:00.000Z") };
  const service = new DailyOperatingBriefService({ actorId: "actor-local", clock, repositories: runner(repository), source: { snapshot: () => Promise.resolve(source) }, workspaceId: "workspace-local" });
  return new TelegramDailyBriefConsole({ chatId: "200", clock, service });
}

class MemoryRepository implements DailyOperatingBriefRepository {
  readonly #records = new Map<string, DailyOperatingBriefRecord>();
  public inserts = 0;
  public getByBusinessDate(workspaceId: string, businessDate: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve([...this.#records.values()].filter((record) => record.workspaceId === workspaceId && record.businessDate === businessDate).sort((left, right) => right.version - left.version)[0]); }
  public getById(briefId: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve(this.#records.get(briefId)); }
  public insert(record: DailyOperatingBriefRecord): Promise<void> { this.inserts += 1; this.#records.set(record.briefId, record); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string): Promise<readonly DailyOperatingBriefRecord[]> { return Promise.resolve([...this.#records.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => right.businessDate.localeCompare(left.businessDate) || right.version - left.version)); }
}

function runner(repository: MemoryRepository): RepositoryTransactionRunner {
  const repositories = { dailyOperatingBriefs: repository, operationalEvents: { append: () => Promise.resolve() } } as unknown as RepositoryTransaction;
  return { transaction: (operation) => operation(repositories) };
}

function message(text: string, updateId: number): unknown { return { message: { chat: { id: 200, type: "private" }, from: { id: 100, is_bot: false }, message_id: updateId + 10, text }, update_id: updateId }; }
