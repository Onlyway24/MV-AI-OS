import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { ProductionDiagnosticsService } from "../../src/production/production-diagnostics.js";
import { ensureProductionSafetyState } from "../../src/production/production-safety-state.js";

describe("Production Diagnostics service", () => {
  it("separates startup checks from H24 readiness and emits only reason codes", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-production-diagnostics-"));
    const databasePath = join(root, "runtime.sqlite");
    const brandPath = join(root, "brand.png");
    await writeFile(brandPath, Buffer.from("offline-brand-fixture"), {
      mode: 0o600,
    });
    const repositories = new SqliteRepositoryTransactionRunner({
      path: databasePath,
      timeoutMs: 1_000,
    });
    try {
      await ensureProductionSafetyState({
        actorId: "fabio",
        clock: {
          now: () => new Date("2026-07-26T12:00:00.000Z"),
        },
        repositories,
        workspaceId: "workspace-local",
      });
      const diagnostics = new ProductionDiagnosticsService({
        clock: {
          now: () => new Date("2026-07-26T12:00:00.000Z"),
        },
        databasePath,
        minimumFreeBytes: 1,
        releaseCommit: "a".repeat(40),
        repositories,
        requiredBrandAssets: [brandPath],
        runtime: {
          contentAgentMode: "deterministic",
          workspaceId: "workspace-local",
        },
      });

      const startup = await diagnostics.startup();
      expect(startup.status).toBe("READY");
      expect(startup.checks.map(({ name }) => name)).toEqual([
        "database_file",
        "database_schema",
        "database_integrity",
        "storage_writable",
        "disk_capacity",
        "brand_assets",
        "provider_policy",
        "provider_secret",
      ]);

      const readiness = await diagnostics.readiness();
      expect(readiness).toMatchObject({
        status: "NOT_READY",
        summary: {
          activeWorkers: 0,
          queueDepth: 0,
          releaseCommit: "a".repeat(40),
          schedulerReady: false,
        },
      });
      expect(readiness.checks).toContainEqual({
        name: "runtime_supervision",
        reasonCode: "RUNTIME_SUPERVISION_MISSING",
        status: "FAIL",
      });
      expect(JSON.stringify(readiness)).not.toContain(databasePath);
      expect(JSON.stringify(readiness)).not.toContain("workspace-local");
    } finally {
      await repositories.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
