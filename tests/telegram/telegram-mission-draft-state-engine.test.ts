import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  TelegramMissionDraftApplyFailureValidator,
  TelegramMissionDraftApplySuccessValidator,
  TelegramMissionDraftOperationValidator,
  TelegramMissionDraftStateEngine,
  type TelegramMissionDraft,
  type TelegramMissionDraftOperation,
} from "../../src/index.js";

const engine = new TelegramMissionDraftStateEngine();
const operationValidator = new TelegramMissionDraftOperationValidator();
const hash = "a".repeat(64);
const NOW = "2026-07-12T10:05:00.000Z";

describe("Telegram Mission Draft pure state engine", () => {
  it("validates every declared operation and both result contracts", () => {
    for (const candidate of operations()) expect(operationValidator.validate(candidate).ok).toBe(true);
    expect(new TelegramMissionDraftApplySuccessValidator().validate({ appliedAt: NOW, contractVersion: "1", draft: draft(), ok: true, operationId: "operation-success" }).ok).toBe(true);
    expect(new TelegramMissionDraftApplyFailureValidator().validate({ contractVersion: "1", ok: false, operationId: "operation-failure", reasonCode: "STALE_DRAFT_VERSION" }).ok).toBe(true);
  });

  it("strictly rejects invalid, oversized, malformed, and private operations", () => {
    expectInvalidOperation({ kind: "CONFIRM_DRAFT" });
    expectInvalidOperation({ unexpected: true });
    expectInvalidOperation({ kind: "UPDATE_OBJECTIVE", payload: undefined });
    expectInvalidOperation({ kind: "CANCEL_DRAFT", payload: { objective: "no" } });
    expectInvalidOperation({ kind: "UPDATE_AUDIENCE", payload: { audience: { description: "Audience", segments: [], unknown: true } } });
    expectInvalidOperation({ kind: "UPDATE_OBJECTIVE", payload: { objective: "x".repeat(1_001) } });
    expectInvalidOperation({ expectedVersion: -1 });
    expectInvalidOperation({ operationId: "Not Normalized" });
    expectInvalidOperation({ kind: "UPDATE_AUDIENCE", payload: { audience: { description: "Audience", segments: [], username: "private" } } });
  });

  it("applies every collecting field update exactly once without automatic progression", () => {
    for (const operation of operations().filter(({ kind }) => !["CANCEL_DRAFT", "CONFIRM_DRAFT", "EXPIRE_DRAFT", "MARK_REVIEW_READY", "RETURN_TO_COLLECTING"].includes(kind))) {
      const result = engine.apply(draft(), operation, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.draft.version).toBe(1);
      expect(result.draft.updatedAt).toBe(NOW);
      expect(result.draft.status).toBe("COLLECTING");
      expect(result.draft.currentField).toBe(operation.kind === "SET_CURRENT_FIELD" ? "AUDIENCE" : "OBJECTIVE");
      expect(result.draft.workspaceId).toBe("workspace-local");
    }
  });

  it("binds an operation to the exact draft identity and version", () => {
    const cases: readonly [Record<string, unknown>, string][] = [
      [{ draftId: "other-draft" }, "DRAFT_ID_MISMATCH"],
      [{ sessionId: "other-session" }, "SESSION_ID_MISMATCH"],
      [{ actorId: "other-actor" }, "ACTOR_MISMATCH"],
      [{ workspaceId: "other-workspace" }, "WORKSPACE_MISMATCH"],
      [{ authorizedIdentityHash: "b".repeat(64) }, "IDENTITY_MISMATCH"],
      [{ expectedVersion: 1 }, "STALE_DRAFT_VERSION"],
      [{ expectedVersion: 99 }, "STALE_DRAFT_VERSION"],
    ];
    for (const [overrides, reasonCode] of cases) {
      const result = engine.apply(draft(), operation("UPDATE_OBJECTIVE", { objective: "Objective" }, overrides), NOW);
      expect(result).toMatchObject({ ok: false, reasonCode });
    }
  });

  it("enforces the closed transition matrix including terminal and expiry behavior", () => {
    expect(engine.apply(reviewDraft(), operation("RETURN_TO_COLLECTING", { currentField: "BUDGET" }), NOW)).toMatchObject({ ok: true, draft: { currentField: "BUDGET", status: "COLLECTING", version: 1 } });
    const marked = engine.apply(draft(), operation("MARK_REVIEW_READY", { contextFingerprint: hash }), NOW);
    expect(marked).toMatchObject({ ok: true, draft: { reviewContextFingerprint: hash, status: "REVIEW_READY", version: 1 } });
    if (marked.ok) {
      expect(engine.apply(marked.draft, operation("CONFIRM_DRAFT", { contextFingerprint: hash }, { expectedVersion: 1 }), NOW)).toMatchObject({ ok: true, draft: { confirmedAt: NOW, status: "CONFIRMED", version: 2 } });
      expect(engine.apply(marked.draft, operation("CONFIRM_DRAFT", { contextFingerprint: "b".repeat(64) }, { expectedVersion: 1 }), NOW)).toMatchObject({ ok: false, reasonCode: "CONTEXT_FINGERPRINT_MISMATCH" });
    }
    expect(engine.apply(draft(), operation("RETURN_TO_COLLECTING", { currentField: "BUDGET" }), NOW)).toMatchObject({ ok: false, reasonCode: "INVALID_STATE_TRANSITION" });
    expect(engine.apply(draft(), operation("CANCEL_DRAFT"), NOW)).toMatchObject({ ok: true, draft: { status: "CANCELLED", terminalReasonCode: "cancelled_by_operator" } });
    expect(engine.apply(reviewDraft(), operation("CANCEL_DRAFT"), NOW)).toMatchObject({ ok: true, draft: { status: "CANCELLED" } });
    expect(engine.apply(draft({ status: "CONFIRMED", confirmedAt: NOW, reviewContextFingerprint: hash }), operation("CANCEL_DRAFT"), NOW)).toMatchObject({ ok: false, reasonCode: "TERMINAL_DRAFT" });
    expect(engine.apply(draft({ status: "CANCELLED", terminalReasonCode: "cancelled_by_operator" }), operation("CANCEL_DRAFT"), NOW)).toMatchObject({ ok: false, reasonCode: "TERMINAL_DRAFT" });
    expect(engine.apply(draft({ status: "EXPIRED", terminalReasonCode: "expired" }), operation("CANCEL_DRAFT"), NOW)).toMatchObject({ ok: false, reasonCode: "TERMINAL_DRAFT" });
    expect(engine.apply(draft({ expiresAt: NOW }), operation("EXPIRE_DRAFT"), NOW)).toMatchObject({ ok: true, draft: { status: "EXPIRED", terminalReasonCode: "expired" } });
    expect(engine.apply(reviewDraft({ expiresAt: NOW }), operation("EXPIRE_DRAFT"), NOW)).toMatchObject({ ok: true, draft: { status: "EXPIRED" } });
    expect(engine.apply(draft(), operation("EXPIRE_DRAFT"), NOW)).toMatchObject({ ok: false, reasonCode: "INVALID_STATE_TRANSITION" });
    expect(engine.apply(draft({ expiresAt: NOW }), operation("UPDATE_OBJECTIVE", { objective: "No mutation" }), NOW)).toMatchObject({ ok: false, reasonCode: "EXPIRED_DRAFT" });
    expect(engine.apply(reviewDraft(), operation("UPDATE_OBJECTIVE", { objective: "No mutation" }), NOW)).toMatchObject({ ok: false, reasonCode: "INVALID_STATE_TRANSITION" });
  });

  it("does not mutate inputs and produces deterministic, immutable, valid output", () => {
    const current = draft({ constraints: [constraint("constraint-a")] });
    const request = operation("REPLACE_CONSTRAINTS", { constraints: [constraint("constraint-b")] });
    const currentBefore = structuredClone(current);
    const requestBefore = structuredClone(request);
    const first = engine.apply(current, request, NOW);
    const second = engine.apply(current, request, NOW);

    expect(current).toEqual(currentBefore);
    expect(request).toEqual(requestBefore);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.draft)).toBe(true);
    expect(Object.isFrozen(first.draft.constraints)).toBe(true);
    expect(Object.isFrozen(first.draft.constraints[0])).toBe(true);
    expect(() => {
      (first.draft.constraints as unknown as { push: (value: unknown) => void }).push(constraint("later"));
    }).toThrow();
  });

  it("returns stable bounded failures without echoing sensitive input", () => {
    const result = engine.apply(draft(), operation("UPDATE_OBJECTIVE", { objective: "Objective" }, { draftId: "other-draft" }), NOW);
    expect(result).toEqual({ contractVersion: "1", ok: false, operationId: "operation-update_objective", reasonCode: "DRAFT_ID_MISMATCH" });
    expect(JSON.stringify(result)).not.toContain("other-draft");
  });

  it("has no persistence, transport, execution, or clock dependency", async () => {
    const source = await readFile(new URL("../../src/telegram/telegram-mission-draft-state-engine.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+"(?:[^"\n]*sqlite|[^"\n]*repository|[^"\n]*telegram-bot-api|[^"\n]*telegram-runtime|[^"\n]*mission-planner|[^"\n]*quality-gate|[^"\n]*workflow|[^"\n]*agent|[^"\n]*model|[^"\n]*provider|[^"\n]*tool)\.js"/u);
    expect(source).not.toMatch(/Date\.now|new Date\(/u);
  });
});

function draft(overrides: Record<string, unknown> = {}): TelegramMissionDraft {
  return {
    actorId: "actor-local",
    assumptions: [],
    authorizedIdentityHash: hash,
    constraints: [],
    contractVersion: "1",
    createdAt: "2026-07-12T10:00:00.000Z",
    currentField: "OBJECTIVE",
    draftId: "telegram-mission-draft-1",
    expiresAt: "2026-07-12T11:00:00.000Z",
    proposedExternalActions: [],
    sessionId: "telegram-session-1",
    status: "COLLECTING",
    unknowns: [],
    updatedAt: "2026-07-12T10:00:00.000Z",
    version: 0,
    workspaceId: "workspace-local",
    ...overrides,
  };
}

function reviewDraft(overrides: Record<string, unknown> = {}): TelegramMissionDraft {
  return draft({ reviewContextFingerprint: hash, status: "REVIEW_READY", ...overrides });
}

function operation(kind: string, payload?: Record<string, unknown>, overrides: Record<string, unknown> = {}): TelegramMissionDraftOperation {
  return {
    actorId: "actor-local",
    authorizedIdentityHash: hash,
    contractVersion: "1",
    draftId: "telegram-mission-draft-1",
    expectedVersion: 0,
    kind,
    operationId: `operation-${kind.toLowerCase()}`,
    sessionId: "telegram-session-1",
    workspaceId: "workspace-local",
    ...(payload === undefined ? {} : { payload }),
    ...overrides,
  } as TelegramMissionDraftOperation;
}

function operations(): readonly TelegramMissionDraftOperation[] {
  return [
    operation("UPDATE_OBJECTIVE", { objective: "Define a safe objective." }),
    operation("UPDATE_MISSION_TYPE", { missionType: "content_strategy" }),
    operation("UPDATE_AUDIENCE", { audience: { description: "Operators", segments: ["operators"] } }),
    operation("UPDATE_DELIVERABLES", { deliverables: [deliverable("brief")] }),
    operation("UPDATE_DEADLINE", { deadline: { status: "unknown", timezone: "Europe/Rome" } }),
    operation("UPDATE_BUDGET", { budget: { status: "unknown" } }),
    operation("REPLACE_CONSTRAINTS", { constraints: [constraint("constraint-a")] }),
    operation("REPLACE_PROPOSED_EXTERNAL_ACTIONS", { proposedExternalActions: [externalAction("action-a")] }),
    operation("REPLACE_ASSUMPTIONS", { assumptions: [assumption("assumption-a")] }),
    operation("REPLACE_UNKNOWNS", { unknowns: [unknown("unknown-a")] }),
    operation("SET_CURRENT_FIELD", { currentField: "AUDIENCE" }),
    operation("MARK_REVIEW_READY", { contextFingerprint: hash }),
    operation("CONFIRM_DRAFT", { contextFingerprint: hash }),
    operation("RETURN_TO_COLLECTING", { currentField: "OBJECTIVE" }),
    operation("CANCEL_DRAFT"),
    operation("EXPIRE_DRAFT"),
  ];
}

function constraint(constraintId: string): Record<string, unknown> { return { constraintId, description: "Remain local.", kind: "non_negotiable" }; }
function deliverable(deliverableId: string): Record<string, unknown> { return { acceptanceCriteria: ["Clear"], deliverableId, description: "Brief", format: "markdown", title: "Brief" }; }
function externalAction(actionId: string): Record<string, unknown> { return { actionId, actionType: "outreach", approvalRequired: true, purpose: "Propose only", status: "proposal_only" }; }
function assumption(assumptionId: string): Record<string, unknown> { return { assumptionId, rationale: "Safe", statement: "Assume local review." }; }
function unknown(unknownId: string): Record<string, unknown> { return { classification: "LOW_IMPACT", conservativeAssumption: "Use a cautious default.", impact: "Low", topic: "Timing", unknownId }; }
function expectInvalidOperation(overrides: Record<string, unknown>): void { expect(operationValidator.validate({ ...operation("UPDATE_OBJECTIVE", { objective: "Objective" }), ...overrides }).ok).toBe(false); }
