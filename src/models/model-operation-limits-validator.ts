import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalNumber,
  readRequiredInteger,
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
import type { ModelOperationLimits } from "./model-operation-limits.js";

export const DEFAULT_MODEL_OPERATION_LIMITS: ModelOperationLimits =
  Object.freeze({
    contractVersion: REQUEST_CONTRACT_VERSION,
    maxCostUsd: 0.1,
    maxInputCharacters: 300_000,
    maxOutputTokens: 2_048,
    maxProviderCalls: 1,
    maxTotalTokens: 32_000,
    timeoutMs: 30_000,
  });

export class ModelOperationLimitsValidator
  implements Validator<ModelOperationLimits>
{
  public validate(value: unknown): ValidationResult<ModelOperationLimits> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model operation limits must be an object",
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
    const maxInputCharacters = readRequiredInteger(
      record,
      "maxInputCharacters",
      issues,
      "",
      1,
    );
    const maxOutputTokens = readRequiredInteger(
      record,
      "maxOutputTokens",
      issues,
      "",
      1,
    );
    const maxProviderCalls = readRequiredInteger(
      record,
      "maxProviderCalls",
      issues,
      "",
      1,
    );
    const timeoutMs = readRequiredInteger(
      record,
      "timeoutMs",
      issues,
      "",
      1,
    );
    const maxTotalTokens = readOptionalPositiveInteger(
      record,
      "maxTotalTokens",
      issues,
    );
    const maxCostUsd = readOptionalNumber(
      record,
      "maxCostUsd",
      issues,
      "",
      0,
    );

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

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      maxInputCharacters === undefined ||
      maxOutputTokens === undefined ||
      maxProviderCalls === undefined ||
      timeoutMs === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
      maxInputCharacters,
      maxOutputTokens,
      maxProviderCalls,
      ...(maxTotalTokens === undefined ? {} : { maxTotalTokens }),
      timeoutMs,
    });
  }
}

function readOptionalPositiveInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredInteger(record, key, issues, "", 1);
}

