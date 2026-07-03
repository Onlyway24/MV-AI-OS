import { describe, expect, it } from "vitest";

import {
  MemoryQueryValidator,
  MemoryRecordValidator,
  MemoryScopeValidator,
  RepositoryBackedMemoryService,
  type MemoryRecord,
  type MemoryRepository,
  type MemoryRepositorySearch,
  type MemoryUpdateExpectation,
} from "../../src/index.js";
import { InMemoryMemoryRepository } from "../../src/memory/testing/in-memory-memory-repository.js";
import { FixedClock } from "../support/fixtures.js";
import {
  createMemoryQuery,
  createMemoryScope,
  createSemanticMemory,
  createWorkingMemory,
} from "./fixtures.js";

describe("RepositoryBackedMemoryService", () => {
  it("writes, retrieves, and soft-deletes through the repository", async () => {
    const repository = new InMemoryMemoryRepository();
    const service = createService(repository);
    const record = createWorkingMemory("working-durable", "task-a");
    const scope = createMemoryScope(["memory:read:working"], {
      taskId: "task-a",
    });

    await expect(service.write({ record, scope })).resolves.toEqual(record);
    await expect(
      service.retrieve(createMemoryQuery(["working"], scope)),
    ).resolves.toMatchObject({
      records: [expect.objectContaining({ memoryId: record.memoryId })],
    });
    await expect(
      service.delete({
        deletedAt: "2026-07-02T09:00:00.000Z",
        memoryId: record.memoryId,
        scope,
      }),
    ).resolves.toBe(true);
    await expect(
      service.retrieve(createMemoryQuery(["working"], scope)),
    ).resolves.toMatchObject({ records: [] });
  });

  it("keeps permission denial ahead of repository access", async () => {
    const repository = new RecordingMemoryRepository(
      new InMemoryMemoryRepository([
        createSemanticMemory("semantic-private"),
      ]),
    );
    const service = createService(repository);

    await expect(
      service.retrieve(
        createMemoryQuery(["semantic"], createMemoryScope([])),
      ),
    ).rejects.toMatchObject({
      code: "memory_permission_denied",
    });
    expect(repository.searchCount).toBe(0);
  });

  it("rejects repository records outside the authorized search", async () => {
    const service = createService(
      new OutOfScopeMemoryRepository(
        createSemanticMemory("other-workspace", {
          workspaceId: "workspace-other",
        }),
      ),
    );

    await expect(
      service.retrieve(
        createMemoryQuery(
          ["semantic"],
          createMemoryScope(["memory:read:semantic"]),
        ),
      ),
    ).rejects.toMatchObject({
      code: "memory_request_invalid",
    });
  });

  it("normalizes duplicate repository identities as memory conflicts", async () => {
    const repository = new InMemoryMemoryRepository();
    const service = createService(repository);
    const record = createSemanticMemory("semantic-duplicate");
    const scope = createMemoryScope(["memory:read:semantic"]);

    await service.write({ record, scope });
    await expect(service.write({ record, scope })).rejects.toMatchObject({
      code: "memory_conflict",
    });
  });
});

class RecordingMemoryRepository implements MemoryRepository {
  public searchCount = 0;
  readonly #delegate: MemoryRepository;

  public constructor(delegate: MemoryRepository) {
    this.#delegate = delegate;
  }

  public getById(
    memoryId: string,
  ): Promise<MemoryRecord | undefined> {
    return this.#delegate.getById(memoryId);
  }

  public insert(record: MemoryRecord): Promise<void> {
    return this.#delegate.insert(record);
  }

  public update(
    record: MemoryRecord,
    expectation: MemoryUpdateExpectation,
  ): Promise<void> {
    return this.#delegate.update(record, expectation);
  }

  public search(
    query: MemoryRepositorySearch,
  ): Promise<readonly MemoryRecord[]> {
    this.searchCount += 1;
    return this.#delegate.search(query);
  }
}

class OutOfScopeMemoryRepository implements MemoryRepository {
  readonly #record: MemoryRecord;

  public constructor(record: MemoryRecord) {
    this.#record = record;
  }

  public getById(): Promise<MemoryRecord | undefined> {
    return Promise.resolve(undefined);
  }

  public insert(): Promise<void> {
    return Promise.resolve();
  }

  public update(): Promise<void> {
    return Promise.resolve();
  }

  public search(): Promise<readonly MemoryRecord[]> {
    return Promise.resolve([this.#record]);
  }
}

function createService(
  repository: MemoryRepository,
): RepositoryBackedMemoryService {
  return new RepositoryBackedMemoryService({
    clock: new FixedClock("2026-07-02T10:00:00.000Z"),
    queryValidator: new MemoryQueryValidator(),
    recordValidator: new MemoryRecordValidator(),
    repository,
    scopeValidator: new MemoryScopeValidator(),
  });
}
