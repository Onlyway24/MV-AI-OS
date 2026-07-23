import { describe, expect, it, vi } from "vitest";

import { createLocalOperationsJobHandlerRegistry, type VentureOperationsJobType } from "../../src/operations-runtime/operations-handler-registry.js";
import { createOperationsLocalWorkflowCallbacks } from "../../src/operations-runtime/operations-local-workflow-callbacks.js";
import { createDefaultOperationsScheduleCatalog } from "../../src/operations-runtime/operations-schedule-catalog.js";
import type { OperationsJob, OperationsJobHandlerContext } from "../../src/operations-runtime/operations-runtime.js";
import { OperationsScheduleValidator } from "../../src/operations-runtime/operations-runtime-validator.js";
import type { RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import type { LocalWorkflowCommandBoundary } from "../../src/runtime/local-workflow-command.js";

const ventureJobs = [
  "VENTURE_OPPORTUNITY_SCAN",
  "VENTURE_EVIDENCE_REFRESH",
  "VENTURE_EXPERIMENT_REVIEW",
  "VENTURE_STALE_CHECK",
  "PORTFOLIO_DAILY_BRIEF",
  "PORTFOLIO_WEEKLY_REVIEW",
  "CAPITAL_ALLOCATION_REVIEW",
  "VENTURE_KILL_SCALE_CHECK",
] as const satisfies readonly VentureOperationsJobType[];

const clock = { now: (): Date => new Date("2026-07-23T08:00:00.000Z") };
const forbiddenBoundary = { execute: () => Promise.reject(new Error("not used")) } as unknown as LocalWorkflowCommandBoundary;

describe("Venture Holding H24 internal jobs", () => {
  it("catalogs exactly eight venture jobs with zero paid-call and zero-cost budgets", () => {
    const catalog = createDefaultOperationsScheduleCatalog({ actorId: "fabio", backupPolicyId: "local-backup", clock, firstRunAt: "2026-07-23T08:01:00.000Z", workspaceId: "workspace" });
    const schedules = catalog.filter(({ jobType }) => (ventureJobs as readonly string[]).includes(jobType));
    expect(schedules.map(({ jobType }) => jobType)).toEqual(ventureJobs);
    expect(schedules).toHaveLength(8);
    expect(schedules.every(({ budget }) => budget.maxCostCents === 0 && budget.maxProviderCalls === 0)).toBe(true);
    expect(schedules.every((schedule) => new OperationsScheduleValidator().validate(schedule).ok)).toBe(true);
  });

  it("fails closed with a precise durable blocker when no Venture policy boundary is wired", async () => {
    const callbacks = createOperationsLocalWorkflowCallbacks({
      actorId: "fabio",
      commandBoundary: forbiddenBoundary,
      dailyOperatingReport: { generate: () => Promise.resolve({ fingerprint: "d".repeat(64) }) },
      founderWorkday: { run: () => Promise.resolve({ fingerprint: "f".repeat(64) }) },
      workspaceId: "workspace",
    });
    await expect(callbacks.runVentureInternalJob({ jobType: "VENTURE_OPPORTUNITY_SCAN", operationIdentity: "venture-op-1", payload: { ventureMode: "REGISTERED_EVIDENCE_ONLY" }, signal: new AbortController().signal })).resolves.toEqual({ reasonCode: "VENTURE_POLICY_REQUIRED", resultRef: "VENTURE_POLICY_REQUIRED", status: "BLOCKED" });
  });

  it("routes every venture job to the injected local callback and preserves zero external effects", async () => {
    const runVentureInternalJob = vi.fn(() => Promise.resolve({ resultRef: "venture-local-result", status: "COMPLETED" as const }));
    const registry = createLocalOperationsJobHandlerRegistry({
      commandBoundary: forbiddenBoundary,
      localWorkflows: { runVentureInternalJob },
      repositories: {} as RepositoryTransactionRunner,
    });
    const context: OperationsJobHandlerContext = { assertCanStartExternalAction: () => Promise.resolve(), signal: new AbortController().signal };
    for (const jobType of ventureJobs) {
      const result = await registry.resolve(jobType).execute({ jobType, operationIdentity: `op-${jobType.toLowerCase()}`, payload: payloadFor(jobType) } as OperationsJob, context);
      expect(result).toEqual({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: "venture-local-result", toolCalls: 0 });
    }
    expect(runVentureInternalJob).toHaveBeenCalledTimes(8);
  });

  it("accepts only truthful boundary outcomes and returns a fingerprint-scoped local reference", async () => {
    const callbacks = createOperationsLocalWorkflowCallbacks({
      actorId: "fabio",
      commandBoundary: forbiddenBoundary,
      dailyOperatingReport: { generate: () => Promise.resolve({ fingerprint: "d".repeat(64) }) },
      founderWorkday: { run: () => Promise.resolve({ fingerprint: "f".repeat(64) }) },
      venture: { run: () => Promise.resolve({ fingerprint: "a".repeat(64), status: "COMPLETED" }) },
      workspaceId: "workspace",
    });
    await expect(callbacks.runVentureInternalJob({ jobType: "VENTURE_EXPERIMENT_REVIEW", operationIdentity: "venture-op-2", payload: { ventureMode: "EXPERIMENT_REVIEW_ONLY" }, signal: new AbortController().signal })).resolves.toEqual({ resultRef: `venture-${"a".repeat(48)}`, status: "COMPLETED" });
  });
});

function payloadFor(jobType: VentureOperationsJobType): OperationsJob["payload"] {
  if (jobType === "VENTURE_OPPORTUNITY_SCAN") return { ventureMode: "REGISTERED_EVIDENCE_ONLY" };
  if (jobType === "VENTURE_EVIDENCE_REFRESH") return { ventureMode: "REGISTERED_EVIDENCE_REFRESH" };
  if (jobType === "VENTURE_EXPERIMENT_REVIEW") return { ventureMode: "EXPERIMENT_REVIEW_ONLY" };
  if (jobType === "VENTURE_STALE_CHECK") return { ventureStaleAfterSeconds: 86_400 };
  if (jobType === "PORTFOLIO_DAILY_BRIEF" || jobType === "PORTFOLIO_WEEKLY_REVIEW") return { businessDate: "2026-07-23" };
  if (jobType === "CAPITAL_ALLOCATION_REVIEW") return { ventureMode: "CAPITAL_PROPOSAL_ONLY" };
  return { ventureMode: "KILL_SCALE_REVIEW_ONLY" };
}
