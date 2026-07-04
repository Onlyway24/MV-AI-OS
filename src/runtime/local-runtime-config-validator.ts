import {
  LOCAL_RUNTIME_CONTRACT_VERSION,
  type LocalContentAgentMode,
  type LocalRuntimeConfig,
  type LocalRuntimePermissionConfig,
} from "./local-runtime-config.js";
import { SqliteConnectionConfigValidator } from "../persistence/sqlite/sqlite-connection-config.js";
import {
  isEffectivePermission,
  type EffectivePermission,
} from "../policy/effective-permissions.js";
import {
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

const CONTENT_AGENT_MODES = new Set<LocalContentAgentMode>([
  "deterministic",
  "model-backed-deterministic",
]);

export class LocalRuntimeConfigValidator
  implements Validator<LocalRuntimeConfig>
{
  readonly #sqliteValidator = new SqliteConnectionConfigValidator();

  public validate(value: unknown): ValidationResult<LocalRuntimeConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "local runtime configuration must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const actorId = readRequiredString(record, "actorId", issues);
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const contentAgentMode = readRequiredString(
      record,
      "contentAgentMode",
      issues,
    );
    const permissions = readPermissions(record.permissions, issues);
    const sqliteValidation = this.#sqliteValidator.validate(record.sqlite);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    if (!sqliteValidation.ok) {
      issues.push(
        ...sqliteValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "sqlite" : `sqlite.${path}`,
        })),
      );
    }

    if (
      contractVersion !== undefined &&
      contractVersion !== LOCAL_RUNTIME_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${LOCAL_RUNTIME_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (
      contentAgentMode !== undefined &&
      !CONTENT_AGENT_MODES.has(contentAgentMode as LocalContentAgentMode)
    ) {
      issues.push({
        code: "invalid_value",
        message: "contentAgentMode is not supported",
        path: "contentAgentMode",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== LOCAL_RUNTIME_CONTRACT_VERSION ||
      actorId === undefined ||
      contentAgentMode === undefined ||
      !CONTENT_AGENT_MODES.has(
        contentAgentMode as LocalContentAgentMode,
      ) ||
      permissions === undefined ||
      !sqliteValidation.ok ||
      workspaceId === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      contentAgentMode: contentAgentMode as LocalContentAgentMode,
      contractVersion,
      permissions,
      sqlite: sqliteValidation.value,
      workspaceId,
    });
  }
}

function readPermissions(
  value: unknown,
  issues: ValidationIssue[],
): LocalRuntimePermissionConfig | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "permissions must be an object",
      path: "permissions",
    });
    return undefined;
  }

  const actorGrants = readPermissionArray(
    record,
    "actorGrants",
    issues,
  );
  const policyGrants = readPermissionArray(
    record,
    "policyGrants",
    issues,
  );
  const taskGrants = readPermissionArray(
    record,
    "taskGrants",
    issues,
  );
  if (
    actorGrants === undefined ||
    policyGrants === undefined ||
    taskGrants === undefined
  ) {
    return undefined;
  }
  return {
    actorGrants,
    policyGrants,
    taskGrants,
  };
}

function readPermissionArray(
  record: Readonly<Record<string, unknown>>,
  key: keyof LocalRuntimePermissionConfig,
  issues: ValidationIssue[],
): readonly EffectivePermission[] | undefined {
  const values = readRequiredStringArray(
    record,
    key,
    issues,
    "permissions",
  );
  if (values === undefined) {
    return undefined;
  }
  let valid = true;
  for (const [index, permission] of values.entries()) {
    if (!isEffectivePermission(permission)) {
      valid = false;
      issues.push({
        code: "invalid_value",
        message: `${key} contains an unsupported permission`,
        path: `permissions.${key}[${String(index)}]`,
      });
    }
  }
  return valid
    ? (values as readonly EffectivePermission[])
    : undefined;
}
