import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LivePilotSessionLedger,
} from "../../src/index.js";

describe("Live pilot session ledger", () => {
  it("enforces a disabled start, atomic one-use operations, relock, and restart persistence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-live-ledger-"));
    const clock = new AdjustableClock("2026-07-17T09:00:00.000Z");
    const path = join(directory, "closure.sqlite");
    const ledger = new LivePilotSessionLedger({ clock, path });
    try {
      ledger.createDisabled(session("closure-one", "2026-07-17T09:15:00.000Z"));
      expect(ledger.preflight("closure-one", "OPENAI_TEXT_PROVIDER_SMOKE", "gpt-4o-mini", 0.005)).toMatchObject({
        reason: "session_not_active",
        status: "blocked",
      });
      ledger.activate("closure-one");

      ledger.reserve({
        maxCostUsd: 0.005,
        operation: "OPENAI_TEXT_PROVIDER_SMOKE",
        operationId: "text-one",
        sessionId: "closure-one",
      });
      expect(() => {
        ledger.reserve({
          maxCostUsd: 0.005,
          operation: "OPENAI_TEXT_PROVIDER_SMOKE",
          operationId: "text-replay",
          sessionId: "closure-one",
        });
      }).toThrow(expect.objectContaining({ code: "live_pilot_operation_duplicate" }));
      ledger.reconcile("closure-one", "text-one", { actualCostUsd: 0.00006, status: "succeeded" });
      ledger.reserve({
        maxCostUsd: 0.006,
        operation: "OPENAI_METODO_VELOCE_MASTER_IMAGE",
        operationId: "image-one",
        sessionId: "closure-one",
      });
      ledger.reconcile("closure-one", "image-one", { actualCostUsd: 0.006, status: "succeeded" });

      expect(ledger.snapshot("closure-one")).toMatchObject({
        actualCostUsd: 0.00606,
        authorizedCounts: { image: 1, providerCalls: 2, text: 1 },
        status: "RELOCKED",
      });
      ledger.closeDatabase();

      const reopened = new LivePilotSessionLedger({ clock, path });
      try {
        expect(reopened.snapshot("closure-one")).toMatchObject({ status: "RELOCKED" });
        expect(() => {
          reopened.reserve({
            maxCostUsd: 0.006,
            operation: "OPENAI_METODO_VELOCE_MASTER_IMAGE",
            operationId: "image-replay",
            sessionId: "closure-one",
          });
        }).toThrow(expect.objectContaining({ code: "live_pilot_preflight_blocked" }));
      } finally {
        reopened.closeDatabase();
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("expires a session and blocks an image after the daily image allocation was consumed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-live-ledger-"));
    const clock = new AdjustableClock("2026-07-17T09:00:00.000Z");
    const ledger = new LivePilotSessionLedger({ clock, path: join(directory, "closure.sqlite") });
    try {
      ledger.createDisabled(session("expired", "2026-07-17T09:01:00.000Z"));
      ledger.activate("expired");
      clock.set("2026-07-17T09:01:00.000Z");
      expect(ledger.preflight("expired", "OPENAI_TEXT_PROVIDER_SMOKE", "gpt-4o-mini", 0.005)).toMatchObject({
        reason: "session_not_active",
        status: "blocked",
      });
      expect(ledger.snapshot("expired").status).toBe("EXPIRED");

      clock.set("2026-07-17T10:00:00.000Z");
      ledger.createDisabled(session("image-a", "2026-07-17T10:15:00.000Z"));
      ledger.activate("image-a");
      ledger.reserve({ maxCostUsd: 0.006, operation: "OPENAI_METODO_VELOCE_MASTER_IMAGE", operationId: "image-a", sessionId: "image-a" });
      ledger.reconcile("image-a", "image-a", { actualCostUsd: 0.006, status: "succeeded" });

      ledger.createDisabled(session("image-b", "2026-07-17T10:15:00.000Z"));
      ledger.activate("image-b");
      expect(ledger.preflight("image-b", "OPENAI_METODO_VELOCE_MASTER_IMAGE", "gpt-image-1-mini", 0.006)).toMatchObject({
        reason: "daily_image_cap_reached",
        status: "blocked",
      });
    } finally {
      ledger.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });
});

class AdjustableClock {
  #value: Date;

  public constructor(value: string) {
    this.#value = new Date(value);
  }

  public now(): Date {
    return this.#value;
  }

  public set(value: string): void {
    this.#value = new Date(value);
  }
}

function session(sessionId: string, expiresAt: string) {
  return {
    actorId: "Fabio" as const,
    expiresAt,
    sessionId,
    workspaceId: "metodo-veloce-live-ai-pilot",
  };
}
