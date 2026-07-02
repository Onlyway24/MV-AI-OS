import type { PolicyDecision } from "../policy/policy-decision.js";
import type { EffectivePermission } from "../policy/effective-permissions.js";
import { isEffectivePermission } from "../policy/effective-permissions.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readAgentReference } from "./agent-contract-readers.js";
import {
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

export class PolicyDecisionValidator implements Validator<PolicyDecision> {
  public validate(value: unknown): ValidationResult<PolicyDecision> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "policy decision must be an object",
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
    const decisionId = readRequiredString(record, "decisionId", issues);
    const taskId = readRequiredString(record, "taskId", issues);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const agent = readAgentReference(record.agent, "agent", issues);
    const requestedPermissions = readPermissions(
      record,
      "requestedPermissions",
      issues,
    );
    const effectivePermissions = readPermissions(
      record,
      "effectivePermissions",
      issues,
    );
    const deniedPermissions = readPermissions(
      record,
      "deniedPermissions",
      issues,
    );
    const evaluatedAt = readRequiredString(record, "evaluatedAt", issues);

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
    if (evaluatedAt !== undefined && !isRfc3339Timestamp(evaluatedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "evaluatedAt must be a UTC RFC 3339 timestamp",
        path: "evaluatedAt",
      });
    }
    if (
      requestedPermissions !== undefined &&
      effectivePermissions !== undefined &&
      deniedPermissions !== undefined
    ) {
      validatePartition(
        requestedPermissions,
        effectivePermissions,
        deniedPermissions,
        issues,
      );
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      decisionId === undefined ||
      taskId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      agent === undefined ||
      requestedPermissions === undefined ||
      effectivePermissions === undefined ||
      deniedPermissions === undefined ||
      evaluatedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      agent,
      contractVersion,
      decisionId,
      deniedPermissions,
      effectivePermissions,
      evaluatedAt,
      requestedPermissions,
      taskId,
      workspaceId,
    });
  }
}

function readPermissions(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): readonly EffectivePermission[] | undefined {
  const permissions = readRequiredStringArray(record, key, issues);
  if (permissions === undefined) {
    return undefined;
  }

  for (const [index, permission] of permissions.entries()) {
    if (!isEffectivePermission(permission)) {
      issues.push({
        code: "invalid_value",
        message: `${key} contains an unsupported permission`,
        path: `${key}[${String(index)}]`,
      });
    }
  }
  if (
    permissions.some(
      (permission, index) =>
        index > 0 &&
        (permissions[index - 1] ?? permission) >= permission,
    )
  ) {
    issues.push({
      code: "invalid_order",
      message: `${key} must be sorted in ascending order`,
      path: key,
    });
  }

  return permissions.every(isEffectivePermission)
    ? permissions
    : undefined;
}

function validatePartition(
  requested: readonly EffectivePermission[],
  effective: readonly EffectivePermission[],
  denied: readonly EffectivePermission[],
  issues: ValidationIssue[],
): void {
  const requestedSet = new Set(requested);
  const effectiveSet = new Set(effective);
  const deniedSet = new Set(denied);

  if (effective.some((permission) => deniedSet.has(permission))) {
    issues.push({
      code: "overlap",
      message: "effectivePermissions and deniedPermissions must not overlap",
      path: "effectivePermissions",
    });
  }
  if (
    effective.some((permission) => !requestedSet.has(permission)) ||
    denied.some((permission) => !requestedSet.has(permission)) ||
    requested.some(
      (permission) =>
        !effectiveSet.has(permission) && !deniedSet.has(permission),
    )
  ) {
    issues.push({
      code: "invalid_partition",
      message:
        "effectivePermissions and deniedPermissions must partition requestedPermissions",
      path: "requestedPermissions",
    });
  }
}
