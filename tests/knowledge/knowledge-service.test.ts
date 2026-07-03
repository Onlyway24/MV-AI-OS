import { describe, expect, it } from "vitest";

import {
  KnowledgeQueryValidator,
  KnowledgeRecordValidator,
  KnowledgeSearchResultValidator,
  RepositoryBackedKnowledgeService,
  type KnowledgeRecord,
  type KnowledgeRepository,
  type KnowledgeRepositorySearch,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";
import { InMemoryKnowledgeRepository } from "../support/in-memory-knowledge-repository.js";
import {
  createKnowledgeQuery,
  createKnowledgeRecord,
  createKnowledgeScope,
  createKnowledgeSource,
} from "./fixtures.js";

describe("RepositoryBackedKnowledgeService", () => {
  it("returns deterministic results for the authorized workspace", async () => {
    const service = createService([
      createKnowledgeRecord("knowledge-b", {
        verifiedAt: "2026-07-02T09:00:00.000Z",
      }),
      createKnowledgeRecord("knowledge-a", {
        verifiedAt: "2026-07-02T09:00:00.000Z",
      }),
      createKnowledgeRecord("knowledge-newest", {
        verifiedAt: "2026-07-02T09:30:00.000Z",
      }),
      createKnowledgeRecord("other-workspace", {
        workspaceId: "workspace-other",
      }),
    ]);

    const result = await service.search(
      createKnowledgeQuery({ limit: 3 }),
    );

    expect(result.records.map(({ knowledgeId }) => knowledgeId)).toEqual([
      "knowledge-newest",
      "knowledge-a",
      "knowledge-b",
    ]);
    expect(result.searchedAt).toBe("2026-07-02T10:00:00.000Z");
  });

  it("enforces actor visibility, allowed scopes, and permission tags", async () => {
    const service = createService([
      createKnowledgeRecord("allowed", {
        permissionTags: ["project:alpha"],
        requiredScopes: ["brand"],
      }),
      createKnowledgeRecord("other-actor", {
        ownerId: "actor-other",
        visibility: "actor",
      }),
      createKnowledgeRecord("other-scope", {
        requiredScopes: ["finance"],
      }),
      createKnowledgeRecord("other-permission-tag", {
        permissionTags: ["confidential"],
      }),
    ]);

    const result = await service.search(
      createKnowledgeQuery({
        scope: createKnowledgeScope({
          allowedScopes: ["brand"],
          permissionTags: ["project:alpha"],
        }),
      }),
    );

    expect(result.records.map(({ knowledgeId }) => knowledgeId)).toEqual([
      "allowed",
    ]);
  });

  it("filters by tags, source type, freshness, and text", async () => {
    const service = createService([
      createKnowledgeRecord("fresh-document", {
        searchableText: "modular orchestration",
        source: {
          ...createKnowledgeSource(),
          sourceId: "source-fresh-document",
          sourceType: "document",
        },
        tags: ["architecture", "product"],
        verifiedAt: "2026-07-02T09:00:00.000Z",
      }),
      createKnowledgeRecord("stale-document", {
        searchableText: "modular orchestration",
        tags: ["architecture", "product"],
        verifiedAt: "2026-06-01T09:00:00.000Z",
      }),
      createKnowledgeRecord("fresh-web", {
        searchableText: "modular orchestration",
        source: {
          ...createKnowledgeSource(),
          sourceId: "source-fresh-web",
          sourceType: "web",
        },
        tags: ["architecture", "product"],
        verifiedAt: "2026-07-02T09:00:00.000Z",
      }),
    ]);

    const result = await service.search(
      createKnowledgeQuery({
        freshAfter: "2026-07-01T00:00:00.000Z",
        sourceTypes: ["document"],
        tags: ["architecture"],
        text: "modular",
      }),
    );

    expect(result.records.map(({ knowledgeId }) => knowledgeId)).toEqual([
      "fresh-document",
    ]);
  });

  it("denies missing effective permission before repository access", async () => {
    const repository = new RecordingKnowledgeRepository(
      new InMemoryKnowledgeRepository([
        createKnowledgeRecord("knowledge-001"),
      ]),
    );
    const service = createService([], repository);

    await expect(
      service.search(
        createKnowledgeQuery({
          scope: createKnowledgeScope({
            effectivePermissions: [],
          }),
        }),
      ),
    ).rejects.toMatchObject({
      category: "authorization",
      code: "knowledge_permission_denied",
    });
    expect(repository.searches).toEqual([]);
  });

  it("rejects malformed queries before repository access", async () => {
    const repository = new RecordingKnowledgeRepository(
      new InMemoryKnowledgeRepository(),
    );
    const service = createService([], repository);

    await expect(
      service.search({
        ...createKnowledgeQuery(),
        limit: 0,
      }),
    ).rejects.toMatchObject({
      code: "knowledge_contract_invalid",
    });
    expect(repository.searches).toEqual([]);
  });

  it("rejects repository records outside the authorized scope", async () => {
    const repository = new InMemoryKnowledgeRepository([
      createKnowledgeRecord("other-workspace", {
        workspaceId: "workspace-other",
      }),
    ]);
    const service = createService(
      [],
      new OutOfScopeKnowledgeRepository(repository),
    );

    await expect(
      service.search(createKnowledgeQuery()),
    ).rejects.toMatchObject({
      code: "knowledge_invariant_violated",
    });
  });
});

class RecordingKnowledgeRepository implements KnowledgeRepository {
  public readonly searches: KnowledgeRepositorySearch[] = [];
  readonly #delegate: KnowledgeRepository;

  public constructor(delegate: KnowledgeRepository) {
    this.#delegate = delegate;
  }

  public getById(
    knowledgeId: string,
  ): Promise<KnowledgeRecord | undefined> {
    return this.#delegate.getById(knowledgeId);
  }

  public insert(record: KnowledgeRecord): Promise<void> {
    return this.#delegate.insert(record);
  }

  public search(
    query: KnowledgeRepositorySearch,
  ): Promise<readonly KnowledgeRecord[]> {
    this.searches.push(query);
    return this.#delegate.search(query);
  }
}

class OutOfScopeKnowledgeRepository implements KnowledgeRepository {
  readonly #delegate: KnowledgeRepository;

  public constructor(delegate: KnowledgeRepository) {
    this.#delegate = delegate;
  }

  public getById(
    knowledgeId: string,
  ): Promise<KnowledgeRecord | undefined> {
    return this.#delegate.getById(knowledgeId);
  }

  public insert(record: KnowledgeRecord): Promise<void> {
    return this.#delegate.insert(record);
  }

  public async search(): Promise<readonly KnowledgeRecord[]> {
    const record = await this.#delegate.getById("other-workspace");
    return record === undefined ? [] : [record];
  }
}

function createService(
  records: readonly KnowledgeRecord[],
  repository: KnowledgeRepository = new InMemoryKnowledgeRepository(
    records,
  ),
): RepositoryBackedKnowledgeService {
  return new RepositoryBackedKnowledgeService({
    clock: new FixedClock("2026-07-02T10:00:00.000Z"),
    queryValidator: new KnowledgeQueryValidator(),
    recordValidator: new KnowledgeRecordValidator(),
    repository,
    resultValidator: new KnowledgeSearchResultValidator(),
  });
}
