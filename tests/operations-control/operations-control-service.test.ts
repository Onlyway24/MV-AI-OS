import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DeterministicMetodoVeloceContentProductionLine } from "../../src/content-production/deterministic-metodo-veloce-content-production-line.js";
import type { MetodoVeloceContentProductionRecord } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { OperationsControlService } from "../../src/operations-control/operations-control-service.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type {
  ControlActionReceipt,
  OperationsControlAction,
  ProductionControlRecord,
  ProposedControlAction,
  ProposeControlActionInput,
} from "../../src/operations-control/operations-control.js";
import { controlFingerprint } from "../../src/operations-control/operations-control-validator.js";
import { OPERATIONAL_EVENT_SEMANTICS } from "../../src/operations-runtime/operational-event.js";
import type { OperationsJob } from "../../src/operations-runtime/operations-runtime.js";
import { createOperationsPayloadFingerprint } from "../../src/operations-runtime/operations-runtime-validator.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

const ACTOR_ID = "fabio";
const START = "2026-07-19T08:00:00.000Z";
const WORKSPACE_ID = "onlyway";

describe("OperationsControlService SQLite end-to-end", () => {
  it("keeps source packages immutable across revision, pause, resume, and cancel", async () => {
    await withHarness(async (harness) => {
      const revisionProduction = await seedProduction(harness, "production-revision");
      const originalJson = JSON.stringify(revisionProduction);
      const revision = await execute(harness.service(), proposalInput(
        "REQUEST_PRODUCTION_REVISION",
        revisionProduction.productionId,
        revisionProduction.version,
        controlFingerprint(revisionProduction),
        "revision-production-v0",
      ));

      const revisionState = await harness.repositories.transaction(async ({ contentProductions, operationsControls }) => ({
        control: await operationsControls.getProductionControl(revisionProduction.productionId),
        production: await contentProductions.getById(revisionProduction.productionId),
      }));
      expect(revision.proposed.proposal.target.entityFingerprint).toBe(controlFingerprint(revisionProduction));
      expect(JSON.stringify(revisionState.production)).toBe(originalJson);
      expect(revisionState.control).toMatchObject({
        revisions: [expect.objectContaining({
          sourcePackageFingerprint: canonicalSha256(revisionProduction.package),
          sourceProductionVersion: revisionProduction.version,
          status: "REQUESTED",
        })],
        state: "REVISION_REQUIRED",
        version: 1,
      });
      expect(revisionState.control?.sourcePackageFingerprint).not.toBe(revision.proposed.proposal.target.entityFingerprint);
      expect(revision.receipt.resultEntityVersion).toBe(1);

      const lifecycleProduction = await seedProduction(harness, "production-lifecycle");
      const paused = await execute(harness.service(), proposalInput(
        "PAUSE_PRODUCTION",
        lifecycleProduction.productionId,
        lifecycleProduction.version,
        controlFingerprint(lifecycleProduction),
        "pause-production-v0",
      ));
      const pausedControl = await productionControl(harness, lifecycleProduction.productionId);
      expect(pausedControl).toMatchObject({ state: "PAUSED", version: 1 });

      const resumed = await execute(harness.service(), proposalInput(
        "RESUME_PRODUCTION",
        lifecycleProduction.productionId,
        pausedControl.version,
        controlFingerprint(pausedControl),
        "resume-production-v1",
      ));
      const resumedControl = await productionControl(harness, lifecycleProduction.productionId);
      expect(resumedControl).toMatchObject({ state: "ACTIVE", version: 2 });

      const cancelled = await execute(harness.service(), proposalInput(
        "CANCEL_PRODUCTION",
        lifecycleProduction.productionId,
        resumedControl.version,
        controlFingerprint(resumedControl),
        "cancel-production-v2",
      ));
      const cancelledControl = await productionControl(harness, lifecycleProduction.productionId);
      expect(cancelledControl).toMatchObject({
        history: [
          expect.objectContaining({ action: "PAUSE", version: 1 }),
          expect.objectContaining({ action: "RESUME", version: 2 }),
          expect.objectContaining({ action: "CANCEL", version: 3 }),
        ],
        state: "CANCELLED",
        version: 3,
      });
      expect([paused.receipt.resultEntityVersion, resumed.receipt.resultEntityVersion, cancelled.receipt.resultEntityVersion]).toEqual([1, 2, 3]);

      const durable = await harness.repositories.transaction(async ({ audits, operationalEvents, operationsControls }) => ({
        audits: await Promise.all([revision, paused, resumed, cancelled].map(({ proposed }) => audits.listByWorkspaceAndCorrelationId(WORKSPACE_ID, proposed.proposal.proposalId, 10))),
        events: await operationalEvents.listAfter(WORKSPACE_ID, 0, 20),
        receipts: await operationsControls.listReceipts(WORKSPACE_ID, 20),
      }));
      expect(durable.receipts).toHaveLength(4);
      expect(durable.events.map(({ eventType }) => eventType)).toEqual([
        "REVISION_REQUESTED",
        "PRODUCTION_STATUS_CHANGED",
        "PRODUCTION_STATUS_CHANGED",
        "PRODUCTION_STATUS_CHANGED",
      ]);
      expect(JSON.stringify(durable.events)).not.toContain("Il controllo richiesto da Fabio");
      for (const audit of durable.audits) expect(audit.map(({ eventType }) => eventType)).toEqual(["control_action_confirmed", "control_action_proposed"]);

      const firstHistory = resumedControl.history[0];
      if (firstHistory === undefined) throw new Error("Expected production control history");
      const tampered: ProductionControlRecord = {
        ...resumedControl,
        history: [
          { ...firstHistory, reasonCode: "TAMPERED_HISTORY" },
          ...resumedControl.history.slice(1),
          { action: "CANCEL" as const, actorId: ACTOR_ID, occurredAt: harness.clock.now().toISOString(), reasonCode: "CANCEL_PRODUCTION", state: "CANCELLED" as const, version: 3 },
        ],
        state: "CANCELLED" as const,
        updatedAt: harness.clock.now().toISOString(),
        version: 3,
      };
      await expect(harness.repositories.transaction(({ operationsControls }) => operationsControls.updateProductionControl(tampered, { version: 2 })))
        .rejects.toMatchObject({ code: "repository_conflict" });
    });
  });

  it("retries failed jobs and requeues dead letters as one immutable successor each", async () => {
    await withHarness(async (harness) => {
      const failed = await seedTerminalJob(harness, "job-failed", "FAILED");
      const deadLetter = await seedTerminalJob(harness, "job-dead-letter", "DEAD_LETTER");
      const failedBefore = JSON.stringify(failed);
      const deadLetterBefore = JSON.stringify(deadLetter);

      const retry = await execute(harness.service(), proposalInput("RETRY_FAILED_JOB", failed.jobId, failed.version, controlFingerprint(failed), "retry-failed-job-v2"));
      const retryReplay = await harness.service().confirm(confirmation(retry.proposed, retry.receipt.target.entityFingerprint));
      expect(retryReplay).toEqual(retry.receipt);
      const requeue = await execute(harness.service(), proposalInput("REQUEUE_DEAD_LETTER_JOB", deadLetter.jobId, deadLetter.version, controlFingerprint(deadLetter), "requeue-dead-letter-v2"));

      const persisted = await harness.repositories.transaction(async ({ operationalEvents, operationsRuntime }) => ({
        deadLetter: await operationsRuntime.getJobById(deadLetter.jobId),
        failed: await operationsRuntime.getJobById(failed.jobId),
        requeued: await operationsRuntime.getJobById(requeue.receipt.resultEntityId),
        retried: await operationsRuntime.getJobById(retry.receipt.resultEntityId),
        events: await operationalEvents.listAfter(WORKSPACE_ID, 0, 10),
      }));
      expect(JSON.stringify(persisted.failed)).toBe(failedBefore);
      expect(JSON.stringify(persisted.deadLetter)).toBe(deadLetterBefore);
      expect(persisted.retried).toMatchObject({ attempt: 0, predecessorJobId: failed.jobId, status: "QUEUED", version: 0 });
      expect(persisted.requeued).toMatchObject({ attempt: 0, predecessorJobId: deadLetter.jobId, status: "QUEUED", version: 0 });
      expect(persisted.retried).not.toHaveProperty("lastFailure");
      expect(persisted.retried).not.toHaveProperty("receipt");
      expect(persisted.requeued).not.toHaveProperty("lastFailure");
      expect(persisted.requeued).not.toHaveProperty("receipt");
      expect(persisted.events.map(({ eventType }) => eventType)).toEqual(["JOB_QUEUED", "JOB_QUEUED"]);

      const consumedReplay = await harness.service().propose(proposalInput("RETRY_FAILED_JOB", failed.jobId, failed.version, controlFingerprint(failed), "retry-failed-job-v2"));
      expect(consumedReplay).toMatchObject({ replayed: true, proposal: { state: "CONSUMED" } });
      expect(consumedReplay.confirmationToken).toBeUndefined();
      expect(consumedReplay.receipt).toEqual(retry.receipt);
    });
  });

  it("reserves exactly one manual successor across different idempotency keys and restarts", async () => {
    await withHarness(async (harness) => {
      const failed = await seedTerminalJob(harness, "job-single-successor", "FAILED");
      const service = harness.service();
      const first = await service.propose(proposalInput("RETRY_FAILED_JOB", failed.jobId, failed.version, controlFingerprint(failed), "retry-single-successor-a"));
      const competing = await service.propose(proposalInput("RETRY_FAILED_JOB", failed.jobId, failed.version, controlFingerprint(failed), "retry-single-successor-b"));
      const targetFingerprint = controlFingerprint(failed);
      const receipt = await service.confirm(confirmation(first, targetFingerprint));

      await expect(service.confirm(confirmation(competing, targetFingerprint)))
        .rejects.toThrow("already has a manual successor");
      const reservation = await harness.repositories.transaction(({ operationsRuntime }) =>
        operationsRuntime.getSuccessorByPredecessor(WORKSPACE_ID, failed.jobId));
      expect(reservation).toEqual({
        predecessorJobId: failed.jobId,
        successorJobId: receipt.resultEntityId,
        workspaceId: WORKSPACE_ID,
      });

      const restarted = await harness.restart();
      await expect(restarted.confirm(confirmation(competing, targetFingerprint)))
        .rejects.toThrow("already has a manual successor");
      await expect(harness.repositories.transaction(async ({ operationsRuntime }) => {
        const successor = await operationsRuntime.getJobById(receipt.resultEntityId);
        if (successor === undefined) throw new Error("Expected durable successor");
        await operationsRuntime.insertJob({
          ...successor,
          jobId: "successor-direct-duplicate",
          operationIdentity: "successor-direct-duplicate",
        });
      })).rejects.toThrow("predecessor already has a successor");
    });
  });

  it("binds incident acknowledgement to identity, version, fingerprint, and token", async () => {
    await withHarness(async (harness) => {
      const service = harness.service();
      const incident = await service.openIncident({ incidentId: "incident-worker-stale", severity: "HIGH", summaryCode: "WORKER_HEARTBEAT_STALE" });
      const input = proposalInput("ACKNOWLEDGE_INCIDENT", incident.incidentId, incident.version, incident.fingerprint, "ack-incident-v0");

      expect(() => service.propose({ ...input, actorId: "mallory" })).toThrow("Control action identity is not authorized");
      expect(() => service.propose({ ...input, workspaceId: "other-workspace" })).toThrow("Control action identity is not authorized");
      await expect(service.propose({ ...input, entityVersion: 1 })).rejects.toMatchObject({ code: "repository_conflict" });
      await expect(service.propose({ ...input, fingerprint: "0".repeat(64) })).rejects.toMatchObject({ code: "repository_conflict" });

      const proposed = await service.propose(input);
      const token = requiredToken(proposed);
      await expect(service.confirm({ ...confirmation(proposed, incident.fingerprint), actorId: "mallory" })).rejects.toMatchObject({ code: "repository_conflict" });
      await expect(service.confirm({ ...confirmation(proposed, incident.fingerprint), workspaceId: "other-workspace" })).rejects.toMatchObject({ code: "repository_conflict" });
      await expect(service.confirm({ ...confirmation(proposed, incident.fingerprint), confirmationToken: "0".repeat(64) })).rejects.toMatchObject({ code: "repository_conflict" });
      await expect(service.confirm(confirmation(proposed, "0".repeat(64)))).rejects.toMatchObject({ code: "repository_conflict" });

      const receipt = await service.confirm(confirmation(proposed, incident.fingerprint));
      expect(await service.confirm({ ...confirmation(proposed, incident.fingerprint), confirmationToken: token })).toEqual(receipt);
      await expect(service.confirm({ ...confirmation(proposed, incident.fingerprint), confirmationToken: "0".repeat(64) })).rejects.toMatchObject({ code: "repository_conflict" });
      const state = await harness.repositories.transaction(async ({ audits, operationalEvents, operationsControls }) => ({
        audits: await audits.listByWorkspaceAndCorrelationId(WORKSPACE_ID, proposed.proposal.proposalId, 10),
        events: await operationalEvents.listAfter(WORKSPACE_ID, 0, 10),
        incident: await operationsControls.getIncident(incident.incidentId),
      }));
      expect(state.incident).toMatchObject({ acknowledgedBy: ACTOR_ID, status: "ACKNOWLEDGED", version: 1 });
      expect(state.incident?.fingerprint).not.toBe(incident.fingerprint);
      expect(state.events).toMatchObject([{ eventType: "INCIDENT_ACKNOWLEDGED", safeSummaryCode: "incident_acknowledged" }]);
      expect(state.audits.map(({ eventType }) => eventType)).toEqual(["control_action_confirmed", "control_action_proposed"]);
    });
  });

  it("injects operator identity and rejects identity fields supplied by the caller", async () => {
    await withHarness(async (harness) => {
      const service = harness.service();
      const incident = await service.openIncident({ incidentId: "incident-operator-boundary", severity: "MEDIUM", summaryCode: "OPERATOR_REVIEW_REQUIRED" });
      const fullInput = proposalInput("ACKNOWLEDGE_INCIDENT", incident.incidentId, incident.version, incident.fingerprint, "ack-operator-boundary-v0");
      const body = operatorProposalBody(fullInput);
      expect(() => service.proposeForOperator({ ...body, actorId: ACTOR_ID })).toThrow("must not contain identity fields");
      expect(() => service.proposeForOperator({ ...body, workspaceId: WORKSPACE_ID })).toThrow("must not contain identity fields");
      expect(() => service.proposeForOperator({ ...body, unexpected: true })).toThrow("failed validation");

      const proposed = await service.proposeForOperator(body);
      const confirmBody = operatorConfirmationBody(proposed, incident.fingerprint);
      expect(() => service.confirmForOperator({ ...confirmBody, actorId: ACTOR_ID })).toThrow("must not contain identity fields");
      expect(() => service.confirmForOperator({ ...confirmBody, workspaceId: WORKSPACE_ID })).toThrow("must not contain identity fields");
      const receipt = await service.confirmForOperator(confirmBody);
      expect(receipt).toMatchObject({ actorId: ACTOR_ID, workspaceId: WORKSPACE_ID });
    });
  });

  it("rejects a confirmation whose exact target changed after proposal", async () => {
    await withHarness(async (harness) => {
      const production = await seedProduction(harness, "production-stale-confirmation");
      const fingerprint = controlFingerprint(production);
      const firstInput = proposalInput("PAUSE_PRODUCTION", production.productionId, production.version, fingerprint, "pause-stale-first-v0");
      const staleInput = proposalInput("PAUSE_PRODUCTION", production.productionId, production.version, fingerprint, "pause-stale-second-v0");
      const service = harness.service();
      const first = await service.propose(firstInput);
      const stale = await service.propose(staleInput);
      await service.confirm(confirmation(first, fingerprint));
      await expect(service.confirm(confirmation(stale, fingerprint))).rejects.toMatchObject({ code: "repository_conflict" });

      const state = await harness.repositories.transaction(async ({ audits, operationsControls }) => ({
        audits: await audits.listByWorkspaceAndCorrelationId(WORKSPACE_ID, stale.proposal.proposalId, 10),
        proposal: await operationsControls.getProposal(stale.proposal.proposalId),
        receipt: await operationsControls.getReceiptByIdempotencyKey(WORKSPACE_ID, staleInput.idempotencyKey),
      }));
      expect(state.proposal).toMatchObject({ state: "PENDING", version: 0 });
      expect(state.receipt).toBeUndefined();
      expect(state.audits.map(({ eventType }) => eventType)).toEqual(["control_action_proposed"]);
    });
  });

  it("renews pending and expired proposals safely across repository restart", async () => {
    await withHarness(async (harness) => {
      const firstProduction = await seedProduction(harness, "production-restart-renewal");
      const firstInput = proposalInput("PAUSE_PRODUCTION", firstProduction.productionId, firstProduction.version, controlFingerprint(firstProduction), "pause-after-restart-v0");
      const first = await harness.service().propose(firstInput);
      const firstToken = requiredToken(first);

      const restarted = await harness.restart();
      const renewed = await restarted.propose(firstInput);
      expect(renewed).toMatchObject({ proposal: { proposalId: first.proposal.proposalId, state: "PENDING", version: 1 }, replayed: true });
      expect(requiredToken(renewed)).not.toBe(firstToken);
      await expect(restarted.confirm({ ...confirmation(renewed, firstInput.fingerprint), confirmationToken: firstToken })).rejects.toMatchObject({ code: "repository_conflict" });
      await restarted.confirm(confirmation(renewed, firstInput.fingerprint));

      const consumedReplay = await restarted.propose(firstInput);
      expect(consumedReplay).toMatchObject({ proposal: { state: "CONSUMED", version: 2 }, replayed: true });
      expect(consumedReplay.confirmationToken).toBeUndefined();
      expect(consumedReplay.receipt).toMatchObject({ action: "PAUSE_PRODUCTION", resultEntityVersion: 1 });
      await expect(restarted.propose({ ...firstInput, reason: { ...firstInput.reason, detail: "Contenuto conflittuale con la stessa chiave." } }))
        .rejects.toMatchObject({ code: "repository_conflict" });

      const expiringProduction = await seedProduction(harness, "production-expired-renewal");
      const expiringInput = proposalInput("PAUSE_PRODUCTION", expiringProduction.productionId, expiringProduction.version, controlFingerprint(expiringProduction), "pause-after-expiry-v0");
      const expiring = await restarted.propose(expiringInput);
      harness.clock.advance(5 * 60_000);
      await expect(restarted.confirm(confirmation(expiring, expiringInput.fingerprint))).rejects.toMatchObject({ code: "repository_conflict" });

      const afterExpiryRestart = await harness.restart();
      const renewedExpired = await afterExpiryRestart.propose(expiringInput);
      expect(renewedExpired).toMatchObject({ proposal: { proposalId: expiring.proposal.proposalId, state: "PENDING", version: 2 }, replayed: true });
      await afterExpiryRestart.confirm(confirmation(renewedExpired, expiringInput.fingerprint));

      const audits = await harness.repositories.transaction(({ audits }) => audits.listByWorkspaceAndCorrelationId(WORKSPACE_ID, expiring.proposal.proposalId, 10));
      expect(audits.map(({ eventType }) => eventType)).toEqual([
        "control_action_confirmed",
        "control_action_renewed",
        "control_action_expired",
        "control_action_proposed",
      ]);
      expect(new Set(audits.map(({ eventId }) => eventId)).size).toBe(4);
    });
  });

  it("rolls back target, receipt, proposal consumption, audit, and outbox on event conflict", async () => {
    await withHarness(async (harness) => {
      const production = await seedProduction(harness, "production-rollback");
      const original = JSON.stringify(production);
      const input = proposalInput("PAUSE_PRODUCTION", production.productionId, production.version, controlFingerprint(production), "pause-rollback-v0");
      const proposed = await harness.service().propose(input);
      const semantics = OPERATIONAL_EVENT_SEMANTICS.HEALTH_STATE_CHANGED;
      await harness.repositories.transaction(({ operationalEvents }) => operationalEvents.append({
        ...semantics,
        contractVersion: "1",
        entityId: WORKSPACE_ID,
        entityVersion: 0,
        eventId: `event-${proposed.proposal.proposalId}`,
        eventType: "HEALTH_STATE_CHANGED",
        occurredAt: harness.clock.now().toISOString(),
        workspaceId: WORKSPACE_ID,
      }));

      await expect(harness.service().confirm(confirmation(proposed, input.fingerprint))).rejects.toMatchObject({ code: "repository_conflict" });
      const state = await harness.repositories.transaction(async ({ audits, contentProductions, operationalEvents, operationsControls }) => ({
        audits: await audits.listByWorkspaceAndCorrelationId(WORKSPACE_ID, proposed.proposal.proposalId, 10),
        control: await operationsControls.getProductionControl(production.productionId),
        events: await operationalEvents.listAfter(WORKSPACE_ID, 0, 10),
        production: await contentProductions.getById(production.productionId),
        proposal: await operationsControls.getProposal(proposed.proposal.proposalId),
        receipt: await operationsControls.getReceiptByIdempotencyKey(WORKSPACE_ID, input.idempotencyKey),
      }));
      expect(JSON.stringify(state.production)).toBe(original);
      expect(state.control).toBeUndefined();
      expect(state.proposal).toMatchObject({ state: "PENDING", version: 0 });
      expect(state.receipt).toBeUndefined();
      expect(state.audits.map(({ eventType }) => eventType)).toEqual(["control_action_proposed"]);
      expect(state.events).toHaveLength(1);
      expect(state.events[0]?.eventType).toBe("HEALTH_STATE_CHANGED");
    });
  });
});

interface Execution {
  readonly proposed: ProposedControlAction;
  readonly receipt: ControlActionReceipt;
}

class MutableClock {
  #millis = Date.parse(START);
  public advance(milliseconds: number): void { this.#millis += milliseconds; }
  public now(): Date { return new Date(this.#millis); }
}

class Harness {
  public readonly clock = new MutableClock();
  public repositories: SqliteRepositoryTransactionRunner;
  readonly #path: string;
  #idSequence = 0;
  #tokenSequence = 0;

  public constructor(path: string) {
    this.#path = path;
    this.repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
  }

  public service(): OperationsControlService {
    return new OperationsControlService({
      actorId: ACTOR_ID,
      clock: this.clock,
      randomId: () => `test-${String(++this.#idSequence)}`,
      randomToken: () => sha256(`confirmation-${String(++this.#tokenSequence)}`),
      repositories: this.repositories,
      workspaceId: WORKSPACE_ID,
    });
  }

  public async restart(): Promise<OperationsControlService> {
    await this.repositories.close();
    this.repositories = new SqliteRepositoryTransactionRunner({ path: this.#path, timeoutMs: 1_000 });
    return this.service();
  }

  public close(): Promise<void> { return this.repositories.close(); }
}

async function withHarness(test: (harness: Harness) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-operations-control-"));
  const harness = new Harness(join(directory, "runtime.sqlite"));
  try {
    await test(harness);
  } finally {
    await harness.close();
    await rm(directory, { force: true, recursive: true });
  }
}

async function seedProduction(harness: Harness, productionId: string): Promise<MetodoVeloceContentProductionRecord> {
  const contentPackage = new DeterministicMetodoVeloceContentProductionLine(harness.clock).produce({
    audience: "Founder che vogliono prendere decisioni verificabili.",
    callToAction: "Salva il controllo e verifica una sola ipotesi.",
    contractVersion: "1",
    evidence: [{ evidenceId: "evidence-001", sourceRef: "internal-observation", statement: "Il piano dichiara limiti e prossima decisione." }],
    language: "it",
    missionReference: "mission-control-e2e",
    objective: "educate",
    offer: "Metodo Veloce",
    productionId,
    topic: "un controllo editoriale verificabile",
  });
  const now = harness.clock.now().toISOString();
  const record: MetodoVeloceContentProductionRecord = Object.freeze({
    actorId: ACTOR_ID,
    contractVersion: "1",
    createdAt: now,
    package: contentPackage,
    productionId,
    status: "PENDING_FABIO_APPROVAL",
    updatedAt: now,
    version: 0,
    workspaceId: WORKSPACE_ID,
  });
  await harness.repositories.transaction(({ contentProductions }) => contentProductions.insert(record));
  return record;
}

async function seedTerminalJob(harness: Harness, jobId: string, status: "DEAD_LETTER" | "FAILED"): Promise<OperationsJob> {
  const now = harness.clock.now().toISOString();
  const payload = Object.freeze({});
  const queued: OperationsJob = Object.freeze({
    actorId: ACTOR_ID,
    attempt: 0,
    budget: Object.freeze({ maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 1 }),
    contractVersion: "1",
    createdAt: now,
    heartbeatIntervalMs: 1_000,
    jobId,
    jobType: "EVIDENCE_FRESHNESS_CHECK",
    leaseDurationMs: 10_000,
    operationIdentity: `operation-${jobId}`,
    owner: "quality-guardian",
    payload,
    payloadFingerprint: createOperationsPayloadFingerprint(payload),
    priority: 50,
    recoveryStrategy: "RETRY_OR_DEAD_LETTER",
    retryPolicy: Object.freeze({ automaticRetries: 0, initialBackoffMs: 1_000, maxBackoffMs: 1_000 }),
    runAfter: now,
    scheduledFor: now,
    status: "QUEUED",
    timeoutMs: 30_000,
    updatedAt: now,
    version: 0,
    workspaceId: WORKSPACE_ID,
  });
  await harness.repositories.transaction(({ operationsRuntime }) => operationsRuntime.insertJob(queued));
  const running = await harness.repositories.transaction(({ operationsRuntime }) => operationsRuntime.claimNextDue({ fencingToken: 1, leaseId: `lease-${jobId}`, now, workerId: "worker-control-test", workspaceId: WORKSPACE_ID }));
  if (running?.jobId !== jobId) throw new Error("Expected the seeded Operations job to be claimed");
  const terminal: OperationsJob = Object.freeze({
    ...queued,
    attempt: 1,
    lastFailure: Object.freeze({ code: "EXECUTION_FAILED", occurredAt: now, retryable: false }),
    receipt: Object.freeze({ attempt: 1, costCents: 0, externalEffectsExecuted: false, outcome: status, providerCalls: 0, receiptId: `terminal-${jobId}`, recordedAt: now, toolCalls: 0 }),
    status,
    updatedAt: now,
    version: 2,
  });
  await harness.repositories.transaction(({ operationsRuntime }) => operationsRuntime.updateJob(terminal, { version: running.version }));
  return terminal;
}

function proposalInput(
  action: OperationsControlAction,
  entityId: string,
  entityVersion: number,
  fingerprint: string,
  idempotencyKey: string,
): ProposeControlActionInput {
  return Object.freeze({
    action,
    actorId: ACTOR_ID,
    contractVersion: "1",
    entityId,
    entityVersion,
    fingerprint,
    idempotencyKey,
    reason: Object.freeze({ code: action, detail: "Il controllo richiesto da Fabio deve essere applicato con tracciabilità." }),
    ...(action === "REQUEST_PRODUCTION_REVISION" ? {
      revision: Object.freeze({
        category: "CLAIM" as const,
        priority: "HIGH" as const,
        targets: Object.freeze([{ kind: "CLAIM" as const, reference: "carousel.slide-2.claim-1" }]),
      }),
    } : {}),
    workspaceId: WORKSPACE_ID,
  });
}

async function execute(service: OperationsControlService, input: ProposeControlActionInput): Promise<Execution> {
  const proposed = await service.propose(input);
  const receipt = await service.confirm(confirmation(proposed, input.fingerprint));
  return Object.freeze({ proposed, receipt });
}

function confirmation(proposed: ProposedControlAction, entityFingerprint: string) {
  return Object.freeze({
    actorId: ACTOR_ID,
    confirmationToken: requiredToken(proposed),
    contractVersion: "1" as const,
    entityFingerprint,
    proposalId: proposed.proposal.proposalId,
    workspaceId: WORKSPACE_ID,
  });
}

function operatorProposalBody(input: ProposeControlActionInput) {
  return Object.freeze({
    action: input.action,
    contractVersion: input.contractVersion,
    entityId: input.entityId,
    entityVersion: input.entityVersion,
    fingerprint: input.fingerprint,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    ...(input.revision === undefined ? {} : { revision: input.revision }),
  });
}

function operatorConfirmationBody(proposed: ProposedControlAction, entityFingerprint: string) {
  return Object.freeze({
    confirmationToken: requiredToken(proposed),
    contractVersion: "1" as const,
    entityFingerprint,
    proposalId: proposed.proposal.proposalId,
  });
}

function requiredToken(proposed: ProposedControlAction): string {
  if (proposed.confirmationToken === undefined) throw new Error("Expected a fresh confirmation token");
  return proposed.confirmationToken;
}

async function productionControl(harness: Harness, productionId: string) {
  const control = await harness.repositories.transaction(({ operationsControls }) => operationsControls.getProductionControl(productionId));
  if (control === undefined) throw new Error("Expected a durable production control");
  return control;
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
