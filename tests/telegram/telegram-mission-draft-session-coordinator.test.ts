import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { TelegramMissionDraftSessionCoordinator, TelegramSqliteStateStore, type TelegramMissionDraft, type TelegramMissionDraftOperation, type TelegramMissionDraftSessionCommand, type TelegramMissionDraftSessionSnapshot } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

const identity = "a".repeat(64);
const context = "b".repeat(64);
const sessionId = `telegram-session-${identity.slice(0, 32)}`;

describe("atomic Telegram session and Mission draft coordination", () => {
  it("creates, updates, navigates, reviews, confirms, and restores one exact synchronized pair", async () => withPath(async (path) => {
    const store = opened(path); const session = store.startSession(identity, "actor-local", "workspace-local", 3_600); const coordinator = new TelegramMissionDraftSessionCoordinator(store);
    let current = coordinator.start(identity, draft(session.version + 1));
    expect(current).toMatchObject({ requestedField: "OBJECTIVE", session: { state: "COLLECTING_INPUT", version: 1 }, draft: { version: 1 } });
    expect(() => coordinator.start(identity, draft(2, "other-draft"))).toThrow(/active/iu);
    expect(coordinator.apply(update(current, "field-1", "Bounded objective."))).toMatchObject({ ok: true, draft: { objective: "Bounded objective.", version: 2 } });
    current = coordinator.read(identity); expect(current.session.version).toBe(current.draft.version);
    expect(coordinator.openReview(current, "open-review")).toMatchObject({ ok: true, draft: { version: 3 } });
    current = coordinator.read(identity); expect(current.session.state).toBe("REVIEWING_DRAFT");
    expect(coordinator.moveBackward(current, "back-1")).toMatchObject({ ok: true, draft: { status: "COLLECTING", version: 4 } });
    current = coordinator.read(identity); coordinator.openReview(current, "open-review-2"); current = coordinator.read(identity);
    coordinator.markReviewReady(current, "review-ready", context); current = coordinator.read(identity);
    expect(current).toMatchObject({ session: { state: "WAITING_CONFIRMATION", version: 6 }, draft: { reviewContextFingerprint: context, status: "REVIEW_READY", version: 6 } });
    expect(coordinator.confirm(current, "confirm-1", context)).toMatchObject({ ok: true, draft: { status: "CONFIRMED", version: 7 } });
    await store.close(); const reopened = opened(path); const stored = reopened.getMissionDraft(sessionId); const restoredSession = reopened.getSession(identity);
    expect(stored).toMatchObject({ objective: "Bounded objective.", status: "CONFIRMED", version: 7 }); expect(restoredSession).toMatchObject({ state: "COMPLETED", version: 7 }); await reopened.close();
  }));

  it("rolls back both writes on an injected mid-transaction failure", async () => withPath(async (path) => {
    const first = opened(path); const session = first.startSession(identity, "actor-local", "workspace-local", 3_600); new TelegramMissionDraftSessionCoordinator(first).start(identity, draft(session.version + 1)); await first.close();
    const faulted = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock(), () => "fault-token", (point) => { if (point === "after-draft-write") throw new Error("injected rollback"); }); const coordinator = new TelegramMissionDraftSessionCoordinator(faulted); const before = coordinator.read(identity);
    expect(() => coordinator.apply(update(before, "rollback-operation", "Must roll back."))).toThrow(/rollback/iu); expect(coordinator.read(identity)).toEqual(before); await faulted.close();
  }));

  it("fails closed for stale versions, wrong ownership, and missing or corrupt draft references", async () => withPath(async (path) => {
    const store = opened(path); const session = store.startSession(identity, "actor-local", "workspace-local", 3_600); const coordinator = new TelegramMissionDraftSessionCoordinator(store); const current = coordinator.start(identity, draft(session.version + 1));
    expect(() => coordinator.apply({ ...update(current, "stale", "No."), expectedSessionVersion: 0 })).toThrow(/stale|mismatch/iu);
    expect(() => coordinator.apply({ ...update(current, "owner", "No."), actorId: "other-actor" })).toThrow(/mismatch/iu);
    await store.close(); const database = new DatabaseSync(path); database.prepare("DELETE FROM telegram_operator_drafts WHERE session_id = ?").run(sessionId); database.close(); const reopened = opened(path); expect(() => new TelegramMissionDraftSessionCoordinator(reopened).resume(identity)).toThrow(/missing/iu); await reopened.close();
    const wrongOwner = new DatabaseSync(path); wrongOwner.prepare("INSERT INTO telegram_operator_drafts (session_id, expires_at, record_json) VALUES (?, ?, ?)").run(sessionId, draft(1).expiresAt, JSON.stringify({ ...draft(1), actorId: "other-actor" })); wrongOwner.close(); const mismatched = opened(path); expect(() => new TelegramMissionDraftSessionCoordinator(mismatched).resume(identity)).toThrow(/mismatch|corrupt/iu); await mismatched.close();
    const corrupt = new DatabaseSync(path); corrupt.prepare("UPDATE telegram_operator_drafts SET record_json = ? WHERE session_id = ?").run(JSON.stringify({ invalid: true }), sessionId); corrupt.close(); const corrupted = opened(path); expect(() => new TelegramMissionDraftSessionCoordinator(corrupted).resume(identity)).toThrow(/corrupt/iu); await corrupted.close();
  }));

  it("binds callbacks to the exact snapshot and prevents forgery, expiry, replay, and double click", async () => withPath(async (path) => {
    const store = opened(path); const session = store.startSession(identity, "actor-local", "workspace-local", 3_600); const coordinator = new TelegramMissionDraftSessionCoordinator(store); const current = coordinator.start(identity, draft(session.version + 1)); const command = update(current, "callback-update", "Callback objective."); const callback = coordinator.issueCallback(command, "2026-07-12T10:10:00.000Z");
    expect(() => coordinator.applyCallback(callback.token, "c".repeat(64))).toThrow(/forged|invalid/iu); expect(() => coordinator.applyCallback("cb_" + "0".repeat(32), identity)).toThrow(/forged|invalid|stale/iu);
    expect(coordinator.applyCallback(callback.token, identity)).toMatchObject({ ok: true, draft: { version: 2 } }); expect(() => coordinator.applyCallback(callback.token, identity)).toThrow(/consumed|stale/iu);
    await store.close(); const later = new TelegramMissionDraftSessionCoordinator(new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock("2026-07-12T10:20:00.000Z"))); expect(() => later.applyCallback(callback.token, identity)).toThrow(/expired|consumed|stale/iu);
  }));

  it("cancels, privacy-minimizes, invalidates callbacks, and restarts only after explicit discard", async () => withPath(async (path) => {
    const store = opened(path); const session = store.startSession(identity, "actor-local", "workspace-local", 3_600); const coordinator = new TelegramMissionDraftSessionCoordinator(store); let current = coordinator.start(identity, draft(session.version + 1)); coordinator.apply(update(current, "private-field", "Content removed on cancellation.")); current = coordinator.read(identity); const callback = coordinator.issueCallback(update(current, "cancelled-callback", "Never applied."), "2026-07-12T10:10:00.000Z");
    const cancelled = coordinator.cancel(current, "cancel-1"); expect(cancelled).toMatchObject({ ok: true, draft: { assumptions: [], constraints: [], status: "CANCELLED" } }); if (cancelled.ok) expect(cancelled.draft.objective).toBeUndefined(); expect(() => coordinator.applyCallback(callback.token, identity)).toThrow(/stale|consumed|invalid/iu);
    expect(() => coordinator.start(identity, draft(4, "new-draft"))).toThrow(/active/iu); const restarted = coordinator.restart(identity, draft(4, "new-draft"), true); expect(restarted).toMatchObject({ session: { state: "COLLECTING_INPUT", version: 4 }, draft: { draftId: "new-draft", version: 4 } }); await store.close();
  }));

  it("expires with minimized state and contains no planning, Workflow, transport, or private-message persistence path", async () => withPath(async (path) => {
    const early = opened(path); const session = early.startSession(identity, "actor-local", "workspace-local", 60); const current = new TelegramMissionDraftSessionCoordinator(early).start(identity, draft(session.version + 1, "expiring", "2026-07-12T10:06:00.000Z")); await early.close();
    const lateStore = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, new FixedClock("2026-07-12T10:07:00.000Z")); const coordinator = new TelegramMissionDraftSessionCoordinator(lateStore); expect(() => coordinator.resume(identity)).toThrow(/not active/iu); const expired = coordinator.expire(current, "expire-1"); expect(expired).toMatchObject({ ok: true, draft: { expiresAt: "2026-07-12T10:07:00.000Z", status: "EXPIRED" } }); if (expired.ok) expect(expired.draft.objective).toBeUndefined(); await lateStore.close();
    const database = new DatabaseSync(path); const persisted = JSON.stringify(database.prepare("SELECT record_json FROM telegram_operator_drafts WHERE session_id = ?").get(sessionId)); database.close(); expect(persisted).not.toMatch(/message|username|phone|callback payload|Content removed|raw update|transcript/iu);
    const sources = await Promise.all(["telegram-mission-draft-session-coordinator.ts", "telegram-sqlite-state-store.ts"].map((name) => readFile(new URL(`../../src/telegram/${name}`, import.meta.url), "utf8"))); expect(sources.join("\n")).not.toMatch(/CREATE_MISSION|PLAN_MISSION|MissionQualityGate|createWorkflow|invokeAgent|AgentRuntime|ModelGateway|fetch\(/u);
  }));
});

function clock() { return new FixedClock("2026-07-12T10:05:00.000Z"); }
function opened(path: string) { return new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock(), () => "deterministic-token"); }
function draft(version: number, draftId = "mission-draft-1", expiresAt = "2026-07-12T11:00:00.000Z"): TelegramMissionDraft { return { actorId: "actor-local", assumptions: [], authorizedIdentityHash: identity, constraints: [], contractVersion: "1", createdAt: "2026-07-12T10:05:00.000Z", currentField: "OBJECTIVE", draftId, expiresAt, proposedExternalActions: [], sessionId, status: "COLLECTING", unknowns: [], updatedAt: "2026-07-12T10:05:00.000Z", version, workspaceId: "workspace-local" }; }
function update(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string, objective: string): TelegramMissionDraftSessionCommand { const operation: TelegramMissionDraftOperation = { actorId: snapshot.session.actorId, authorizedIdentityHash: identity, contractVersion: "1", draftId: snapshot.draft.draftId, expectedVersion: snapshot.draft.version, kind: "UPDATE_OBJECTIVE", operationId, payload: { objective }, sessionId, workspaceId: snapshot.session.workspaceId }; return { actorId: snapshot.session.actorId, authorizedIdentityHash: identity, contractVersion: "1", coordinationKind: "APPLY_FIELD", expectedDraftVersion: snapshot.draft.version, expectedSessionVersion: snapshot.session.version, operation, sessionId, workspaceId: snapshot.session.workspaceId }; }
async function withPath(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-mission-session-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
