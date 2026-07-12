import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

export type TelegramSessionState = "CANCELLED" | "COLLECTING_INPUT" | "COMPLETED" | "EXPIRED" | "IDLE" | "RESULT_REVIEW" | "REVIEWING_DRAFT" | "WAITING_CONFIRMATION" | "WAITING_WORKFLOW_CONFIRMATION" | "WORKFLOW_SELECTED";
export type TelegramSessionAction = "CANCEL" | "COLLECT" | "COMPLETE" | "CONFIRM" | "EXPIRE" | "REVIEW" | "SELECT_WORKFLOW" | "STOP";
export interface TelegramOperatorSessionRecord {
  readonly contractVersion: "1";
  readonly sessionId: string;
  readonly identityBinding: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly state: TelegramSessionState;
  readonly navigationState: TelegramSessionState;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly selectedAction?: TelegramSessionAction;
  readonly workflowInstanceId?: string;
  readonly expectedWorkflowVersion?: number;
}
export interface TelegramSessionTransition { readonly contractVersion: "1"; readonly sessionId: string; readonly expectedVersion: number; readonly action: TelegramSessionAction; readonly nextState: TelegramSessionState; readonly expiresAt: string; readonly workflowInstanceId?: string; readonly expectedWorkflowVersion?: number; }

const STATES = new Set<TelegramSessionState>(["CANCELLED", "COLLECTING_INPUT", "COMPLETED", "EXPIRED", "IDLE", "RESULT_REVIEW", "REVIEWING_DRAFT", "WAITING_CONFIRMATION", "WAITING_WORKFLOW_CONFIRMATION", "WORKFLOW_SELECTED"]);
const ACTIONS = new Set<TelegramSessionAction>(["CANCEL", "COLLECT", "COMPLETE", "CONFIRM", "EXPIRE", "REVIEW", "SELECT_WORKFLOW", "STOP"]);
const TRANSITIONS: Readonly<Record<TelegramSessionState, readonly TelegramSessionState[]>> = Object.freeze({ CANCELLED: ["IDLE"], COLLECTING_INPUT: ["REVIEWING_DRAFT", "CANCELLED", "EXPIRED"], COMPLETED: ["IDLE"], EXPIRED: ["IDLE"], IDLE: ["COLLECTING_INPUT", "WAITING_CONFIRMATION", "WORKFLOW_SELECTED", "CANCELLED"], RESULT_REVIEW: ["WAITING_CONFIRMATION", "CANCELLED", "EXPIRED"], REVIEWING_DRAFT: ["WAITING_CONFIRMATION", "COLLECTING_INPUT", "CANCELLED", "EXPIRED"], WAITING_CONFIRMATION: ["COMPLETED", "CANCELLED", "EXPIRED", "IDLE"], WAITING_WORKFLOW_CONFIRMATION: ["WORKFLOW_SELECTED", "CANCELLED", "EXPIRED"], WORKFLOW_SELECTED: ["WAITING_WORKFLOW_CONFIRMATION", "RESULT_REVIEW", "CANCELLED", "EXPIRED"] });

export class TelegramOperatorSessionValidator implements Validator<TelegramOperatorSessionRecord> {
  public validate(value: unknown): ValidationResult<TelegramOperatorSessionRecord> {
    if (!record(value) || !keys(value, ["actorId", "contractVersion", "createdAt", "expectedWorkflowVersion", "expiresAt", "identityBinding", "navigationState", "selectedAction", "sessionId", "state", "updatedAt", "version", "workflowInstanceId", "workspaceId"]) || value.contractVersion !== "1" || !id(value.sessionId) || !hash(value.identityBinding) || !id(value.actorId) || !id(value.workspaceId) || !STATES.has(value.state as TelegramSessionState) || !STATES.has(value.navigationState as TelegramSessionState) || !integer(value.version, 0) || !timestamp(value.expiresAt) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || (value.selectedAction !== undefined && !ACTIONS.has(value.selectedAction as TelegramSessionAction)) || (value.workflowInstanceId !== undefined && !id(value.workflowInstanceId)) || (value.expectedWorkflowVersion !== undefined && !integer(value.expectedWorkflowVersion, 0))) return invalid("Telegram operator session is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramOperatorSessionRecord)));
  }
}
export class TelegramSessionTransitionValidator implements Validator<TelegramSessionTransition> {
  public validate(value: unknown): ValidationResult<TelegramSessionTransition> {
    if (!record(value) || !keys(value, ["action", "contractVersion", "expectedVersion", "expiresAt", "expectedWorkflowVersion", "nextState", "sessionId", "workflowInstanceId"]) || value.contractVersion !== "1" || !id(value.sessionId) || !integer(value.expectedVersion, 0) || !ACTIONS.has(value.action as TelegramSessionAction) || !STATES.has(value.nextState as TelegramSessionState) || !timestamp(value.expiresAt) || (value.workflowInstanceId !== undefined && !id(value.workflowInstanceId)) || (value.expectedWorkflowVersion !== undefined && !integer(value.expectedWorkflowVersion, 0))) return invalid("Telegram session transition is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as TelegramSessionTransition)));
  }
}
export function isTelegramSessionTransitionAllowed(from: TelegramSessionState, to: TelegramSessionState): boolean { return TRANSITIONS[from].includes(to); }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9@._:-]{1,128}$/u.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function integer(value: unknown, minimum: number): boolean { return Number.isSafeInteger(value) && (value as number) >= minimum; }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
