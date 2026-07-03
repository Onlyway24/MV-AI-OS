import {
  MAX_KNOWLEDGE_RESULTS,
  type KnowledgeQuery,
} from "./knowledge-query.js";
import { isKnowledgeSourceType } from "./knowledge-source.js";
import { KnowledgeScopeValidator } from "./knowledge-scope-validator.js";
import { prefixKnowledgeValidationIssues } from "./knowledge-validation.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalString,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class KnowledgeQueryValidator implements Validator<KnowledgeQuery> {
  readonly #scopeValidator = new KnowledgeScopeValidator();

  public validate(value: unknown): ValidationResult<KnowledgeQuery> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "knowledge query must be an object",
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
    const queryId = readRequiredString(record, "queryId", issues);
    const scopeValidation = this.#scopeValidator.validate(record.scope);
    if (!scopeValidation.ok) {
      issues.push(
        ...prefixKnowledgeValidationIssues(
          scopeValidation.issues,
          "scope",
        ),
      );
    }
    const text = readOptionalString(record, "text", issues, "", {
      maxLength: 10_000,
    });
    const tags = readOptionalStringArray(record, "tags", issues);
    const sourceTypes = readOptionalStringArray(
      record,
      "sourceTypes",
      issues,
    );
    const freshAfter = readOptionalString(
      record,
      "freshAfter",
      issues,
    );
    const limit = readRequiredInteger(record, "limit", issues, "", 1);

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
    if (sourceTypes !== undefined) {
      for (const [index, sourceType] of sourceTypes.entries()) {
        if (!isKnowledgeSourceType(sourceType)) {
          issues.push({
            code: "invalid_value",
            message: "sourceTypes contains an unsupported source type",
            path: `sourceTypes[${String(index)}]`,
          });
        }
      }
    }
    if (freshAfter !== undefined && !isRfc3339Timestamp(freshAfter)) {
      issues.push({
        code: "invalid_timestamp",
        message: "freshAfter must be a UTC RFC 3339 timestamp",
        path: "freshAfter",
      });
    }
    if (limit !== undefined && limit > MAX_KNOWLEDGE_RESULTS) {
      issues.push({
        code: "too_large",
        message: `limit must not exceed ${String(MAX_KNOWLEDGE_RESULTS)}`,
        path: "limit",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      queryId === undefined ||
      !scopeValidation.ok ||
      limit === undefined ||
      (sourceTypes !== undefined &&
        !sourceTypes.every(isKnowledgeSourceType))
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      ...(freshAfter === undefined ? {} : { freshAfter }),
      limit,
      queryId,
      scope: scopeValidation.value,
      ...(sourceTypes === undefined
        ? {}
        : {
            sourceTypes,
          }),
      ...(tags === undefined ? {} : { tags }),
      ...(text === undefined ? {} : { text }),
    });
  }
}

function readOptionalStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  issues: ValidationIssue[],
): readonly string[] | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readRequiredStringArray(record, key, issues, "", false);
}
