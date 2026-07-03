import {
  type AgentPolicyRequirement,
  type AgentPolicyRequirementType,
} from "./agent-policy-requirement.js";
import { isAgentSpecificationIdentifier } from "./agent-specification-validation.js";
import { isEffectivePermission } from "../../policy/effective-permissions.js";
import {
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

const POLICY_REQUIREMENT_TYPES = new Set<AgentPolicyRequirementType>([
  "approval",
  "audit",
  "data_scope",
]);

export class AgentPolicyRequirementValidator
  implements Validator<AgentPolicyRequirement>
{
  public validate(
    value: unknown,
  ): ValidationResult<AgentPolicyRequirement> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent policy requirement must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const requirementId = readRequiredString(
      record,
      "requirementId",
      issues,
    );
    const requirementType = readRequiredString(
      record,
      "requirementType",
      issues,
    );
    const permissions = readRequiredStringArray(
      record,
      "permissions",
      issues,
      "",
      false,
    );
    const rationale = readRequiredString(record, "rationale", issues);

    if (
      requirementId !== undefined &&
      !isAgentSpecificationIdentifier(requirementId)
    ) {
      issues.push({
        code: "invalid_format",
        message: "requirementId must be a lowercase identifier",
        path: "requirementId",
      });
    }
    if (
      requirementType !== undefined &&
      !POLICY_REQUIREMENT_TYPES.has(
        requirementType as AgentPolicyRequirementType,
      )
    ) {
      issues.push({
        code: "invalid_value",
        message: "requirementType is not supported",
        path: "requirementType",
      });
    }
    for (const [index, permission] of permissions?.entries() ?? []) {
      if (!isEffectivePermission(permission)) {
        issues.push({
          code: "invalid_value",
          message: "permissions contains an unsupported permission",
          path: `permissions[${String(index)}]`,
        });
      }
    }

    if (
      issues.length > 0 ||
      requirementId === undefined ||
      requirementType === undefined ||
      !POLICY_REQUIREMENT_TYPES.has(
        requirementType as AgentPolicyRequirementType,
      ) ||
      permissions?.every(isEffectivePermission) !== true ||
      rationale === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      permissions,
      rationale,
      requirementId,
      requirementType: requirementType as AgentPolicyRequirementType,
    });
  }
}
