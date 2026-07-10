import {
  asRecord,
  isRfc3339Timestamp,
  isSemanticVersion,
} from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  FOUNDER_MISSION_BRIEF_CONTRACT_VERSION,
  FOUNDER_MISSION_TYPES,
  type FounderMissionBrief,
  type MissionExternalActionType,
  type MissionForbiddenActionCategory,
  type MissionUnknownClassification,
} from "./founder-mission-brief.js";

const TOP_LEVEL_KEYS = new Set([
  "approvalPolicy",
  "assumptions",
  "audience",
  "brandProfile",
  "briefId",
  "budget",
  "clarificationQuestions",
  "constraints",
  "contractVersion",
  "deadline",
  "deliverables",
  "evidenceExpectation",
  "externalActionRequests",
  "forbiddenActions",
  "founderPreferences",
  "knownFacts",
  "missionType",
  "nonExecuting",
  "objective",
  "originalityStandard",
  "priority",
  "qualityStandard",
  "riskTolerance",
  "styleProfile",
  "successMetrics",
  "unknowns",
]);

const OBJECT_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  approvalPolicy: new Set(["approvalRequiredFor", "fabioIsFinalAuthority"]),
  audience: new Set(["description", "market", "segments"]),
  brandProfile: new Set([
    "applicationScopes",
    "brandId",
    "communicationTraits",
    "displayName",
    "version",
    "visualDirection",
  ]),
  budget: new Set(["currency", "maximumAmount", "status"]),
  deadline: new Set(["dueAt", "status", "timezone"]),
  evidenceExpectation: new Set([
    "level",
    "sourceRequirements",
    "unsupportedClaimsForbidden",
  ]),
  founderPreferences: new Set([
    "forbiddenCommunicationTraits",
    "operatingPreferences",
    "profileId",
    "version",
  ]),
  objective: new Set([
    "businessValues",
    "desiredOutcome",
    "purpose",
    "statement",
  ]),
  originalityStandard: new Set([
    "differentiationCriteria",
    "level",
    "obviousBaseline",
  ]),
  qualityStandard: new Set([
    "criteria",
    "level",
    "minimumAcceptableOutcome",
  ]),
  styleProfile: new Set([
    "applicableDeliverableIds",
    "communicationTraits",
    "visualDirection",
  ]),
};

const ARRAY_ITEM_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  assumptions: new Set([
    "assumptionId",
    "rationale",
    "sourceUnknownId",
    "statement",
  ]),
  clarificationQuestions: new Set([
    "question",
    "questionId",
    "sourceUnknownId",
    "whyDecisionBlocking",
  ]),
  constraints: new Set(["constraintId", "description", "kind"]),
  deliverables: new Set([
    "acceptanceCriteria",
    "deliverableId",
    "description",
    "format",
    "title",
  ]),
  externalActionRequests: new Set([
    "actionId",
    "actionType",
    "approvalRequired",
    "purpose",
    "status",
  ]),
  forbiddenActions: new Set(["actionId", "category", "description"]),
  knownFacts: new Set(["factId", "sourceRef", "statement"]),
  successMetrics: new Set([
    "evidenceRequired",
    "measurement",
    "metricId",
    "target",
  ]),
  unknowns: new Set([
    "classification",
    "conservativeAssumption",
    "impact",
    "topic",
    "unknownId",
  ]),
};

const PRIORITIES = new Set(["critical", "high", "low", "normal"]);
const RISK_TOLERANCES = new Set(["high", "low", "moderate"]);
const QUALITY_LEVELS = new Set(["premium", "professional", "standard"]);
const ORIGINALITY_LEVELS = new Set(["high", "moderate", "practical"]);
const EVIDENCE_LEVELS = new Set(["high", "minimal", "moderate"]);
const CONSTRAINT_KINDS = new Set(["limit", "non_negotiable", "preference"]);
const UNKNOWN_CLASSIFICATIONS = new Set<MissionUnknownClassification>([
  "DECISION_BLOCKING",
  "LOW_IMPACT",
  "MATERIAL_BUT_ASSUMABLE",
]);
const FORBIDDEN_CATEGORIES = new Set<MissionForbiddenActionCategory>([
  "autonomous_action",
  "external_communication",
  "filesystem_mutation",
  "legal_or_compliance_approval",
  "model_or_provider_call",
  "network_access",
  "payment_or_spending",
  "publishing",
  "tool_execution",
  "workflow_execution",
]);
const EXTERNAL_ACTION_TYPES = new Set<MissionExternalActionType>([
  "customer_delivery",
  "outreach",
  "payment",
  "publication",
]);
const ESCALATION_TYPES = new Set([
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
]);
const BUSINESS_VALUES = new Set([
  "help_fabio_make_money",
  "improve_quality",
  "reduce_operational_work",
  "reduce_risk",
  "save_fabio_time",
]);
const NORMALIZED_ID = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\b(?:api|access)[_-]?key\b/iu,
  /\bbearer\s+[A-Za-z0-9._-]+/iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\b(?:raw\s+)?(?:completion|provider payload|prompt|transcript)\b/iu,
  /\bsecret\s*(?:ref(?:erence)?|value)?\b/iu,
  /(?:\/Users\/|\/home\/)[^\s]+/u,
];

export class FounderMissionBriefValidator
  implements Validator<FounderMissionBrief>
{
  public validate(value: unknown): ValidationResult<FounderMissionBrief> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "founder mission brief must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, TOP_LEVEL_KEYS, issues, "");
    validateScalarBoundary(record, issues);
    const objects = validateObjects(record, issues);
    const arrays = validateArrays(record, issues);
    validateObjective(objects.objective, issues);
    validateAudience(objects.audience, issues);
    validateProfiles(objects, issues);
    validateBudgetAndDeadline(objects, issues);
    validateStandards(objects, issues);
    validateApprovalPolicy(objects.approvalPolicy, arrays.externalActionRequests, issues);
    validateArrayItems(arrays, issues);
    validateReferencesAndUnknownPolicy(arrays, objects.styleProfile, issues);
    validateContradictions(arrays, issues);
    rejectSensitiveContent(record, issues);

    if (issues.length > 0) {
      return validationFailure(issues);
    }
    return validationSuccess(cloneAndFreeze(value) as FounderMissionBrief);
  }
}

interface MissionObjects {
  readonly approvalPolicy?: Readonly<Record<string, unknown>>;
  readonly audience?: Readonly<Record<string, unknown>>;
  readonly brandProfile?: Readonly<Record<string, unknown>>;
  readonly budget?: Readonly<Record<string, unknown>>;
  readonly deadline?: Readonly<Record<string, unknown>>;
  readonly evidenceExpectation?: Readonly<Record<string, unknown>>;
  readonly founderPreferences?: Readonly<Record<string, unknown>>;
  readonly objective?: Readonly<Record<string, unknown>>;
  readonly originalityStandard?: Readonly<Record<string, unknown>>;
  readonly qualityStandard?: Readonly<Record<string, unknown>>;
  readonly styleProfile?: Readonly<Record<string, unknown>>;
}

interface MissionArrays {
  readonly assumptions: readonly Readonly<Record<string, unknown>>[];
  readonly clarificationQuestions: readonly Readonly<Record<string, unknown>>[];
  readonly constraints: readonly Readonly<Record<string, unknown>>[];
  readonly deliverables: readonly Readonly<Record<string, unknown>>[];
  readonly externalActionRequests: readonly Readonly<Record<string, unknown>>[];
  readonly forbiddenActions: readonly Readonly<Record<string, unknown>>[];
  readonly knownFacts: readonly Readonly<Record<string, unknown>>[];
  readonly successMetrics: readonly Readonly<Record<string, unknown>>[];
  readonly unknowns: readonly Readonly<Record<string, unknown>>[];
}

function validateScalarBoundary(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  requiredExactString(
    record,
    "contractVersion",
    FOUNDER_MISSION_BRIEF_CONTRACT_VERSION,
    issues,
  );
  requiredIdentifier(record, "briefId", issues);
  requiredEnum(record, "missionType", new Set(FOUNDER_MISSION_TYPES), issues);
  requiredEnum(record, "priority", PRIORITIES, issues);
  requiredEnum(record, "riskTolerance", RISK_TOLERANCES, issues);
  if (record.nonExecuting !== true) {
    issue(issues, "unsafe_execution", "mission brief must be non-executing", "nonExecuting");
  }
}

function validateObjects(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): MissionObjects {
  const result: Record<string, Readonly<Record<string, unknown>> | undefined> = {};
  for (const [key, allowed] of Object.entries(OBJECT_KEYS)) {
    const candidate = asRecord(record[key]);
    if (candidate === undefined) {
      issue(issues, record[key] === undefined ? "required" : "invalid_type", `${key} must be an object`, key);
      result[key] = undefined;
      continue;
    }
    rejectUnknownKeys(candidate, allowed, issues, key);
    result[key] = candidate;
  }
  return result;
}

function validateArrays(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): MissionArrays {
  const result: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
  for (const [key, allowed] of Object.entries(ARRAY_ITEM_KEYS)) {
    const value = record[key];
    if (!Array.isArray(value)) {
      issue(issues, value === undefined ? "required" : "invalid_type", `${key} must be an array`, key);
      result[key] = [];
      continue;
    }
    const entries: Readonly<Record<string, unknown>>[] = [];
    for (const [index, candidate] of value.entries()) {
      const item = asRecord(candidate);
      const path = `${key}[${String(index)}]`;
      if (item === undefined) {
        issue(issues, "invalid_type", `${key} entries must be objects`, path);
        continue;
      }
      rejectUnknownKeys(item, allowed, issues, path);
      entries.push(item);
    }
    result[key] = entries;
  }
  return result as unknown as MissionArrays;
}

function validateObjective(
  objective: Readonly<Record<string, unknown>> | undefined,
  issues: ValidationIssue[],
): void {
  if (objective === undefined) return;
  requiredText(objective, "statement", issues, "objective");
  requiredText(objective, "purpose", issues, "objective");
  requiredText(objective, "desiredOutcome", issues, "objective");
  const values = requiredStringArray(objective, "businessValues", issues, "objective", false);
  validateEnumEntries(values, BUSINESS_VALUES, issues, "objective.businessValues");
}

function validateAudience(
  audience: Readonly<Record<string, unknown>> | undefined,
  issues: ValidationIssue[],
): void {
  if (audience === undefined) return;
  requiredText(audience, "description", issues, "audience");
  optionalText(audience, "market", issues, "audience");
  requiredStringArray(audience, "segments", issues, "audience", false);
}

function validateProfiles(objects: MissionObjects, issues: ValidationIssue[]): void {
  const brand = objects.brandProfile;
  if (brand !== undefined) {
    requiredIdentifier(brand, "brandId", issues, "brandProfile");
    requiredVersion(brand, "version", issues, "brandProfile");
    requiredText(brand, "displayName", issues, "brandProfile");
    requiredStringArray(brand, "applicationScopes", issues, "brandProfile", false);
    requiredStringArray(brand, "communicationTraits", issues, "brandProfile", false);
    optionalStringArray(brand, "visualDirection", issues, "brandProfile");
  }
  const founder = objects.founderPreferences;
  if (founder !== undefined) {
    requiredIdentifier(founder, "profileId", issues, "founderPreferences");
    requiredVersion(founder, "version", issues, "founderPreferences");
    requiredStringArray(founder, "operatingPreferences", issues, "founderPreferences", false);
    requiredStringArray(founder, "forbiddenCommunicationTraits", issues, "founderPreferences", false);
  }
}

function validateBudgetAndDeadline(
  objects: MissionObjects,
  issues: ValidationIssue[],
): void {
  const budget = objects.budget;
  if (budget !== undefined) {
    const status = requiredEnum(budget, "status", new Set(["known", "unknown"]), issues, "budget");
    if (status === "known") {
      requiredEnum(budget, "currency", new Set(["EUR", "USD"]), issues, "budget");
      requiredNonNegativeNumber(budget, "maximumAmount", issues, "budget");
    } else if (status === "unknown" && (budget.currency !== undefined || budget.maximumAmount !== undefined)) {
      issue(issues, "invalid_value", "unknown budget must not contain invented amount or currency", "budget");
    }
  }
  const deadline = objects.deadline;
  if (deadline !== undefined) {
    const status = requiredEnum(deadline, "status", new Set(["known", "unknown"]), issues, "deadline");
    requiredText(deadline, "timezone", issues, "deadline");
    if (status === "known") {
      const dueAt = requiredText(deadline, "dueAt", issues, "deadline");
      if (dueAt !== undefined && !isRfc3339Timestamp(dueAt)) {
        issue(issues, "invalid_timestamp", "deadline.dueAt must be RFC 3339", "deadline.dueAt");
      }
    } else if (status === "unknown" && deadline.dueAt !== undefined) {
      issue(issues, "invalid_value", "unknown deadline must not contain an invented dueAt", "deadline.dueAt");
    }
  }
}

function validateStandards(objects: MissionObjects, issues: ValidationIssue[]): void {
  const quality = objects.qualityStandard;
  if (quality !== undefined) {
    requiredEnum(quality, "level", QUALITY_LEVELS, issues, "qualityStandard");
    requiredText(quality, "minimumAcceptableOutcome", issues, "qualityStandard");
    requiredStringArray(quality, "criteria", issues, "qualityStandard", false);
  }
  const originality = objects.originalityStandard;
  if (originality !== undefined) {
    requiredEnum(originality, "level", ORIGINALITY_LEVELS, issues, "originalityStandard");
    requiredStringArray(originality, "differentiationCriteria", issues, "originalityStandard", false);
    optionalText(originality, "obviousBaseline", issues, "originalityStandard");
  }
  const evidence = objects.evidenceExpectation;
  if (evidence !== undefined) {
    requiredEnum(evidence, "level", EVIDENCE_LEVELS, issues, "evidenceExpectation");
    requiredStringArray(evidence, "sourceRequirements", issues, "evidenceExpectation", false);
    if (evidence.unsupportedClaimsForbidden !== true) {
      issue(issues, "invalid_value", "unsupported claims must remain forbidden", "evidenceExpectation.unsupportedClaimsForbidden");
    }
  }
  const style = objects.styleProfile;
  if (style !== undefined) {
    requiredStringArray(style, "applicableDeliverableIds", issues, "styleProfile");
    requiredStringArray(style, "communicationTraits", issues, "styleProfile", false);
    optionalStringArray(style, "visualDirection", issues, "styleProfile");
  }
}

function validateApprovalPolicy(
  policy: Readonly<Record<string, unknown>> | undefined,
  externalActions: readonly Readonly<Record<string, unknown>>[],
  issues: ValidationIssue[],
): void {
  if (policy === undefined) return;
  if (policy.fabioIsFinalAuthority !== true) {
    issue(issues, "invalid_value", "Fabio must remain final approval authority", "approvalPolicy.fabioIsFinalAuthority");
  }
  const approvals = requiredStringArray(policy, "approvalRequiredFor", issues, "approvalPolicy");
  validateEnumEntries(approvals, ESCALATION_TYPES, issues, "approvalPolicy.approvalRequiredFor");
  if (externalActions.length > 0 && !approvals?.includes("external_side_effect")) {
    issue(issues, "approval_required", "external action proposals require external_side_effect approval", "approvalPolicy.approvalRequiredFor");
  }
  const publishOrSend = externalActions.some(({ actionType }) =>
    actionType === "customer_delivery" || actionType === "outreach" || actionType === "publication",
  );
  if (publishOrSend && !approvals?.includes("publish_or_send")) {
    issue(issues, "approval_required", "publish, send, outreach, or delivery proposals require publish_or_send approval", "approvalPolicy.approvalRequiredFor");
  }
}

function validateArrayItems(arrays: MissionArrays, issues: ValidationIssue[]): void {
  validateItems(arrays.deliverables, "deliverables", "deliverableId", issues, (item, path) => {
    requiredText(item, "title", issues, path);
    requiredText(item, "description", issues, path);
    requiredText(item, "format", issues, path);
    requiredStringArray(item, "acceptanceCriteria", issues, path, false);
  }, false);
  validateItems(arrays.constraints, "constraints", "constraintId", issues, (item, path) => {
    requiredText(item, "description", issues, path);
    requiredEnum(item, "kind", CONSTRAINT_KINDS, issues, path);
  });
  validateItems(arrays.forbiddenActions, "forbiddenActions", "actionId", issues, (item, path) => {
    requiredText(item, "description", issues, path);
    requiredEnum(item, "category", FORBIDDEN_CATEGORIES, issues, path);
  });
  validateItems(arrays.externalActionRequests, "externalActionRequests", "actionId", issues, (item, path) => {
    requiredText(item, "purpose", issues, path);
    requiredEnum(item, "actionType", EXTERNAL_ACTION_TYPES, issues, path);
    if (item.approvalRequired !== true) issue(issues, "approval_required", "external action requests must require approval", `${path}.approvalRequired`);
    if (item.status !== "proposal_only") issue(issues, "unsafe_execution", "external action requests must remain proposal_only", `${path}.status`);
  });
  validateItems(arrays.successMetrics, "successMetrics", "metricId", issues, (item, path) => {
    requiredText(item, "measurement", issues, path);
    requiredText(item, "target", issues, path);
    requiredText(item, "evidenceRequired", issues, path);
  }, false);
  validateItems(arrays.knownFacts, "knownFacts", "factId", issues, (item, path) => {
    requiredText(item, "statement", issues, path);
    optionalIdentifier(item, "sourceRef", issues, path);
  });
  validateItems(arrays.assumptions, "assumptions", "assumptionId", issues, (item, path) => {
    requiredText(item, "statement", issues, path);
    requiredText(item, "rationale", issues, path);
    optionalIdentifier(item, "sourceUnknownId", issues, path);
  });
  validateItems(arrays.unknowns, "unknowns", "unknownId", issues, (item, path) => {
    requiredText(item, "topic", issues, path);
    requiredText(item, "impact", issues, path);
    const classification = requiredEnum(item, "classification", UNKNOWN_CLASSIFICATIONS, issues, path);
    if (classification === "DECISION_BLOCKING" && item.conservativeAssumption !== undefined) {
      issue(issues, "invalid_value", "decision-blocking unknowns cannot be silently assumed", `${path}.conservativeAssumption`);
    }
    if (classification !== undefined && classification !== "DECISION_BLOCKING") {
      requiredText(item, "conservativeAssumption", issues, path);
    }
  });
  validateItems(arrays.clarificationQuestions, "clarificationQuestions", "questionId", issues, (item, path) => {
    requiredIdentifier(item, "sourceUnknownId", issues, path);
    requiredText(item, "question", issues, path);
    requiredText(item, "whyDecisionBlocking", issues, path);
  });
}

function validateReferencesAndUnknownPolicy(
  arrays: MissionArrays,
  style: Readonly<Record<string, unknown>> | undefined,
  issues: ValidationIssue[],
): void {
  const deliverableIds = new Set(arrays.deliverables.map(({ deliverableId }) => deliverableId));
  for (const [index, id] of (style?.applicableDeliverableIds as readonly unknown[] | undefined)?.entries() ?? []) {
    if (typeof id === "string" && !deliverableIds.has(id)) {
      issue(issues, "not_found", "style profile references an unknown deliverable", `styleProfile.applicableDeliverableIds[${String(index)}]`);
    }
  }
  const unknownById = new Map(arrays.unknowns.map((unknown) => [unknown.unknownId, unknown]));
  const questionsByUnknown = groupCount(arrays.clarificationQuestions, "sourceUnknownId");
  const assumptionsByUnknown = groupCount(arrays.assumptions, "sourceUnknownId");
  for (const unknown of arrays.unknowns) {
    const id = unknown.unknownId;
    if (typeof id !== "string") continue;
    if (unknown.classification === "DECISION_BLOCKING") {
      if ((questionsByUnknown.get(id) ?? 0) !== 1) {
        issue(issues, "clarification_required", "each decision-blocking unknown requires exactly one clarification question", `unknowns.${id}`);
      }
    } else if (UNKNOWN_CLASSIFICATIONS.has(unknown.classification as MissionUnknownClassification)) {
      if ((questionsByUnknown.get(id) ?? 0) !== 0) {
        issue(issues, "unnecessary_clarification", "non-blocking unknowns must not create clarification questions", `unknowns.${id}`);
      }
      if ((assumptionsByUnknown.get(id) ?? 0) !== 1) {
        issue(issues, "assumption_required", "each assumable unknown requires one explicit conservative assumption", `unknowns.${id}`);
      }
    }
  }
  for (const question of arrays.clarificationQuestions) {
    const source = typeof question.sourceUnknownId === "string" ? unknownById.get(question.sourceUnknownId) : undefined;
    if (source?.classification !== "DECISION_BLOCKING") {
      issue(issues, "invalid_reference", "clarification question must reference a decision-blocking unknown", "clarificationQuestions");
    }
  }
  for (const assumption of arrays.assumptions) {
    if (typeof assumption.sourceUnknownId !== "string") continue;
    const source = unknownById.get(assumption.sourceUnknownId);
    if (source === undefined || source.classification === "DECISION_BLOCKING") {
      issue(issues, "invalid_reference", "assumption must reference an assumable non-blocking unknown", "assumptions");
    }
  }
}

function validateContradictions(arrays: MissionArrays, issues: ValidationIssue[]): void {
  const forbiddenDescriptions = new Set(arrays.forbiddenActions.map(({ description }) => normalizeText(description)));
  for (const constraint of arrays.constraints) {
    if (constraint.kind === "non_negotiable" && forbiddenDescriptions.has(normalizeText(constraint.description))) {
      issue(issues, "contradiction", "the same action cannot be required and forbidden", "constraints");
    }
  }
  const forbidden = new Set(arrays.forbiddenActions.map(({ category }) => category));
  const categoryForAction: Record<MissionExternalActionType, MissionForbiddenActionCategory> = {
    customer_delivery: "external_communication",
    outreach: "external_communication",
    payment: "payment_or_spending",
    publication: "publishing",
  };
  for (const action of arrays.externalActionRequests) {
    if (typeof action.actionType === "string" && EXTERNAL_ACTION_TYPES.has(action.actionType as MissionExternalActionType) && forbidden.has(categoryForAction[action.actionType as MissionExternalActionType])) {
      issue(issues, "contradiction", "an external action cannot be both requested and forbidden", "externalActionRequests");
    }
  }
}

function validateItems(
  items: readonly Readonly<Record<string, unknown>>[],
  path: string,
  idKey: string,
  issues: ValidationIssue[],
  validate: (item: Readonly<Record<string, unknown>>, path: string) => void,
  allowEmpty = true,
): void {
  if (!allowEmpty && items.length === 0) issue(issues, "required", `${path} must not be empty`, path);
  const ids: string[] = [];
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${String(index)}]`;
    const id = requiredIdentifier(item, idKey, issues, itemPath);
    if (id !== undefined) ids.push(id);
    validate(item, itemPath);
  }
  if (new Set(ids).size !== ids.length) issue(issues, "duplicate", `${path} IDs must be unique`, path);
  if (ids.some((id, index) => id !== [...ids].sort()[index])) issue(issues, "not_deterministic", `${path} must be sorted by ${idKey}`, path);
}

function groupCount(items: readonly Readonly<Record<string, unknown>>[], key: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) if (typeof item[key] === "string") result.set(item[key], (result.get(item[key]) ?? 0) + 1);
  return result;
}

function requiredIdentifier(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): string | undefined {
  const value = requiredText(record, key, issues, prefix);
  if (value !== undefined && !NORMALIZED_ID.test(value)) issue(issues, "invalid_format", `${field(prefix, key)} must be a normalized identifier`, field(prefix, key));
  return value;
}

function optionalIdentifier(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): string | undefined {
  if (record[key] === undefined) return undefined;
  return requiredIdentifier(record, key, issues, prefix);
}

function requiredVersion(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string): void {
  const value = requiredText(record, key, issues, prefix);
  if (value !== undefined && !isSemanticVersion(value)) issue(issues, "invalid_format", `${field(prefix, key)} must use semantic versioning`, field(prefix, key));
}

function requiredText(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1_000) {
    issue(issues, value === undefined ? "required" : "invalid_type", `${field(prefix, key)} must be a non-empty bounded string`, field(prefix, key));
    return undefined;
  }
  return value;
}

function optionalText(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string): void {
  if (record[key] !== undefined) requiredText(record, key, issues, prefix);
}

function requiredExactString(record: Readonly<Record<string, unknown>>, key: string, expected: string, issues: ValidationIssue[]): void {
  if (record[key] !== expected) issue(issues, "unsupported_version", `${key} must be ${expected}`, key);
}

function requiredEnum(record: Readonly<Record<string, unknown>>, key: string, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix = ""): string | undefined {
  const value = requiredText(record, key, issues, prefix);
  if (value !== undefined && !allowed.has(value)) {
    issue(issues, "invalid_value", `${field(prefix, key)} is not supported`, field(prefix, key));
    return undefined;
  }
  return value;
}

function requiredStringArray(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = "", allowEmpty = true): readonly string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0 || entry.length > 500) || (!allowEmpty && value.length === 0)) {
    issue(issues, value === undefined ? "required" : "invalid_type", `${field(prefix, key)} must be an array of bounded strings`, field(prefix, key));
    return undefined;
  }
  const strings = value as readonly string[];
  if (new Set(strings).size !== strings.length) issue(issues, "duplicate", `${field(prefix, key)} must not contain duplicates`, field(prefix, key));
  return strings;
}

function optionalStringArray(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string): void {
  if (record[key] !== undefined) requiredStringArray(record, key, issues, prefix, false);
}

function requiredNonNegativeNumber(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) issue(issues, value === undefined ? "required" : "invalid_number", `${field(prefix, key)} must be a finite non-negative number`, field(prefix, key));
}

function validateEnumEntries(values: readonly string[] | undefined, allowed: ReadonlySet<string>, issues: ValidationIssue[], path: string): void {
  values?.forEach((value, index) => {
    if (!allowed.has(value)) issue(issues, "invalid_value", `${path} contains an unsupported value`, `${path}[${String(index)}]`);
  });
}

function rejectUnknownKeys(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) issue(issues, "unknown_field", "unknown fields are not allowed", field(prefix, key));
}

function rejectSensitiveContent(value: unknown, issues: ValidationIssue[], path = ""): void {
  if (typeof value === "string") {
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(value))) issue(issues, "sensitive_content", "mission brief contains prohibited sensitive content", path.length === 0 ? "$" : path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { rejectSensitiveContent(entry, issues, `${path}[${String(index)}]`); });
    return;
  }
  const record = asRecord(value);
  if (record !== undefined) for (const [key, entry] of Object.entries(record)) rejectSensitiveContent(entry, issues, field(path, key));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function field(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}

function issue(issues: ValidationIssue[], code: string, message: string, path: string): void {
  issues.push({ code, message, path });
}

function cloneAndFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreeze(entry)));
  }
  const record = asRecord(value);
  if (record === undefined) {
    return value;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    clone[key] = cloneAndFreeze(entry);
  }
  return Object.freeze(clone);
}
