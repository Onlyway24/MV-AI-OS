import type {
  BaseMemoryRecord,
  ConversationMemoryRecord,
  MemoryQuery,
  MemoryReadPermission,
  MemoryRepositorySearch,
  MemoryScope,
  SemanticMemoryRecord,
  UserMemoryRecord,
  WorkingMemoryRecord,
} from "../../src/index.js";

type BaseValues = Omit<BaseMemoryRecord, "category">;

export function createWorkingMemory(
  memoryId: string,
  taskId: string,
  overrides: Partial<WorkingMemoryRecord> = {},
): WorkingMemoryRecord {
  return {
    ...baseMemory(memoryId),
    category: "working",
    taskId,
    ...overrides,
  };
}

export function createConversationMemory(
  memoryId: string,
  sessionId: string,
  overrides: Partial<ConversationMemoryRecord> = {},
): ConversationMemoryRecord {
  return {
    ...baseMemory(memoryId),
    category: "conversation",
    sessionId,
    ...overrides,
  };
}

export function createUserMemory(
  memoryId: string,
  overrides: Partial<UserMemoryRecord> = {},
): UserMemoryRecord {
  return {
    ...baseMemory(memoryId),
    approval: {
      approvedAt: "2026-07-01T09:00:00.000Z",
      approvedBy: "actor-local",
    },
    category: "user",
    ...overrides,
  };
}

export function createSemanticMemory(
  memoryId: string,
  overrides: Partial<SemanticMemoryRecord> = {},
): SemanticMemoryRecord {
  return {
    ...baseMemory(memoryId),
    category: "semantic",
    confidence: 0.9,
    verification: "verified",
    visibility: "workspace",
    ...overrides,
  };
}

export function createMemoryScope(
  permissions: readonly MemoryReadPermission[],
  overrides: Partial<MemoryScope> = {},
): MemoryScope {
  return {
    actorId: "actor-local",
    permissions,
    permissionTags: [],
    workspaceId: "workspace-local",
    ...overrides,
  };
}

export function createMemoryQuery(
  categories: MemoryQuery["categories"],
  scope: MemoryScope,
  overrides: Partial<MemoryQuery> = {},
): MemoryQuery {
  return {
    categories,
    contractVersion: "1",
    limit: 20,
    queryId: "memory-query-001",
    scope,
    ...overrides,
  };
}

export function createMemoryRepositorySearch(
  overrides: Partial<MemoryRepositorySearch> = {},
): MemoryRepositorySearch {
  return {
    activeAt: "2026-07-02T10:00:00.000Z",
    actorId: "actor-local",
    categories: ["semantic"],
    limit: 20,
    permissionTags: [],
    workspaceId: "workspace-local",
    ...overrides,
  };
}

function baseMemory(memoryId: string): BaseValues {
  return {
    content: { value: memoryId },
    createdAt: "2026-07-01T10:00:00.000Z",
    memoryId,
    ownerId: "actor-local",
    permissionTags: [],
    provenance: { source: "user" },
    schemaVersion: "1",
    sensitivity: "internal",
    updatedAt: "2026-07-01T10:00:00.000Z",
    visibility: "owner",
    workspaceId: "workspace-local",
  };
}
