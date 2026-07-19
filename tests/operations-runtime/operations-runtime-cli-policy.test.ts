import { afterEach, describe, expect, it, vi } from "vitest";

import {
  operationsLoopDelayMs,
  runOperationsWorkerLoop,
  shouldWriteOperationsLoopStatus,
} from "../../src/operations-runtime/operations-runtime-cli.js";
import type { OperationsWorkerRunResult } from "../../src/operations-runtime/operations-runtime.js";
import type { OperationsWorkerService } from "../../src/operations-runtime/operations-worker-service.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("Operations Runtime CLI loop policy", () => {
  it("uses slow timers for STOPPED and LEASE_HELD without suppressing productive work", () => {
    expect(operationsLoopDelayMs("worker", "STOPPED")).toBe(30_000);
    expect(operationsLoopDelayMs("scheduler", "LEASE_HELD")).toBe(30_000);
    expect(operationsLoopDelayMs("scheduler", "STOPPED")).toBe(30_000);
    expect(operationsLoopDelayMs("scheduler", "IDLE")).toBe(5_000);
    expect(operationsLoopDelayMs("worker", "IDLE")).toBe(2_000);
    expect(operationsLoopDelayMs("worker", "COMPLETED")).toBe(50);
  });

  it("logs noisy stopped states only on transition", () => {
    expect(shouldWriteOperationsLoopStatus(undefined, "STOPPED")).toBe(true);
    expect(shouldWriteOperationsLoopStatus("STOPPED", "STOPPED")).toBe(false);
    expect(shouldWriteOperationsLoopStatus("IDLE", "STOPPED")).toBe(true);
    expect(shouldWriteOperationsLoopStatus(undefined, "LEASE_HELD")).toBe(true);
    expect(shouldWriteOperationsLoopStatus("LEASE_HELD", "LEASE_HELD")).toBe(false);
    expect(shouldWriteOperationsLoopStatus("SCHEDULED", "SCHEDULED")).toBe(true);
    expect(shouldWriteOperationsLoopStatus("COMPLETED", "IDLE")).toBe(false);
  });

  it("turns a CLI stop signal into one awaited worker close while a run is active", async () => {
    let settleRun: ((result: OperationsWorkerRunResult) => void) | undefined;
    const activeRun = new Promise<OperationsWorkerRunResult>((resolve) => { settleRun = resolve; });
    const close = vi.fn(() => {
      settleRun?.(result("STOPPED"));
      return Promise.resolve();
    });
    const service: Pick<OperationsWorkerService, "close" | "recoverExpiredClaims" | "runOnce"> = {
      close,
      recoverExpiredClaims: vi.fn(() => Promise.resolve(0)),
      runOnce: vi.fn(() => activeRun),
    };
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const controller = new AbortController();
    const loop = runOperationsWorkerLoop(service, controller.signal);
    await vi.waitFor(() => { expect(service.runOnce).toHaveBeenCalledTimes(1); });
    controller.abort();
    await expect(loop).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
    output.mockRestore();
  });
});

function result(status: OperationsWorkerRunResult["status"]): OperationsWorkerRunResult {
  return Object.freeze({
    contractVersion: "1",
    recoveredExpiredClaims: 0,
    status,
    unauthorizedExternalEffectOccurred: false,
  });
}
