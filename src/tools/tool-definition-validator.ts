import {
  TOOL_DEFINITION_SCHEMA_VERSION,
  type ToolDefinition,
  type ToolIdempotency,
  type ToolSideEffect,
} from "./tool-definition.js";
import type { ToolPermission } from "./tool-permission.js";
import { ToolPermissionValidator } from "./tool-permission-validator.js";
import type { ToolRiskLevel } from "./tool-risk-level.js";
import { ToolRiskLevelValidator } from "./tool-risk-level-validator.js";
import {
  isToolIdentifier,
  prefixToolIssues,
  toolIdFromPermission,
} from "./tool-validation.js";
import {
  readRequiredInteger,
  readRequiredJsonObject,
  readRequiredString,
} from "../validation/field-readers.js";
import {
  asRecord,
  isSemanticVersion,
} from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const MAX_TOOL_TIMEOUT_MS = 300_000;
const SIDE_EFFECTS = new Set<ToolSideEffect>([
  "read_only",
  "side_effecting",
]);
const IDEMPOTENCY_MODES = new Set<ToolIdempotency>([
  "not_required",
  "required",
]);

export class ToolDefinitionValidator implements Validator<ToolDefinition> {
  readonly #permissionValidator = new ToolPermissionValidator();
  readonly #riskLevelValidator = new ToolRiskLevelValidator();

  public validate(value: unknown): ValidationResult<ToolDefinition> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "tool definition must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const toolId = readRequiredString(record, "toolId", issues);
    const version = readRequiredString(record, "version", issues);
    const name = readRequiredString(record, "name", issues);
    const description = readRequiredString(
      record,
      "description",
      issues,
    );
    const inputSchema = readRequiredJsonObject(
      record,
      "inputSchema",
      issues,
    );
    const outputSchema = readRequiredJsonObject(
      record,
      "outputSchema",
      issues,
    );
    const sideEffect = readRequiredString(record, "sideEffect", issues);
    const riskValidation = this.#riskLevelValidator.validate(
      record.riskLevel,
    );
    if (!riskValidation.ok) {
      issues.push(...prefixToolIssues(riskValidation.issues, "riskLevel"));
    }
    const timeoutMs = readRequiredInteger(
      record,
      "timeoutMs",
      issues,
      "",
      1,
    );
    const idempotency = readRequiredString(
      record,
      "idempotency",
      issues,
    );
    const requiredPermissions = this.#readPermissions(
      record.requiredPermissions,
      issues,
    );

    validateIdentity(schemaVersion, toolId, version, issues);
    validateSchema(inputSchema, "inputSchema", issues);
    validateSchema(outputSchema, "outputSchema", issues);
    validateEnum(
      sideEffect,
      SIDE_EFFECTS,
      "sideEffect",
      issues,
    );
    validateEnum(
      idempotency,
      IDEMPOTENCY_MODES,
      "idempotency",
      issues,
    );
    if (timeoutMs !== undefined && timeoutMs > MAX_TOOL_TIMEOUT_MS) {
      issues.push({
        code: "too_large",
        message: `timeoutMs must not exceed ${String(MAX_TOOL_TIMEOUT_MS)}`,
        path: "timeoutMs",
      });
    }
    if (
      toolId !== undefined &&
      sideEffect !== undefined &&
      SIDE_EFFECTS.has(sideEffect as ToolSideEffect) &&
      idempotency !== undefined &&
      IDEMPOTENCY_MODES.has(idempotency as ToolIdempotency) &&
      requiredPermissions !== undefined &&
      riskValidation.ok
    ) {
      validateSecurityClassification(
        toolId,
        sideEffect as ToolSideEffect,
        riskValidation.value,
        idempotency as ToolIdempotency,
        requiredPermissions,
        issues,
      );
    }

    if (
      issues.length > 0 ||
      schemaVersion !== TOOL_DEFINITION_SCHEMA_VERSION ||
      toolId === undefined ||
      version === undefined ||
      name === undefined ||
      description === undefined ||
      inputSchema === undefined ||
      outputSchema === undefined ||
      sideEffect === undefined ||
      !SIDE_EFFECTS.has(sideEffect as ToolSideEffect) ||
      !riskValidation.ok ||
      timeoutMs === undefined ||
      idempotency === undefined ||
      !IDEMPOTENCY_MODES.has(idempotency as ToolIdempotency) ||
      requiredPermissions === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      description,
      idempotency: idempotency as ToolIdempotency,
      inputSchema,
      name,
      outputSchema,
      requiredPermissions,
      riskLevel: riskValidation.value,
      schemaVersion,
      sideEffect: sideEffect as ToolSideEffect,
      timeoutMs,
      toolId,
      version,
    });
  }

  #readPermissions(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly ToolPermission[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "requiredPermissions must be an array",
        path: "requiredPermissions",
      });
      return undefined;
    }
    if (value.length === 0) {
      issues.push({
        code: "empty",
        message: "requiredPermissions must contain at least one permission",
        path: "requiredPermissions",
      });
    }

    const permissions: ToolPermission[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation = this.#permissionValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixToolIssues(
            validation.issues,
            `requiredPermissions[${String(index)}]`,
          ),
        );
        continue;
      }
      permissions.push(validation.value);
    }
    const permissionNames = permissions.map(
      ({ permission }) => permission,
    );
    if (new Set(permissionNames).size !== permissionNames.length) {
      issues.push({
        code: "duplicate",
        message: "requiredPermissions must not contain duplicates",
        path: "requiredPermissions",
      });
    }
    if (
      permissionNames.some(
        (permission, index) =>
          index > 0 &&
          (permissionNames[index - 1] ?? permission) >= permission,
      )
    ) {
      issues.push({
        code: "invalid_order",
        message: "requiredPermissions must be sorted by permission",
        path: "requiredPermissions",
      });
    }
    return permissions;
  }
}

function validateIdentity(
  schemaVersion: string | undefined,
  toolId: string | undefined,
  version: string | undefined,
  issues: ValidationIssue[],
): void {
  if (
    schemaVersion !== undefined &&
    schemaVersion !== TOOL_DEFINITION_SCHEMA_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `schemaVersion must be ${TOOL_DEFINITION_SCHEMA_VERSION}`,
      path: "schemaVersion",
    });
  }
  if (toolId !== undefined && !isToolIdentifier(toolId)) {
    issues.push({
      code: "invalid_format",
      message: "toolId must be a lowercase identifier",
      path: "toolId",
    });
  }
  if (version !== undefined && !isSemanticVersion(version)) {
    issues.push({
      code: "invalid_format",
      message: "version must use semantic versioning",
      path: "version",
    });
  }
}

function validateSchema(
  schema: Readonly<Record<string, unknown>> | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (schema !== undefined && schema.type !== "object") {
    issues.push({
      code: "invalid_value",
      message: `${path}.type must be object`,
      path: `${path}.type`,
    });
  }
}

function validateEnum<T extends string>(
  value: string | undefined,
  values: ReadonlySet<T>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !values.has(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${path} is not supported`,
      path,
    });
  }
}

function validateSecurityClassification(
  toolId: string,
  sideEffect: ToolSideEffect,
  riskLevel: ToolRiskLevel,
  idempotency: ToolIdempotency,
  permissions: readonly ToolPermission[],
  issues: ValidationIssue[],
): void {
  if (
    permissions.some(
      ({ permission }) => toolIdFromPermission(permission) !== toolId,
    )
  ) {
    issues.push({
      code: "permission_mismatch",
      message: "required permissions must reference the defined tool",
      path: "requiredPermissions",
    });
  }

  const readPermission = `tool:read:${toolId}`;
  const executePermission = `tool:execute:${toolId}`;
  if (
    sideEffect === "read_only" &&
    (permissions.some(
      ({ permission }) => permission === executePermission,
    ) ||
      !permissions.some(({ permission }) => permission === readPermission))
  ) {
    issues.push({
      code: "permission_mismatch",
      message: "read-only tools require their matching read permission",
      path: "requiredPermissions",
    });
  }
  const executionGrant = permissions.find(
    ({ permission }) => permission === executePermission,
  );
  if (
    sideEffect === "side_effecting" &&
    executionGrant?.approvalRequired !== true
  ) {
    issues.push({
      code: "permission_mismatch",
      message:
        "side-effecting tools require an approval-gated execute permission",
      path: "requiredPermissions",
    });
  }
  if (sideEffect === "side_effecting" && idempotency !== "required") {
    issues.push({
      code: "idempotency_required",
      message: "side-effecting tools must require idempotency",
      path: "idempotency",
    });
  }
  if (
    riskLevel === "high" &&
    !permissions.some(({ approvalRequired }) => approvalRequired)
  ) {
    issues.push({
      code: "approval_required",
      message: "high-risk tools require an approval-gated permission",
      path: "requiredPermissions",
    });
  }
}
