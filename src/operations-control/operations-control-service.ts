import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { AuditRepository } from "../persistence/audit-repository.js";
import type { MetodoVeloceContentProductionRepository } from "../content-production/metodo-veloce-content-production-repository.js";
import type { OperationalEventRepository } from "../operations-runtime/operational-event-repository.js";
import type { OperationsRuntimeRepository } from "../operations-runtime/operations-runtime-repository.js";
import type { OperationalPlaneRepository } from "../operational-planes/operational-plane-repository.js";
import type { OperationsJob } from "../operations-runtime/operations-runtime.js";
import type { Clock } from "../ports/clock.js";
import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { OperationsControlRepository } from "./operations-control-repository.js";
import {
  type ControlActionProposal,
  type ControlActionReceipt,
  type OperationsIncidentRecord,
  type ProductionControlRecord,
  type ProductionExecutionState,
  type ProposedControlAction,
  type ProposeControlActionInput,
} from "./operations-control.js";
import {
  ConfirmControlActionInputValidator,
  ProposeControlActionInputValidator,
  controlFingerprint,
} from "./operations-control-validator.js";

const PROPOSAL_TTL_MS = 5 * 60_000;

interface OperationsControlTransaction {
  readonly audits: AuditRepository;
  readonly contentProductions: MetodoVeloceContentProductionRepository;
  readonly operationalEvents: OperationalEventRepository;
  readonly operationalPlanes: OperationalPlaneRepository;
  readonly operationsControls: OperationsControlRepository;
  readonly operationsRuntime: OperationsRuntimeRepository;
}

export interface OperationsControlTransactionRunner {
  transaction<T>(operation: (repositories: OperationsControlTransaction) => Promise<T>): Promise<T>;
}

export class OperationsControlService {
  readonly #confirmValidator = new ConfirmControlActionInputValidator();
  readonly #proposeValidator = new ProposeControlActionInputValidator();

  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly randomId?: () => string;
    readonly randomToken?: () => string;
    readonly repositories: OperationsControlTransactionRunner;
    readonly workspaceId: string;
  }) {}

  public propose(candidate: unknown): Promise<ProposedControlAction> {
    const input = checked(candidate, this.#proposeValidator, "Control action proposal");
    this.#assertIdentity(input.actorId, input.workspaceId);
    return this.dependencies.repositories.transaction(async (repositories) => {
      const replay = await repositories.operationsControls.getProposalByIdempotencyKey(input.workspaceId, input.idempotencyKey);
      if (replay !== undefined) {
        if (!sameProposalInput(replay, input)) throw new RepositoryConflictError("Control action idempotency key conflicts with another proposal");
        if (replay.state === "CONSUMED") {
          const receipt = await repositories.operationsControls.getReceiptByIdempotencyKey(input.workspaceId, input.idempotencyKey);
          if (receipt === undefined || !receiptMatchesProposal(receipt, replay)) throw new RepositoryConflictError("Consumed control action has no matching durable receipt");
          return Object.freeze({ proposal: replay, receipt, replayed: true });
        }
        const target = await loadTarget(repositories, input.action, input.entityId, input.actorId, input.workspaceId);
        if (target.version !== input.entityVersion || !sameHash(target.fingerprint, input.fingerprint)) throw new RepositoryConflictError("Control action target is stale");
        const renewedAtDate = this.dependencies.clock.now();
        const renewedAt = renewedAtDate.toISOString();
        const confirmationToken = this.dependencies.randomToken?.() ?? randomBytes(32).toString("hex");
        if (!/^[a-f0-9]{64}$/u.test(confirmationToken)) throw new RepositoryConflictError("Control action confirmation token source is invalid");
        const renewed: ControlActionProposal = deepFreeze({
          ...replay,
          confirmationTokenHash: sha256(confirmationToken),
          expiresAt: new Date(renewedAtDate.getTime() + PROPOSAL_TTL_MS).toISOString(),
          state: "PENDING",
          updatedAt: renewedAt,
          version: replay.version + 1,
        });
        await repositories.operationsControls.updateProposal(renewed, { version: replay.version });
        await repositories.audits.append(audit(renewed, "control_action_renewed", renewedAt, "success"));
        return Object.freeze({ confirmationToken, proposal: renewed, replayed: true });
      }
      const target = await loadTarget(repositories, input.action, input.entityId, input.actorId, input.workspaceId);
      if (target.version !== input.entityVersion || !sameHash(target.fingerprint, input.fingerprint)) throw new RepositoryConflictError("Control action target is stale");
      const createdAtDate = this.dependencies.clock.now();
      const createdAt = createdAtDate.toISOString();
      const confirmationToken = this.dependencies.randomToken?.() ?? randomBytes(32).toString("hex");
      if (!/^[a-f0-9]{64}$/u.test(confirmationToken)) throw new RepositoryConflictError("Control action confirmation token source is invalid");
      const proposal: ControlActionProposal = deepFreeze({
        action: input.action,
        actorId: input.actorId,
        confirmationTokenHash: sha256(confirmationToken),
        contractVersion: "1",
        createdAt,
        expiresAt: new Date(createdAtDate.getTime() + PROPOSAL_TTL_MS).toISOString(),
        idempotencyKey: input.idempotencyKey,
        proposalId: `control-${this.dependencies.randomId?.() ?? randomUUID()}`,
        reason: input.reason,
        ...(input.revision === undefined ? {} : { revision: input.revision }),
        state: "PENDING",
        target: { entityFingerprint: input.fingerprint, entityId: input.entityId, entityVersion: input.entityVersion, kind: target.kind },
        updatedAt: createdAt,
        version: 0,
        workspaceId: input.workspaceId,
      });
      await repositories.operationsControls.insertProposal(proposal);
      await repositories.audits.append(audit(proposal, "control_action_proposed", createdAt, "success"));
      return Object.freeze({ confirmationToken, proposal, replayed: false });
    });
  }

  /** Operator boundary: trusted identity is injected and can never come from HTTP JSON. */
  public proposeForOperator(candidate: unknown): Promise<ProposedControlAction> {
    const body = operatorBody(candidate, "Control action operator proposal");
    return this.propose({ ...body, actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId });
  }

  public async confirm(candidate: unknown): Promise<ControlActionReceipt> {
    const input = checked(candidate, this.#confirmValidator, "Control action confirmation");
    this.#assertIdentity(input.actorId, input.workspaceId);
    const result = await this.dependencies.repositories.transaction(async (repositories) => {
      const proposal = await repositories.operationsControls.getProposal(input.proposalId);
      if (proposal?.actorId !== input.actorId || proposal.workspaceId !== input.workspaceId) throw new RepositoryConflictError("Control action proposal is unavailable");
      if (!sameHash(proposal.confirmationTokenHash, sha256(input.confirmationToken)) || !sameHash(proposal.target.entityFingerprint, input.entityFingerprint)) throw new RepositoryConflictError("Control action confirmation is invalid or stale");
      const replay = await repositories.operationsControls.getReceiptByIdempotencyKey(input.workspaceId, proposal.idempotencyKey);
      if (replay !== undefined) {
        if (!receiptMatchesProposal(replay, proposal)) throw new RepositoryConflictError("Control action receipt does not match its proposal");
        return { expired: false as const, receipt: replay };
      }
      const nowDate = this.dependencies.clock.now();
      const now = nowDate.toISOString();
      if (proposal.state !== "PENDING") throw new RepositoryConflictError("Control action proposal is no longer pending");
      if (Date.parse(proposal.expiresAt) <= nowDate.getTime()) {
        const expired: ControlActionProposal = deepFreeze({ ...proposal, state: "EXPIRED", updatedAt: now, version: proposal.version + 1 });
        await repositories.operationsControls.updateProposal(expired, { version: proposal.version });
        await repositories.audits.append(audit(expired, "control_action_expired", now, "failure"));
        return { expired: true as const };
      }
      const applied = await applyAction(repositories, proposal, now);
      const consumed = deepFreeze({ ...proposal, state: "CONSUMED" as const, updatedAt: now, version: proposal.version + 1 });
      await repositories.operationsControls.updateProposal(consumed, { version: proposal.version });
      const receiptBase = { action: proposal.action, actorId: proposal.actorId, contractVersion: "1" as const, idempotencyKey: proposal.idempotencyKey, proposalId: proposal.proposalId, receiptId: `receipt-${proposal.proposalId}`, recordedAt: now, resultEntityId: applied.entityId, resultEntityVersion: applied.version, target: proposal.target, workspaceId: proposal.workspaceId };
      const receipt: ControlActionReceipt = deepFreeze({ ...receiptBase, outcomeFingerprint: controlFingerprint(receiptBase) });
      await repositories.operationsControls.insertReceipt(receipt);
      await repositories.operationalEvents.append({ aggregateType: applied.aggregateType, contractVersion: "1", entityId: applied.entityId, entityVersion: applied.version, eventId: `event-${proposal.proposalId}`, eventType: applied.eventType, occurredAt: now, safeSummaryCode: applied.summaryCode, workspaceId: proposal.workspaceId });
      await repositories.audits.append(audit(consumed, "control_action_confirmed", now, "success", receipt.receiptId));
      return { expired: false as const, receipt };
    });
    if (result.expired) throw new RepositoryConflictError("Control action proposal expired before confirmation");
    return result.receipt;
  }

  /** Operator boundary: trusted identity is injected and can never come from HTTP JSON. */
  public confirmForOperator(candidate: unknown): Promise<ControlActionReceipt> {
    const body = operatorBody(candidate, "Control action operator confirmation");
    return this.confirm({ ...body, actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId });
  }

  public async openIncident(input: { readonly incidentId: string; readonly severity: OperationsIncidentRecord["severity"]; readonly summaryCode: string }): Promise<OperationsIncidentRecord> {
    const now = this.dependencies.clock.now().toISOString();
    const base = { actorId: this.dependencies.actorId, contractVersion: "1" as const, createdAt: now, incidentId: input.incidentId, severity: input.severity, status: "OPEN" as const, summaryCode: input.summaryCode, updatedAt: now, version: 0, workspaceId: this.dependencies.workspaceId };
    const record: OperationsIncidentRecord = deepFreeze({ ...base, fingerprint: controlFingerprint(base) });
    await this.dependencies.repositories.transaction(({ operationsControls }) => operationsControls.insertIncident(record));
    return record;
  }

  #assertIdentity(actorId: string, workspaceId: string): void { if (actorId !== this.dependencies.actorId || workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Control action identity is not authorized"); }
}

async function loadTarget(repositories: OperationsControlTransaction, action: ControlActionProposal["action"], entityId: string, actorId: string, workspaceId: string): Promise<{ readonly fingerprint: string; readonly kind: ControlActionProposal["target"]["kind"]; readonly version: number }> {
  if (isProductionAction(action)) {
    const control = await repositories.operationsControls.getProductionControl(entityId);
    if (control !== undefined) {
      if (control.actorId !== actorId || control.workspaceId !== workspaceId) throw new RepositoryConflictError("Production control target is unavailable");
      return { fingerprint: controlFingerprint(control), kind: "PRODUCTION", version: control.version };
    }
    const production = await repositories.contentProductions.getById(entityId);
    if (production?.actorId !== actorId || production.workspaceId !== workspaceId) throw new RepositoryConflictError("Production target is unavailable");
    return { fingerprint: controlFingerprint(production), kind: "PRODUCTION", version: production.version };
  }
  if (action === "ACKNOWLEDGE_INCIDENT") {
    const incident = await repositories.operationsControls.getIncident(entityId);
    if (incident?.actorId !== actorId || incident.workspaceId !== workspaceId) throw new RepositoryConflictError("Incident target is unavailable");
    return { fingerprint: incident.fingerprint, kind: "INCIDENT", version: incident.version };
  }
  const job = await repositories.operationsRuntime.getJobById(entityId);
  if (job?.actorId !== actorId || job.workspaceId !== workspaceId) throw new RepositoryConflictError("Operations job target is unavailable");
  return { fingerprint: controlFingerprint(job), kind: "JOB", version: job.version };
}

async function applyAction(repositories: OperationsControlTransaction, proposal: ControlActionProposal, now: string): Promise<{ readonly aggregateType: "INCIDENT" | "OPERATIONS_JOB" | "PRODUCTION_REVISION" | "CONTENT_PRODUCTION"; readonly entityId: string; readonly eventType: "INCIDENT_ACKNOWLEDGED" | "JOB_QUEUED" | "PRODUCTION_STATUS_CHANGED" | "REVISION_REQUESTED"; readonly summaryCode: "incident_acknowledged" | "job_queued" | "production_revision_requested" | "production_status_changed"; readonly version: number }> {
  if (isProductionAction(proposal.action)) return applyProductionAction(repositories, proposal, now);
  if (proposal.action === "ACKNOWLEDGE_INCIDENT") return applyIncidentAction(repositories, proposal, now);
  return applyJobAction(repositories, proposal, now);
}

async function applyProductionAction(repositories: OperationsControlTransaction, proposal: ControlActionProposal, now: string) {
  let control = await repositories.operationsControls.getProductionControl(proposal.target.entityId);
  if (control === undefined) {
    const production = await repositories.contentProductions.getById(proposal.target.entityId);
    if (production?.actorId !== proposal.actorId || production.workspaceId !== proposal.workspaceId || production.version !== proposal.target.entityVersion || !sameHash(controlFingerprint(production), proposal.target.entityFingerprint)) throw new RepositoryConflictError("Production changed before control initialization");
    control = deepFreeze({ actorId: proposal.actorId, contractVersion: "1", createdAt: now, history: [], productionId: production.productionId, revisions: [], sourcePackageFingerprint: canonicalSha256(production.package), sourceProductionVersion: production.version, state: "ACTIVE", updatedAt: now, version: 0, workspaceId: proposal.workspaceId });
    await repositories.operationsControls.insertProductionControl(control);
  } else if (control.actorId !== proposal.actorId || control.workspaceId !== proposal.workspaceId || control.version !== proposal.target.entityVersion || !sameHash(controlFingerprint(control), proposal.target.entityFingerprint)) throw new RepositoryConflictError("Production control changed before confirmation");
  const transition = productionTransition(proposal.action, control.state);
  const nextVersion = control.version + 1;
  const revision = proposal.action === "REQUEST_PRODUCTION_REVISION" && proposal.revision !== undefined ? deepFreeze({ category: proposal.revision.category, createdAt: now, priority: proposal.revision.priority, reason: proposal.reason, requestedBy: proposal.actorId, revisionId: `revision-${proposal.proposalId}`, sourcePackageFingerprint: control.sourcePackageFingerprint, sourceProductionVersion: control.sourceProductionVersion, status: "REQUESTED" as const, targets: proposal.revision.targets }) : undefined;
  const next: ProductionControlRecord = deepFreeze({ ...control, history: [...control.history, { action: historyAction(proposal.action), actorId: proposal.actorId, occurredAt: now, reasonCode: proposal.reason.code, state: transition, version: nextVersion }], ...(revision === undefined ? {} : { revisions: [...control.revisions, revision] }), state: transition, updatedAt: now, version: nextVersion });
  await repositories.operationsControls.updateProductionControl(next, { version: control.version });
  const openPublications = await repositories.operationalPlanes.listOpenPublicationsByProductionId(next.productionId, 101);
  if (openPublications.length > 100) throw new RepositoryConflictError("Production control cannot safely invalidate every open publication plan");
  for (const publication of openPublications) {
    await repositories.operationalPlanes.updatePublication(deepFreeze({ ...publication, status: "CANCELLED" as const, updatedAt: now, version: publication.version + 1 }), { version: publication.version });
  }
  return proposal.action === "REQUEST_PRODUCTION_REVISION" ? { aggregateType: "PRODUCTION_REVISION" as const, entityId: next.productionId, eventType: "REVISION_REQUESTED" as const, summaryCode: "production_revision_requested" as const, version: next.version } : { aggregateType: "CONTENT_PRODUCTION" as const, entityId: next.productionId, eventType: "PRODUCTION_STATUS_CHANGED" as const, summaryCode: "production_status_changed" as const, version: next.version };
}

async function applyJobAction(repositories: OperationsControlTransaction, proposal: ControlActionProposal, now: string) {
  const job = await repositories.operationsRuntime.getJobById(proposal.target.entityId);
  const requiredStatus = proposal.action === "RETRY_FAILED_JOB" ? "FAILED" : "DEAD_LETTER";
  if (job?.actorId !== proposal.actorId || job.workspaceId !== proposal.workspaceId || job.status !== requiredStatus || job.version !== proposal.target.entityVersion || !sameHash(controlFingerprint(job), proposal.target.entityFingerprint)) throw new RepositoryConflictError("Operations job is not eligible for a successor");
  const existingSuccessor = await repositories.operationsRuntime.getSuccessorByPredecessor(proposal.workspaceId, job.jobId);
  if (existingSuccessor !== undefined) throw new RepositoryConflictError("Operations job already has a manual successor");
  const successor = successorJob(job, proposal, now);
  await repositories.operationsRuntime.insertJob(successor);
  return { aggregateType: "OPERATIONS_JOB" as const, entityId: successor.jobId, eventType: "JOB_QUEUED" as const, summaryCode: "job_queued" as const, version: successor.version };
}

async function applyIncidentAction(repositories: OperationsControlTransaction, proposal: ControlActionProposal, now: string) {
  const incident = await repositories.operationsControls.getIncident(proposal.target.entityId);
  if (incident?.actorId !== proposal.actorId || incident.workspaceId !== proposal.workspaceId || incident.status !== "OPEN" || incident.version !== proposal.target.entityVersion || !sameHash(incident.fingerprint, proposal.target.entityFingerprint)) throw new RepositoryConflictError("Incident is not eligible for acknowledgement");
  const base = { ...incident, acknowledgedAt: now, acknowledgedBy: proposal.actorId, status: "ACKNOWLEDGED" as const, updatedAt: now, version: incident.version + 1 };
  const fingerprintInput: Record<string, unknown> = { ...base };
  delete fingerprintInput.fingerprint;
  const next: OperationsIncidentRecord = deepFreeze({ ...base, fingerprint: controlFingerprint(fingerprintInput) });
  await repositories.operationsControls.updateIncident(next, { version: incident.version });
  return { aggregateType: "INCIDENT" as const, entityId: next.incidentId, eventType: "INCIDENT_ACKNOWLEDGED" as const, summaryCode: "incident_acknowledged" as const, version: next.version };
}

function successorJob(job: OperationsJob, proposal: ControlActionProposal, now: string): OperationsJob {
  return deepFreeze({
    actorId: job.actorId,
    attempt: 0,
    budget: job.budget,
    contractVersion: job.contractVersion,
    createdAt: now,
    heartbeatIntervalMs: job.heartbeatIntervalMs,
    jobId: `successor-${proposal.proposalId}`,
    jobType: job.jobType,
    leaseDurationMs: job.leaseDurationMs,
    operationIdentity: `successor-${proposal.proposalId}`,
    owner: job.owner,
    payload: job.payload,
    payloadFingerprint: job.payloadFingerprint,
    predecessorJobId: job.jobId,
    priority: job.priority,
    recoveryStrategy: job.recoveryStrategy,
    retryPolicy: job.retryPolicy,
    runAfter: now,
    ...(job.scheduleId === undefined ? {} : { scheduleId: job.scheduleId }),
    scheduledFor: now,
    status: "QUEUED",
    timeoutMs: job.timeoutMs,
    updatedAt: now,
    version: 0,
    workspaceId: job.workspaceId,
  });
}

function productionTransition(action: ControlActionProposal["action"], state: ProductionExecutionState): ProductionExecutionState {
  if (action === "REQUEST_PRODUCTION_REVISION" && (state === "ACTIVE" || state === "PAUSED")) return "REVISION_REQUIRED";
  if (action === "PAUSE_PRODUCTION" && state === "ACTIVE") return "PAUSED";
  if (action === "RESUME_PRODUCTION" && state === "PAUSED") return "ACTIVE";
  if (action === "CANCEL_PRODUCTION" && (state === "ACTIVE" || state === "PAUSED")) return "CANCELLED";
  throw new RepositoryConflictError("Production control transition is not allowed");
}

function historyAction(action: ControlActionProposal["action"]): "CANCEL" | "PAUSE" | "REQUEST_REVISION" | "RESUME" { if (action === "REQUEST_PRODUCTION_REVISION") return "REQUEST_REVISION"; if (action === "PAUSE_PRODUCTION") return "PAUSE"; if (action === "RESUME_PRODUCTION") return "RESUME"; return "CANCEL"; }
function isProductionAction(action: ControlActionProposal["action"]): boolean { return ["REQUEST_PRODUCTION_REVISION", "PAUSE_PRODUCTION", "RESUME_PRODUCTION", "CANCEL_PRODUCTION"].includes(action); }
function sameProposalInput(proposal: ControlActionProposal, input: ProposeControlActionInput): boolean { return proposal.action === input.action && proposal.actorId === input.actorId && proposal.workspaceId === input.workspaceId && proposal.target.entityId === input.entityId && proposal.target.entityVersion === input.entityVersion && proposal.target.entityFingerprint === input.fingerprint && JSON.stringify(proposal.reason) === JSON.stringify(input.reason) && JSON.stringify(proposal.revision) === JSON.stringify(input.revision); }
function receiptMatchesProposal(receipt: ControlActionReceipt, proposal: ControlActionProposal): boolean { return receipt.action === proposal.action && receipt.actorId === proposal.actorId && receipt.idempotencyKey === proposal.idempotencyKey && receipt.proposalId === proposal.proposalId && receipt.workspaceId === proposal.workspaceId && JSON.stringify(receipt.target) === JSON.stringify(proposal.target); }
function audit(proposal: ControlActionProposal, eventType: string, occurredAt: string, outcome: "failure" | "success", receiptId?: string) { return deepFreeze({ action: proposal.action, actorId: proposal.actorId, contractVersion: "1" as const, correlationId: proposal.proposalId, eventId: `audit-${eventType}-${proposal.proposalId}-v${String(proposal.version)}`, eventType, metadata: { idempotencyKey: proposal.idempotencyKey, proposalId: proposal.proposalId, proposalVersion: proposal.version, ...(receiptId === undefined ? {} : { receiptId }) }, occurredAt, outcome, schemaVersion: "1" as const, subject: { entityId: proposal.target.entityId, entityVersion: proposal.target.entityVersion, kind: proposal.target.kind }, workspaceId: proposal.workspaceId }); }
function checked<T>(value: unknown, validator: { validate(value: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryConflictError(`${label} failed validation`, { issueCount: result.issues.length }); return result.value; }
function operatorBody(value: unknown, label: string): Readonly<Record<string, unknown>> { if (typeof value !== "object" || value === null || Array.isArray(value) || "actorId" in value || "workspaceId" in value) throw new RepositoryConflictError(`${label} must not contain identity fields`); return value as Readonly<Record<string, unknown>>; }
function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function sameHash(expected: string, received: string): boolean { if (!/^[a-f0-9]{64}$/u.test(expected) || !/^[a-f0-9]{64}$/u.test(received)) return false; const left = Buffer.from(expected, "hex"); const right = Buffer.from(received, "hex"); return left.length === right.length && timingSafeEqual(left, right); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
