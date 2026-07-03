import {
  KNOWLEDGE_SCHEMA_VERSION,
  type KnowledgeRecord,
  type KnowledgeVisibility,
} from "./knowledge-record.js";
import { KnowledgeSourceValidator } from "./knowledge-source-validator.js";
import { prefixKnowledgeValidationIssues } from "./knowledge-validation.js";
import {
  readOptionalString,
  readRequiredJsonObject,
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

const KNOWLEDGE_VISIBILITIES = new Set<KnowledgeVisibility>([
  "actor",
  "workspace",
]);

export class KnowledgeRecordValidator implements Validator<KnowledgeRecord> {
  readonly #sourceValidator = new KnowledgeSourceValidator();

  public validate(value: unknown): ValidationResult<KnowledgeRecord> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "knowledge record must be an object",
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
    const knowledgeId = readRequiredString(record, "knowledgeId", issues);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const ownerId = readRequiredString(record, "ownerId", issues);
    const visibility = readRequiredString(record, "visibility", issues);
    const requiredScopes = readRequiredStringArray(
      record,
      "requiredScopes",
      issues,
    );
    const permissionTags = readRequiredStringArray(
      record,
      "permissionTags",
      issues,
    );
    const sourceValidation = this.#sourceValidator.validate(record.source);
    if (!sourceValidation.ok) {
      issues.push(
        ...prefixKnowledgeValidationIssues(
          sourceValidation.issues,
          "source",
        ),
      );
    }
    const title = readRequiredString(record, "title", issues);
    const content = readRequiredJsonObject(record, "content", issues);
    const searchableText = readOptionalString(
      record,
      "searchableText",
      issues,
    );
    const tags = readRequiredStringArray(record, "tags", issues);
    const createdAt = readRequiredString(record, "createdAt", issues);
    const updatedAt = readRequiredString(record, "updatedAt", issues);
    const verifiedAt = readRequiredString(record, "verifiedAt", issues);
    const expiresAt = readOptionalString(record, "expiresAt", issues);
    const deletedAt = readOptionalString(record, "deletedAt", issues);

    if (
      schemaVersion !== undefined &&
      schemaVersion !== KNOWLEDGE_SCHEMA_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `schemaVersion must be ${KNOWLEDGE_SCHEMA_VERSION}`,
        path: "schemaVersion",
      });
    }
    if (
      visibility !== undefined &&
      !KNOWLEDGE_VISIBILITIES.has(visibility as KnowledgeVisibility)
    ) {
      issues.push({
        code: "invalid_value",
        message: "visibility is not supported",
        path: "visibility",
      });
    }
    validateTimestamp(createdAt, "createdAt", issues);
    validateTimestamp(updatedAt, "updatedAt", issues);
    validateTimestamp(verifiedAt, "verifiedAt", issues);
    validateTimestamp(expiresAt, "expiresAt", issues);
    validateTimestamp(deletedAt, "deletedAt", issues);
    if (
      createdAt !== undefined &&
      updatedAt !== undefined &&
      Date.parse(updatedAt) < Date.parse(createdAt)
    ) {
      issues.push({
        code: "invalid_order",
        message: "updatedAt must not be earlier than createdAt",
        path: "updatedAt",
      });
    }

    if (
      issues.length > 0 ||
      schemaVersion !== KNOWLEDGE_SCHEMA_VERSION ||
      knowledgeId === undefined ||
      workspaceId === undefined ||
      ownerId === undefined ||
      visibility === undefined ||
      !KNOWLEDGE_VISIBILITIES.has(visibility as KnowledgeVisibility) ||
      requiredScopes === undefined ||
      permissionTags === undefined ||
      !sourceValidation.ok ||
      title === undefined ||
      content === undefined ||
      tags === undefined ||
      createdAt === undefined ||
      updatedAt === undefined ||
      verifiedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      content,
      createdAt,
      ...(deletedAt === undefined ? {} : { deletedAt }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      knowledgeId,
      ownerId,
      permissionTags,
      requiredScopes,
      schemaVersion,
      ...(searchableText === undefined ? {} : { searchableText }),
      source: sourceValidation.value,
      tags,
      title,
      updatedAt,
      verifiedAt,
      visibility: visibility as KnowledgeVisibility,
      workspaceId,
    });
  }
}

function validateTimestamp(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path} must be a UTC RFC 3339 timestamp`,
      path,
    });
  }
}
