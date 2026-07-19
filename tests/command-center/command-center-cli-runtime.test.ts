import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  commandCenterReadinessLine,
  commandCenterRuntimePaths,
  startCommandCenterRuntime,
} from "../../src/command-center/command-center-cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Command Center supervised CLI runtime", () => {
  it("keeps bootstrap access owner-only and redacts every readiness log", async () => {
    const fixture = await runtimeFixture();
    const started = await startCommandCenterRuntime(fixture.configPath);
    try {
      const bootstrap = JSON.parse(await readFile(started.bootstrapPath, "utf8")) as { readonly accessUrl: string; readonly pid: number };
      const token = new URL(bootstrap.accessUrl).searchParams.get("access_token");
      expect(token).toMatch(/^[a-f0-9]{64}$/u);
      expect(bootstrap.pid).toBe(process.pid);
      expect((await stat(started.bootstrapPath)).mode & 0o777).toBe(0o600);

      const readiness = commandCenterReadinessLine(started);
      expect(readiness).toContain("READY su http://127.0.0.1:");
      expect(readiness).not.toContain("access_token=");
      expect(readiness).not.toContain(token);
      await expect(startCommandCenterRuntime(fixture.configPath)).rejects.toThrow("active process");

      const stillOwned = JSON.parse(await readFile(started.bootstrapPath, "utf8")) as { readonly accessUrl: string };
      expect(stillOwned.accessUrl).toBe(bootstrap.accessUrl);
    } finally { await started.close(); }
    await expect(access(started.bootstrapPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(started.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers a stale PID lock before exposing one new bootstrap channel", async () => {
    const fixture = await runtimeFixture();
    const paths = commandCenterRuntimePaths(fixture.databasePath);
    await writeFile(paths.lockPath, `${JSON.stringify({ contractVersion: "1", createdAt: "2026-07-01T00:00:00.000Z", instanceId: "command-center-stale", pid: 2_147_483_647, role: "api", token: "lock-stale-command-center" })}\n`, { encoding: "utf8", mode: 0o600 });

    const started = await startCommandCenterRuntime(fixture.configPath);
    try {
      const lock = JSON.parse(await readFile(paths.lockPath, "utf8")) as { readonly pid: number; readonly token: string };
      expect(lock.pid).toBe(process.pid);
      expect(lock.token).not.toBe("lock-stale-command-center");
      await expect(access(paths.bootstrapPath)).resolves.toBeUndefined();
    } finally { await started.close(); }
  });
});

async function runtimeFixture(): Promise<Readonly<{ readonly configPath: string; readonly databasePath: string }>> {
  const root = await mkdtemp(join(tmpdir(), "mv-command-center-runtime-"));
  roots.push(root);
  const configPath = join(root, "config.json");
  const databasePath = join(root, "runtime.sqlite");
  await writeFile(configPath, JSON.stringify({
    contractVersion: "1",
    maxRequestBytes: 65_536,
    runtime: {
      actorId: "fabio",
      contentAgentMode: "deterministic",
      contractVersion: "1",
      permissions: { actorGrants: [], policyGrants: [], taskGrants: [] },
      sqlite: { path: databasePath, timeoutMs: 1_000 },
      workspaceId: "workspace-local",
    },
  }), { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ configPath, databasePath });
}
