import {
  MAX_KNOWLEDGE_RESULTS,
} from "./knowledge-query.js";
import type {
  KnowledgeRepositorySearch,
} from "./knowledge-repository.js";
import { isKnowledgeSourceType } from "./knowledge-source.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import { isRfc3339Timestamp } from "../validation/primitives.js";

export function validateKnowledgeRepositorySearch(
  query: KnowledgeRepositorySearch,
): void {
  if (
    query.workspaceId.trim().length === 0 ||
    query.actorId.trim().length === 0 ||
    !validStringArray(query.allowedScopes) ||
    !validStringArray(query.permissionTags) ||
    !validOptionalText(query.text) ||
    !validOptionalStringArray(query.tags) ||
    !validOptionalSourceTypes(query.sourceTypes) ||
    !validOptionalTimestamp(query.freshAfter) ||
    !isRfc3339Timestamp(query.activeAt) ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > MAX_KNOWLEDGE_RESULTS
  ) {
    throw new RepositoryValidationError(
      "Knowledge repository search failed validation",
    );
  }
}

function validStringArray(values: readonly string[]): boolean {
  return (
    values.every((value) => value.trim().length > 0) &&
    new Set(values).size === values.length
  );
}

function validOptionalStringArray(
  values: readonly string[] | undefined,
): boolean {
  return values === undefined || validStringArray(values);
}

function validOptionalSourceTypes(
  values: KnowledgeRepositorySearch["sourceTypes"],
): boolean {
  return (
    values === undefined ||
    (values.every(isKnowledgeSourceType) &&
      new Set(values).size === values.length)
  );
}

function validOptionalText(value: string | undefined): boolean {
  return (
    value === undefined ||
    (value.trim().length > 0 && value.length <= 10_000)
  );
}

function validOptionalTimestamp(value: string | undefined): boolean {
  return value === undefined || isRfc3339Timestamp(value);
}
