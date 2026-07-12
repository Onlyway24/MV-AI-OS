import {
  FOUNDER_MISSION_TYPES,
  type FounderMissionType,
  type MissionAssumption,
  type MissionAudience,
  type MissionApprovalPolicy,
  type MissionBudget,
  type MissionConstraint,
  type MissionDeadline,
  type MissionDeliverable,
  type MissionExternalActionRequest,
  type MissionKnownFact,
  type MissionObjective,
  type MissionSuccessMetric,
  type MissionUnknown,
} from "../missions/founder-mission-brief.js";
import { asRecord, isJsonObject, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export const TELEGRAM_MISSION_DRAFT_CONTRACT_VERSION = "1" as const;

export type TelegramMissionDraftStatus =
  | "CANCELLED"
  | "COLLECTING"
  | "CONFIRMED"
  | "EXPIRED"
  | "REVIEW_READY";

export type TelegramMissionDraftField =
  | "ASSUMPTIONS"
  | "AUDIENCE"
  | "BUDGET"
  | "CONSTRAINTS"
  | "DEADLINE"
  | "DELIVERABLES"
  | "EXTERNAL_ACTIONS"
  | "MISSION_TYPE"
  | "OBJECTIVE"
  | "OBJECTIVE_DETAILS"
  | "PROFILE_SELECTION"
  | "SUCCESS_METRICS"
  | "UNKNOWNS";

export type TelegramMissionDraftTerminalReasonCode =
  | "cancelled_by_operator"
  | "expired";

export type TelegramMissionDraftMutableField =
  | "assumptions"
  | "audience"
  | "budget"
  | "constraints"
  | "deadline"
  | "deliverables"
  | "missionType"
  | "objective"
  | "objectiveDetails"
  | "missionApprovalPolicy"
  | "profileSelection"
  | "proposedExternalActions"
  | "successMetrics"
  | "knownFacts"
  | "unknowns";

/**
 * Storage- and transport-neutral progressive Mission data. It intentionally holds
 * no Telegram update, message, identity-profile, repository, or execution data.
 */
export interface TelegramMissionDraft {
  readonly actorId: string;
  readonly assumptions: readonly MissionAssumption[];
  readonly authorizedIdentityHash: string;
  readonly constraints: readonly MissionConstraint[];
  readonly contractVersion: typeof TELEGRAM_MISSION_DRAFT_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly currentField: TelegramMissionDraftField;
  readonly draftId: string;
  readonly expiresAt: string;
  readonly proposedExternalActions: readonly MissionExternalActionRequest[];
  readonly sessionId: string;
  readonly status: TelegramMissionDraftStatus;
  readonly unknowns: readonly MissionUnknown[];
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
  readonly audience?: MissionAudience;
  readonly budget?: MissionBudget;
  readonly confirmedAt?: string;
  readonly deadline?: MissionDeadline;
  readonly deliverables?: readonly MissionDeliverable[];
  readonly missionType?: FounderMissionType;
  readonly objective?: string;
  /** Structured objective is collected explicitly; the text objective remains the operator-facing summary. */
  readonly objectiveDetails?: MissionObjective;
  readonly missionApprovalPolicy?: MissionApprovalPolicy;
  readonly profileSelection?: TelegramMissionProfileSelection;
  readonly successMetrics?: readonly MissionSuccessMetric[];
  readonly knownFacts?: readonly MissionKnownFact[];
  readonly reviewContextFingerprint?: string;
  readonly terminalReasonCode?: TelegramMissionDraftTerminalReasonCode;
}

/** Exact profile identities chosen by the operator. This contains no Telegram identity data. */
export interface TelegramMissionProfileSelection {
  readonly brandProfileId: string;
  readonly brandProfileVersion: string;
  readonly founderProfileId: string;
  readonly founderProfileVersion: string;
  readonly missionTypeProfileId?: string;
  readonly missionTypeProfileVersion?: string;
}

const TOP_LEVEL_KEYS = new Set([
  "actorId",
  "assumptions",
  "audience",
  "authorizedIdentityHash",
  "budget",
  "confirmedAt",
  "constraints",
  "contractVersion",
  "createdAt",
  "currentField",
  "deadline",
  "deliverables",
  "draftId",
  "expiresAt",
  "missionType",
  "objective",
  "objectiveDetails",
  "missionApprovalPolicy",
  "profileSelection",
  "successMetrics",
  "knownFacts",
  "reviewContextFingerprint",
  "proposedExternalActions",
  "sessionId",
  "status",
  "terminalReasonCode",
  "unknowns",
  "updatedAt",
  "version",
  "workspaceId",
]);

const STATUSES = new Set<TelegramMissionDraftStatus>([
  "CANCELLED",
  "COLLECTING",
  "CONFIRMED",
  "EXPIRED",
  "REVIEW_READY",
]);
const FIELDS = new Set<TelegramMissionDraftField>([
  "ASSUMPTIONS",
  "AUDIENCE",
  "BUDGET",
  "CONSTRAINTS",
  "DEADLINE",
  "DELIVERABLES",
  "EXTERNAL_ACTIONS",
  "MISSION_TYPE",
  "OBJECTIVE",
  "OBJECTIVE_DETAILS",
  "PROFILE_SELECTION",
  "SUCCESS_METRICS",
  "UNKNOWNS",
]);
const FORBIDDEN_TELEGRAM_KEYS = new Set([
  "apiResponse",
  "botToken",
  "callbackData",
  "chatHistory",
  "contact",
  "firstName",
  "forwardedFrom",
  "languageCode",
  "lastName",
  "location",
  "media",
  "message",
  "messageText",
  "name",
  "phone",
  "rawUpdate",
  "transcript",
  "transportError",
  "update",
  "username",
]);
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;
const IDENTITY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SENSITIVE_CONTENT_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\b(?:api|access)[_-]?key\b/iu,
  /\bbearer\s+[A-Za-z0-9._-]+/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\b(?:raw\s+)?(?:completion|provider payload|prompt|transcript)\b/iu,
  /\bsecret\s*(?:ref(?:erence)?|value)?\b/iu,
  /(?:\/Users\/|\/home\/)[^\s]+/u,
];

export class TelegramMissionDraftValidator
  implements Validator<TelegramMissionDraft>
{
  public validate(value: unknown): ValidationResult<TelegramMissionDraft> {
    const record = asRecord(value);
    if (record === undefined || !isJsonObject(value)) {
      return failure("invalid_type", "telegram mission draft must be a JSON object", "$");
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, TOP_LEVEL_KEYS, issues, "");
    rejectForbiddenTelegramKeys(record, issues);
    rejectSensitiveContent(record, issues);
    validateScalarBoundary(record, issues);
    validateOptionalMissionFields(record, issues);
    validateMissionLists(record, issues);
    validateStatusConsistency(record, issues);

    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(cloneAndFreeze(value) as TelegramMissionDraft);
  }
}

/**
 * Reuses the draft contract's exact field rules for a single structured update.
 * It is intentionally storage- and transport-neutral so the pure state engine can
 * validate operation payloads without constructing a synthetic complete draft.
 */
export function validateTelegramMissionDraftFieldValue(
  fieldName: TelegramMissionDraftMutableField,
  value: unknown,
): ValidationResult<unknown> {
  if (!isJsonObject({ value })) {
    return failure("invalid_type", "draft field value must be JSON-safe", fieldName);
  }

  const issues: ValidationIssue[] = [];
  rejectForbiddenTelegramKeys(value, issues, fieldName);
  rejectSensitiveContent(value, issues, fieldName);
  const record: Readonly<Record<string, unknown>> = { [fieldName]: value };

  switch (fieldName) {
    case "objective":
      requiredText(record, fieldName, issues);
      break;
    case "objectiveDetails":
      optionalObject(record, fieldName, ["businessValues", "desiredOutcome", "purpose", "statement"], issues, validateObjective);
      break;
    case "missionApprovalPolicy":
      optionalObject(record, fieldName, ["approvalRequiredFor", "fabioIsFinalAuthority"], issues, validateApprovalPolicy);
      break;
    case "profileSelection":
      optionalObject(record, fieldName, ["brandProfileId", "brandProfileVersion", "founderProfileId", "founderProfileVersion", "missionTypeProfileId", "missionTypeProfileVersion"], issues, validateProfileSelection);
      break;
    case "successMetrics":
      requiredArray(record, fieldName, 16, "metricId", issues, validateSuccessMetric);
      break;
    case "knownFacts":
      requiredArray(record, fieldName, 32, "factId", issues, validateKnownFact);
      break;
    case "missionType":
      if (
        typeof value !== "string" ||
        !FOUNDER_MISSION_TYPES.includes(value as FounderMissionType)
      ) {
        issue(issues, "invalid_value", "missionType is not supported", fieldName);
      }
      break;
    case "audience":
      optionalObject(record, fieldName, ["description", "market", "segments"], issues, validateAudience);
      break;
    case "deliverables":
      optionalArray(record, fieldName, 8, "deliverableId", issues, validateDeliverable, false);
      break;
    case "deadline":
      optionalObject(record, fieldName, ["dueAt", "status", "timezone"], issues, validateDeadline);
      break;
    case "budget":
      optionalObject(record, fieldName, ["currency", "maximumAmount", "status"], issues, validateBudget);
      break;
    case "constraints":
      requiredArray(record, fieldName, 16, "constraintId", issues, validateConstraint);
      break;
    case "proposedExternalActions":
      requiredArray(record, fieldName, 8, "actionId", issues, validateExternalAction);
      break;
    case "assumptions":
      requiredArray(record, fieldName, 16, "assumptionId", issues, validateAssumption);
      break;
    case "unknowns":
      requiredArray(record, fieldName, 16, "unknownId", issues, validateUnknown);
      break;
  }

  if (issues.length > 0) return validationFailure(issues);
  return validationSuccess(cloneAndFreeze(value));
}

function validateScalarBoundary(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (record.contractVersion !== TELEGRAM_MISSION_DRAFT_CONTRACT_VERSION) {
    issue(issues, "unsupported_version", "contractVersion must be 1", "contractVersion");
  }
  for (const key of ["draftId", "sessionId", "actorId", "workspaceId"] as const) {
    requiredIdentifier(record, key, issues);
  }
  if (
    typeof record.authorizedIdentityHash !== "string" ||
    !IDENTITY_HASH_PATTERN.test(record.authorizedIdentityHash)
  ) {
    issue(issues, "invalid_format", "authorizedIdentityHash must be a SHA-256 hex hash", "authorizedIdentityHash");
  }
  requiredEnum(record, "status", STATUSES, issues);
  requiredEnum(record, "currentField", FIELDS, issues);
  if (!Number.isSafeInteger(record.version) || (record.version as number) < 0) {
    issue(issues, "invalid_value", "version must be a non-negative safe integer", "version");
  }
  for (const key of ["createdAt", "updatedAt", "expiresAt"] as const) {
    requiredTimestamp(record, key, issues);
  }
  if (
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    Date.parse(record.updatedAt) < Date.parse(record.createdAt)
  ) {
    issue(issues, "invalid_value", "updatedAt must not precede createdAt", "updatedAt");
  }
  if (
    typeof record.updatedAt === "string" &&
    typeof record.expiresAt === "string" &&
    Date.parse(record.expiresAt) < Date.parse(record.updatedAt)
  ) {
    issue(issues, "invalid_value", "expiresAt must not precede updatedAt", "expiresAt");
  }
}

function validateOptionalMissionFields(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  optionalText(record, "objective", issues);
  optionalObject(record, "objectiveDetails", ["businessValues", "desiredOutcome", "purpose", "statement"], issues, validateObjective);
  optionalObject(record, "missionApprovalPolicy", ["approvalRequiredFor", "fabioIsFinalAuthority"], issues, validateApprovalPolicy);
  optionalObject(record, "profileSelection", ["brandProfileId", "brandProfileVersion", "founderProfileId", "founderProfileVersion", "missionTypeProfileId", "missionTypeProfileVersion"], issues, validateProfileSelection);
  optionalArray(record, "successMetrics", 16, "metricId", issues, validateSuccessMetric, false);
  optionalArray(record, "knownFacts", 32, "factId", issues, validateKnownFact, false);
  if (record.reviewContextFingerprint !== undefined && (typeof record.reviewContextFingerprint !== "string" || !IDENTITY_HASH_PATTERN.test(record.reviewContextFingerprint))) {
    issue(issues, "invalid_format", "reviewContextFingerprint must be a SHA-256 hex hash", "reviewContextFingerprint");
  }
  if (
    record.missionType !== undefined &&
    (typeof record.missionType !== "string" ||
      !FOUNDER_MISSION_TYPES.includes(record.missionType as FounderMissionType))
  ) {
    issue(issues, "invalid_value", "missionType is not supported", "missionType");
  }
  optionalObject(record, "audience", ["description", "market", "segments"], issues, validateAudience);
  optionalArray(record, "deliverables", 8, "deliverableId", issues, validateDeliverable, false);
  optionalObject(record, "deadline", ["dueAt", "status", "timezone"], issues, validateDeadline);
  optionalObject(record, "budget", ["currency", "maximumAmount", "status"], issues, validateBudget);
}

function validateMissionLists(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  requiredArray(record, "constraints", 16, "constraintId", issues, validateConstraint);
  requiredArray(
    record,
    "proposedExternalActions",
    8,
    "actionId",
    issues,
    validateExternalAction,
  );
  requiredArray(record, "assumptions", 16, "assumptionId", issues, validateAssumption);
  requiredArray(record, "unknowns", 16, "unknownId", issues, validateUnknown);
}

function validateStatusConsistency(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (record.status === "CONFIRMED") {
    requiredTimestamp(record, "confirmedAt", issues);
    if (typeof record.reviewContextFingerprint !== "string" || !IDENTITY_HASH_PATTERN.test(record.reviewContextFingerprint)) {
      issue(issues, "required", "confirmed drafts require their exact review context fingerprint", "reviewContextFingerprint");
    }
    if (record.terminalReasonCode !== undefined) {
      issue(issues, "invalid_value", "confirmed drafts cannot have a terminal reason", "terminalReasonCode");
    }
    return;
  }
  if (record.status === "CANCELLED" || record.status === "EXPIRED") {
    if (record.confirmedAt !== undefined) {
      issue(issues, "invalid_value", "terminal drafts cannot have confirmedAt", "confirmedAt");
    }
    const expected = record.status === "CANCELLED" ? "cancelled_by_operator" : "expired";
    if (record.terminalReasonCode !== expected) {
      issue(issues, "invalid_value", `terminalReasonCode must be ${expected}`, "terminalReasonCode");
    }
    return;
  }
  if (record.status === "REVIEW_READY") {
    if (typeof record.reviewContextFingerprint !== "string" || !IDENTITY_HASH_PATTERN.test(record.reviewContextFingerprint)) {
      issue(issues, "required", "review-ready drafts require an exact context fingerprint", "reviewContextFingerprint");
    }
    return;
  }
  if (record.confirmedAt !== undefined || record.terminalReasonCode !== undefined || record.reviewContextFingerprint !== undefined) {
    issue(issues, "invalid_value", "non-terminal drafts cannot have confirmation or terminal reason", "status");
  }
}

function validateAudience(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredText(value, "description", issues, path);
  optionalText(value, "market", issues, path);
  validateStringArray(value.segments, 8, false, issues, `${path}.segments`);
}

function validateObjective(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredText(value, "statement", issues, path);
  requiredText(value, "purpose", issues, path);
  requiredText(value, "desiredOutcome", issues, path);
  validateStringArray(value.businessValues, 5, true, issues, `${path}.businessValues`);
}

function validateApprovalPolicy(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  if (value.fabioIsFinalAuthority !== true) issue(issues, "invalid_value", "fabioIsFinalAuthority must be true", `${path}.fabioIsFinalAuthority`);
  validateStringArray(value.approvalRequiredFor, 8, false, issues, `${path}.approvalRequiredFor`);
}

function validateProfileSelection(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  for (const key of ["founderProfileId", "founderProfileVersion", "brandProfileId", "brandProfileVersion"] as const) requiredIdentifier(value, key, issues, path);
  const hasMissionTypeId = value.missionTypeProfileId !== undefined;
  const hasMissionTypeVersion = value.missionTypeProfileVersion !== undefined;
  if (hasMissionTypeId !== hasMissionTypeVersion) issue(issues, "invalid_value", "mission-type profile identity and version must be provided together", path);
  if (hasMissionTypeId) {
    requiredIdentifier(value, "missionTypeProfileId", issues, path);
    requiredText(value, "missionTypeProfileVersion", issues, path);
  }
}

function validateSuccessMetric(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "metricId", issues, path);
  requiredText(value, "measurement", issues, path);
  requiredText(value, "target", issues, path);
  requiredText(value, "evidenceRequired", issues, path);
}

function validateKnownFact(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "factId", issues, path);
  requiredText(value, "statement", issues, path);
  if (value.sourceRef !== undefined) requiredText(value, "sourceRef", issues, path);
}

function validateDeliverable(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "deliverableId", issues, path);
  requiredText(value, "title", issues, path);
  requiredText(value, "description", issues, path);
  requiredText(value, "format", issues, path);
  validateStringArray(value.acceptanceCriteria, 8, false, issues, `${path}.acceptanceCriteria`);
}

function validateDeadline(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  const status = requiredEnum(value, "status", new Set(["known", "unknown"]), issues, path);
  requiredText(value, "timezone", issues, path);
  if (status === "known") requiredTimestamp(value, "dueAt", issues, path);
  if (status === "unknown" && value.dueAt !== undefined) {
    issue(issues, "invalid_value", "unknown deadline cannot have dueAt", `${path}.dueAt`);
  }
}

function validateBudget(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  const status = requiredEnum(value, "status", new Set(["known", "unknown"]), issues, path);
  if (status === "known") {
    requiredEnum(value, "currency", new Set(["EUR", "USD"]), issues, path);
    const amount = value.maximumAmount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      issue(issues, "invalid_number", "maximumAmount must be a non-negative finite number", `${path}.maximumAmount`);
    }
  }
  if (status === "unknown" && (value.currency !== undefined || value.maximumAmount !== undefined)) {
    issue(issues, "invalid_value", "unknown budget cannot contain amount or currency", path);
  }
}

function validateConstraint(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "constraintId", issues, path);
  requiredText(value, "description", issues, path);
  requiredEnum(value, "kind", new Set(["limit", "non_negotiable", "preference"]), issues, path);
}

function validateExternalAction(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "actionId", issues, path);
  requiredEnum(value, "actionType", new Set(["customer_delivery", "outreach", "payment", "publication"]), issues, path);
  requiredText(value, "purpose", issues, path);
  if (value.approvalRequired !== true) issue(issues, "approval_required", "proposed actions require approval", `${path}.approvalRequired`);
  if (value.status !== "proposal_only") issue(issues, "unsafe_execution", "proposed actions must remain proposal_only", `${path}.status`);
}

function validateAssumption(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "assumptionId", issues, path);
  requiredText(value, "statement", issues, path);
  requiredText(value, "rationale", issues, path);
  if (value.sourceUnknownId !== undefined) requiredIdentifier(value, "sourceUnknownId", issues, path);
}

function validateUnknown(value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string): void {
  requiredIdentifier(value, "unknownId", issues, path);
  requiredText(value, "topic", issues, path);
  requiredText(value, "impact", issues, path);
  const classification = requiredEnum(value, "classification", new Set(["DECISION_BLOCKING", "LOW_IMPACT", "MATERIAL_BUT_ASSUMABLE"]), issues, path);
  if (classification === "DECISION_BLOCKING" && value.conservativeAssumption !== undefined) {
    issue(issues, "invalid_value", "decision-blocking unknowns cannot be assumed", `${path}.conservativeAssumption`);
  }
  if (classification !== undefined && classification !== "DECISION_BLOCKING") {
    requiredText(value, "conservativeAssumption", issues, path);
  }
}

function requiredArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
  idKey: string,
  issues: ValidationIssue[],
  validate: (value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string) => void,
): void {
  if (!Array.isArray(record[key])) {
    issue(issues, record[key] === undefined ? "required" : "invalid_type", `${key} must be an array`, key);
    return;
  }
  validateObjectArray(record[key], key, maximum, idKey, issues, validate);
}

function optionalArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
  idKey: string,
  issues: ValidationIssue[],
  validate: (value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string) => void,
  nonEmpty: boolean,
): void {
  if (record[key] === undefined) return;
  if (!Array.isArray(record[key])) {
    issue(issues, "invalid_type", `${key} must be an array`, key);
    return;
  }
  if (nonEmpty && record[key].length === 0) issue(issues, "required", `${key} must not be empty`, key);
  validateObjectArray(record[key], key, maximum, idKey, issues, validate);
}

function validateObjectArray(
  values: readonly unknown[],
  path: string,
  maximum: number,
  idKey: string,
  issues: ValidationIssue[],
  validate: (value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string) => void,
): void {
  if (values.length > maximum) issue(issues, "too_many", `${path} exceeds its maximum length`, path);
  const ids: string[] = [];
  values.forEach((entry, index) => {
    const itemPath = `${path}[${String(index)}]`;
    const item = asRecord(entry);
    if (item === undefined) {
      issue(issues, "invalid_type", `${path} entries must be objects`, itemPath);
      return;
    }
    rejectUnknownKeys(item, keysForArray(path), issues, itemPath);
    validate(item, issues, itemPath);
    if (typeof item[idKey] === "string") ids.push(item[idKey]);
  });
  if (new Set(ids).size !== ids.length) issue(issues, "duplicate", `${path} IDs must be unique`, path);
  if (ids.some((id, index) => id !== [...ids].sort()[index])) issue(issues, "not_deterministic", `${path} must be sorted by ${idKey}`, path);
}

function keysForArray(path: string): ReadonlySet<string> {
  switch (path) {
    case "deliverables": return new Set(["acceptanceCriteria", "deliverableId", "description", "format", "title"]);
    case "constraints": return new Set(["constraintId", "description", "kind"]);
    case "proposedExternalActions": return new Set(["actionId", "actionType", "approvalRequired", "purpose", "status"]);
    case "assumptions": return new Set(["assumptionId", "rationale", "sourceUnknownId", "statement"]);
    case "unknowns": return new Set(["classification", "conservativeAssumption", "impact", "topic", "unknownId"]);
    case "successMetrics": return new Set(["evidenceRequired", "measurement", "metricId", "target"]);
    case "knownFacts": return new Set(["factId", "sourceRef", "statement"]);
    default: return new Set();
  }
}

function optionalObject(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
  validate: (value: Readonly<Record<string, unknown>>, issues: ValidationIssue[], path: string) => void,
): void {
  if (record[key] === undefined) return;
  const value = asRecord(record[key]);
  if (value === undefined) {
    issue(issues, "invalid_type", `${key} must be an object`, key);
    return;
  }
  rejectUnknownKeys(value, new Set(allowed), issues, key);
  validate(value, issues, key);
}

function validateStringArray(value: unknown, maximum: number, nonEmpty: boolean, issues: ValidationIssue[], path: string): void {
  if (!Array.isArray(value) || value.length > maximum || (nonEmpty && value.length === 0)) {
    issue(issues, "invalid_type", `${path} must be a bounded array`, path);
    return;
  }
  if (value.some((entry) => !isBoundedText(entry))) issue(issues, "invalid_type", `${path} entries must be bounded text`, path);
  if (new Set(value).size !== value.length) issue(issues, "duplicate", `${path} entries must be unique`, path);
}

function requiredIdentifier(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): void {
  const value = record[key];
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) issue(issues, value === undefined ? "required" : "invalid_format", `${field(prefix, key)} must be a normalized identifier`, field(prefix, key));
}

function requiredText(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): void {
  if (!isBoundedText(record[key])) issue(issues, record[key] === undefined ? "required" : "invalid_type", `${field(prefix, key)} must be bounded text`, field(prefix, key));
}

function optionalText(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): void {
  if (record[key] !== undefined) requiredText(record, key, issues, prefix);
}

function requiredTimestamp(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): void {
  if (typeof record[key] !== "string" || !isRfc3339Timestamp(record[key])) issue(issues, record[key] === undefined ? "required" : "invalid_timestamp", `${field(prefix, key)} must be RFC 3339`, field(prefix, key));
}

function requiredEnum(record: Readonly<Record<string, unknown>>, key: string, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix = ""): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || !allowed.has(value)) {
    issue(issues, value === undefined ? "required" : "invalid_value", `${field(prefix, key)} is not supported`, field(prefix, key));
    return undefined;
  }
  return value;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1_000;
}

function rejectUnknownKeys(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) issue(issues, "unknown_field", "unknown fields are not allowed", field(prefix, key));
}

function rejectForbiddenTelegramKeys(value: unknown, issues: ValidationIssue[], path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectForbiddenTelegramKeys(entry, issues, `${path}[${String(index)}]`);
    });
    return;
  }
  const record = asRecord(value);
  if (record === undefined) return;
  for (const [key, entry] of Object.entries(record)) {
    const entryPath = field(path, key);
    if (FORBIDDEN_TELEGRAM_KEYS.has(key)) issue(issues, "forbidden_field", "Telegram personal or transport fields are forbidden", entryPath);
    rejectForbiddenTelegramKeys(entry, issues, entryPath);
  }
}

function rejectSensitiveContent(value: unknown, issues: ValidationIssue[], path = ""): void {
  if (typeof value === "string") {
    if (SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(value))) issue(issues, "sensitive_content", "draft contains prohibited sensitive content", path || "$");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      rejectSensitiveContent(entry, issues, `${path}[${String(index)}]`);
    });
    return;
  }
  const record = asRecord(value);
  if (record !== undefined) for (const [key, entry] of Object.entries(record)) rejectSensitiveContent(entry, issues, field(path, key));
}

function field(prefix: string, key: string): string { return prefix.length === 0 ? key : `${prefix}.${key}`; }
function issue(issues: ValidationIssue[], code: string, message: string, path: string): void { issues.push({ code, message, path }); }
function failure<T>(code: string, message: string, path: string): ValidationResult<T> { return validationFailure([{ code, message, path }]); }

function cloneAndFreeze(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneAndFreeze(entry)));
  const record = asRecord(value);
  if (record === undefined) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) clone[key] = cloneAndFreeze(entry);
  return Object.freeze(clone);
}
