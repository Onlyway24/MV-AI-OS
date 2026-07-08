import {
  readRequiredBoolean,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import { OperatorSafetyReportValidator } from "../guardians/operator-safety-report-validator.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantEscalationType,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type { MainAssistantInvocationRiskLevel } from "./main-assistant-runtime.js";
import {
  GUARDIAN_CONSULTATION_CONTRACT_VERSION,
  type GuardianConsultationApprovalRequirement,
  type GuardianConsultationDecision,
  type GuardianConsultationDecisionKind,
  type GuardianConsultationPolicy,
  type GuardianConsultationReason,
  type GuardianConsultationReasonCode,
  type GuardianConsultationReasonSeverity,
  type GuardianConsultationRequest,
  type GuardianConsultationSafetyRequirement,
} from "./guardian-consultation.js";

const REQUEST_KEYS = new Set([
  "assistantId",
  "consultationId",
  "contractVersion",
  "generatedAt",
  "operatorSafetyReport",
  "requestedOperations",
  "riskLevel",
]);

const POLICY_KEYS = new Set([
  "attentionRequiresAcknowledgementForRiskyOperations",
  "blockCriticalEscalation",
  "blockRiskyWhenSafetyMissing",
  "blockRiskyWhenSafetyUnknown",
  "contractVersion",
  "policyId",
  "requiredApprovals",
  "safetyRequirements",
]);

const APPROVAL_KEYS = new Set(["approvalId", "operation", "rationale"]);

const SAFETY_REQUIREMENT_KEYS = new Set([
  "operation",
  "requiredDomains",
]);

const DECISION_KEYS = new Set([
  "acknowledgementRequired",
  "approvalRequired",
  "assistantId",
  "blockers",
  "checkedSafetyDomains",
  "consultationId",
  "contractVersion",
  "decision",
  "generatedAt",
  "missingRequiredSafetyDomains",
  "operatorSafetyStatus",
  "reasons",
  "recommendedNextActions",
  "requiredApprovals",
  "safetyToAutonomy",
  "warnings",
]);

const REASON_KEYS = new Set(["code", "message", "severity"]);

const ESCALATION_TYPES = new Set<MainAssistantEscalationType>([
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
]);

const SAFETY_DOMAINS = new Set<MainAssistantSafetyDomain>([
  "backup",
  "cost",
  "incident",
  "operator_safety",
  "quality",
  "security",
]);

const RISK_LEVELS = new Set<MainAssistantInvocationRiskLevel>([
  "normal",
  "risky",
  "sensitive",
]);

const DECISIONS = new Set<GuardianConsultationDecisionKind>([
  "blocked",
  "continue_with_warning",
  "may_continue",
  "requires_approval",
  "requires_operator_confirmation",
]);

const REASON_CODES = new Set<GuardianConsultationReasonCode>([
  "approval_required",
  "attention_required",
  "critical_operator_safety",
  "healthy_operator_safety",
  "missing_operator_safety_report",
  "missing_required_safety_domain",
  "operator_safety_unknown",
  "unsafe_autonomy_decision",
]);

const REASON_SEVERITIES = new Set<GuardianConsultationReasonSeverity>([
  "allow",
  "block",
  "confirm",
  "warn",
]);

const OPERATOR_SAFETY_STATUSES = new Set<
  GuardianConsultationDecision["operatorSafetyStatus"]
>(["attention_required", "critical", "healthy", "missing", "unknown"]);

const AUTONOMY_DECISIONS = new Set<
  GuardianConsultationDecision["safetyToAutonomy"]
>([
  "continue_with_attention",
  "do_not_increase_autonomy",
  "missing",
  "safe_to_continue",
  "unknown",
]);

const SENSITIVE_FIELD_NAMES = new Set([
  "apiKey",
  "completion",
  "providerPayload",
  "rawKnowledge",
  "rawMemory",
  "rawProviderPayload",
  "rawTranscript",
  "secret",
  "secretRef",
  "secretReference",
  "secretValue",
  "transcript",
  "transportInternals",
]);

const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\bsecret(?:Ref|Reference|Value)?\b/u,
  /\bproviderPayload\b/u,
  /\braw(?:Knowledge|Memory|Transcript)\b/u,
];

export class GuardianConsultationRequestValidator
  implements Validator<GuardianConsultationRequest>
{
  readonly #operatorSafetyReportValidator =
    new OperatorSafetyReportValidator();

  public validate(
    value: unknown,
  ): ValidationResult<GuardianConsultationRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "guardian consultation request must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, REQUEST_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const consultationId = readIdentifier(record, "consultationId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const requestedOperations = readEnumArray(
      record.requestedOperations,
      "requestedOperations",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      RISK_LEVELS,
      issues,
    );
    const operatorSafetyReport = readOperatorSafetyReport(
      record.operatorSafetyReport,
      this.#operatorSafetyReportValidator,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== GUARDIAN_CONSULTATION_CONTRACT_VERSION ||
      assistantId === undefined ||
      consultationId === undefined ||
      generatedAt === undefined ||
      requestedOperations === undefined ||
      riskLevel === undefined ||
      operatorSafetyReport === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assistantId,
      consultationId,
      contractVersion,
      generatedAt,
      ...(operatorSafetyReport === undefined ? {} : { operatorSafetyReport }),
      requestedOperations,
      riskLevel,
    });
  }
}

export class GuardianConsultationPolicyValidator
  implements Validator<GuardianConsultationPolicy>
{
  public validate(
    value: unknown,
  ): ValidationResult<GuardianConsultationPolicy> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "guardian consultation policy must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, POLICY_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const policyId = readIdentifier(record, "policyId", issues);
    const attentionRequiresAcknowledgementForRiskyOperations =
      readRequiredBoolean(
        record,
        "attentionRequiresAcknowledgementForRiskyOperations",
        issues,
      );
    const blockCriticalEscalation = readRequiredBoolean(
      record,
      "blockCriticalEscalation",
      issues,
    );
    const blockRiskyWhenSafetyMissing = readRequiredBoolean(
      record,
      "blockRiskyWhenSafetyMissing",
      issues,
    );
    const blockRiskyWhenSafetyUnknown = readRequiredBoolean(
      record,
      "blockRiskyWhenSafetyUnknown",
      issues,
    );
    const requiredApprovals = readApprovalRequirements(
      record.requiredApprovals,
      issues,
      "requiredApprovals",
    );
    const safetyRequirements = readSafetyRequirements(
      record.safetyRequirements,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== GUARDIAN_CONSULTATION_CONTRACT_VERSION ||
      policyId === undefined ||
      attentionRequiresAcknowledgementForRiskyOperations === undefined ||
      blockCriticalEscalation === undefined ||
      blockRiskyWhenSafetyMissing === undefined ||
      blockRiskyWhenSafetyUnknown === undefined ||
      requiredApprovals === undefined ||
      safetyRequirements === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      attentionRequiresAcknowledgementForRiskyOperations,
      blockCriticalEscalation,
      blockRiskyWhenSafetyMissing,
      blockRiskyWhenSafetyUnknown,
      contractVersion,
      policyId,
      requiredApprovals,
      safetyRequirements,
    });
  }
}

export class GuardianConsultationDecisionValidator
  implements Validator<GuardianConsultationDecision>
{
  public validate(
    value: unknown,
  ): ValidationResult<GuardianConsultationDecision> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "guardian consultation decision must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, DECISION_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");
    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const consultationId = readIdentifier(record, "consultationId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const decision = readEnumValue(
      record.decision,
      "decision",
      DECISIONS,
      issues,
    );
    const operatorSafetyStatus = readEnumValue(
      record.operatorSafetyStatus,
      "operatorSafetyStatus",
      OPERATOR_SAFETY_STATUSES,
      issues,
    );
    const safetyToAutonomy = readEnumValue(
      record.safetyToAutonomy,
      "safetyToAutonomy",
      AUTONOMY_DECISIONS,
      issues,
    );
    const checkedSafetyDomains = readEnumArray(
      record.checkedSafetyDomains,
      "checkedSafetyDomains",
      SAFETY_DOMAINS,
      issues,
      true,
    );
    const missingRequiredSafetyDomains = readEnumArray(
      record.missingRequiredSafetyDomains,
      "missingRequiredSafetyDomains",
      SAFETY_DOMAINS,
      issues,
      true,
    );
    const requiredApprovals = readApprovalRequirements(
      record.requiredApprovals,
      issues,
      "requiredApprovals",
    );
    const reasons = readReasons(record.reasons, issues);
    const blockers = readSafeStringArray(record, "blockers", issues);
    const warnings = readSafeStringArray(record, "warnings", issues);
    const recommendedNextActions = readSafeStringArray(
      record,
      "recommendedNextActions",
      issues,
    );
    const acknowledgementRequired = readRequiredBoolean(
      record,
      "acknowledgementRequired",
      issues,
    );
    const approvalRequired = readRequiredBoolean(
      record,
      "approvalRequired",
      issues,
    );

    if (
      requiredApprovals !== undefined &&
      approvalRequired !== undefined &&
      approvalRequired !== (requiredApprovals.length > 0)
    ) {
      issues.push({
        code: "inconsistent_value",
        message:
          "approvalRequired must match whether requiredApprovals contains entries",
        path: "approvalRequired",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== GUARDIAN_CONSULTATION_CONTRACT_VERSION ||
      assistantId === undefined ||
      consultationId === undefined ||
      generatedAt === undefined ||
      decision === undefined ||
      operatorSafetyStatus === undefined ||
      safetyToAutonomy === undefined ||
      checkedSafetyDomains === undefined ||
      missingRequiredSafetyDomains === undefined ||
      requiredApprovals === undefined ||
      reasons === undefined ||
      blockers === undefined ||
      warnings === undefined ||
      recommendedNextActions === undefined ||
      acknowledgementRequired === undefined ||
      approvalRequired === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      acknowledgementRequired,
      approvalRequired,
      assistantId,
      blockers,
      checkedSafetyDomains,
      consultationId,
      contractVersion,
      decision,
      generatedAt,
      missingRequiredSafetyDomains,
      operatorSafetyStatus,
      reasons,
      recommendedNextActions,
      requiredApprovals,
      safetyToAutonomy,
      warnings,
    });
  }
}

function readOperatorSafetyReport(
  value: unknown,
  validator: OperatorSafetyReportValidator,
  issues: ValidationIssue[],
): GuardianConsultationRequest["operatorSafetyReport"] | false | undefined {
  if (value === undefined) {
    return undefined;
  }
  const validation = validator.validate(value);
  if (validation.ok) {
    return validation.value;
  }
  for (const issue of validation.issues) {
    issues.push({
      ...issue,
      path: prependPath("operatorSafetyReport", issue.path),
    });
  }
  return false;
}

function readApprovalRequirements(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
): readonly GuardianConsultationApprovalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const requirements: GuardianConsultationApprovalRequirement[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const requirement = readApprovalRequirement(entry, entryPath, issues);
    if (requirement === undefined) {
      continue;
    }
    const key = `${requirement.operation}:${requirement.approvalId}`;
    if (seen.has(key)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique by operation and approvalId`,
        path: entryPath,
      });
      continue;
    }
    seen.add(key);
    requirements.push(requirement);
  }

  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
    ? undefined
    : Object.freeze(requirements);
}

function readApprovalRequirement(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): GuardianConsultationApprovalRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, APPROVAL_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const approvalId = readIdentifier(record, "approvalId", issues, path);
  const operation = readEnumValue(
    record.operation,
    `${path}.operation`,
    ESCALATION_TYPES,
    issues,
  );
  const rationale = readSafeString(record, "rationale", issues, path, 1_000);

  if (
    approvalId === undefined ||
    operation === undefined ||
    rationale === undefined
  ) {
    return undefined;
  }

  return {
    approvalId,
    operation,
    rationale,
  };
}

function readSafetyRequirements(
  value: unknown,
  issues: ValidationIssue[],
): readonly GuardianConsultationSafetyRequirement[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "safetyRequirements must be an array",
      path: "safetyRequirements",
    });
    return undefined;
  }

  const requirements: GuardianConsultationSafetyRequirement[] = [];
  const seen = new Set<MainAssistantEscalationType>();
  for (const [index, entry] of value.entries()) {
    const path = `safetyRequirements[${String(index)}]`;
    const requirement = readSafetyRequirement(entry, path, issues);
    if (requirement === undefined) {
      continue;
    }
    if (seen.has(requirement.operation)) {
      issues.push({
        code: "duplicate",
        message: `${path}.operation must be unique`,
        path: `${path}.operation`,
      });
      continue;
    }
    seen.add(requirement.operation);
    requirements.push(requirement);
  }

  return issues.some(({ path }) => path.startsWith("safetyRequirements"))
    ? undefined
    : Object.freeze(requirements);
}

function readSafetyRequirement(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): GuardianConsultationSafetyRequirement | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, SAFETY_REQUIREMENT_KEYS, issues, path);
  const operation = readEnumValue(
    record.operation,
    `${path}.operation`,
    ESCALATION_TYPES,
    issues,
  );
  const requiredDomains = readEnumArray(
    record.requiredDomains,
    `${path}.requiredDomains`,
    SAFETY_DOMAINS,
    issues,
    false,
  );

  if (operation === undefined || requiredDomains === undefined) {
    return undefined;
  }

  return {
    operation,
    requiredDomains,
  };
}

function readReasons(
  value: unknown,
  issues: ValidationIssue[],
): readonly GuardianConsultationReason[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "reasons must be an array",
      path: "reasons",
    });
    return undefined;
  }

  const reasons: GuardianConsultationReason[] = [];
  for (const [index, entry] of value.entries()) {
    const reason = readReason(entry, `reasons[${String(index)}]`, issues);
    if (reason !== undefined) {
      reasons.push(reason);
    }
  }

  return issues.some(({ path }) => path.startsWith("reasons"))
    ? undefined
    : Object.freeze(reasons);
}

function readReason(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): GuardianConsultationReason | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  rejectUnknownKeys(record, REASON_KEYS, issues, path);
  rejectSensitiveKeys(record, issues, path);
  const code = readEnumValue(
    record.code,
    `${path}.code`,
    REASON_CODES,
    issues,
  );
  const severity = readEnumValue(
    record.severity,
    `${path}.severity`,
    REASON_SEVERITIES,
    issues,
  );
  const message = readSafeString(record, "message", issues, path, 1_000);

  if (code === undefined || severity === undefined || message === undefined) {
    return undefined;
  }

  return {
    code,
    message,
    severity,
  };
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof GUARDIAN_CONSULTATION_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== GUARDIAN_CONSULTATION_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${GUARDIAN_CONSULTATION_CONTRACT_VERSION}`,
      path: "contractVersion",
    });
    return undefined;
  }
  return contractVersion;
}

function readAssistantId(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof ONLY_WAY_ASSISTANT_ID | undefined {
  const assistantId = readRequiredString(record, "assistantId", issues);
  if (assistantId !== undefined && assistantId !== ONLY_WAY_ASSISTANT_ID) {
    issues.push({
      code: "invalid_value",
      message: `assistantId must be ${ONLY_WAY_ASSISTANT_ID}`,
      path: "assistantId",
    });
    return undefined;
  }
  return assistantId;
}

function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix = "",
): string | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix, {
    maxLength: 160,
  });
  const path = pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`;
  if (value !== undefined && /\s/u.test(value)) {
    issues.push({
      code: "invalid_value",
      message: `${path} must not contain whitespace`,
      path,
    });
    return undefined;
  }
  return value;
}

function readTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = readRequiredString(record, key, issues);
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${key} must be an RFC3339 UTC timestamp`,
      path: key,
    });
    return undefined;
  }
  return value;
}

function readSafeString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
  pathPrefix: string,
  maxLength: number,
): string | undefined {
  const value = readRequiredString(record, key, issues, pathPrefix, {
    maxLength,
  });
  const path = pathPrefix.length === 0 ? key : `${pathPrefix}.${key}`;
  if (value !== undefined && !isRedactionSafeText(value)) {
    issues.push({
      code: "unsafe_content",
      message: `${path} must not contain raw secrets or internal payload markers`,
      path,
    });
    return undefined;
  }
  return value;
}

function readSafeStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): readonly string[] | undefined {
  const values = readRequiredStringArray(record, key, issues, "", true);
  if (values === undefined) {
    return undefined;
  }
  const safeValues: string[] = [];
  for (const [index, value] of values.entries()) {
    if (value.length > 1_000) {
      issues.push({
        code: "too_long",
        message: `${key}[${String(index)}] must not exceed 1000 characters`,
        path: `${key}[${String(index)}]`,
      });
      continue;
    }
    if (!isRedactionSafeText(value)) {
      issues.push({
        code: "unsafe_content",
        message: `${key}[${String(index)}] must not contain raw secrets or internal payload markers`,
        path: `${key}[${String(index)}]`,
      });
      continue;
    }
    safeValues.push(value);
  }
  return issues.some(({ path }) => path.startsWith(key))
    ? undefined
    : Object.freeze(safeValues);
}

function readEnumArray<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  issues: ValidationIssue[],
  allowEmpty: boolean,
): readonly T[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  if (!allowEmpty && value.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one value`,
      path,
    });
    return undefined;
  }

  const entries: T[] = [];
  const seen = new Set<T>();
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${String(index)}]`;
    const enumValue = readEnumValue(entry, entryPath, allowed, issues);
    if (enumValue === undefined) {
      continue;
    }
    if (seen.has(enumValue)) {
      issues.push({
        code: "duplicate",
        message: `${entryPath} must be unique`,
        path: entryPath,
      });
      continue;
    }
    seen.add(enumValue);
    entries.push(enumValue);
  }

  return issues.some(({ path: issuePath }) => issuePath.startsWith(path))
    ? undefined
    : Object.freeze(entries);
}

function readEnumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
  issues: ValidationIssue[],
): T | undefined {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_value",
      message: `${path} must be one of ${[...allowed].join(", ")}`,
      path,
    });
    return undefined;
  }
  return value as T;
}

function rejectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        code: "unknown_key",
        message: `${prependPath(pathPrefix, key)} is not supported`,
        path: prependPath(pathPrefix, key),
      });
    }
  }
}

function rejectSensitiveKeys(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
  pathPrefix: string,
): void {
  for (const key of Object.keys(record)) {
    if (SENSITIVE_FIELD_NAMES.has(key)) {
      issues.push({
        code: "unsafe_content",
        message: `${prependPath(pathPrefix, key)} is not allowed in guardian consultation contracts`,
        path: prependPath(pathPrefix, key),
      });
    }
  }
}

function isRedactionSafeText(value: string): boolean {
  return !SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function prependPath(prefix: string, path: string): string {
  if (prefix.length === 0) {
    return path;
  }
  if (path === "$") {
    return prefix;
  }
  return `${prefix}.${path}`;
}
