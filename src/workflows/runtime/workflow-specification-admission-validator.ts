import {
  readRequiredBoolean,
  readRequiredString,
} from "../../validation/field-readers.js";
import {
  asRecord,
  isSemanticVersion,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import {
  isWorkflowIdentifier,
} from "../specification/workflow-specification-validation.js";
import { isSpecificationFingerprint } from "../specification/specification-fingerprint.js";
import {
  WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION,
  freezeWorkflowSpecificationAdmissionValue,
  type WorkflowSpecificationAdmissionRequest,
  type WorkflowSpecificationAdmissionResult,
} from "./workflow-specification-admission.js";
import type { WorkflowAgentSpecificationAttribution } from "./workflow-runtime.js";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9@._:-]*$/u;
const RUNTIME_ID_PATTERN = /^[a-z0-9][a-z0-9@._-]*$/u;
const MAX_ID_LENGTH = 128;
const MAX_AGENT_SPECIFICATION_ATTRIBUTIONS = 100;
const SENSITIVE_ID_PATTERN = /(?:secret|token|password|api[_-]?key|sk-[a-z0-9])/iu;
const ADMISSION_OUTCOMES = new Set(["ADMITTED", "REPLAYED"]);

export class WorkflowSpecificationAdmissionRequestValidator
  implements Validator<WorkflowSpecificationAdmissionRequest>
{
  public validate(
    value: unknown,
  ): ValidationResult<WorkflowSpecificationAdmissionRequest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow admission request must be an object", "$"),
      ]);
    }
    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "admissionId",
        "actorId",
        "workspaceId",
        "workflowId",
        "workflowVersion",
        "instanceId",
        "nonExecuting",
      ],
      issues,
    );
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const admissionId = readRequiredString(record, "admissionId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const workflowId = readRequiredString(record, "workflowId", issues);
    const workflowVersion = readRequiredString(
      record,
      "workflowVersion",
      issues,
    );
    const instanceId = readRequiredString(record, "instanceId", issues);
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);

    if (contractVersion !== WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION) {
      issues.push(
        issue(
          "unsupported_version",
          "workflow admission contractVersion is invalid",
          "contractVersion",
        ),
      );
    }
    for (const [path, candidate] of [
      ["admissionId", admissionId],
      ["actorId", actorId],
      ["workspaceId", workspaceId],
      ["instanceId", instanceId],
    ] as const) {
      if (!isSafeId(candidate)) {
        issues.push(issue("invalid_format", `${path} is invalid`, path));
      }
    }
    if (workflowId !== undefined && !isWorkflowIdentifier(workflowId)) {
      issues.push(
        issue("invalid_format", "workflowId is invalid", "workflowId"),
      );
    }
    if (!isRuntimeId(instanceId)) {
      issues.push(
        issue("invalid_format", "instanceId is invalid", "instanceId"),
      );
    }
    if (
      workflowVersion !== undefined &&
      !isSemanticVersion(workflowVersion)
    ) {
      issues.push(
        issue(
          "invalid_format",
          "workflowVersion must use semantic versioning",
          "workflowVersion",
        ),
      );
    }
    if (nonExecuting !== true) {
      issues.push(
        issue(
          "unsafe_execution",
          "workflow admission must be non-executing",
          "nonExecuting",
        ),
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION ||
      admissionId === undefined ||
      actorId === undefined ||
      workspaceId === undefined ||
      workflowId === undefined ||
      workflowVersion === undefined ||
      instanceId === undefined ||
      nonExecuting !== true
    ) {
      return validationFailure(issues);
    }
    return validationSuccess(
      freezeWorkflowSpecificationAdmissionValue({
        actorId,
        admissionId,
        contractVersion,
        instanceId,
        nonExecuting,
        workflowId,
        workflowVersion,
        workspaceId,
      }),
    );
  }
}

export class WorkflowSpecificationAdmissionResultValidator
  implements Validator<WorkflowSpecificationAdmissionResult>
{
  public validate(
    value: unknown,
  ): ValidationResult<WorkflowSpecificationAdmissionResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        issue("invalid_type", "workflow admission result must be an object", "$"),
      ]);
    }
    const issues: ValidationIssue[] = [];
    assertOnlyKnownKeys(
      record,
      [
        "contractVersion",
        "admissionId",
        "auditEventId",
        "definitionId",
        "instanceId",
        "workflowId",
        "workflowVersion",
        "specificationFingerprint",
        "agentSpecifications",
        "outcome",
        "nonExecuting",
        "externalEffectsAllowed",
      ],
      issues,
    );
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const admissionId = readRequiredString(record, "admissionId", issues);
    const auditEventId = readRequiredString(record, "auditEventId", issues);
    const definitionId = readRequiredString(record, "definitionId", issues);
    const instanceId = readRequiredString(record, "instanceId", issues);
    const workflowId = readRequiredString(record, "workflowId", issues);
    const workflowVersion = readRequiredString(
      record,
      "workflowVersion",
      issues,
    );
    const outcome = readRequiredString(record, "outcome", issues);
    const nonExecuting = readRequiredBoolean(record, "nonExecuting", issues);
    const externalEffectsAllowed = readRequiredBoolean(
      record,
      "externalEffectsAllowed",
      issues,
    );
    const agentSpecifications = readAttributions(
      record.agentSpecifications,
      issues,
    );

    if (contractVersion !== WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION) {
      issues.push(
        issue(
          "unsupported_version",
          "workflow admission result contractVersion is invalid",
          "contractVersion",
        ),
      );
    }

    for (const [path, candidate] of [
      ["admissionId", admissionId],
      ["auditEventId", auditEventId],
      ["definitionId", definitionId],
      ["instanceId", instanceId],
    ] as const) {
      if (!isSafeId(candidate)) {
        issues.push(issue("invalid_format", `${path} is invalid`, path));
      }
    }
    if (workflowId !== undefined && !isWorkflowIdentifier(workflowId)) {
      issues.push(issue("invalid_format", "workflowId is invalid", "workflowId"));
    }
    if (!isRuntimeId(instanceId)) {
      issues.push(
        issue("invalid_format", "instanceId is invalid", "instanceId"),
      );
    }
    if (
      definitionId !== undefined &&
      workflowId !== undefined &&
      workflowVersion !== undefined &&
      definitionId !== `${workflowId}@${workflowVersion}`
    ) {
      issues.push(
        issue(
          "identity_mismatch",
          "definitionId must match the exact workflow identity",
          "definitionId",
        ),
      );
    }
    if (
      workflowVersion !== undefined &&
      !isSemanticVersion(workflowVersion)
    ) {
      issues.push(
        issue(
          "invalid_format",
          "workflowVersion must use semantic versioning",
          "workflowVersion",
        ),
      );
    }
    if (!isSpecificationFingerprint(record.specificationFingerprint)) {
      issues.push(
        issue(
          "invalid_format",
          "specificationFingerprint is invalid",
          "specificationFingerprint",
        ),
      );
    }
    if (typeof outcome !== "string" || !ADMISSION_OUTCOMES.has(outcome)) {
      issues.push(issue("invalid_value", "outcome is invalid", "outcome"));
    }
    if (nonExecuting !== true || externalEffectsAllowed !== false) {
      issues.push(
        issue(
          "unsafe_execution",
          "workflow admission result cannot allow execution",
          "externalEffectsAllowed",
        ),
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION ||
      admissionId === undefined ||
      auditEventId === undefined ||
      definitionId === undefined ||
      instanceId === undefined ||
      workflowId === undefined ||
      workflowVersion === undefined ||
      !isSpecificationFingerprint(record.specificationFingerprint) ||
      agentSpecifications === undefined ||
      typeof outcome !== "string" ||
      !ADMISSION_OUTCOMES.has(outcome) ||
      nonExecuting !== true ||
      externalEffectsAllowed !== false
    ) {
      return validationFailure(issues);
    }
    return validationSuccess(
      freezeWorkflowSpecificationAdmissionValue({
        admissionId,
        agentSpecifications,
        auditEventId,
        contractVersion,
        definitionId,
        externalEffectsAllowed,
        instanceId,
        nonExecuting,
        outcome: outcome as "ADMITTED" | "REPLAYED",
        specificationFingerprint: record.specificationFingerprint,
        workflowId,
        workflowVersion,
      }),
    );
  }
}

function readAttributions(
  value: unknown,
  issues: ValidationIssue[],
): readonly WorkflowAgentSpecificationAttribution[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_AGENT_SPECIFICATION_ATTRIBUTIONS
  ) {
    issues.push(
      issue(
        "invalid_type",
        "agentSpecifications must be a non-empty array",
        "agentSpecifications",
      ),
    );
    return undefined;
  }
  const result: WorkflowAgentSpecificationAttribution[] = [];
  for (const [index, candidate] of value.entries()) {
    const path = `agentSpecifications[${String(index)}]`;
    const record = asRecord(candidate);
    if (record === undefined) {
      issues.push(issue("invalid_type", "agent attribution must be an object", path));
      continue;
    }
    assertOnlyKnownKeys(record, ["agentId", "version", "fingerprint"], issues, path);
    const agentId = readRequiredString(record, "agentId", issues, path);
    const version = readRequiredString(record, "version", issues, path);
    if (!isRuntimeId(agentId)) {
      issues.push(issue("invalid_format", "agentId is invalid", `${path}.agentId`));
    }
    if (version !== undefined && !isSemanticVersion(version)) {
      issues.push(
        issue("invalid_format", "agent version must be semantic", `${path}.version`),
      );
    }
    if (!isSpecificationFingerprint(record.fingerprint)) {
      issues.push(
        issue("invalid_format", "agent fingerprint is invalid", `${path}.fingerprint`),
      );
    }
    if (
      agentId !== undefined &&
      version !== undefined &&
      isSpecificationFingerprint(record.fingerprint)
    ) {
      result.push({ agentId, fingerprint: record.fingerprint, version });
    }
  }
  const keys = result.map(({ agentId, version }) => `${agentId}@${version}`);
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key, index) => index > 0 && key <= (keys[index - 1] ?? ""))
  ) {
    issues.push(
      issue(
        "invalid_value",
        "agentSpecifications must be unique and sorted",
        "agentSpecifications",
      ),
    );
  }
  return result;
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    SAFE_ID_PATTERN.test(value) &&
    !SENSITIVE_ID_PATTERN.test(value)
  );
}

function isRuntimeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    RUNTIME_ID_PATTERN.test(value) &&
    !SENSITIVE_ID_PATTERN.test(value)
  );
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  issues: ValidationIssue[],
  prefix = "",
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      issues.push(
        issue(
          "unknown_field",
          "unknown fields are not allowed",
          prefix.length === 0 ? key : `${prefix}.${key}`,
        ),
      );
    }
  }
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path };
}
