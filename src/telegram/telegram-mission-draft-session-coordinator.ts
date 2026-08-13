import { createHash } from "node:crypto";

import type { TelegramOperatorSessionRecord } from "./telegram-operator-session.js";
import type { TelegramMissionDraft } from "./telegram-mission-draft.js";
import type { TelegramMissionDraftApplyResult, TelegramMissionDraftOperation } from "./telegram-mission-draft-state-engine.js";
import type { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";

export interface TelegramMissionDraftSessionSnapshot {
  readonly contractVersion: "1";
  readonly session: TelegramOperatorSessionRecord;
  readonly draft: TelegramMissionDraft;
  readonly requestedField: TelegramMissionDraft["currentField"];
}

export interface TelegramMissionDraftSessionCommand {
  readonly actorId: string;
  readonly authorizedIdentityHash: string;
  readonly contractVersion: "1";
  readonly coordinationKind: "APPLY_FIELD" | "AUTHORIZE_PLANNING" | "CANCEL" | "CONFIRM" | "EXPIRE" | "MARK_REVIEW_READY" | "MOVE_BACK" | "OPEN_REVIEW";
  readonly expectedDraftVersion: number;
  readonly expectedSessionVersion: number;
  readonly operation: TelegramMissionDraftOperation;
  readonly sessionId: string;
  readonly workspaceId: string;
}

export interface TelegramMissionDraftCallback {
  readonly contractVersion: "1";
  readonly expiresAt: string;
  readonly token: string;
}

/** Local-only coordination facade. It never routes Telegram updates or invokes Mission planning. */
export class TelegramMissionDraftSessionCoordinator {
  public constructor(private readonly store: TelegramSqliteStateStore) {}

  public start(identityBinding: string, candidate: TelegramMissionDraft): TelegramMissionDraftSessionSnapshot {
    return this.store.startMissionDraftSession(identityBinding, candidate, false);
  }

  public restart(identityBinding: string, candidate: TelegramMissionDraft, discardConfirmed: true): TelegramMissionDraftSessionSnapshot {
    return this.store.startMissionDraftSession(identityBinding, candidate, discardConfirmed);
  }

  public resume(identityBinding: string): TelegramMissionDraftSessionSnapshot { return this.store.readMissionDraftSession(identityBinding); }
  public read(identityBinding: string): TelegramMissionDraftSessionSnapshot { return this.store.readMissionDraftSession(identityBinding); }
  public apply(command: TelegramMissionDraftSessionCommand): TelegramMissionDraftApplyResult { return this.store.applyMissionDraftSessionCommand(command); }

  public moveBackward(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string): TelegramMissionDraftApplyResult {
    const fields: readonly TelegramMissionDraft["currentField"][] = ["OBJECTIVE", "OBJECTIVE_DETAILS", "MISSION_TYPE", "AUDIENCE", "DELIVERABLES", "DEADLINE", "BUDGET", "CONSTRAINTS", "EXTERNAL_ACTIONS", "ASSUMPTIONS", "UNKNOWNS", "KNOWN_FACTS", "PROFILE_SELECTION", "SUCCESS_METRICS"];
    const index = fields.indexOf(snapshot.draft.currentField);
    const currentField = fields[Math.max(0, index - 1)] ?? "OBJECTIVE";
    const kind = snapshot.draft.status === "REVIEW_READY" ? "RETURN_TO_COLLECTING" : "SET_CURRENT_FIELD";
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind, payload: { currentField } }, "MOVE_BACK"));
  }

  public openReview(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "SET_CURRENT_FIELD", payload: { currentField: snapshot.draft.currentField } }, "OPEN_REVIEW"));
  }

  public markReviewReady(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string, contextFingerprint: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "MARK_REVIEW_READY", payload: { contextFingerprint } }, "MARK_REVIEW_READY"));
  }

  public confirm(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string, contextFingerprint: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "CONFIRM_DRAFT", payload: { contextFingerprint } }, "CONFIRM"));
  }

  public authorizePlanning(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string, contextFingerprint: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "AUTHORIZE_PLANNING", payload: { contextFingerprint } }, "AUTHORIZE_PLANNING"));
  }

  public cancel(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "CANCEL_DRAFT" }, "CANCEL"));
  }

  public expire(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string): TelegramMissionDraftApplyResult {
    return this.apply(commandFor(snapshot, { ...operationBase(snapshot, operationId), kind: "EXPIRE_DRAFT" }, "EXPIRE"));
  }

  public issueCallback(command: TelegramMissionDraftSessionCommand, expiresAt: string): TelegramMissionDraftCallback {
    return this.store.issueMissionDraftCallback(command, expiresAt);
  }

  public applyCallback(token: string, identityBinding: string): TelegramMissionDraftApplyResult {
    return this.store.applyMissionDraftCallback(token, identityBinding);
  }
}

function operationBase(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string) {
  return { actorId: snapshot.session.actorId, authorizedIdentityHash: snapshot.session.identityBinding, contractVersion: "1" as const, draftId: snapshot.draft.draftId, expectedVersion: snapshot.draft.version, operationId, sessionId: snapshot.session.sessionId, workspaceId: snapshot.session.workspaceId };
}
function commandFor(snapshot: TelegramMissionDraftSessionSnapshot, operation: TelegramMissionDraftOperation, coordinationKind: TelegramMissionDraftSessionCommand["coordinationKind"]): TelegramMissionDraftSessionCommand { return { actorId: snapshot.session.actorId, authorizedIdentityHash: snapshot.session.identityBinding, contractVersion: "1", coordinationKind, expectedDraftVersion: snapshot.draft.version, expectedSessionVersion: snapshot.session.version, operation, sessionId: snapshot.session.sessionId, workspaceId: snapshot.session.workspaceId }; }
export function telegramMissionCommandFingerprint(value: TelegramMissionDraftSessionCommand): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
