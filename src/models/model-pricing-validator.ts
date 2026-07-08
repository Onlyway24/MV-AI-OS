import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readRequiredBoolean, readRequiredString } from "../validation/field-readers.js";
import { asRecord } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import {
  MODEL_PRICING_CONTRACT_VERSION,
  MODEL_PRICING_CURRENCY,
  type ModelPricingRule,
  type ModelUsageAccountingConfig,
} from "./model-pricing.js";

export class ModelUsageAccountingConfigValidator
  implements Validator<ModelUsageAccountingConfig>
{
  public validate(value: unknown): ValidationResult<ModelUsageAccountingConfig> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model usage accounting configuration must be an object",
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
    const pricing = readPricingRules(record.pricing, issues);

    if (
      contractVersion !== undefined &&
      contractVersion !== MODEL_PRICING_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== MODEL_PRICING_CONTRACT_VERSION ||
      required === undefined ||
      pricing === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      pricing,
      required,
    });
  }
}

function readPricingRules(
  value: unknown,
  issues: ValidationIssue[],
): readonly ModelPricingRule[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: "pricing must be an array",
      path: "pricing",
    });
    return undefined;
  }

  const rules: ModelPricingRule[] = [];
  const identities = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const path = `pricing[${String(index)}]`;
    const rule = readPricingRule(candidate, path, issues);
    if (rule === undefined) {
      continue;
    }
    const identity = `${rule.providerId}\u0000${rule.modelId}\u0000${rule.profileId}`;
    if (identities.has(identity)) {
      issues.push({
        code: "duplicate",
        message: `${path} duplicates a provider/model/profile pricing rule`,
        path,
      });
      continue;
    }
    identities.add(identity);
    rules.push(rule);
  }

  return issues.some(({ path }) => path.startsWith("pricing"))
    ? undefined
    : Object.freeze(rules);
}

function readPricingRule(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelPricingRule | undefined {
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
  const currency = readRequiredString(record, "currency", issues, path);
  const providerId = readRequiredString(record, "providerId", issues, path);
  const modelId = readRequiredString(record, "modelId", issues, path);
  const profileId = readRequiredString(record, "profileId", issues, path);
  const inputTokenUsdPerMillion = readRequiredFiniteNumber(
    record,
    "inputTokenUsdPerMillion",
    path,
    issues,
  );
  const outputTokenUsdPerMillion = readRequiredFiniteNumber(
    record,
    "outputTokenUsdPerMillion",
    path,
    issues,
  );

  if (
    contractVersion !== undefined &&
    contractVersion !== MODEL_PRICING_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `${path}.contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
      path: `${path}.contractVersion`,
    });
  }
  if (currency !== undefined && currency !== MODEL_PRICING_CURRENCY) {
    issues.push({
      code: "invalid_value",
      message: `${path}.currency must be ${MODEL_PRICING_CURRENCY}`,
      path: `${path}.currency`,
    });
  }

  if (
    contractVersion !== MODEL_PRICING_CONTRACT_VERSION ||
    currency !== MODEL_PRICING_CURRENCY ||
    providerId === undefined ||
    modelId === undefined ||
    profileId === undefined ||
    inputTokenUsdPerMillion === undefined ||
    outputTokenUsdPerMillion === undefined
  ) {
    return undefined;
  }

  return {
    contractVersion,
    currency,
    inputTokenUsdPerMillion,
    modelId,
    outputTokenUsdPerMillion,
    profileId,
    providerId,
  };
}

function readRequiredFiniteNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  pathPrefix: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = record[key];
  const path = `${pathPrefix}.${key}`;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push({
      code: value === undefined ? "required" : "invalid_number",
      message: `${path} must be a finite number greater than or equal to 0`,
      path,
    });
    return undefined;
  }
  return value;
}
