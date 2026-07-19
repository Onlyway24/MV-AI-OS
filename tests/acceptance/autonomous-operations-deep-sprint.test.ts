import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentCompanyWorkdayInput } from "../../src/agent-company/operational-agent-company.js";
import { FounderWorkdayService } from "../../src/agent-company/founder-workday-service.js";
import { RepositoryBackedFounderWorkdayStateSource } from "../../src/agent-company/repository-backed-founder-workday-state-source.js";
import type { BusinessMissionExecutionInput, BusinessScoreCriterion } from "../../src/business/business-mission.js";
import {
  commandCenterRuntimePaths,
  startCommandCenterRuntime,
  type StartedCommandCenterRuntime,
} from "../../src/command-center/command-center-cli.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { DailyOperatingBriefService } from "../../src/daily-brief/daily-operating-brief-service.js";
import { RepositoryBackedDailyOperatingBriefSource } from "../../src/daily-brief/repository-backed-daily-operating-brief-source.js";
import type {
  ControlActionReceipt,
  OperationsControlAction,
  ProposedControlAction,
} from "../../src/operations-control/operations-control.js";
import { controlFingerprint } from "../../src/operations-control/operations-control-validator.js";
import { createLocalOperationsJobHandlerRegistry } from "../../src/operations-runtime/operations-handler-registry.js";
import { createOperationsLocalWorkflowCallbacks } from "../../src/operations-runtime/operations-local-workflow-callbacks.js";
import { OperationsRuntimeControlService } from "../../src/operations-runtime/operations-runtime-control-service.js";
import type {
  OperationsExecutionResult,
  OperationsJob,
  OperationsJobHandler,
  OperationsJobHandlerContext,
  OperationsJobHandlerRegistry,
  OperationsJobPayload,
  OperationsJobType,
} from "../../src/operations-runtime/operations-runtime.js";
import { createOperationsPayloadFingerprint } from "../../src/operations-runtime/operations-runtime-validator.js";
import {
  createOperationsSchedule,
  OperationsSchedulerService,
} from "../../src/operations-runtime/operations-scheduler-service.js";
import { OperationsWorkerService } from "../../src/operations-runtime/operations-worker-service.js";
import { SupervisedProcessLock } from "../../src/operations-runtime/supervised-process-lock.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import type { RestrictedHttpsAcquisition } from "../../src/research/authorized-research.js";
import { AuthorizedResearchService } from "../../src/research/authorized-research-service.js";
import type { RestrictedHttpsClient } from "../../src/research/restricted-https-client.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";
import {
  TelegramBotApiClient,
  type TelegramBotApiRequest,
  type TelegramBotApiTransport,
} from "../../src/telegram/telegram-bot-api.js";
import type { TelegramOperatorConfig } from "../../src/telegram/telegram-contracts.js";
import { TelegramDailyBriefConsole } from "../../src/telegram/telegram-daily-brief-console.js";

const ACTOR_ID = "fabio";
const BUSINESS_DATE = "2026-07-19";
const WORKSPACE_ID = "onlyway-acceptance";

describe("Onlyway autonomous operations practical acceptance", () => {
  it("runs the real local operating-day composition with durable recovery and zero external effects", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-ai-os-deep-sprint-acceptance-"));
    const databasePath = join(root, "acceptance.sqlite");
    const configPath = join(root, "acceptance-config.json");
    await writeFile(configPath, JSON.stringify({ contractVersion: "1", maxRequestBytes: 65_536, runtime: { actorId: ACTOR_ID, contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path: databasePath, timeoutMs: 2_000 }, workspaceId: WORKSPACE_ID } }), { encoding: "utf8", mode: 0o600 });
    const lockPaths = {
      api: commandCenterRuntimePaths(databasePath).lockPath,
      scheduler: join(root, "scheduler.lock"),
      worker: join(root, "worker.lock"),
    } as const;
    const clock = new MutableClock("2026-07-19T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path: databasePath, timeoutMs: 2_000 });
    const openLocks: SupervisedProcessLock[] = [];
    let scheduler: OperationsSchedulerService | undefined;
    let worker: OperationsWorkerService | undefined;
    let started: StartedCommandCenterRuntime | undefined;
    let stream: SseProbe | undefined;

    try {
      openLocks.push(await SupervisedProcessLock.acquire({ instanceId: "acceptance-scheduler", path: lockPaths.scheduler, role: "scheduler", now: clock.now() }));
      let workerLock = await SupervisedProcessLock.acquire({ instanceId: "acceptance-worker-1", path: lockPaths.worker, role: "worker", now: clock.now() });
      openLocks.push(workerLock);

      const commandBoundary = createLocalWorkflowCommandBoundary({
        actorId: ACTOR_ID,
        clock,
        repositories,
        workspaceId: WORKSPACE_ID,
      });
      const founderWorkday = founderWorkdayService(repositories, clock);
      const dailyBrief = dailyBriefService(repositories, clock);
      const fakeResearch = new FakeResearchHttpsClient();
      await seedAuthorizedEvidence(repositories, clock, fakeResearch);
      const callbacks = createOperationsLocalWorkflowCallbacks({
        actorId: ACTOR_ID,
        commandBoundary,
        dailyOperatingReport: dailyBrief,
        founderWorkday,
        workspaceId: WORKSPACE_ID,
      });
      const productionHandlers = createLocalOperationsJobHandlerRegistry({
        commandBoundary,
        localWorkflows: callbacks,
        repositories,
      });

      scheduler = new OperationsSchedulerService({
        actorId: ACTOR_ID,
        clock,
        instanceId: "acceptance-scheduler",
        repositories,
        schedulerLeaseMs: 30_000,
        workspaceId: WORKSPACE_ID,
      });
      worker = new OperationsWorkerService({
        clock,
        handlers: productionHandlers,
        instanceId: "acceptance-worker-1",
        repositories,
        workerId: "primary",
        workerLeaseMs: 30_000,
        workspaceId: WORKSPACE_ID,
      });
      const runtimeControl = new OperationsRuntimeControlService({ clock, repositories, workspaceId: WORKSPACE_ID });
      await runtimeControl.update({
        expectedVersion: 0,
        killSwitch: "RELEASED",
        maintenanceMode: "DISABLED",
        reasonCode: "ACCEPTANCE_START",
        updatedBy: ACTOR_ID,
      });
      const queryService = new CommandCenterQueryService({ clock, repositories, workspaceId: WORKSPACE_ID });
      started = await startCommandCenterRuntime(configPath);
      const session = await commandCenterSession(started);
      const page = await fetch(`${session.origin}/`, { headers: { Cookie: session.cookie } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Centro di Comando Onlyway");

      stream = await SseProbe.open(`${session.origin}/api/events`, {
        Accept: "text/event-stream",
        Cookie: session.cookie,
        Origin: session.origin,
        "Last-Event-ID": "0",
      });
      await scheduler.registerSchedule(createOperationsSchedule({
        actorId: ACTOR_ID,
        budget: { maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 0 },
        cadence: { kind: "ONCE" },
        catchUpPolicy: "CATCH_UP_ONE",
        heartbeatIntervalMs: 500,
        jobType: "AGENT_COMPANY_WORKDAY_START",
        leaseDurationMs: 20_000,
        nextRunAt: clock.now().toISOString(),
        owner: "onlyway-assistant",
        payload: { budgetCents: 0, workday: agentCompanyInput(), workdayId: `founder-workday-${BUSINESS_DATE}` },
        priority: 100,
        retryPolicy: { automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 },
        scheduleId: "acceptance-workday-once",
        status: "ENABLED",
        timeoutMs: 15_000,
        workspaceId: WORKSPACE_ID,
      }, clock));

      const scheduled = await scheduler.tick();
      expect(scheduled).toMatchObject({
        enqueuedJobIds: { length: 1 },
        status: "SCHEDULED",
        unauthorizedExternalEffectOccurred: false,
      });
      expect(await stream.readUntil('"eventType":"JOB_QUEUED"')).toContain("event: operational");

      const firstRun = await worker.runOnce();
      expect(firstRun).toMatchObject({
        job: { block: { code: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, receipt: { outcome: "BLOCKED", reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" } },
        status: "BLOCKED",
        unauthorizedExternalEffectOccurred: false,
      });
      const liveFrames = await stream.readUntil('"eventType":"JOB_BLOCKED"');
      expect(liveFrames).toContain('"eventType":"JOB_LEASE_ACQUIRED"');
      expect(liveFrames).toContain('"eventType":"FOUNDER_WORKDAY_CREATED"');
      await stream.close();
      stream = undefined;

      const operatingDay = await repositories.transaction(async ({
        agentCompanyWorkdays,
        contentProductions,
        founderWorkdays,
        operationalEvents,
      }) => ({
        company: await agentCompanyWorkdays.getById("acceptance-company-day-001"),
        events: await operationalEvents.listAfter(WORKSPACE_ID, 0, 250),
        founder: await founderWorkdays.getById(`founder-workday-${BUSINESS_DATE}`),
        production: await contentProductions.getById("acceptance-content-001"),
      }));
      expect(operatingDay.founder).toMatchObject({
        artifacts: { externalEffectsSummary: { deployments: 0, messages: 0, paidCalls: 0, publications: 0, purchases: 0 } },
        status: "BLOCKED",
      });
      expect(operatingDay.founder?.tasks.some(({ agentId, status }) => agentId === "research-agent" && status === "BLOCKED")).toBe(true);
      expect(operatingDay.company).toMatchObject({
        externalActionsExecuted: false,
        status: "BLOCKED",
        tasks: { length: 17 },
      });
      expect(operatingDay.company?.tasks.every(({ attempts, costCents }) => attempts === 1 && costCents === 0)).toBe(true);
      expect(operatingDay.company?.tasks.filter(({ status }) => status === "COMPLETED")).toHaveLength(16);
      expect(operatingDay.company?.tasks.find(({ agentId }) => agentId === "backup-guardian")).toMatchObject({ blocker: { reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, status: "BLOCKED" });
      expect(operatingDay.production).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });
      expect(operatingDay.events.map(({ eventType }) => eventType)).toEqual(expect.arrayContaining([
        "JOB_QUEUED",
        "JOB_LEASE_ACQUIRED",
        "FOUNDER_WORKDAY_CREATED",
        "AGENT_COMPANY_TASK_CHANGED",
        "APPROVAL_REQUESTED",
        "JOB_BLOCKED",
      ]));
      expect(fakeResearch.calls).toBe(3);

      const overview = await queryService.snapshot();
      expect(overview.agentCompany).toContainEqual(expect.objectContaining({ workdayId: "acceptance-company-day-001" }));
      expect(overview.founderWorkdays).toContainEqual(expect.objectContaining({ status: "BLOCKED" }));
      expect(overview.productions).toContainEqual(expect.objectContaining({ productionId: "acceptance-content-001", status: "PENDING_FABIO_APPROVAL" }));

      const sourceProduction = required(operatingDay.production, "production awaiting Fabio review");
      const immutableSource = JSON.stringify(sourceProduction);
      const revisionReceipt = await executeDashboardControl(session, {
        action: "REQUEST_PRODUCTION_REVISION",
        entityId: sourceProduction.productionId,
        entityVersion: sourceProduction.version,
        fingerprint: controlFingerprint(sourceProduction),
        idempotencyKey: "acceptance-production-revision-v0",
        reason: {
          code: "CLAIM_REQUIRES_REVISION",
          detail: "Fabio richiede una revisione tracciata del claim nel secondo elemento del carosello.",
        },
        revision: {
          category: "CLAIM",
          priority: "HIGH",
          targets: [{ kind: "CLAIM", reference: "carousel.slide-2.claim-1" }],
        },
      });
      expect(revisionReceipt).toMatchObject({
        action: "REQUEST_PRODUCTION_REVISION",
        resultEntityId: sourceProduction.productionId,
        resultEntityVersion: 1,
      });
      const revised = await repositories.transaction(async ({ contentProductions, operationsControls }) => ({
        control: await operationsControls.getProductionControl(sourceProduction.productionId),
        production: await contentProductions.getById(sourceProduction.productionId),
      }));
      expect(JSON.stringify(revised.production)).toBe(immutableSource);
      expect(revised.control).toMatchObject({
        revisions: [expect.objectContaining({ sourceProductionVersion: 0, status: "REQUESTED" })],
        state: "REVISION_REQUIRED",
        version: 1,
      });

      await worker.close();
      await workerLock.close();
      workerLock = await SupervisedProcessLock.acquire({ instanceId: "acceptance-worker-2", path: lockPaths.worker, role: "worker", now: clock.now() });
      openLocks.push(workerLock);
      const instrumentedHandlers = new InstrumentedHandlerRegistry(productionHandlers);
      worker = new OperationsWorkerService({
        clock,
        handlers: instrumentedHandlers,
        instanceId: "acceptance-worker-2",
        repositories,
        workerId: "primary",
        workerLeaseMs: 30_000,
        workspaceId: WORKSPACE_ID,
      });
      await worker.heartbeat();
      const recoveredBoundary = createLocalWorkflowCommandBoundary({ actorId: ACTOR_ID, clock, repositories, workspaceId: WORKSPACE_ID });
      await expect(recoveredBoundary.execute({
        actorId: ACTOR_ID,
        commandId: "acceptance-agent-company-recovery",
        contractVersion: "1",
        input: { workdayId: "acceptance-company-day-001" },
        operation: "INSPECT_AGENT_COMPANY_WORKDAY",
        workspaceId: WORKSPACE_ID,
      })).resolves.toMatchObject({ result: { status: "BLOCKED", tasks: { length: 17 } } });
      await expect(founderWorkdayService(repositories, clock).inspect(`founder-workday-${BUSINESS_DATE}`)).resolves.toEqual(operatingDay.founder);

      await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(localJob(clock, {
        jobId: "acceptance-failed-local",
        jobType: "SECURITY_POSTURE_CHECK",
        payload: {},
        priority: 100,
      })));
      const failedRun = await worker.runOnce();
      expect(failedRun).toMatchObject({ job: { status: "FAILED" }, status: "FAILED" });
      const failed = required(failedRun.job, "failed local job");
      const failedBefore = JSON.stringify(failed);

      await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(localJob(clock, {
        jobId: "acceptance-dead-letter-local",
        jobType: "BACKUP_AND_RESTORE_VERIFICATION",
        payload: { backupPolicyId: "unconfigured-acceptance" },
        priority: 100,
      })));
      const deadLetterRun = await worker.runOnce();
      expect(deadLetterRun).toMatchObject({ job: { status: "DEAD_LETTER" }, status: "DEAD_LETTER" });
      const deadLetter = required(deadLetterRun.job, "dead-letter local job");
      const deadLetterBefore = JSON.stringify(deadLetter);

      const retryReceipt = await executeDashboardControl(session, controlBody(
        "RETRY_FAILED_JOB",
        failed,
        "acceptance-retry-failed-v2",
      ));
      const requeueReceipt = await executeDashboardControl(session, controlBody(
        "REQUEUE_DEAD_LETTER_JOB",
        deadLetter,
        "acceptance-requeue-dead-v2",
      ));
      const successorState = await repositories.transaction(async ({ operationsRuntime }) => ({
        deadLetter: await operationsRuntime.getJobById(deadLetter.jobId),
        failed: await operationsRuntime.getJobById(failed.jobId),
        requeued: await operationsRuntime.getJobById(requeueReceipt.resultEntityId),
        retried: await operationsRuntime.getJobById(retryReceipt.resultEntityId),
      }));
      expect(JSON.stringify(successorState.failed)).toBe(failedBefore);
      expect(JSON.stringify(successorState.deadLetter)).toBe(deadLetterBefore);
      expect(successorState.retried).toMatchObject({ predecessorJobId: failed.jobId, status: "QUEUED", version: 0 });
      expect(successorState.requeued).toMatchObject({ predecessorJobId: deadLetter.jobId, status: "QUEUED", version: 0 });

      const generatedBrief = await dailyBrief.generate(BUSINESS_DATE);
      expect(generatedBrief).toMatchObject({
        publication: "INTERNAL_ONLY",
        sections: {
          costsAndBudgets: { kind: "UNAVAILABLE", value: { measuredCostCents: 0, reconciliation: "PENDING" } },
          externalActionsPerformed: { kind: "UNAVAILABLE", value: { deployments: 0, messages: 0, paidCalls: 0, publications: 0, purchases: 0 } },
        },
      });
      const snapshotWithDurableBrief = await queryService.snapshot();
      const decisionKeys = snapshotWithDurableBrief.overview.decisionInbox.map(({ decisionKey }) => decisionKey);
      expect(snapshotWithDurableBrief.overview.decisionsRequired).toBe(decisionKeys.length);
      expect(new Set(decisionKeys).size).toBe(decisionKeys.length);
      expect(decisionKeys).toContain("CONTENT_PRODUCTION:acceptance-content-001");
      const telegramRequests: TelegramBotApiRequest[] = [];
      const telegramTransport: TelegramBotApiTransport = {
        request: (request) => {
          telegramRequests.push(request);
          return Promise.resolve({ ok: true, result: [] });
        },
      };
      const telegram = new TelegramBotApiClient(telegramConfig(), "acceptance-fake-token", telegramTransport);
      const telegramConsole = new TelegramDailyBriefConsole({ chatId: "200", clock, service: dailyBrief });
      const detail = await telegramConsole.handle(`/daily_brief ${generatedBrief.briefId}`);
      await telegram.deliver(detail);
      expect(detail.text).toContain("Azioni esterne [UNAVAILABLE]: dato non disponibile; gli zeri mostrati non sono misurati");
      expect(detail.text).toContain("INTERNAL_ONLY");
      expect(telegramRequests).toMatchObject([{ method: "sendMessage", body: { chat_id: "200", text: detail.text } }]);

      const usageBeforeStop = await repositories.transaction(({ operationsRuntime }) => operationsRuntime.summarizeUsage(WORKSPACE_ID));
      const executionsBeforeStop = instrumentedHandlers.executions;
      await runtimeControl.update({
        expectedVersion: 1,
        killSwitch: "ACTIVE",
        maintenanceMode: "DISABLED",
        reasonCode: "ACCEPTANCE_KILL_SWITCH",
        updatedBy: ACTOR_ID,
      });
      const stoppedJob = localJob(clock, {
        jobId: "acceptance-must-remain-queued",
        jobType: "EVIDENCE_FRESHNESS_CHECK",
        payload: {},
        priority: 100,
      });
      await repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(stoppedJob));
      await expect(worker.runOnce()).resolves.toMatchObject({ status: "STOPPED", unauthorizedExternalEffectOccurred: false });
      const stoppedState = await repositories.transaction(async ({ operationsRuntime }) => ({
        job: await operationsRuntime.getJobById(stoppedJob.jobId),
        usage: await operationsRuntime.summarizeUsage(WORKSPACE_ID),
      }));
      expect(stoppedState.job).toEqual(stoppedJob);
      expect(stoppedState.usage).toEqual(usageBeforeStop);
      expect(instrumentedHandlers.executions).toBe(executionsBeforeStop);
      await runtimeControl.update({
        expectedVersion: 2,
        killSwitch: "RELEASED",
        maintenanceMode: "DISABLED",
        reasonCode: "ACCEPTANCE_RELEASE",
        updatedBy: ACTOR_ID,
      });

      await worker.close();
      await scheduler.close();
      await started.close();
      worker = undefined;
      scheduler = undefined;
      started = undefined;
      await Promise.all(openLocks.map((lock) => lock.close()));

      const finalState = await repositories.transaction(async ({ agentCompanyWorkdays, operationsRuntime }) => ({
        company: await agentCompanyWorkdays.getById("acceptance-company-day-001"),
        schedulerLeases: await operationsRuntime.listProcessLeases(WORKSPACE_ID, "SCHEDULER", 10),
        usage: await operationsRuntime.summarizeUsage(WORKSPACE_ID),
        workerLeases: await operationsRuntime.listProcessLeases(WORKSPACE_ID, "WORKER", 10),
      }));
      expect(finalState.schedulerLeases).toEqual([]);
      expect(finalState.workerLeases).toEqual([]);
      expect(finalState.usage).toMatchObject({
        costCents: 0,
        externalEffectsExecuted: false,
        providerCalls: 0,
        toolCalls: 0,
      });
      expect(finalState.company?.externalActionsExecuted).toBe(false);
      await expect(access(lockPaths.api)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(lockPaths.scheduler)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(lockPaths.worker)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await stream?.close();
      await worker?.close();
      await scheduler?.close();
      await started?.close();
      await Promise.allSettled(openLocks.map((lock) => lock.close()));
      await repositories.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);
});

class MutableClock {
  #value: Date;

  public constructor(value: string) { this.#value = new Date(value); }
  public now(): Date { return new Date(this.#value); }
}

class InstrumentedHandlerRegistry implements OperationsJobHandlerRegistry {
  public executions = 0;

  public constructor(private readonly delegate: OperationsJobHandlerRegistry) {}

  public resolve(jobType: OperationsJobType): OperationsJobHandler {
    const handler = jobType === "SECURITY_POSTURE_CHECK"
      ? malformedLocalHandler()
      : this.delegate.resolve(jobType);
    return {
      execute: async (job: OperationsJob, context: OperationsJobHandlerContext) => {
        this.executions += 1;
        return handler.execute(job, context);
      },
    };
  }
}

class FakeResearchHttpsClient implements RestrictedHttpsClient {
  public calls = 0;

  public acquire(input: { readonly url: string }): Promise<RestrictedHttpsAcquisition> {
    const suffix = input.url.split("/").at(-1);
    if (suffix !== "a" && suffix !== "b" && suffix !== "c") return Promise.reject(new Error("Unexpected fake research URL"));
    this.calls += 1;
    const body = `<html><head><title>Segnale ${suffix}</title><meta name="author" content="Onlyway acceptance fixture"><meta property="article:published_time" content="2026-07-18T00:00:00.000Z"></head><body>Segnale verificato per opportunità ${suffix}. Evidenza controllata acquisita esclusivamente dal fake transport.</body></html>`;
    return Promise.resolve(Object.freeze({
      body,
      byteLength: new TextEncoder().encode(body).byteLength,
      contentType: "text/html",
      finalUrl: input.url,
      redirectChain: [],
    }));
  }
}

class SseProbe {
  readonly #abort = new AbortController();
  readonly #decoder = new TextDecoder();
  #received = "";

  private constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  public static async open(url: string, headers: Readonly<Record<string, string>>): Promise<SseProbe> {
    const abort = new AbortController();
    const response = await fetch(url, { headers, signal: abort.signal });
    if (response.status !== 200 || response.body === null) {
      abort.abort();
      throw new Error(`Expected live event stream, received ${String(response.status)}`);
    }
    const probe = new SseProbe(response.body.getReader());
    probe.#abort.signal.addEventListener("abort", () => { abort.abort(); }, { once: true });
    return probe;
  }

  public async readUntil(marker: string): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (!this.#received.includes(marker)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timed out waiting for SSE marker ${marker}`);
      const result = await Promise.race([
        this.reader.read(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => { reject(new Error(`Timed out waiting for SSE marker ${marker}`)); }, remaining);
        }),
      ]);
      if (result.done) throw new Error(`SSE ended before marker ${marker}`);
      this.#received += this.#decoder.decode(result.value, { stream: true });
    }
    return this.#received;
  }

  public async close(): Promise<void> {
    this.#abort.abort();
    try { await this.reader.cancel(); }
    catch { /* The abort can close the stream before cancellation is observed. */ }
  }
}

function founderWorkdayService(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock): FounderWorkdayService {
  return new FounderWorkdayService({
    actorId: ACTOR_ID,
    clock,
    repositories,
    state: new RepositoryBackedFounderWorkdayStateSource(),
    workspaceId: WORKSPACE_ID,
  });
}

function dailyBriefService(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock): DailyOperatingBriefService {
  return new DailyOperatingBriefService({
    actorId: ACTOR_ID,
    clock,
    repositories,
    source: new RepositoryBackedDailyOperatingBriefSource(),
    workspaceId: WORKSPACE_ID,
  });
}

async function commandCenterSession(started: StartedCommandCenterRuntime): Promise<Readonly<{
  readonly cookie: string;
  readonly csrfToken: string;
  readonly origin: string;
}>> {
  const entry = await fetch(started.accessUrl, { redirect: "manual" });
  expect(entry.status).toBe(303);
  const cookie = entry.headers.get("set-cookie");
  if (cookie === null) throw new Error("Expected private Command Center cookie");
  const origin = new URL(started.accessUrl).origin;
  const response = await fetch(`${origin}/api/session`, { headers: { Cookie: cookie } });
  if (response.status !== 200) throw new Error("Expected Command Center CSRF session");
  const value = await response.json() as { readonly csrfToken?: string };
  if (typeof value.csrfToken !== "string") throw new Error("Expected Command Center CSRF token");
  return Object.freeze({ cookie, csrfToken: value.csrfToken, origin });
}

async function executeDashboardControl(
  session: Readonly<{ readonly cookie: string; readonly csrfToken: string; readonly origin: string }>,
  body: Readonly<Record<string, unknown>>,
): Promise<ControlActionReceipt> {
  const headers = {
    "Content-Type": "application/json",
    Cookie: session.cookie,
    Origin: session.origin,
    "X-Onlyway-Csrf": session.csrfToken,
  };
  const proposedResponse = await fetch(`${session.origin}/api/control-actions/propose`, {
    body: JSON.stringify({ contractVersion: "1", ...body }),
    headers,
    method: "POST",
  });
  expect(proposedResponse.status).toBe(200);
  const proposed = await proposedResponse.json() as ProposedControlAction;
  if (proposed.confirmationToken === undefined) throw new Error("Expected fresh dashboard confirmation token");
  const confirmedResponse = await fetch(`${session.origin}/api/control-actions/confirm`, {
    body: JSON.stringify({
      confirmationToken: proposed.confirmationToken,
      contractVersion: "1",
      entityFingerprint: body.fingerprint,
      proposalId: proposed.proposal.proposalId,
    }),
    headers,
    method: "POST",
  });
  expect(confirmedResponse.status).toBe(200);
  return await confirmedResponse.json() as ControlActionReceipt;
}

function controlBody(
  action: Extract<OperationsControlAction, "REQUEUE_DEAD_LETTER_JOB" | "RETRY_FAILED_JOB">,
  job: OperationsJob,
  idempotencyKey: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    action,
    entityId: job.jobId,
    entityVersion: job.version,
    fingerprint: controlFingerprint(job),
    idempotencyKey,
    reason: Object.freeze({ code: action, detail: "Fabio richiede un successore locale tracciato senza mutare il job terminale." }),
  });
}

function localJob(clock: MutableClock, input: Readonly<{
  readonly jobId: string;
  readonly jobType: OperationsJobType;
  readonly payload: OperationsJobPayload;
  readonly priority: number;
}>): OperationsJob {
  const now = clock.now().toISOString();
  return Object.freeze({
    actorId: ACTOR_ID,
    attempt: 0,
    budget: Object.freeze({ maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 0 }),
    contractVersion: "1",
    createdAt: now,
    heartbeatIntervalMs: 500,
    jobId: input.jobId,
    jobType: input.jobType,
    leaseDurationMs: 20_000,
    operationIdentity: `operation-${input.jobId}`,
    owner: "operations-acceptance",
    payload: input.payload,
    payloadFingerprint: createOperationsPayloadFingerprint(input.payload),
    priority: input.priority,
    recoveryStrategy: "RETRY_OR_DEAD_LETTER",
    retryPolicy: Object.freeze({ automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 }),
    runAfter: now,
    scheduledFor: now,
    status: "QUEUED",
    timeoutMs: 5_000,
    updatedAt: now,
    version: 0,
    workspaceId: WORKSPACE_ID,
  });
}

function malformedLocalHandler(): OperationsJobHandler {
  return {
    execute: (): Promise<OperationsExecutionResult> => Promise.resolve({
      costCents: 0,
      externalEffectsExecuted: "INVALID_LOCAL_RESULT",
      providerCalls: 0,
      toolCalls: 0,
    } as unknown as OperationsExecutionResult),
  };
}

async function seedAuthorizedEvidence(
  repositories: SqliteRepositoryTransactionRunner,
  clock: MutableClock,
  https: FakeResearchHttpsClient,
): Promise<void> {
  const operationalPlanes = new OperationalPlaneService({ actorId: ACTOR_ID, clock, repositories, workspaceId: WORKSPACE_ID });
  await operationalPlanes.registerSource({
    canonicalReference: "https://example.org/acceptance/",
    category: "OFFICIAL_SITE",
    maxFreshnessDays: 30,
    name: "Acceptance fake source",
    permittedRiskDomains: ["GENERAL"],
    publicCitationAllowed: true,
    reliability: "HIGH",
    requiresSecondSource: false,
    sourceId: "acceptance-source",
    status: "AUTHORIZED",
  });
  const research = new AuthorizedResearchService({
    actorId: ACTOR_ID,
    clock,
    https,
    operationalPlanes,
    repositories,
    workspaceId: WORKSPACE_ID,
  });
  const result = await research.run({
    claims: (["a", "b", "c"] as const).map((suffix) => ({
      claimId: `acceptance-claim-${suffix}`,
      contradictionPhrases: ["segnale smentito"],
      requiredPhrases: [`segnale verificato per opportunità ${suffix}`],
      riskDomain: "GENERAL" as const,
      statement: `Segnale verificato per opportunità ${suffix}.`,
    })),
    maxBytesPerSource: 50_000,
    maxRedirects: 1,
    missionId: "acceptance-authorized-research",
    packs: (["a", "b", "c"] as const).map((suffix) => ({
      evidenceIds: [`acceptance-evidence-${suffix}`],
      opportunityId: `acceptance-opportunity-${suffix}`,
      packId: `acceptance-pack-${suffix}`,
    })),
    targets: (["a", "b", "c"] as const).map((suffix) => ({
      claimIds: [`acceptance-claim-${suffix}`],
      evidenceId: `acceptance-evidence-${suffix}`,
      limitations: ["Fixture locale acquisita da fake transport; non rappresenta ricerca di mercato."],
      sourceId: "acceptance-source",
      url: `https://example.org/acceptance/${suffix}`,
    })),
    timeoutMs: 2_000,
  });
  if (result.status !== "READY") throw new Error(`Fake research fixture was blocked: ${result.blockers.join(" | ")}`);
}

function agentCompanyInput(): AgentCompanyWorkdayInput {
  return {
    businessMission: businessMission(),
    content: {
      brief: {
        audience: "Piccoli business italiani",
        callToAction: "Richiedi il pilota",
        contractVersion: "1",
        evidence: [{
          evidenceId: "acceptance-evidence-a",
          sourceRef: "acceptance-source",
          statement: "Segnale verificato per opportunità a.",
        }],
        language: "it",
        missionReference: "acceptance-mission-001",
        objective: "lead_generation",
        offer: "servizio evidence-led",
        productionId: "acceptance-content-001",
        topic: "validare un'offerta AI con evidenze",
      },
      evidencePackId: "acceptance-pack-a",
    },
    developer: {
      acceptanceChecks: ["lint", "typecheck", "tests", "build"],
      filesInScope: ["tests/acceptance"],
      isolatedBranch: "feature/telegram-operator-console",
      objective: "Verificare la composizione locale senza merge o deploy",
    },
    maxBudgetCents: 300_000,
    missionId: "acceptance-mission-001",
    objective: "Eseguire una giornata operativa locale, verificabile e priva di effetti esterni",
    publisher: { platforms: ["instagram", "tiktok"], scheduledFor: "2026-07-20T09:00:00.000Z" },
    researchMissionId: "acceptance-authorized-research",
    researchPacks: [
      { evidenceIds: ["acceptance-evidence-a"], packId: "acceptance-pack-a" },
      { evidenceIds: ["acceptance-evidence-b"], packId: "acceptance-pack-b" },
      { evidenceIds: ["acceptance-evidence-c"], packId: "acceptance-pack-c" },
    ],
    workdayId: "acceptance-company-day-001",
  };
}

function businessMission(): BusinessMissionExecutionInput {
  return {
    candidates: [candidate("a", 90), candidate("b", 70), candidate("c", 50)],
    commercialPlan: {
      acquisition: {
        channels: [{ channel: "Outreach manuale", message: "Proposta pilota evidence-led", priority: 1 }],
        emailSequence: [{ body: "Bozza locale non inviata per presentare il pilota.", subject: "Pilota Onlyway" }],
        faq: [{ answer: "Misuriamo segnali prima di investire.", question: "Perché un pilota?" }],
        landingCopy: {
          callToAction: "Richiedi il pilota",
          headline: "Valida prima di scalare",
          proof: "Evidenze e assunzioni restano separate.",
          subheadline: "Un esperimento controllato per una decisione verificabile.",
        },
        outreachScript: "Bozza locale; nessun contatto eseguito.",
        socialSupport: ["Contenuto con CTA misurabile, non pubblicato."],
      },
      economics: [scenario("PRUDENT", 3), scenario("BASE", 5), scenario("AMBITIOUS", 8)],
      offer: {
        bonuses: ["Report finale"],
        customerExclusions: ["Richieste di promesse di ricavo"],
        differentiation: "Evidenze e gate riproducibili",
        deliverables: ["Audit", "Piano", "Pacchetto"],
        guarantee: "Consegna dei deliverable dichiarati",
        idealCustomer: "Piccoli business con offerta da validare",
        limits: ["Nessuna promessa di ricavo"],
        mechanism: "Ricerca autorizzata e validazione controllata",
        objections: [{ objection: "Mancano dati storici", response: "Si parte con un esperimento limitato." }],
        opportunityId: "acceptance-opportunity-a",
        positioning: "Servizio operativo evidence-led",
        primaryProblem: "Decisioni commerciali non verificate",
        promisedOutcome: "Decisione commerciale supportata da evidenze",
        tiers: [{ deliverables: ["Audit", "Piano"], name: "Pilota", priceCents: 250_000 }],
      },
      validation: [{
        assetNeeded: "Landing locale",
        audience: "10 piccoli business",
        authorizationRequired: true,
        durationDays: 10,
        experimentId: "acceptance-validation",
        hypothesis: "Almeno due prospect richiedono una call",
        maxCostCents: 20_000,
        method: "MANUAL_OUTREACH",
        minimumThreshold: "2 risposte qualificate",
        nextDecision: "Continuare o fermare",
        primaryMetric: "Risposte qualificate",
        sampleSize: 10,
        stopCondition: "0 risposte dopo 10 contatti",
      }],
    },
    mission: {
      assets: ["MV-AI-OS", "Metodo Veloce"],
      availableDays: 60,
      competencies: ["AI", "contenuti", "workflow"],
      customerModel: "B2B",
      forbiddenActions: ["spesa non autorizzata", "email automatica", "pubblicazione"],
      geography: "Italia",
      maxCapitalCents: 300_000,
      minimumThresholds: { maxValidationDays: 30, minGrossMarginBps: 5_000, minOpportunityScore: 65 },
      missionId: "acceptance-business-001",
      objective: "Confrontare tre servizi AI lanciabili entro 60 giorni",
      revenueModels: ["servizio a progetto"],
      riskTolerance: "MEDIUM",
    },
  };
}

function candidate(suffix: "a" | "b" | "c", score: number): BusinessMissionExecutionInput["candidates"][number] {
  const criteria: readonly BusinessScoreCriterion[] = [
    "VERIFIED_DEMAND",
    "VALIDATION_SPEED",
    "CAPITAL_EFFICIENCY",
    "MARGIN_POTENTIAL",
    "CUSTOMER_ACCESS",
    "FABIO_ADVANTAGE",
    "RISK_CONTROL",
  ];
  return {
    assumptions: ["Il CAC è un'assunzione."],
    capitalRequiredCents: 50_000,
    competition: "Competizione dichiarata",
    customer: "Piccoli business",
    demand: "Domanda collegata all'Evidence Pack",
    entryBarrier: "Capacità operativa",
    evidencePackId: `acceptance-pack-${suffix}`,
    marginPotentialBps: 7_000,
    missingInformation: [],
    operationalComplexity: "LOW",
    opportunityId: `acceptance-opportunity-${suffix}`,
    problem: "Validazione commerciale insufficiente",
    risk: "LOW",
    scoreInputs: criteria.map((criterion) => ({
      confidence: "HIGH",
      criterion,
      dataKind: "REAL",
      evidenceId: `acceptance-evidence-${suffix}`,
      formula: "Punteggio normalizzato 0-100 dal dato dichiarato",
      value: score,
    })),
    title: `Opportunità ${suffix.toUpperCase()}`,
    validationSpeedDays: 10,
  };
}

function scenario(
  name: "AMBITIOUS" | "BASE" | "PRUDENT",
  volume: number,
): BusinessMissionExecutionInput["commercialPlan"]["economics"][number] {
  const values = {
    acquisitionCostCents: 12_000,
    conversionRateBps: 1_000,
    deliveryCostCents: 8_000,
    fixedCostsCents: 10_000,
    hourlyCostCents: 3_000,
    humanHoursPerClient: 4,
    monthlyVolume: volume,
    priceCents: 250_000,
    refundRateBps: 0,
    toolCostsCents: 5_000,
  };
  return {
    ...values,
    name,
    provenance: Object.keys(values).map((field) => ({
      dataKind: "ASSUMPTION" as const,
      field: field as keyof typeof values,
      note: "Input dichiarato per il collaudo deterministico.",
    })),
  };
}

function telegramConfig(): TelegramOperatorConfig {
  return {
    allowedChatId: "200",
    allowedUserId: "100",
    botToken: {
      contractVersion: "1",
      secretId: "acceptance-telegram-fake",
      source: "environment",
      variableName: "MV_AI_OS_TELEGRAM_BOT_TOKEN",
    },
    contractVersion: "1",
    polling: {
      confirmationRetentionSeconds: 600,
      limit: 10,
      sessionRetentionSeconds: 600,
      timeoutSeconds: 10,
      updateReceiptRetentionSeconds: 3_600,
    },
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}
