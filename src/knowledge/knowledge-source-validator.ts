import {
  KNOWLEDGE_SOURCE_SCHEMA_VERSION,
  isKnowledgeSourceType,
  type KnowledgeSource,
} from "./knowledge-source.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredString,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class KnowledgeSourceValidator implements Validator<KnowledgeSource> {
  public validate(value: unknown): ValidationResult<KnowledgeSource> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "knowledge source must be an object",
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
    const sourceId = readRequiredString(record, "sourceId", issues);
    const sourceType = readRequiredString(record, "sourceType", issues);
    const title = readRequiredString(record, "title", issues);
    const locator = readOptionalString(record, "locator", issues);
    const publisher = readOptionalString(record, "publisher", issues);
    const capturedAt = readRequiredString(record, "capturedAt", issues);
    const metadata = readOptionalJsonObject(record, "metadata", issues);

    if (
      schemaVersion !== undefined &&
      schemaVersion !== KNOWLEDGE_SOURCE_SCHEMA_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `schemaVersion must be ${KNOWLEDGE_SOURCE_SCHEMA_VERSION}`,
        path: "schemaVersion",
      });
    }
    if (
      sourceType !== undefined &&
      !isKnowledgeSourceType(sourceType)
    ) {
      issues.push({
        code: "invalid_value",
        message: "sourceType is not supported",
        path: "sourceType",
      });
    }
    if (capturedAt !== undefined && !isRfc3339Timestamp(capturedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "capturedAt must be a UTC RFC 3339 timestamp",
        path: "capturedAt",
      });
    }

    if (
      issues.length > 0 ||
      schemaVersion !== KNOWLEDGE_SOURCE_SCHEMA_VERSION ||
      sourceId === undefined ||
      sourceType === undefined ||
      !isKnowledgeSourceType(sourceType) ||
      title === undefined ||
      capturedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      capturedAt,
      ...(locator === undefined ? {} : { locator }),
      ...(metadata === undefined ? {} : { metadata }),
      ...(publisher === undefined ? {} : { publisher }),
      schemaVersion,
      sourceId,
      sourceType,
      title,
    });
  }
}
