import { describe, expect, it } from "vitest";

import { InMemoryMemoryService } from "../../src/memory/testing/in-memory-memory-service.js";
import { FixedClock } from "../support/fixtures.js";
import {
  createConversationMemory,
  createMemoryQuery,
  createMemoryScope,
  createSemanticMemory,
  createUserMemory,
  createWorkingMemory,
} from "./fixtures.js";

describe("InMemoryMemoryService", () => {
  const clock = new FixedClock("2026-07-02T10:00:00.000Z");

  it("retrieves working memory only for the active task", async () => {
    const service = new InMemoryMemoryService(
      [
        createWorkingMemory("working-a", "task-a"),
        createWorkingMemory("working-b", "task-b"),
      ],
      clock,
    );
    const result = await service.retrieve(
      createMemoryQuery(
        ["working"],
        createMemoryScope(["memory:read:working"], { taskId: "task-a" }),
      ),
    );

    expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
      "working-a",
    ]);
  });

  it("retrieves conversation memory only for the active session", async () => {
    const service = new InMemoryMemoryService(
      [
        createConversationMemory("conversation-a", "session-a"),
        createConversationMemory("conversation-b", "session-b"),
      ],
      clock,
    );
    const result = await service.retrieve(
      createMemoryQuery(
        ["conversation"],
        createMemoryScope(["memory:read:conversation"], {
          sessionId: "session-b",
        }),
      ),
    );

    expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
      "conversation-b",
    ]);
  });

  it("retrieves only the active actor's approved user memory", async () => {
    const service = new InMemoryMemoryService(
      [
        createUserMemory("user-own"),
        createUserMemory("user-other", {
          approval: {
            approvedAt: "2026-07-01T09:00:00.000Z",
            approvedBy: "actor-other",
          },
          ownerId: "actor-other",
        }),
      ],
      clock,
    );
    const result = await service.retrieve(
      createMemoryQuery(
        ["user"],
        createMemoryScope(["memory:read:user"]),
      ),
    );

    expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
      "user-own",
    ]);
  });

  it("retrieves semantic memory by bounded text search", async () => {
    const service = new InMemoryMemoryService(
      [
        createSemanticMemory("semantic-match", {
          content: { fact: "MV AI OS is modular" },
          searchableText: "modular architecture",
        }),
        createSemanticMemory("semantic-other", {
          content: { fact: "Unrelated context" },
        }),
      ],
      clock,
    );
    const result = await service.retrieve(
      createMemoryQuery(
        ["semantic"],
        createMemoryScope(["memory:read:semantic"]),
        { text: "modular" },
      ),
    );

    expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
      "semantic-match",
    ]);
  });

  it("isolates working memory between request tasks", async () => {
    const service = new InMemoryMemoryService(
      [createWorkingMemory("working-request-a", "task-a")],
      clock,
    );
    const result = await service.retrieve(
      createMemoryQuery(
        ["working"],
        createMemoryScope(["memory:read:working"], { taskId: "task-b" }),
      ),
    );

    expect(result.records).toEqual([]);
  });

  it("denies retrieval without the category permission", async () => {
    const service = new InMemoryMemoryService(
      [createUserMemory("user-own")],
      clock,
    );

    await expect(
      service.retrieve(
        createMemoryQuery(["user"], createMemoryScope([])),
      ),
    ).rejects.toMatchObject({
      code: "memory_permission_denied",
    });
  });

  it("filters records outside the scope's permission tags", async () => {
    const service = new InMemoryMemoryService(
      [
        createSemanticMemory("tagged-memory", {
          permissionTags: ["project:alpha"],
        }),
      ],
      clock,
    );
    const withoutTag = await service.retrieve(
      createMemoryQuery(
        ["semantic"],
        createMemoryScope(["memory:read:semantic"]),
      ),
    );
    const withTag = await service.retrieve(
      createMemoryQuery(
        ["semantic"],
        createMemoryScope(["memory:read:semantic"], {
          permissionTags: ["project:alpha"],
        }),
      ),
    );

    expect(withoutTag.records).toEqual([]);
    expect(withTag.records.map(({ memoryId }) => memoryId)).toEqual([
      "tagged-memory",
    ]);
  });

  it("returns an empty result when no memory matches", async () => {
    const service = new InMemoryMemoryService([], clock);
    const result = await service.retrieve(
      createMemoryQuery(
        ["semantic"],
        createMemoryScope(["memory:read:semantic"]),
      ),
    );

    expect(result).toEqual({
      queryId: "memory-query-001",
      records: [],
    });
  });

  it("rejects invalid queries before retrieval", async () => {
    const service = new InMemoryMemoryService([], clock);
    const invalidQuery = createMemoryQuery(
      ["working"],
      createMemoryScope(["memory:read:working"]),
    );

    await expect(service.retrieve(invalidQuery)).rejects.toMatchObject({
      code: "memory_request_invalid",
    });
  });

  it("writes through the service boundary and retrieves the new record", async () => {
    const service = new InMemoryMemoryService([], clock);
    const scope = createMemoryScope(["memory:read:working"], {
      taskId: "task-a",
    });
    await service.write({
      record: createWorkingMemory("working-new", "task-a"),
      scope,
    });

    const result = await service.retrieve(
      createMemoryQuery(["working"], scope),
    );

    expect(result.records.map(({ memoryId }) => memoryId)).toEqual([
      "working-new",
    ]);
  });
});
