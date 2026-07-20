import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ContentAgent,
  CONTENT_AGENT_MANIFEST,
  ContentOutputValidator,
  createLocalRuntime,
  referenceInputFingerprint,
  SqliteKnowledgeRepository,
  SqliteMemoryRepository,
  type AgentExecutor,
  type AgentInvocation,
  type EffectivePermission,
  type IdentifierGenerator,
  type IdentifierScope,
  type LocalContentAgentMode,
  type LocalRuntimeConfig,
} from "../../src/index.js";
import { createKnowledgeRecord } from "../knowledge/fixtures.js";
import { createSemanticMemory } from "../memory/fixtures.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";

const FULL_PERMISSIONS: readonly EffectivePermission[] = Object.freeze([
  "knowledge:search",
  "memory:read:conversation",
  "memory:read:semantic",
  "memory:read:user",
  "model:invoke:content-quality",
]);

describe("Validated local runtime composition", () => {
  it("exposes the durable Reference Vault command boundary through the composed runtime", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(createConfig(databasePath, "deterministic", []), { clock: new FixedClock() });
      if (runtime.executeReferenceVaultCommand === undefined) throw new Error("Reference Vault commands must be available");
      const input = { purpose: "CREATIVE_DIRECTION" };
      await expect(runtime.executeReferenceVaultCommand({
        actorId: "actor-local",
        commandId: "runtime-reference-brief",
        contractVersion: "1",
        expectedVersion: "NOT_APPLICABLE",
        idempotencyKey: "runtime-reference-brief-idempotency",
        input,
        inputFingerprint: referenceInputFingerprint(input),
        operation: "GET_REFERENCE_BRIEF",
        targetFingerprint: "NOT_AVAILABLE",
        targetId: "runtime-reference-brief",
        workspaceId: "workspace-local",
      })).resolves.toMatchObject({
        operation: "GET_REFERENCE_BRIEF",
        replayed: false,
        result: { assetCount: 0, externalEffectsExecuted: false, kind: "REFERENCE_BRIEF_SUMMARY", purpose: "CREATIVE_DIRECTION" },
        unauthorizedExternalEffectOccurred: false,
      });
      const authorityInput = { assetId: "missing-reference", findings: [], reason: "Identity alone must not grant approval authority." };
      expect(() => runtime.executeReferenceVaultCommand?.({
        actorId: "actor-local",
        commandId: "runtime-reference-review-without-confirmation",
        contractVersion: "1",
        expectedVersion: 0,
        idempotencyKey: "runtime-reference-review-without-confirmation-idempotency",
        input: authorityInput,
        inputFingerprint: referenceInputFingerprint(authorityInput),
        operation: "REVIEW_REFERENCE_ASSET",
        targetFingerprint: "a".repeat(64),
        targetId: "missing-reference",
        workspaceId: "workspace-local",
      })).toThrow(/explicit configured Fabio approval authority confirmation/iu);
      await runtime.close();
    });
  });

  it("uses only an explicit workspace-bound Fabio approval confirmation", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const config: LocalRuntimeConfig = {
        ...createConfig(databasePath, "deterministic", []),
        referenceVaultApprovalAuthority: {
          authorityId: "actor-local",
          confirmedByFabio: true,
          contractVersion: "1",
          scope: "REFERENCE_VAULT_AUTHORITY_OPERATIONS",
          workspaceId: "workspace-local",
        },
      };
      const runtime = await createLocalRuntime(config, { clock: new FixedClock() });
      if (runtime.executeReferenceVaultCommand === undefined) throw new Error("Reference Vault commands must be available");
      const input = { assetId: "missing-reference", findings: [], reason: "Explicit authority reaches the protected operation." };
      await expect(runtime.executeReferenceVaultCommand({
        actorId: "actor-local",
        commandId: "runtime-reference-review-with-confirmation",
        contractVersion: "1",
        expectedVersion: 0,
        idempotencyKey: "runtime-reference-review-with-confirmation-idempotency",
        input,
        inputFingerprint: referenceInputFingerprint(input),
        operation: "REVIEW_REFERENCE_ASSET",
        targetFingerprint: "a".repeat(64),
        targetId: "missing-reference",
        workspaceId: "workspace-local",
      })).rejects.toMatchObject({ code: "reference_vault_not_found" });
      await runtime.close();
    });
  });

  it("rejects malformed or cross-workspace Fabio approval confirmation before opening storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-invalid-authority-"));
    const databasePath = join(directory, "invalid.sqlite");
    try {
      await expect(createLocalRuntime({
        ...createConfig(databasePath, "deterministic", []),
        referenceVaultApprovalAuthority: {
          authorityId: "actor-local",
          confirmedByFabio: false,
          contractVersion: "1",
          scope: "REFERENCE_VAULT_AUTHORITY_OPERATIONS",
          workspaceId: "workspace-other",
        },
      })).rejects.toMatchObject({ code: "local_runtime_configuration_invalid" });
      await expect(access(databasePath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("executes through the deterministic Content Agent and closes idempotently", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createConfig(databasePath, "deterministic", []),
        {
          clock: new FixedClock(),
          identifiers: new PrefixedIdentifierGenerator("deterministic"),
        },
      );

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        result: {
          metadata: {
            generator: "deterministic-content-agent",
          },
        },
        status: "completed",
      });
      await runtime.close();
      await expect(runtime.close()).resolves.toBeUndefined();
      await expect(
        runtime.execute(
          createRequest({
            correlationId: "correlation-after-close",
            requestId: "request-after-close",
          }),
        ),
      ).rejects.toMatchObject({
        code: "local_runtime_closed",
      });
    });
  });

  it("executes the model-backed Content Agent through the deterministic local gateway", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createConfig(
          databasePath,
          "model-backed-deterministic",
          FULL_PERMISSIONS,
        ),
        {
          clock: new FixedClock(),
          identifiers: new PrefixedIdentifierGenerator("model"),
        },
      );

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        result: {
          metadata: {
            generator: "local-deterministic-model",
          },
        },
        status: "completed",
      });
      await runtime.close();
    });
  });

  it("rejects invalid configuration before creating a database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-invalid-"));
    const databasePath = join(directory, "invalid.sqlite");
    try {
      await expect(
        createLocalRuntime({
          contentAgentMode: "deterministic",
          contractVersion: "1",
          sqlite: {
            path: databasePath,
            timeoutMs: 1_000,
          },
        }),
      ).rejects.toMatchObject({
        code: "local_runtime_configuration_invalid",
      });
      await expect(access(databasePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed when the model permission is not granted", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createConfig(databasePath, "model-backed-deterministic", []),
        {
          clock: new FixedClock(),
          identifiers: new PrefixedIdentifierGenerator("denied"),
        },
      );

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        error: {
          code: "model_permission_denied",
        },
        status: "failed",
      });
      await runtime.close();
    });
  });

  it("rejects requests outside the configured local identity", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const runtime = await createLocalRuntime(
        createConfig(databasePath, "deterministic", FULL_PERMISSIONS),
        {
          clock: new FixedClock(),
          identifiers: new PrefixedIdentifierGenerator("identity"),
        },
      );

      await expect(
        runtime.execute(
          createRequest({
            actorId: "actor-other",
          }),
        ),
      ).rejects.toMatchObject({
        code: "local_runtime_identity_mismatch",
      });
      await runtime.close();
    });
  });

  it("replays persisted results and reuses durable memory and knowledge after recreation", async () => {
    await withTemporaryDatabase(async (databasePath) => {
      const request = createRequest();
      await seedContext(databasePath, request.instruction);
      const clock = new FixedClock();
      const firstExecutor = new CountingExecutor(
        new ContentAgent(clock, new ContentOutputValidator()),
      );
      const firstRuntime = await createLocalRuntime(
        createConfig(databasePath, "deterministic", FULL_PERMISSIONS),
        {
          clock,
          contentAgentExecutor: firstExecutor,
          identifiers: new PrefixedIdentifierGenerator("first"),
        },
      );

      const firstResponse = await firstRuntime.execute(request);
      expect(firstResponse).toMatchObject({
        result: {
          memoryRefs: ["memory-durable"],
          sourceRefs: ["knowledge-durable"],
        },
        status: "completed",
      });
      expect(firstExecutor.invocationCount).toBe(1);
      await firstRuntime.close();

      const secondExecutor = new CountingExecutor(
        new ContentAgent(clock, new ContentOutputValidator()),
      );
      const secondRuntime = await createLocalRuntime(
        createConfig(databasePath, "deterministic", FULL_PERMISSIONS),
        {
          clock,
          contentAgentExecutor: secondExecutor,
          identifiers: new PrefixedIdentifierGenerator("second"),
        },
      );

      await expect(secondRuntime.execute(request)).resolves.toEqual(
        firstResponse,
      );
      expect(secondExecutor.invocationCount).toBe(0);

      const newResponse = await secondRuntime.execute(
        createRequest({
          correlationId: "correlation-after-restart",
          requestId: "request-after-restart",
        }),
      );
      expect(newResponse).toMatchObject({
        result: {
          memoryRefs: ["memory-durable"],
          sourceRefs: ["knowledge-durable"],
        },
        status: "completed",
      });
      expect(secondExecutor.invocationCount).toBe(1);
      await secondRuntime.close();
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

function createConfig(
  databasePath: string,
  contentAgentMode: LocalContentAgentMode,
  permissions: readonly EffectivePermission[],
): LocalRuntimeConfig {
  return {
    actorId: "actor-local",
    contentAgentMode,
    contractVersion: "1",
    permissions: {
      actorGrants: permissions,
      policyGrants: permissions,
      taskGrants: permissions,
    },
    sqlite: {
      path: databasePath,
      timeoutMs: 1_000,
    },
    workspaceId: "workspace-local",
  };
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
    createSemanticMemory("memory-durable", {
      content: { preference: "Use concise language." },
    }),
  );
  await memory.close();

  const knowledge = new SqliteKnowledgeRepository({
    path: databasePath,
    timeoutMs: 1_000,
  });
  await knowledge.insert(
    createKnowledgeRecord("knowledge-durable", {
      content: { fact: "MV AI OS is modular." },
      searchableText,
    }),
  );
  await knowledge.close();
}

async function withTemporaryDatabase(
  test: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-runtime-"));
  try {
    await test(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
