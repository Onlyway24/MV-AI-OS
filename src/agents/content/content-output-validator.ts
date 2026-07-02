import type { ContentOutput } from "./content-output.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredJsonObject,
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

export class ContentOutputValidator implements Validator<ContentOutput> {
  public validate(value: unknown): ValidationResult<ContentOutput> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "content output must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const contentType = readRequiredString(record, "contentType", issues);
    const title = readOptionalString(record, "title", issues);
    const summary = readRequiredString(record, "summary", issues);
    const body = readRequiredJsonObject(record, "body", issues);
    const audience = readRequiredString(record, "audience", issues);
    const tone = readRequiredString(record, "tone", issues);
    const language = readRequiredString(record, "language", issues);
    const callToAction = readOptionalString(
      record,
      "callToAction",
      issues,
    );
    const assumptions = readRequiredStringArray(
      record,
      "assumptions",
      issues,
    );
    const warnings = readRequiredStringArray(record, "warnings", issues);
    const sourceRefs = readRequiredStringArray(record, "sourceRefs", issues);
    const memoryRefs = readRequiredStringArray(record, "memoryRefs", issues);
    const delivery = readOptionalJsonObject(record, "delivery", issues);
    const metadata = readRequiredJsonObject(record, "metadata", issues);

    if (
      issues.length > 0 ||
      contentType === undefined ||
      summary === undefined ||
      body === undefined ||
      audience === undefined ||
      tone === undefined ||
      language === undefined ||
      assumptions === undefined ||
      warnings === undefined ||
      sourceRefs === undefined ||
      memoryRefs === undefined ||
      metadata === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      assumptions,
      audience,
      body,
      ...(callToAction === undefined ? {} : { callToAction }),
      contentType,
      ...(delivery === undefined ? {} : { delivery }),
      language,
      memoryRefs,
      metadata,
      sourceRefs,
      summary,
      ...(title === undefined ? {} : { title }),
      tone,
      warnings,
    });
  }
}
