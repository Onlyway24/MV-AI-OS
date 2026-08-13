import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import {
  type VentureAuditEvent,
  type VentureCommand,
  type VentureCommandReceipt,
  type VentureEvent,
  type VentureRecordMap,
  type VentureRecordType,
  type VentureReceipt,
  ventureRecordEntityId,
} from "./venture-domain.js";
import type { VentureHoldingTransactionRunner } from "./venture-repository.js";
import {
  VentureAuditEventValidator,
  VentureCommandReceiptValidator,
  VentureCommandValidator,
  VentureEventValidator,
  VentureKillSwitchValidator,
  deepFreezeVenture,
  validateVentureRecord,
  ventureFingerprint,
} from "./venture-validator.js";

export interface VentureCommandRecord<K extends VentureRecordType = VentureRecordType> {
  readonly type: K;
  readonly record: VentureRecordMap[K];
  readonly expectedPreviousVersion?: number;
}

export interface VentureCommandResult {
  readonly receipt: VentureCommandReceipt;
  readonly replayed: boolean;
  readonly externalEffects: "ZERO";
}

export class VentureCommandBoundary {
  readonly #commandValidator = new VentureCommandValidator();

  public constructor(private readonly dependencies: { readonly actorId: string; readonly clock: Clock; readonly repositories: VentureHoldingTransactionRunner; readonly workspaceId: string }) {}

  public execute(commandCandidate: unknown, records: readonly VentureCommandRecord[]): Promise<VentureCommandResult> {
    const command = checked(commandCandidate, this.#commandValidator, "Venture command");
    this.#assertIdentity(command);
    if (records.length < 1 || records.length > 100) throw new RepositoryValidationError("Venture command record batch is invalid");
    const validated = records.map((entry) => this.#validateEntry(entry));
    this.#assertRequestFingerprint(command, validated);
    return this.dependencies.repositories.transaction(async (repository) => {
      const identity = { actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId };
      const [existingByKey, existingById] = await Promise.all([
        repository.getCommandReceipt(identity, command.idempotencyKey),
        repository.getCommandReceiptByCommandId(identity, command.commandId),
      ]);
      const existing = existingByKey ?? existingById;
      if (existing !== undefined) {
        if (existing.commandId !== command.commandId || existing.requestFingerprint !== command.requestFingerprint || existingByKey?.fingerprint !== existingById?.fingerprint && existingByKey !== undefined && existingById !== undefined) throw new RepositoryConflictError("Venture command replay conflicts with prior durable input");
        return deepFreezeVenture({ receipt: existing, replayed: true, externalEffects: "ZERO" as const });
      }
      const killSwitch = await repository.getKillSwitch(identity);
      if (killSwitch?.enabled === true && command.operation !== "SET_KILL_SWITCH") throw new RepositoryConflictError("Venture kill switch blocks new mutations");
      await this.#assertTarget(repository, command, validated[0]);
      const resultRefs: VentureReceipt["resultRefs"][number][] = [];
      for (const entry of validated) {
        await repository.appendRecord(entry.type, ventureRecordEntityId(entry.type, entry.record), entry.record, entry.expectedPreviousVersion);
        resultRefs.push(Object.freeze({ entityId: ventureRecordEntityId(entry.type, entry.record), fingerprint: entry.record.fingerprint, recordType: entry.type, version: entry.record.version }));
      }
      const recordedAt = this.dependencies.clock.now().toISOString();
      const ventureReceiptBase = {
        actorId: command.actorId,
        commandId: command.commandId,
        contractVersion: "1" as const,
        createdAt: recordedAt,
        externalEffects: "ZERO" as const,
        idempotencyKeyFingerprint: canonicalSha256(command.idempotencyKey),
        operation: command.operation,
        reasonCode: "VENTURE_COMMAND_COMMITTED",
        receiptId: `${command.commandId}:venture-receipt`,
        requestFingerprint: command.requestFingerprint,
        resultRefs: Object.freeze([...resultRefs]),
        status: "COMMITTED" as const,
        updatedAt: recordedAt,
        version: 0,
        workspaceId: command.workspaceId,
      };
      const ventureReceipt = checked(
        { ...ventureReceiptBase, fingerprint: ventureFingerprint(ventureReceiptBase) },
        { validate: (candidate: unknown) => validateVentureRecord("VENTURE_RECEIPT", candidate) },
        "Venture receipt record",
      );
      await repository.appendRecord("VENTURE_RECEIPT", ventureReceipt.receiptId, ventureReceipt);
      resultRefs.push(Object.freeze({ entityId: ventureReceipt.receiptId, fingerprint: ventureReceipt.fingerprint, recordType: "VENTURE_RECEIPT", version: ventureReceipt.version }));
      const receiptBase = {
        actorId: command.actorId,
        commandId: command.commandId,
        contractVersion: "1" as const,
        idempotencyKeyFingerprint: canonicalSha256(command.idempotencyKey),
        recordedAt,
        requestFingerprint: command.requestFingerprint,
        responseFingerprint: canonicalSha256(resultRefs),
        resultRefs: Object.freeze(resultRefs),
        status: "COMMITTED" as const,
        workspaceId: command.workspaceId,
      };
      const receipt = checked({ ...receiptBase, fingerprint: ventureFingerprint(receiptBase) }, new VentureCommandReceiptValidator(), "Venture command receipt");
      const audit = this.#audit(command, recordedAt);
      const event = this.#event(command, validated[0], recordedAt);
      await repository.insertCommandReceipt(receipt);
      await repository.appendAudit(audit);
      await repository.appendEvent(event);
      return deepFreezeVenture({ receipt, replayed: false, externalEffects: "ZERO" as const });
    });
  }

  public setKillSwitch(commandCandidate: unknown, enabled: boolean): Promise<VentureCommandResult> {
    const command = checked(commandCandidate, this.#commandValidator, "Venture command");
    this.#assertIdentity(command);
    if (command.operation !== "SET_KILL_SWITCH" || command.targetType !== "VENTURE_CONTROL" || command.targetId !== "venture-kill-switch" || typeof enabled !== "boolean") throw new RepositoryValidationError("Venture kill-switch command is invalid");
    const expectedRequest = ventureCommandFingerprint(command);
    if (command.requestFingerprint !== expectedRequest || command.input.enabled !== enabled) throw new RepositoryValidationError("Venture kill-switch request fingerprint is invalid");
    return this.dependencies.repositories.transaction(async (repository) => {
      const identity = { actorId: command.actorId, workspaceId: command.workspaceId };
      const [existingByKey, existingById, current] = await Promise.all([
        repository.getCommandReceipt(identity, command.idempotencyKey), repository.getCommandReceiptByCommandId(identity, command.commandId), repository.getKillSwitch(identity),
      ]);
      const existing = existingByKey ?? existingById;
      if (existing !== undefined) {
        if (existing.commandId !== command.commandId || existing.requestFingerprint !== command.requestFingerprint) throw new RepositoryConflictError("Venture kill-switch replay conflicts with prior durable input");
        return deepFreezeVenture({ receipt: existing, replayed: true, externalEffects: "ZERO" as const });
      }
      const expectedVersion = command.expectedVersion;
      if (expectedVersion === "NOT_EXISTS" ? current !== undefined : current?.version !== expectedVersion || current.fingerprint !== command.targetFingerprint) throw new RepositoryConflictError("Venture kill-switch command is stale");
      const updatedAt = this.dependencies.clock.now().toISOString();
      const base = { actorId: command.actorId, contractVersion: "1" as const, enabled, updatedAt, updatedBy: command.actorId, version: current === undefined ? 0 : current.version + 1, workspaceId: command.workspaceId };
      const control = checked({ ...base, fingerprint: ventureFingerprint(base) }, new VentureKillSwitchValidator(), "Venture kill switch");
      await repository.setKillSwitch(control, expectedVersion);
      const resultRefs = Object.freeze([]) as VentureReceipt["resultRefs"];
      const receiptBase = { actorId: command.actorId, commandId: command.commandId, contractVersion: "1" as const, idempotencyKeyFingerprint: canonicalSha256(command.idempotencyKey), recordedAt: updatedAt, requestFingerprint: command.requestFingerprint, responseFingerprint: ventureFingerprint({ ...control }), resultRefs, status: "COMMITTED" as const, workspaceId: command.workspaceId };
      const receipt = checked({ ...receiptBase, fingerprint: ventureFingerprint(receiptBase) }, new VentureCommandReceiptValidator(), "Venture command receipt");
      const audit = this.#audit(command, updatedAt);
      const eventBase = { actorId: command.actorId, aggregateType: "VENTURE_CONTROL" as const, contractVersion: "1" as const, entityId: command.targetId, entityVersion: control.version, eventId: `${command.commandId}:event`, eventType: "KILL_SWITCH_CHANGED" as const, occurredAt: updatedAt, safeSummaryCode: "venture_kill_switch_changed" as const, workspaceId: command.workspaceId };
      const event = checked({ ...eventBase, fingerprint: ventureFingerprint(eventBase) }, new VentureEventValidator(), "Venture event");
      await repository.insertCommandReceipt(receipt);
      await repository.appendAudit(audit);
      await repository.appendEvent(event);
      return deepFreezeVenture({ receipt, replayed: false, externalEffects: "ZERO" as const });
    });
  }

  #validateEntry(entry: VentureCommandRecord): VentureCommandRecord {
    const result = validateVentureRecord(entry.type, entry.record);
    if (!result.ok) throw new RepositoryValidationError("Venture record is invalid", { issueCount: result.issues.length, type: entry.type });
    const record = result.value;
    if (record.workspaceId !== this.dependencies.workspaceId || record.actorId !== this.dependencies.actorId || ventureRecordEntityId(entry.type, record) !== ventureRecordEntityId(entry.type, entry.record)) throw new RepositoryValidationError("Venture record identity is invalid");
    return deepFreezeVenture({ ...entry, record });
  }

  #assertIdentity(command: VentureCommand): void { if (command.actorId !== this.dependencies.actorId || command.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Venture command identity is unavailable"); }
  #assertRequestFingerprint(command: VentureCommand, records: readonly VentureCommandRecord[]): void {
    const recordsFingerprint = canonicalSha256(records.map(({ type, record, expectedPreviousVersion }) => ({ type, record, ...(expectedPreviousVersion === undefined ? {} : { expectedPreviousVersion }) })));
    if (command.requestFingerprint !== ventureCommandFingerprint(command) || command.input.recordsFingerprint !== recordsFingerprint) throw new RepositoryValidationError("Venture command request fingerprint is invalid");
  }

  async #assertTarget(repository: Parameters<Parameters<VentureHoldingTransactionRunner["transaction"]>[0]>[0], command: VentureCommand, first: VentureCommandRecord | undefined): Promise<void> {
    if (first?.type !== command.targetType || command.targetId !== ventureRecordEntityId(first.type, first.record)) throw new RepositoryValidationError("Venture command target does not match its first record");
    const current = await repository.getRecord({ actorId: command.actorId, entityId: command.targetId, type: first.type, workspaceId: command.workspaceId });
    if (command.expectedVersion === "NOT_EXISTS") {
      if (current !== undefined || command.targetFingerprint !== "NOT_AVAILABLE" || first.record.version !== 0) throw new RepositoryConflictError("Venture create target already exists or is invalid");
      return;
    }
    if (current?.version !== command.expectedVersion || current.fingerprint !== command.targetFingerprint || first.record.version !== current.version + 1 || first.expectedPreviousVersion !== current.version) throw new RepositoryConflictError("Venture command target is stale");
  }

  #audit(command: VentureCommand, occurredAt: string): VentureAuditEvent {
    const base = { actorId: command.actorId, commandId: command.commandId, contractVersion: "1" as const, eventId: `${command.commandId}:audit`, occurredAt, operation: command.operation, outcome: "COMMITTED" as const, reasonCode: "VENTURE_COMMAND_COMMITTED", targetId: command.targetId, targetType: command.targetType, workspaceId: command.workspaceId };
    return checked({ ...base, fingerprint: ventureFingerprint(base) }, new VentureAuditEventValidator(), "Venture audit event");
  }
  #event(command: VentureCommand, entry: VentureCommandRecord | undefined, occurredAt: string): VentureEvent {
    if (entry === undefined) throw new RepositoryValidationError("Venture event has no aggregate");
    const stageChanged = entry.type === "VENTURE_STAGE_TRANSITION";
    const base = { actorId: command.actorId, aggregateType: entry.type, contractVersion: "1" as const, entityId: ventureRecordEntityId(entry.type, entry.record), entityVersion: entry.record.version, eventId: `${command.commandId}:event`, eventType: stageChanged ? "STAGE_CHANGED" as const : "RECORD_APPENDED" as const, occurredAt, safeSummaryCode: stageChanged ? "venture_stage_changed" as const : "venture_record_appended" as const, workspaceId: command.workspaceId };
    return checked({ ...base, fingerprint: ventureFingerprint(base) }, new VentureEventValidator(), "Venture event");
  }
}

export function ventureCommandFingerprint(command: Omit<VentureCommand, "requestFingerprint"> | VentureCommand): string {
  const payload = { ...command } as Readonly<Record<string, unknown>> & { readonly requestFingerprint?: string };
  const canonical: Record<string, unknown> = { ...payload };
  delete canonical.requestFingerprint;
  return canonicalSha256(canonical);
}

function checked<T>(value: unknown, validator: { validate(candidate: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} is invalid`, { issueCount: result.issues.length }); return result.value; }
