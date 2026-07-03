import type { KnowledgeScope } from "./knowledge-scope.js";
import { isEffectivePermission } from "../policy/effective-permissions.js";
import {
  readOptionalString,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class KnowledgeScopeValidator implements Validator<KnowledgeScope> {
  public validate(value: unknown): ValidationResult<KnowledgeScope> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "knowledge scope must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const taskId = readRequiredString(record, "taskId", issues);
    const agentId = readOptionalString(record, "agentId", issues);
    const allowedScopes = readRequiredStringArray(
      record,
      "allowedScopes",
      issues,
    );
    const permissionTags = readRequiredStringArray(
      record,
      "permissionTags",
      issues,
    );
    const effectivePermissions = readRequiredStringArray(
      record,
      "effectivePermissions",
      issues,
    );

    for (const [index, permission] of effectivePermissions?.entries() ?? []) {
      if (!isEffectivePermission(permission)) {
        issues.push({
          code: "invalid_value",
          message:
            "effectivePermissions contains an unsupported permission",
          path: `effectivePermissions[${String(index)}]`,
        });
      }
    }

    if (
      issues.length > 0 ||
      workspaceId === undefined ||
      actorId === undefined ||
      taskId === undefined ||
      allowedScopes === undefined ||
      permissionTags === undefined ||
      effectivePermissions?.every(isEffectivePermission) !== true
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      ...(agentId === undefined ? {} : { agentId }),
      actorId,
      allowedScopes,
      effectivePermissions,
      permissionTags,
      taskId,
      workspaceId,
    });
  }
}
