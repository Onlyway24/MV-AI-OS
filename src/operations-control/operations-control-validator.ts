import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import {
  OPERATIONS_CONTROL_ACTIONS,
  type ConfirmControlActionInput,
  type ControlActionProposal,
  type ControlActionReceipt,
  type OperationsIncidentRecord,
  type ProductionControlRecord,
  type ProposeControlActionInput,
} from "./operations-control.js";

// Keep the control plane interoperable with the canonical runtime/domain ID
// contract. Case and ':' are valid identity characters elsewhere and must not
// create dashboard targets that the durable action boundary cannot address.
const ID = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[a-f0-9]{64}$/u;
const UNSAFE = /(?:\bsk-[A-Za-z0-9_-]{8,}|bearer\s+|password|secret|token\s*[:=]|raw\s+(?:prompt|completion|payload)|stack\s+trace|https?:\/\/)/iu;
const STATES = new Set(["ACTIVE", "CANCELLED", "PAUSED", "REVISION_REQUIRED"]);
const REVISION_CATEGORIES = new Set(["ASSET", "CAPTION", "CLAIM", "EVIDENCE", "SLIDE"]);
const PRIORITIES = new Set(["HIGH", "LOW", "MEDIUM"]);

export class ProposeControlActionInputValidator implements Validator<ProposeControlActionInput> {
  public validate(value: unknown): ValidationResult<ProposeControlActionInput> {
    if (!record(value)) return invalid("Control action proposal input is invalid");
    const expected = ["action", "actorId", "contractVersion", "entityId", "entityVersion", "fingerprint", "idempotencyKey", "reason", "workspaceId", ...(value.revision === undefined ? [] : ["revision"])];
    if (!keys(value, expected) || value.contractVersion !== "1" || !OPERATIONS_CONTROL_ACTIONS.includes(value.action as never) || !id(value.actorId) || !id(value.workspaceId) || !id(value.entityId) || !integer(value.entityVersion, 0, 1_000_000) || !hash(value.fingerprint) || !id(value.idempotencyKey) || !reason(value.reason) || !revisionForAction(value.action, value.revision)) return invalid("Control action proposal input is invalid");
    return success(value as unknown as ProposeControlActionInput);
  }
}

export class ConfirmControlActionInputValidator implements Validator<ConfirmControlActionInput> {
  public validate(value: unknown): ValidationResult<ConfirmControlActionInput> {
    if (!record(value) || !keys(value, ["actorId", "confirmationToken", "contractVersion", "entityFingerprint", "proposalId", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.proposalId) || typeof value.confirmationToken !== "string" || !TOKEN.test(value.confirmationToken) || !hash(value.entityFingerprint)) return invalid("Control action confirmation input is invalid");
    return success(value as unknown as ConfirmControlActionInput);
  }
}

export class ControlActionProposalValidator implements Validator<ControlActionProposal> {
  public validate(value: unknown): ValidationResult<ControlActionProposal> {
    if (!record(value)) return invalid("Control action proposal is invalid");
    const expected = ["action", "actorId", "confirmationTokenHash", "contractVersion", "createdAt", "expiresAt", "idempotencyKey", "proposalId", "reason", "state", "target", "updatedAt", "version", "workspaceId", ...(value.revision === undefined ? [] : ["revision"])];
    if (!keys(value, expected) || value.contractVersion !== "1" || !OPERATIONS_CONTROL_ACTIONS.includes(value.action as never) || !id(value.actorId) || !id(value.workspaceId) || !id(value.proposalId) || !id(value.idempotencyKey) || !hash(value.confirmationTokenHash) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !timestamp(value.expiresAt) || !integer(value.version, 0, 1_000_000) || !["CONSUMED", "EXPIRED", "PENDING"].includes(String(value.state)) || !reason(value.reason) || !target(value.target) || !revisionForAction(value.action, value.revision) || !proposalTimeline(value)) return invalid("Control action proposal is invalid");
    return success(value as unknown as ControlActionProposal);
  }
}

export class ControlActionReceiptValidator implements Validator<ControlActionReceipt> {
  public validate(value: unknown): ValidationResult<ControlActionReceipt> {
    if (!record(value) || !keys(value, ["action", "actorId", "contractVersion", "idempotencyKey", "outcomeFingerprint", "proposalId", "receiptId", "recordedAt", "resultEntityId", "resultEntityVersion", "target", "workspaceId"]) || value.contractVersion !== "1" || !OPERATIONS_CONTROL_ACTIONS.includes(value.action as never) || !id(value.actorId) || !id(value.workspaceId) || !id(value.idempotencyKey) || !id(value.proposalId) || !id(value.receiptId) || !id(value.resultEntityId) || !integer(value.resultEntityVersion, 0, 1_000_000) || !hash(value.outcomeFingerprint) || !timestamp(value.recordedAt) || !target(value.target)) return invalid("Control action receipt is invalid");
    const receipt = value as unknown as ControlActionReceipt;
    if (receipt.outcomeFingerprint !== controlFingerprint(receiptFingerprintInput(receipt))) return invalid("Control action receipt fingerprint is invalid");
    return success(receipt);
  }
}

export class ProductionControlRecordValidator implements Validator<ProductionControlRecord> {
  public validate(value: unknown): ValidationResult<ProductionControlRecord> {
    if (!record(value) || !keys(value, ["actorId", "contractVersion", "createdAt", "history", "productionId", "revisions", "sourcePackageFingerprint", "sourceProductionVersion", "state", "updatedAt", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.productionId) || !hash(value.sourcePackageFingerprint) || !integer(value.sourceProductionVersion, 0, 1_000_000) || !STATES.has(String(value.state)) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) < Date.parse(value.createdAt) || !integer(value.version, 0, 1_000_000) || !history(value.history) || !revisions(value.revisions)) return invalid("Production control record is invalid");
    return success(value as unknown as ProductionControlRecord);
  }
}

export class OperationsIncidentRecordValidator implements Validator<OperationsIncidentRecord> {
  public validate(value: unknown): ValidationResult<OperationsIncidentRecord> {
    if (!record(value)) return invalid("Operations incident record is invalid");
    const expected = ["actorId", "contractVersion", "createdAt", "fingerprint", "incidentId", "severity", "status", "summaryCode", "updatedAt", "version", "workspaceId", ...(value.acknowledgedAt === undefined ? [] : ["acknowledgedAt"]), ...(value.acknowledgedBy === undefined ? [] : ["acknowledgedBy"])];
    const acknowledged = value.status === "ACKNOWLEDGED";
    if (!keys(value, expected) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.incidentId) || !hash(value.fingerprint) || !CODE.test(String(value.summaryCode)) || !["CRITICAL", "HIGH", "LOW", "MEDIUM"].includes(String(value.severity)) || !["ACKNOWLEDGED", "OPEN"].includes(String(value.status)) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !integer(value.version, 0, 1_000_000) || acknowledged !== (timestamp(value.acknowledgedAt) && id(value.acknowledgedBy)) || !incidentTimeline(value)) return invalid("Operations incident record is invalid");
    const incident = value as unknown as OperationsIncidentRecord;
    if (incident.fingerprint !== controlFingerprint(incidentFingerprintInput(incident))) return invalid("Operations incident fingerprint is invalid");
    return success(incident);
  }
}

export function controlFingerprint(value: unknown): string {
  return canonicalSha256(value);
}

function revisionForAction(action: unknown, value: unknown): boolean {
  if (action !== "REQUEST_PRODUCTION_REVISION") return value === undefined;
  return record(value) && keys(value, ["category", "priority", "targets"]) && REVISION_CATEGORIES.has(String(value.category)) && PRIORITIES.has(String(value.priority)) && Array.isArray(value.targets) && value.targets.length >= 1 && value.targets.length <= 12 && value.targets.every((entry) => record(entry) && keys(entry, ["kind", "reference"]) && REVISION_CATEGORIES.has(String(entry.kind)) && text(entry.reference, 1, 120));
}

function reason(value: unknown): boolean {
  return record(value) && keys(value, ["code", "detail"]) && CODE.test(String(value.code)) && text(value.detail, 4, 500);
}

function target(value: unknown): boolean {
  return record(value) && keys(value, ["entityFingerprint", "entityId", "entityVersion", "kind"]) && id(value.entityId) && hash(value.entityFingerprint) && integer(value.entityVersion, 0, 1_000_000) && ["INCIDENT", "JOB", "PRODUCTION"].includes(String(value.kind));
}

function history(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 1_000 && value.every((entry) => record(entry) && keys(entry, ["action", "actorId", "occurredAt", "reasonCode", "state", "version"]) && ["CANCEL", "PAUSE", "REQUEST_REVISION", "RESUME"].includes(String(entry.action)) && id(entry.actorId) && timestamp(entry.occurredAt) && CODE.test(String(entry.reasonCode)) && STATES.has(String(entry.state)) && integer(entry.version, 1, 1_000_000));
}

function revisions(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every((entry) => record(entry) && keys(entry, ["category", "createdAt", "priority", "reason", "requestedBy", "revisionId", "sourcePackageFingerprint", "sourceProductionVersion", "status", "targets"]) && REVISION_CATEGORIES.has(String(entry.category)) && PRIORITIES.has(String(entry.priority)) && reason(entry.reason) && id(entry.requestedBy) && id(entry.revisionId) && hash(entry.sourcePackageFingerprint) && integer(entry.sourceProductionVersion, 0, 1_000_000) && entry.status === "REQUESTED" && timestamp(entry.createdAt) && revisionForAction("REQUEST_PRODUCTION_REVISION", { category: entry.category, priority: entry.priority, targets: entry.targets }));
}

function success<T>(value: T): ValidationResult<T> { return validationSuccess(freeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function integer(value: unknown, minimum: number, maximum: number): boolean { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function timestamp(value: unknown): value is string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value; }
function text(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum && !UNSAFE.test(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }

function proposalTimeline(value: Record<string, unknown>): boolean {
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || typeof value.expiresAt !== "string") return false;
  const createdAt = Date.parse(value.createdAt);
  const updatedAt = Date.parse(value.updatedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (updatedAt < createdAt) return false;
  if (value.state === "EXPIRED") return updatedAt >= expiresAt;
  return updatedAt < expiresAt;
}

function incidentTimeline(value: Record<string, unknown>): boolean {
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || Date.parse(value.updatedAt) < Date.parse(value.createdAt)) return false;
  if (value.status === "OPEN") return value.version === 0 && value.updatedAt === value.createdAt;
  return typeof value.acknowledgedAt === "string" && value.acknowledgedAt === value.updatedAt && typeof value.version === "number" && value.version >= 1;
}

function incidentFingerprintInput(record: OperationsIncidentRecord): Readonly<Record<string, unknown>> { return { ...(record.acknowledgedAt === undefined ? {} : { acknowledgedAt: record.acknowledgedAt }), ...(record.acknowledgedBy === undefined ? {} : { acknowledgedBy: record.acknowledgedBy }), actorId: record.actorId, contractVersion: record.contractVersion, createdAt: record.createdAt, incidentId: record.incidentId, severity: record.severity, status: record.status, summaryCode: record.summaryCode, updatedAt: record.updatedAt, version: record.version, workspaceId: record.workspaceId }; }
function receiptFingerprintInput(receipt: ControlActionReceipt): Readonly<Record<string, unknown>> { return { action: receipt.action, actorId: receipt.actorId, contractVersion: receipt.contractVersion, idempotencyKey: receipt.idempotencyKey, proposalId: receipt.proposalId, receiptId: receipt.receiptId, recordedAt: receipt.recordedAt, resultEntityId: receipt.resultEntityId, resultEntityVersion: receipt.resultEntityVersion, target: receipt.target, workspaceId: receipt.workspaceId }; }
