import type {
  KnowledgeRepositorySearch,
} from "./knowledge-repository.js";
import type { KnowledgeRecord } from "./knowledge-record.js";

export function matchesKnowledgeSearch(
  record: KnowledgeRecord,
  query: KnowledgeRepositorySearch,
): boolean {
  if (
    record.workspaceId !== query.workspaceId ||
    record.deletedAt !== undefined ||
    (record.expiresAt !== undefined &&
      Date.parse(record.expiresAt) <= Date.parse(query.activeAt)) ||
    (record.visibility === "actor" && record.ownerId !== query.actorId) ||
    !record.requiredScopes.every((scope) =>
      query.allowedScopes.includes(scope),
    ) ||
    !record.permissionTags.every((tag) =>
      query.permissionTags.includes(tag),
    ) ||
    (query.tags !== undefined &&
      !query.tags.every((tag) => record.tags.includes(tag))) ||
    (query.sourceTypes !== undefined &&
      !query.sourceTypes.includes(record.source.sourceType)) ||
    (query.freshAfter !== undefined &&
      Date.parse(record.verifiedAt) < Date.parse(query.freshAfter))
  ) {
    return false;
  }

  const text = query.text?.trim().toLowerCase();
  return (
    text === undefined ||
    text.length === 0 ||
    [
      record.title,
      record.searchableText ?? "",
      record.source.title,
      JSON.stringify(record.content),
    ]
      .join(" ")
      .toLowerCase()
      .includes(text)
  );
}

export function compareKnowledgeRecords(
  left: KnowledgeRecord,
  right: KnowledgeRecord,
): number {
  const freshness =
    Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt);
  if (freshness !== 0) {
    return freshness;
  }
  return left.knowledgeId === right.knowledgeId
    ? 0
    : left.knowledgeId < right.knowledgeId
      ? -1
      : 1;
}
