import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TelegramSqliteStateStore } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

const binding = "a".repeat(64);

describe("durable Telegram operator sessions", () => {
  it("creates one durable session, applies an exact transition, and survives restart", async () => {
    await withStore(async (path, clock) => {
      const first = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "token-a");
      const session = first.startSession(binding, "actor-local", "workspace-local", 600);
      expect(first.startSession(binding, "actor-local", "workspace-local", 600)).toEqual(session);
      const collecting = first.transitionSession(binding, { action: "COLLECT", contractVersion: "1", expectedVersion: 0, expiresAt: "2026-07-02T10:10:00.000Z", nextState: "COLLECTING_INPUT", sessionId: session.sessionId });
      expect(collecting).toMatchObject({ state: "COLLECTING_INPUT", version: 1 });
      await first.close();
      const reopened = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "token-b");
      expect(reopened.getSession(binding)).toEqual(collecting);
      await reopened.close();
    });
  });

  it("rejects stale and invalid transitions without changing durable state", async () => {
    await withStore(async (path, clock) => {
      const store = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock);
      const session = store.startSession(binding, "actor-local", "workspace-local", 600);
      expect(() => store.transitionSession(binding, { action: "CONFIRM", contractVersion: "1", expectedVersion: 0, expiresAt: "2026-07-02T10:10:00.000Z", nextState: "COMPLETED", sessionId: session.sessionId })).toThrow(/invalid|stale/iu);
      expect(store.getSession(binding)).toEqual(session);
      await store.close();
    });
  });

  it("cancels a session and expires inactive state without storing a transcript", async () => {
    await withStore(async (path, clock) => {
      const store = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock);
      const session = store.startSession(binding, "actor-local", "workspace-local", 60);
      const cancelled = store.transitionSession(binding, { action: "CANCEL", contractVersion: "1", expectedVersion: 0, expiresAt: "2026-07-02T10:10:00.000Z", nextState: "CANCELLED", sessionId: session.sessionId });
      expect(cancelled.state).toBe("CANCELLED");
      store.purgeExpired();
      expect(JSON.stringify(store.getSession(binding))).not.toMatch(/message|username|telegram text/iu);
      await store.close();
    });
  });
});

async function withStore(test: (path: string, clock: FixedClock) => Promise<void>) { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-session-")); try { await test(join(directory, "runtime.sqlite"), new FixedClock("2026-07-02T10:00:00.000Z")); } finally { await rm(directory, { force: true, recursive: true }); } }
