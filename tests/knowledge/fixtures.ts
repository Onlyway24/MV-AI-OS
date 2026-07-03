import type {
  KnowledgeQuery,
  KnowledgeRecord,
  KnowledgeRepositorySearch,
  KnowledgeScope,
  KnowledgeSource,
} from "../../src/index.js";

export function createKnowledgeSource(
  overrides: Partial<KnowledgeSource> = {},
): KnowledgeSource {
  return {
    capturedAt: "2026-07-01T09:00:00.000Z",
    schemaVersion: "1",
    sourceId: "source-001",
    sourceType: "document",
    title: "MV AI OS Architecture",
    ...overrides,
  };
}

export function createKnowledgeRecord(
  knowledgeId: string,
  overrides: Partial<KnowledgeRecord> = {},
): KnowledgeRecord {
  return {
    content: { text: `Knowledge content for ${knowledgeId}` },
    createdAt: "2026-07-01T10:00:00.000Z",
    knowledgeId,
    ownerId: "actor-local",
    permissionTags: [],
    requiredScopes: ["general"],
    schemaVersion: "1",
    searchableText: `searchable ${knowledgeId}`,
    source: createKnowledgeSource({
      sourceId: `source-${knowledgeId}`,
    }),
    tags: ["product"],
    title: `Knowledge ${knowledgeId}`,
    updatedAt: "2026-07-01T10:00:00.000Z",
    verifiedAt: "2026-07-01T10:00:00.000Z",
    visibility: "workspace",
    workspaceId: "workspace-local",
    ...overrides,
  };
}

export function createKnowledgeScope(
  overrides: Partial<KnowledgeScope> = {},
): KnowledgeScope {
  return {
    actorId: "actor-local",
    allowedScopes: ["general"],
    effectivePermissions: ["knowledge:search"],
    permissionTags: [],
    taskId: "task-001",
    workspaceId: "workspace-local",
    ...overrides,
  };
}

export function createKnowledgeQuery(
  overrides: Partial<KnowledgeQuery> = {},
): KnowledgeQuery {
  return {
    contractVersion: "1",
    limit: 20,
    queryId: "knowledge-query-001",
    scope: createKnowledgeScope(),
    ...overrides,
  };
}

export function createRepositorySearch(
  overrides: Partial<KnowledgeRepositorySearch> = {},
): KnowledgeRepositorySearch {
  return {
    activeAt: "2026-07-02T10:00:00.000Z",
    actorId: "actor-local",
    allowedScopes: ["general"],
    limit: 20,
    permissionTags: [],
    workspaceId: "workspace-local",
    ...overrides,
  };
}
