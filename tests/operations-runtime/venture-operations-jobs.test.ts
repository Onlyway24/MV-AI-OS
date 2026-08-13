import { describe, expect, it, vi } from "vitest";

import { createLocalOperationsJobHandlerRegistry, type VentureOperationsJobType } from "../../src/operations-runtime/operations-handler-registry.js";
import { createOperationsLocalWorkflowCallbacks } from "../../src/operations-runtime/operations-local-workflow-callbacks.js";
import { createDefaultOperationsScheduleCatalog } from "../../src/operations-runtime/operations-schedule-catalog.js";
import type { OperationsJob, OperationsJobHandlerContext } from "../../src/operations-runtime/operations-runtime.js";
import { OperationsScheduleValidator } from "../../src/operations-runtime/operations-runtime-validator.js";
import type { RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SqliteVentureHoldingTransactionRunner } from "../../src/persistence/sqlite/sqlite-venture-holding-transaction-runner.js";
import type { LocalWorkflowCommandBoundary } from "../../src/runtime/local-workflow-command.js";
import { RepositoryBackedVentureOperationsBoundary } from "../../src/operations-runtime/repository-backed-venture-operations-boundary.js";

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

  it("runs every enabled job through the real durable production adapter", async () => {
    await withDatabase(async (path) => {
      const core = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const venture = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
      const boundary = new RepositoryBackedVentureOperationsBoundary({
        actorId: "fabio",
        clock,
        coreRepositories: core,
        repositories: venture,
        workspaceId: "workspace",
      });
      const callbacks = createOperationsLocalWorkflowCallbacks({
        actorId: "fabio",
        commandBoundary: forbiddenBoundary,
        dailyOperatingReport: { generate: () => Promise.resolve({ fingerprint: "d".repeat(64) }) },
        founderWorkday: { run: () => Promise.resolve({ fingerprint: "f".repeat(64) }) },
        venture: boundary,
        workspaceId: "workspace",
      });

      const results = [];
      for (const jobType of ventureJobs) {
        results.push(await callbacks.runVentureInternalJob({
          jobType,
          operationIdentity: `production-${jobType.toLowerCase()}`,
          payload: payloadFor(jobType),
          signal: new AbortController().signal,
        }));
      }
      expect(results).toEqual([
        expect.objectContaining({ reasonCode: "VENTURE_EVIDENCE_COVERAGE_REQUIRED", status: "BLOCKED" }),
        expect.objectContaining({ reasonCode: "VENTURE_EVIDENCE_COVERAGE_REQUIRED", status: "BLOCKED" }),
        expect.objectContaining({ reasonCode: "VENTURE_REAL_OBSERVATION_REQUIRED", status: "BLOCKED" }),
        expect.objectContaining({ status: "COMPLETED" }),
        expect.objectContaining({ status: "COMPLETED" }),
        expect.objectContaining({ status: "COMPLETED" }),
        expect.objectContaining({ reasonCode: "VENTURE_POLICY_REQUIRED", status: "BLOCKED" }),
        expect.objectContaining({ reasonCode: "VENTURE_POLICY_REQUIRED", status: "BLOCKED" }),
      ]);
      expect(results.every(({ resultRef }) => /^venture-[a-f0-9]{48}$/u.test(resultRef))).toBe(true);
      const durable = await venture.transaction(async (repository) => ({
        briefs: await repository.listRecords({ actorId: "fabio", limit: 10, type: "FOUNDER_PORTFOLIO_BRIEF", workspaceId: "workspace" }),
        portfolio: await repository.getRecord({ actorId: "fabio", entityId: "onlyway-portfolio", type: "VENTURE_PORTFOLIO", workspaceId: "workspace" }),
        receipt: await repository.getCommandReceipt({ actorId: "fabio", workspaceId: "workspace" }, "onlyway-venture-001-run-v1"),
      }));
      expect(durable).toMatchObject({ briefs: [{ externalEffects: "ZERO" }, {}, {}], portfolio: { externalActions: "LOCKED", publication: "LOCKED" }, receipt: { status: "COMMITTED" } });

      await venture.close();
      await core.close();
    });
  });

  it("reuses the durable Venture initialization after clock advance and restart", async () => {
    await withDatabase(async (path) => {
      let current = Date.parse("2026-07-23T08:00:00.000Z");
      const advancingClock = { now: (): Date => new Date(current) };
      const firstCore = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const firstVenture = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
      const first = new RepositoryBackedVentureOperationsBoundary({ actorId: "fabio", clock: advancingClock, coreRepositories: firstCore, repositories: firstVenture, workspaceId: "workspace" });
      await expect(first.run({ jobType: "VENTURE_OPPORTUNITY_SCAN", operationIdentity: "restart-scan", payload: payloadFor("VENTURE_OPPORTUNITY_SCAN"), signal: new AbortController().signal })).resolves.toMatchObject({ reasonCode: "VENTURE_EVIDENCE_COVERAGE_REQUIRED", status: "BLOCKED" });
      await firstVenture.close();
      await firstCore.close();

      current += 24 * 60 * 60 * 1_000;
      const secondCore = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const secondVenture = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
      const second = new RepositoryBackedVentureOperationsBoundary({ actorId: "fabio", clock: advancingClock, coreRepositories: secondCore, repositories: secondVenture, workspaceId: "workspace" });
      await expect(second.run({ jobType: "PORTFOLIO_DAILY_BRIEF", operationIdentity: "restart-daily", payload: payloadFor("PORTFOLIO_DAILY_BRIEF"), signal: new AbortController().signal })).resolves.toMatchObject({ status: "COMPLETED" });
      const receipts = await secondVenture.transaction((repository) => repository.listAudit({ actorId: "fabio", workspaceId: "workspace" }, 10));
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({ commandId: "onlyway-venture-001-run-v1", outcome: "COMMITTED" });
      await secondVenture.close();
      await secondCore.close();
    });
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

async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-venture-operations-"));
  try { await test(join(directory, "runtime.sqlite")); }
  finally { await rm(directory, { force: true, recursive: true }); }
}
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
