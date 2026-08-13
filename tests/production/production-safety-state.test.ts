import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OperationsRuntimeControlService } from "../../src/operations-runtime/operations-runtime-control-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { ensureProductionSafetyState } from "../../src/production/production-safety-state.js";

describe("Production safety state", () => {
  it("bootstraps explicit controls and never overwrites later operator state", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-production-safety-"));
    const repositories = new SqliteRepositoryTransactionRunner({
      path: join(root, "runtime.sqlite"),
      timeoutMs: 1_000,
    });
    const clock = {
      now: () => new Date("2026-07-26T12:00:00.000Z"),
    };
    try {
      const initial = await ensureProductionSafetyState({
        actorId: "fabio",
        clock,
        repositories,
        workspaceId: "workspace",
      });
      expect(initial).toMatchObject({
        publicationKillSwitch: { enabled: true, version: 1 },
        runtimeControl: {
          killSwitch: "RELEASED",
          maintenanceMode: "DISABLED",
          version: 1,
        },
      });

      const controls = new OperationsRuntimeControlService({
        clock,
        repositories,
        workspaceId: "workspace",
      });
      await controls.update({
        expectedVersion: 1,
        killSwitch: "ACTIVE",
        maintenanceMode: "ENABLED",
        reasonCode: "OPERATOR_STOP",
        updatedBy: "fabio",
      });
      await repositories.transaction(async ({ operationalPlanes }) => {
        const current =
          await operationalPlanes.getPublicationKillSwitch("workspace");
        if (current === undefined) throw new Error("Expected publication lock");
        await operationalPlanes.upsertPublicationKillSwitch(
          {
            ...current,
            enabled: false,
            updatedAt: "2026-07-26T12:01:00.000Z",
            version: current.version + 1,
          },
          { version: current.version },
        );
      });

      const preserved = await ensureProductionSafetyState({
        actorId: "fabio",
        clock,
        repositories,
        workspaceId: "workspace",
      });
      expect(preserved).toMatchObject({
        publicationKillSwitch: { enabled: false, version: 2 },
        runtimeControl: {
          killSwitch: "ACTIVE",
          maintenanceMode: "ENABLED",
          version: 2,
        },
      });
    } finally {
      await repositories.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
