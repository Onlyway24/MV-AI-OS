import {
  OPERATIONAL_EVENT_AGGREGATE_TYPES,
  OPERATIONAL_EVENT_SEMANTICS,
  OPERATIONAL_EVENT_SUMMARY_CODES,
  OPERATIONAL_EVENT_TYPES,
  type OperationalEvent,
  type OperationalEventDraft,
} from "./operational-event.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

const ID = /^[a-zA-Z0-9][a-zA-Z0-9@._:-]{0,127}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class OperationalEventDraftValidator implements Validator<OperationalEventDraft> {
  public validate(value: unknown): ValidationResult<OperationalEventDraft> {
    return validateEvent(value, false);
  }
}

export class OperationalEventValidator implements Validator<OperationalEvent> {
  public validate(value: unknown): ValidationResult<OperationalEvent> {
    return validateEvent(value, true);
  }
}

function validateEvent<T extends OperationalEventDraft>(
  value: unknown,
  withSequence: boolean,
): ValidationResult<T> {
  if (!record(value)) return invalid("Operational event must be an object");
  const expected = [
    "aggregateType",
    "contractVersion",
    "entityId",
    "entityVersion",
    "eventId",
    "eventType",
    "occurredAt",
    "safeSummaryCode",
    "workspaceId",
    ...(withSequence ? ["sequence"] : []),
  ];
  if (
    !onlyKeys(value, expected) ||
    value.contractVersion !== "1" ||
    !identifier(value.eventId) ||
    !identifier(value.workspaceId) ||
    !identifier(value.entityId) ||
    !timestamp(value.occurredAt) ||
    !version(value.entityVersion) ||
    !member(value.eventType, OPERATIONAL_EVENT_TYPES) ||
    !member(value.aggregateType, OPERATIONAL_EVENT_AGGREGATE_TYPES) ||
    !member(value.safeSummaryCode, OPERATIONAL_EVENT_SUMMARY_CODES) ||
    (withSequence && !sequence(value.sequence))
  ) return invalid("Operational event is invalid");

  const semantics = OPERATIONAL_EVENT_SEMANTICS[value.eventType];
  if (
    semantics.aggregateType !== value.aggregateType ||
    semantics.safeSummaryCode !== value.safeSummaryCode
  ) return invalid("Operational event semantics are inconsistent");

  return validationSuccess(freeze(structuredClone(value as unknown as T)));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function identifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000; }
function sequence(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1; }
function member<T extends string>(value: unknown, allowed: readonly T[]): value is T { return typeof value === "string" && allowed.includes(value as T); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
