import {
  LOCAL_RUNTIME_CONTRACT_VERSION,
  type LocalContentAgentMode,
  type LocalModelProviderConfig,
  type LocalRuntimeConfig,
  type LocalRuntimePermissionConfig,
} from "./local-runtime-config.js";
import { ModelBudgetConfigValidator } from "../models/model-budget-validator.js";
import { ModelUsageAccountingConfigValidator } from "../models/model-pricing-validator.js";
import {
  DEFAULT_OPENAI_BASE_URL,
  MAX_OPENAI_BASE_URL_LENGTH,
  MAX_OPENAI_HEADER_VALUE_LENGTH,
  OPENAI_MODEL_PROVIDER_ID,
} from "../models/providers/openai-model-provider-config.js";
import { ModelOperationLimitsValidator } from "../models/model-operation-limits-validator.js";
import { SqliteConnectionConfigValidator } from "../persistence/sqlite/sqlite-connection-config.js";
import {
  isEffectivePermission,
  type EffectivePermission,
} from "../policy/effective-permissions.js";
import {
  REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION,
  REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE,
  type ReferenceVaultApprovalAuthority,
} from "../reference-vault/reference-vault-approval-authority.js";
import {
  readOptionalString,
  readRequiredBoolean,
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
  "model-backed-openai",
]);
const MODEL_PROVIDER_KEYS = new Set([
  "apiKeySecretId",
  "baseUrl",
  "modelId",
  "organizationId",
  "projectId",
  "providerId",
]);
const REFERENCE_VAULT_APPROVAL_AUTHORITY_KEYS = new Set([
  "authorityId",
  "confirmedByFabio",
  "contractVersion",
  "scope",
  "workspaceId",
]);
const SECRET_ID_PATTERN = /^[a-z][a-z0-9._:-]{2,127}$/u;
const HEADER_VALUE_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/u;
const LOCAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u;

export class LocalRuntimeConfigValidator
  implements Validator<LocalRuntimeConfig>
{
  readonly #modelBudgetValidator = new ModelBudgetConfigValidator();
  readonly #modelOperationLimitsValidator =
    new ModelOperationLimitsValidator();
  readonly #modelUsageAccountingValidator =
    new ModelUsageAccountingConfigValidator();
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
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const permissions = readPermissions(record.permissions, issues);
    const referenceVaultApprovalAuthority = readReferenceVaultApprovalAuthority(
      record.referenceVaultApprovalAuthority,
      workspaceId,
      issues,
    );
    const modelProvider = readModelProvider(
      record.modelProvider,
      contentAgentMode,
      issues,
    );
    const modelBudgetValidation =
      record.modelBudget === undefined
        ? undefined
        : this.#modelBudgetValidator.validate(record.modelBudget);
    const modelOperationLimitsValidation =
      record.modelOperationLimits === undefined
        ? undefined
        : this.#modelOperationLimitsValidator.validate(
            record.modelOperationLimits,
          );
    const modelUsageAccountingValidation =
      record.modelUsageAccounting === undefined
        ? undefined
        : this.#modelUsageAccountingValidator.validate(
            record.modelUsageAccounting,
          );
    const sqliteValidation = this.#sqliteValidator.validate(record.sqlite);
    if (!sqliteValidation.ok) {
      issues.push(
        ...sqliteValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "sqlite" : `sqlite.${path}`,
        })),
      );
    }
    if (modelBudgetValidation !== undefined && !modelBudgetValidation.ok) {
      issues.push(
        ...modelBudgetValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "modelBudget" : `modelBudget.${path}`,
        })),
      );
    }
    if (
      modelOperationLimitsValidation !== undefined &&
      !modelOperationLimitsValidation.ok
    ) {
      issues.push(
        ...modelOperationLimitsValidation.issues.map(
          ({ code, message, path }) => ({
            code,
            message,
            path:
              path === "$"
                ? "modelOperationLimits"
                : `modelOperationLimits.${path}`,
          }),
        ),
      );
    }
    if (
      modelUsageAccountingValidation !== undefined &&
      !modelUsageAccountingValidation.ok
    ) {
      issues.push(
        ...modelUsageAccountingValidation.issues.map(
          ({ code, message, path }) => ({
            code,
            message,
            path:
              path === "$"
                ? "modelUsageAccounting"
                : `modelUsageAccounting.${path}`,
          }),
        ),
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
      modelProvider === false ||
      referenceVaultApprovalAuthority === false ||
      (modelBudgetValidation !== undefined &&
        !modelBudgetValidation.ok) ||
      (modelOperationLimitsValidation !== undefined &&
        !modelOperationLimitsValidation.ok) ||
      (modelUsageAccountingValidation !== undefined &&
        !modelUsageAccountingValidation.ok) ||
      !sqliteValidation.ok ||
      workspaceId === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      contentAgentMode: contentAgentMode as LocalContentAgentMode,
      contractVersion,
      ...(modelBudgetValidation === undefined
        ? {}
        : {
            modelBudget: modelBudgetValidation.value,
          }),
      ...(modelOperationLimitsValidation === undefined
        ? {}
        : {
            modelOperationLimits:
              modelOperationLimitsValidation.value,
          }),
      ...(modelProvider === undefined ? {} : { modelProvider }),
      ...(modelUsageAccountingValidation === undefined
        ? {}
        : {
            modelUsageAccounting:
              modelUsageAccountingValidation.value,
          }),
      permissions,
      ...(referenceVaultApprovalAuthority === undefined
        ? {}
        : { referenceVaultApprovalAuthority }),
      sqlite: sqliteValidation.value,
      workspaceId,
    });
  }
}

function readReferenceVaultApprovalAuthority(
  value: unknown,
  runtimeWorkspaceId: string | undefined,
  issues: ValidationIssue[],
): ReferenceVaultApprovalAuthority | false | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: "referenceVaultApprovalAuthority must be an object",
      path: "referenceVaultApprovalAuthority",
    });
    return false;
  }

  rejectUnknownKeys(
    record,
    REFERENCE_VAULT_APPROVAL_AUTHORITY_KEYS,
    issues,
    "referenceVaultApprovalAuthority",
  );
  const authorityId = readRequiredString(
    record,
    "authorityId",
    issues,
    "referenceVaultApprovalAuthority",
  );
  const confirmedByFabio = readRequiredBoolean(
    record,
    "confirmedByFabio",
    issues,
    "referenceVaultApprovalAuthority",
  );
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
    "referenceVaultApprovalAuthority",
  );
  const scope = readRequiredString(
    record,
    "scope",
    issues,
    "referenceVaultApprovalAuthority",
  );
  const workspaceId = readRequiredString(
    record,
    "workspaceId",
    issues,
    "referenceVaultApprovalAuthority",
  );

  if (authorityId !== undefined && !LOCAL_ID_PATTERN.test(authorityId)) {
    issues.push({
      code: "invalid_format",
      message: "referenceVaultApprovalAuthority.authorityId must be an opaque local actor identifier",
      path: "referenceVaultApprovalAuthority.authorityId",
    });
  }
  if (confirmedByFabio !== undefined && !confirmedByFabio) {
    issues.push({
      code: "invalid_value",
      message: "referenceVaultApprovalAuthority.confirmedByFabio must be true",
      path: "referenceVaultApprovalAuthority.confirmedByFabio",
    });
  }
  if (
    contractVersion !== undefined &&
    contractVersion !== REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `referenceVaultApprovalAuthority.contractVersion must be ${REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION}`,
      path: "referenceVaultApprovalAuthority.contractVersion",
    });
  }
  if (scope !== undefined && scope !== REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE) {
    issues.push({
      code: "invalid_value",
      message: `referenceVaultApprovalAuthority.scope must be ${REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE}`,
      path: "referenceVaultApprovalAuthority.scope",
    });
  }
  if (
    workspaceId !== undefined &&
    runtimeWorkspaceId !== undefined &&
    workspaceId !== runtimeWorkspaceId
  ) {
    issues.push({
      code: "invalid_value",
      message: "referenceVaultApprovalAuthority.workspaceId must match the runtime workspaceId",
      path: "referenceVaultApprovalAuthority.workspaceId",
    });
  }

  if (
    authorityId === undefined ||
    !LOCAL_ID_PATTERN.test(authorityId) ||
    confirmedByFabio !== true ||
    contractVersion !== REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION ||
    scope !== REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE ||
    workspaceId === undefined ||
    workspaceId !== runtimeWorkspaceId
  ) return false;

  return {
    authorityId,
    confirmedByFabio,
    contractVersion,
    scope,
    workspaceId,
  };
}

function readModelProvider(
  value: unknown,
  contentAgentMode: string | undefined,
  issues: ValidationIssue[],
): LocalModelProviderConfig | false | undefined {
  if (contentAgentMode !== "model-backed-openai") {
    if (value !== undefined) {
      issues.push({
        code: "forbidden",
        message:
          "modelProvider is only allowed when contentAgentMode is model-backed-openai",
        path: "modelProvider",
      });
      return false;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message:
        "modelProvider must be an object when contentAgentMode is model-backed-openai",
      path: "modelProvider",
    });
    return false;
  }

  rejectUnknownKeys(record, MODEL_PROVIDER_KEYS, issues, "modelProvider");
  const providerId = readRequiredString(
    record,
    "providerId",
    issues,
    "modelProvider",
  );
  const apiKeySecretId = readRequiredString(
    record,
    "apiKeySecretId",
    issues,
    "modelProvider",
  );
  const baseUrl =
    readOptionalString(record, "baseUrl", issues, "modelProvider", {
      maxLength: MAX_OPENAI_BASE_URL_LENGTH,
    }) ?? DEFAULT_OPENAI_BASE_URL;
  const modelId = readRequiredString(
    record,
    "modelId",
    issues,
    "modelProvider",
  );
  const organizationId = readOptionalHeaderValue(
    record,
    "organizationId",
    issues,
  );
  const projectId = readOptionalHeaderValue(record, "projectId", issues);

  if (providerId !== undefined && providerId !== OPENAI_MODEL_PROVIDER_ID) {
    issues.push({
      code: "invalid_value",
      message: `modelProvider.providerId must be ${OPENAI_MODEL_PROVIDER_ID}`,
      path: "modelProvider.providerId",
    });
  }
  if (
    apiKeySecretId !== undefined &&
    !SECRET_ID_PATTERN.test(apiKeySecretId)
  ) {
    issues.push({
      code: "invalid_format",
      message:
        "modelProvider.apiKeySecretId must be a lowercase opaque secret identifier",
      path: "modelProvider.apiKeySecretId",
    });
  }
  if (!isValidOpenAIBaseUrl(baseUrl)) {
    issues.push({
      code: "invalid_value",
      message:
        "modelProvider.baseUrl must be an absolute HTTPS URL without credentials",
      path: "modelProvider.baseUrl",
    });
  }

  if (
    providerId !== OPENAI_MODEL_PROVIDER_ID ||
    apiKeySecretId === undefined ||
    !SECRET_ID_PATTERN.test(apiKeySecretId) ||
    modelId === undefined ||
    !isValidOpenAIBaseUrl(baseUrl)
  ) {
    return false;
  }

  return {
    apiKeySecretId,
    baseUrl: stripTrailingSlash(baseUrl),
    modelId,
    ...(organizationId === undefined ? {} : { organizationId }),
    ...(projectId === undefined ? {} : { projectId }),
    providerId,
  };
}

function readOptionalHeaderValue(
  record: Readonly<Record<string, unknown>>,
  key: "organizationId" | "projectId",
  issues: ValidationIssue[],
): string | undefined {
  const value = readOptionalString(
    record,
    key,
    issues,
    "modelProvider",
    { maxLength: MAX_OPENAI_HEADER_VALUE_LENGTH },
  );
  if (value !== undefined && !HEADER_VALUE_PATTERN.test(value)) {
    issues.push({
      code: "invalid_format",
      message: `modelProvider.${key} must be an opaque OpenAI header value`,
      path: `modelProvider.${key}`,
    });
    return undefined;
  }
  return value;
}

function isValidOpenAIBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      url.search.length === 0
    );
  } catch {
    return false;
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
        code: "unexpected",
        message: `${pathPrefix}.${key} is not a supported configuration field`,
        path: `${pathPrefix}.${key}`,
      });
    }
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
