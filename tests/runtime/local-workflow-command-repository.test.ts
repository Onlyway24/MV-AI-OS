import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  SqliteRepositoryTransactionRunner,
} from "../../src/index.js";
import type { LocalWorkflowCommandReceipt } from "../../src/runtime/local-workflow-command-repository.js";

describe("SQLite Local Workflow command repository", () => {
  it("validates durable responses and rejects corrupted receipt columns on read", async () => {
    await withDatabase(async (path) => {
      const runner = createRunner(path);
      await runner.transaction(({ workflowCommands }) =>
        workflowCommands.insert(receipt()),
      );
      await expect(
        runner.transaction(({ workflowCommands }) =>
          workflowCommands.insert({
            ...receipt(),
            commandId: "command-mismatch",
            response: { ...receipt().response, commandId: "other-command" },
          }),
        ),
      ).rejects.toThrow("response does not match the command ID");
      await runner.close();

      const database = new DatabaseSync(path);
      database
        .prepare(
          "UPDATE local_workflow_commands SET response_json = ? WHERE command_id = ?",
        )
        .run(
          JSON.stringify({ ...receipt().response, operation: "CANCEL_WORKFLOW" }),
          "command-1",
        );
      database.close();

      const reopened = createRunner(path);
      await expect(
        reopened.transaction(({ workflowCommands }) =>
          workflowCommands.getById("command-1"),
        ),
      ).rejects.toThrow("columns do not match the stored response");
      await reopened.close();
    });
  });

  it("rejects non-JSON-safe and redaction-unsafe persisted response material", async () => {
    const runner = createRunner(":memory:");
    await expect(
      runner.transaction(({ workflowCommands }) =>
        workflowCommands.insert({
          ...receipt(),
          response: {
            ...receipt().response,
            result: { token: "sk-not-a-real-token" },
          },
        }),
      ),
    ).rejects.toThrow("Local Workflow command response is invalid");
    await runner.close();
  });
});

function receipt(): LocalWorkflowCommandReceipt {
  return {
    commandId: "command-1",
    fingerprint: "a".repeat(64),
    response: {
      commandId: "command-1",
      contractVersion: "1",
      nextAction: "Inspect the deterministic local result.",
      operation: "CREATE_MISSION",
      replayed: false,
      result: { nonExecuting: true },
      status: "ok",
      unauthorizedExternalEffectOccurred: false,
    },
  };
}

function createRunner(path: string): SqliteRepositoryTransactionRunner {
  return new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
}

async function withDatabase(
  operation: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-local-command-"));
  try {
    await operation(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
