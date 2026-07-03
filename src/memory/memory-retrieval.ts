import type { MemoryRepositorySearch } from "./memory-repository.js";
import type { MemoryRecord } from "./memory-record.js";

export function matchesMemorySearch(
  record: MemoryRecord,
  query: MemoryRepositorySearch,
): boolean {
  if (
    record.workspaceId !== query.workspaceId ||
    !query.categories.includes(record.category) ||
    record.deletedAt !== undefined ||
    (record.expiresAt !== undefined &&
      Date.parse(record.expiresAt) <= Date.parse(query.activeAt)) ||
    (record.visibility === "owner" && record.ownerId !== query.actorId) ||
    !record.permissionTags.every((tag) =>
      query.permissionTags.includes(tag),
    )
  ) {
    return false;
  }

  if (
    (record.category === "working" &&
      record.taskId !== query.taskId) ||
    (record.category === "conversation" &&
      record.sessionId !== query.sessionId) ||
    (record.category === "user" && record.ownerId !== query.actorId)
  ) {
    return false;
  }

  if (query.text === undefined) {
    return true;
  }
  const normalizedText = query.text.toLowerCase();
  return `${record.searchableText ?? ""} ${JSON.stringify(record.content)}`
    .toLowerCase()
    .includes(normalizedText);
}

export function compareMemoryRecords(
  left: MemoryRecord,
  right: MemoryRecord,
): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    left.memoryId.localeCompare(right.memoryId)
  );
}
