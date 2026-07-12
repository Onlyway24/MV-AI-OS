import {
  TelegramMissionDraftValidator,
  validateTelegramMissionDraftFieldValue,
  type TelegramMissionDraft,
  type TelegramMissionDraftField,
  type TelegramMissionDraftMutableField,
} from "./telegram-mission-draft.js";
import { asRecord, isJsonObject, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export const TELEGRAM_MISSION_DRAFT_OPERATION_CONTRACT_VERSION = "1" as const;

export type TelegramMissionDraftOperationKind =
  | "CANCEL_DRAFT"
  | "CONFIRM_DRAFT"
  | "EXPIRE_DRAFT"
  | "MARK_REVIEW_READY"
  | "REPLACE_ASSUMPTIONS"
  | "REPLACE_CONSTRAINTS"
  | "REPLACE_PROPOSED_EXTERNAL_ACTIONS"
  | "REPLACE_UNKNOWNS"
  | "RETURN_TO_COLLECTING"
  | "SET_CURRENT_FIELD"
  | "UPDATE_AUDIENCE"
  | "UPDATE_BUDGET"
  | "UPDATE_DEADLINE"
  | "UPDATE_DELIVERABLES"
  | "UPDATE_MISSION_TYPE"
  | "UPDATE_OBJECTIVE";

export type TelegramMissionDraftFailureReasonCode =
  | "ACTOR_MISMATCH"
  | "CONTEXT_FINGERPRINT_MISMATCH"
  | "DRAFT_ID_MISMATCH"
  | "EXPIRED_DRAFT"
  | "IDENTITY_MISMATCH"
  | "INVALID_OPERATION"
  | "INVALID_STATE_TRANSITION"
  | "SESSION_ID_MISMATCH"
  | "STALE_DRAFT_VERSION"
  | "TERMINAL_DRAFT"
  | "VALIDATION_FAILED"
  | "WORKSPACE_MISMATCH";

interface TelegramMissionDraftOperationBase {
  readonly actorId: string;
  readonly authorizedIdentityHash: string;
  readonly contractVersion: typeof TELEGRAM_MISSION_DRAFT_OPERATION_CONTRACT_VERSION;
  readonly draftId: string;
  readonly expectedVersion: number;
  readonly operationId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
}

type FieldOperation<
  Kind extends TelegramMissionDraftOperationKind,
  Field extends TelegramMissionDraftMutableField,
> = TelegramMissionDraftOperationBase & {
  readonly kind: Kind;
  readonly payload: Readonly<{ [Key in Field]-?: NonNullable<TelegramMissionDraft[Key]> }>;
};

type CurrentFieldOperation<Kind extends "RETURN_TO_COLLECTING" | "SET_CURRENT_FIELD"> =
  TelegramMissionDraftOperationBase & {
    readonly kind: Kind;
    readonly payload: Readonly<{ currentField: TelegramMissionDraftField }>;
  };

type ContextBoundOperation<Kind extends "MARK_REVIEW_READY" | "CONFIRM_DRAFT"> =
  TelegramMissionDraftOperationBase & {
    readonly kind: Kind;
    readonly payload: Readonly<{ contextFingerprint: string }>;
  };

type TerminalOperation<Kind extends "CANCEL_DRAFT" | "EXPIRE_DRAFT"> =
  TelegramMissionDraftOperationBase & { readonly kind: Kind };

export type TelegramMissionDraftOperation =
  | TerminalOperation<"CANCEL_DRAFT">
  | TerminalOperation<"EXPIRE_DRAFT">
  | ContextBoundOperation<"MARK_REVIEW_READY">
  | ContextBoundOperation<"CONFIRM_DRAFT">
  | FieldOperation<"UPDATE_OBJECTIVE", "objective">
  | FieldOperation<"UPDATE_MISSION_TYPE", "missionType">
  | FieldOperation<"UPDATE_AUDIENCE", "audience">
  | FieldOperation<"UPDATE_DELIVERABLES", "deliverables">
  | FieldOperation<"UPDATE_DEADLINE", "deadline">
  | FieldOperation<"UPDATE_BUDGET", "budget">
  | FieldOperation<"REPLACE_CONSTRAINTS", "constraints">
  | FieldOperation<"REPLACE_PROPOSED_EXTERNAL_ACTIONS", "proposedExternalActions">
  | FieldOperation<"REPLACE_ASSUMPTIONS", "assumptions">
  | FieldOperation<"REPLACE_UNKNOWNS", "unknowns">
  | CurrentFieldOperation<"SET_CURRENT_FIELD">
  | CurrentFieldOperation<"RETURN_TO_COLLECTING">;

export interface TelegramMissionDraftApplySuccess {
  readonly appliedAt: string;
  readonly contractVersion: typeof TELEGRAM_MISSION_DRAFT_OPERATION_CONTRACT_VERSION;
  readonly draft: TelegramMissionDraft;
  readonly ok: true;
  readonly operationId: string;
}

export interface TelegramMissionDraftApplyFailure {
  readonly contractVersion: typeof TELEGRAM_MISSION_DRAFT_OPERATION_CONTRACT_VERSION;
  readonly ok: false;
  readonly operationId?: string;
  readonly reasonCode: TelegramMissionDraftFailureReasonCode;
}

export type TelegramMissionDraftApplyResult =
  | TelegramMissionDraftApplyFailure
  | TelegramMissionDraftApplySuccess;

const OPERATION_KINDS = new Set<TelegramMissionDraftOperationKind>([
  "CANCEL_DRAFT", "CONFIRM_DRAFT", "EXPIRE_DRAFT", "MARK_REVIEW_READY", "REPLACE_ASSUMPTIONS", "REPLACE_CONSTRAINTS",
  "REPLACE_PROPOSED_EXTERNAL_ACTIONS", "REPLACE_UNKNOWNS", "RETURN_TO_COLLECTING",
  "SET_CURRENT_FIELD", "UPDATE_AUDIENCE", "UPDATE_BUDGET", "UPDATE_DEADLINE",
  "UPDATE_DELIVERABLES", "UPDATE_MISSION_TYPE", "UPDATE_OBJECTIVE",
]);
const DRAFT_FIELDS = new Set<TelegramMissionDraftField>([
  "ASSUMPTIONS", "AUDIENCE", "BUDGET", "CONSTRAINTS", "DEADLINE", "DELIVERABLES",
  "EXTERNAL_ACTIONS", "MISSION_TYPE", "OBJECTIVE", "UNKNOWNS",
]);
const FAILURE_CODES = new Set<TelegramMissionDraftFailureReasonCode>([
  "ACTOR_MISMATCH", "CONTEXT_FINGERPRINT_MISMATCH", "DRAFT_ID_MISMATCH", "EXPIRED_DRAFT", "IDENTITY_MISMATCH",
  "INVALID_OPERATION", "INVALID_STATE_TRANSITION", "SESSION_ID_MISMATCH",
  "STALE_DRAFT_VERSION", "TERMINAL_DRAFT", "VALIDATION_FAILED", "WORKSPACE_MISMATCH",
]);
const BASE_OPERATION_KEYS = new Set([
  "actorId", "authorizedIdentityHash", "contractVersion", "draftId", "expectedVersion",
  "kind", "operationId", "payload", "sessionId", "workspaceId",
]);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;
const IDENTITY_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export class TelegramMissionDraftOperationValidator
  implements Validator<TelegramMissionDraftOperation>
{
  public validate(value: unknown): ValidationResult<TelegramMissionDraftOperation> {
    const record = asRecord(value);
    if (record === undefined || !isJsonObject(value)) return invalid("operation must be a JSON object");

    const issues: ValidationIssue[] = [];
    rejectUnknown(record, BASE_OPERATION_KEYS, issues, "");
    if (record.contractVersion !== TELEGRAM_MISSION_DRAFT_OPERATION_CONTRACT_VERSION) {
      issue(issues, "unsupported_version", "contractVersion must be 1", "contractVersion");
    }
    for (const key of ["operationId", "draftId", "sessionId", "actorId", "workspaceId"] as const) {
      requiredIdentifier(record, key, issues);
    }
    if (typeof record.authorizedIdentityHash !== "string" || !IDENTITY_HASH_PATTERN.test(record.authorizedIdentityHash)) {
      issue(issues, "invalid_format", "authorizedIdentityHash must be a SHA-256 hex hash", "authorizedIdentityHash");
    }
    if (!Number.isSafeInteger(record.expectedVersion) || (record.expectedVersion as number) < 0) {
      issue(issues, "invalid_value", "expectedVersion must be a non-negative safe integer", "expectedVersion");
    }
    if (typeof record.kind !== "string" || !OPERATION_KINDS.has(record.kind as TelegramMissionDraftOperationKind)) {
      issue(issues, "invalid_value", "operation kind is not supported", "kind");
    } else {
      validateOperationPayload(record, record.kind as TelegramMissionDraftOperationKind, issues);
    }

    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramMissionDraftOperation)));
  }
}

export class TelegramMissionDraftApplySuccessValidator
  implements Validator<TelegramMissionDraftApplySuccess>
{
  public validate(value: unknown): ValidationResult<TelegramMissionDraftApplySuccess> {
    const record = asRecord(value);
    if (record === undefined || !isJsonObject(value)) return invalid("engine success must be a JSON object");
    const issues: ValidationIssue[] = [];
    rejectUnknown(record, new Set(["appliedAt", "contractVersion", "draft", "ok", "operationId"]), issues, "");
    if (record.contractVersion !== "1") issue(issues, "unsupported_version", "contractVersion must be 1", "contractVersion");
    if (record.ok !== true) issue(issues, "invalid_value", "ok must be true", "ok");
    requiredIdentifier(record, "operationId", issues);
    if (typeof record.appliedAt !== "string" || !isRfc3339Timestamp(record.appliedAt)) issue(issues, "invalid_timestamp", "appliedAt must be RFC 3339", "appliedAt");
    const draft = new TelegramMissionDraftValidator().validate(record.draft);
    if (!draft.ok) issue(issues, "invalid_value", "draft is invalid", "draft");
    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramMissionDraftApplySuccess)));
  }
}

export class TelegramMissionDraftApplyFailureValidator
  implements Validator<TelegramMissionDraftApplyFailure>
{
  public validate(value: unknown): ValidationResult<TelegramMissionDraftApplyFailure> {
    const record = asRecord(value);
    if (record === undefined || !isJsonObject(value)) return invalid("engine failure must be a JSON object");
    const issues: ValidationIssue[] = [];
    rejectUnknown(record, new Set(["contractVersion", "ok", "operationId", "reasonCode"]), issues, "");
    if (record.contractVersion !== "1") issue(issues, "unsupported_version", "contractVersion must be 1", "contractVersion");
    if (record.ok !== false) issue(issues, "invalid_value", "ok must be false", "ok");
    if (record.operationId !== undefined) requiredIdentifier(record, "operationId", issues);
    if (typeof record.reasonCode !== "string" || !FAILURE_CODES.has(record.reasonCode as TelegramMissionDraftFailureReasonCode)) issue(issues, "invalid_value", "reasonCode is not supported", "reasonCode");
    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramMissionDraftApplyFailure)));
  }
}

/** A deterministic in-memory transformer: it never reads clocks, storage, or transport. */
export class TelegramMissionDraftStateEngine {
  public apply(
    currentDraft: TelegramMissionDraft,
    operation: TelegramMissionDraftOperation,
    now: string,
  ): TelegramMissionDraftApplyResult {
    const validatedDraft = new TelegramMissionDraftValidator().validate(currentDraft);
    const validatedOperation = new TelegramMissionDraftOperationValidator().validate(operation);
    if (!validatedDraft.ok || !validatedOperation.ok || !isRfc3339Timestamp(now)) {
      return this.failure("VALIDATION_FAILED", safeOperationId(operation));
    }
    const draft = validatedDraft.value;
    const request = validatedOperation.value;

    const bindingFailure = bindingFailureFor(draft, request);
    if (bindingFailure !== undefined) return this.failure(bindingFailure, request.operationId);
    if (request.expectedVersion !== draft.version) return this.failure("STALE_DRAFT_VERSION", request.operationId);
    if (isTerminal(draft.status)) return this.failure("TERMINAL_DRAFT", request.operationId);
    if (request.kind !== "EXPIRE_DRAFT" && Date.parse(now) >= Date.parse(draft.expiresAt)) {
      return this.failure("EXPIRED_DRAFT", request.operationId);
    }

    if (draft.status === "REVIEW_READY") {
      if (request.kind === "CONFIRM_DRAFT") {
        if (request.payload.contextFingerprint !== draft.reviewContextFingerprint) return this.failure("CONTEXT_FINGERPRINT_MISMATCH", request.operationId);
        return this.success(confirm(draft, now), request.operationId, now);
      }
      if (request.kind === "RETURN_TO_COLLECTING") return this.success(returnToCollecting(draft, request, now), request.operationId, now);
      if (request.kind === "CANCEL_DRAFT") return this.success(cancel(draft, now), request.operationId, now);
      if (request.kind === "EXPIRE_DRAFT") return this.expire(draft, request.operationId, now);
      return this.failure("INVALID_STATE_TRANSITION", request.operationId);
    }
    if (draft.status !== "COLLECTING") return this.failure("INVALID_STATE_TRANSITION", request.operationId);
    if (request.kind === "RETURN_TO_COLLECTING") return this.failure("INVALID_STATE_TRANSITION", request.operationId);
    if (request.kind === "CANCEL_DRAFT") return this.success(cancel(draft, now), request.operationId, now);
    if (request.kind === "EXPIRE_DRAFT") return this.expire(draft, request.operationId, now);
    if (request.kind === "MARK_REVIEW_READY") return this.success(markReviewReady(draft, request.payload.contextFingerprint, now), request.operationId, now);
    if (request.kind === "CONFIRM_DRAFT") return this.failure("INVALID_STATE_TRANSITION", request.operationId);
    return this.success(applyCollectingUpdate(draft, request, now), request.operationId, now);
  }

  private expire(draft: TelegramMissionDraft, operationId: string, now: string): TelegramMissionDraftApplyResult {
    if (Date.parse(now) < Date.parse(draft.expiresAt)) return this.failure("INVALID_STATE_TRANSITION", operationId);
    return this.success(expire(draft, now), operationId, now);
  }

  private success(draft: TelegramMissionDraft, operationId: string, now: string): TelegramMissionDraftApplyResult {
    const result = new TelegramMissionDraftApplySuccessValidator().validate({ appliedAt: now, contractVersion: "1", draft, ok: true, operationId });
    return result.ok ? result.value : this.failure("VALIDATION_FAILED", operationId);
  }

  private failure(reasonCode: TelegramMissionDraftFailureReasonCode, operationId?: string): TelegramMissionDraftApplyFailure {
    const raw = operationId === undefined ? { contractVersion: "1" as const, ok: false as const, reasonCode } : { contractVersion: "1" as const, ok: false as const, operationId, reasonCode };
    const result = new TelegramMissionDraftApplyFailureValidator().validate(raw);
    if (!result.ok) throw new Error("internal engine failure contract is invalid");
    return result.value;
  }
}

function validateOperationPayload(record: Readonly<Record<string, unknown>>, kind: TelegramMissionDraftOperationKind, issues: ValidationIssue[]): void {
  if (kind === "CANCEL_DRAFT" || kind === "EXPIRE_DRAFT") {
    if (record.payload !== undefined) issue(issues, "unexpected_payload", "operation does not accept payload", "payload");
    return;
  }
  const payload = asRecord(record.payload);
  if (payload === undefined || !isJsonObject(record.payload)) {
    issue(issues, "required", "operation requires a JSON payload", "payload");
    return;
  }
  if (kind === "MARK_REVIEW_READY" || kind === "CONFIRM_DRAFT") {
    rejectUnknown(payload, new Set(["contextFingerprint"]), issues, "payload");
    if (typeof payload.contextFingerprint !== "string" || !IDENTITY_HASH_PATTERN.test(payload.contextFingerprint)) issue(issues, "invalid_format", "contextFingerprint must be a SHA-256 hex hash", "payload.contextFingerprint");
    return;
  }
  const field = fieldForKind(kind);
  rejectUnknown(payload, new Set([field]), issues, "payload");
  if (!(field in payload)) {
    issue(issues, "required", "operation payload is incomplete", `payload.${field}`);
    return;
  }
  if (field === "currentField") {
    if (typeof payload.currentField !== "string" || !DRAFT_FIELDS.has(payload.currentField as TelegramMissionDraftField)) {
      issue(issues, "invalid_value", "currentField is not supported", "payload.currentField");
    }
    return;
  }
  const fieldValidation = validateTelegramMissionDraftFieldValue(field, payload[field]);
  if (!fieldValidation.ok) for (const entry of fieldValidation.issues) issue(issues, entry.code, entry.message, `payload.${entry.path}`);
}

function fieldForKind(kind: Exclude<TelegramMissionDraftOperationKind, "CANCEL_DRAFT" | "CONFIRM_DRAFT" | "EXPIRE_DRAFT" | "MARK_REVIEW_READY">): TelegramMissionDraftMutableField | "currentField" {
  switch (kind) {
    case "UPDATE_OBJECTIVE": return "objective";
    case "UPDATE_MISSION_TYPE": return "missionType";
    case "UPDATE_AUDIENCE": return "audience";
    case "UPDATE_DELIVERABLES": return "deliverables";
    case "UPDATE_DEADLINE": return "deadline";
    case "UPDATE_BUDGET": return "budget";
    case "REPLACE_CONSTRAINTS": return "constraints";
    case "REPLACE_PROPOSED_EXTERNAL_ACTIONS": return "proposedExternalActions";
    case "REPLACE_ASSUMPTIONS": return "assumptions";
    case "REPLACE_UNKNOWNS": return "unknowns";
    case "SET_CURRENT_FIELD":
    case "RETURN_TO_COLLECTING": return "currentField";
  }
}

function applyCollectingUpdate(draft: TelegramMissionDraft, operation: Exclude<TelegramMissionDraftOperation, TerminalOperation<"CANCEL_DRAFT"> | TerminalOperation<"EXPIRE_DRAFT"> | ContextBoundOperation<"MARK_REVIEW_READY"> | ContextBoundOperation<"CONFIRM_DRAFT"> | CurrentFieldOperation<"RETURN_TO_COLLECTING">>, now: string): TelegramMissionDraft {
  const base = { ...draft, updatedAt: now, version: draft.version + 1 };
  switch (operation.kind) {
    case "UPDATE_OBJECTIVE": return { ...base, objective: operation.payload.objective };
    case "UPDATE_MISSION_TYPE": return { ...base, missionType: operation.payload.missionType };
    case "UPDATE_AUDIENCE": return { ...base, audience: operation.payload.audience };
    case "UPDATE_DELIVERABLES": return { ...base, deliverables: operation.payload.deliverables };
    case "UPDATE_DEADLINE": return { ...base, deadline: operation.payload.deadline };
    case "UPDATE_BUDGET": return { ...base, budget: operation.payload.budget };
    case "REPLACE_CONSTRAINTS": return { ...base, constraints: operation.payload.constraints };
    case "REPLACE_PROPOSED_EXTERNAL_ACTIONS": return { ...base, proposedExternalActions: operation.payload.proposedExternalActions };
    case "REPLACE_ASSUMPTIONS": return { ...base, assumptions: operation.payload.assumptions };
    case "REPLACE_UNKNOWNS": return { ...base, unknowns: operation.payload.unknowns };
    case "SET_CURRENT_FIELD": return { ...base, currentField: operation.payload.currentField };
  }
}

function returnToCollecting(draft: TelegramMissionDraft, operation: CurrentFieldOperation<"RETURN_TO_COLLECTING">, now: string): TelegramMissionDraft {
  const base = withoutTerminalMetadata(draft);
  return { ...base, currentField: operation.payload.currentField, status: "COLLECTING", updatedAt: now, version: draft.version + 1 };
}

function markReviewReady(draft: TelegramMissionDraft, contextFingerprint: string, now: string): TelegramMissionDraft {
  return { ...draft, reviewContextFingerprint: contextFingerprint, status: "REVIEW_READY", updatedAt: now, version: draft.version + 1 };
}

function confirm(draft: TelegramMissionDraft, now: string): TelegramMissionDraft {
  return { ...draft, confirmedAt: now, status: "CONFIRMED", updatedAt: now, version: draft.version + 1 };
}

function cancel(draft: TelegramMissionDraft, now: string): TelegramMissionDraft {
  const base = withoutTerminalMetadata(draft);
  return { ...base, status: "CANCELLED", terminalReasonCode: "cancelled_by_operator", updatedAt: now, version: draft.version + 1 };
}

function expire(draft: TelegramMissionDraft, now: string): TelegramMissionDraft {
  const base = withoutTerminalMetadata(draft);
  return { ...base, expiresAt: now, status: "EXPIRED", terminalReasonCode: "expired", updatedAt: now, version: draft.version + 1 };
}

function withoutTerminalMetadata(draft: TelegramMissionDraft): TelegramMissionDraft {
  return Object.fromEntries(
    Object.entries(draft).filter(([key]) => key !== "confirmedAt" && key !== "terminalReasonCode" && key !== "reviewContextFingerprint"),
  ) as TelegramMissionDraft;
}

function bindingFailureFor(draft: TelegramMissionDraft, operation: TelegramMissionDraftOperation): TelegramMissionDraftFailureReasonCode | undefined {
  if (operation.draftId !== draft.draftId) return "DRAFT_ID_MISMATCH";
  if (operation.sessionId !== draft.sessionId) return "SESSION_ID_MISMATCH";
  if (operation.actorId !== draft.actorId) return "ACTOR_MISMATCH";
  if (operation.workspaceId !== draft.workspaceId) return "WORKSPACE_MISMATCH";
  if (operation.authorizedIdentityHash !== draft.authorizedIdentityHash) return "IDENTITY_MISMATCH";
  return undefined;
}

function isTerminal(status: TelegramMissionDraft["status"]): boolean {
  return status === "CANCELLED" || status === "CONFIRMED" || status === "EXPIRED";
}

function requiredIdentifier(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[]): void {
  if (typeof record[key] !== "string" || !IDENTIFIER_PATTERN.test(record[key])) issue(issues, record[key] === undefined ? "required" : "invalid_format", `${key} must be a normalized identifier`, key);
}

function rejectUnknown(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) issue(issues, "unknown_field", "unknown fields are not allowed", prefix.length === 0 ? key : `${prefix}.${key}`);
}

function safeOperationId(value: unknown): string | undefined {
  const record = asRecord(value);
  return record !== undefined && typeof record.operationId === "string" && IDENTIFIER_PATTERN.test(record.operationId) ? record.operationId : undefined;
}

function issue(issues: ValidationIssue[], code: string, message: string, path: string): void {
  issues.push({ code, message, path });
}

function invalid<T>(message: string): ValidationResult<T> {
  return validationFailure([{ code: "invalid_type", message, path: "$" }]);
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) freeze(entry);
  return value;
}
