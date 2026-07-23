import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositoryConflictError } from "../../src/errors/core-error.js";
import { controlFingerprint } from "../../src/operations-control/operations-control-validator.js";
import { createLocalOperationsJobHandlerRegistry, ImmutableOperationsJobHandlerRegistry } from "../../src/operations-runtime/operations-handler-registry.js";
import { createOperationsLocalWorkflowCallbacks } from "../../src/operations-runtime/operations-local-workflow-callbacks.js";
import { closeOperationsRuntimeResources, operationsWorkerLogProjection, runOperationsRuntimeCli } from "../../src/operations-runtime/operations-runtime-cli.js";
import { OperationsRuntimeControlService } from "../../src/operations-runtime/operations-runtime-control-service.js";
import { createDefaultOperationsScheduleCatalog, registerDefaultOperationsScheduleCatalog } from "../../src/operations-runtime/operations-schedule-catalog.js";
import { OPERATIONS_JOB_TYPES, type OperationsExecutionResult, type OperationsJob, type OperationsJobHandler, type OperationsJobPayload } from "../../src/operations-runtime/operations-runtime.js";
import { createOperationsPayloadFingerprint } from "../../src/operations-runtime/operations-runtime-validator.js";
import { createOperationsSchedule, OperationsSchedulerService } from "../../src/operations-runtime/operations-scheduler-service.js";
import { OperationsWorkerService } from "../../src/operations-runtime/operations-worker-service.js";
import { SupervisedProcessLock } from "../../src/operations-runtime/supervised-process-lock.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SQLITE_SCHEMA_VERSION } from "../../src/persistence/sqlite/sqlite-schema.js";
import type { LocalWorkflowCommandBoundary } from "../../src/runtime/local-workflow-command.js";

const roots: string[] = [];
const POST_V26_TABLES = Object.freeze([
  "reference_vault_audit_events",
  "reference_vault_command_receipts",
  "reference_vault_records",
  "reference_vault_blobs",
  "control_action_receipts",
  "control_action_proposals",
  "daily_operating_briefs",
  "founder_workdays",
  "operations_incidents",
  "operations_job_successors",
  "operations_runtime_usage_rollups",
  "production_controls",
  "venture_audit_events",
  "venture_command_receipts",
  "venture_events",
  "venture_records",
  "venture_runtime_controls",
]);
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true }))); });

describe("supervised Operations Runtime", () => {
  it("projects worker logs without payload, operation identity, receipt, or lease data", () => {
    const job = createTypedJob(new MutableClock("2026-07-19T08:00:00.000Z"), "job-private-log", "AGENT_COMPANY_WORKDAY_START", { budgetCents: 0, workdayId: "private-workday" });
    const projection = operationsWorkerLogProjection({ contractVersion: "1", job, recoveredExpiredClaims: 0, status: "COMPLETED", unauthorizedExternalEffectOccurred: false });
    const serialized = JSON.stringify(projection);
    expect(projection).toMatchObject({ job: { attempt: 0, jobId: "job-private-log", jobType: "AGENT_COMPANY_WORKDAY_START", status: "QUEUED", version: 0 }, role: "worker" });
    expect(serialized).not.toContain("private-workday");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("operationIdentity");
    expect(serialized).not.toContain("receipt");
    expect(serialized).not.toContain("lease");
  });

  it("provisions the complete zero-paid-call schedule catalog idempotently across restarts", async () => {
    const { clock, repositories } = await fixture();
    const first = scheduler(repositories, clock, "scheduler-catalog");
    const catalog = createDefaultOperationsScheduleCatalog({ actorId: "fabio", backupPolicyId: "local-backup", clock, workspaceId: "workspace" });
    expect(catalog.map(({ jobType }) => jobType).sort()).toEqual([...OPERATIONS_JOB_TYPES].sort());
    expect(catalog.every(({ budget, retryPolicy }) => budget.maxCostCents === 0 && budget.maxProviderCalls === 0 && budget.maxToolCalls > 0 && retryPolicy.automaticRetries <= 2)).toBe(true);
    await expect(registerDefaultOperationsScheduleCatalog(first, catalog)).resolves.toHaveLength(OPERATIONS_JOB_TYPES.length);
    await first.close();

    clock.advance(25 * 60 * 60 * 1_000);
    const restarted = scheduler(repositories, clock, "scheduler-catalog-restarted");
    const replay = createDefaultOperationsScheduleCatalog({ actorId: "fabio", backupPolicyId: "local-backup", clock, workspaceId: "workspace" });
    await expect(registerDefaultOperationsScheduleCatalog(restarted, replay)).resolves.toHaveLength(OPERATIONS_JOB_TYPES.length);
    const due = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.listDueSchedules("workspace", new Date(clock.now().getTime() + 30 * 60 * 1_000).toISOString(), 100));
    expect(due).toHaveLength(OPERATIONS_JOB_TYPES.length);
    await restarted.close();
    await repositories.close();
  });

  it("migrates a real v26 fixture without losing its schedule, then materializes it once under a singleton lease", async () => {
    const root = await tempRoot();
    const path = join(root, "runtime.sqlite");
    const clock = new MutableClock("2026-07-19T08:00:00.000Z");
    const schedule = createSchedule(clock, "schedule-morning");
    const legacyJob = createJob(clock, "job-v26-preserved", { automaticRetries: 1, initialBackoffMs: 1_000, maxBackoffMs: 2_000 });

    const current = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await current.transaction(async ({ operationsRuntime }) => {
      await operationsRuntime.insertSchedule(schedule);
      await operationsRuntime.insertJob(legacyJob);
    });
    await current.close();

    downgradeCurrentDatabaseToV26(path);
    const legacy = new DatabaseSync(path, { readOnly: true });
    try {
      expect(readUserVersion(legacy)).toBe(26);
      expect(readTableNames(legacy)).not.toEqual(expect.arrayContaining([...POST_V26_TABLES]));
      expect(legacy.prepare("SELECT COUNT(*) AS count FROM operations_schedules WHERE schedule_id = ?").get(schedule.scheduleId)).toEqual({ count: 1 });
      expect(legacy.prepare("SELECT COUNT(*) AS count FROM operations_jobs WHERE job_id = ?").get(legacyJob.jobId)).toEqual({ count: 1 });
      expect(readTableSql(legacy, "operations_jobs")).not.toContain("'BLOCKED'");
      expect(readTableSql(legacy, "telegram_inbound_receipts")).not.toContain("'DELIVERY_UNCERTAIN'");
    } finally {
      legacy.close();
    }

    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.getScheduleById(schedule.scheduleId))).resolves.toEqual(schedule);
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.getJobById(legacyJob.jobId))).resolves.toEqual(legacyJob);
    const first = scheduler(repositories, clock, "scheduler-a");
    const second = scheduler(repositories, clock, "scheduler-b");
    await expect(first.registerSchedule(schedule)).resolves.toEqual(schedule);
    await expect(first.registerSchedule(schedule)).resolves.toEqual(schedule);

    const tick = await first.tick();
    expect(tick.status).toBe("SCHEDULED");
    expect(tick.enqueuedJobIds).toHaveLength(1);
    await expect(second.tick()).resolves.toMatchObject({ status: "LEASE_HELD" });
    await expect(first.tick()).resolves.toMatchObject({ status: "IDLE" });

    const state = await repositories.transaction(async ({ operationalEvents, operationsRuntime }) => ({
      events: await operationalEvents.listAfter("workspace", 0, 20),
      job: await operationsRuntime.getJobByOperationIdentity("workspace", operationIdentity(schedule.scheduleId, schedule.nextRunAt)),
    }));
    expect(state.job).toMatchObject({ attempt: 0, status: "QUEUED", version: 0 });
    expect(state.events.map(({ eventType }) => eventType)).toEqual(["JOB_QUEUED"]);
    await first.close();
    await second.close();
    await repositories.close();

    const verified = new DatabaseSync(path, { readOnly: true });
    try {
      expect(readUserVersion(verified)).toBe(SQLITE_SCHEMA_VERSION);
      expect(readMigrationVersionsAfterV26(verified)).toEqual(Array.from({ length: SQLITE_SCHEMA_VERSION - 26 }, (_, index) => index + 27));
      expect(readTableNames(verified)).toEqual(expect.arrayContaining([...POST_V26_TABLES]));
      expect(readTableSql(verified, "operations_jobs")).toContain("'BLOCKED'");
      expect(readTableSql(verified, "telegram_inbound_receipts")).toContain("'DELIVERY_UNCERTAIN'");
      expect(readIndexNames(verified)).toContain("telegram_outbound_deliveries_update");
    } finally {
      verified.close();
    }
  });

  it("claims and completes atomically with a durable receipt and redacted events", async () => {
    const { clock, repositories } = await fixture();
    const scheduled = scheduler(repositories, clock, "scheduler-a");
    await scheduled.registerSchedule(createSchedule(clock, "schedule-complete"));
    await scheduled.tick();
    await scheduled.close();
    const worker = createWorker(repositories, clock, "worker-a", delayedSuccessHandler("result-local"));

    const result = await worker.runOnce();
    expect(result).toMatchObject({ recoveredExpiredClaims: 0, status: "COMPLETED", unauthorizedExternalEffectOccurred: false });
    expect(result.job).toMatchObject({ attempt: 1, receipt: { costCents: 0, externalEffectsExecuted: false, resultRef: "result-local" }, status: "COMPLETED" });
    const durable = await repositories.transaction(async ({ operationalEvents, operationsRuntime }) => ({ attempts: await operationsRuntime.listAttempts(result.job?.jobId ?? "missing"), events: await operationalEvents.listAfter("workspace", 0, 20) }));
    expect(durable.attempts).toHaveLength(1);
    expect(durable.events.map(({ eventType }) => eventType)).toEqual(["JOB_QUEUED", "JOB_LEASE_ACQUIRED", "JOB_HEARTBEAT", "JOB_COMPLETED"]);
    expect(JSON.stringify(durable.events)).not.toMatch(/prompt|secret|token/i);
    const overview = await repositories.transaction(async ({ operationsRuntime }) => ({ jobs: await operationsRuntime.listJobsByWorkspaceId("workspace", 10), usage: await operationsRuntime.summarizeUsage("workspace") }));
    expect(overview.usage).toEqual({ attempts: 1, costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 });
    expect(overview.jobs).toMatchObject([{ attempt: 1, jobId: result.job?.jobId, jobType: "EVIDENCE_FRESHNESS_CHECK", receipt: { costCents: 0, externalEffectsExecuted: false, outcome: "COMPLETED", providerCalls: 0, toolCalls: 0 }, status: "COMPLETED" }]);
    expect(overview.jobs[0]).not.toHaveProperty("payload");
    expect(overview.jobs[0]).not.toHaveProperty("operationIdentity");
    expect(overview.jobs[0]).not.toHaveProperty("lease");
    expect(overview.jobs[0]?.receipt).not.toHaveProperty("resultRef");
    expect(overview.jobs[0]?.targetFingerprint).toBe(controlFingerprint(result.job));
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.listJobsByWorkspaceId("workspace", 251))).rejects.toThrow("Operations list limit is invalid");
    await worker.close();
    await repositories.close();
  });

  it("dispatches Founder Workday and Daily Operating Report through injected local callbacks", async () => {
    const { clock, repositories } = await fixture();
    const startAgentCompanyWorkday = vi.fn(() => Promise.resolve({ resultRef: "founder-workday-receipt", status: "COMPLETED" as const }));
    const generateDailyOperatingReport = vi.fn(() => Promise.resolve({ resultRef: "daily-brief-receipt", status: "COMPLETED" as const }));
    const forbiddenExecute = vi.fn(() => Promise.reject(new Error("legacy command boundary must not run")));
    const forbiddenBoundary = { execute: forbiddenExecute } as unknown as LocalWorkflowCommandBoundary;
    const handlers = createLocalOperationsJobHandlerRegistry({ commandBoundary: forbiddenBoundary, localWorkflows: { generateDailyOperatingReport, startAgentCompanyWorkday }, repositories });
    const worker = new OperationsWorkerService({ clock, handlers, instanceId: "callback-worker", repositories, workerId: "primary", workspaceId: "workspace" });
    await repositories.transaction(async ({ operationsRuntime }) => {
      await operationsRuntime.insertJob(createTypedJob(clock, "job-founder", "AGENT_COMPANY_WORKDAY_START", { budgetCents: 0, workdayId: "founder-workday-2026-07-19" }));
      await operationsRuntime.insertJob(createTypedJob(clock, "job-daily", "DAILY_OPERATING_REPORT", { businessDate: "2026-07-19" }, 49));
    });
    await expect(worker.runOnce()).resolves.toMatchObject({ job: { receipt: { resultRef: "founder-workday-receipt" } }, status: "COMPLETED" });
    await expect(worker.runOnce()).resolves.toMatchObject({ job: { receipt: { resultRef: "daily-brief-receipt" } }, status: "COMPLETED" });
    expect(startAgentCompanyWorkday).toHaveBeenCalledWith(expect.objectContaining({ budgetCents: 0, workdayId: "founder-workday-2026-07-19" }));
    expect(generateDailyOperatingReport).toHaveBeenCalledWith(expect.objectContaining({ businessDate: "2026-07-19" }));
    expect(forbiddenExecute).not.toHaveBeenCalled();
    await worker.close();
    await repositories.close();
  });

  it("propagates the durable Agent Company blocker through the local workflow callback", async () => {
    const execute = vi.fn(() => Promise.resolve({
      commandId: "agent-company-blocked-command",
      contractVersion: "1" as const,
      nextAction: "Resolve the durable blocker",
      operation: "RUN_AGENT_COMPANY_WORKDAY" as const,
      replayed: false,
      result: { inputFingerprint: "a".repeat(64), status: "BLOCKED", tasks: [{ blocker: { reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, status: "BLOCKED" }] },
      status: "ok" as const,
      unauthorizedExternalEffectOccurred: false as const,
    }));
    const callbacks = createOperationsLocalWorkflowCallbacks({
      actorId: "fabio",
      commandBoundary: { execute } as unknown as LocalWorkflowCommandBoundary,
      dailyOperatingReport: { generate: () => Promise.resolve({ fingerprint: "d".repeat(64) }) },
      founderWorkday: { run: () => Promise.resolve({ fingerprint: "f".repeat(64) }) },
      workspaceId: "workspace",
    });

    await expect(callbacks.startAgentCompanyWorkday({ budgetCents: 0, operationIdentity: "agent-company-blocked-operation", signal: new AbortController().signal, workday: {} as never, workdayId: "founder-workday-2026-07-19" })).resolves.toMatchObject({
      reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED",
      status: "BLOCKED",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("persists a missing Agent Company input as a precise non-retryable BLOCKED receipt", async () => {
    const { clock, repositories } = await fixture();
    const forbiddenBoundary = { execute: vi.fn(() => Promise.reject(new Error("must not execute without selected input"))) } as unknown as LocalWorkflowCommandBoundary;
    const handlers = createLocalOperationsJobHandlerRegistry({
      commandBoundary: forbiddenBoundary,
      localWorkflows: {
        generateDailyOperatingReport: () => Promise.resolve({ resultRef: "daily-unused", status: "COMPLETED" }),
        startAgentCompanyWorkday: () => Promise.resolve({ reasonCode: "AGENT_COMPANY_INPUT_REQUIRED", resultRef: "AGENT_COMPANY_INPUT_REQUIRED", status: "BLOCKED" }),
      },
      repositories,
    });
    const worker = new OperationsWorkerService({ clock, handlers, instanceId: "blocked-input-worker", repositories, workerId: "primary", workspaceId: "workspace" });
    const blockedJob = createTypedJob(clock, "job-agent-input-required", "AGENT_COMPANY_WORKDAY_START", { budgetCents: 0, workdayId: "founder-workday-2026-07-19" });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(blockedJob));
    await expect(worker.runOnce()).resolves.toMatchObject({ job: { block: { code: "AGENT_COMPANY_INPUT_REQUIRED" }, receipt: { outcome: "BLOCKED", reasonCode: "AGENT_COMPANY_INPUT_REQUIRED", resultRef: "AGENT_COMPANY_INPUT_REQUIRED" }, status: "BLOCKED" }, status: "BLOCKED" });
    const durable = await repositories.transaction(async ({ operationalEvents, operationsRuntime }) => ({ attempts: await operationsRuntime.listAttempts(blockedJob.jobId), counts: await operationsRuntime.summarize("workspace"), events: await operationalEvents.listAfter("workspace", 0, 20) }));
    expect(durable.attempts).toMatchObject([{ outcome: "BLOCKED", reasonCode: "AGENT_COMPANY_INPUT_REQUIRED" }]);
    expect(durable.counts.blocked).toBe(1);
    expect(durable.events.map(({ eventType }) => eventType)).toContain("JOB_BLOCKED");
    clock.advance(2_000);
    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: "workspace" });
    await expect(controls.enforceRetention({ jobLimit: 1, retainNewestEvents: 100, terminalBefore: clock.now().toISOString() })).resolves.toMatchObject({ jobsDeleted: 1 });
    expect((await repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarizeUsage("workspace"))).attempts).toBe(1);
    await worker.close();
    await repositories.close();
  });

  it("executes truthful local contracts for every formerly generic snapshot job", async () => {
    const { clock, repositories } = await fixture();
    const generateDailyOperatingReport = vi.fn(() => Promise.resolve({ resultRef: "morning-durable-brief", status: "COMPLETED" as const }));
    const handlers = createLocalOperationsJobHandlerRegistry({
      commandBoundary: { execute: vi.fn(() => Promise.reject(new Error("command boundary is not used"))) } as unknown as LocalWorkflowCommandBoundary,
      localWorkflows: { generateDailyOperatingReport, startAgentCompanyWorkday: () => Promise.resolve({ reasonCode: "AGENT_COMPANY_INPUT_REQUIRED", resultRef: "unused", status: "BLOCKED" }) },
      repositories,
    });
    const worker = new OperationsWorkerService({ clock, handlers, instanceId: "truthful-local-worker", repositories, workerId: "primary", workspaceId: "workspace" });
    const jobs = [
      createTypedJob(clock, "job-morning", "MORNING_SYSTEM_BRIEF", { businessDate: "2026-07-19" }, 60),
      createTypedJob(clock, "job-evidence", "EVIDENCE_FRESHNESS_CHECK", {}, 59),
      createTypedJob(clock, "job-reminder", "PENDING_APPROVAL_REMINDER", { delivery: "CONTROL_CENTER_ONLY" }, 58),
      createTypedJob(clock, "job-stale", "STALE_TASK_DETECTION", { staleAfterSeconds: 3_600 }, 57),
      createTypedJob(clock, "job-cost", "COST_AND_BUDGET_CHECK", { window: "TODAY" }, 56),
      createTypedJob(clock, "job-security", "SECURITY_POSTURE_CHECK", {}, 55),
    ];
    await repositories.transaction(async ({ operationsRuntime }) => { for (const job of jobs) await operationsRuntime.insertJob(job); });
    const results = [];
    for (let remaining = jobs.length; remaining > 0; remaining -= 1) results.push(await worker.runOnce());
    expect(results.map(({ status }) => status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "BLOCKED", "BLOCKED"]);
    expect(generateDailyOperatingReport).toHaveBeenCalledWith(expect.objectContaining({ businessDate: "2026-07-19" }));
    const durable = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.listJobsByWorkspaceId("workspace", 20));
    expect(durable.find(({ jobId }) => jobId === "job-cost")).toMatchObject({ blockCode: "COST_LEDGER_COVERAGE_REQUIRED", receipt: { outcome: "BLOCKED" } });
    expect(durable.find(({ jobId }) => jobId === "job-security")).toMatchObject({ blockCode: "SECURITY_POSTURE_COVERAGE_REQUIRED", receipt: { outcome: "BLOCKED" } });
    expect(durable.filter(({ status }) => status === "COMPLETED").every(({ receipt }) => receipt?.outcome === "COMPLETED")).toBe(true);
    await worker.close();
    await repositories.close();
  });

  it("uses bounded retry, dead-letter and expired-lease recovery without duplicate execution", async () => {
    const { clock, repositories } = await fixture();
    const job = createJob(clock, "job-recovery", { automaticRetries: 1, initialBackoffMs: 1_000, maxBackoffMs: 1_000 });
    await repositories.transaction(async ({ operationsRuntime }) => {
      await operationsRuntime.insertJob(job);
      await operationsRuntime.claimNextDue({ fencingToken: 1, leaseId: "lease-abandoned", now: clock.now().toISOString(), workerId: "dead-worker", workspaceId: "workspace" });
    });
    clock.advance(6_000);
    const worker = createWorker(repositories, clock, "worker-recovery", failingHandler());
    const recovered = await worker.runOnce();
    expect(recovered.recoveredExpiredClaims).toBe(1);
    const retry = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.getJobById(job.jobId));
    expect(retry).toMatchObject({ attempt: 1, lastFailure: { code: "LEASE_EXPIRED", retryable: true }, status: "RETRY_SCHEDULED" });

    clock.advance(1_000);
    const exhausted = await worker.runOnce();
    expect(exhausted.status).toBe("DEAD_LETTER");
    expect(exhausted.job).toMatchObject({ attempt: 2, lastFailure: { code: "EXECUTION_FAILED", retryable: false }, status: "DEAD_LETTER" });
    const attempts = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.listAttempts(job.jobId));
    expect(attempts.map(({ attempt, outcome }) => ({ attempt, outcome }))).toEqual([{ attempt: 1, outcome: "RETRY_SCHEDULED" }, { attempt: 2, outcome: "DEAD_LETTER" }]);
    await worker.close();
    await repositories.close();
  });

  it("enforces a hard timeout without retrying past the configured budget", async () => {
    const { clock, repositories } = await fixture();
    const base = createJob(clock, "job-timeout", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob({ ...base, timeoutMs: 20 }));
    const worker = createWorker(repositories, clock, "worker-timeout", {
      execute: (_job, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")); }, { once: true });
      }),
    });
    await expect(worker.runOnce()).resolves.toMatchObject({ job: { lastFailure: { code: "TIMEOUT", retryable: false }, receipt: { outcome: "DEAD_LETTER" }, status: "DEAD_LETTER" }, status: "DEAD_LETTER" });
    await worker.close();
    await repositories.close();
  });

  it("aborts and settles an active claim before releasing its process lease on close", async () => {
    const { clock, repositories } = await fixture();
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(createJob(clock, "job-graceful-close", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 })));
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolveStarted) => { notifyStarted = resolveStarted; });
    let observedAbort = false;
    const worker = createWorker(repositories, clock, "worker-graceful-close", {
      execute: (_job, { signal }) => new Promise((_resolve, reject) => {
        notifyStarted?.();
        signal.addEventListener("abort", () => {
          observedAbort = true;
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
        }, { once: true });
      }),
    });

    const running = worker.runOnce();
    await started;
    const closing = worker.close();
    await expect(running).resolves.toMatchObject({ job: { status: "CANCELLED" }, status: "CANCELLED" });
    await expect(closing).resolves.toBeUndefined();
    expect(observedAbort).toBe(true);
    const durable = await repositories.transaction(async ({ operationsRuntime }) => ({
      attempts: await operationsRuntime.listAttempts("job-graceful-close"),
      job: await operationsRuntime.getJobById("job-graceful-close"),
      lease: await operationsRuntime.getProcessLease("workspace", "worker:primary"),
    }));
    expect(durable.job).toMatchObject({ lastFailure: { code: "CANCELLED" }, status: "CANCELLED" });
    expect(durable.attempts).toMatchObject([{ outcome: "CANCELLED", reasonCode: "CANCELLED" }]);
    expect(durable.lease).toBeUndefined();
    await repositories.close();
  });

  it("cannot complete a claim when shutdown wins before execution wiring", async () => {
    const { clock, repositories } = await fixture();
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(createJob(clock, "job-prewired-shutdown", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 })));
    const worker = createWorker(repositories, clock, "worker-prewired-shutdown", {
      execute: async () => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
        return { costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef: "must-not-complete", toolCalls: 0 };
      },
    });

    const running = worker.runOnce();
    const closing = worker.close();
    await expect(running).resolves.toMatchObject({ job: { status: "CANCELLED" }, status: "CANCELLED" });
    await expect(closing).resolves.toBeUndefined();
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.getJobById("job-prewired-shutdown"))).resolves.toMatchObject({ receipt: { outcome: "CANCELLED" }, status: "CANCELLED" });
    await repositories.close();
  });

  it("refuses an external action authorization after shutdown begins", async () => {
    const { clock, repositories } = await fixture();
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(createJob(clock, "job-shutdown-external-action", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 })));
    let notifyStarted: (() => void) | undefined;
    let continueHandler: (() => void) | undefined;
    const started = new Promise<void>((resolveStarted) => { notifyStarted = resolveStarted; });
    const proceed = new Promise<void>((resolveProceed) => { continueHandler = resolveProceed; });
    let authorizationRejected = false;
    let externalActionStarted = false;
    const worker = createWorker(repositories, clock, "worker-shutdown-external-action", {
      execute: async (_job, context) => {
        notifyStarted?.();
        await proceed;
        try {
          await context.assertCanStartExternalAction();
          externalActionStarted = true;
        } catch (error) {
          authorizationRejected = true;
          throw error;
        }
        return { costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 };
      },
    });

    const running = worker.runOnce();
    await started;
    const closing = worker.close();
    continueHandler?.();
    await expect(running).resolves.toMatchObject({ job: { status: "CANCELLED" }, status: "CANCELLED" });
    await expect(closing).resolves.toBeUndefined();
    expect(authorizationRejected).toBe(true);
    expect(externalActionStarted).toBe(false);
    await repositories.close();
  });

  it("honors cancellation, central stop controls and process fencing", async () => {
    const { clock, repositories } = await fixture();
    const queued = createJob(clock, "job-cancel", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(queued));
    let executions = 0;
    const workerA = createWorker(repositories, clock, "instance-a", { execute: () => { executions += 1; return Promise.resolve({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 }); } });
    const cancelled = await workerA.requestCancellation(queued.jobId, 0, "fabio");
    expect(cancelled).toMatchObject({ attempt: 0, receipt: { attempt: 0, outcome: "CANCELLED" }, status: "CANCELLED" });

    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: "workspace" });
    await controls.update({ expectedVersion: 0, killSwitch: "ACTIVE", maintenanceMode: "DISABLED", reasonCode: "OPERATOR_STOP", updatedBy: "fabio" });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(createJob(clock, "job-stopped", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 })));
    await expect(workerA.runOnce()).resolves.toMatchObject({ status: "STOPPED" });
    expect((await controls.health()).status).toBe("STOPPED");
    await controls.update({ expectedVersion: 1, killSwitch: "RELEASED", maintenanceMode: "DISABLED", reasonCode: "OPERATOR_RESUME", updatedBy: "fabio" });
    await controls.update({ expectedVersion: 2, killSwitch: "RELEASED", maintenanceMode: "ENABLED", reasonCode: "MAINTENANCE_START", updatedBy: "fabio" });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(createJob(clock, "job-maintenance", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 })));
    await expect(workerA.runOnce()).resolves.toMatchObject({ status: "STOPPED" });
    expect(executions).toBe(0);
    await controls.update({ expectedVersion: 3, killSwitch: "RELEASED", maintenanceMode: "DISABLED", reasonCode: "MAINTENANCE_END", updatedBy: "fabio" });

    await workerA.heartbeat();
    clock.advance(31_000);
    const workerB = createWorker(repositories, clock, "instance-b", successHandler());
    const takeover = await workerB.heartbeat();
    expect(takeover.fencingToken).toBe(2);
    await expect(workerA.runOnce()).resolves.toMatchObject({ status: "STOPPED" });
    await workerA.close();
    await workerB.close();
    await repositories.close();
  });

  it("reports truthful readiness and enforces bounded terminal retention", async () => {
    const { clock, repositories } = await fixture();
    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: "workspace" });
    expect(await controls.monitorHealth()).toMatchObject({ scheduler: "MISSING", status: "ATTENTION_REQUIRED", workers: { active: 0, stale: 0 } });
    await controls.monitorHealth();
    const scheduled = scheduler(repositories, clock, "scheduler-health");
    await scheduled.heartbeat();
    const worker = createWorker(repositories, clock, "worker-health", successHandler());
    await worker.heartbeat();
    expect(await controls.monitorHealth()).toMatchObject({ scheduler: "READY", status: "READY", workers: { active: 1, stale: 0 } });
    await controls.monitorHealth();
    const healthEvents = await repositories.transaction(({ operationalEvents }) => operationalEvents.listAfter("workspace", 0, 20));
    expect(healthEvents.filter(({ eventType }) => eventType === "HEALTH_STATE_CHANGED")).toMatchObject([
      { entityId: "health-attention-required", entityVersion: 1, safeSummaryCode: "health_state_changed" },
      { entityId: "health-ready", entityVersion: 2, safeSummaryCode: "health_state_changed" },
    ]);
    expect(JSON.stringify(healthEvents)).not.toMatch(/prompt|secret|token/i);

    const old = createJob(clock, "job-old", { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 });
    await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(old));
    await expect(worker.runOnce()).resolves.toMatchObject({ job: { jobId: old.jobId }, status: "COMPLETED" });
    const usageBefore = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarizeUsage("workspace"));
    expect(usageBefore.attempts).toBe(1);
    clock.advance(2_000);
    await expect(controls.enforceRetention({ jobLimit: 1, retainNewestEvents: 100, terminalBefore: clock.now().toISOString() })).resolves.toMatchObject({ jobsDeleted: 1 });
    const retained = await repositories.transaction(async ({ operationsRuntime }) => ({
      job: await operationsRuntime.getJobById(old.jobId),
      attempts: await operationsRuntime.listAttempts(old.jobId),
      usage: await operationsRuntime.summarizeUsage("workspace"),
    }));
    expect(retained.job).toBeUndefined();
    expect(retained.attempts).toHaveLength(0);
    expect(retained.usage).toEqual(usageBefore);
    await scheduled.close();
    await worker.close();
    await repositories.close();
  });

  it("rolls a volume of retained attempts into bounded workspace usage without losing totals", async () => {
    const { clock, repositories } = await fixture();
    const worker = createWorker(repositories, clock, "retention-volume-worker", successHandler());
    const jobs = Array.from({ length: 20 }, (_, index) => createTypedJob(clock, `volume-job-${String(index).padStart(2, "0")}`, "EVIDENCE_FRESHNESS_CHECK", {}));
    await repositories.transaction(async ({ operationsRuntime }) => { for (const job of jobs) await operationsRuntime.insertJob(job); });
    for (let remaining = jobs.length; remaining > 0; remaining -= 1) await expect(worker.runOnce()).resolves.toMatchObject({ status: "COMPLETED" });
    const usageBefore = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarizeUsage("workspace"));
    expect(usageBefore.attempts).toBe(20);
    clock.advance(2_000);
    const controls = new OperationsRuntimeControlService({ clock, repositories, workspaceId: "workspace" });
    const deleted: number[] = [];
    for (;;) {
      const result = await controls.enforceRetention({ jobLimit: 7, retainNewestEvents: 100, terminalBefore: clock.now().toISOString() });
      deleted.push(result.jobsDeleted);
      if (result.jobsDeleted === 0) break;
    }
    expect(deleted).toEqual([7, 7, 6, 0]);
    const retained = await repositories.transaction(async ({ operationsRuntime }) => ({ attempts: await Promise.all(jobs.map(({ jobId }) => operationsRuntime.listAttempts(jobId))), usage: await operationsRuntime.summarizeUsage("workspace") }));
    expect(retained.attempts.every(({ length }) => length === 0)).toBe(true);
    expect(retained.usage).toEqual(usageBefore);
    await worker.close();
    await repositories.close();
  });
});

describe("supervised process lock and launchd assets", () => {
  it("always releases repositories and the process lock when service shutdown fails", async () => {
    const root = await tempRoot();
    const path = join(root, "teardown-fault.lock");
    const lock = await SupervisedProcessLock.acquire({ instanceId: "faulting-service", path, role: "worker" });
    const closeOrder: string[] = [];
    const serviceFailure = new Error("redacted service close failure");
    const result = closeOperationsRuntimeResources({
      closeLock: async () => { closeOrder.push("lock"); await lock.close(); },
      closeRepositories: () => { closeOrder.push("repositories"); return Promise.resolve(); },
      closeService: () => { closeOrder.push("service"); return Promise.reject(serviceFailure); },
    });

    await expect(result).rejects.toSatisfy((error: unknown) => error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === serviceFailure);
    expect(closeOrder).toEqual(["service", "repositories", "lock"]);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const recovered = await SupervisedProcessLock.acquire({ instanceId: "recovered", path, role: "worker" });
    await recovered.close();
  });

  it("runs a bounded real-composition smoke and removes its process lock", async () => {
    const root = await tempRoot();
    const databasePath = join(root, "smoke.sqlite");
    const configPath = join(root, "config.json");
    await writeFile(configPath, JSON.stringify({ contractVersion: "1", maxRequestBytes: 65_536, runtime: { actorId: "fabio", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path: databasePath, timeoutMs: 1_000 }, workspaceId: "workspace" } }), { encoding: "utf8", mode: 0o600 });
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try { await runOperationsRuntimeCli(["--config", configPath, "--role", "smoke"]); }
    finally { output.mockRestore(); }
    await expect(readFile(`${databasePath}.operations-smoke.lock`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const repositories = new SqliteRepositoryTransactionRunner({ path: databasePath, timeoutMs: 1_000 });
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarize("workspace"))).resolves.toEqual({ blocked: 0, cancelled: 0, completed: 0, deadLetter: 0, failed: 0, queued: 0, retryScheduled: 0, running: 0 });
    await repositories.close();
  });

  it("keeps backup-verifier directories and durable artifacts private", async () => {
    const root = await tempRoot();
    const databasePath = join(root, "backup-source.sqlite");
    const configPath = join(root, "config.json");
    const backupDirectory = join(root, "backups");
    const repositories = new SqliteRepositoryTransactionRunner({ path: databasePath, timeoutMs: 1_000 });
    await repositories.close();
    await writeFile(configPath, JSON.stringify({ contractVersion: "1", maxRequestBytes: 65_536, runtime: { actorId: "fabio", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path: databasePath, timeoutMs: 1_000 }, workspaceId: "workspace" } }), { encoding: "utf8", mode: 0o600 });
    await mkdir(backupDirectory, { mode: 0o755 });
    await chmod(backupDirectory, 0o755);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try { await runOperationsRuntimeCli(["--config", configPath, "--role", "backup-verifier", "--backup-directory", backupDirectory]); }
    finally { output.mockRestore(); }

    expect((await stat(backupDirectory)).mode & 0o777).toBe(0o700);
    const files = (await readdir(backupDirectory)).filter((name) => name.endsWith(".sqlite"));
    expect(files).toHaveLength(1);
    const backupFile = files[0];
    if (backupFile === undefined) throw new Error("Verified backup file is missing");
    expect((await stat(join(backupDirectory, backupFile))).mode & 0o777).toBe(0o600);
    await expect(readFile(`${databasePath}.operations-backup-verifier.lock`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a live duplicate and recovers one valid stale PID lock", async () => {
    const root = await tempRoot();
    const path = join(root, "runtime.lock");
    const first = await SupervisedProcessLock.acquire({ instanceId: "one", path, role: "worker" });
    await expect(SupervisedProcessLock.acquire({ instanceId: "two", path, role: "worker" })).rejects.toBeInstanceOf(RepositoryConflictError);
    await first.close();
    await writeFile(path, `${JSON.stringify({ contractVersion: "1", createdAt: "2026-07-19T00:00:00.000Z", instanceId: "stale", pid: 2_147_483_647, role: "worker", token: "lock-stale" })}\n`, { encoding: "utf8", mode: 0o600 });
    const recovered = await SupervisedProcessLock.acquire({ instanceId: "new", path, role: "worker" });
    await recovered.close();
  });

  it("ships exactly six secret-free, user-level launchd templates and a reversible supervisor", async () => {
    const repo = resolve(import.meta.dirname, "../..");
    const labels = ["api", "backup-verifier", "health-monitor", "scheduler", "telegram", "worker"];
    const templates = await Promise.all(labels.map((label) => readFile(join(repo, "ops", "launchd", `ai.onlyway.mv-ai-os.${label}.plist.template`), "utf8")));
    expect(templates).toHaveLength(6);
    for (const template of templates) {
      expect(template).not.toMatch(/API_KEY|CLIENT_SECRET|ACCESS_TOKEN|sk-[A-Za-z0-9]/i);
      expect(template).toContain("__REPO__");
      expect(template).toContain("__LOG_DIR__");
    }
    const supervisor = await readFile(join(repo, "scripts", "onlyway-local-supervisor.sh"), "utf8");
    expect(supervisor).toContain("uninstall)");
    expect(supervisor).toContain("launchctl bootout");
    expect(supervisor).toContain("rotate-logs)");
  });
});

async function fixture(): Promise<{ readonly clock: MutableClock; readonly repositories: SqliteRepositoryTransactionRunner }> {
  const root = await tempRoot();
  const repositories = new SqliteRepositoryTransactionRunner({ path: join(root, "runtime.sqlite"), timeoutMs: 1_000 });
  return { clock: new MutableClock("2026-07-19T08:00:00.000Z"), repositories };
}
async function tempRoot(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "mv-ai-os-operations-")); roots.push(root); return root; }
function scheduler(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock, instanceId: string): OperationsSchedulerService { return new OperationsSchedulerService({ actorId: "fabio", clock, instanceId, repositories, schedulerLeaseMs: 30_000, workspaceId: "workspace" }); }
function createWorker(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock, instanceId: string, handler: OperationsJobHandler): OperationsWorkerService { return new OperationsWorkerService({ clock, handlers: registry(handler), instanceId, repositories, workerId: "primary", workerLeaseMs: 30_000, workspaceId: "workspace" }); }
function registry(handler: OperationsJobHandler): ImmutableOperationsJobHandlerRegistry { return new ImmutableOperationsJobHandlerRegistry(OPERATIONS_JOB_TYPES.map((jobType) => ({ handler, jobType }))); }
function successHandler(resultRef?: string): OperationsJobHandler { return { execute: (): Promise<OperationsExecutionResult> => Promise.resolve(Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, ...(resultRef === undefined ? {} : { resultRef }), toolCalls: 0 })) }; }
function delayedSuccessHandler(resultRef: string): OperationsJobHandler { return { execute: async (): Promise<OperationsExecutionResult> => { await new Promise((resolveDelay) => setTimeout(resolveDelay, 300)); return Object.freeze({ costCents: 0, externalEffectsExecuted: false, providerCalls: 0, resultRef, toolCalls: 0 }); } }; }
function failingHandler(): OperationsJobHandler { return { execute: () => Promise.reject(new Error("redacted execution failure")) }; }
function createSchedule(clock: MutableClock, scheduleId: string) { const payload: OperationsJobPayload = {}; return createOperationsSchedule({ actorId: "fabio", budget: { maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 10 }, cadence: { kind: "ONCE" }, catchUpPolicy: "CATCH_UP_ONE", heartbeatIntervalMs: 250, jobType: "EVIDENCE_FRESHNESS_CHECK", leaseDurationMs: 5_000, nextRunAt: clock.now().toISOString(), owner: "operations", payload, priority: 50, retryPolicy: { automaticRetries: 1, initialBackoffMs: 1_000, maxBackoffMs: 2_000 }, scheduleId, status: "ENABLED", timeoutMs: 5_000, workspaceId: "workspace" }, clock); }
function createJob(clock: MutableClock, jobId: string, retryPolicy: OperationsJob["retryPolicy"]): OperationsJob { const payload: OperationsJobPayload = {}; const now = clock.now().toISOString(); return Object.freeze({ actorId: "fabio", attempt: 0, budget: { maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 10 }, contractVersion: "1", createdAt: now, heartbeatIntervalMs: 250, jobId, jobType: "EVIDENCE_FRESHNESS_CHECK", leaseDurationMs: 5_000, operationIdentity: `identity-${jobId}`, owner: "operations", payload, payloadFingerprint: createOperationsPayloadFingerprint(payload), priority: 50, recoveryStrategy: "RETRY_OR_DEAD_LETTER", retryPolicy, runAfter: now, scheduledFor: now, status: "QUEUED", timeoutMs: 5_000, updatedAt: now, version: 0, workspaceId: "workspace" }); }
function createTypedJob(clock: MutableClock, jobId: string, jobType: OperationsJob["jobType"], payload: OperationsJobPayload, priority = 50): OperationsJob { const now = clock.now().toISOString(); return Object.freeze({ actorId: "fabio", attempt: 0, budget: { maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 100 }, contractVersion: "1", createdAt: now, heartbeatIntervalMs: 250, jobId, jobType, leaseDurationMs: 5_000, operationIdentity: `identity-${jobId}`, owner: "operations", payload, payloadFingerprint: createOperationsPayloadFingerprint(payload), priority, recoveryStrategy: "RETRY_OR_DEAD_LETTER", retryPolicy: { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 }, runAfter: now, scheduledFor: now, status: "QUEUED", timeoutMs: 5_000, updatedAt: now, version: 0, workspaceId: "workspace" }); }
function operationIdentity(scheduleId: string, scheduledFor: string): string { const hash = createHash("sha256").update(`${scheduleId}\n${scheduledFor}`, "utf8").digest("hex"); return `occ-${hash.slice(0, 48)}`; }

function downgradeCurrentDatabaseToV26(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
    for (const table of POST_V26_TABLES) database.exec(`DROP TABLE IF EXISTS ${table}`);
    database.exec(`
      DROP INDEX IF EXISTS telegram_outbound_deliveries_update;
      CREATE TEMP TABLE telegram_inbound_receipts_v26_fixture AS
        SELECT update_id, action_fingerprint, identity_binding, action_kind,
          CASE processing_state WHEN 'DELIVERY_UNCERTAIN' THEN 'RECEIVED' ELSE processing_state END AS processing_state,
          received_at, expires_at, command_id
        FROM telegram_inbound_receipts;
      DROP TABLE telegram_inbound_receipts;
      CREATE TABLE telegram_inbound_receipts (
        update_id TEXT PRIMARY KEY,
        action_fingerprint TEXT NOT NULL,
        identity_binding TEXT NOT NULL,
        action_kind TEXT NOT NULL,
        processing_state TEXT NOT NULL CHECK (processing_state IN ('RECEIVED', 'COMPLETED', 'REJECTED')),
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        command_id TEXT
      ) STRICT;
      INSERT INTO telegram_inbound_receipts
        SELECT update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id
        FROM telegram_inbound_receipts_v26_fixture;
      DROP TABLE telegram_inbound_receipts_v26_fixture;
      CREATE INDEX telegram_inbound_receipts_expiry ON telegram_inbound_receipts (expires_at, update_id);

      CREATE TEMP TABLE operations_jobs_v26_fixture AS
        SELECT job_id, operation_identity, workspace_id, status, priority, run_after, lease_expires_at, version, updated_at, record_json
        FROM operations_jobs;
      CREATE TEMP TABLE operations_job_attempts_v26_fixture AS
        SELECT attempt_id, job_id, workspace_id, attempt, finished_at, record_json
        FROM operations_job_attempts;
      DROP TABLE operations_job_attempts;
      DROP TABLE operations_jobs;
      CREATE TABLE operations_jobs (
        job_id TEXT PRIMARY KEY,
        operation_identity TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('CANCELLED', 'COMPLETED', 'DEAD_LETTER', 'FAILED', 'QUEUED', 'RETRY_SCHEDULED', 'RUNNING')),
        priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100),
        run_after TEXT NOT NULL,
        lease_expires_at TEXT,
        version INTEGER NOT NULL CHECK (version >= 0),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (workspace_id, operation_identity)
      ) STRICT;
      INSERT INTO operations_jobs
        SELECT job_id, operation_identity, workspace_id, status, priority, run_after, lease_expires_at, version, updated_at, record_json
        FROM operations_jobs_v26_fixture;
      DROP TABLE operations_jobs_v26_fixture;
      CREATE INDEX operations_jobs_next
        ON operations_jobs (workspace_id, status, priority DESC, run_after, job_id);
      CREATE INDEX operations_jobs_lease
        ON operations_jobs (workspace_id, status, lease_expires_at, job_id);
      CREATE INDEX operations_jobs_retention
        ON operations_jobs (workspace_id, status, updated_at, job_id);
      CREATE TABLE operations_job_attempts (
        attempt_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES operations_jobs(job_id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 1),
        finished_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        UNIQUE (job_id, attempt)
      ) STRICT;
      INSERT INTO operations_job_attempts
        SELECT attempt_id, job_id, workspace_id, attempt, finished_at, record_json
        FROM operations_job_attempts_v26_fixture;
      DROP TABLE operations_job_attempts_v26_fixture;
      CREATE INDEX operations_job_attempts_job
        ON operations_job_attempts (job_id, attempt);
    `);
    database.prepare("DELETE FROM schema_migrations WHERE version > ?").run(26);
    database.exec("PRAGMA user_version = 26; COMMIT; PRAGMA foreign_keys = ON;");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

function readMigrationVersionsAfterV26(database: DatabaseSync): number[] {
  return database.prepare("SELECT version FROM schema_migrations WHERE version > 26 ORDER BY version ASC").all()
    .map((row) => Number(row.version));
}

function readIndexNames(database: DatabaseSync): string[] {
  return database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all()
    .map((row) => String(row.name));
}

function readTableNames(database: DatabaseSync): string[] {
  return database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all()
    .map((row) => String(row.name));
}

function readTableSql(database: DatabaseSync, table: string): string {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
  return String(row?.sql);
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get();
  return Number(row?.user_version);
}

class MutableClock { #value: Date; public constructor(value: string) { this.#value = new Date(value); } public now(): Date { return new Date(this.#value); } public advance(milliseconds: number): void { this.#value = new Date(this.#value.getTime() + milliseconds); } }
