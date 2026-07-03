import {
  type AgentCapability,
  type AgentCapabilityType,
} from "./agent-capability.js";
import { isAgentSpecificationIdentifier } from "./agent-specification-validation.js";
import {
  isEffectivePermission,
  type EffectivePermission,
} from "../../policy/effective-permissions.js";
import {
  readRequiredBoolean,
  readRequiredString,
  readRequiredStringArray,
} from "../../validation/field-readers.js";
import { asRecord } from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

const CAPABILITY_TYPES = new Set<AgentCapabilityType>([
  "knowledge.search",
  "memory.read",
  "memory.write.proposal",
  "model.invoke",
  "tool.execute",
  "tool.read",
  "workflow.propose",
]);

export class AgentCapabilityValidator
  implements Validator<AgentCapability>
{
  public validate(value: unknown): ValidationResult<AgentCapability> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent capability must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const capabilityId = readRequiredString(
      record,
      "capabilityId",
      issues,
    );
    const capabilityType = readRequiredString(
      record,
      "capabilityType",
      issues,
    );
    const permission = readRequiredString(record, "permission", issues);
    const required = readRequiredBoolean(record, "required", issues);
    const description = readRequiredString(
      record,
      "description",
      issues,
    );
    const scopes =
      record.scopes === undefined
        ? undefined
        : readRequiredStringArray(
            record,
            "scopes",
            issues,
            "",
            false,
          );

    if (
      capabilityId !== undefined &&
      !isAgentSpecificationIdentifier(capabilityId)
    ) {
      issues.push({
        code: "invalid_format",
        message: "capabilityId must be a lowercase identifier",
        path: "capabilityId",
      });
    }
    if (
      capabilityType !== undefined &&
      !CAPABILITY_TYPES.has(capabilityType as AgentCapabilityType)
    ) {
      issues.push({
        code: "invalid_value",
        message: "capabilityType is not supported",
        path: "capabilityType",
      });
    }
    if (
      permission !== undefined &&
      !isEffectivePermission(permission)
    ) {
      issues.push({
        code: "invalid_value",
        message: "permission is not supported",
        path: "permission",
      });
    }
    if (
      capabilityType !== undefined &&
      CAPABILITY_TYPES.has(capabilityType as AgentCapabilityType) &&
      permission !== undefined &&
      isEffectivePermission(permission) &&
      !permissionMatchesCapability(
        capabilityType as AgentCapabilityType,
        permission,
      )
    ) {
      issues.push({
        code: "permission_mismatch",
        message: "permission does not match capabilityType",
        path: "permission",
      });
    }
    if (capabilityType === "knowledge.search" && scopes === undefined) {
      issues.push({
        code: "required",
        message: "scopes is required for knowledge.search",
        path: "scopes",
      });
    }
    if (
      capabilityType === "knowledge.search" &&
      scopes?.includes("none") === true
    ) {
      issues.push({
        code: "invalid_value",
        message: "knowledge.search scopes must not contain none",
        path: "scopes",
      });
    }
    if (
      capabilityType !== undefined &&
      capabilityType !== "knowledge.search" &&
      scopes !== undefined
    ) {
      issues.push({
        code: "forbidden",
        message: "scopes is only allowed for knowledge.search",
        path: "scopes",
      });
    }

    if (
      issues.length > 0 ||
      capabilityId === undefined ||
      capabilityType === undefined ||
      !CAPABILITY_TYPES.has(capabilityType as AgentCapabilityType) ||
      permission === undefined ||
      !isEffectivePermission(permission) ||
      required === undefined ||
      description === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      capabilityId,
      capabilityType: capabilityType as AgentCapabilityType,
      description,
      permission,
      required,
      ...(scopes === undefined ? {} : { scopes }),
    });
  }
}

function permissionMatchesCapability(
  capabilityType: AgentCapabilityType,
  permission: EffectivePermission,
): boolean {
  switch (capabilityType) {
    case "knowledge.search":
      return permission === "knowledge:search";
    case "memory.read":
      return permission.startsWith("memory:read:");
    case "memory.write.proposal":
      return permission === "memory:write:proposal";
    case "model.invoke":
      return permission.startsWith("model:invoke:");
    case "tool.execute":
      return permission.startsWith("tool:execute:");
    case "tool.read":
      return permission.startsWith("tool:read:");
    case "workflow.propose":
      return permission.startsWith("workflow:propose:");
  }
}
