import type { MemoryQuery } from "./memory-query.js";
import type { MemoryCategory } from "./memory-record.js";
import { MemoryScopeValidator } from "./memory-scope-validator.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalString,
  readRequiredInteger,
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

const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "conversation",
  "operational",
  "semantic",
  "user",
  "working",
]);
const MAX_MEMORY_RESULTS = 100;

export class MemoryQueryValidator implements Validator<MemoryQuery> {
  readonly #scopeValidator = new MemoryScopeValidator();

  public validate(value: unknown): ValidationResult<MemoryQuery> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "memory query must be an object",
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
        ...scopeValidation.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path === "$" ? "scope" : `scope.${path}`,
        })),
      );
    }
    const categories = readRequiredStringArray(
      record,
      "categories",
      issues,
      "",
      false,
    );
    const text = readOptionalString(record, "text", issues);
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

    if (categories !== undefined) {
      for (const [index, category] of categories.entries()) {
        if (!MEMORY_CATEGORIES.has(category as MemoryCategory)) {
          issues.push({
            code: "invalid_value",
            message: "categories contains an unsupported memory category",
            path: `categories[${String(index)}]`,
          });
        }
      }
    }

    if (limit !== undefined && limit > MAX_MEMORY_RESULTS) {
      issues.push({
        code: "too_large",
        message: `limit must not exceed ${String(MAX_MEMORY_RESULTS)}`,
        path: "limit",
      });
    }

    if (scopeValidation.ok && categories !== undefined) {
      if (
        categories.includes("working") &&
        scopeValidation.value.taskId === undefined
      ) {
        issues.push({
          code: "required",
          message: "scope.taskId is required for working memory",
          path: "scope.taskId",
        });
      }
      if (
        categories.includes("conversation") &&
        scopeValidation.value.sessionId === undefined
      ) {
        issues.push({
          code: "required",
          message: "scope.sessionId is required for conversation memory",
          path: "scope.sessionId",
        });
      }
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      queryId === undefined ||
      !scopeValidation.ok ||
      categories === undefined ||
      limit === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      categories: categories as readonly MemoryCategory[],
      contractVersion,
      limit,
      queryId,
      scope: scopeValidation.value,
      ...(text === undefined ? {} : { text }),
    });
  }
}
