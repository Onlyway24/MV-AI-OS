import { createHash } from "node:crypto";

import { isBusinessDate } from "../contracts/business-calendar.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import type { DailyOperatingBriefRecord } from "./daily-operating-brief.js";

const ID = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const UNSAFE = /(?:\bsk-[A-Za-z0-9_-]{8,}|bearer\s+|password|secret|raw\s+(?:prompt|completion|payload)|stack\s+trace)/iu;

export class DailyOperatingBriefRecordValidator implements Validator<DailyOperatingBriefRecord> {
  public validate(value: unknown): ValidationResult<DailyOperatingBriefRecord> {
    if (!record(value) || !keys(value, ["actorId", "briefId", "businessDate", "contractVersion", "fingerprint", "generatedAt", "publication", "sections", "version", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.briefId) || !isBusinessDate(value.businessDate) || !timestamp(value.generatedAt) || value.publication !== "INTERNAL_ONLY" || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || !HASH.test(String(value.fingerprint)) || !sections(value.sections)) return invalid("Daily Operating Brief is invalid");
    const base = { ...value };
    delete base.fingerprint;
    if (dailyOperatingBriefFingerprint(base) !== value.fingerprint) return invalid("Daily Operating Brief fingerprint is invalid");
    return success(value as unknown as DailyOperatingBriefRecord);
  }
}

export function dailyOperatingBriefFingerprint(value: unknown): string { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }

function sections(value: unknown): boolean {
  if (!record(value) || !keys(value, ["approvalsRequired", "backupState", "blockedTasks", "businessMissions", "costsAndBudgets", "evidenceFreshness", "externalActionsPerformed", "incidents", "productionQueue", "recommendedFounderDecisions", "socialIntelligence", "systemHealth", "workCompleted", "workInProgress"])) return false;
  return datum(value.approvalsRequired, approvals)
    && datum(value.backupState, backup)
    && datum(value.blockedTasks, blockedTasks)
    && datum(value.businessMissions, businessMissions)
    && datum(value.costsAndBudgets, costs)
    && datum(value.evidenceFreshness, evidenceFreshness)
    && datum(value.externalActionsPerformed, externalEffects)
    && datum(value.incidents, incidents)
    && datum(value.productionQueue, productionQueue)
    && datum(value.recommendedFounderDecisions, decisions)
    && datum(value.socialIntelligence, social)
    && datum(value.systemHealth, systemHealth)
    && datum(value.workCompleted, workCompleted)
    && datum(value.workInProgress, workInProgress);
}

function datum(value: unknown, validateValue: (value: unknown) => boolean): boolean {
  if (!record(value)) return false;
  const expected = ["asOf", "kind", "provenance", "value", ...(value.limitation === undefined ? [] : ["limitation"])];
  if (!keys(value, expected) || !timestamp(value.asOf) || !["ASSUMPTION", "ESTIMATE", "MEASURED", "UNAVAILABLE"].includes(String(value.kind)) || !Array.isArray(value.provenance) || value.provenance.length < 1 || value.provenance.length > 30 || !value.provenance.every((entry) => text(entry, 1, 300)) || (value.limitation !== undefined && !text(value.limitation, 4, 600)) || !validateValue(value.value)) return false;
  if (value.kind === "UNAVAILABLE") return typeof value.limitation === "string";
  return value.kind !== "MEASURED" || value.limitation === undefined;
}

function approvals(value: unknown): boolean { return boundedArray(value, 500, (entry) => record(entry) && keys(entry, ["entityId", "entityType", "status"]) && id(entry.entityId) && text(entry.entityType, 2, 80) && text(entry.status, 2, 80)); }
function backup(value: unknown): boolean { return record(value) && keys(value, ["status", ...(value.lastVerifiedAt === undefined ? [] : ["lastVerifiedAt"])]) && ["ATTENTION_REQUIRED", "READY", "UNKNOWN"].includes(String(value.status)) && (value.lastVerifiedAt === undefined || timestamp(value.lastVerifiedAt)); }
function blockedTasks(value: unknown): boolean { return boundedArray(value, 500, (entry) => record(entry) && keys(entry, ["owner", "reasonCode", "taskId"]) && text(entry.owner, 1, 100) && text(entry.reasonCode, 2, 100) && id(entry.taskId)); }
function businessMissions(value: unknown): boolean { return boundedArray(value, 100, (entry) => record(entry) && keys(entry, ["missionId", "status"]) && id(entry.missionId) && text(entry.status, 2, 80)); }
function costs(value: unknown): boolean { return record(value) && keys(value, ["budgetCents", "estimatedCostCents", "measuredCostCents", "reconciliation"]) && (value.budgetCents === "NOT_CONFIGURED" || nonNegative(value.budgetCents)) && nonNegative(value.estimatedCostCents) && nonNegative(value.measuredCostCents) && ["NOT_REQUIRED", "PENDING"].includes(String(value.reconciliation)); }
function evidenceFreshness(value: unknown): boolean { return record(value) && keys(value, ["fresh", "stale", "total"]) && nonNegative(value.fresh) && nonNegative(value.stale) && nonNegative(value.total) && value.fresh + value.stale === value.total; }
function externalEffects(value: unknown): boolean { return record(value) && keys(value, ["deployments", "messages", "paidCalls", "publications", "purchases"]) && Object.values(value).every(nonNegative); }
function incidents(value: unknown): boolean { return boundedArray(value, 250, (entry) => record(entry) && keys(entry, ["incidentId", "severity", "status", "summaryCode"]) && id(entry.incidentId) && ["CRITICAL", "HIGH", "LOW", "MEDIUM"].includes(String(entry.severity)) && ["ACKNOWLEDGED", "OPEN"].includes(String(entry.status)) && text(entry.summaryCode, 2, 100)); }
function productionQueue(value: unknown): boolean { return record(value) && keys(value, ["active", "deadLetter", "pendingFabio"]) && nonNegative(value.active) && nonNegative(value.deadLetter) && nonNegative(value.pendingFabio); }
function decisions(value: unknown): boolean { if (!boundedArray(value, 100, (entry) => record(entry) && keys(entry, ["decisionId", "evidence", "priority", "question", "status"]) && id(entry.decisionId) && boundedArray(entry.evidence, 20, (item) => text(item, 1, 300)) && ["HIGH", "LOW", "MEDIUM"].includes(String(entry.priority)) && text(entry.question, 4, 500) && entry.status === "OPEN")) return false; return new Set(value.map((entry) => (entry as { readonly decisionId: string }).decisionId)).size === value.length; }
function social(value: unknown): boolean { return record(value) && keys(value, ["analyticsRecords", "records", "status"]) && nonNegative(value.analyticsRecords) && nonNegative(value.records) && value.analyticsRecords <= value.records && ["INSUFFICIENT_DATA", "READY"].includes(String(value.status)) && (value.status === "READY") === (value.analyticsRecords > 0); }
function systemHealth(value: unknown): boolean { if (!record(value) || !keys(value, ["killSwitch", "maintenanceMode", "scheduler", "status", "worker"]) || !["LOCKED", "TRIGGERED", "UNKNOWN"].includes(String(value.killSwitch)) || !["DISABLED", "ENABLED", "UNKNOWN"].includes(String(value.maintenanceMode)) || !["MISSING", "READY", "STALE", "UNKNOWN"].includes(String(value.scheduler)) || !["ATTENTION_REQUIRED", "READY"].includes(String(value.status)) || !["MISSING", "READY", "STALE", "UNKNOWN"].includes(String(value.worker))) return false; return value.status !== "READY" || (value.killSwitch === "LOCKED" && value.maintenanceMode === "DISABLED" && value.scheduler === "READY" && value.worker === "READY"); }
function workCompleted(value: unknown): boolean { return boundedArray(value, 500, (entry) => record(entry) && keys(entry, ["completedAt", "identity", "kind"]) && timestamp(entry.completedAt) && id(entry.identity) && text(entry.kind, 2, 80)); }
function workInProgress(value: unknown): boolean { return boundedArray(value, 500, (entry) => record(entry) && keys(entry, ["identity", "kind", "status"]) && id(entry.identity) && text(entry.kind, 2, 80) && text(entry.status, 2, 80)); }

function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function nonNegative(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000; }
function boundedArray<T = unknown>(value: unknown, maximum: number, validate: (entry: T) => boolean): value is readonly T[] { return Array.isArray(value) && value.length <= maximum && value.every((entry) => validate(entry as T)); }
function text(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum && !UNSAFE.test(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function success<T>(value: T): ValidationResult<T> { return validationSuccess(deepFreeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
