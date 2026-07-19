import {
  access,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  ContentAgent,
  CONTENT_AGENT_MANIFEST,
  ContentOutputValidator,
  createLocalRuntime,
  createSqliteBackup,
  restoreSqliteBackup,
  SQLITE_SCHEMA_VERSION,
  SqliteBackupConfigValidator,
  SqliteKnowledgeRepository,
  SqliteMemoryRepository,
  SqliteRepositoryTransactionRunner,
  SqliteRestoreConfigValidator,
  type AgentExecutor,
  type AgentInvocation,
  type AuditEvent,
  type EffectivePermission,
  type IdentifierGenerator,
  type IdentifierScope,
  type LocalRuntimeConfig,
  type TaskResponse,
} from "../../src/index.js";
import { createKnowledgeRecord } from "../knowledge/fixtures.js";
import { createSemanticMemory } from "../memory/fixtures.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";

const FULL_PERMISSIONS: readonly EffectivePermission[] = Object.freeze([
  "knowledge:search",
  "memory:read:semantic",
]);

describe("Controlled SQLite backup and restore", () => {
  it("validates backup and restore configuration contracts", () => {
    const backup = createBackupConfig(
      "/tmp/source.sqlite",
      "/tmp/backup.sqlite",
    );
    const restore = createRestoreConfig(
      "/tmp/backup.sqlite",
      "/tmp/restored.sqlite",
    );

    expect(new SqliteBackupConfigValidator().validate(backup)).toEqual({
      ok: true,
      value: backup,
    });
    expect(new SqliteRestoreConfigValidator().validate(restore)).toEqual({
      ok: true,
      value: restore,
    });
    expect(
      new SqliteBackupConfigValidator().validate({
        ...backup,
        sourcePath: "relative.sqlite",
      }),
    ).toMatchObject({
      issues: [{ code: "invalid_value", path: "sourcePath" }],
      ok: false,
    });
    expect(
      new SqliteRestoreConfigValidator().validate({
        ...restore,
        contractVersion: "2",
      }),
    ).toMatchObject({
      issues: [{ code: "unsupported_version", path: "contractVersion" }],
      ok: false,
    });
  });

  it("creates a validated backup containing lifecycle, audit, memory, and knowledge data", async () => {
    await withTemporaryDirectory(async (directory) => {
      const sourcePath = join(directory, "runtime.sqlite");
      const backupPath = join(directory, "runtime.backup.sqlite");
      const request = createRequest();
      const response = await seedRuntime(sourcePath, request);

      const result = await createSqliteBackup(
        createBackupConfig(sourcePath, backupPath),
      );

      expect(typeof result.pageCount).toBe("number");
      expect(result).toEqual({
        backupPath,
        contractVersion: "1",
        pageCount: result.pageCount,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        sourcePath,
      });
      await expect(access(backupPath)).resolves.toBeUndefined();
      expect((await stat(backupPath)).mode & 0o777).toBe(0o600);
      const state = await readDurableState(
        backupPath,
        request.requestId,
      );
      expect(state.audits.map(({ eventType }) => eventType)).toContain(
        "task.completed",
      );
      expect(state).toMatchObject({
        knowledgeId: "knowledge-backup",
        memoryId: "memory-backup",
        requestResponse: response,
        taskState: "completed",
      });
    });
  });

  it("restores a backup and replays the stored task result through a recreated runtime", async () => {
    await withTemporaryDirectory(async (directory) => {
      const sourcePath = join(directory, "runtime.sqlite");
      const backupPath = join(directory, "runtime.backup.sqlite");
      const restoredPath = join(directory, "runtime.restored.sqlite");
      const request = createRequest();
      const response = await seedRuntime(sourcePath, request);
      await createSqliteBackup(createBackupConfig(sourcePath, backupPath));

      await expect(
        restoreSqliteBackup(
          createRestoreConfig(backupPath, restoredPath),
        ),
      ).resolves.toEqual({
        backupPath,
        contractVersion: "1",
        destinationPath: restoredPath,
        schemaVersion: SQLITE_SCHEMA_VERSION,
      });

      await expect(readDurableState(restoredPath, request.requestId))
        .resolves.toMatchObject({
          knowledgeId: "knowledge-backup",
          memoryId: "memory-backup",
          requestResponse: response,
          taskState: "completed",
        });
      expect((await stat(restoredPath)).mode & 0o777).toBe(0o600);

      const executor = new CountingExecutor(
        new ContentAgent(new FixedClock(), new ContentOutputValidator()),
      );
      const runtime = await createLocalRuntime(createConfig(restoredPath), {
        clock: new FixedClock(),
        contentAgentExecutor: executor,
        identifiers: new PrefixedIdentifierGenerator("restored"),
      });
      await expect(runtime.execute(request)).resolves.toEqual(response);
      expect(executor.invocationCount).toBe(0);
      await runtime.close();
    });
  });

  it("fails closed for missing source paths and does not create a destination", async () => {
    await withTemporaryDirectory(async (directory) => {
      const missingSource = join(directory, "missing.sqlite");
      const backupPath = join(directory, "backup.sqlite");

      await expect(
        createSqliteBackup(createBackupConfig(missingSource, backupPath)),
      ).rejects.toMatchObject({
        code: "sqlite_backup_path_invalid",
      });
      await expect(access(backupPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("rejects invalid restore files without leaving a partial destination", async () => {
    await withTemporaryDirectory(async (directory) => {
      const invalidBackup = join(directory, "invalid.sqlite");
      const restoredPath = join(directory, "restored.sqlite");
      await writeFile(invalidBackup, "not a sqlite database");

      await expect(
        restoreSqliteBackup(
          createRestoreConfig(invalidBackup, restoredPath),
        ),
      ).rejects.toMatchObject({
        code: "sqlite_restore_failed",
      });
      await expect(access(restoredPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("rejects schema mismatches for backup and restore", async () => {
    await withTemporaryDirectory(async (directory) => {
      const mismatched = join(directory, "newer.sqlite");
      const backupPath = join(directory, "backup.sqlite");
      const restoredPath = join(directory, "restored.sqlite");
      const database = new DatabaseSync(mismatched);
      database.exec("PRAGMA application_id = 1297498441");
      database.exec("PRAGMA user_version = 999");
      database.close();

      await expect(
        createSqliteBackup(createBackupConfig(mismatched, backupPath)),
      ).rejects.toMatchObject({
        code: "sqlite_schema_unsupported",
      });
      await expect(
        restoreSqliteBackup(createRestoreConfig(mismatched, restoredPath)),
      ).rejects.toMatchObject({
        code: "sqlite_schema_unsupported",
      });
    });
  });

  it("refuses to overwrite destinations unless explicitly permitted", async () => {
    await withTemporaryDirectory(async (directory) => {
      const sourcePath = join(directory, "runtime.sqlite");
      const backupPath = join(directory, "backup.sqlite");
      const existingBackupPath = join(directory, "existing-backup.sqlite");
      const existingRestorePath = join(directory, "existing-restore.sqlite");
      await seedRuntime(sourcePath, createRequest());
      await createSqliteBackup(createBackupConfig(sourcePath, backupPath));
      await writeFile(existingBackupPath, "existing");
      await writeFile(existingRestorePath, "existing");

      await expect(
        createSqliteBackup(
          createBackupConfig(sourcePath, existingBackupPath),
        ),
      ).rejects.toMatchObject({
        code: "sqlite_backup_path_invalid",
      });
      await expect(
        restoreSqliteBackup(
          createRestoreConfig(backupPath, existingRestorePath),
        ),
      ).rejects.toMatchObject({
        code: "sqlite_restore_path_invalid",
      });

      await expect(
        createSqliteBackup(
          createBackupConfig(sourcePath, existingBackupPath, true),
        ),
      ).resolves.toMatchObject({
        backupPath: existingBackupPath,
      });
      await expect(
        restoreSqliteBackup(
          createRestoreConfig(backupPath, existingRestorePath, true),
        ),
      ).resolves.toMatchObject({
        destinationPath: existingRestorePath,
      });
    });
  });

  it("rejects destination directories and missing destination parents", async () => {
    await withTemporaryDirectory(async (directory) => {
      const sourcePath = join(directory, "runtime.sqlite");
      await seedRuntime(sourcePath, createRequest());
      const destinationDirectory = join(directory, "destination-dir");
      await mkdir(destinationDirectory);

      await expect(
        createSqliteBackup(
          createBackupConfig(sourcePath, destinationDirectory, true),
        ),
      ).rejects.toMatchObject({
        code: "sqlite_backup_path_invalid",
      });
      await expect(
        createSqliteBackup(
          createBackupConfig(
            sourcePath,
            join(directory, "missing-parent", "backup.sqlite"),
          ),
        ),
      ).rejects.toMatchObject({
        code: "sqlite_backup_path_invalid",
      });
    });
  });
});

class CountingExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });
  public invocationCount = 0;
  readonly #delegate: AgentExecutor;

  public constructor(delegate: AgentExecutor) {
    this.#delegate = delegate;
  }

  public execute(invocation: AgentInvocation): Promise<unknown> {
    this.invocationCount += 1;
    return this.#delegate.execute(invocation);
  }
}

class PrefixedIdentifierGenerator implements IdentifierGenerator {
  #sequence = 0;
  readonly #prefix: string;

  public constructor(prefix: string) {
    this.#prefix = prefix;
  }

  public next(scope: IdentifierScope): string {
    this.#sequence += 1;
    return `${this.#prefix}-${scope}-${String(this.#sequence)}`;
  }
}

async function seedRuntime(
  databasePath: string,
  request: ReturnType<typeof createRequest>,
) {
  await seedContext(databasePath, request.instruction);
  const runtime = await createLocalRuntime(createConfig(databasePath), {
    clock: new FixedClock(),
    identifiers: new PrefixedIdentifierGenerator("source"),
  });
  const response = await runtime.execute(request);
  await runtime.close();
  return response;
}

async function seedContext(
  databasePath: string,
  searchableText: string,
): Promise<void> {
  const memory = new SqliteMemoryRepository({
    path: databasePath,
    timeoutMs: 1_000,
  });
  await memory.insert(
    createSemanticMemory("memory-backup", {
      content: { preference: "Prefer recoverable local state." },
      visibility: "workspace",
    }),
  );
  await memory.close();

  const knowledge = new SqliteKnowledgeRepository({
    path: databasePath,
    timeoutMs: 1_000,
  });
  await knowledge.insert(
    createKnowledgeRecord("knowledge-backup", {
      content: { fact: "Backups preserve the local SQLite source of truth." },
      searchableText,
    }),
  );
  await knowledge.close();
}

async function readDurableState(
  databasePath: string,
  requestId: string,
): Promise<{
  readonly audits: readonly AuditEvent[];
  readonly knowledgeId: string | undefined;
  readonly memoryId: string | undefined;
  readonly requestResponse: TaskResponse | undefined;
  readonly taskState: string | undefined;
}> {
  const lifecycle = new SqliteRepositoryTransactionRunner({
    path: databasePath,
    timeoutMs: 1_000,
  });
  const lifecycleState = await lifecycle.transaction(
    async ({ audits, requests, tasks }) => {
      const request = await requests.getById(requestId);
      const task =
        request === undefined
          ? undefined
          : await tasks.getById(request.taskId);
      return {
        audits:
          task === undefined
            ? []
            : await audits.listByCorrelationId(task.correlationId),
        requestResponse: request?.response,
        taskState: task?.state,
      };
    },
  );
  await lifecycle.close();

  const memory = new SqliteMemoryRepository({
    path: databasePath,
    timeoutMs: 1_000,
  });
  const memoryRecord = await memory.getById("memory-backup");
  await memory.close();

  const knowledge = new SqliteKnowledgeRepository({
    path: databasePath,
    timeoutMs: 1_000,
  });
  const knowledgeRecord = await knowledge.getById("knowledge-backup");
  await knowledge.close();

  return {
    ...lifecycleState,
    knowledgeId: knowledgeRecord?.knowledgeId,
    memoryId: memoryRecord?.memoryId,
  };
}

function createConfig(databasePath: string): LocalRuntimeConfig {
  return {
    actorId: "actor-local",
    contentAgentMode: "deterministic",
    contractVersion: "1",
    permissions: {
      actorGrants: FULL_PERMISSIONS,
      policyGrants: FULL_PERMISSIONS,
      taskGrants: FULL_PERMISSIONS,
    },
    sqlite: {
      path: databasePath,
      timeoutMs: 1_000,
    },
    workspaceId: "workspace-local",
  };
}

function createBackupConfig(
  sourcePath: string,
  destinationPath: string,
  overwriteDestination = false,
) {
  return {
    contractVersion: "1",
    destinationPath,
    overwriteDestination,
    sourcePath,
    timeoutMs: 1_000,
  };
}

function createRestoreConfig(
  backupPath: string,
  destinationPath: string,
  overwriteDestination = false,
) {
  return {
    backupPath,
    contractVersion: "1",
    destinationPath,
    overwriteDestination,
    timeoutMs: 1_000,
  };
}

async function withTemporaryDirectory(
  test: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-backup-"));
  try {
    await test(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
