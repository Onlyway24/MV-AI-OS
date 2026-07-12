import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  TelegramMissionDraftValidator,
} from "../../src/index.js";

const validator = new TelegramMissionDraftValidator();
const hash = "a".repeat(64);

describe("Telegram Mission Draft contract", () => {
  it("accepts progressive and terminal structural records", () => {
    const collecting = validDraft();
    const partial = validDraft({
      audience: { description: "Founder operators", segments: ["operators"] },
      missionType: "content_strategy",
      objective: "Prepare a safe content direction.",
    });
    const reviewReady = validDraft({
      status: "REVIEW_READY",
      deliverables: [deliverable("brief")],
    });
    const confirmed = validDraft({
      confirmedAt: "2026-07-12T10:01:00.000Z",
      status: "CONFIRMED",
    });
    const cancelled = validDraft({
      status: "CANCELLED",
      terminalReasonCode: "cancelled_by_operator",
    });
    const expired = validDraft({
      status: "EXPIRED",
      terminalReasonCode: "expired",
    });

    for (const draft of [collecting, partial, reviewReady, confirmed, cancelled, expired]) {
      expect(validator.validate(draft).ok).toBe(true);
    }
  });

  it("rejects unknown, oversized, malformed, and inconsistent values", () => {
    expectInvalid({ unexpected: true });
    expectInvalid({ missionType: "unsupported" });
    expectInvalid({ objective: "x".repeat(1_001) });
    expectInvalid({ audience: { description: "Audience", segments: [], unexpected: true } });
    expectInvalid({ deliverables: [{ ...deliverable("brief"), format: "" }] });
    expectInvalid({ deadline: { dueAt: "bad", status: "known", timezone: "UTC" } });
    expectInvalid({ budget: { maximumAmount: 10, status: "unknown" } });
    expectInvalid({ constraints: Array.from({ length: 17 }, (_, index) => constraint(`constraint-${String(index)}`)) });
    expectInvalid({ constraints: [constraint("same"), constraint("same")] });
    expectInvalid({ proposedExternalActions: [{ actionId: "send", actionType: "outreach", approvalRequired: false, purpose: "Contact prospect", status: "proposal_only" }] });
    expectInvalid({ assumptions: [{ assumptionId: "assumption", rationale: "Rationale", statement: "" }] });
    expectInvalid({ unknowns: [{ classification: "LOW_IMPACT", impact: "Low", topic: "Topic", unknownId: "unknown" }] });
    expectInvalid({ createdAt: "not-a-time" });
    expectInvalid({ version: -1 });
    expectInvalid({ status: "CONFIRMED" });
  });

  it("rejects forbidden Telegram and sensitive material at every depth", () => {
    expectInvalid({ username: "fabio" });
    expectInvalid({ audience: { description: "Audience", segments: ["operators"], messageText: "private" } });
    expectInvalid({ assumptions: [{ assumptionId: "assumption", rationale: "Rationale", statement: "Statement", rawUpdate: { message: "private" } }] });
    expectInvalid({ objective: "Bearer secret-value" });
  });

  it("does not mutate input and returns deterministic deeply immutable copies", () => {
    const input = validDraft({
      constraints: [constraint("a")],
      deliverables: [deliverable("brief")],
    });
    const before = structuredClone(input);
    const first = validator.validate(input);
    const second = validator.validate(input);

    expect(input).toEqual(before);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.constraints)).toBe(true);
    expect(Object.isFrozen(first.value.constraints[0])).toBe(true);
    expect(() => {
      (first.value.constraints as unknown as { push: (entry: unknown) => void }).push(
        constraint("b"),
      );
    }).toThrow();
  });

  it("remains transport, persistence, and execution neutral", async () => {
    const source = await readFile(new URL("../../src/telegram/telegram-mission-draft.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(
      /from\s+"(?:[^"\n]*sqlite|[^"\n]*repository|[^"\n]*telegram-bot-api|[^"\n]*telegram-runtime|[^"\n]*mission-planner|[^"\n]*quality-gate|[^"\n]*workflow)\.js"/u,
    );
  });
});

function validDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function constraint(constraintId: string): Record<string, unknown> {
  return { constraintId, description: "Remain local only.", kind: "non_negotiable" };
}

function deliverable(deliverableId: string): Record<string, unknown> {
  return {
    acceptanceCriteria: ["Clear and safe"],
    deliverableId,
    description: "A preparation brief.",
    format: "markdown",
    title: "Brief",
  };
}

function expectInvalid(overrides: Record<string, unknown>): void {
  expect(validator.validate(validDraft(overrides)).ok).toBe(false);
}
