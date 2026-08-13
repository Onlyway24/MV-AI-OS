import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";
import {
  VENTURE_RECORD_TYPES,
  VENTURE_STAGES,
  type VentureAuditEvent,
  type VentureCommand,
  type VentureCommandReceipt,
  type VentureEvent,
  type VentureKillSwitch,
  type VentureRecordMap,
  type VentureRecordType,
} from "./venture-domain.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,191}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 4_194_304;
const SECRET_KEY = /(?:^|[-_])(authorization|client[-_]?secret|password|secret|token)(?:$|[-_])/iu;
const SECRET_VALUE = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})/u;
const OPERATIONS = ["APPEND_RECORD", "CREATE_POLICY", "DECIDE", "REGISTER_OPPORTUNITY", "RUN_VENTURE_001", "SET_KILL_SWITCH", "TRANSITION_STAGE"] as const;

export class VentureCommandValidator implements Validator<VentureCommand> {
  public validate(value: unknown): ValidationResult<VentureCommand> { return result(value, command, "VentureCommand"); }
}
export class VentureCommandReceiptValidator implements Validator<VentureCommandReceipt> {
  public validate(value: unknown): ValidationResult<VentureCommandReceipt> { return result(value, commandReceipt, "VentureCommandReceipt"); }
}
export class VentureAuditEventValidator implements Validator<VentureAuditEvent> {
  public validate(value: unknown): ValidationResult<VentureAuditEvent> { return result(value, auditEvent, "VentureAuditEvent"); }
}
export class VentureEventValidator implements Validator<VentureEvent> {
  public validate(value: unknown): ValidationResult<VentureEvent> { return result(value, ventureEvent, "VentureEvent"); }
}
export class VentureKillSwitchValidator implements Validator<VentureKillSwitch> {
  public validate(value: unknown): ValidationResult<VentureKillSwitch> { return result(value, killSwitch, "VentureKillSwitch"); }
}

export function validateVentureRecord<K extends VentureRecordType>(type: K, value: unknown): ValidationResult<VentureRecordMap[K]> {
  if (!VENTURE_RECORD_TYPES.includes(type) || !ventureRecord(type, value) || !boundedJson(value)) return invalid(`${type} is invalid`);
  return validationSuccess(deepFreezeVenture(structuredClone(value)) as VentureRecordMap[K]);
}

export function ventureFingerprint(value: object): string {
  const payload: Record<string, unknown> = { ...(value as Readonly<Record<string, unknown>>) };
  delete payload.fingerprint;
  return canonicalSha256(payload);
}

export function deepFreezeVenture<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreezeVenture(child);
  return value;
}

const COMMON = ["actorId", "contractVersion", "createdAt", "fingerprint", "updatedAt", "version", "workspaceId"] as const;
const RECORD_KEYS: Readonly<Record<VentureRecordType, readonly string[]>> = Object.freeze({
  FOUNDER_VENTURE_POLICY: [...COMMON, "acceptableAutomation", "allowedMarkets", "allowedRevenueModels", "approvalRequirements", "customerModel", "economicObjective", "economicRisk", "evidenceRequirements", "forbiddenMarkets", "killConditions", "maximumCapitalMinorUnits", "maximumDaysToFirstSignal", "maximumDeliveryLoad", "maximumFabioDependency", "maximumFabioHoursPerWeek", "minimumMarginBps", "policyId", "reputationalRisk", "scaleConditions"],
  VENTURE_PORTFOLIO: [...COMMON, "capitalProposalIds", "externalActions", "founderDecisionIds", "opportunityIds", "policyRef", "portfolioId", "publication", "thesisIds", "tombstoned", "ventureIds"],
  VENTURE_OPPORTUNITY: [...COMMON, "capitalRequiredMinorUnits", "category", "competition", "customer", "customerAccess", "deliveryComplexity", "demand", "evidenceMap", "expiresAt", "founderFit", "frequency", "marginPotentialBps", "onlywaySynergy", "opportunityId", "origin", "problem", "risk", "sources", "stage", "timeToFirstSignalDays", "title", "tombstoned", "unknowns", "urgency", "willingnessToPay"],
  VENTURE_SCORECARD: [...COMMON, "blockingReasonCodes", "criteria", "opportunityId", "outcome", "scorecardId", "sensitiveToSingleAssumption"],
  VENTURE_THESIS: [...COMMON, "approval", "dependencies", "evidenceMapFingerprint", "hypothesis", "killCriteria", "opportunityId", "positioning", "risks", "scaleCriteria", "scorecardRef", "status", "synergies", "thesisId", "title", "tombstoned", "valueProposition"],
  VENTURE: [...COMMON, "approvalState", "artifactIds", "assetIds", "budget", "dependencies", "experimentIds", "externalActions", "portfolioId", "publication", "risks", "stage", "synergies", "thesisRef", "title", "tombstoned", "ventureId"],
  VENTURE_STAGE_TRANSITION: [...COMMON, "from", "reasonCode", "resultingVentureFingerprint", "to", "transitionId", "ventureId"],
  VENTURE_ECONOMICS: [...COMMON, "currency", "economicsId", "formulasVersion", "scenarios", "sensitivityMatrix", "status", "ventureId"],
  CAPITAL_ALLOCATION_PROPOSAL: [...COMMON, "amountMinorUnits", "currency", "evidenceConfidenceBps", "expectedImpact", "externalActionsExecuted", "opportunityCost", "proposalId", "reversibility", "risk", "speed", "spendAuthorized", "status", "strategicFit", "ventureId"],
  VENTURE_EXPERIMENT: [...COMMON, "assetRefs", "budgetMaximumMinorUnits", "decision", "durationDays", "evidenceRequired", "experimentId", "experimentType", "externalActionsExecuted", "externalActionsProposed", "hypothesis", "method", "metrics", "observations", "owner", "sample", "status", "stopCondition", "target", "ventureId"],
  VENTURE_ARTIFACT: [...COMMON, "allowedUse", "artifactId", "authoringAgent", "content", "evidenceRefs", "externalActionsExecuted", "kind", "mediaType", "reviewState", "tombstoned", "ventureId"],
  VENTURE_DECISION: [...COMMON, "decidedBy", "decision", "decisionId", "entityFingerprint", "entityId", "entityType", "entityVersion", "externalActionsExecuted", "reasonCode"],
  VENTURE_OPERATING_REPORT: [...COMMON, "blockerCodes", "costStatus", "evidenceFreshness", "experimentStatus", "externalEffects", "founderDecisionIds", "nextActions", "reportId", "riskCount", "stage", "ventureId"],
  FOUNDER_PORTFOLIO_BRIEF: [...COMMON, "blockerCodes", "briefId", "costStatus", "externalEffects", "experimentIds", "founderDecisionIds", "kind", "nextActions", "opportunityIds", "portfolioId", "riskCount", "ventureReportIds"],
  VENTURE_RECEIPT: [...COMMON, "commandId", "externalEffects", "idempotencyKeyFingerprint", "operation", "reasonCode", "receiptId", "requestFingerprint", "resultRefs", "status"],
});

const ENTITY_IDS: Readonly<Record<VentureRecordType, string>> = Object.freeze({
  FOUNDER_VENTURE_POLICY: "policyId", VENTURE_PORTFOLIO: "portfolioId", VENTURE_OPPORTUNITY: "opportunityId", VENTURE_SCORECARD: "scorecardId", VENTURE_THESIS: "thesisId", VENTURE: "ventureId", VENTURE_STAGE_TRANSITION: "transitionId", VENTURE_ECONOMICS: "economicsId", CAPITAL_ALLOCATION_PROPOSAL: "proposalId", VENTURE_EXPERIMENT: "experimentId", VENTURE_ARTIFACT: "artifactId", VENTURE_DECISION: "decisionId", VENTURE_OPERATING_REPORT: "reportId", FOUNDER_PORTFOLIO_BRIEF: "briefId", VENTURE_RECEIPT: "receiptId",
});

function ventureRecord(type: VentureRecordType, value: unknown): value is VentureRecordMap[VentureRecordType] {
  if (!record(value) || !shape(value, RECORD_KEYS[type], optionalKeys(type)) || !base(value) || !id(value[ENTITY_IDS[type]])) return false;
  if (type === "FOUNDER_VENTURE_POLICY") return enumStrings(value.approvalRequirements, ["FABIO_EXPLICIT", "FABIO_VERSION_BOUND"], 1, 2) && availabilityFields(value);
  if (type === "VENTURE_PORTFOLIO") return value.externalActions === "LOCKED" && value.publication === "LOCKED" && boolean(value.tombstoned) && exactRef(value.policyRef, "policyId");
  if (type === "VENTURE_OPPORTUNITY") return opportunity(value);
  if (type === "VENTURE_SCORECARD") return scorecard(value);
  if (type === "VENTURE_THESIS") return thesis(value);
  if (type === "VENTURE") return venture(value);
  if (type === "VENTURE_STAGE_TRANSITION") return transition(value);
  if (type === "VENTURE_ECONOMICS") return id(value.ventureId) && value.formulasVersion === "1" && ["CALCULATED", "NOT_AVAILABLE"].includes(String(value.status)) && Array.isArray(value.scenarios) && value.scenarios.length <= 3;
  if (type === "CAPITAL_ALLOCATION_PROPOSAL") return id(value.ventureId) && value.status === "CAPITAL_ALLOCATION_PROPOSAL" && value.spendAuthorized === false && value.externalActionsExecuted === false;
  if (type === "VENTURE_EXPERIMENT") return experiment(value);
  if (type === "VENTURE_ARTIFACT") return artifact(value);
  if (type === "VENTURE_DECISION") return decision(value);
  if (type === "VENTURE_OPERATING_REPORT") return id(value.ventureId) && member(value.stage, VENTURE_STAGES) && value.externalEffects === "ZERO" && nonNegativeInteger(value.riskCount);
  if (type === "FOUNDER_PORTFOLIO_BRIEF") return id(value.portfolioId) && ["DAILY", "MONTHLY_CAPITAL_PLACEHOLDER", "WEEKLY"].includes(String(value.kind)) && value.externalEffects === "ZERO" && nonNegativeInteger(value.riskCount);
  return ventureReceipt(value);
}

function base(value: Readonly<Record<string, unknown>>): boolean {
  return value.contractVersion === "1" && id(value.actorId) && id(value.workspaceId) && timestamp(value.createdAt) && timestamp(value.updatedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt) && version(value.version) && fingerprint(value);
}

function opportunity(value: Readonly<Record<string, unknown>>): boolean {
  if (!text(value.title, 1, 500) || !text(value.problem, 1, 10_000) || !text(value.customer, 1, 5_000) || !["FOUNDER_SUPPLIED_CANDIDATE", "RADAR"].includes(String(value.origin)) || !["DEMAND_NOT_VERIFIED", "VERIFIED"].includes(String(value.demand)) || !["DEMAND_NOT_VERIFIED", "VERIFIED"].includes(String(value.willingnessToPay)) || !["DISCOVERED", "EVIDENCE_INSUFFICIENT", "RESEARCHING"].includes(String(value.stage)) || !timestamp(value.expiresAt) || !boolean(value.tombstoned) || !Array.isArray(value.sources) || value.sources.length > 100) return false;
  if (!record(value.evidenceMap) || !hash(value.evidenceMap.fingerprint) || value.evidenceMap.fingerprint !== ventureFingerprint(value.evidenceMap) || value.evidenceMap.opportunityId !== value.opportunityId) return false;
  return value.sources.every((entry) => record(entry) && hash(entry.fingerprint) && entry.fingerprint === ventureFingerprint(entry)) && availabilityFields(value);
}

function scorecard(value: Readonly<Record<string, unknown>>): boolean {
  return id(value.opportunityId) && ["FOUNDER_REVIEW_REQUIRED", "REJECT", "RESEARCH_MORE", "THESIS_CANDIDATE"].includes(String(value.outcome)) && Array.isArray(value.criteria) && value.criteria.length >= 1 && value.criteria.length <= 100 && value.criteria.every((entry) => record(entry) && text(entry.criterion, 1, 200) && text(entry.formula, 1, 2_000) && basisPoints(entry.confidenceBps)) && boolean(value.sensitiveToSingleAssumption) && (value.totalScoreBps === undefined || basisPoints(value.totalScoreBps)) && (value.confidenceAdjustedScoreBps === undefined || basisPoints(value.confidenceAdjustedScoreBps));
}

function thesis(value: Readonly<Record<string, unknown>>): boolean {
  return id(value.opportunityId) && hash(value.evidenceMapFingerprint) && exactRef(value.scorecardRef, "scorecardId") && ["AWAITING_FABIO", "BLOCKED", "DRAFT", "REJECTED"].includes(String(value.status)) && value.approval === "NOT_APPROVED" && boolean(value.tombstoned) && availabilityFields(value);
}

function venture(value: Readonly<Record<string, unknown>>): boolean {
  const thesisValid = value.thesisRef === undefined ? ["DISCOVERED", "RESEARCHING", "EVIDENCE_INSUFFICIENT", "AWAITING_FABIO"].includes(String(value.stage)) : exactRef(value.thesisRef, "thesisId");
  return id(value.portfolioId) && thesisValid && member(value.stage, VENTURE_STAGES) && value.stage !== "ACTIVE" && ["AWAITING_FABIO", "NOT_APPROVED", "REJECTED"].includes(String(value.approvalState)) && value.externalActions === "LOCKED" && value.publication === "LOCKED" && boolean(value.tombstoned);
}

function transition(value: Readonly<Record<string, unknown>>): boolean {
  const gatedStage = ["ACTIVE", "KILLED", "VALIDATION_READY"].includes(String(value.to));
  return id(value.ventureId) && member(value.from, VENTURE_STAGES) && member(value.to, VENTURE_STAGES) && value.from !== value.to && !gatedStage && text(value.reasonCode, 1, 200) && hash(value.resultingVentureFingerprint) && (value.decisionRef === undefined || id(value.decisionRef));
}

function experiment(value: Readonly<Record<string, unknown>>): boolean {
  if (!id(value.ventureId) || value.externalActionsExecuted !== false || !Array.isArray(value.metrics) || value.metrics.length < 1 || value.metrics.length > 50 || !Array.isArray(value.observations) || value.observations.length > 1_000 || !record(value.decision)) return false;
  if (!value.observations.every((entry) => record(entry) && shape(entry, ["evidenceRefs", "kind", "metricId", "observationId", "observedAt", "value"]) && id(entry.observationId) && id(entry.metricId) && ["REAL", "SIMULATED"].includes(String(entry.kind)) && timestamp(entry.observedAt) && text(entry.value, 1, 2_000) && Array.isArray(entry.evidenceRefs) && entry.evidenceRefs.every(id))) return false;
  if (!shape(value.decision, ["decisionId", "observationRefs", "outcome", "reasonCodes"]) || !id(value.decision.decisionId) || !["AWAITING_REAL_OBSERVATION", "SIGNAL_NEGATIVE", "SIGNAL_POSITIVE", "STOPPED"].includes(String(value.decision.outcome)) || !Array.isArray(value.decision.reasonCodes) || !value.decision.reasonCodes.every((entry) => text(entry, 1, 200)) || !Array.isArray(value.decision.observationRefs) || !value.decision.observationRefs.every(id)) return false;
  const referenced = new Set(value.decision.observationRefs);
  const realReferences = value.observations.filter((entry) => record(entry) && entry.kind === "REAL" && typeof entry.observationId === "string" && referenced.has(entry.observationId));
  if (["SIGNAL_NEGATIVE", "SIGNAL_POSITIVE"].includes(String(value.decision.outcome)) && (referenced.size === 0 || realReferences.length !== referenced.size)) return false;
  return value.decision.outcome !== "AWAITING_REAL_OBSERVATION" || referenced.size === 0;
}

function artifact(value: Readonly<Record<string, unknown>>): boolean {
  return id(value.ventureId) && typeof value.content === "string" && Buffer.byteLength(value.content, "utf8") <= 2_000_000 && ["application/json", "text/csv", "text/html", "text/markdown"].includes(String(value.mediaType)) && ["INTERNAL_PACKAGE_ONLY", "PROPOSAL_ONLY"].includes(String(value.allowedUse)) && value.externalActionsExecuted === false && boolean(value.tombstoned);
}

function decision(value: Readonly<Record<string, unknown>>): boolean {
  return id(value.entityId) && ["VENTURE", "VENTURE_EXPERIMENT", "VENTURE_THESIS"].includes(String(value.entityType)) && version(value.entityVersion) && hash(value.entityFingerprint) && value.decidedBy === value.actorId && id(value.decidedBy) && text(value.reasonCode, 1, 200) && value.externalActionsExecuted === false;
}

function ventureReceipt(value: Readonly<Record<string, unknown>>): boolean {
  return id(value.commandId) && hash(value.idempotencyKeyFingerprint) && hash(value.requestFingerprint) && operation(value.operation) && ["COMMITTED", "REJECTED", "REPLAYED"].includes(String(value.status)) && refs(value.resultRefs) && text(value.reasonCode, 1, 200) && value.externalEffects === "ZERO";
}

function command(value: unknown): value is VentureCommand {
  if (!record(value) || !shape(value, ["actorId", "commandId", "contractVersion", "expectedVersion", "idempotencyKey", "input", "operation", "requestFingerprint", "targetFingerprint", "targetId", "targetType", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.commandId) || !id(value.idempotencyKey) || !id(value.workspaceId) || !operation(value.operation) || !id(value.targetId) || !(value.targetType === "VENTURE_CONTROL" || member(value.targetType, VENTURE_RECORD_TYPES)) || !(value.expectedVersion === "NOT_EXISTS" || version(value.expectedVersion)) || !(value.targetFingerprint === "NOT_AVAILABLE" || hash(value.targetFingerprint)) || !record(value.input) || !hash(value.requestFingerprint)) return false;
  const payload = { ...value }; delete payload.requestFingerprint;
  return value.requestFingerprint === canonicalSha256(payload) && ((value.operation === "SET_KILL_SWITCH") === (value.targetType === "VENTURE_CONTROL"));
}

function commandReceipt(value: unknown): value is VentureCommandReceipt {
  return record(value) && shape(value, ["actorId", "commandId", "contractVersion", "fingerprint", "idempotencyKeyFingerprint", "recordedAt", "requestFingerprint", "responseFingerprint", "resultRefs", "status", "workspaceId"]) && value.contractVersion === "1" && id(value.actorId) && id(value.commandId) && id(value.workspaceId) && hash(value.idempotencyKeyFingerprint) && timestamp(value.recordedAt) && hash(value.requestFingerprint) && hash(value.responseFingerprint) && refs(value.resultRefs) && ["COMMITTED", "REJECTED"].includes(String(value.status)) && fingerprint(value);
}

function auditEvent(value: unknown): value is VentureAuditEvent {
  return record(value) && shape(value, ["actorId", "commandId", "contractVersion", "eventId", "fingerprint", "occurredAt", "operation", "outcome", "reasonCode", "targetId", "targetType", "workspaceId"]) && value.contractVersion === "1" && id(value.actorId) && id(value.workspaceId) && id(value.eventId) && id(value.commandId) && timestamp(value.occurredAt) && operation(value.operation) && id(value.targetId) && (value.targetType === "VENTURE_CONTROL" || member(value.targetType, VENTURE_RECORD_TYPES)) && ["COMMITTED", "REJECTED"].includes(String(value.outcome)) && text(value.reasonCode, 1, 200) && fingerprint(value);
}

function ventureEvent(value: unknown): value is VentureEvent {
  if (!record(value) || !shape(value, ["actorId", "aggregateType", "contractVersion", "entityId", "entityVersion", "eventId", "eventType", "fingerprint", "occurredAt", "safeSummaryCode", "workspaceId"]) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !id(value.eventId) || !timestamp(value.occurredAt) || !(value.aggregateType === "VENTURE_CONTROL" || member(value.aggregateType, VENTURE_RECORD_TYPES)) || !id(value.entityId) || !version(value.entityVersion) || !fingerprint(value)) return false;
  if (value.eventType === "KILL_SWITCH_CHANGED") return value.aggregateType === "VENTURE_CONTROL" && value.safeSummaryCode === "venture_kill_switch_changed";
  if (value.eventType === "STAGE_CHANGED") return value.aggregateType === "VENTURE_STAGE_TRANSITION" && value.safeSummaryCode === "venture_stage_changed";
  return value.eventType === "RECORD_APPENDED" && value.aggregateType !== "VENTURE_CONTROL" && value.safeSummaryCode === "venture_record_appended";
}

function killSwitch(value: unknown): value is VentureKillSwitch {
  return record(value) && shape(value, ["actorId", "contractVersion", "enabled", "fingerprint", "updatedAt", "updatedBy", "version", "workspaceId"]) && value.contractVersion === "1" && id(value.actorId) && id(value.workspaceId) && boolean(value.enabled) && timestamp(value.updatedAt) && value.updatedBy === value.actorId && id(value.updatedBy) && version(value.version) && fingerprint(value);
}

function optionalKeys(type: VentureRecordType): readonly string[] { return type === "VENTURE_SCORECARD" ? ["confidenceAdjustedScoreBps", "totalScoreBps"] : type === "VENTURE_STAGE_TRANSITION" ? ["decisionRef"] : type === "VENTURE" ? ["thesisRef"] : []; }
function availabilityFields(value: Readonly<Record<string, unknown>>): boolean { return Object.values(value).every((entry) => !record(entry) || entry.status === undefined || availability(entry)); }
function availability(value: Readonly<Record<string, unknown>>): boolean { if (value.status === "AVAILABLE") return shape(value, ["evidenceRefs", "status", "value"]) && Array.isArray(value.evidenceRefs) && value.evidenceRefs.every(id); return (value.status === "FOUNDER_INPUT_REQUIRED" || value.status === "NOT_AVAILABLE") && shape(value, ["reasonCode", "status"]) && value.reasonCode === value.status; }
function exactRef(value: unknown, key: string): boolean { return record(value) && shape(value, ["fingerprint", key, "version"]) && id(value[key]) && version(value.version) && hash(value.fingerprint); }
function refs(value: unknown): boolean { return Array.isArray(value) && value.length <= 100 && value.every((entry) => record(entry) && shape(entry, ["entityId", "fingerprint", "recordType", "version"]) && id(entry.entityId) && hash(entry.fingerprint) && member(entry.recordType, VENTURE_RECORD_TYPES) && version(entry.version)); }
function fingerprint(value: Readonly<Record<string, unknown>>): boolean { return hash(value.fingerprint) && value.fingerprint === ventureFingerprint(value); }
function operation(value: unknown): boolean { return member(value, OPERATIONS); }
function record(value: unknown): value is Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const prototype: unknown = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function shape(value: Readonly<Record<string, unknown>>, keys: readonly string[], optional: readonly string[] = []): boolean { const required = keys.filter((key) => !optional.includes(key)); const allowed = new Set([...keys, ...optional]); return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key)) && Object.values(value).every((entry) => entry !== undefined); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value; }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000; }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function basisPoints(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000; }
function boolean(value: unknown): value is boolean { return typeof value === "boolean"; }
function text(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.length >= minimum && value.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value); }
function enumStrings(value: unknown, allowed: readonly string[], minimum: number, maximum: number): boolean { return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((entry) => typeof entry === "string" && allowed.includes(entry)) && new Set(value).size === value.length; }
function member<T extends string>(value: unknown, values: readonly T[]): value is T { return typeof value === "string" && values.includes(value as T); }
function jsonSafe(value: unknown, depth = 0): boolean { if (depth > 64) return false; if (value === null || typeof value === "string" || typeof value === "boolean") return true; if (typeof value === "number") return Number.isFinite(value) && Number.isSafeInteger(value); if (Array.isArray(value)) return value.length <= 10_000 && value.every((entry) => jsonSafe(entry, depth + 1)); return record(value) && Object.keys(value).length <= 1_000 && Object.values(value).every((entry) => entry !== undefined && jsonSafe(entry, depth + 1)); }
function redactionSafe(value: unknown, key = "", depth = 0): boolean {
  if (depth > 64 || SECRET_KEY.test(key)) return false;
  if (typeof value === "string") return !SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.every((entry) => redactionSafe(entry, "", depth + 1));
  if (!record(value)) return true;
  return Object.entries(value).every(([childKey, child]) => redactionSafe(child, childKey, depth + 1));
}
function boundedJson(value: unknown): boolean { if (!jsonSafe(value) || !redactionSafe(value)) return false; try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_JSON_BYTES; } catch { return false; } }
function result<T>(value: unknown, predicate: (candidate: unknown) => candidate is T, label: string): ValidationResult<T> { return predicate(value) && boundedJson(value) ? validationSuccess(deepFreezeVenture(structuredClone(value)) as T) : invalid(`${label} is invalid`); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid", message, path: "$" }]); }
