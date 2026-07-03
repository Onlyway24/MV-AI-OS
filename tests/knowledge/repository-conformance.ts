import { describe, expect, it } from "vitest";

import type { KnowledgeRepository } from "../../src/index.js";
import {
  createKnowledgeRecord,
  createKnowledgeSource,
  createRepositorySearch,
} from "./fixtures.js";

export type KnowledgeRepositoryFactory = () => KnowledgeRepository;

export function runKnowledgeRepositoryConformance(
  name: string,
  createRepository: KnowledgeRepositoryFactory,
): void {
  describe(`${name} knowledge repository conformance`, () => {
    it("accepts valid records and returns immutable copies", async () => {
      const repository = createRepository();
      const record = createKnowledgeRecord("knowledge-001");

      await repository.insert(record);
      const stored = await repository.getById(record.knowledgeId);

      expect(stored).toEqual(record);
      expect(stored).not.toBe(record);
      expect(Object.isFrozen(stored)).toBe(true);
      expect(Object.isFrozen(stored?.content)).toBe(true);
    });

    it("rejects invalid records and duplicate identifiers", async () => {
      const repository = createRepository();
      const record = createKnowledgeRecord("knowledge-001");
      await repository.insert(record);

      await expect(repository.insert(record)).rejects.toMatchObject({
        code: "repository_conflict",
      });
      await expect(
        repository.insert({
          ...createKnowledgeRecord("knowledge-invalid"),
          verifiedAt: "invalid",
        }),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
      });
    });

    it("enforces workspace, actor, required scope, and permission tags", async () => {
      const repository = createRepository();
      for (const record of [
        createKnowledgeRecord("allowed"),
        createKnowledgeRecord("other-workspace", {
          workspaceId: "workspace-other",
        }),
        createKnowledgeRecord("other-actor", {
          ownerId: "actor-other",
          visibility: "actor",
        }),
        createKnowledgeRecord("restricted-scope", {
          requiredScopes: ["finance"],
        }),
        createKnowledgeRecord("restricted-tag", {
          permissionTags: ["confidential"],
        }),
      ]) {
        await repository.insert(record);
      }

      const records = await repository.search(createRepositorySearch());

      expect(records.map(({ knowledgeId }) => knowledgeId)).toEqual([
        "allowed",
      ]);
    });

    it("filters by tags, source type, and freshness", async () => {
      const repository = createRepository();
      for (const record of [
        createKnowledgeRecord("fresh-document", {
          source: {
            ...createKnowledgeSource(),
            sourceId: "source-fresh-document",
            sourceType: "document",
          },
          tags: ["product", "release"],
          verifiedAt: "2026-07-02T09:00:00.000Z",
        }),
        createKnowledgeRecord("stale-document", {
          tags: ["product", "release"],
          verifiedAt: "2026-06-01T09:00:00.000Z",
        }),
        createKnowledgeRecord("fresh-web", {
          source: {
            ...createKnowledgeSource(),
            sourceId: "source-fresh-web",
            sourceType: "web",
          },
          tags: ["product", "release"],
          verifiedAt: "2026-07-02T09:00:00.000Z",
        }),
      ]) {
        await repository.insert(record);
      }

      const records = await repository.search(
        createRepositorySearch({
          freshAfter: "2026-07-01T00:00:00.000Z",
          sourceTypes: ["document"],
          tags: ["release"],
          text: "fresh-document",
        }),
      );

      expect(records.map(({ knowledgeId }) => knowledgeId)).toEqual([
        "fresh-document",
      ]);
    });

    it("excludes expired and deleted records and returns deterministic bounded results", async () => {
      const repository = createRepository();
      for (const record of [
        createKnowledgeRecord("knowledge-b", {
          verifiedAt: "2026-07-02T09:00:00.000Z",
        }),
        createKnowledgeRecord("knowledge-a", {
          verifiedAt: "2026-07-02T09:00:00.000Z",
        }),
        createKnowledgeRecord("knowledge-newest", {
          verifiedAt: "2026-07-02T09:30:00.000Z",
        }),
        createKnowledgeRecord("expired", {
          expiresAt: "2026-07-02T09:00:00.000Z",
        }),
        createKnowledgeRecord("deleted", {
          deletedAt: "2026-07-02T09:00:00.000Z",
        }),
      ]) {
        await repository.insert(record);
      }

      const records = await repository.search(
        createRepositorySearch({ limit: 2 }),
      );

      expect(records.map(({ knowledgeId }) => knowledgeId)).toEqual([
        "knowledge-newest",
        "knowledge-a",
      ]);
    });

    it("rejects invalid repository searches", async () => {
      const repository = createRepository();

      await expect(
        repository.search(
          createRepositorySearch({
            freshAfter: "invalid",
          }),
        ),
      ).rejects.toMatchObject({
        code: "repository_record_invalid",
      });
    });
  });
}
