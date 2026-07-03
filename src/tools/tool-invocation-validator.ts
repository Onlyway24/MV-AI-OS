import type {
  ToolApprovalMarker,
  ToolInvocation,
} from "./tool-invocation.js";
import {
  isToolAccessPermission,
  isToolIdentifier,
  prefixToolIssues,
} from "./tool-validation.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readAgentReference } from "../validation/agent-contract-readers.js";
import {
  readOptionalString,
  readRequiredInteger,
  readRequiredJsonObject,
  readRequiredString,
} from "../validation/field-readers.js";
import {
  asRecord,
  isRfc3339Timestamp,
  isSemanticVersion,
} from "../validation/primitives.js";
import { PolicyDecisionValidator } from "../validation/policy-decision-validator.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class ToolInvocationValidator implements Validator<ToolInvocation> {
  readonly #policyDecisionValidator = new PolicyDecisionValidator();

  public validate(value: unknown): ValidationResult<ToolInvocation> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "tool invocation must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const toolInvocationId = readRequiredString(
      record,
      "toolInvocationId",
      issues,
    );
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const taskId = readRequiredString(record, "taskId", issues);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const agent = readAgentReference(record.agent, "agent", issues);
    const toolId = readRequiredString(record, "toolId", issues);
    const toolVersion = readRequiredString(
      record,
      "toolVersion",
      issues,
    );
    const input = readRequiredJsonObject(record, "input", issues);
    const timeoutMs = readRequiredInteger(
      record,
      "timeoutMs",
      issues,
      "",
      1,
    );
    const idempotencyKey = readOptionalString(
      record,
      "idempotencyKey",
      issues,
    );
    const approvals = readApprovals(record.approvals, issues);
    const policyDecisionValidation =
      this.#policyDecisionValidator.validate(record.policyDecision);
    if (!policyDecisionValidation.ok) {
      issues.push(
        ...prefixToolIssues(
          policyDecisionValidation.issues,
          "policyDecision",
        ),
      );
    }
    const requestedAt = readRequiredString(
      record,
      "requestedAt",
      issues,
    );

    if (
      contractVersion !== undefined &&
      contractVersion !== REQUEST_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (toolId !== undefined && !isToolIdentifier(toolId)) {
      issues.push({
        code: "invalid_format",
        message: "toolId must be a lowercase identifier",
        path: "toolId",
      });
    }
    if (
      toolVersion !== undefined &&
      !isSemanticVersion(toolVersion)
    ) {
      issues.push({
        code: "invalid_format",
        message: "toolVersion must use semantic versioning",
        path: "toolVersion",
      });
    }
    if (requestedAt !== undefined && !isRfc3339Timestamp(requestedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "requestedAt must be a UTC RFC 3339 timestamp",
        path: "requestedAt",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      toolInvocationId === undefined ||
      correlationId === undefined ||
      taskId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      agent === undefined ||
      toolId === undefined ||
      toolVersion === undefined ||
      input === undefined ||
      timeoutMs === undefined ||
      approvals === undefined ||
      !policyDecisionValidation.ok ||
      requestedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      agent,
      approvals,
      contractVersion,
      correlationId,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      input,
      policyDecision: policyDecisionValidation.value,
      requestedAt,
      taskId,
      timeoutMs,
      toolId,
      toolInvocationId,
      toolVersion,
      workspaceId,
    });
  }
}

function readApprovals(
  value: unknown,
  issues: ValidationIssue[],
): readonly ToolApprovalMarker[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "approvals must be an array",
      path: "approvals",
    });
    return undefined;
  }

  const approvals: ToolApprovalMarker[] = [];
  for (const [index, candidate] of value.entries()) {
    const path = `approvals[${String(index)}]`;
    const record = asRecord(candidate);
    if (record === undefined) {
      issues.push({
        code: "invalid_type",
        message: `${path} must be an object`,
        path,
      });
      continue;
    }
    const approvalId = readRequiredString(
      record,
      "approvalId",
      issues,
      path,
    );
    const permission = readRequiredString(
      record,
      "permission",
      issues,
      path,
    );
    if (
      permission !== undefined &&
      !isToolAccessPermission(permission)
    ) {
      issues.push({
        code: "invalid_value",
        message: `${path}.permission must be a tool permission`,
        path: `${path}.permission`,
      });
    }
    if (
      approvalId !== undefined &&
      permission !== undefined &&
      isToolAccessPermission(permission)
    ) {
      approvals.push({ approvalId, permission });
    }
  }
  const permissions = approvals.map(({ permission }) => permission);
  if (new Set(permissions).size !== permissions.length) {
    issues.push({
      code: "duplicate",
      message: "approvals must not repeat a permission",
      path: "approvals",
    });
  }
  return approvals;
}
