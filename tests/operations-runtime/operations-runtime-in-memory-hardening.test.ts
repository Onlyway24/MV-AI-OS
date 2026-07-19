import { describe, expect, it } from "vitest";

import { OperationsRuntimeControlService } from "../../src/operations-runtime/operations-runtime-control-service.js";
import type { OperationsJob, OperationsJobHandlerRegistry } from "../../src/operations-runtime/operations-runtime.js";
import { createOperationsPayloadFingerprint } from "../../src/operations-runtime/operations-runtime-validator.js";
import { OperationsWorkerService } from "../../src/operations-runtime/operations-worker-service.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";

describe("Operations Runtime in-memory P1 hardening", () => {
  it("retains usage and the one-shot successor reservation after terminal cleanup", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const clock = Object.freeze({ now: () => new Date("2026-07-19T08:00:00.000Z") });
    const successor = job("successor-first", "predecessor-terminal");
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(successor));
    const handlers: OperationsJobHandlerRegistry = Object.freeze({
      resolve: () => Object.freeze({
        execute: () => Promise.resolve({
          costCents: 2,
          externalEffectsExecuted: false as const,
          providerCalls: 1,
          toolCalls: 3,
        }),
      }),
    });
    const worker = new OperationsWorkerService({
      clock,
      handlers,
      instanceId: "memory-hardening-worker",
      repositories,
      workerId: "primary",
      workspaceId: "workspace",
    });
    await expect(worker.runOnce()).resolves.toMatchObject({ status: "COMPLETED" });
    await worker.close();
    const usageBefore = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarizeUsage("workspace"));
    expect(usageBefore).toEqual({ attempts: 1, costCents: 2, externalEffectsExecuted: false, providerCalls: 1, toolCalls: 3 });

    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: "workspace" });
    await expect(controls.enforceRetention({
      jobLimit: 1,
      retainNewestEvents: 100,
      terminalBefore: "2026-07-19T08:00:01.000Z",
    })).resolves.toMatchObject({ jobsDeleted: 1 });
    const retained = await repositories.transaction(async ({ operationsRuntime }) => ({
      job: await operationsRuntime.getJobById(successor.jobId),
      reservation: await operationsRuntime.getSuccessorByPredecessor("workspace", "predecessor-terminal"),
      usage: await operationsRuntime.summarizeUsage("workspace"),
    }));
    expect(retained.job).toBeUndefined();
    expect(retained.reservation).toEqual({ predecessorJobId: "predecessor-terminal", successorJobId: successor.jobId, workspaceId: "workspace" });
    expect(retained.usage).toEqual(usageBefore);
    await expect(repositories.transaction(({ operationsRuntime }) =>
      operationsRuntime.insertJob(job("successor-second", "predecessor-terminal"))))
      .rejects.toThrow("predecessor already has a successor");
  });
});

function job(jobId: string, predecessorJobId: string): OperationsJob {
  const payload = Object.freeze({});
  const timestamp = "2026-07-19T08:00:00.000Z";
  return Object.freeze({
    actorId: "fabio",
    attempt: 0,
    budget: Object.freeze({ maxCostCents: 10, maxProviderCalls: 2, maxToolCalls: 5 }),
    contractVersion: "1",
    createdAt: timestamp,
    heartbeatIntervalMs: 250,
    jobId,
    jobType: "EVIDENCE_FRESHNESS_CHECK",
    leaseDurationMs: 5_000,
    operationIdentity: `operation-${jobId}`,
    owner: "operations",
    payload,
    payloadFingerprint: createOperationsPayloadFingerprint(payload),
    predecessorJobId,
    priority: 50,
    recoveryStrategy: "RETRY_OR_DEAD_LETTER",
    retryPolicy: Object.freeze({ automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 }),
    runAfter: timestamp,
    scheduledFor: timestamp,
    status: "QUEUED",
    timeoutMs: 5_000,
    updatedAt: timestamp,
    version: 0,
    workspaceId: "workspace",
  });
}
