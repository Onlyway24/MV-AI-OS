import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readRequiredBoolean,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  MODEL_BUDGET_CONTRACT_VERSION,
  type ModelBudgetConfig,
  type ModelBudgetRule,
} from "./model-budget.js";

export class ModelBudgetConfigValidator
  implements Validator<ModelBudgetConfig>
{
  public validate(value: unknown): ValidationResult<ModelBudgetConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model budget configuration must be an object",
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
    const required = readRequiredBoolean(record, "required", issues);
    const rules = readBudgetRules(record.rules, issues);

    if (
      contractVersion !== undefined &&
      contractVersion !== MODEL_BUDGET_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== MODEL_BUDGET_CONTRACT_VERSION ||
      required === undefined ||
      rules === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      required,
      rules,
    });
  }
}

function readBudgetRules(
  value: unknown,
  issues: ValidationIssue[],
): readonly ModelBudgetRule[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "rules must be an array",
      path: "rules",
    });
    return undefined;
  }

  const rules: ModelBudgetRule[] = [];
  const identities = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const path = `rules[${String(index)}]`;
    const rule = readBudgetRule(candidate, path, issues);
    if (rule === undefined) {
      continue;
    }
    const identity = `${rule.providerId}\u0000${rule.modelId}\u0000${rule.profileId}`;
    if (identities.has(identity)) {
      issues.push({
        code: "duplicate",
        message: `${path} duplicates a provider/model/profile budget rule`,
        path,
      });
      continue;
    }
    identities.add(identity);
    rules.push(rule);
  }

  return issues.some(({ path }) => path.startsWith("rules"))
    ? undefined
    : Object.freeze(rules);
}

function readBudgetRule(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelBudgetRule | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
    path,
  );
  const providerId = readRequiredString(record, "providerId", issues, path);
  const modelId = readRequiredString(record, "modelId", issues, path);
  const profileId = readRequiredString(record, "profileId", issues, path);
  const requireRequestCost = readRequiredBoolean(
    record,
    "requireRequestCost",
    issues,
    path,
  );
  const requireEstimatedCost = readRequiredBoolean(
    record,
    "requireEstimatedCost",
    issues,
    path,
  );
  const maxRequestedCostUsd = readOptionalFiniteNumber(
    record,
    "maxRequestedCostUsd",
    path,
    issues,
  );
  const maxEstimatedCostUsd = readOptionalFiniteNumber(
    record,
    "maxEstimatedCostUsd",
    path,
    issues,
  );

  if (
    contractVersion !== undefined &&
    contractVersion !== MODEL_BUDGET_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `${path}.contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
      path: `${path}.contractVersion`,
    });
  }
  if (
    requireRequestCost === true &&
    maxRequestedCostUsd === undefined &&
    record.maxRequestedCostUsd === undefined
  ) {
    issues.push({
      code: "required",
      message:
        `${path}.maxRequestedCostUsd is required when requireRequestCost is true`,
      path: `${path}.maxRequestedCostUsd`,
    });
  }
  if (
    requireEstimatedCost === true &&
    maxEstimatedCostUsd === undefined &&
    record.maxEstimatedCostUsd === undefined
  ) {
    issues.push({
      code: "required",
      message:
        `${path}.maxEstimatedCostUsd is required when requireEstimatedCost is true`,
      path: `${path}.maxEstimatedCostUsd`,
    });
  }
  if (
    maxRequestedCostUsd === undefined &&
    maxEstimatedCostUsd === undefined
  ) {
    issues.push({
      code: "required",
      message:
        `${path} must declare maxRequestedCostUsd or maxEstimatedCostUsd`,
      path,
    });
  }

  if (
    contractVersion !== MODEL_BUDGET_CONTRACT_VERSION ||
    providerId === undefined ||
    modelId === undefined ||
    profileId === undefined ||
    requireRequestCost === undefined ||
    requireEstimatedCost === undefined ||
    (requireRequestCost && maxRequestedCostUsd === undefined) ||
    (requireEstimatedCost && maxEstimatedCostUsd === undefined) ||
    (maxRequestedCostUsd === undefined &&
      maxEstimatedCostUsd === undefined)
  ) {
    return undefined;
  }

  return {
    contractVersion,
    ...(maxEstimatedCostUsd === undefined
      ? {}
      : { maxEstimatedCostUsd }),
    ...(maxRequestedCostUsd === undefined
      ? {}
      : { maxRequestedCostUsd }),
    modelId,
    profileId,
    providerId,
    requireEstimatedCost,
    requireRequestCost,
  };
}

function readOptionalFiniteNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  const path = `${pathPrefix}.${key}`;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push({
      code: "invalid_number",
      message: `${path} must be a finite number greater than or equal to 0`,
      path,
    });
    return undefined;
  }
  return value;
}
