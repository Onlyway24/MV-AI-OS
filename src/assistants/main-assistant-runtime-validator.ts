import {
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
import {
  MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
  type MainAssistantInvocation,
  type MainAssistantInvocationIntent,
  type MainAssistantInvocationRiskLevel,
  type MainAssistantResult,
  type MainAssistantResultStatus,
  type MainAssistantRuntimeSafetyDecision,
  type MainAssistantSafetyPreflightContext,
} from "./main-assistant-runtime.js";

const INVOCATION_KEYS = new Set([
  "actorId",
  "assistantId",
  "contractVersion",
  "correlationId",
  "intent",
  "invocationId",
  "objective",
  "requestedAt",
  "requestedOperations",
  "requestedOutcome",
  "riskLevel",
  "safetyPreflight",
  "workspaceId",
]);

const SAFETY_PREFLIGHT_KEYS = new Set(["operatorSafetyReport"]);

const RESULT_KEYS = new Set([
  "actorId",
  "approvalRequired",
  "approvalsRequired",
  "assistantId",
  "blockers",
  "checkedSafetyDomains",
  "contractVersion",
  "correlationId",
  "generatedAt",
  "intent",
  "invocationId",
  "operatorSafetyStatus",
  "operatorSummary",
  "recommendedDelegations",
  "recommendedNextActions",
  "safetyDecision",
  "status",
  "workspaceId",
]);

const CONTRACT_VERSION = MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION;

const INVOCATION_INTENTS = new Set<MainAssistantInvocationIntent>([
  "coordinate",
  "decide",
  "plan",
  "review",
]);

const RISK_LEVELS = new Set<MainAssistantInvocationRiskLevel>([
  "normal",
  "risky",
  "sensitive",
]);

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

const RESULT_STATUSES = new Set<MainAssistantResultStatus>([
  "accepted",
  "attention_required",
  "blocked",
  "refused",
]);

const OPERATOR_SAFETY_STATUSES = new Set<
  MainAssistantResult["operatorSafetyStatus"]
>([
  "attention_required",
  "critical",
  "healthy",
  "missing",
  "unknown",
]);

const SAFETY_DECISIONS = new Set<MainAssistantRuntimeSafetyDecision>([
  "continue_with_attention",
  "do_not_increase_autonomy",
  "missing_operator_safety_report",
  "operator_confirmation_required",
  "safe_to_continue",
  "unknown",
  "unsafe_request_refused",
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

export class MainAssistantInvocationValidator
  implements Validator<MainAssistantInvocation>
{
  readonly #operatorSafetyReportValidator =
    new OperatorSafetyReportValidator();

  public validate(value: unknown): ValidationResult<MainAssistantInvocation> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant invocation must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, INVOCATION_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");

    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const invocationId = readIdentifier(record, "invocationId", issues);
    const correlationId = readIdentifier(record, "correlationId", issues);
    const workspaceId = readIdentifier(record, "workspaceId", issues);
    const actorId = readIdentifier(record, "actorId", issues);
    const requestedAt = readTimestamp(record, "requestedAt", issues);
    const intent = readEnumValue(
      record.intent,
      "intent",
      INVOCATION_INTENTS,
      issues,
    );
    const objective = readSafeString(record, "objective", issues, 2_000);
    const requestedOutcome = readSafeString(
      record,
      "requestedOutcome",
      issues,
      2_000,
    );
    const riskLevel = readEnumValue(
      record.riskLevel,
      "riskLevel",
      RISK_LEVELS,
      issues,
    );
    const requestedOperations = readEnumArray(
      record.requestedOperations,
      "requestedOperations",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const safetyPreflight = readSafetyPreflightContext(
      record.safetyPreflight,
      this.#operatorSafetyReportValidator,
      issues,
    );

    if (
      issues.length > 0 ||
      contractVersion !== CONTRACT_VERSION ||
      assistantId === undefined ||
      invocationId === undefined ||
      correlationId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      requestedAt === undefined ||
      intent === undefined ||
      objective === undefined ||
      requestedOutcome === undefined ||
      riskLevel === undefined ||
      requestedOperations === undefined ||
      safetyPreflight === false
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      assistantId,
      contractVersion,
      correlationId,
      intent,
      invocationId,
      objective,
      requestedAt,
      requestedOperations,
      requestedOutcome,
      riskLevel,
      ...(safetyPreflight === undefined ? {} : { safetyPreflight }),
      workspaceId,
    });
  }
}

export class MainAssistantResultValidator
  implements Validator<MainAssistantResult>
{
  public validate(value: unknown): ValidationResult<MainAssistantResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "main assistant result must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    rejectUnknownKeys(record, RESULT_KEYS, issues, "");
    rejectSensitiveKeys(record, issues, "");

    const contractVersion = readContractVersion(record, issues);
    const assistantId = readAssistantId(record, issues);
    const invocationId = readIdentifier(record, "invocationId", issues);
    const correlationId = readIdentifier(record, "correlationId", issues);
    const workspaceId = readIdentifier(record, "workspaceId", issues);
    const actorId = readIdentifier(record, "actorId", issues);
    const generatedAt = readTimestamp(record, "generatedAt", issues);
    const intent = readEnumValue(
      record.intent,
      "intent",
      INVOCATION_INTENTS,
      issues,
    );
    const status = readEnumValue(
      record.status,
      "status",
      RESULT_STATUSES,
      issues,
    );
    const operatorSafetyStatus = readEnumValue(
      record.operatorSafetyStatus,
      "operatorSafetyStatus",
      OPERATOR_SAFETY_STATUSES,
      issues,
    );
    const safetyDecision = readEnumValue(
      record.safetyDecision,
      "safetyDecision",
      SAFETY_DECISIONS,
      issues,
    );
    const operatorSummary = readSafeString(
      record,
      "operatorSummary",
      issues,
      1_000,
    );
    const blockers = readSafeStringArray(record, "blockers", issues);
    const approvalsRequired = readEnumArray(
      record.approvalsRequired,
      "approvalsRequired",
      ESCALATION_TYPES,
      issues,
      true,
    );
    const checkedSafetyDomains = readEnumArray(
      record.checkedSafetyDomains,
      "checkedSafetyDomains",
      SAFETY_DOMAINS,
      issues,
      true,
    );
    const recommendedDelegations = readSafeStringArray(
      record,
      "recommendedDelegations",
      issues,
    );
    const recommendedNextActions = readSafeStringArray(
      record,
      "recommendedNextActions",
      issues,
    );
    const approvalRequired = readBoolean(
      record.approvalRequired,
      "approvalRequired",
      issues,
    );

    if (
      approvalsRequired !== undefined &&
      approvalRequired !== undefined &&
      approvalRequired !== (approvalsRequired.length > 0)
    ) {
      issues.push({
        code: "inconsistent_value",
        message:
          "approvalRequired must match whether approvalsRequired contains entries",
        path: "approvalRequired",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== CONTRACT_VERSION ||
      assistantId === undefined ||
      invocationId === undefined ||
      correlationId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      generatedAt === undefined ||
      intent === undefined ||
      status === undefined ||
      operatorSafetyStatus === undefined ||
      safetyDecision === undefined ||
      operatorSummary === undefined ||
      blockers === undefined ||
      approvalsRequired === undefined ||
      checkedSafetyDomains === undefined ||
      recommendedDelegations === undefined ||
      recommendedNextActions === undefined ||
      approvalRequired === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      approvalRequired,
      approvalsRequired,
      assistantId,
      blockers,
      checkedSafetyDomains,
      contractVersion,
      correlationId,
      generatedAt,
      intent,
      invocationId,
      operatorSafetyStatus,
      operatorSummary,
      recommendedDelegations,
      recommendedNextActions,
      safetyDecision,
      status,
      workspaceId,
    });
  }
}

function readSafetyPreflightContext(
  value: unknown,
  operatorSafetyReportValidator: OperatorSafetyReportValidator,
  issues: ValidationIssue[],
): MainAssistantSafetyPreflightContext | false | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "safetyPreflight must be an object",
      path: "safetyPreflight",
    });
    return false;
  }

  rejectUnknownKeys(record, SAFETY_PREFLIGHT_KEYS, issues, "safetyPreflight");
  rejectSensitiveKeys(record, issues, "safetyPreflight");
  const operatorSafetyReport = record.operatorSafetyReport;
  if (operatorSafetyReport === undefined) {
    return {};
  }

  const validation =
    operatorSafetyReportValidator.validate(operatorSafetyReport);
  if (!validation.ok) {
    for (const issue of validation.issues) {
      issues.push({
        ...issue,
        path: prependPath("safetyPreflight.operatorSafetyReport", issue.path),
      });
    }
    return false;
  }

  return { operatorSafetyReport: validation.value };
}

function readContractVersion(
  record: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): typeof MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION | undefined {
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
  );
  if (
    contractVersion !== undefined &&
    contractVersion !== MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `contractVersion must be ${MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION}`,
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
): string | undefined {
  const value = readRequiredString(record, key, issues, "", {
    maxLength: 160,
  });
  if (value !== undefined && /\s/u.test(value)) {
    issues.push({
      code: "invalid_value",
      message: `${key} must not contain whitespace`,
      path: key,
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
  maxLength: number,
): string | undefined {
  const value = readRequiredString(record, key, issues, "", { maxLength });
  if (value !== undefined && !isRedactionSafeText(value)) {
    issues.push({
      code: "unsafe_content",
      message: `${key} must not contain raw secrets or internal payload markers`,
      path: key,
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

function readBoolean(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): boolean | undefined {
  if (typeof value !== "boolean") {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be a boolean`,
      path,
    });
    return undefined;
  }
  return value;
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
        message: `${prependPath(pathPrefix, key)} is not allowed in main assistant runtime contracts`,
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
