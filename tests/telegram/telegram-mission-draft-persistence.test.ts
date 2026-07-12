import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TelegramSqliteStateStore, type TelegramMissionDraft, type TelegramMissionDraftOperation } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

const hash = "a".repeat(64);

describe("durable Telegram Mission drafts", () => {
  it("persists one exact draft, atomically records an operation, replays it, and survives restart", async () => {
    await withStore(async (path, clock) => {
      const first = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock);
      first.startSession(hash, "actor-local", "workspace-local", 600);
      first.createMissionDraft(draft());
      const applied = first.applyMissionDraftOperation(operation());
      expect(applied).toMatchObject({ ok: true, draft: { objective: "A bounded objective.", version: 1 } });
      expect(first.applyMissionDraftOperation(operation())).toEqual(applied);
      await first.close();
      const reopened = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock);
      expect(reopened.getMissionDraft(`telegram-session-${hash.slice(0, 32)}`)).toMatchObject({ objective: "A bounded objective.", version: 1 });
      await reopened.close();
    });
  });

  it("fails closed on an operation-ID fingerprint conflict without changing the draft", async () => {
    await withStore(async (path, clock) => {
      const store = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock);
      store.startSession(hash, "actor-local", "workspace-local", 600);
      store.createMissionDraft(draft());
      store.applyMissionDraftOperation(operation());
      expect(() => store.applyMissionDraftOperation(operation({ payload: { objective: "A different objective." } }))).toThrow(/conflict/iu);
      expect(store.getMissionDraft(`telegram-session-${hash.slice(0, 32)}`)).toMatchObject({ objective: "A bounded objective.", version: 1 });
      await store.close();
    });
  });
});

function draft(): TelegramMissionDraft { return { actorId: "actor-local", assumptions: [], authorizedIdentityHash: hash, constraints: [], contractVersion: "1", createdAt: "2026-07-12T10:00:00.000Z", currentField: "OBJECTIVE", draftId: "mission-draft-1", expiresAt: "2026-07-12T11:00:00.000Z", proposedExternalActions: [], sessionId: `telegram-session-${hash.slice(0, 32)}`, status: "COLLECTING", unknowns: [], updatedAt: "2026-07-12T10:00:00.000Z", version: 0, workspaceId: "workspace-local" }; }
function operation(overrides: Partial<TelegramMissionDraftOperation> = {}): TelegramMissionDraftOperation { return { actorId: "actor-local", authorizedIdentityHash: hash, contractVersion: "1", draftId: "mission-draft-1", expectedVersion: 0, kind: "UPDATE_OBJECTIVE", operationId: "mission-operation-1", payload: { objective: "A bounded objective." }, sessionId: `telegram-session-${hash.slice(0, 32)}`, workspaceId: "workspace-local", ...overrides } as TelegramMissionDraftOperation; }
async function withStore(test: (path: string, clock: FixedClock) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-mission-draft-")); try { await test(join(directory, "runtime.sqlite"), new FixedClock("2026-07-12T10:05:00.000Z")); } finally { await rm(directory, { force: true, recursive: true }); } }
