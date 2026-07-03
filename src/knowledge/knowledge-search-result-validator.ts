import type { KnowledgeRecord } from "./knowledge-record.js";
import { KnowledgeRecordValidator } from "./knowledge-record-validator.js";
import { MAX_KNOWLEDGE_RESULTS } from "./knowledge-query.js";
import type { KnowledgeSearchResult } from "./knowledge-search-result.js";
import { compareKnowledgeRecords } from "./knowledge-retrieval.js";
import { prefixKnowledgeValidationIssues } from "./knowledge-validation.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readRequiredString } from "../validation/field-readers.js";
import { asRecord, isRfc3339Timestamp } from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

export class KnowledgeSearchResultValidator
  implements Validator<KnowledgeSearchResult>
{
  readonly #recordValidator = new KnowledgeRecordValidator();

  public validate(value: unknown): ValidationResult<KnowledgeSearchResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "knowledge search result must be an object",
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
    const records = this.#readRecords(record.records, issues);
    const searchedAt = readRequiredString(record, "searchedAt", issues);

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
    if (searchedAt !== undefined && !isRfc3339Timestamp(searchedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "searchedAt must be a UTC RFC 3339 timestamp",
        path: "searchedAt",
      });
    }
    if (
      records?.some(
        (entry, index) =>
          index > 0 &&
          compareKnowledgeRecords(records[index - 1] ?? entry, entry) > 0,
      ) === true
    ) {
      issues.push({
        code: "invalid_order",
        message: "records must use deterministic knowledge ordering",
        path: "records",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      queryId === undefined ||
      records === undefined ||
      searchedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      contractVersion,
      queryId,
      records,
      searchedAt,
    });
  }

  #readRecords(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly KnowledgeRecord[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "records must be an array",
        path: "records",
      });
      return undefined;
    }
    if (value.length > MAX_KNOWLEDGE_RESULTS) {
      issues.push({
        code: "too_large",
        message: `records must not exceed ${String(MAX_KNOWLEDGE_RESULTS)} entries`,
        path: "records",
      });
    }

    const records: KnowledgeRecord[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation = this.#recordValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixKnowledgeValidationIssues(
            validation.issues,
            `records[${String(index)}]`,
          ),
        );
        continue;
      }
      records.push(validation.value);
    }
    if (
      new Set(records.map(({ knowledgeId }) => knowledgeId)).size !==
      records.length
    ) {
      issues.push({
        code: "duplicate",
        message: "records must not contain duplicate knowledge IDs",
        path: "records",
      });
    }

    return records;
  }
}
