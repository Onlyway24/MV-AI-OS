import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalSecretResolver, preflightTelegramOperator } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

describe("Telegram operator preflight", () => {
  it("validates secret resolution and local composition without exposing the token", async () => withDirectory(async (directory) => {
    const report = await preflightTelegramOperator(config(join(directory, "operator.sqlite")), { clock: new FixedClock(), secretResolver: new LocalSecretResolver({ environment: { BOT_TOKEN: "not-logged-token" } }) });
    expect(report).toEqual({ checks: ["APPLICATION_COMPOSITION_READY"], contractVersion: "1", secretReferenceId: "telegram-bot", status: "READY" });
    expect(JSON.stringify(report)).not.toContain("not-logged-token");
  }));

  it("fails safely when the configured token reference is unavailable", async () => withDirectory(async (directory) => {
    await expect(preflightTelegramOperator(config(join(directory, "operator.sqlite")), { secretResolver: new LocalSecretResolver({ environment: {} }) })).rejects.toThrow(/secret.*available/iu);
  }));
});

function config(path: string): unknown { return { contractVersion: "1", runtime: { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }, telegram: { allowedChatId: "200", allowedUserId: "100", botToken: { contractVersion: "1", secretId: "telegram-bot", source: "environment", variableName: "BOT_TOKEN" }, contractVersion: "1", polling: { confirmationRetentionSeconds: 600, limit: 10, sessionRetentionSeconds: 3_600, timeoutSeconds: 10, updateReceiptRetentionSeconds: 3_600 } } }; }
async function withDirectory(test: (directory: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-preflight-")); try { await test(directory); } finally { await rm(directory, { force: true, recursive: true }); } }
