import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MediaQualitySessionLedger,
  MEDIA_QUALITY_SESSION_HARD_LIMIT_USD,
} from "../../src/index.js";

describe("MediaQualitySessionLedger", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const operation of cleanup.splice(0)) await operation();
  });

  it("authorizes one text request followed by one image request and then relocks", async () => {
    const ledger = await createLedger(cleanup);
    activate(ledger, "session-a");
    expect(ledger.preflight({ maxCostUsd: 0.01, model: "gpt-4o-mini", operation: "STRUCTURED_CONTENT_DIRECTION", sessionId: "session-a" }).status).toBe("ready");
    ledger.reserve({ maxCostUsd: 0.01, model: "gpt-4o-mini", operation: "STRUCTURED_CONTENT_DIRECTION", operationId: "text-a", sessionId: "session-a" });
    ledger.reconcile({ costClassification: "ESTIMATED", costUsd: 0.0002, operationId: "text-a", sessionId: "session-a", status: "succeeded" });
    expect(ledger.preflight({ maxCostUsd: 0.2, model: "gpt-image-2", operation: "GPT_IMAGE_2_MASTER", sessionId: "session-a" }).status).toBe("ready");
    ledger.reserve({ maxCostUsd: 0.2, model: "gpt-image-2", operation: "GPT_IMAGE_2_MASTER", operationId: "image-a", sessionId: "session-a" });
    expect(ledger.snapshot("session-a")).toMatchObject({ imageCalls: 1, liveCalls: 2, status: "RELOCKED", textCalls: 1 });
  });

  it("blocks image generation until structured content succeeds", async () => {
    const ledger = await createLedger(cleanup);
    activate(ledger, "session-b");
    expect(ledger.preflight({ maxCostUsd: 0.2, model: "gpt-image-2", operation: "GPT_IMAGE_2_MASTER", sessionId: "session-b" })).toMatchObject({ reason: "structured_direction_not_ready", status: "blocked" });
  });

  it("preserves consumed operations across restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-media-quality-"));
    cleanup.push(async () => rm(directory, { force: true, recursive: true }));
    const path = join(directory, "ledger.sqlite");
    const first = ledgerAt(path);
    activate(first, "session-c");
    first.reserve({ maxCostUsd: 0.01, model: "gpt-4o-mini", operation: "STRUCTURED_CONTENT_DIRECTION", operationId: "text-c", sessionId: "session-c" });
    first.closeDatabase();
    const restarted = ledgerAt(path);
    expect(restarted.snapshot("session-c")).toMatchObject({ liveCalls: 1, textCalls: 1 });
    restarted.closeDatabase();
  });

  it("blocks a reservation that could exceed the USD 1 session cap", async () => {
    const ledger = await createLedger(cleanup);
    activate(ledger, "session-d");
    expect(ledger.preflight({ maxCostUsd: MEDIA_QUALITY_SESSION_HARD_LIMIT_USD + 0.001, model: "gpt-4o-mini", operation: "STRUCTURED_CONTENT_DIRECTION", sessionId: "session-d" })).toMatchObject({ reason: "invalid_cost_reservation", status: "blocked" });
  });
});

function activate(ledger: MediaQualitySessionLedger, sessionId: string): void {
  ledger.createDisabled({ expiresAt: "2026-07-17T13:10:00.000Z", sessionId });
  ledger.activate(sessionId);
}

async function createLedger(cleanup: (() => Promise<void>)[]): Promise<MediaQualitySessionLedger> {
  const directory = await mkdtemp(join(tmpdir(), "mv-media-quality-"));
  cleanup.push(() => rm(directory, { force: true, recursive: true }));
  const ledger = ledgerAt(join(directory, "ledger.sqlite"));
  cleanup.push(() => {
    ledger.closeDatabase();
    return Promise.resolve();
  });
  return ledger;
}

function ledgerAt(path: string): MediaQualitySessionLedger {
  return new MediaQualitySessionLedger({
    clock: { now: () => new Date("2026-07-17T13:00:00.000Z") },
    path,
    priorLiveCallsToday: 3,
    priorReservedExposureUsd: 0.025,
  });
}
