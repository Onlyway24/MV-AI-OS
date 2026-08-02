import { describe, expect, it, vi } from "vitest";

import { createLocalOperationsJobHandlerRegistry } from "../../src/operations-runtime/operations-handler-registry.js";
import type {
  OperationsJob,
  OperationsJobHandlerContext,
} from "../../src/operations-runtime/operations-runtime.js";
import type { RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import type { LocalWorkflowCommandBoundary } from "../../src/runtime/local-workflow-command.js";

describe("Operations backup verification handler", () => {
  it("blocks truthfully without invoking an external-action boundary when no host verifier is injected", async () => {
    const registry = createLocalOperationsJobHandlerRegistry({
      commandBoundary: {
        execute: () => Promise.reject(new Error("command boundary is unused")),
      } as unknown as LocalWorkflowCommandBoundary,
      repositories: {} as RepositoryTransactionRunner,
    });
    const assertCanStartExternalAction = vi.fn(() => Promise.resolve());
    const context: OperationsJobHandlerContext = {
      assertCanStartExternalAction,
      signal: new AbortController().signal,
    };
    const job = {
      jobType: "BACKUP_AND_RESTORE_VERIFICATION",
      payload: { backupPolicyId: "local-sqlite-backup" },
    } as OperationsJob;

    await expect(
      registry.resolve(job.jobType).execute(job, context),
    ).resolves.toEqual({
      blocked: { reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" },
      costCents: 0,
      externalEffectsExecuted: false,
      providerCalls: 0,
      resultRef: "BACKUP_RESTORE_RECEIPT_REQUIRED",
      toolCalls: 0,
    });
    expect(assertCanStartExternalAction).not.toHaveBeenCalled();
  });
});
