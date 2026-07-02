import type {
  ModelOutputFormat,
  ModelProfile,
  ModelProfileLimits,
} from "../models/model-profile.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalNumber,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const OUTPUT_FORMATS = new Set<ModelOutputFormat>(["json", "text"]);

export class ModelProfileValidator implements Validator<ModelProfile> {
  public validate(value: unknown): ValidationResult<ModelProfile> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "model profile must be an object",
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
    const profileId = readRequiredString(record, "profileId", issues);
    const providerId = readRequiredString(record, "providerId", issues);
    const modelId = readRequiredString(record, "modelId", issues);
    const supportedOutputFormats = readRequiredStringArray(
      record,
      "supportedOutputFormats",
      issues,
      "",
      false,
    );
    const limits = readProfileLimits(record.limits, "limits", issues);

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
    if (supportedOutputFormats !== undefined) {
      for (const [index, format] of supportedOutputFormats.entries()) {
        if (!OUTPUT_FORMATS.has(format as ModelOutputFormat)) {
          issues.push({
            code: "invalid_value",
            message: "supportedOutputFormats contains an unsupported format",
            path: `supportedOutputFormats[${String(index)}]`,
          });
        }
      }
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      profileId === undefined ||
      providerId === undefined ||
      modelId === undefined ||
      supportedOutputFormats === undefined ||
      limits === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      limits,
      modelId,
      profileId,
      providerId,
      supportedOutputFormats:
        supportedOutputFormats as readonly ModelOutputFormat[],
    });
  }
}

function readProfileLimits(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ModelProfileLimits | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const timeoutMs = readRequiredInteger(
    record,
    "timeoutMs",
    issues,
    path,
    1,
  );
  const maxInputCharacters = readRequiredInteger(
    record,
    "maxInputCharacters",
    issues,
    path,
    1,
  );
  const maxOutputTokens = readRequiredInteger(
    record,
    "maxOutputTokens",
    issues,
    path,
    1,
  );
  const maxCostUsd = readOptionalNumber(
    record,
    "maxCostUsd",
    issues,
    path,
  );

  if (
    timeoutMs === undefined ||
    maxInputCharacters === undefined ||
    maxOutputTokens === undefined
  ) {
    return undefined;
  }
  return {
    ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
    maxInputCharacters,
    maxOutputTokens,
    timeoutMs,
  };
}
