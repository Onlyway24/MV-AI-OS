import {
  MAX_MEMORY_RESULTS,
} from "./memory-query.js";
import type {
  MemoryRepositorySearch,
  MemoryUpdateExpectation,
} from "./memory-repository.js";
import type {
  MemoryCategory,
  MemoryRecord,
} from "./memory-record.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../errors/core-error.js";
import { isRfc3339Timestamp } from "../validation/primitives.js";

const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "conversation",
  "operational",
  "semantic",
  "user",
  "working",
]);

export function validateMemoryRepositorySearch(
  query: MemoryRepositorySearch,
): void {
  if (
    query.workspaceId.trim().length === 0 ||
    query.actorId.trim().length === 0 ||
    query.categories.length === 0 ||
    query.categories.some((category) => !MEMORY_CATEGORIES.has(category)) ||
    (query.categories.includes("working") && query.taskId === undefined) ||
    (query.categories.includes("conversation") &&
      query.sessionId === undefined) ||
    query.permissionTags.some((tag) => tag.trim().length === 0) ||
    !optionalStringIsValid(query.taskId) ||
    !optionalStringIsValid(query.sessionId) ||
    !optionalStringIsValid(query.text) ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > MAX_MEMORY_RESULTS ||
    !isRfc3339Timestamp(query.activeAt)
  ) {
    throw new RepositoryValidationError(
      "Memory repository search failed validation",
    );
  }
}

export function validateMemoryUpdateExpectation(
  expectation: MemoryUpdateExpectation,
): void {
  if (!isRfc3339Timestamp(expectation.updatedAt)) {
    throw new RepositoryValidationError(
      "Memory update expectation failed validation",
    );
  }
}

export function validateMemoryOwnership(
  existing: MemoryRecord,
  next: MemoryRecord,
): void {
  if (
    existing.category !== next.category ||
    existing.workspaceId !== next.workspaceId ||
    existing.ownerId !== next.ownerId ||
    existing.visibility !== next.visibility ||
    existing.createdAt !== next.createdAt ||
    categoryScope(existing) !== categoryScope(next)
  ) {
    throw new RepositoryConflictError(
      "Memory ownership fields cannot be changed",
      { memoryId: next.memoryId },
    );
  }
}

function categoryScope(record: MemoryRecord): string | undefined {
  if (record.category === "working" || record.category === "operational") {
    return record.taskId;
  }
  if (record.category === "conversation") {
    return record.sessionId;
  }
  return undefined;
}

function optionalStringIsValid(value: string | undefined): boolean {
  return value === undefined || value.trim().length > 0;
}
