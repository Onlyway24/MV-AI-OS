import { describe, expect, it } from "vitest";

import type {
  MemoryRecord,
  MemoryRepository,
} from "../../src/index.js";
import {
  createConversationMemory,
  createMemoryRepositorySearch,
  createSemanticMemory,
  createUserMemory,
  createWorkingMemory,
} from "./fixtures.js";

export type MemoryRepositoryFactory = () => MemoryRepository;

export function runMemoryRepositoryConformance(
  name: string,
  createRepository: MemoryRepositoryFactory,
): void {
  describe(`${name} memory repository conformance`, () => {
    it("accepts valid records and returns immutable copies", async () => {
      const repository = createRepository();
      const record = createSemanticMemory("memory-001");

      await repository.insert(record);
      const stored = await repository.getById(record.memoryId);

      expect(stored).toEqual(record);
      expect(stored).not.toBe(record);
      expect(Object.isFrozen(stored)).toBe(true);
      expect(Object.isFrozen(stored?.content)).toBe(true);
      expect(Object.isFrozen(stored?.permissionTags)).toBe(true);
    });

    it("rejects invalid records and duplicate identifiers", async () => {
      const repository = createRepository();
      const record = createSemanticMemory("memory-001");
      await repository.insert(record);

      await expect(repository.insert(record)).rejects.toMatchObject({
        code: "repository_conflict",
      });
      await expect(
        repository.insert({
          ...createSemanticMemory("memory-invalid"),
          confidence: 2,
        }),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
      });
    });

    it("enforces workspace, actor, category scopes, tags, expiry, deletion, and text", async () => {
      const repository = createRepository();
      const records: readonly MemoryRecord[] = [
        createSemanticMemory("allowed", {
          content: { topic: "durable architecture" },
          permissionTags: ["project:alpha"],
          searchableText: "sqlite durable memory",
        }),
        createSemanticMemory("other-workspace", {
          workspaceId: "workspace-other",
        }),
        createSemanticMemory("other-owner", {
          ownerId: "actor-other",
          visibility: "owner",
        }),
        createSemanticMemory("expired", {
          expiresAt: "2026-07-02T09:00:00.000Z",
        }),
        createSemanticMemory("deleted", {
          deletedAt: "2026-07-02T09:00:00.000Z",
        }),
        createWorkingMemory("working-other-task", "task-other"),
        createConversationMemory(
          "conversation-other-session",
          "session-other",
        ),
        createUserMemory("user-other", {
          ownerId: "actor-other",
        }),
      ];
      for (const record of records) {
        await repository.insert(record);
      }

      const result = await repository.search(
        createMemoryRepositorySearch({
          permissionTags: ["project:alpha"],
          text: "durable",
        }),
      );

      expect(result.map(({ memoryId }) => memoryId)).toEqual(["allowed"]);
    });

    it("filters task and session scoped categories", async () => {
      const repository = createRepository();
      for (const record of [
        createWorkingMemory("working-a", "task-a"),
        createWorkingMemory("working-b", "task-b"),
        createConversationMemory("conversation-a", "session-a"),
        createConversationMemory("conversation-b", "session-b"),
      ]) {
        await repository.insert(record);
      }

      const result = await repository.search(
        createMemoryRepositorySearch({
          categories: ["conversation", "working"],
          sessionId: "session-a",
          taskId: "task-b",
        }),
      );

      expect(result.map(({ memoryId }) => memoryId)).toEqual([
        "conversation-a",
        "working-b",
      ]);
    });

    it("updates with optimistic conflict detection and preserves ownership", async () => {
      const repository = createRepository();
      const record = createSemanticMemory("memory-update");
      await repository.insert(record);
      const deleted = {
        ...record,
        deletedAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      };

      await repository.update(deleted, {
        updatedAt: record.updatedAt,
      });
      await expect(
        repository.update(
          {
            ...deleted,
            updatedAt: "2026-07-02T11:00:00.000Z",
          },
          { updatedAt: record.updatedAt },
        ),
      ).rejects.toMatchObject({ code: "repository_conflict" });
      await expect(
        repository.update(
          {
            ...deleted,
            ownerId: "actor-other",
            updatedAt: "2026-07-02T11:00:00.000Z",
          },
          { updatedAt: deleted.updatedAt },
        ),
      ).rejects.toMatchObject({ code: "repository_conflict" });

      await expect(
        repository.search(createMemoryRepositorySearch()),
      ).resolves.toEqual([]);
      await expect(repository.getById(record.memoryId)).resolves.toEqual(
        deleted,
      );
    });

    it("returns deterministic bounded results", async () => {
      const repository = createRepository();
      for (const record of [
        createSemanticMemory("memory-b"),
        createSemanticMemory("memory-a"),
        createSemanticMemory("memory-newest", {
          createdAt: "2026-07-02T09:00:00.000Z",
          updatedAt: "2026-07-02T09:00:00.000Z",
        }),
      ]) {
        await repository.insert(record);
      }

      const result = await repository.search(
        createMemoryRepositorySearch({ limit: 2 }),
      );

      expect(result.map(({ memoryId }) => memoryId)).toEqual([
        "memory-newest",
        "memory-a",
      ]);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("rejects invalid repository searches", async () => {
      const repository = createRepository();

      await expect(
        repository.search(
          createMemoryRepositorySearch({
            categories: ["working"],
          }),
        ),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
      });
    });
  });
}
