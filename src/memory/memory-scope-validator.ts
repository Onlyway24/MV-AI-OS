import type {
  MemoryReadPermission,
  MemoryScope,
} from "./memory-scope.js";
import { isMemoryReadPermission } from "./memory-scope.js";
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

export class MemoryScopeValidator implements Validator<MemoryScope> {
  public validate(value: unknown): ValidationResult<MemoryScope> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "memory scope must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const taskId = readOptionalString(record, "taskId", issues);
    const sessionId = readOptionalString(record, "sessionId", issues);
    const agentId = readOptionalString(record, "agentId", issues);
    const permissions = readRequiredStringArray(
      record,
      "permissions",
      issues,
    );
    const permissionTags = readRequiredStringArray(
      record,
      "permissionTags",
      issues,
    );

    if (permissions !== undefined) {
      for (const [index, permission] of permissions.entries()) {
        if (!isMemoryReadPermission(permission)) {
          issues.push({
            code: "invalid_value",
            message: "permissions contains an unsupported memory permission",
            path: `permissions[${String(index)}]`,
          });
        }
      }
    }

    if (
      issues.length > 0 ||
      workspaceId === undefined ||
      actorId === undefined ||
      permissions === undefined ||
      permissionTags === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      ...(agentId === undefined ? {} : { agentId }),
      actorId,
      permissions: permissions as readonly MemoryReadPermission[],
      permissionTags,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(taskId === undefined ? {} : { taskId }),
      workspaceId,
    });
  }
}
